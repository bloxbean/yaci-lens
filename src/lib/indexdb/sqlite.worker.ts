/*
 * SQLite-WASM worker (EXPERIMENTAL): opens published SQLite files read-only over HTTP range requests (http-vfs.ts)
 * and answers queries. One worker per page session; the main thread talks to it through client.ts.
 *
 * Queries block the worker (the VFS reads synchronously), so cancelling or timing out a query means terminating the
 * worker; client.ts starts a new one on the next call.
 */
/// <reference lib="webworker" />
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { HttpVfs, VFS_NAME, type VfsOptions, type VfsStats } from './http-vfs';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Request =
	| { id: number; type: 'init'; options: VfsOptions }
	| { id: number; type: 'open'; name: string; url: string; size: number }
	| { id: number; type: 'query'; name: string; sql: string; params?: (string | number | null)[] }
	| { id: number; type: 'options'; options: Partial<VfsOptions> }
	| { id: number; type: 'clear' }
	| { id: number; type: 'stats' };

export interface QueryOut {
	columns: string[];
	rows: unknown[][];
	ms: number;
	stats: VfsStats;
}

let sqlite3: any = null;
let vfs: HttpVfs | null = null;
const dbs = new Map<string, any>();

/*
 * A CDN with a cache rule answers the first range request for an object over its cache limit (Cloudflare: 512 MB) with
 * the whole object (HTTP 200) while it tries to cache it. A synchronous XHR can't stop that download, so big files
 * get one async probe first: on a 200 it is aborted at once (and the CDN then bypasses the object); on a second 200
 * the file is refused. Publishers avoid it by uploading big files with Cache-Control: no-store.
 */
const BIG = 500_000_000;
async function probe(url: string): Promise<void> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const ctl = new AbortController();
		const r = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: ctl.signal });
		if (r.status === 206) {
			await r.arrayBuffer();
			return;
		}
		ctl.abort();
	}
	throw new Error(`${url} does not answer range requests (HTTP 200): not opened, it would download the whole file`);
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Parameters: strings "x'…'" become BLOBs (hex), other values bind as they are. */
function bind(p: string | number | null): unknown {
	if (typeof p === 'string') {
		const m = /^x'([0-9a-f]*)'$/i.exec(p);
		if (m) {
			const out = new Uint8Array(m[1].length / 2);
			for (let i = 0; i < out.length; i++) out[i] = parseInt(m[1].slice(i * 2, i * 2 + 2), 16);
			return out;
		}
	}
	return p;
}

async function handle(msg: Request): Promise<unknown> {
	switch (msg.type) {
		case 'init': {
			if (sqlite3) return { version: sqlite3.version.libVersion, initMs: 0 };
			const t0 = performance.now();
			sqlite3 = await sqlite3InitModule();
			vfs = new HttpVfs(sqlite3, msg.options);
			return { version: sqlite3.version.libVersion, initMs: Math.round(performance.now() - t0) };
		}
		case 'open': {
			if (dbs.has(msg.name)) return { ok: true };
			if (msg.size > BIG) await probe(msg.url);
			vfs!.register(msg.name, msg.url, msg.size);
			const t0 = performance.now();
			vfs!.resetStats();
			const db = new sqlite3.oo1.DB({ filename: msg.name, flags: 'r', vfs: VFS_NAME });
			// read the schema now, so the first query's numbers are about the query
			db.exec('SELECT count(*) FROM sqlite_schema');
			dbs.set(msg.name, db);
			return { ms: Math.round(performance.now() - t0), stats: vfs!.resetStats() };
		}
		case 'query': {
			const db = dbs.get(msg.name);
			if (!db) throw new Error(`not open: ${msg.name}`);
			vfs!.resetStats();
			const t0 = performance.now();
			const columns: string[] = [];
			const rows: unknown[][] = [];
			db.exec({
				sql: msg.sql,
				bind: msg.params?.length ? msg.params.map(bind) : undefined,
				rowMode: 'array',
				columnNames: columns,
				callback: (row: unknown[]) => {
					rows.push(row.map((v) => (v instanceof Uint8Array ? hex(v) : typeof v === 'bigint' ? (Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()) : v)));
				}
			});
			const out: QueryOut = { columns, rows, ms: Math.round((performance.now() - t0) * 10) / 10, stats: vfs!.resetStats() };
			return out;
		}
		case 'options':
			vfs!.setOptions(msg.options);
			return vfs!.opts;
		case 'clear':
			vfs!.clearCache();
			return { ok: true };
		case 'stats':
			return { ...vfs!.stats, files: dbs.size };
	}
}

self.onmessage = async (e: MessageEvent<Request>) => {
	const msg = e.data;
	try {
		const result = await handle(msg);
		self.postMessage({ id: msg.id, ok: true, result });
	} catch (err) {
		self.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
	}
};
