import { connect, rows, sqlString } from './db';
import { network } from './config';

/*
 * App-wide lake state: DuckDB start-up progress, and what the published data covers (the "data through" line).
 * Pages call `lake.ready()` before querying; DuckDB starts once and is shared.
 */

export interface Tip {
	block: number;
	epoch: number;
	blockTime: Date;
	date: Date;
	generatedAt: Date | null;
}

class Lake {
	status = $state<'idle' | 'starting' | 'ready' | 'error'>('idle');
	step = $state('');
	error = $state<string | null>(null);
	tip = $state<Tip | null>(null);
	#ready: Promise<void> | null = null;

	ready(): Promise<void> {
		this.#ready ??= (async () => {
			this.status = 'starting';
			this.error = null;
			try {
				await connect(network, (s) => (this.step = s));
				this.status = 'ready';
				void this.#loadTip();
			} catch (e) {
				this.status = 'error';
				this.error = e instanceof Error ? e.message : String(e);
				this.#ready = null;
				throw e;
			}
		})();
		return this.#ready;
	}

	async #loadTip() {
		try {
			const [about] = await summary<{ tip_block: number; tip_epoch: number; tip_block_time: Date; tip_date: Date; generated_at: Date }>('about');
			if (about) {
				this.tip = { block: about.tip_block, epoch: about.tip_epoch, blockTime: about.tip_block_time, date: about.tip_date, generatedAt: about.generated_at };
				return;
			}
		} catch {
			/* no summary pack: fall back to the catalog's column statistics (milliseconds) */
		}
		const [t] = await rows<{ n: number; e: number; t: Date; d: Date }>(`SELECT max(number) n, max(epoch) e, max(block_time) t, max(date) d FROM block`);
		if (t) this.tip = { block: t.n, epoch: t.e, blockTime: t.t, date: t.d, generatedAt: null };
	}
}

export const lake = new Lake();

/**
 * Wait for DuckDB, starting it if needed. Deferred by a microtask: starting changes shared state, which Svelte
 * forbids while a component is still being created (e.g. a page calling summary() in its script).
 */
export function started(): Promise<void> {
	return Promise.resolve().then(() => lake.ready());
}

/** URL of a summary-pack file. */
export function summaryUrl(name: string): string {
	return `${network.summaryUrl}${name}.parquet`;
}

const cache = new Map<string, Promise<unknown[]>>();

/** Read a summary-pack table (one HTTP request; cached for the session). */
export function summary<T = Record<string, unknown>>(name: string, extra = ''): Promise<T[]> {
	const key = `${name}|${extra}`;
	let p = cache.get(key) as Promise<T[]> | undefined;
	if (!p) {
		p = started().then(() => rows<T>(`SELECT * FROM read_parquet(${sqlString(summaryUrl(name))}) ${extra}`, Infinity));
		p.catch(() => cache.delete(key));
		cache.set(key, p);
	}
	return p;
}

/** Run a live lake query after DuckDB is ready. */
export async function live<T = Record<string, unknown>>(sql: string, maxRows?: number): Promise<T[]> {
	await started();
	return rows<T>(sql, maxRows);
}

/** ISO day (UTC) of a Date. */
export function day(d: Date | string | number): string {
	return new Date(d).toISOString().slice(0, 10);
}

/**
 * A query over summary-pack files: {name} stands for that file, e.g.
 * `SELECT script_hash, sum(txs) FROM {script_daily} WHERE date >= DATE '2026-10-01' GROUP BY 1`.
 * DuckDB reads only the row groups and columns the query needs. Cached for the session.
 */
export function summaryQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
	const text = sql.replace(/\{([a-z_]+)\}/g, (_, n: string) => `read_parquet(${sqlString(summaryUrl(n))})`);
	const key = `q|${text}`;
	let p = cache.get(key) as Promise<T[]> | undefined;
	if (!p) {
		p = started().then(() => rows<T>(text, Infinity));
		p.catch(() => cache.delete(key));
		cache.set(key, p);
	}
	return p;
}

/** The same SQL with {name} replaced by the summary file's URL (for "open in SQL lab"). */
export function summarySql(sql: string): string {
	return sql.replace(/\{([a-z_]+)\}/g, (_, n: string) => `'${summaryUrl(n)}'`);
}
