<script lang="ts">
	import Server from '@lucide/svelte/icons/server';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { summary } from '$lib/lake/lake.svelte';
	import type { Pool } from '$lib/lake/types';
	import { adaShort, int, poolBech32 } from '$lib/cardano';
	import { shorten } from '$lib/format';

	function load() {
		return summary<Pool>('pools');
	}
	let data = $state(load());
	let filter = $state('');
	let limit = $state(100);

	const columns: Column[] = [
		{ key: 'rank', label: '#' },
		{ key: 'pool', label: 'Pool' },
		{ key: 'stake', label: 'Active stake', align: 'right' },
		{ key: 'share', label: 'Share', align: 'right', minor: true },
		{ key: 'delegators', label: 'Delegators', align: 'right', minor: true },
		{ key: 'blocks', label: 'Blocks last epoch', align: 'right', minor: true },
		{ key: 'margin', label: 'Margin / cost', align: 'right', minor: true },
		{ key: 'pledge', label: 'Pledge', align: 'right', minor: true }
	];
</script>

<svelte:head><title>Pools · Yaci Lens</title></svelte:head>

<PageHeader kind="Staking" title="Stake pools">
	{#snippet icon()}<Server class="h-5 w-5" />{/snippet}
	{#snippet actions()}<input class="y-input h-9 w-64" placeholder="Filter by pool id or metadata URL" bind:value={filter} />{/snippet}
	Stake active in the current epoch (snapshot of two epochs earlier), with the latest registration parameters.
</PageHeader>

<Panel flush>
	{#await data}
		<Skeleton rows={12} />
	{:then pools}
		{@const ranked = pools.map((p, i) => ({ ...p, rank: i + 1, bech: poolBech32(p.pool_hash) }))}
		{@const f = filter.trim().toLowerCase()}
		{@const rows = f ? ranked.filter((p) => p.bech.includes(f) || p.pool_hash.includes(f) || (p.metadata_url ?? '').toLowerCase().includes(f)) : ranked}
		<DataTable rows={rows.slice(0, limit)} {columns} key={(p) => p.pool_hash} rowHref={(p) => `#/pools/${p.bech}`} dense>
			{#snippet cell(p, k)}
				{#if k === 'rank'}<span class="text-faint tabular-nums">{p.rank}</span>
				{:else if k === 'pool'}
					<a class="y-link font-mono text-xs" href="#/pools/{p.bech}">{shorten(p.bech, 14, 8)}</a>
					{#if p.metadata_url}<div class="max-w-[260px] truncate text-[11px] text-faint">{p.metadata_url}</div>{/if}
				{:else if k === 'stake'}<span class="font-semibold tabular-nums">{adaShort(p.active_stake_ada)}</span>
				{:else if k === 'share'}<span class="tabular-nums">{(p.stake_share * 100).toFixed(3)}%</span>
				{:else if k === 'delegators'}<span class="tabular-nums">{int(p.delegators)}</span>
				{:else if k === 'blocks'}<span class="tabular-nums">{p.blocks_last_epoch}</span>
				{:else if k === 'margin'}<span class="tabular-nums text-muted">{p.margin != null ? (p.margin * 100).toFixed(2) + '%' : '—'} / ₳{p.cost_ada ?? '—'}</span>
				{:else if k === 'pledge'}<span class="tabular-nums text-muted">{adaShort(p.pledge_ada)}</span>
				{/if}
			{/snippet}
		</DataTable>
		<div class="flex items-center justify-between border-t border-line/70 px-5 py-3 text-xs text-muted">
			<span>{rows.length.toLocaleString('en-US')} pools{f ? ' match' : ''}</span>
			{#if rows.length > limit}<button class="y-btn h-8 text-xs" onclick={() => (limit += 200)}>Show more</button>{/if}
		</div>
	{:catch e}
		<ErrorBox title="Couldn't load pools" message={String(e?.message ?? e)} retry={() => (data = load())} />
	{/await}
</Panel>
