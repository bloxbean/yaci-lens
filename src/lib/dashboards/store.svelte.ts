/*
 * Personal dashboards, stored only in this browser (IndexedDB; localStorage if IndexedDB is unavailable).
 * Only definitions are stored (names, SQL, chart settings), never query results: every view runs its queries
 * against the published data again. Dashboards move between browsers as JSON files or share links that carry
 * the (compressed) definition in the URL itself, so nothing is ever sent to a server.
 */

export type VizType = 'auto' | 'table' | 'stat' | 'line' | 'area' | 'bar' | 'stacked' | 'barlist' | 'split';
export type Format = 'number' | 'ada' | 'lovelace' | 'percent';

export interface Viz {
	type: VizType;
	/** x axis (line/area/bar/stacked) or label column (barlist/split). Default: the first column. */
	x?: string | null;
	/** Value columns. Default: every numeric column except x (up to 7). */
	y?: string[] | null;
	format?: Format;
}

/** A dashboard input (e.g. "my stake address"): used in SQL as {$name} and by lookup widgets. */
export type ParamKind = 'stake' | 'address' | 'pool' | 'script' | 'unit' | 'drep';
export interface Param {
	name: string;
	kind: ParamKind;
	value: string;
}
/** Widgets that read the SQLite indexes (experimental indexed lookups) instead of running SQL. */
export type LookupKind =
	| 'wallet-balance'
	| 'wallet-history'
	| 'wallet-flows'
	| 'wallet-activity'
	| 'tokens-held'
	| 'utxos'
	| 'rewards'
	| 'delegation'
	| 'pool-events'
	| 'holders'
	| 'script-tvl';
export interface Lookup {
	kind: LookupKind;
	/** The dashboard parameter it reads. */
	param: string;
}
export interface Widget {
	id: string;
	title: string;
	sql: string;
	/** Set: an indexed lookup (sql is ignored). */
	lookup?: Lookup | null;
	viz: Viz;
	/** Columns of a 3-column grid. */
	width: 1 | 2 | 3;
	note?: string;
}

export interface Dashboard {
	id: string;
	name: string;
	description: string;
	/** Inputs shown above the widgets; a link can set them (#/dashboards/<id>?stake=stake1…). */
	params?: Param[];
	widgets: Widget[];
	created: number;
	updated: number;
}

export const FORMAT = 'yaci-lens-dashboards';
const DB = 'yaci-lens';
const STORE = 'dashboards';
const LS_KEY = 'lens:dashboards';

export const newId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

