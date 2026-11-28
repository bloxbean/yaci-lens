/*
 * IndexedDiscoveryService (EXPERIMENTAL): lookups over the published SQLite indexes (see the publisher's
 * SQLITE-INDEXES.md for the tables). Every call returns its data with what it cost: HTTP requests, bytes, time.
 *
 * Month-split dbs come as a "recent" file (the current month) and a "history" file (everything before); lists are
 * read newest first from recent, then history, and merged here (keyset pagination by (slot, tx)).
 *
 * The SQLite files carry keys and relationships; details (outputs, metadata, datums) still come from the lake
 * through DuckDB, one partition at a time (the slot gives the day).
 */
import { bech32Decode } from '$lib/bech32';
import { bytesToHex } from '$lib/cardano';
import { INDEX_URL } from './config';
import { sqlite, type VfsStats } from './client';

export interface FileEntry {
	part: 'history' | 'recent' | 'current';
	file: string;
	bytes: number;
	rows: Record<string, number | null>;
	page_size: number;
	from_date?: string;
	to_date?: string;
	/** Hash-prefix sharding: this file holds keys whose first byte >> (8 - log2 shards) is `shard`. */
	shard?: number;
	shards?: number;
}
export interface DbEntry {
	description: string;
	schema_version: number;
	split: 'month' | 'none';
	page_size: number;
	files: FileEntry[];
	tables: { name: string; description?: string; columns: [string, string][]; primary_key?: string[]; without_rowid?: boolean }[];
	indexes: { name: string; table: string; columns: string[]; description?: string }[];
}
export interface Manifest {
	format: number;
	generated_at: string;
	snapshot: number;
	tip: { block: number; slot: number; time: string; date: string };
	cutoff: string;
	dbs: Record<string, DbEntry>;
}

/** What a call cost: requests and bytes over HTTP, wall time (ms). */
export interface Cost {
	requests: number;
	bytes: number;
	ms: number;
	queries: number;
}
export interface Measured<T> {
	data: T;
	cost: Cost;
}

export type DbName = 'utxo' | 'address' | 'stake' | 'script' | 'holders' | 'search' | 'reward' | 'utxoset' | 'deleg';

// ---- manifest and files ---------------------------------------------------------------------------------------------

let manifestP: Promise<Manifest> | null = null;

export function manifest(): Promise<Manifest> {
	manifestP ??= fetch(`${INDEX_URL}manifest.json`, { cache: 'no-cache' }).then(async (r) => {
		if (!r.ok) throw new Error(`no index manifest at ${INDEX_URL} (HTTP ${r.status})`);
		return (await r.json()) as Manifest;
	});
	manifestP.catch(() => (manifestP = null));
	return manifestP;
}

let available: Promise<boolean> | null = null;
/** Whether the indexes are published and reachable (the manifest loads). Cached for the session. */
export function indexAvailable(): Promise<boolean> {
	available ??= manifest().then(
		() => true,
		() => false
	);
	return available;
}

interface Part {
	part: FileEntry['part'];
	shards: number;
	/** By shard number (one file when not sharded). */
	files: FileEntry[];
}

/** The db's parts, newest first (current/recent, then history). */
async function parts(db: DbName): Promise<Part[]> {
	const m = await manifest();
	const entry = m.dbs[db];
	if (!entry) throw new Error(`the index "${db}" is not published`);
	const by = new Map<string, FileEntry[]>();
	for (const f of entry.files) by.set(f.part, [...(by.get(f.part) ?? []), f]);
	const order = { current: 0, recent: 1, history: 2 } as const;
	return [...by.entries()]
		.map(([part, fs]) => ({ part: part as Part['part'], shards: fs[0].shards ?? 1, files: fs.sort((a, b) => (a.shard ?? 0) - (b.shard ?? 0)) }))
		.sort((a, b) => order[a.part] - order[b.part]);
}

/** The file of a part holding a key (hex): its first byte picks the shard. */
function fileFor(p: Part, keyHex: string): FileEntry {
	if (p.shards <= 1) return p.files[0];
	const shift = 8 - Math.log2(p.shards);
	return p.files[parseInt(keyHex.slice(0, 2), 16) >> shift];
}

async function open(f: FileEntry): Promise<string> {
	await sqlite.open(f.file, `${INDEX_URL}${f.file}`, f.bytes);
	return f.file;
}

class Meter {
	cost: Cost = { requests: 0, bytes: 0, ms: 0, queries: 0 };
	private t0 = performance.now();
	add(s: VfsStats) {
		this.cost.requests += s.requests;
		this.cost.bytes += s.bytes;
		this.cost.queries++;
	}
	done<T>(data: T): Measured<T> {
		this.cost.ms = Math.round(performance.now() - this.t0);
		return { data, cost: this.cost };
	}
}

type Row = Record<string, unknown>;
type Param = string | number | null;

async function run(meter: Meter, file: string, sql: string, params: Param[] = [], lane = 0): Promise<Row[]> {
	const r = await sqlite.query(file, sql, params, lane);
	meter.add(r.stats);
	return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}

