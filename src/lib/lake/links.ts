/** A link that opens the SQL lab with this query in the editor. */
export function sqlHref(sql: string): string {
	return `#/sql?q=${encodeURIComponent(sql.trim())}`;
}

/** A query-string parameter of the hash route (#/path?name=value). */
export function hashParam(name: string): string | null {
	if (typeof location === 'undefined') return null;
	const i = location.hash.indexOf('?');
	return i < 0 ? null : new URLSearchParams(location.hash.slice(i + 1)).get(name);
}

/**
 * The hash route with some query parameters changed (null removes one), e.g. for replaceState.
 * Hash routing keeps both the route and its parameters after '#', so URL.search can't be used.
 */
export function hashWith(changes: Record<string, string | null>): string {
	const h = typeof location === 'undefined' ? '#/' : location.hash || '#/';
	const i = h.indexOf('?');
	const path = i < 0 ? h : h.slice(0, i);
	const params = new URLSearchParams(i < 0 ? '' : h.slice(i + 1));
	for (const [k, v] of Object.entries(changes)) {
		if (v === null) params.delete(k);
		else params.set(k, v);
	}
	const q = params.toString();
	return `${path}${q ? `?${q}` : ''}`;
}