// ---- storage -------------------------------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, mode);
		const req = fn(tx.objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

const backend = {
	async all(): Promise<Dashboard[]> {
		try {
			return await idb<Dashboard[]>('readonly', (s) => s.getAll() as IDBRequest<Dashboard[]>);
		} catch {
			try {
				return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as Dashboard[];
			} catch {
				return [];
			}
		}
	},
	async put(d: Dashboard, all: Dashboard[]) {
		try {
			await idb('readwrite', (s) => s.put($state.snapshot(d)));
		} catch {
			localStorage.setItem(LS_KEY, JSON.stringify(all));
		}
	},
	async remove(id: string, all: Dashboard[]) {
		try {
			await idb('readwrite', (s) => s.delete(id));
		} catch {
			localStorage.setItem(LS_KEY, JSON.stringify(all));
		}
	}
};

// ---- validation (imports and share links are untrusted) --------------------------------------------------------

const VIZ: VizType[] = ['auto', 'table', 'stat', 'line', 'area', 'bar', 'stacked', 'barlist', 'split'];
const FORMATS: Format[] = ['number', 'ada', 'lovelace', 'percent'];
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

/** A dashboard from untrusted JSON, with every field checked and bounded; null if it isn't one. */
export function sanitize(input: unknown, keepId = false): Dashboard | null {
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	const name = str(o.name, 120).trim();
	if (!name || !Array.isArray(o.widgets)) return null;
	const widgets: Widget[] = [];
	for (const w of o.widgets.slice(0, 40)) {
		if (!w || typeof w !== 'object') continue;
		const x = w as Record<string, unknown>;
		const sql = str(x.sql, 20_000).trim();
		if (!sql) continue;
		const v = (x.viz && typeof x.viz === 'object' ? x.viz : {}) as Record<string, unknown>;
		const type = VIZ.includes(v.type as VizType) ? (v.type as VizType) : 'auto';
		widgets.push({
			id: /^[a-z0-9]{6,32}$/i.test(str(x.id, 32)) ? str(x.id, 32) : newId(),
			title: str(x.title, 120) || 'Untitled',
			sql,
			viz: {
				type,
				x: typeof v.x === 'string' ? v.x.slice(0, 80) : null,
				y: Array.isArray(v.y) ? v.y.filter((c): c is string => typeof c === 'string').slice(0, 7).map((c) => c.slice(0, 80)) : null,
				format: FORMATS.includes(v.format as Format) ? (v.format as Format) : 'number'
			},
			width: x.width === 1 || x.width === 2 || x.width === 3 ? x.width : 1,
			note: str(x.note, 400) || undefined
		});
	}
	const now = Date.now();
	return {
		id: keepId && /^[a-z0-9]{6,32}$/i.test(str(o.id, 32)) ? str(o.id, 32) : newId(),
		name,
		description: str(o.description, 600),
		widgets,
		created: typeof o.created === 'number' ? o.created : now,
		updated: now
	};
}

// ---- the store -----------------------------------------------------------------------------------------------

class Dashboards {
	list = $state<Dashboard[]>([]);
	loaded = $state(false);
	#loading: Promise<void> | null = null;

	load(): Promise<void> {
		this.#loading ??= backend.all().then((all) => {
			this.list = all.sort((a, b) => a.created - b.created);
			this.loaded = true;
		});
		return this.#loading;
	}

	get(id: string): Dashboard | undefined {
		return this.list.find((d) => d.id === id);
	}

	async save(d: Dashboard) {
		d.updated = Date.now();
		const i = this.list.findIndex((x) => x.id === d.id);
		if (i < 0) this.list.push(d);
		else this.list[i] = d;
		await backend.put(d, $state.snapshot(this.list) as Dashboard[]);
	}

	async create(name: string, description = '', widgets: Widget[] = [], params: Param[] = []): Promise<Dashboard> {
		const now = Date.now();
		const d: Dashboard = { id: newId(), name, description, widgets, created: now, updated: now, ...(params.length ? { params } : {}) };
		await this.save(d);
		return d;
	}

	async remove(id: string) {
		this.list = this.list.filter((d) => d.id !== id);
		await backend.remove(id, $state.snapshot(this.list) as Dashboard[]);
	}

	/** JSON for a file: the given dashboards, or all. */
	exportJson(ids?: string[]): string {
		const ds = (ids ? this.list.filter((d) => ids.includes(d.id)) : this.list).map((d) => $state.snapshot(d));
		return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString(), dashboards: ds }, null, 2);
	}

	/** Import dashboards from a JSON file's text; returns how many were added (always as new copies). */
	async importJson(text: string): Promise<number> {
		const j = JSON.parse(text) as { format?: string; dashboards?: unknown[] } | unknown[];
		const items = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray(j.dashboards) ? j.dashboards : [j];
		let n = 0;
		for (const it of items.slice(0, 100)) {
			const d = sanitize(it);
			if (!d) continue;
			await this.save(d);
			n++;
		}
		if (!n) throw new Error('No dashboards found in that file.');
		return n;
	}
}

export const dashboards = new Dashboards();

// ---- share links: the definition, deflated and base64url-encoded, in the URL --------------------------------------

async function pipe(bytes: Uint8Array, stream: unknown): Promise<Uint8Array> {
	const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as TransformStream<Uint8Array, Uint8Array>);
	return new Uint8Array(await new Response(out).arrayBuffer());
}
const b64url = (b: Uint8Array) => btoa(Array.from(b, (c) => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function shareParam(d: Dashboard): Promise<string> {
	const { id: _id, created: _c, updated: _u, ...rest } = $state.snapshot(d) as Dashboard;
	const bytes = new TextEncoder().encode(JSON.stringify(rest));
	return b64url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export async function fromShareParam(p: string): Promise<Dashboard | null> {
	if (p.length > 60_000) return null;
	try {
		const json = new TextDecoder().decode(await pipe(unb64url(p), new DecompressionStream('deflate-raw')));
		return sanitize(JSON.parse(json));
	} catch {
		return null;
	}
}
