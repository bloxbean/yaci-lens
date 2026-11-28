/*
 * Main-thread side of the SQLite-WASM worker (EXPERIMENTAL). The worker (and its ~0.9 MB of WASM) is created on the
 * first call. A query that runs past its timeout, or is cancelled, terminates the worker (a running SQLite query
 * cannot be interrupted from outside, because the VFS reads synchronously); the next call starts a new one and
 * re-opens the files it needs.
 */
import type { VfsOptions, VfsStats } from './http-vfs';
import type { QueryOut, Request } from './sqlite.worker';

export type { QueryOut, VfsStats };

/** Read sizes and cache, chosen by the benchmarks in the publisher's SQLITE-INDEXES.md. */
export const DEFAULT_VFS: VfsOptions = { chunk: 16384, cacheBytes: 64 << 20, maxReadAhead: 64 };

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;

class SqliteClient {
	private worker: Worker | null = null;
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private opened = new Map<string, { url: string; size: number }>();
	private ready: Promise<{ version: string; initMs: number }> | null = null;
	options: VfsOptions = { ...DEFAULT_VFS };
	/** Terminations so far (timeouts, cancels): shown on the status page. */
	restarts = 0;

	private start(): Promise<{ version: string; initMs: number }> {
		this.ready ??= (async () => {
			this.worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' });
			this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
				const p = this.pending.get(e.data.id);
				if (!p) return;
				this.pending.delete(e.data.id);
				if (p.timer) clearTimeout(p.timer);
				if (e.data.ok) p.resolve(e.data.result);
				else p.reject(new Error(e.data.error));
			};
			this.worker.onerror = (e) => this.reset(new Error(`SQLite worker failed: ${e.message}`));
			const info = (await this.raw({ type: 'init', options: this.options }, 30_000)) as { version: string; initMs: number };
			for (const [name, f] of this.opened) await this.raw({ type: 'open', name, url: f.url, size: f.size }, 30_000);
			return info;
		})();
		this.ready.catch(() => (this.ready = null));
		return this.ready;
	}

	private raw(msg: Payload, timeoutMs: number): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = timeoutMs > 0 ? setTimeout(() => this.reset(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs) : null;
			this.pending.set(id, { resolve, reject, timer });
			this.worker!.postMessage({ ...msg, id } as Request);
		});
	}

	/** Stop everything running: the worker is terminated and pending calls fail with `reason`. */
	reset(reason = new Error('cancelled')): void {
		this.worker?.terminate();
		this.worker = null;
		this.ready = null;
		this.restarts++;
		for (const p of this.pending.values()) {
			if (p.timer) clearTimeout(p.timer);
			p.reject(reason);
		}
		this.pending.clear();
	}

	async init(): Promise<{ version: string; initMs: number }> {
		return this.start();
	}

	async open(name: string, url: string, size: number): Promise<{ ms: number; stats: VfsStats } | { ok: true }> {
		await this.start();
		if (this.opened.has(name)) return { ok: true };
		const r = (await this.raw({ type: 'open', name, url, size }, 30_000)) as { ms: number; stats: VfsStats };
		this.opened.set(name, { url, size });
		return r;
	}

	async query(name: string, sql: string, params: (string | number | null)[] = [], timeoutMs = 30_000): Promise<QueryOut> {
		await this.start();
		return (await this.raw({ type: 'query', name, sql, params }, timeoutMs)) as QueryOut;
	}

	async setOptions(o: Partial<VfsOptions>): Promise<void> {
		this.options = { ...this.options, ...o };
		if (this.worker) await this.raw({ type: 'options', options: o }, 5_000);
	}

	async clearCache(): Promise<void> {
		if (this.worker) await this.raw({ type: 'clear' }, 5_000);
	}

	async stats(): Promise<(VfsStats & { files: number }) | null> {
		if (!this.worker) return null;
		return (await this.raw({ type: 'stats' }, 5_000)) as VfsStats & { files: number };
	}

	get started(): boolean {
		return this.worker !== null;
	}
}

/**
 * A few workers ("lanes"), so independent lookups run in parallel: SQLite reads synchronously inside a worker, so
 * one worker waits for each range request in turn, and a batch of random lookups costs one round trip per key.
 * Every lane opens the files it is asked about; lanes have separate caches.
 */
export class SqlitePool {
	private lanes: SqliteClient[] = [];
	private files = new Map<string, { url: string; size: number }>();
	options: VfsOptions = { ...DEFAULT_VFS };
	constructor(public size = 4) {}

	lane(i: number): SqliteClient {
		const k = ((i % this.size) + this.size) % this.size;
		if (!this.lanes[k]) {
			const c = new SqliteClient();
			c.options = { ...this.options, cacheBytes: Math.floor(this.options.cacheBytes / this.size) };
			this.lanes[k] = c;
		}
		return this.lanes[k];
	}

	async init(): Promise<{ version: string; initMs: number }> {
		return this.lane(0).init();
	}

	/** Register a file; lanes open it when they first query it. */
	async open(name: string, url: string, size: number): Promise<void> {
		this.files.set(name, { url, size });
	}

	async query(name: string, sql: string, params: (string | number | null)[] = [], lane = 0, timeoutMs = 30_000): Promise<QueryOut> {
		const f = this.files.get(name);
		if (!f) throw new Error(`not registered: ${name}`);
		const c = this.lane(lane);
		const opened = await c.open(name, f.url, f.size);
		const r = await c.query(name, sql, params, timeoutMs);
		// count the file's opening (header and schema pages) in the query that needed it
		if ('stats' in opened) {
			r.stats = { ...r.stats, requests: r.stats.requests + opened.stats.requests, bytes: r.stats.bytes + opened.stats.bytes };
		}
		return r;
	}

	async setOptions(o: Partial<VfsOptions>): Promise<void> {
		this.options = { ...this.options, ...o };
		await Promise.all(this.lanes.filter(Boolean).map((c) => c.setOptions({ ...o, ...(o.cacheBytes ? { cacheBytes: Math.floor(o.cacheBytes / this.size) } : {}) })));
	}

	async clearCache(): Promise<void> {
		await Promise.all(this.lanes.filter(Boolean).map((c) => c.clearCache()));
	}

	reset(reason?: Error): void {
		for (const c of this.lanes.filter(Boolean)) c.reset(reason);
	}

	get restarts(): number {
		return this.lanes.filter(Boolean).reduce((s, c) => s + c.restarts, 0);
	}
}

export const sqlite = new SqlitePool(4);
