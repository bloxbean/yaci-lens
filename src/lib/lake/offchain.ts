/*
 * Off-chain metadata, two ways:
 *
 * 1. The summary pack: the publish job fetches every active pool's CIP-6 metadata, every DRep's CIP-119 document
 *    and every governance action's CIP-108 document on the server (most hosts send no CORS headers, so browsers
 *    can't), checks each hash against the chain, and publishes the fields (pool_meta, drep_meta, action_meta).
 * 2. In the browser, on access: a DRep or governance action page fetches the full anchor document itself
 *    (IPFS gateways and many hosts allow it), and token names come from the CIP-26 registry (it allows CORS).
 *    Results are cached in localStorage with a TTL, including failures for a shorter time.
 */
import { blake2b256Hex } from '$lib/governance/blake2b';
import { summary } from './lake.svelte';

export interface PoolMeta {
	pool_hash: string;
	url: string | null;
	fetched: boolean;
	hash_ok: boolean | null;
	error: string | null;
	ticker: string | null;
	name: string | null;
	description: string | null;
	homepage: string | null;
}

export interface DRepMeta {
	drep_hash: string;
	drep_id: string | null;
	url: string | null;
	fetched: boolean;
	hash_ok: boolean | null;
	error: string | null;
	given_name: string | null;
	objectives: string | null;
	motivations: string | null;
	qualifications: string | null;
	image: string | null;
}

export interface ActionMeta {
	tx_hash: string;
	idx: number;
	url: string | null;
	fetched: boolean;
	hash_ok: boolean | null;
	error: string | null;
	title: string | null;
	abstract: string | null;
	motivation: string | null;
	rationale: string | null;
}

function byKey<T>(name: string, key: (r: T) => string): Promise<Map<string, T>> {
	return summary<T>(name)
		.then((rows) => new Map(rows.map((r) => [key(r), r])))
		.catch(() => new Map());
}

/** dApp label for a script hash, from Strica's Cardano Contracts Registry or Cardano Fans' CRFA registry. */
export interface ScriptLabel {
	script_hash: string;
	label: string;
	project: string;
	category: string | null;
	url: string | null;
	source: 'strica' | 'crfa';
}

let scripts: Promise<Map<string, ScriptLabel>> | null = null;
/** Script labels by script hash (hex). */
export const scriptLabels = () => (scripts ??= byKey<ScriptLabel>('script_names', (r) => r.script_hash));

let pools: Promise<Map<string, PoolMeta>> | null = null;
let dreps: Promise<Map<string, DRepMeta>> | null = null;
let actions: Promise<Map<string, ActionMeta>> | null = null;

/** Pool metadata by pool hash (hex). */
export const poolMeta = () => (pools ??= byKey<PoolMeta>('pool_meta', (r) => r.pool_hash));
/** DRep metadata by DRep hash (hex). */
export const drepMeta = () => (dreps ??= byKey<DRepMeta>('drep_meta', (r) => r.drep_hash));
/** Governance action metadata by "txhash#idx". */
export const actionMeta = () => (actions ??= byKey<ActionMeta>('action_meta', (r) => `${r.tx_hash}#${r.idx}`));

/** "[TICK] Name", or null. Self-declared by the pool operator. */
export function poolLabel(m: PoolMeta | undefined | null): string | null {
	if (!m?.fetched || m.hash_ok === false) return null;
	if (m.ticker && m.name) return `[${m.ticker}] ${m.name}`;
	return m.ticker ?? m.name ?? null;
}

// ---- browser fetches with a localStorage cache --------------------------------------------------------------

const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];

