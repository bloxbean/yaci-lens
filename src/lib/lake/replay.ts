/*
 * Load a historical transaction from the lake in the shape Yaci Viewer's replay pipeline expects (PageTx), so the
 * julc debugger can rebuild its script context and re-run every script with the transaction's real inputs.
 *
 * The lake is partitioned by UTC day, so everything starts from the tx index (hash -> day): the transaction's own
 * day, and the days its inputs and reference inputs were created. Each piece is then a single-partition read.
 */
import { decodeCbor, hexToBytes, bytesToHex, rawOf } from '$lib/tx/cbor-item';
import type { PageTx } from '$lib/julc/replay/load';
import type { StoreScriptRun, StoreUtxo } from '$lib/julc/replay/build';
import { network } from './config';
import { live, summary } from './lake.svelte';
import { indexEnabled } from '$lib/indexdb/config';

const HEX64 = /^[0-9a-f]{64}$/;

/** Days found for transaction hashes this session (also read by the API stand-in for cert/vote/proposal paths). */
export const txDays = new Map<string, string>();
/** Datums found by hash this session (CBOR hex), for the API stand-in's /scripts/datum/{hash}/cbor. */
export const datumCache = new Map<string, string>();

const sqlList = (xs: string[]) => xs.map((x) => `'${x}'`).join(', ');
const day = (d: Date) => d.toISOString().slice(0, 10);

function indexBase(): string {
	return network.summaryUrl.replace(/summary\/?$/, 'index/');
}

let manifest: Promise<string[]> | null = null;
function indexFiles(): Promise<string[]> {
	manifest ??= summary<{ kind: string; file: string }>('tx_index').then((rows) => rows.map((r) => `${indexBase()}${r.file}`));
	manifest.catch(() => (manifest = null));
	return manifest;
}

/**
 * The UTC day each transaction was included on. The index is keyed by the first 8 bytes of the hash; a key can (very
 * rarely) match several days, and the caller confirms the full hash in that day's partition.
 */
export async function findTxDays(hashes: string[]): Promise<Map<string, string[]>> {
	const want = [...new Set(hashes.map((h) => h.toLowerCase()).filter((h) => HEX64.test(h)))];
	const out = new Map<string, string[]>();
	let todo = want.filter((h) => {
		const d = txDays.get(h);
		if (d) out.set(h, [d]);
		return !d;
	});
	if (!todo.length) return out;
	// EXPERIMENTAL: the SQLite utxo index has every transaction by its full hash (slot -> day, no confirmation
	// needed): ~0.2 s instead of seconds for the Parquet index. Only when the indexes are published; anything it
	// doesn't find (or any failure) goes the Parquet way below.
	if (indexEnabled()) {
		try {
			const svc = await import('$lib/indexdb/service');
			if (await svc.indexAvailable()) {
				const found = (await svc.txByHash(todo)).data;
				for (const [h, t] of found) {
					if (t.slot < 0) continue; // Byron genesis distributions: let the Parquet index give their day
					const d = svc.slotDay(t.slot);
					out.set(h, [d]);
					txDays.set(h, d);
				}
				todo = todo.filter((h) => !txDays.has(h));
				if (!todo.length) return out;
			}
		} catch (e) {
			console.warn('[lens] indexed tx lookup failed, using the Parquet tx index', e);
		}
	}
	const files = await indexFiles();
	const keyOf = (h: string) => BigInt(`0x${h.slice(0, 16)}`).toString();
	const byKey = new Map(todo.map((h) => [keyOf(h), h]));
	// One `k = …` per key, combined with UNION ALL: DuckDB prunes row groups by their min/max statistics for an
	// equality, but not for an IN list, which scans the whole key column of the ~1 GB history file (12 s vs 0.2 s).
	const src = `read_parquet([${sqlList(files)}])`;
	const rows: { k: string | number | bigint; date: Date }[] = [];
	const keys = [...byKey.keys()];
	for (let i = 0; i < keys.length; i += 64) {
		const part = keys.slice(i, i + 64).map((k) => `SELECT k::VARCHAR AS k, date FROM ${src} WHERE k = ${k}`);
		rows.push(...(await live<{ k: string | number | bigint; date: Date }>(part.join('\nUNION ALL\n'))));
	}
	for (const r of rows) {
		const h = byKey.get(String(r.k));
		if (!h) continue;
		out.set(h, [...(out.get(h) ?? []), day(r.date)]);
	}
	for (const [h, ds] of out) if (ds.length === 1) txDays.set(h, ds[0]);
	return out;
}

