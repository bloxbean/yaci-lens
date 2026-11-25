<script lang="ts">
	import Blocks from '@lucide/svelte/icons/blocks';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { summary } from '$lib/lake/lake.svelte';
	import type { LatestBlock } from '$lib/lake/types';
	import { int, poolBech32, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';

	function load() {
		return summary<LatestBlock>('latest_blocks');
	}
	let data = $state(load());
	let n = $state('');

	const columns: Column[] = [
		{ key: 'number', label: 'Block' },
		{ key: 'time', label: 'Time (UTC)' },
		{ key: 'epoch', label: 'Epoch / slot', minor: true },
		{ key: 'pool', label: 'Pool', minor: true },
		{ key: 'txs', label: 'Txs', align: 'right' },
		{ key: 'size', label: 'Size', align: 'right', minor: true },
		{ key: 'fees', label: 'Fees', align: 'right', minor: true }
	];
</script>

<svelte:head><title>Blocks · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Blocks">
	{#snippet icon()}<Blocks class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), n.trim() && goto(`#/blocks/${n.trim().replace('#', '')}`))}>
			<input class="y-input h-9 w-44" placeholder="Block number" inputmode="numeric" bind:value={n} />
			<button class="y-btn h-9">Open</button>
		</form>
	{/snippet}
	The newest blocks in this snapshot. Any block opens by number: the lake finds its file from column statistics.
</PageHeader>

<Panel flush>
	{#await data}
		<Skeleton rows={12} />
	{:then blocks}
		<DataTable rows={blocks} {columns} key={(b) => b.number} rowHref={(b) => `#/blocks/${b.number}`} dense>
			{#snippet cell(b, k)}
				{#if k === 'number'}<a class="y-link font-mono font-semibold" href="#/blocks/{b.number}">#{int(b.number)}</a>
				{:else if k === 'time'}<span class="tabular-nums text-muted">{utc(b.block_time)}</span>
				{:else if k === 'epoch'}<span class="tabular-nums text-muted">{b.epoch} / {int(b.epoch_slot)}</span>
				{:else if k === 'pool'}<a class="y-link font-mono text-xs" href="#/pools/{poolBech32(b.pool_hash)}">{shorten(poolBech32(b.pool_hash), 10, 6)}</a>
				{:else if k === 'txs'}<span class="tabular-nums">{b.no_of_txs}</span>
				{:else if k === 'size'}<span class="tabular-nums">{int(b.body_size)} B</span>
				{:else if k === 'fees'}<span class="tabular-nums">₳{b.fees_ada.toFixed(2)}</span>
				{/if}
			{/snippet}
		</DataTable>
	{:catch e}
		<ErrorBox title="Couldn't load blocks" message={String(e?.message ?? e)} retry={() => (data = load())} />
	{/await}
</Panel>
