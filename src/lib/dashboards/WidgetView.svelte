<script lang="ts">
	import type { QueryResult } from '$lib/lake/db';
	import ResultTable from '$lib/sql/ResultTable.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import BarList from '$lib/charts/BarList.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';
	import { seriesColor, short } from '$lib/charts/series';
	import { adaShort } from '$lib/cardano';
	import { axes, label as text, num, suggest } from './run';
	import type { Format, Viz } from './store.svelte';

	/* One query result drawn as the widget's chart type (or the suggested one for 'auto'). */
	let { result, viz, height = 200 }: { result: QueryResult; viz: Viz; height?: number } = $props();

	const type = $derived(viz.type === 'auto' ? suggest(result) : viz.type);
	const ax = $derived(axes(result, viz, (viz.type === 'auto' ? suggest(result) : viz.type) === 'stat'));
	const fmt = (f: Format | undefined) => (v: number) =>
		f === 'ada' ? adaShort(v) : f === 'lovelace' ? adaShort(v / 1e6) : f === 'percent' ? `${(v * 100).toFixed(1)}%` : short(v);
	const format = $derived(fmt(viz.format));
	const rows = $derived(result.rows);
	const xCol = $derived(result.columns[ax.x]);
	// Charts read left to right in time: put rows in ascending x when the query sorted them newest first.
	const ordered = $derived.by(() => {
		if (rows.length < 2) return rows;
		const a = rows[0][ax.x];
		const b = rows[rows.length - 1][ax.x];
		const desc = a instanceof Date && b instanceof Date ? a > b : typeof a === 'number' && typeof b === 'number' ? a > b : typeof a === 'string' && typeof b === 'string' && /^\d{4}-/.test(a) ? a > b : false;
		return desc ? [...rows].reverse() : rows;
	});
</script>

{#if !rows.length}
	<p class="py-8 text-center text-sm text-muted">The query returned no rows.</p>
{:else if type === 'stat'}
	{@const y = ax.ys[0] ?? 0}
	<div class="flex flex-wrap gap-8 py-2">
		{#each ax.ys.length ? ax.ys : [0] as i (i)}
			<div>
				<div class="y-label">{result.columns[i].name.replaceAll('_', ' ')}</div>
				<div class="mt-1 font-display text-3xl font-semibold tabular-nums tracking-tight" title={String(rows[0][i])}>{Number.isFinite(num(rows[0][i])) ? format(num(rows[0][i])) : text(rows[0][i])}</div>
			</div>
		{/each}
		{#if !Number.isFinite(num(rows[0][y])) && rows[0][y] == null}<span class="text-sm text-muted">—</span>{/if}
	</div>
{:else if type === 'line' || type === 'area' || type === 'bar' || type === 'stacked'}
	{#if ax.ys.length}
		<SeriesChart
			x={ordered.map((r) => text(r[ax.x], xCol))}
			series={ax.ys.map((i, k) => ({ name: result.columns[i].name.replaceAll('_', ' '), values: ordered.map((r) => num(r[i])), slot: k }))}
			kind={type}
			{height}
			{format}
			label={result.columns.map((c) => c.name).join(', ')}
		/>
	{:else}
		<p class="text-sm text-muted">No numeric column to chart. Pick value columns in the editor, or show a table.</p>
	{/if}
{:else if type === 'barlist'}
	{@const y = ax.ys[0]}
	{#if y != null}
		<BarList rows={rows.slice(0, 25)} value={(r) => num(r[y])} {format}>
			{#snippet label(r)}<span class="font-medium">{text(r[ax.x], xCol)}</span>{/snippet}
		</BarList>
	{/if}
{:else if type === 'split'}
	{@const y = ax.ys[0]}
	{#if y != null}
		<SplitBar {format} parts={rows.slice(0, 8).map((r, i) => ({ label: text(r[ax.x], xCol), value: num(r[y]), color: seriesColor(i) }))} />
	{/if}
{:else}
	<div class="max-h-[28rem] overflow-auto"><ResultTable columns={result.columns} rows={result.rows} /></div>
{/if}