/** The day of one transaction, confirmed by its full hash. */
export async function txDay(hash: string): Promise<string | null> {
	const h = hash.toLowerCase();
	const cached = txDays.get(h);
	if (cached) return cached;
	const days = (await findTxDays([h])).get(h) ?? [];
	for (const d of days) {
		const [hit] = await live<{ n: number }>(`SELECT count(*) AS n FROM transaction WHERE date = DATE '${d}' AND tx_hash = '${h}'`);
		if (hit?.n) {
			txDays.set(h, d);
			return d;
		}
	}
	return null;
}

interface Ref {
	tx_hash: string;
	output_index: number;
}
interface UtxoRow {
	tx_hash: string;
	output_index: number;
	owner_addr: string;
	asset_unit: string;
	quantity: string;
	inline_datum: string | null;
	data_hash: string | null;
	reference_script_hash: string | null;
	is_collateral_return: boolean | null;
	owner_stake_addr: string | null;
}

const UTXO_COLS = `tx_hash, output_index, owner_addr, owner_stake_addr, asset_unit, quantity::VARCHAR AS quantity, inline_datum, data_hash, reference_script_hash, is_collateral_return`;

function toUtxos(rows: UtxoRow[]): StoreUtxo[] {
	const by = new Map<string, StoreUtxo>();
	for (const r of rows) {
		const key = `${r.tx_hash}#${r.output_index}`;
		let u = by.get(key);
		if (!u) {
			u = {
				tx_hash: r.tx_hash,
				output_index: r.output_index,
				address: r.owner_addr,
				stake_address: r.owner_stake_addr,
				amount: [],
				data_hash: r.data_hash,
				inline_datum: r.inline_datum,
				reference_script_hash: r.reference_script_hash
			} as StoreUtxo;
			by.set(key, u);
		}
		u.amount.push({ unit: r.asset_unit, quantity: r.quantity });
	}
	for (const u of by.values()) u.amount.sort((a, b) => (a.unit === 'lovelace' ? -1 : b.unit === 'lovelace' ? 1 : 0));
	return [...by.values()];
}

/** Resolve output references to the outputs they point at (address, value, datum, reference script). */
export async function resolveOutputs(refs: Ref[]): Promise<Map<string, StoreUtxo>> {
	const out = new Map<string, StoreUtxo>();
	if (!refs.length) return out;
	const days = await findTxDays(refs.map((r) => r.tx_hash));
	const byDay = new Map<string, Set<string>>();
	for (const r of refs) for (const d of days.get(r.tx_hash) ?? []) (byDay.get(d) ?? byDay.set(d, new Set()).get(d)!).add(r.tx_hash);
	for (const [d, hashes] of byDay) {
		const rows = await live<UtxoRow>(`SELECT ${UTXO_COLS} FROM address_utxo WHERE date = DATE '${d}' AND tx_hash IN (${sqlList([...hashes])})`);
		for (const u of toUtxos(rows)) out.set(`${u.tx_hash}#${u.output_index}`, u);
	}
	return out;
}

/** The redeemer's data item, cut from the stored redeemer CBOR ([tag, index, data, ex_units] or [data, ex_units]). */
export function redeemerData(redeemerCbor: string | null): string | null {
	if (!redeemerCbor) return null;
	try {
		const bytes = hexToBytes(redeemerCbor);
		const { item } = decodeCbor(bytes);
		if (item.type !== 'array') return null;
		const data = item.items.length >= 4 ? item.items[2] : item.items.length === 2 ? item.items[0] : null;
		return data ? bytesToHex(rawOf(bytes, data)) : null;
	} catch {
		return null;
	}
}

export interface TxRow {
	tx_hash: string;
	block: number;
	slot: number;
	epoch: number;
	block_time: Date;
	tx_index: number;
	fee: number;
	ttl: number | null;
	validity_interval_start: number | null;
	invalid: boolean;
	inputs: string | null;
	reference_inputs: string | null;
	collateral_inputs: string | null;
	required_signers: string | null;
	total_collateral: number | null;
	treasury_donation: number | null;
	auxiliary_datahash: string | null;
	script_datahash: string | null;
}

export interface LakeMint {
	unit: string;
	policy: string;
	asset_name: string;
	fingerprint: string | null;
	quantity: string;
}

export interface LakeMetadata {
	label: string;
	body: string;
	json: unknown;
}
interface ScriptRow {
	script_hash: string;
	script_type: number;
	purpose: string;
	redeemer_index: number;
	redeemer_cbor: string | null;
	unit_mem: number;
	unit_steps: number;
	datum_hash: string | null;
}

