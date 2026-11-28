/*
 * EXPERIMENTAL: indexed lookups with SQLite-WASM over published SQLite files (see yaci-lens-publisher's
 * SQLITE-INDEXES.md). Off unless the build sets VITE_LENS_INDEX_URL *and* the viewer turns the experiment on
 * (#/x, or any URL with ?exp=index). Production builds don't set the URL, so none of this code is loaded there.
 */

const env = import.meta.env;

/** Folder holding manifest.json and the .db files, with a trailing slash; '' = not configured. */
export const INDEX_URL: string = (() => {
	const u = (env.VITE_LENS_INDEX_URL ?? '').trim();
	return u && !u.endsWith('/') ? `${u}/` : u;
})();

const KEY = 'lens:exp:index';

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

/** Whether the experiment can run here (configured) and the viewer turned it on. */
export function indexEnabled(): boolean {
	if (!INDEX_URL) return false;
	if (typeof location !== 'undefined' && /[?&]exp=index\b/.test(location.hash)) setIndexEnabled(true);
	return read();
}

export function setIndexEnabled(on: boolean): void {
	try {
		if (on) localStorage.setItem(KEY, '1');
		else localStorage.removeItem(KEY);
	} catch {
		/* private mode: the flag lasts for this page only */
	}
}
