/*
 * The DuckDB-WASM session: one database and one connection in a worker, with the network's catalog attached
 * read-only. The WASM binaries come from jsDelivr (the npm package's own version), so the static site stays small;
 * the ducklake extension comes from DuckDB's extension repository on first use.
 *
 * DuckDB-WASM runs one query at a time and reads remote Parquet files one by one (~0.3 s each), so pages read the
 * summary pack for anything that spans many partitions and keep live queries to a few partitions.
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import { Type, type DataType, type Field } from 'apache-arrow';
import { LAKE, META, MAX_RESULT_ROWS, type Network } from './config';

export interface Column {
	name: string;
	type: string;
	kind: 'number' | 'bigint' | 'decimal' | 'text' | 'time' | 'date' | 'bool' | 'other';
}

export interface QueryResult {
	columns: Column[];
	rows: unknown[][];
	truncated: boolean;
	ms: number;
}

let conn: duckdb.AsyncDuckDBConnection | null = null;
let ready: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export const duckdbWasmVersion = duckdb.PACKAGE_VERSION;

/** Start DuckDB and attach the catalog. Safe to call repeatedly; a failed start can be retried. */
export function connect(network: Network, onStep?: (msg: string) => void): Promise<void> {
	ready ??= (async () => {
		onStep?.('Loading DuckDB-WASM');
		const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
		const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
		const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(workerUrl));
		await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
		URL.revokeObjectURL(workerUrl);
		const c = await db.connect();
		onStep?.('Loading the DuckLake extension');
		// httpfs reads remote files with HTTP range requests: only the footers and the row groups a query needs.
		// Without it, DuckDB-WASM's built-in file layer downloads every remote file whole (a day's partition, the
		// 48 MB catalog, even the 1.1 GB tx index), which made a transaction page transfer over a gigabyte.
		await c.query(`INSTALL httpfs; LOAD httpfs; INSTALL ducklake; LOAD ducklake;`);
		onStep?.('Attaching the catalog');
		const url = sqlString(network.catalogUrl);
		await c.query(`ATTACH ${url} AS ${LAKE} (TYPE ducklake, READ_ONLY)`);
		await c.query(`ATTACH ${url} AS ${META} (READ_ONLY)`);
		await c.query(`USE ${LAKE}`);
		conn = c;
	})().catch((e) => {
		ready = null;
		throw e;
	});
	return ready;
}

/** Query timings in the console: localStorage['lens:debug'] = '1'. */
function debugQueries(): boolean {
	try {
		return localStorage.getItem('lens:debug') === '1';
	} catch {
		return false;
	}
}

/** Run SQL and convert the result to plain JS values. Queries run one at a time, in call order. */
export function query(sql: string, maxRows = MAX_RESULT_ROWS): Promise<QueryResult> {
	const run = async (): Promise<QueryResult> => {
		if (!ready) throw new Error('DuckDB is not started');
		await ready;
		const c = conn!;
		const t0 = performance.now();
		const reader = await c.send(sql);
		const rows: unknown[][] = [];
		let columns: Column[] = [];
		let truncated = false;
		for await (const batch of reader) {
			const fields = batch.schema.fields;
			if (columns.length === 0) columns = fields.map(describe);
			const vectors = fields.map((_, i) => batch.getChildAt(i));
			for (let r = 0; r < batch.numRows; r++) {
				if (rows.length >= maxRows) {
					truncated = true;
					break;
				}
				rows.push(vectors.map((v, i) => convert(v?.get(r), fields[i])));
			}
			if (truncated) {
				await c.cancelSent();
				break;
			}
		}
		if (columns.length === 0 && reader.schema) columns = reader.schema.fields.map(describe);
		const ms = Math.round(performance.now() - t0);
		if (debugQueries()) console.debug(`[lens] ${ms} ms · ${rows.length} rows · ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
		return { columns, rows, truncated, ms };
	};
	const p = queue.then(run, run);
	queue = p.catch(() => undefined);
	return p;
}

/** Cancel the query that is streaming now, if any. */
export async function cancel(): Promise<void> {
	await conn?.cancelSent();
}

/** Rows as objects keyed by column name; 64-bit integers become numbers when they fit. */
export async function rows<T = Record<string, unknown>>(sql: string, maxRows = MAX_RESULT_ROWS): Promise<T[]> {
	const r = await query(sql, maxRows);
	return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c.name, plain(row[i])])) as unknown as T);
}

/** A SQL string literal. */
export function sqlString(s: string): string {
	return `'${s.replaceAll("'", "''")}'`;
}

function plain(v: unknown): unknown {
	if (typeof v === 'bigint' && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) return Number(v);
	return v;
}

function describe(f: Field): Column {
	const t = f.type as DataType;
	let kind: Column['kind'] = 'other';
	switch (t.typeId) {
		case Type.Int:
			kind = (t as unknown as { bitWidth: number }).bitWidth === 64 ? 'bigint' : 'number';
			break;
		case Type.Float:
			kind = 'number';
			break;
		case Type.Decimal:
			kind = 'decimal';
			break;
		case Type.Utf8:
		case Type.LargeUtf8:
			kind = 'text';
			break;
		case Type.Timestamp:
			kind = 'time';
			break;
		case Type.Date:
			kind = 'date';
			break;
		case Type.Bool:
			kind = 'bool';
			break;
	}
	return { name: f.name, type: String(t), kind };
}

function convert(v: unknown, f: Field): unknown {
	if (v === null || v === undefined) return null;
	const t = f.type as DataType;
	switch (t.typeId) {
		case Type.Decimal:
			return decimalToString(v as Uint32Array, (t as unknown as { scale: number }).scale);
		case Type.Timestamp:
		case Type.Date:
			return typeof v === 'number' || typeof v === 'bigint' ? new Date(Number(v)) : v;
		case Type.List:
		case Type.FixedSizeList:
		case Type.Struct:
		case Type.Map:
			return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
		default:
			return v;
	}
}

/** Arrow 128-bit decimal (little-endian 32-bit words) to an exact decimal string. */
export function decimalToString(words: Uint32Array, scale: number): string {
	let n = 0n;
	for (let i = words.length - 1; i >= 0; i--) n = (n << 32n) | BigInt(words[i] >>> 0);
	const bits = BigInt(words.length * 32);
	if (n >> (bits - 1n)) n -= 1n << bits;
	const neg = n < 0n;
	let s = (neg ? -n : n).toString();
	if (scale > 0) {
		s = s.padStart(scale + 1, '0');
		s = `${s.slice(0, -scale)}.${s.slice(-scale)}`;
	}
	return neg ? `-${s}` : s;
}
