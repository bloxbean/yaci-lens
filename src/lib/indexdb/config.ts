/*
 * EXPERIMENTAL: indexed lookups with SQLite-WASM over published SQLite files (see yaci-lens-publisher's
 * SQLITE-INDEXES.md). On when the build sets VITE_LENS_INDEX_URL, unless the viewer turned it off (#/x). Builds
 * without the URL (production today) never load any of it. Pages that use the indexes also check that they are
 * actually published (indexAvailable() in service.ts) and fall back to the lake otherwise.
 */

const env = import.meta.env;

/** Folder holding manifest.json and the .db files, with a trailing slash; '' = not configured. */
export const INDEX_URL: string = (() => {
	const u = (env.VITE_LENS_INDEX_URL ?? '').trim();
	return u && !u.endsWith('/') ? `${u}/` : u;
})();

const KEY = 'lens:exp:index';

/** '1' on, '0' turned off by the viewer, null: the default (on). */
function read(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

/** Whether indexed lookups can run here (configured) and the viewer has not turned them off. */
export function indexEnabled(): boolean {
	if (!INDEX_URL) return false;
	if (typeof location !== 'undefined' && /[?&]exp=index\b/.test(location.hash)) setIndexEnabled(true);
	return read() !== '0';
}

export function setIndexEnabled(on: boolean): void {
	try {
		localStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		/* private mode: the choice lasts for this page only */
	}
}