const parse = <T>(s: string | null): T[] => {
	try {
		return s ? (JSON.parse(s) as T[]) : [];
	} catch {
		return [];
	}
};

export interface LakeTx {
	page: PageTx;
	date: string;
	block: number;
	invalid: boolean;
	missingInputs: string[];
	/** The transaction row and everything the transaction page shows. */
	row: TxRow;
	inputs: StoreUtxo[];
	outputs: StoreUtxo[];
	referenceInputs: StoreUtxo[];
	collateralInputs: StoreUtxo[];
	collateralReturn: StoreUtxo | null;
	mints: LakeMint[];
	metadata: LakeMetadata[];
}

export interface LakeTxInputs {
	inputs: StoreUtxo[];
	referenceInputs: StoreUtxo[];
	collateralInputs: StoreUtxo[];
	missingInputs: string[];
}

/**
 * A transaction loaded in stages, so a page can show each part as soon as it is ready. DuckDB runs one query at a
 * time in request order, so the quick same-day reads are requested first and the slow part (resolving inputs from
 * the days they were created, through the tx index) after them.
 */
export interface LakeTxStages {
	hash: string;
	date: string;
	row: Promise<TxRow>;
	outputs: Promise<{ outputs: StoreUtxo[]; collateralReturn: StoreUtxo | null }>;
	mints: Promise<LakeMint[]>;
	metadata: Promise<LakeMetadata[]>;
	withdrawals: Promise<{ address: string; amount: string }[]>;
	inputs: Promise<LakeTxInputs>;
	/** Everything, with datums: what the julc replay needs. */
	full: Promise<LakeTx>;
}

const silence = <T>(p: Promise<T>) => (p.catch(() => {}), p);

