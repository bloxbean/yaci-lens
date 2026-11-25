<script lang="ts">
	import Timer from '@lucide/svelte/icons/timer';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { summary } from '$lib/lake/lake.svelte';
	import type { Epoch } from '$lib/lake/types';
	import { adaShort, int, isoDay, short } from '$lib/cardano';

	function load() {
		return summary<Epoch>('epochs');
	}
	let data = $state(load());

	const columns: Column[] = [
		{ key: 'epoch', label: 'Epoch' },
		{ key: 'start', label: 'Started (UTC)', minor: true },
		{ key: 'blocks', label: 'Blocks', align: 'right', minor: true },
		{ key: 'txs', label: 'Transactions', align: 'right' },
		{ key: 'fees', label: 'Fees', align: 'right' },
		{ key: 'stake', label: 'Active stake', align: 'right', minor: true },
		{ key: 'treasury', label: 'Treasury', align: 'right' },
		{ key: 'reserves', label: 'Reserves', align: 'right', minor: true }
	];
</script>

<svelte:head><title>Epochs · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Epochs">
	{#snippet icon()}<Timer class="h-5 w-5" />{/snippet}
	Activity, ada pots and active stake per Shelley-era epoch (208 onward), from the daily summary pack.
</PageHeader>

{#await data}
	<div class="y-panel"><Skeleton rows={10} /></div>
{:then epochs}
	{@const rows = [...epochs].reverse()}
	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Transactions per epoch">
			<Chart kind="bar" height={140} label="Transactions per epoch" points={epochs.map((e) => ({ label: `Epoch ${e.epoch}`, value: e.txs }))} format={(v) => int(Math.round(v))} />
		</Panel>
		<Panel title="Active stake per epoch">
			<Chart kind="area" height={140} color="rgb(var(--c-violet))" label="Active stake" points={epochs.filter((e) => e.active_stake_ada != null).map((e) => ({ label: `Epoch ${e.epoch}`, value: e.active_stake_ada! }))} format={(v) => adaShort(v)} />
		</Panel>
	</section>
	<Panel flush>
		<DataTable {rows} {columns} key={(e) => e.epoch} rowHref={(e) => `#/epochs/${e.epoch}`}>
			{#snippet cell(e, k)}
				{#if k === 'epoch'}<a class="y-link font-mono font-semibold" href="#/epochs/{e.epoch}">{e.epoch}</a>
				{:else if k === 'start'}<span class="text-muted tabular-nums">{isoDay(e.start_time)}</span>
				{:else if k === 'blocks'}<span class="tabular-nums">{int(e.blocks)}</span>
				{:else if k === 'txs'}<span class="tabular-nums">{int(e.txs)}</span>
				{:else if k === 'fees'}<span class="tabular-nums">{adaShort(e.fees_ada)}</span>
				{:else if k === 'stake'}<span class="tabular-nums">{adaShort(e.active_stake_ada)}</span>
				{:else if k === 'treasury'}<span class="tabular-nums">{adaShort(e.treasury_ada)}</span>
				{:else if k === 'reserves'}<span class="tabular-nums text-muted">{adaShort(e.reserves_ada)}</span>
				{/if}
			{/snippet}
		</DataTable>
	</Panel>
	<p class="mt-3 text-xs text-faint">{short(rows.length)} epochs. Byron epochs (0–207) are in the lake's block and transaction tables; query them in the SQL lab.</p>
{:catch e}
	<div class="y-panel"><ErrorBox title="Couldn't load epochs" message={String(e?.message ?? e)} retry={() => (data = load())} /></div>
{/await}