/** Browser-loadable URLs for an on-chain link (ipfs:// through public gateways; http:// would be mixed content). */
export function httpUrls(url: string | null | undefined): string[] {
	if (!url) return [];
	const u = url.trim();
	if (u.startsWith('ipfs://')) {
		const cid = u.slice(7).replace(/^ipfs\//, '');
		return /^[a-zA-Z0-9]{20,}(\/[^?#\s]*)?$/.test(cid) ? GATEWAYS.map((g) => g + cid) : [];
	}
	return /^https:\/\//i.test(u) ? [u] : [];
}

interface Cached<T> {
	at: number;
	ok: boolean;
	value?: T;
	error?: string;
}

function readCache<T>(key: string, okTtl: number, failTtl: number): Cached<T> | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const c = JSON.parse(raw) as Cached<T>;
		return Date.now() - c.at < (c.ok ? okTtl : failTtl) ? c : null;
	} catch {
		return null;
	}
}

function writeCache<T>(key: string, c: Cached<T>) {
	try {
		localStorage.setItem(key, JSON.stringify(c));
	} catch {
		/* storage full or unavailable: the next visit fetches again */
	}
}

export interface AnchorDoc {
	url: string;
	fetchedFrom: string;
	json: unknown;
	/** BLAKE2b-256 of the bytes fetched */
	hash: string;
	/** true when it matches the hash on chain; null when no hash was given */
	verified: boolean | null;
}

const DAY = 86_400_000;

/**
 * Fetch an anchor document (CIP-108/119 JSON) in the browser. Cached a day (failures an hour). Fails when the host
 * sends no CORS headers; callers fall back to the summary pack's fields.
 */
export async function fetchAnchor(url: string, expectedHash?: string | null): Promise<AnchorDoc> {
	const key = `lens:anchor:${url}`;
	const cached = readCache<AnchorDoc>(key, DAY, DAY / 24);
	if (cached?.ok && cached.value) return { ...cached.value, verified: expectedHash ? cached.value.hash === expectedHash.toLowerCase() : null };
	if (cached && !cached.ok) throw new Error(cached.error ?? 'Not available');
	let last = 'No browser-loadable URL (only https:// and ipfs:// can be fetched from a page)';
	for (const u of httpUrls(url)) {
		try {
			const res = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/ld+json, application/json;q=0.9, */*;q=0.1' } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const len = Number(res.headers.get('content-length') ?? 0);
			if (len > 1_048_576) throw new Error('Document too large');
			const bytes = new Uint8Array(await res.arrayBuffer());
			if (bytes.length > 1_048_576) throw new Error('Document too large');
			const json = JSON.parse(new TextDecoder().decode(bytes));
			const doc: AnchorDoc = { url, fetchedFrom: u, json, hash: blake2b256Hex(bytes), verified: null };
			writeCache(key, { at: Date.now(), ok: true, value: doc });
			return { ...doc, verified: expectedHash ? doc.hash === expectedHash.toLowerCase() : null };
		} catch (e) {
			last = e instanceof TypeError ? `The host doesn't allow browsers to read it (CORS) or is unreachable` : e instanceof Error ? e.message : String(e);
		}
	}
	writeCache(key, { at: Date.now(), ok: false, error: last });
	throw new Error(last);
}

// ---- CIP-26 token registry ------------------------------------------------------------------------------------

export interface TokenMeta {
	name: string | null;
	ticker: string | null;
	decimals: number | null;
}

const REGISTRY = 'https://tokens.cardano.org/metadata/query';
const pending = new Map<string, ((m: TokenMeta | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Name, ticker and decimals of a native token (policy id + asset name hex) from the CIP-26 registry; null if unregistered. */
export function tokenMeta(unit: string): Promise<TokenMeta | null> {
	if (!/^[0-9a-f]{56,120}$/i.test(unit)) return Promise.resolve(null);
	const key = `lens:token:${unit}`;
	const cached = readCache<TokenMeta | null>(key, 7 * DAY, DAY);
	if (cached) return Promise.resolve(cached.ok ? (cached.value ?? null) : null);
	return new Promise((resolve) => {
		const list = pending.get(unit) ?? [];
		list.push(resolve);
		pending.set(unit, list);
		timer ??= setTimeout(flush, 30);
	});
}

async function flush() {
	timer = null;
	const batch = new Map(pending);
	pending.clear();
	const units = [...batch.keys()];
	for (let i = 0; i < units.length; i += 100) {
		const subjects = units.slice(i, i + 100);
		const found = new Map<string, TokenMeta>();
		let failed = false;
		try {
			const res = await fetch(REGISTRY, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ subjects, properties: ['name', 'ticker', 'decimals'] }),
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as { subjects?: { subject: string; name?: { value?: string }; ticker?: { value?: string }; decimals?: { value?: number } }[] };
			for (const s of body.subjects ?? []) {
				const d = Number(s.decimals?.value);
				found.set(s.subject, {
					name: s.name?.value?.slice(0, 50) ?? null,
					ticker: s.ticker?.value?.slice(0, 12) ?? null,
					decimals: Number.isInteger(d) && d >= 0 && d < 20 ? d : null
				});
			}
		} catch {
			failed = true; // registry down: answer null, don't cache
		}
		for (const unit of subjects) {
			const m = found.get(unit) ?? null;
			// Registered: kept 7 days. Not registered: kept 1 day (ok: false), so new registrations show up.
			if (!failed) writeCache(`lens:token:${unit}`, m ? { at: Date.now(), ok: true, value: m } : { at: Date.now(), ok: false });
			for (const r of batch.get(unit) ?? []) r(m);
		}
	}
}

export interface TokenDetail extends TokenMeta {
	description: string | null;
	url: string | null;
	/** PNG as a data: URL (the registry stores logos as base64). */
	logo: string | null;
}

/** Full CIP-26 entry of a token (for its page): description, website and logo too. Cached 7 days (unregistered: 1 day). */
export async function tokenDetail(unit: string): Promise<TokenDetail | null> {
	if (!/^[0-9a-f]{56,120}$/i.test(unit)) return null;
	const key = `lens:tokendetail:${unit}`;
	const cached = readCache<TokenDetail | null>(key, 7 * DAY, DAY);
	if (cached) return cached.ok ? (cached.value ?? null) : null;
	try {
		const res = await fetch(`https://tokens.cardano.org/metadata/${unit}`, { signal: AbortSignal.timeout(8000) });
		if (res.status === 404) {
			writeCache(key, { at: Date.now(), ok: false });
			return null;
		}
		if (!res.ok) return null;
		const s = (await res.json()) as Record<string, { value?: unknown } | undefined>;
		const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
		const d = Number(s.decimals?.value);
		const logo = str(s.logo?.value, 400_000);
		const url = str(s.url?.value, 200);
		const detail: TokenDetail = {
			name: str(s.name?.value, 50),
			ticker: str(s.ticker?.value, 12),
			decimals: Number.isInteger(d) && d >= 0 && d < 20 ? d : null,
			description: str(s.description?.value, 600),
			url: url && /^https:\/\//i.test(url) ? url : null,
			logo: logo && /^[A-Za-z0-9+/=]+$/.test(logo) ? `data:image/png;base64,${logo}` : null
		};
		writeCache(key, { at: Date.now(), ok: true, value: detail });
		return detail;
	} catch {
		return null;
	}
}
