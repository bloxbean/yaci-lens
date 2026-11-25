<script lang="ts">
	import PoolName from '$lib/names/PoolName.svelte';
	import Timer from '@lucide/svelte/icons/timer';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import { live, summary } from '$lib/lake/lake.svelte';
	import type { Daily, Epoch } from '$lib/lake/types';
	import { adaShort, int, isoDay, poolBech32, short, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';

	const epoch = $derived(Number(page.params.epoch));

	interface PoolRow {
		pool_hash: string;
		blocks: number;
		txs: number;
		stake_ada: number | null;
	}

	// Blocks per pool in this epoch (the block table prunes to this epoch's days by column stats), joined with the
	// stake that was active in it (the snapshot taken two epochs earlier, one partition).
	const poolSql = (n: number) => `SELECT b.pool_hash, b.blocks, b.txs, s.stake_ada
FROM (SELECT slot_leader AS pool_hash, count(*) AS blocks, sum(no_of_txs) AS txs
      FROM block WHERE epoch = ${n} GROUP BY 1) b
LEFT JOIN (SELECT pool_id AS pool_hash, sum(amount) / 1e6 AS stake_ada
           FROM epoch_stake WHERE epoch = ${n - 2} GROUP BY 1) s USING (pool_hash)
ORDER BY b.blocks DESC
LIMIT 50`;

	function load(n: number) {
		return {
			summary: Promise.all([summary<Epoch>('epochs'), summary<Daily>('daily')]),
			pools: live<PoolRow>(poolSql(n))
		};
	}
	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return load(epoch);
	});

	const columns: Column[] = [
		{ key: 'pool', label: 'Pool' },
		{ key: 'blocks', label: 'Blocks', align: 'right' },
		{ key: 'txs', label: 'Transactions', align: 'right', minor: true },
		{ key: 'stake', label: 'Active stake', align: 'right' }
	];
</script>

<svelte:head><title>Epoch {epoch} · Yaci Lens</title></svelte:head>

<PageHeader kind="Epoch" title="Epoch {epoch}">
	{#snippet icon()}<Timer class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<a class="y-btn h-9" href="#/epochs/{epoch - 1}" aria-label="Previous epoch"><ChevronLeft class="h-4 w-4" /></a>
		<a class="y-btn h-9" href="#/epochs/{epoch + 1}" aria-label="Next epoch"><ChevronRight class="h-4 w-4" /></a>
	{/snippet}
</PageHeader>

{#await data.summary}
	<div class="y-panel mb-6"><Skeleton rows={3} /></div>
{:then [epochs, daily]}
	{@const e = epochs.find((x) => x.epoch === epoch)}
	{@const days = daily.filter((d) => d.epoch === epoch)}
	{#if e}
		<p class="-mt-3 mb-5 text-sm text-muted">{utc(e.start_time)} → {utc(e.end_time)}</p>
		<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
			<Stat label="Blocks" value={int(e.blocks)} sub="{int(e.txs)} transactions" />
			<Stat label="Fees" value={adaShort(e.fees_ada)} sub="output {adaShort(e.total_output_ada)}" color="rgb(var(--c-amber))" />
			<Stat label="Active stake" value={adaShort(e.active_stake_ada)} sub="{short(e.delegators)} delegations · {int(e.pools)} pools" color="rgb(var(--c-violet))" />
			<Stat label="Treasury" value={adaShort(e.treasury_ada)} sub="reserves {adaShort(e.reserves_ada)}" color="rgb(var(--c-mint))" />
		</section>
	{:else if days.length === 0}
		<div class="y-panel mb-6 p-5 text-sm text-muted">No summary for epoch {epoch} (the summary covers Shelley epochs 208 to the current one). Live queries below still work for any epoch in the data.</div>
	{/if}
	{#if days.length}
		<Panel title="Transactions per day" sub="UTC days that started in epoch {epoch}" class="mb-6">
			<Chart kind="bar" height={120} label="Transactions per day" points={days.map((d) => ({ label: isoDay(d.date), value: d.txs }))} format={(v) => int(Math.round(v))} />
		</Panel>
	{/if}
{/await}

<Panel title="Block producers" sub="Live query: blocks made in this epoch, with the stake active in it" flush>
	{#snippet actions()}<SqlButton sql={poolSql(epoch)} />{/snippet}
	{#await data.pools}
		<Skeleton rows={8} />
	{:then pools}
		<DataTable rows={pools} {columns} key={(p) => p.pool_hash} rowHref={(p) => `#/pools/${poolBech32(p.pool_hash)}`} dense emptyTitle="No blocks in this epoch">
			{#snippet cell(p, k)}
				{#if k === 'pool'}<PoolName hash={p.pool_hash} head={14} tail={8} />
				{:else if k === 'blocks'}<span class="tabular-nums font-semibold">{int(p.blocks)}</span>
				{:else if k === 'txs'}<span class="tabular-nums">{int(p.txs)}</span>
				{:else if k === 'stake'}<span class="tabular-nums">{adaShort(p.stake_ada)}</span>
				{/if}
			{/snippet}
		</DataTable>
	{:catch err}
		<ErrorBox title="Query failed" message={String(err?.message ?? err)} retry={() => attempt++} />
	{/await}
</Panel>