/** A query for one key on every part of a db (newest first; the key's shard in sharded parts), rows tagged with the part. */
async function runAll(meter: Meter, db: DbName, sql: string, params: Param[] = [], keyHex = ''): Promise<Row[]> {
	// the parts in parallel, one lane each; results newest part first
	const ps = await parts(db);
	const res = await Promise.all(ps.map(async (p, i) => (await run(meter, await open(fileFor(p, keyHex)), sql, params, i)).map((r) => ({ ...r, _part: p.part }))));
	return res.flat();
}

/** A batched query over many keys: keys are grouped by shard, `make` builds the SQL and parameters of one group. */
async function runKeys(meter: Meter, db: DbName, keys: string[], make: (keys: string[]) => { sql: string; params: Param[] }, batch = 100): Promise<Row[]> {
	// one task per (part, shard, batch); tasks run in parallel across the lanes
	const tasks: { name: string; part: Part['part']; ks: string[] }[] = [];
	for (const p of await parts(db)) {
		const groups = new Map<FileEntry, string[]>();
		for (const k of keys) {
			const f = fileFor(p, k);
			groups.set(f, [...(groups.get(f) ?? []), k]);
		}
		for (const [f, ks] of groups) {
			const name = await open(f);
			// small groups: spread single keys over the lanes (each random key is one round trip)
			const step = ks.length <= sqlite.size * 2 ? 1 : batch;
			for (let i = 0; i < ks.length; i += step) tasks.push({ name, part: p.part, ks: ks.slice(i, i + step) });
		}
	}
	const res = await Promise.all(
		tasks.map(async (t, i) => {
			const { sql, params } = make(t.ks);
			return (await run(meter, t.name, sql, params, i)).map((r) => ({ ...r, _part: t.part }));
		})
	);
	return res.flat();
}

// ---- encodings --------------------------------------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const blob = (hex: string) => `x'${hex}'`;

/** Address key: the first 12 bytes of sha256(address text). */
export async function addressKey(address: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
	return bytesToHex(new Uint8Array(d).slice(0, 12));
}

/** Stake credential (28-byte hex) of a stake address, or of a base address's delegation part. */
export function stakeCredential(addr: string): string | null {
	const d = bech32Decode(addr);
	if (!d) return null;
	const type = d.bytes[0] >> 4;
	if (d.hrp.startsWith('stake') && d.bytes.length === 29) return bytesToHex(d.bytes.slice(1));
	if (d.hrp.startsWith('addr') && d.bytes.length === 57 && type <= 3) return bytesToHex(d.bytes.slice(29));
	return null;
}

/** Payment credential (28-byte hex) of a Shelley address, and whether it is a script. */
export function paymentCredential(addr: string): { hash: string; script: boolean } | null {
	const d = bech32Decode(addr);
	if (!d || !d.hrp.startsWith('addr') || d.bytes.length < 29) return null;
	const type = d.bytes[0] >> 4;
	if (type > 7) return null;
	return { hash: bytesToHex(d.bytes.slice(1, 29)), script: (type & 1) === 1 };
}

/** POSIX seconds of a mainnet slot (Byron: 20 s slots from 2017-09-23; Shelley on: 1 s). */
export function slotTime(slot: number): Date {
	const SHELLEY = 4492800;
	return new Date((slot < SHELLEY ? 1506203091 + slot * 20 : 1591566291 + slot) * 1000);
}

export const slotDay = (slot: number) => slotTime(slot).toISOString().slice(0, 10);

// ---- utxo: spent-by, graph, tx lookup ------------------------------------------------------------------------------

export interface TxInfo {
	hash: string;
	slot: number;
	block: number;
	idx: number;
	outs: number | null;
	fee: number | null;
	invalid: boolean;
}

function toTx(r: Row): TxInfo {
	return {
		hash: String(r.hash),
		slot: Number(r.slot),
		block: Number(r.block),
		idx: Number(r.idx),
		outs: r.outs == null ? null : Number(r.outs),
		fee: r.fee == null ? null : Number(r.fee),
		invalid: (Number(r.flags) & 1) === 1
	};
}

/** Transactions by full hash (the SQLite counterpart of the Parquet tx index). */
export async function txByHash(hashes: string[], meter = new Meter()): Promise<Measured<Map<string, TxInfo>>> {
	const want = [...new Set(hashes.map((h) => h.toLowerCase()).filter((h) => HEX64.test(h)))];
	const out = new Map<string, TxInfo>();
	if (want.length) {
		const rows = await runKeys(meter, 'utxo', want, (ks) => ({
			sql: `SELECT lower(hex(hash)) AS hash, slot, block, idx, outs, fee, flags FROM tx WHERE hash IN (${ks.map(() => '?').join(',')})`,
			params: ks.map(blob)
		}));
		for (const r of rows) out.set(String(r.hash), toTx(r));
	}
	return meter.done(out);
}

/** The first slot of the "recent" part (the month cutoff), from the manifest. */
async function cutoffSlot(): Promise<number> {
	const m = await manifest();
	return Math.floor(Date.parse(`${m.cutoff}T00:00:00Z`) / 1000) - 1591566291;
}

