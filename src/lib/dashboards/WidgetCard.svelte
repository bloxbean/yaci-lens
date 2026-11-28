<script lang="ts" module>
	import type { QueryResult } from '$lib/lake/db';
	import { expandNow, expandParams, runKey, runWidget } from './run';
	import type { Param, Widget as W } from './store.svelte';

	// Results of this session, by query and parameter values (10 minutes): re-rendering or editing a dashboard
	// doesn't re-run its queries.
	const cache = new Map<string, { at: number; p: Promise<QueryResult> }>();
	export function cachedRun(w: Pick<W, 'sql' | 'lookup'>, params: Param[] = [], fresh = false): Promise<QueryResult> {
		const key = runKey(w, params);
		const c = cache.get(key);
		if (!fresh && c && Date.now() - c.at < 600_000) return c.p;
		const p = runWidget(w, params);
		cache.set(key, { at: Date.now(), p });
		p.catch(() => cache.delete(key));
		return p;
	}
</script>

<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import TerminalSquare from '@lucide/svelte/icons/square-terminal';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { sqlHref } from '$lib/lake/links';
	import WidgetView from './WidgetView.svelte';
	import type { Widget } from './store.svelte';

	let {
		widget,
		params = [],
		editing = false,
		onedit,
		onremove,
		onmove
	}: { widget: Widget; params?: Param[]; editing?: boolean; onedit?: () => void; onremove?: () => void; onmove?: (dir: -1 | 1) => void } = $props();

	let fresh = $state(0);
	const result = $derived.by(() => {
		const f = fresh;
		return cachedRun(widget, params, f > 0);
	});
	const lab = (sql: string) => {
		try {
			return expandNow(expandParams(sql, params));
		} catch {
			return expandNow(sql);
		}
	};
	const span = $derived(widget.width === 3 ? 'xl:col-span-3 lg:col-span-2' : widget.width === 2 ? 'lg:col-span-2' : '');
</script>

<section class="y-panel flex min-w-0 flex-col overflow-hidden {span}">
	<header class="flex items-center gap-2 border-b border-line/70 px-4 py-3">
		<h3 class="min-w-0 flex-1 truncate font-display text-[15px] font-semibold" title={widget.title}>{widget.title}</h3>
		{#await result then r}<span class="text-[11px] tabular-nums text-faint" title="{r.rows.length} rows{r.truncated ? ' (truncated)' : ''}">{r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(1)} s`}</span>{:catch}{/await}
		{#if editing}
			<button class="y-icon-btn h-7 w-7" title="Move up" aria-label="Move up" onclick={() => onmove?.(-1)}><ArrowUp class="h-3.5 w-3.5" /></button>
			<button class="y-icon-btn h-7 w-7" title="Move down" aria-label="Move down" onclick={() => onmove?.(1)}><ArrowDown class="h-3.5 w-3.5" /></button>
			<button class="y-icon-btn h-7 w-7" title="Edit" aria-label="Edit widget" onclick={onedit}><Pencil class="h-3.5 w-3.5" /></button>
			<button class="y-icon-btn h-7 w-7 hover:text-danger" title="Remove" aria-label="Remove widget" onclick={onremove}><Trash2 class="h-3.5 w-3.5" /></button>
		{:else}
			<button class="y-icon-btn h-7 w-7" title="Run again" aria-label="Run again" onclick={() => fresh++}><RotateCw class="h-3.5 w-3.5" /></button>
			{#if widget.lookup}<span class="y-pill border-cyan/25 bg-cyan/10 py-0 text-[10px] text-cyan" title="Indexed lookup (SQLite)">indexed</span>
			{:else}<a class="y-icon-btn h-7 w-7" title="Open in the SQL lab" aria-label="Open in the SQL lab" href={sqlHref(lab(widget.sql))}><TerminalSquare class="h-3.5 w-3.5" /></a>{/if}
		{/if}
	</header>
	<div class="flex-1 p-4">
		{#await result}
			<Skeleton rows={4} />
		{:then r}
			<WidgetView result={r} viz={widget.viz} />
			{#if r.truncated}<p class="mt-2 text-[11px] text-faint">Showing the first {r.rows.length.toLocaleString('en-US')} rows.</p>{/if}
		{:catch e}
			<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => fresh++} />
		{/await}
		{#if widget.note}<p class="mt-3 text-xs text-muted">{widget.note}</p>{/if}
	</div>
</section>
