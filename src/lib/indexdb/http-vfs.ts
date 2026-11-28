/*
 * A read-only SQLite VFS over HTTP range requests, for the official SQLite-WASM build, running in a dedicated worker.
 *
 * SQLite calls xRead synchronously, so reads are synchronous XHRs (allowed in workers, unlike the window). This needs
 * no SharedArrayBuffer, so no COOP/COEP headers: it works on GitHub Pages and any static host.
 *
 * Files are immutable (published under names that are never reused), so the VFS reports SQLITE_IOCAP_IMMUTABLE:
 * SQLite takes no locks and looks for no journal. Reads go through a chunk cache:
 *  - a page read is rounded out to `chunk` bytes (aligned), so neighbouring pages come in the same request;
 *  - sequential misses double the read-ahead (up to `maxReadAhead` chunks), like a table scan;
 *  - chunks are kept in an LRU of `cacheBytes`; one request fetches every missing chunk of a read at once.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sqlite3 = any;

export interface VfsOptions {
	/** Bytes per cached chunk (power of two, at least the db page size). */
	chunk: number;
	/** Cache size in bytes. */
	cacheBytes: number;
	/** Most chunks fetched ahead on a sequential pattern. */
	maxReadAhead: number;
}

export interface VfsStats {
	requests: number;
	bytes: number;
	reads: number;
	hits: number;
	/** Milliseconds spent waiting for the network. */
	netMs: number;
}

interface RemoteFile {
	url: string;
	size: number;
	lastChunk: number;
	ahead: number;
}

export const VFS_NAME = 'http-ro';

export class HttpVfs {
	opts: VfsOptions;
	stats: VfsStats = { requests: 0, bytes: 0, reads: 0, hits: 0, netMs: 0 };
	private files = new Map<string, RemoteFile>();
	private handles = new Map<number, string>();
	private cache = new Map<string, Uint8Array>();
	private cached = 0;

	constructor(
		private sqlite3: Sqlite3,
		opts: VfsOptions
	) {
		this.opts = opts;
		this.install();
	}

	/** Make a URL openable under `name` (sqlite3.oo1.DB({ filename: name, vfs: VFS_NAME })). */
	register(name: string, url: string, size: number): void {
		this.files.set(name, { url, size, lastChunk: -2, ahead: 1 });
	}

	clearCache(): void {
		this.cache.clear();
		this.cached = 0;
	}

	resetStats(): VfsStats {
		const s = { ...this.stats };
		this.stats = { requests: 0, bytes: 0, reads: 0, hits: 0, netMs: 0 };
		return s;
	}

	setOptions(o: Partial<VfsOptions>): void {
		const chunkChanged = o.chunk && o.chunk !== this.opts.chunk;
		this.opts = { ...this.opts, ...o };
		if (chunkChanged) this.clearCache();
	}

	/** Copy [offset, offset + n) of a file into `dest`; returns the bytes that exist (short at the end of the file). */
	private readInto(name: string, dest: Uint8Array, offset: number, n: number): number {
		const f = this.files.get(name)!;
		this.stats.reads++;
		const end = Math.min(offset + n, f.size);
		if (end <= offset) return 0;
		const C = this.opts.chunk;
		const first = Math.floor(offset / C);
		const last = Math.floor((end - 1) / C);
		// Missing chunks of this read, fetched in one request together with any read-ahead
		let missFirst = -1;
		let missLast = -1;
		for (let c = first; c <= last; c++) {
			if (!this.cache.has(`${name}:${c}`)) {
				if (missFirst < 0) missFirst = c;
				missLast = c;
			}
		}
		if (missFirst < 0) {
			this.stats.hits++;
		} else {
			f.ahead = missFirst === f.lastChunk + 1 ? Math.min(f.ahead * 2, this.opts.maxReadAhead) : 1;
			const lastPossible = Math.floor((f.size - 1) / C);
			let upto = Math.min(Math.max(missLast, missFirst + f.ahead - 1), lastPossible);
			// do not refetch chunks already cached at the end of the run
			while (upto > missLast && this.cache.has(`${name}:${upto}`)) upto--;
			this.fetchChunks(name, f, missFirst, upto);
			f.lastChunk = upto;
		}
		let written = 0;
		for (let c = first; c <= last; c++) {
			const key = `${name}:${c}`;
			const data = this.cache.get(key)!;
			// refresh LRU position
			this.cache.delete(key);
			this.cache.set(key, data);
			const cStart = c * C;
			const from = Math.max(offset, cStart) - cStart;
			const to = Math.min(end, cStart + data.length) - cStart;
			dest.set(data.subarray(from, to), cStart + from - offset);
			written += to - from;
		}
		return written;
	}

	private fetchChunks(name: string, f: RemoteFile, c0: number, c1: number): void {
		const C = this.opts.chunk;
		const start = c0 * C;
		const end = Math.min((c1 + 1) * C, f.size) - 1;
		const xhr = new XMLHttpRequest();
		xhr.open('GET', f.url, false);
		xhr.responseType = 'arraybuffer';
		xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
		const t0 = performance.now();
		xhr.send();
		this.stats.netMs += performance.now() - t0;
		if (xhr.status !== 206 && !(xhr.status === 200 && start === 0 && end === f.size - 1)) {
			throw new Error(`HTTP ${xhr.status} for ${f.url} bytes=${start}-${end} (the server must support range requests)`);
		}
		const buf = new Uint8Array(xhr.response as ArrayBuffer);
		if (buf.length !== end - start + 1) throw new Error(`short response for ${f.url}: ${buf.length} of ${end - start + 1} bytes`);
		this.stats.requests++;
		this.stats.bytes += buf.length;
		for (let c = c0; c <= c1; c++) {
			const s = (c - c0) * C;
			const data = buf.slice(s, Math.min(s + C, buf.length));
			const key = `${name}:${c}`;
			if (!this.cache.has(key)) this.cached += data.length;
			this.cache.set(key, data);
		}
		while (this.cached > this.opts.cacheBytes && this.cache.size) {
			const [k, v] = this.cache.entries().next().value as [string, Uint8Array];
			this.cache.delete(k);
			this.cached -= v.length;
		}
	}

