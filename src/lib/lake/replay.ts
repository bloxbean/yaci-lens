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
	const todo = want.filter((h) => {
		const d = txDays.get(h);
		if (d) out.set(h, [d]);
		return !d;
	});
	if (!todo.length) return out;
	const files = await indexFiles();
	const keyOf = (h: string) => BigInt(`0x${h.slice(0, 16)}`).toString();
	const byKey = new Map(todo.map((h) => [keyOf(h), h]));
	const rows = await live<{ k: string | number | bigint; date: Date }>(
		`SELECT k::VARCHAR AS k, date FROM read_parquet([${sqlList(files)}]) WHERE k IN (${[...byKey.keys()].join(', ')})`
	);
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
}

const UTXO_COLS = `tx_hash, output_index, owner_addr, asset_unit, quantity::VARCHAR AS quantity, inline_datum, data_hash, reference_script_hash, is_collateral_return`;

function toUtxos(rows: UtxoRow[]): StoreUtxo[] {
	const by = new Map<string, StoreUtxo>();
	for (const r of rows) {
		const key = `${r.tx_hash}#${r.output_index}`;
		let u = by.get(key);
		if (!u) {
			u = { tx_hash: r.tx_hash, output_index: r.output_index, address: r.owner_addr, amount: [], data_hash: r.data_hash, inline_datum: r.inline_datum, reference_script_hash: r.reference_script_hash };
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

interface TxRow {
	tx_hash: string;
	block: number;
	epoch: number;
	fee: number;
	ttl: number | null;
	validity_interval_start: number | null;
	invalid: boolean;
	inputs: string | null;
	reference_inputs: string | null;
	required_signers: string | null;
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
}

/** Everything the julc replay needs for one transaction, from the lake. */
export async function loadLakeTx(hash: string, knownDay?: string | null): Promise<LakeTx> {
	const h = hash.toLowerCase();
	if (knownDay) txDays.set(h, knownDay);
	const d = knownDay ?? (await txDay(h));
	if (!d) throw new Error('Transaction not found in the published data (it may be newer than the snapshot).');
	const [t] = await live<TxRow>(
		`SELECT tx_hash, block, epoch, fee, ttl, validity_interval_start, invalid, inputs, reference_inputs, required_signers FROM transaction WHERE date = DATE '${d}' AND tx_hash = '${h}'`
	);
	if (!t) throw new Error(`Transaction ${h} is not in the ${d} partition.`);

	const inputRefs = parse<Ref>(t.inputs);
	const refRefs = parse<Ref>(t.reference_inputs);
	const [resolved, outRows, scriptRows, withdrawals, mints] = await Promise.all([
		resolveOutputs([...inputRefs, ...refRefs]),
		live<UtxoRow>(`SELECT ${UTXO_COLS} FROM address_utxo WHERE date = DATE '${d}' AND tx_hash = '${h}'`),
		live<ScriptRow>(`SELECT script_hash, script_type, purpose, redeemer_index, redeemer_cbor, unit_mem, unit_steps, datum_hash FROM transaction_scripts WHERE date = DATE '${d}' AND tx_hash = '${h}' ORDER BY purpose, redeemer_index`),
		live<{ address: string; amount: string }>(`SELECT address, amount::VARCHAR AS amount FROM withdrawal WHERE date = DATE '${d}' AND tx_hash = '${h}'`),
		live<{ unit: string; quantity: number }>(`SELECT unit, quantity FROM assets WHERE date = DATE '${d}' AND tx_hash = '${h}'`)
	]);

	const missingInputs: string[] = [];
	const pick = (refs: Ref[]) =>
		refs.flatMap((r) => {
			const u = resolved.get(`${r.tx_hash}#${r.output_index}`);
			if (!u) missingInputs.push(`${r.tx_hash}#${r.output_index}`);
			return u ? [u] : [];
		});
	const inputs = pick(inputRefs);
	const referenceInputs = pick(refRefs);
	const outputs = toUtxos(outRows.filter((r) => !r.is_collateral_return)).sort((a, b) => a.output_index - b.output_index);

	// Datums by hash: on the inputs, the outputs and the redeemers. The datum table is partitioned by the day a datum
	// was first seen: this transaction's day, or the day an input was created.
	const wanted = new Set<string>();
	for (const u of [...inputs, ...outputs]) if (u.data_hash) wanted.add(u.data_hash);
	for (const s of scriptRows) if (s.datum_hash) wanted.add(s.datum_hash);
	for (const k of wanted) if (datumCache.has(k)) wanted.delete(k);
	const candidateDays = [d, ...new Set(inputs.map((u) => txDays.get(u.tx_hash)).filter((x): x is string => !!x && x !== d))];
	for (const cd of candidateDays) {
		if (!wanted.size) break;
		const rows = await live<{ hash: string; datum: string }>(`SELECT hash, datum FROM datum WHERE date = DATE '${cd}' AND hash IN (${sqlList([...wanted])})`);
		for (const r of rows) {
			datumCache.set(r.hash, r.datum);
			wanted.delete(r.hash);
		}
	}

	const PLUTUS: Record<number, string> = { 1: 'PlutusScriptV1', 2: 'PlutusScriptV2', 3: 'PlutusScriptV3' };
	const scripts: StoreScriptRun[] = scriptRows.map((s) => ({
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
			inputs,
			outputs,
			reference_inputs: referenceInputs
		},
		scripts,
		withdrawals: withdrawals.map((w) => ({ address: w.address, amount: w.amount })),
		mints: mints.map((m) => ({ unit: m.unit, quantity: m.quantity })),
		epoch: t.epoch
	};
	return { page, date: d, block: t.block, invalid: t.invalid, missingInputs };
}