/**
 * Full transactions for 8-byte hash prefixes (utxo.spend stores prefixes). A prefix can, very rarely, match two.
 * `slots` (when known, e.g. the spending slot) says which part holds the transaction; unknown ones are looked up in
 * the recent part first and in history only when missing there (each history shard is another file to open).
 */
async function txByPrefix(prefixes: string[], meter: Meter, slots = new Map<string, number>()): Promise<Map<string, TxInfo[]>> {
	const want = [...new Set(prefixes)];
	const out = new Map<string, TxInfo[]>();
	if (!want.length) return out;
	const ps = await parts('utxo');
	const cut = await cutoffSlot();
	const look = async (p: Part, keys: string[], lane0: number) => {
		const groups = new Map<FileEntry, string[]>();
		for (const k of keys) groups.set(fileFor(p, k), [...(groups.get(fileFor(p, k)) ?? []), k]);
		const res = await Promise.all(
			[...groups.entries()].map(async ([f, ks], i) =>
				run(meter, await open(f), ks.map(() => `SELECT lower(hex(hash)) AS hash, slot, block, idx, outs, fee, flags FROM tx WHERE hash >= ? AND hash <= ?`).join(' UNION ALL '), ks.flatMap((k) => [blob(k + '00'.repeat(24)), blob(k + 'ff'.repeat(24))]), lane0 + i)
			)
		);
		return res.flat();
	};
	const recent = ps.find((p) => p.part !== 'history');
	const history = ps.find((p) => p.part === 'history');
	const toRecent = want.filter((k) => !slots.has(k) || slots.get(k)! >= cut);
	const toHistory = want.filter((k) => slots.has(k) && slots.get(k)! < cut);
	const rows = [...(recent ? await look(recent, toRecent, 0) : []), ...(history && toHistory.length ? await look(history, toHistory, 1) : [])];
	const found = new Set(rows.map((r) => String(r.hash).slice(0, 16)));
	const missing = toRecent.filter((k) => !found.has(k) && !slots.has(k));
	if (history && missing.length) rows.push(...(await look(history, missing, 2)));
	for (const r of rows) {
		const t = toTx(r);
		const p = t.hash.slice(0, 16);
		if (!(out.get(p) ?? []).some((x) => x.hash === t.hash)) out.set(p, [...(out.get(p) ?? []), t]);
	}
	return out;
}

export interface Edge {
	/** The output: transaction and index. */
	outTx: string;
	outIdx: number;
	/** The spending transaction. */
	byTx: string;
	slot: number;
	lovelace: number | null;
	/** Spent as collateral by a transaction that failed phase-2 validation. */
	collateral: boolean;
}

export interface TxLinks {
	tx: TxInfo | null;
	/** Outputs of this transaction that were spent, and by which transaction. */
	children: Edge[];
	/** Outputs this transaction spent (its inputs, or its collateral when it failed). */
	parents: Edge[];
	/** Indexes of this transaction's outputs still unspent at the published tip. */
	unspent: number[];
	/** Spending transactions of other txs sharing this one's 8-byte prefix were dropped (prefix collisions). */
	ambiguous: boolean;
}

/** One graph node: the transaction, the transactions that spent its outputs, and the outputs it spent. */
export async function txLinks(hash: string, meter = new Meter()): Promise<Measured<TxLinks>> {
	const h = hash.toLowerCase();
	const p = h.slice(0, 16);
	const tx = (await txByHash([h], meter)).data.get(h) ?? null;
	const kids = await runAll(meter, 'utxo', `SELECT out_idx, lower(hex(by_tx)) AS by8, slot, lovelace, flags FROM spend WHERE out_tx = ? ORDER BY out_idx`, [blob(p)], p);
	const pars = await runAll(meter, 'utxo', `SELECT lower(hex(out_tx)) AS out8, out_idx, slot, lovelace, flags FROM spend_by WHERE by_tx = ? ORDER BY out_tx, out_idx`, [blob(p)], p);
	// a spending transaction is in the part of its slot; a parent (whose output was spent) is at or before the spend
	const hints = new Map(kids.map((r) => [String(r.by8), Number(r.slot)] as [string, number]));
	const cut = await cutoffSlot();
	for (const r of pars) if (Number(r.slot) < cut) hints.set(String(r.out8), Number(r.slot));
	const full = await txByPrefix([...kids.map((r) => String(r.by8)), ...pars.map((r) => String(r.out8))], meter, hints);
	let ambiguous = false;
	const pick = (prefix: string, pred: (t: TxInfo) => boolean) => {
		const c = full.get(prefix) ?? [];
		if (c.length > 1) ambiguous = true;
		return c.find(pred) ?? c[0];
	};
	const children: Edge[] = kids.map((r) => ({
		outTx: h,
		outIdx: Number(r.out_idx),
		byTx: pick(String(r.by8), (t) => t.slot === Number(r.slot))?.hash ?? String(r.by8),
		slot: Number(r.slot),
		lovelace: r.lovelace == null ? null : Number(r.lovelace),
		collateral: (Number(r.flags) & 1) === 1
	}));
	const parents: Edge[] = pars.map((r) => ({
		outTx: pick(String(r.out8), (t) => t.slot <= Number(r.slot))?.hash ?? String(r.out8),
		outIdx: Number(r.out_idx),
		byTx: h,
		slot: Number(r.slot),
		lovelace: r.lovelace == null ? null : Number(r.lovelace),
		collateral: (Number(r.flags) & 1) === 1
	}));
	// children of another tx with the same prefix would show up here: keep those spent after this tx existed
	const mine = tx ? children.filter((c) => c.slot >= tx.slot && (tx.outs == null || c.outIdx < tx.outs)) : children;
	if (mine.length !== children.length) ambiguous = true;
	const spent = new Set(mine.map((c) => c.outIdx));
	const unspent = tx?.outs != null ? Array.from({ length: tx.outs }, (_, i) => i).filter((i) => !spent.has(i)) : [];
	return meter.done({ tx, children: mine, parents, unspent, ambiguous });
}