	private install(): void {
		const sqlite3 = this.sqlite3;
		const { capi, wasm } = sqlite3;
		const vfs = this;
		let lastError: unknown = null;
		const fail = (e: unknown, rc = capi.SQLITE_IOERR) => {
			lastError = e;
			console.warn('[lens index] vfs', e);
			return rc;
		};

		const io = new capi.sqlite3_io_methods();
		io.$iVersion = 1;
		const ioMethods = {
			xCheckReservedLock: (_f: number, pOut: number) => (wasm.poke32(pOut, 0), 0),
			xClose: (pFile: number) => (vfs.handles.delete(pFile), 0),
			xDeviceCharacteristics: () => capi.SQLITE_IOCAP_IMMUTABLE,
			xFileControl: () => capi.SQLITE_NOTFOUND,
			xFileSize: (pFile: number, pSz64: number) => {
				const f = vfs.files.get(vfs.handles.get(pFile)!);
				if (!f) return capi.SQLITE_IOERR;
				wasm.poke64(pSz64, BigInt(f.size));
				return 0;
			},
			xLock: () => 0,
			xRead: (pFile: number, pDest: number, n: number, offset64: bigint | number) => {
				try {
					const name = vfs.handles.get(pFile)!;
					const dest = wasm.heap8u().subarray(Number(pDest), Number(pDest) + n);
					const got = vfs.readInto(name, dest, Number(offset64), n);
					if (got < n) {
						dest.fill(0, got);
						return capi.SQLITE_IOERR_SHORT_READ;
					}
					return 0;
				} catch (e) {
					return fail(e, capi.SQLITE_IOERR_READ);
				}
			},
			xSectorSize: () => 4096,
			xSync: () => 0,
			xTruncate: () => capi.SQLITE_READONLY,
			xUnlock: () => 0,
			xWrite: () => capi.SQLITE_READONLY
		};
		sqlite3.vfs.installVfs({ io: { struct: io, methods: ioMethods } });

		const v = new capi.sqlite3_vfs();
		const pDefault = capi.sqlite3_vfs_find(null);
		const dflt = pDefault ? new capi.sqlite3_vfs(pDefault) : null;
		v.$iVersion = 2;
		v.$szOsFile = capi.sqlite3_file.structInfo.sizeof;
		v.$mxPathname = 1024;
		v.addOnDispose((v.$zName = wasm.allocCString(VFS_NAME)));
		if (dflt) {
			v.$xRandomness = dflt.$xRandomness;
			dflt.dispose();
		}
		const vfsMethods: Record<string, unknown> = {
			xAccess: (_v: number, zName: number, _flags: number, pOut: number) => {
				wasm.poke32(pOut, vfs.files.has(wasm.cstrToJs(zName)) ? 1 : 0);
				return 0;
			},
			xCurrentTime: (_v: number, pOut: number) => (wasm.poke(pOut, 2440587.5 + Date.now() / 864e5, 'double'), 0),
			xCurrentTimeInt64: (_v: number, pOut: number) => (wasm.poke(pOut, 0xbfc83e532200 + Date.now(), 'i64'), 0),
			xDelete: () => 0,
			xFullPathname: (_v: number, zName: number, nOut: number, pOut: number) =>
				wasm.cstrncpy(pOut, zName, nOut) < nOut ? 0 : capi.SQLITE_CANTOPEN,
			xGetLastError: (_v: number, nOut: number, pOut: number) => {
				if (lastError) {
					const msg = String((lastError as Error)?.message ?? lastError).slice(0, nOut - 1);
					wasm.poke(pOut, 0, 'i8');
					const scope = wasm.scopedAllocPush();
					try {
						const [c] = wasm.scopedAllocCString(msg, true);
						wasm.cstrncpy(pOut, c, nOut);
					} finally {
						wasm.scopedAllocPop(scope);
					}
				}
				return 0;
			},
			xOpen: (_v: number, zName: number, pFile: number, flags: number, pOutFlags: number) => {
				const name = zName ? wasm.cstrToJs(zName) : '';
				if (!vfs.files.has(name)) return fail(new Error(`not registered: ${name}`), capi.SQLITE_CANTOPEN);
				vfs.handles.set(pFile, name);
				const f = new capi.sqlite3_file(pFile);
				f.$pMethods = io.pointer;
				f.dispose();
				wasm.poke32(pOutFlags, (flags & ~capi.SQLITE_OPEN_READWRITE & ~capi.SQLITE_OPEN_CREATE) | capi.SQLITE_OPEN_READONLY);
				return 0;
			},
			xSleep: () => 0
		};
		if (!v.$xRandomness) {
			vfsMethods.xRandomness = (_v: number, nOut: number, pOut: number) => {
				const heap = wasm.heap8u();
				for (let i = 0; i < nOut; i++) heap[Number(pOut) + i] = (Math.random() * 256) & 255;
				return nOut;
			};
		}
		sqlite3.vfs.installVfs({ vfs: { struct: v, methods: vfsMethods } });
	}
}
