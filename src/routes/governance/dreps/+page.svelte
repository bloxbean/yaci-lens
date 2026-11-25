<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import { onMount } from 'svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { summary } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import type { DRep } from '$lib/lake/types';
	import { adaShort } from '$lib/cardano';
	import { shorten } from '$lib/format';

	function load() {
		return summary<DRep>('dreps');
	}
	let data = $state(load());
	let filter = $state('');
	let limit = $state(100);
	onMount(() => (filter = hashParam('q') ?? ''));

	const columns: Column[] = [
		{ key: 'rank', label: '#' },
		{ key: 'drep', label: 'DRep' },
		{ key: 'type', label: 'Type', minor: true },
		{ key: 'status', label: 'Status', minor: true },
		{ key: 'power', label: 'Voting power', align: 'right' },
		{ key: 'share', label: 'Share', align: 'right', minor: true }
	];
</script>

<svelte:head><title>DReps · Yaci Lens</title></svelte:head>

<PageHeader kind="Governance" title="DReps">
	{#snippet icon()}<Users class="h-5 w-5" />{/snippet}
	{#snippet actions()}<input class="y-input h-9 w-64" placeholder="Filter by DRep id" bind:value={filter} />{/snippet}
	Voting power in the newest DRep distribution, including the predefined Abstain and No-confidence options.
</PageHeader>

<Panel flush>
	{#await data}
		<Skeleton rows={12} />
	{:then dreps}
		{@const total = dreps.reduce((s, d) => s + d.voting_power_ada, 0)}
		{@const ranked = dreps.map((d, i) => ({ ...d, rank: i + 1, id: d.drep_id ?? d.drep_type }))}
		{@const f = filter.trim().toLowerCase()}
		{@const rows = f ? ranked.filter((d) => d.id.toLowerCase().includes(f) || d.drep_hash.includes(f)) : ranked}
		<DataTable rows={rows.slice(0, limit)} {columns} key={(d) => d.drep_hash + d.drep_type} dense>
			{#snippet cell(d, k)}
				{#if k === 'rank'}<span class="text-faint tabular-nums">{d.rank}</span>
				{:else if k === 'drep'}<span class="font-mono text-xs" title={d.id}>{d.drep_id ? shorten(d.drep_id, 14, 8) : d.drep_type}</span>
				{:else if k === 'type'}<span class="text-xs text-muted">{d.drep_type}</span>
				{:else if k === 'status'}{#if d.status}<Badge tone={d.status === 'ACTIVE' || d.status === 'REGISTERED' ? 'ok' : 'neutral'}>{d.status}</Badge>{/if}
				{:else if k === 'power'}<span class="font-semibold tabular-nums">{adaShort(d.voting_power_ada)}</span>
				{:else if k === 'share'}<span class="tabular-nums">{((d.voting_power_ada / total) * 100).toFixed(2)}%</span>
				{/if}
			{/snippet}
		</DataTable>
		<div class="flex items-center justify-between border-t border-line/70 px-5 py-3 text-xs text-muted">
			<span>{rows.length.toLocaleString('en-US')} entries · distribution of epoch {dreps[0]?.epoch ?? '—'}</span>
			{#if rows.length > limit}<button class="y-btn h-8 text-xs" onclick={() => (limit += 200)}>Show more</button>{/if}
		</div>
	{:catch e}
		<ErrorBox title="Couldn't load DReps" message={String(e?.message ?? e)} retry={() => (data = load())} />
	{/await}
</Panel>