/** Whether an output (tx#index) was spent at the published tip, and by which transaction. */
export async function findSpendingTransaction(outputRef: string): Promise<Measured<{ spent: boolean; edge: Edge | null; known: boolean }>> {
	const m = /^([0-9a-f]{64})[#:](\d+)$/i.exec(outputRef.trim());
	if (!m) throw new Error('expected <tx hash>#<output index>');
	const meter = new Meter();
	const h = m[1].toLowerCase();
	const idx = Number(m[2]);
	const p = h.slice(0, 16);
	// the output's spend row (both parts, in parallel) and the transaction itself (is the output real?)
	const [rows, txs] = await Promise.all([
		runAll(meter, 'utxo', `SELECT lower(hex(by_tx)) AS by8, slot, lovelace, flags FROM spend WHERE out_tx = ? AND out_idx = ?`, [blob(p), idx], p),
		txByHash([h], meter)
	]);
	const tx = txs.data.get(h) ?? null;
	const known = !!tx && (tx.outs == null || idx < tx.outs);
	const r = rows.find((x) => !tx || Number(x.slot) >= tx.slot);
	if (!r) return meter.done({ spent: false, edge: null, known });
	const full = await txByPrefix([String(r.by8)], meter, new Map([[String(r.by8), Number(r.slot)]]));
	const by = (full.get(String(r.by8)) ?? []).find((t) => t.slot === Number(r.slot)) ?? (full.get(String(r.by8)) ?? [])[0];
	const edge: Edge = { outTx: h, outIdx: idx, byTx: by?.hash ?? String(r.by8), slot: Number(r.slot), lovelace: r.lovelace == null ? null : Number(r.lovelace), collateral: (Number(r.flags) & 1) === 1 };
	return meter.done({ spent: true, edge, known });
}

// ---- address and stake activity -----------------------------------------------------------------------------------

export interface Activity {
	slot: number;
	tx: string;
	/** Lovelace received (outputs to the address) and sent (its outputs spent) in the transaction. */
	recv: number;
	sent: number;
	invalid: boolean;
}
export interface Page<T> {
	rows: T[];
	/** Pass back to get the next (older) page; null at the end. */
	cursor: string | null;
}

const cursorOf = (a: Activity) => `${a.slot}:${a.tx}`;

async function activity(db: DbName, table: string, keyCol: string, key: string, cursor: string | null, limit: number, meter: Meter): Promise<Page<Activity>> {
	const [cs, ct] = cursor ? cursor.split(':') : [null, null];
	const where = cursor ? `AND (slot < ? OR (slot = ? AND tx < ?))` : '';
	const params: Param[] = cursor ? [blob(key), Number(cs), Number(cs), blob(String(ct))] : [blob(key)];
	// every part in parallel (one round trip instead of one per part), then merged newest first
	const ps = await parts(db);
	const got = await Promise.all(
		ps.map(async (p, i) =>
			run(meter, await open(fileFor(p, key)), `SELECT slot, lower(hex(tx)) AS tx, recv, sent, flags FROM ${table} WHERE ${keyCol} = ? ${where} ORDER BY slot DESC, tx DESC LIMIT ${limit + 1}`, params, i)
		)
	);
	const rows: Activity[] = got
		.flat()
		.map((r) => ({ slot: Number(r.slot), tx: String(r.tx), recv: Number(r.recv), sent: Number(r.sent), invalid: (Number(r.flags) & 1) === 1 }))
		.sort((a, b) => b.slot - a.slot || (a.tx < b.tx ? 1 : a.tx > b.tx ? -1 : 0));
	const more = rows.length > limit;
	const page = rows.slice(0, limit);
	return { rows: page, cursor: more ? cursorOf(page[page.length - 1]) : null };
}

/** Transactions that paid to or spent from an address, newest first. */
export async function getAddressActivity(address: string, cursor: string | null = null, limit = 25): Promise<Measured<Page<Activity>>> {
	const meter = new Meter();
	return meter.done(await activity('address', 'addr_tx', 'addr', await addressKey(address), cursor, limit, meter));
}

/** Transactions of every address carrying a stake credential, newest first (amounts summed over its addresses). */
export async function getStakeActivity(credential: string, cursor: string | null = null, limit = 25): Promise<Measured<Page<Activity>>> {
	const meter = new Meter();
	return meter.done(await activity('stake', 'stake_tx', 'stake', credential, cursor, limit, meter));
}

export interface StakeAddress {
	address: string;
	firstSlot: number;
	lastSlot: number;
	outputs: number;
}

/** Addresses that carry the stake credential (the explicit on-chain relation; no ownership is inferred). */
export async function getStakeAddresses(credential: string, limit = 200): Promise<Measured<StakeAddress[]>> {
	const meter = new Meter();
	const rows = await runAll(meter, 'stake', `SELECT addr, first_slot, last_slot, outputs FROM stake_addr WHERE stake = ? LIMIT ${limit}`, [blob(credential)], credential);
	const by = new Map<string, StakeAddress>();
	for (const r of rows) {
		const a = String(r.addr);
		const prev = by.get(a);
		const cur = { address: a, firstSlot: Number(r.first_slot), lastSlot: Number(r.last_slot), outputs: Number(r.outputs) };
		by.set(a, prev ? { address: a, firstSlot: Math.min(prev.firstSlot, cur.firstSlot), lastSlot: Math.max(prev.lastSlot, cur.lastSlot), outputs: prev.outputs + cur.outputs } : cur);
	}
	return meter.done([...by.values()].sort((a, b) => b.lastSlot - a.lastSlot));
}

export interface StakeEvent {
	slot: number;
	kind: string;
	target: string | null;
	tx: string;
}

/** Registration, deregistration and delegation certificates of a stake credential, newest first. */
export async function getStakeEvents(credential: string, limit = 100): Promise<Measured<StakeEvent[]>> {
	const meter = new Meter();
	const rows = await runAll(meter, 'stake', `SELECT slot, kind, target, lower(hex(tx)) AS tx FROM stake_event WHERE stake = ? ORDER BY slot DESC LIMIT ${limit}`, [blob(credential)], credential);
	return meter.done(rows.map((r) => ({ slot: Number(r.slot), kind: String(r.kind), target: (r.target as string) ?? null, tx: String(r.tx) })).sort((a, b) => b.slot - a.slot).slice(0, limit));
}

// ---- scripts --------------------------------------------------------------------------------------------------------

export interface ScriptRun {
	slot: number;
	tx: string;
	purpose: string;
	ridx: number;
	mem: number | null;
	steps: number | null;
}
export interface ScriptOutput {
	slot: number;
	tx: string;
	idx: number;
	lovelace: number | null;
	datum: string | null;
	inline: boolean;
	spentBy?: string | null;
}

async function keyset<T extends { slot: number; tx: string }>(
	meter: Meter,
	db: DbName,
	table: string,
	cols: string,
	key: string,
	cursor: string | null,
	limit: number,
	map: (r: Row) => T
): Promise<Page<T>> {
	const [cs, ct] = cursor ? cursor.split(':') : [null, null];
	const where = cursor ? `AND (slot < ? OR (slot = ? AND tx < ?))` : '';
	const params: Param[] = cursor ? [blob(key), Number(cs), Number(cs), blob(String(ct))] : [blob(key)];
	const ps = await parts(db);
	const got = await Promise.all(
		ps.map(async (p, i) => (await run(meter, await open(fileFor(p, key)), `SELECT ${cols} FROM ${table} WHERE script = ? ${where} ORDER BY slot DESC, tx DESC LIMIT ${limit + 32}`, params, i)).map(map))
	);
	const rows: T[] = got.flat().sort((a, b) => b.slot - a.slot || (a.tx < b.tx ? 1 : a.tx > b.tx ? -1 : 0));
	// a page ends on a whole transaction (several redeemers or outputs can share one), so the cursor loses nothing
	let end = Math.min(limit, rows.length);
	while (end > 0 && end < rows.length && rows[end].slot === rows[end - 1].slot && rows[end].tx === rows[end - 1].tx) end++;
	const page = rows.slice(0, end);
	const last = page[page.length - 1];
	return { rows: page, cursor: rows.length > end && last ? `${last.slot}:${last.tx}` : null };
}

/** A script's executions (redeemers), newest first; each can be opened in the julc debugger. */
export async function getScriptActivity(scriptHash: string, cursor: string | null = null, limit = 25): Promise<Measured<Page<ScriptRun>>> {
	const meter = new Meter();
	const page = await keyset(meter, 'script', 'script_run', 'slot, lower(hex(tx)) AS tx, purpose, ridx, mem, steps', scriptHash, cursor, limit, (r) => ({
		slot: Number(r.slot),
		tx: String(r.tx),
		purpose: String(r.purpose),
		ridx: Number(r.ridx),
		mem: r.mem == null ? null : Number(r.mem),
		steps: r.steps == null ? null : Number(r.steps)
	}));
	return meter.done(page);
}

/** Outputs locked at the script's address (its state), newest first; `spentStatus` adds what spent each. */
export async function getScriptOutputs(scriptHash: string, cursor: string | null = null, limit = 25): Promise<Measured<Page<ScriptOutput>>> {
	const meter = new Meter();
	const page = await keyset(meter, 'script', 'script_out', 'slot, lower(hex(tx)) AS tx, idx, lovelace, lower(hex(datum)) AS datum, inline', scriptHash, cursor, limit, (r): ScriptOutput => ({
		slot: Number(r.slot),
		tx: String(r.tx),
		idx: Number(r.idx),
		lovelace: r.lovelace == null ? null : Number(r.lovelace),
		datum: (r.datum as string) || null,
		inline: Number(r.inline) === 1
	}));
	return meter.done(page);
}

/** Which transaction spent each output (null: unspent at the published tip), for outputs listed by other lookups. */
export async function spentStatus(outputs: { tx: string; idx: number; slot: number }[]): Promise<Measured<Map<string, string | null>>> {
	const meter = new Meter();
	const out = new Map<string, string | null>();
	if (!outputs.length) return meter.done(out);
	const refs = [...new Set(outputs.map((o) => `${o.tx.slice(0, 16)}:${o.idx}`))];
	const spent = await runKeys(meter, 'utxo', refs, (ks) => ({
		sql: ks.map(() => `SELECT lower(hex(out_tx)) AS out8, out_idx, lower(hex(by_tx)) AS by8, slot FROM spend WHERE out_tx = ? AND out_idx = ?`).join(' UNION ALL '),
		params: ks.flatMap((k) => [blob(k.split(':')[0]), Number(k.split(':')[1])])
	}));
	const full = await txByPrefix(spent.map((x) => String(x.by8)), meter, new Map(spent.map((x) => [String(x.by8), Number(x.slot)] as [string, number])));
	for (const o of outputs) {
		const x = spent.find((r) => r.out8 === o.tx.slice(0, 16) && Number(r.out_idx) === o.idx && Number(r.slot) >= o.slot);
		out.set(`${o.tx}#${o.idx}`, x ? ((full.get(String(x.by8)) ?? []).find((t) => t.slot === Number(x.slot))?.hash ?? (full.get(String(x.by8)) ?? [])[0]?.hash ?? String(x.by8)) : null);
	}
	return meter.done(out);
}

/** Outputs carrying a datum hash (by hash or inline), newest first. */
export async function getDatumOutputs(datumHash: string, limit = 25): Promise<Measured<{ slot: number; tx: string; idx: number }[]>> {
	const meter = new Meter();
	const rows = await runAll(meter, 'script', `SELECT slot, lower(hex(tx)) AS tx, idx FROM datum_out WHERE datum = ? ORDER BY slot DESC LIMIT ${limit}`, [blob(datumHash)], datumHash);
	return meter.done(rows.map((r) => ({ slot: Number(r.slot), tx: String(r.tx), idx: Number(r.idx) })).slice(0, limit));
}

// ---- holders ----------------------------------------------------------------------------------------------------------

export interface Holder {
	rank: number;
	holder: string;
	qty: string;
	utxos: number;
}

/** The largest holders of a native asset at the published tip (by stake credential, else address). */
export async function getAssetHolders(unit: string, offset = 0, limit = 50): Promise<Measured<{ holders: Holder[]; count: number; total: string | null }>> {
	const meter = new Meter();
	const k = blob(unit.toLowerCase());
	const u = unit.toLowerCase();
	const [[stat], rows] = await Promise.all([
		runAll(meter, 'holders', `SELECT holders, total FROM unit_stat WHERE unit = ?`, [k], u),
		runAll(meter, 'holders', `SELECT rank, holder, qty, utxos FROM holder WHERE unit = ? AND rank > ? ORDER BY rank LIMIT ${limit}`, [k, offset], u)
	]);
	return meter.done({
		holders: rows.map((r) => ({ rank: Number(r.rank), holder: String(r.holder), qty: String(r.qty), utxos: Number(r.utxos) })),
		count: stat ? Number(stat.holders) : 0,
		total: stat ? String(stat.total) : null
	});
}

// ---- full-text search -------------------------------------------------------------------------------------------------

export interface SearchHit {
	kind: 'pool' | 'drep' | 'proposal' | 'script' | 'token';
	key: string;
	title: string;
	body: string;
}

/**
 * Words of the query as an FTS5 expression: each word becomes a quoted prefix term ("word"*), so no FTS5 syntax
 * from the input reaches the parser.
 */
export function ftsQuery(text: string): string | null {
	const words = text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length >= 2)
		.slice(0, 8);
	return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

export async function search(text: string, limit = 25): Promise<Measured<SearchHit[]>> {
	const meter = new Meter();
	const fts = ftsQuery(text);
	if (!fts) return meter.done([]);
	const rows = await runAll(meter, 'search', `SELECT d.kind, d.key, d.title, substr(d.body, 1, 160) AS body FROM doc_fts JOIN doc d ON d.id = doc_fts.rowid WHERE doc_fts MATCH ? ORDER BY rank LIMIT ${limit}`, [fts]);
	return meter.done(rows.map((r) => ({ kind: r.kind as SearchHit['kind'], key: String(r.key), title: String(r.title), body: String(r.body ?? '') })));
}

// ---- wallet: balance and history, tokens held, rewards, UTxOs ------------------------------------------------------

/** First 12 bytes of sha256(text): the key of addresses, stake addresses, holders and DRep ids in the indexes. */
export const textKey = addressKey;

export interface MonthRow {
	/** YYYYMM (UTC) */
	month: number;
	recv: number;
	sent: number;
	txs: number;
}
export interface WalletSummary {
	/** Lovelace held at the published tip (received - sent; for a stake key: over all its addresses, without rewards). */
	balance: number;
	recv: number;
	sent: number;
	txs: number;
	months: MonthRow[];
}

function summarize(rows: Row[]): WalletSummary {
	const by = new Map<number, MonthRow>();
	for (const r of rows) {
		const m = Number(r.month);
		const prev = by.get(m) ?? { month: m, recv: 0, sent: 0, txs: 0 };
		by.set(m, { month: m, recv: prev.recv + Number(r.recv), sent: prev.sent + Number(r.sent), txs: prev.txs + Number(r.txs) });
	}
	const months = [...by.values()].sort((a, b) => a.month - b.month);
	const recv = months.reduce((a, m) => a + m.recv, 0);
	const sent = months.reduce((a, m) => a + m.sent, 0);
	return { balance: recv - sent, recv, sent, txs: months.reduce((a, m) => a + m.txs, 0), months };
}

/** Balance and monthly history of an address (one small read per part, even for very busy addresses). */
export async function getAddressSummary(address: string): Promise<Measured<WalletSummary>> {
	const meter = new Meter();
	const k = await addressKey(address);
	return meter.done(summarize(await runAll(meter, 'address', `SELECT month, recv, sent, txs FROM addr_month WHERE addr = ?`, [blob(k)], k)));
}

/** Balance and monthly history of a stake credential, over all its addresses (rewards are separate: getRewards). */
export async function getStakeSummary(credential: string): Promise<Measured<WalletSummary>> {
	const meter = new Meter();
	return meter.done(summarize(await runAll(meter, 'stake', `SELECT month, recv, sent, txs FROM stake_month WHERE stake = ?`, [blob(credential)], credential)));
}

export interface Held {
	unit: string;
	qty: string;
	utxos: number;
}

/** Native assets held at the tip by a holder: a stake address (for base addresses) or an address. */
export async function getTokensHeld(holder: string, limit = 500): Promise<Measured<Held[]>> {
	const meter = new Meter();
	const k = await textKey(holder);
	const rows = await runAll(meter, 'holders', `SELECT lower(hex(unit)) AS unit, qty, utxos FROM held WHERE k = ? LIMIT ${limit}`, [blob(k)], k);
	return meter.done(rows.map((r) => ({ unit: String(r.unit), qty: String(r.qty), utxos: Number(r.utxos) })));
}

export interface RewardRow {
	epoch: number;
	member: number;
	leader: number;
	other: number;
	pool: string | null;
}
export interface Withdrawal {
	slot: number;
	tx: string;
	amount: number;
}

/** Rewards of a stake address, every epoch (earned for; spendable two epochs later), and its withdrawals. */
export async function getRewards(stakeAddress: string): Promise<Measured<{ rewards: RewardRow[]; withdrawals: Withdrawal[] }>> {
	const meter = new Meter();
	const k = await textKey(stakeAddress);
	const [rw, wd] = await Promise.all([
		runAll(meter, 'reward', `SELECT epoch, member, leader, other, lower(hex(pool)) AS pool FROM reward WHERE k = ? ORDER BY epoch`, [blob(k)], k),
		runAll(meter, 'reward', `SELECT slot, lower(hex(tx)) AS tx, amount FROM withdrawal WHERE k = ? ORDER BY slot`, [blob(k)], k)
	]);
	return meter.done({
		rewards: rw.map((r) => ({ epoch: Number(r.epoch), member: Number(r.member), leader: Number(r.leader), other: Number(r.other), pool: (r.pool as string) || null })).sort((a, b) => a.epoch - b.epoch),
		withdrawals: wd.map((r) => ({ slot: Number(r.slot), tx: String(r.tx), amount: Number(r.amount) })).sort((a, b) => a.slot - b.slot)
	});
}

export interface Utxo {
	slot: number;
	tx: string;
	idx: number;
	addr?: string;
	lovelace: number;
	assets: number;
	datum: boolean;
}

/** Unspent outputs at the tip of an address, or of every address of a stake address; newest first, paged. */
export async function getUtxos(addressOrStake: string, cursor: string | null = null, limit = 50): Promise<Measured<Page<Utxo>>> {
	const meter = new Meter();
	const stake = /^stake(_test)?1/.test(addressOrStake);
	const k = await textKey(addressOrStake);
	const [cs, ct] = cursor ? cursor.split(':') : [null, null];
	const where = cursor ? `AND (slot < ? OR (slot = ? AND tx < ?))` : '';
	const params: Param[] = cursor ? [blob(k), Number(cs), Number(cs), blob(String(ct))] : [blob(k)];
	const cols = `slot, lower(hex(tx)) AS tx, idx, ${stake ? 'addr, ' : ''}lovelace, assets, datum`;
	const rows = await runAll(meter, 'utxoset', `SELECT ${cols} FROM ${stake ? 'stake_utxo' : 'addr_utxo'} WHERE k = ? ${where} ORDER BY slot DESC, tx DESC, idx LIMIT ${limit + 64}`, params, k);
	const list: Utxo[] = rows.map((r) => ({ slot: Number(r.slot), tx: String(r.tx), idx: Number(r.idx), addr: (r.addr as string) ?? undefined, lovelace: Number(r.lovelace), assets: Number(r.assets), datum: Number(r.datum) === 1 }));
	let end = Math.min(limit, list.length);
	while (end > 0 && end < list.length && list[end].slot === list[end - 1].slot && list[end].tx === list[end - 1].tx) end++;
	const page = list.slice(0, end);
	const last = page[page.length - 1];
	return meter.done({ rows: page, cursor: list.length > end && last ? `${last.slot}:${last.tx}` : null });
}

// ---- pools and DReps: delegators joining and leaving -----------------------------------------------------------

export interface DelegEvent {
	slot: number;
	epoch: number | null;
	stake: string;
	kind: 'join' | 'leave';
	/** join: the previous pool / DRep; leave: the next one (none: deregistered). */
	other: string | null;
}

async function delegEvents(table: 'pool_event' | 'drep_event', keyCol: string, key: string, cursor: string | null, limit: number, otherHex: boolean): Promise<Measured<Page<DelegEvent>>> {
	const meter = new Meter();
	const [cs, cst] = cursor ? cursor.split('|') : [null, null];
	const where = cursor ? `AND (slot < ? OR (slot = ? AND stake < ?))` : '';
	const params: Param[] = cursor ? [blob(key), Number(cs), Number(cs), String(cst)] : [blob(key)];
	const other = otherHex ? 'lower(hex(other))' : 'other';
	const rows = await runAll(meter, 'deleg', `SELECT slot, epoch, stake, kind, ${other} AS other FROM ${table} WHERE ${keyCol} = ? ${where} ORDER BY slot DESC, stake DESC LIMIT ${limit + 1}`, params, key);
	const list: DelegEvent[] = rows.map((r) => ({ slot: Number(r.slot), epoch: r.epoch == null ? null : Number(r.epoch), stake: String(r.stake), kind: r.kind as DelegEvent['kind'], other: (r.other as string) || null }));
	const page = list.slice(0, limit);
	const last = page[page.length - 1];
	return meter.done({ rows: page, cursor: list.length > limit && last ? `${last.slot}|${last.stake}` : null });
}

/** Stake addresses that joined or left a pool (by delegation certificates), newest first. */
export async function getPoolEvents(poolHash: string, cursor: string | null = null, limit = 50): Promise<Measured<Page<DelegEvent>>> {
	return delegEvents('pool_event', 'pool', poolHash.toLowerCase(), cursor, limit, true);
}

/** Stake addresses that delegated their vote to a DRep (drep1… id, or the abstain / no-confidence option) or left it. */
export async function getDrepEvents(drepId: string, cursor: string | null = null, limit = 50): Promise<Measured<Page<DelegEvent>>> {
	return delegEvents('drep_event', 'k', await textKey(drepId), cursor, limit, false);
}

// ---- scripts: value locked over time ---------------------------------------------------------------------------

export interface ScriptDay {
	/** UTC day */
	date: string;
	adaIn: number;
	adaOut: number;
	outsIn: number;
	outsOut: number;
}

/** Per day: lovelace and outputs locked at a script's address and spent from it (value locked = running sum). */
export async function getScriptDays(scriptHash: string): Promise<Measured<ScriptDay[]>> {
	const meter = new Meter();
	const rows = await runAll(meter, 'script', `SELECT day, ada_in, ada_out, outs_in, outs_out FROM script_day WHERE script = ? ORDER BY day`, [blob(scriptHash)], scriptHash);
	const by = new Map<number, ScriptDay>();
	for (const r of rows) {
		const d = Number(r.day);
		const p = by.get(d) ?? { date: new Date(d * 86_400_000).toISOString().slice(0, 10), adaIn: 0, adaOut: 0, outsIn: 0, outsOut: 0 };
		by.set(d, { ...p, adaIn: p.adaIn + Number(r.ada_in), adaOut: p.adaOut + Number(r.ada_out), outsIn: p.outsIn + Number(r.outs_in), outsOut: p.outsOut + Number(r.outs_out) });
	}
	return meter.done([...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v));
}

/** What a db covers: from the chain's start when it has a history part, else only from its recent part's first day. */
export async function coverage(db: DbName): Promise<{ full: boolean; from: string | null }> {
	const m = await manifest();
	const fs = m.dbs[db]?.files ?? [];
	if (fs.some((f) => f.part === 'history' || f.part === 'current')) return { full: true, from: null };
	return { full: false, from: fs.find((f) => f.part === 'recent')?.from_date ?? null };
}

// ---- generic --------------------------------------------------------------------------------------------------------

/** Run any read-only SQL on one part of a db, in the shard of `keyHex` (for the status page and benchmarks). */
export async function rawQuery(db: DbName, part: FileEntry['part'], sql: string, params: Param[] = [], keyHex = ''): Promise<Measured<Row[]>> {
	const meter = new Meter();
	const p = (await parts(db)).find((x) => x.part === part);
	if (!p) throw new Error(`${db} has no ${part} part`);
	return meter.done(await run(meter, await open(fileFor(p, keyHex)), sql, params));
}

export { sqlite };
