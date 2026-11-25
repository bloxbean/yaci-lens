<script lang="ts">
	import Table2 from '@lucide/svelte/icons/table-2';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import { lake, started, summaryUrl } from '$lib/lake/lake.svelte';
	import { tables } from '$lib/lake/catalog';
	import { SUMMARY_NOTES, TABLE_NOTES } from '$lib/lake/describe';
	import { short } from '$lib/cardano';

	function load() {
		return started().then(() => tables());
	}
	let data = $state(load());
	let filter = $state('');

	const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
	const sample = (name: string, part: string | null) =>
		`SELECT *\nFROM ${name}${part ? `\nWHERE ${part} = ${part === 'date' ? `DATE '${lake.tip ? lake.tip.date.toISOString().slice(0, 10) : '2026-01-01'}'` : (lake.tip?.epoch ?? 600) - 1}` : ''}\nLIMIT 100`;
</script>

<svelte:head><title>Tables · Yaci Lens</title></svelte:head>

<PageHeader kind="Analytics" title="Tables">
	{#snippet icon()}<Table2 class="h-5 w-5" />{/snippet}
	{#snippet actions()}<input class="y-input h-9 w-56" placeholder="Filter tables or columns" bind:value={filter} />{/snippet}
	Everything in the lake, read from the DuckLake catalog. Each table is partitioned by <code>date</code> (UTC day) or <code>epoch</code>: filter on it
	and DuckDB reads only the matching files.
</PageHeader>

{#await data}
	<div class="y-panel"><Skeleton rows={12} /></div>
{:then list}
	{@const f = filter.trim().toLowerCase()}
	{@const rows = f ? list.filter((t) => t.name.includes(f) || t.columns.some((c) => c.name.includes(f))) : list}
	<div class="grid gap-4 lg:grid-cols-2">
		{#each rows.filter((t) => t.rows > 0) as t (t.name)}
			<section class="y-panel p-5">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h2 class="font-mono text-[15px] font-semibold">{t.name}</h2>
						<p class="mt-1 text-xs text-muted">{TABLE_NOTES[t.name] ?? ''}</p>
					</div>
					<SqlButton sql={sample(t.name, t.partition)} label="Query" />
				</div>
				<div class="mt-3 flex flex-wrap gap-1.5 text-[11.5px]">
					<span class="y-pill border-line bg-surface-2 text-muted">{short(t.rows)} rows</span>
					<span class="y-pill border-line bg-surface-2 text-muted">{gb(t.bytes)}</span>
					<span class="y-pill border-line bg-surface-2 text-muted">{short(t.files)} files</span>
					{#if t.partition}<span class="y-pill border-brand/25 bg-brand/10 text-brand">partition: {t.partition}</span>{/if}
				</div>
				<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px]">
					{#each t.columns as c (c.name)}<span class={f && c.name.includes(f) ? 'text-brand' : 'text-muted'} title={c.type}>{c.name}<span class="text-faint">:{c.type}</span></span>{/each}
				</div>
			</section>
		{/each}
	</div>

	<h2 class="mb-3 mt-8 font-display text-lg font-semibold">Summary pack</h2>
	<p class="mb-4 text-sm text-muted">Small tables precomputed daily for dashboards, one Parquet file each. Query them with <code>FROM '{summaryUrl('daily')}'</code>.</p>
	<div class="grid gap-4 lg:grid-cols-2">
		{#each Object.entries(SUMMARY_NOTES) as [name, note] (name)}
			<section class="y-panel flex items-start justify-between gap-3 p-5">
				<div class="min-w-0"><h3 class="font-mono text-sm font-semibold">{name}.parquet</h3><p class="mt-1 text-xs text-muted">{note}</p></div>
				<SqlButton sql={`SELECT *\nFROM '${summaryUrl(name)}'\nLIMIT 100`} label="Query" />
			</section>
		{/each}
	</div>
{:catch e}
	<div class="y-panel"><ErrorBox title="Couldn't read the catalog" message={String(e?.message ?? e)} retry={() => (data = load())} /></div>
{/await}
