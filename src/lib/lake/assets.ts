/*
 * Native assets from the published data:
 *  - the asset index (index/assets-{unit,fp}-*.parquet, named by summary/asset_index.parquet): every asset ever
 *    minted, sorted by unit and by fingerprint, so one lookup reads a single row group of a ~400 MB file;
 *  - asset_tokens (fungible tokens, searchable by name), asset_policies, asset_daily, asset_mint_daily, token_daily.
 * Mint and burn events come from the lake's assets table, reading only the days listed in the index row.
 */
import { network } from './config';
import { live, summary, summaryQuery, summaryUrl } from './lake.svelte';

export interface AssetInfo {
	unit: string;
	policy: string;
	asset_name: string;
	fingerprint: string | null;
	/** Exact, as text (can exceed 2^53). */
	supply: string;
	mints: number;
	burns: number;
	first_date: Date;
	last_date: Date;
	event_dates: Date[] | null;
}

export interface TokenRow {
	unit: string;
	policy: string;
	asset_name: string;
	name: string | null;
	standard: string | null;
	fingerprint: string | null;
	supply: string;
	mints: number;
	burns: number;
	first_date: Date;
	last_date: Date;
	policy_txs_30d: number;
}

export interface PolicyRow {
	policy: string;
	units: number;
	fungible_units: number;
	nft_units: number;
	mints: number;
	burns: number;
	first_date: Date;
	last_date: Date;
	sample_unit: string | null;
}

export interface MintEvent {
	tx_hash: string;
	quantity: string;
	block: number;
	block_time: Date;
	date: Date;
}

const HEX = /^[0-9a-f]+$/;
const indexBase = () => network.summaryUrl.replace(/summary\/?$/, 'index/');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

let manifest: Promise<{ lookup: string; kind: string; file: string }[]> | null = null;
function files(lookup: 'unit' | 'fingerprint'): Promise<string[]> {
	manifest ??= summary<{ lookup: string; kind: string; file: string }>('asset_index');
	manifest.catch(() => (manifest = null));
	// recent first: a unit with events this month is in the recent file with its full, current stats
	return manifest.then((rows) =>
		rows
			.filter((r) => r.lookup === lookup)
			.sort((a) => (a.kind === 'recent' ? -1 : 1))
			.map((r) => indexBase() + r.file)
	);
}

const COLS = 'unit, policy, asset_name, fingerprint, supply::VARCHAR AS supply, mints, burns, first_date, last_date, event_dates';

/** One asset by unit (policy id + asset name hex), or null if it was never minted. */
export async function assetByUnit(unit: string): Promise<AssetInfo | null> {
	const u = unit.toLowerCase();
	if (!HEX.test(u) || u.length < 56 || u.length > 120) return null;
	for (const f of await files('unit')) {
		const [row] = await live<AssetInfo>(`SELECT ${COLS} FROM read_parquet(${q(f)}) WHERE unit = ${q(u)}`);
		if (row) return row;
	}
	return null;
}

/** The unit of a CIP-14 fingerprint (asset1…). */
export async function unitByFingerprint(fp: string): Promise<string | null> {
	const f0 = fp.trim().toLowerCase();
	if (!/^asset1[0-9a-z]{38}$/.test(f0)) return null;
	for (const f of await files('fingerprint')) {
		const [row] = await live<{ unit: string }>(`SELECT unit FROM read_parquet(${q(f)}) WHERE fingerprint = ${q(f0)}`);
		if (row) return row.unit;
	}
	return null;
}

/** Assets under a policy, in unit order (the index is sorted by unit, so this reads only that policy's rows). */
export async function policyAssets(policy: string, limit = 100, offset = 0): Promise<AssetInfo[]> {
	const p = policy.toLowerCase();
	if (!/^[0-9a-f]{56}$/.test(p)) return [];
	const fs = await files('unit');
	const parts = fs.map((f) => `SELECT ${COLS} FROM read_parquet(${q(f)}) WHERE unit >= ${q(p)} AND unit < ${q(p + 'g')}`);
	// a unit can be in both files (recent wins): keep one row per unit
	return live<AssetInfo>(
		`SELECT * FROM (${parts.map((s, i) => `SELECT ${i} AS src, * FROM (${s})`).join(' UNION ALL ')}) QUALIFY row_number() OVER (PARTITION BY unit ORDER BY src) = 1 ORDER BY unit LIMIT ${limit} OFFSET ${offset}`
	);
}

export const policyInfo = (policy: string) =>
	summaryQuery<PolicyRow>(`SELECT * FROM {asset_policies} WHERE policy = ${q(policy.toLowerCase())}`).then((r) => r[0] ?? null);

/** Mint and burn events of an asset, from the days its index row lists (up to 40 days). */
export async function mintEvents(a: AssetInfo): Promise<MintEvent[]> {
	const days = (a.event_dates ?? [a.first_date]).map((d) => new Date(d).toISOString().slice(0, 10));
	if (!days.length) return [];
	return live<MintEvent>(
		`SELECT tx_hash, quantity::VARCHAR AS quantity, block, block_time, date FROM assets
WHERE date IN (${days.map((d) => `DATE '${d}'`).join(', ')}) AND unit = ${q(a.unit)} ORDER BY slot DESC LIMIT 200`
	);
}

/** CIP-25 metadata (label 721) of the transaction that first minted an NFT, for its name and image. */
export async function cip25Of(a: AssetInfo, txHash: string, date: string): Promise<Record<string, unknown> | null> {
	const [row] = await live<{ body: string }>(`SELECT body FROM transaction_metadata WHERE date = DATE '${date}' AND tx_hash = ${q(txHash)} AND label = '721'`);
	if (!row) return null;
	try {
		const j = JSON.parse(row.body) as Record<string, Record<string, unknown>>;
		const byPolicy = j[a.policy] ?? j[`0x${a.policy}`];
		if (!byPolicy || typeof byPolicy !== 'object') return null;
		const text = hexText(a.asset_name);
		return ((text && byPolicy[text]) || byPolicy[a.asset_name] || byPolicy[`0x${a.asset_name}`] || null) as Record<string, unknown> | null;
	} catch {
		return null;
	}
}

function hexText(hex: string): string | null {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []));
	} catch {
		return null;
	}
}

/**
 * Search: a fingerprint, policy id or unit opens directly; text matches fungible token names (and the policy or
 * unit prefix), ranked by how busy the token's policy was in the last 30 days.
 */
export function searchTokens(text: string, limit = 30): Promise<TokenRow[]> {
	const t = text.trim();
	if (!t) return Promise.resolve([]);
	const like = q(`%${t.replace(/[%_\\]/g, (c) => '\\' + c)}%`);
	const hex = t.toLowerCase();
	const hexMatch = HEX.test(hex) && hex.length >= 8 ? ` OR unit LIKE ${q(hex + '%')}` : '';
	return summaryQuery<TokenRow>(
		`SELECT unit, policy, asset_name, name, standard, fingerprint, supply::VARCHAR AS supply, mints, burns, first_date, last_date, policy_txs_30d
FROM {asset_tokens} WHERE name ILIKE ${like} ESCAPE '\\'${hexMatch}
ORDER BY (lower(name) = lower(${q(t)})) DESC, policy_txs_30d DESC, mints DESC LIMIT ${limit}`
	);
}

/** The summary file URL, for SQL-lab links. */
export const assetFile = (name: string) => summaryUrl(name);
