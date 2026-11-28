/*
 * Fixed-size pages of a list read newest first by keyset cursor (an index lookup that returns rows + the cursor of
 * the next page). Each page's starting cursor is kept, so "Newer" returns to exactly the previous page; the page
 * size is whatever the fetch asks for. Use with PrevNext.svelte.
 */
export interface KeysetPage<T> {
	data: { rows: T[]; cursor: string | null };
	cost: { requests: number; bytes: number; ms: number; queries: number };
}

export function keysetPages<T>(fetch: (cursor: string | null) => Promise<KeysetPage<T>>) {
	const st = $state({
		rows: [] as T[],
		page: 0,
		/** starts[i]: the cursor of page i (null: the newest page) */
		starts: [null] as (string | null)[],
		next: null as string | null,
		busy: false,
		error: null as string | null,
		cost: null as KeysetPage<T>['cost'] | null,
		/** what the list was last loaded for (e.g. the address), so a view reloads only when it changes */
		key: ''
	});

	async function show(i: number) {
		if (st.busy) return;
		st.busy = true;
		st.error = null;
		try {
			const r = await fetch(st.starts[i] ?? null);
			st.rows = r.data.rows;
			st.next = r.data.cursor;
			if (r.data.cursor && st.starts.length === i + 1) st.starts = [...st.starts, r.data.cursor];
			st.page = i;
			st.cost = r.cost;
		} catch (e) {
			st.error = e instanceof Error ? e.message : String(e);
		} finally {
			st.busy = false;
		}
	}

	/** Start again from the newest page (for `key`, e.g. a new address). */
	function reset(key = '') {
		st.rows = [];
		st.page = 0;
		st.starts = [null];
		st.next = null;
		st.error = null;
		st.key = key;
		return show(0);
	}

	return { st, show, reset };
}