export function stageLakeTx(hash: string, day: string): LakeTxStages {
	const h = hash.toLowerCase();
	const d = day;
	txDays.set(h, d);
	const where = `date = DATE '${d}' AND tx_hash = '${h}'`;
	const row = live<TxRow>(
		`SELECT tx_hash, block, slot, epoch, block_time, tx_index, fee, ttl, validity_interval_start, invalid, inputs, reference_inputs, collateral_inputs,
		required_signers, total_collateral, treasury_donation, auxiliary_datahash, script_datahash FROM transaction WHERE ${where}`
	).then(([t]) => {
		if (!t) throw new Error(`Transaction ${h} is not in the ${d} partition. Check the date (UTC) of its block.`);
		return t;
	});
	// Same-day reads, one partition each (fast)
	const outRows = row.then(() => live<UtxoRow>(`SELECT ${UTXO_COLS} FROM address_utxo WHERE ${where}`));
	const mints = row.then(() =>
		live<LakeMint>(`SELECT unit, policy, asset_name, fingerprint, quantity::VARCHAR AS quantity FROM assets WHERE ${where} ORDER BY unit`)
	);
	const metadata = row.then((t) =>
		t.auxiliary_datahash
			? live<{ label: string; body: string }>(`SELECT label, body FROM transaction_metadata WHERE ${where} ORDER BY try_cast(label AS UBIGINT)`).then((rows) =>
					rows.map((m) => {
						let json: unknown = m.body;
						try {
							json = JSON.parse(m.body);
						} catch {
							/* keep the text */
						}
						return { label: m.label, body: m.body, json };
					})
				)
			: []
	);
	const withdrawals = row.then(() => live<{ address: string; amount: string }>(`SELECT address, amount::VARCHAR AS amount FROM withdrawal WHERE ${where}`));
	const scriptRows = row.then((t) =>
		t.script_datahash
			? live<ScriptRow>(
					`SELECT script_hash, script_type, purpose, redeemer_index, redeemer_cbor, unit_mem, unit_steps, datum_hash FROM transaction_scripts WHERE ${where} ORDER BY purpose, redeemer_index`
				)
			: []
	);
	const outputs = outRows.then((rows) => ({
		outputs: toUtxos(rows.filter((r) => !r.is_collateral_return)).sort((a, b) => a.output_index - b.output_index),
		collateralReturn: toUtxos(rows.filter((r) => r.is_collateral_return))[0] ?? null
	}));

	// Inputs, reference and collateral inputs: from the days they were created (the slow part)
	const inputs = Promise.all([row, outRows, mints, metadata, withdrawals, scriptRows]).then(async ([t]) => {
		const inputRefs = parse<Ref>(t.inputs);
		const refRefs = parse<Ref>(t.reference_inputs);
		const colRefs = parse<Ref>(t.collateral_inputs);
		const resolved = await resolveOutputs([...inputRefs, ...refRefs, ...colRefs]);
		const missingInputs: string[] = [];
		const pick = (refs: Ref[]) =>
			refs.flatMap((r) => {
				const u = resolved.get(`${r.tx_hash}#${r.output_index}`);
				if (!u) missingInputs.push(`${r.tx_hash}#${r.output_index}`);
				return u ? [u] : [];
			});
		return {
			inputs: pick(inputRefs),
			referenceInputs: pick(refRefs),
			collateralInputs: colRefs.flatMap((r) => resolved.get(`${r.tx_hash}#${r.output_index}`) ?? []),
			missingInputs
		};
	});

	const full = Promise.all([row, outputs, mints, metadata, withdrawals, scriptRows, inputs]).then(async ([t, o, m, meta, w, sr, ins]) => {
		// Datums by hash: on the inputs, the outputs and the redeemers. The datum table is partitioned by the day a datum
		// was first seen: this transaction's day, or the day an input was created.
		const wanted = new Set<string>();
		for (const u of [...ins.inputs, ...o.outputs, ...ins.referenceInputs]) if (u.data_hash) wanted.add(u.data_hash);
		for (const s of sr) if (s.datum_hash) wanted.add(s.datum_hash);
		for (const k of wanted) if (datumCache.has(k)) wanted.delete(k);
		const candidateDays = [d, ...new Set(ins.inputs.map((u) => txDays.get(u.tx_hash)).filter((x): x is string => !!x && x !== d))];
		for (const cd of candidateDays) {
			if (!wanted.size) break;
			const rows = await live<{ hash: string; datum: string }>(`SELECT hash, datum FROM datum WHERE date = DATE '${cd}' AND hash IN (${sqlList([...wanted])})`);
			for (const r of rows) {
				datumCache.set(r.hash, r.datum);
				wanted.delete(r.hash);
			}
		}
		const PLUTUS: Record<number, string> = { 1: 'PlutusScriptV1', 2: 'PlutusScriptV2', 3: 'PlutusScriptV3' };
		const scripts: StoreScriptRun[] = sr.map((s) => ({
			script_hash: s.script_hash,
			type: PLUTUS[s.script_type] ?? null,
			redeemer: { tag: s.purpose.toLowerCase(), index: s.redeemer_index, data: redeemerData(s.redeemer_cbor) ?? undefined, ex_units: { mem: s.unit_mem, steps: s.unit_steps } },
			datum_hash: s.datum_hash,
			datum: s.datum_hash ? (datumCache.get(s.datum_hash) ?? null) : null
		}));
		const page: PageTx = {
			hash: h,
			tx: {
				fees: t.fee,
				ttl: t.ttl || null,
				validity_interval_start: t.validity_interval_start || null,
				required_signers: parse<string>(t.required_signers),
				inputs: ins.inputs,
				outputs: o.outputs,
				reference_inputs: ins.referenceInputs
			},
			scripts,
			withdrawals: w.map((x) => ({ address: x.address, amount: x.amount })),
			mints: m.map((x) => ({ unit: x.unit, quantity: x.quantity })),
			epoch: t.epoch
		};
		const tx: LakeTx = {
			page,
			date: d,
			block: t.block,
			invalid: t.invalid,
			missingInputs: ins.missingInputs,
			row: t,
			inputs: ins.inputs,
			outputs: o.outputs,
			referenceInputs: ins.referenceInputs,
			collateralInputs: ins.collateralInputs,
			collateralReturn: o.collateralReturn,
			mints: m,
			metadata: meta
		};
		return tx;
	});

	// A failed stage is shown where it's used; don't also report it as unhandled.
	for (const p of [row, outRows, mints, metadata, withdrawals, scriptRows, outputs, inputs, full]) silence(p as Promise<unknown>);
	return { hash: h, date: d, row, outputs, mints, metadata, withdrawals, inputs, full };
}

/** Everything the julc replay needs for one transaction, from the lake. */
export async function loadLakeTx(hash: string, knownDay?: string | null): Promise<LakeTx> {
	const h = hash.toLowerCase();
	const d = knownDay ?? (await txDay(h));
	if (!d) throw new Error('Transaction not found in the published data (it may be newer than the snapshot).');
	return stageLakeTx(h, d).full;
}
