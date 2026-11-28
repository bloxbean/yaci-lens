<script lang="ts">
	import Server from '@lucide/svelte/icons/server';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import { lake, live, summary } from '$lib/lake/lake.svelte';
	import type { Pool } from '$lib/lake/types';
	import { adaShort, int, poolBech32, poolHash, short } from '$lib/cardano';
	import { shorten } from '$lib/format';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { poolMeta, poolLabel } from '$lib/lake/offchain';
	import PoolHistory from '$lib/pools/PoolHistory.svelte';
	import PoolDelegators from '$lib/indexdb/PoolDelegators.svelte';
	import { indexEnabled } from '$lib/indexdb/config';
	// delegator flows come from the SQLite indexes, when they are on and published
	let indexed = $state(false);
	if (indexEnabled()) import('$lib/indexdb/service').then((s) => s.indexAvailable()).then((ok) => (indexed = ok));

	const id = $derived(page.params.id ?? '');
	const hash = $derived(poolHash(id));

	interface Delegator {
		address: string;
		stake_ada: number;
		delegation_epoch: number;
	}
	interface RewardRow {
		type: string;
		rewards: number;
		ada: number;
	}

	// Each query reads one partition: the stake snapshot active now, and the rewards of the last paid epoch.
	const delegSql = (h: string, e: number) => `SELECT address, amount / 1e6 AS stake_ada, delegation_epoch
FROM epoch_stake
WHERE epoch = ${e - 2} AND pool_id = '${h}'
ORDER BY amount DESC
LIMIT 100`;
	const rewardSql = (h: string, e: number) => `SELECT type, count(*) AS rewards, sum(amount) / 1e6 AS ada
FROM reward
WHERE epoch = ${e - 2} AND pool_id = '${h}'
GROUP BY 1 ORDER BY 1`;

	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		const h = hash;
		const e = lake.tip?.epoch;
		return {
			meta: poolMeta().then((m) => (h ? (m.get(h) ?? null) : null)),
			pool: summary<Pool>('pools').then((ps) => ps.find((p) => p.pool_hash === h) ?? null),
			delegators: h && e ? live<Delegator>(delegSql(h, e)) : null,
			rewards: h && e ? live<RewardRow>(rewardSql(h, e)) : null
		};
	});

	const dcols: Column[] = [
		{ key: 'address', label: 'Stake address' },
		{ key: 'since', label: 'Delegated in epoch', align: 'right', minor: true },
		{ key: 'stake', label: 'Stake', align: 'right' }
	];
</script>

<svelte:head><title>Pool {shorten(id, 10, 6)} · Yaci Lens</title></svelte:head>

{#await data.meta then m}
	<PageHeader kind="Stake pool" title={poolLabel(m) ?? shorten(poolBech32(hash ?? id), 14, 8)}>
		{#snippet icon()}<Server class="h-5 w-5" />{/snippet}
		{#if hash}<Hash value={poolBech32(hash)} full />{/if}
		{#if m?.description && m.hash_ok !== false}<p class="mt-2 max-w-3xl text-sm text-muted">{m.description}</p>{/if}
		{#snippet actions()}
			{#if m?.homepage && m.hash_ok !== false}<a class="y-btn h-9" href={m.homepage} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink class="h-4 w-4" />Website</a>{/if}
		{/snippet}
	</PageHeader>
{/await}

{#if !hash}
	<div class="y-panel p-6 text-sm text-muted">"{id}" is not a pool id (pool1… or a 56-character hex hash).</div>
{:else}
	{#await data.pool}
		<div class="y-panel mb-6"><Skeleton rows={3} /></div>
	{:then p}
		{#if p}
			<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
				<Stat label="Active stake" value={adaShort(p.active_stake_ada)} sub="{(p.stake_share * 100).toFixed(3)}% of all · epoch {p.active_epoch}" />
				<Stat label="Delegators" value={int(p.delegators)} color="rgb(var(--c-violet))" />
				<Stat label="Blocks last epoch" value={int(p.blocks_last_epoch)} color="rgb(var(--c-blue))" />
				<Stat label="Margin / cost" value={p.margin != null ? `${(p.margin * 100).toFixed(2)}%` : '—'} sub="fixed cost ₳{p.cost_ada ?? '—'} · pledge {adaShort(p.pledge_ada)}" color="rgb(var(--c-mint))" />
			</section>
			<Panel title="Registration" class="mb-6">
				<dl class="grid gap-x-10 gap-y-4 md:grid-cols-2">
					<KV label="Pool hash"><Hash value={p.pool_hash} /></KV>
					<KV label="Metadata">
						{#if p.metadata_url}<a class="y-link break-all" href={p.metadata_url} target="_blank" rel="noopener noreferrer nofollow">{p.metadata_url}</a>{:else}—{/if}
						{#await data.meta then m}
							{#if m?.fetched && m.hash_ok}<span class="mt-1 flex items-center gap-1 text-xs text-mint"><ShieldCheck class="h-3.5 w-3.5" />Hash matches the chain</span>
							{:else if m?.fetched && m.hash_ok === false}<span class="mt-1 flex items-center gap-1 text-xs text-danger"><ShieldAlert class="h-3.5 w-3.5" />The file changed since it was registered (hash mismatch); its fields are not shown</span>
							{:else if m && !m.fetched}<span class="mt-1 block text-xs text-faint">Couldn't read the metadata file ({m.error ?? 'unknown error'}).</span>{/if}
						{/await}
					</KV>
					<KV label="Reward account"><span class="font-mono text-xs break-all">{p.reward_account ?? '—'}</span></KV>
				</dl>
			</Panel>
		{:else}
			<div class="y-panel mb-6 p-5 text-sm text-muted">This pool has no active stake in the current epoch (retired, new, or not delegated to).</div>
		{/if}
	{/await}

	<PoolHistory {hash} />

	<section class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<Panel title="Largest delegators" sub="Live query: stake active in epoch {lake.tip?.epoch ?? '…'}" flush>
			{#snippet actions()}{#if lake.tip}<SqlButton sql={delegSql(hash, lake.tip.epoch)} />{/if}{/snippet}
			{#if data.delegators}
				{#await data.delegators}
					<Skeleton rows={8} />
				{:then rows}
					<DataTable {rows} columns={dcols} key={(d) => d.address} dense emptyTitle="No delegators in this snapshot">
						{#snippet cell(d, k)}
							{#if k === 'address'}{#if indexed}<a class="y-link font-mono text-xs" href="#/x/address/{d.address}">{shorten(d.address, 16, 10)}</a>{:else}<span class="font-mono text-xs">{shorten(d.address, 16, 10)}</span>{/if}
							{:else if k === 'since'}<span class="tabular-nums text-muted">{d.delegation_epoch}</span>
							{:else if k === 'stake'}<span class="tabular-nums">{adaShort(d.stake_ada)}</span>
							{/if}
						{/snippet}
					</DataTable>
				{:catch e}
					<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
				{/await}
			{:else}<Skeleton rows={6} />{/if}
		</Panel>
		<Panel title="Rewards" sub="Live query: rewards earned for epoch {(lake.tip?.epoch ?? 2) - 2}" flush>
			{#snippet actions()}{#if lake.tip}<SqlButton sql={rewardSql(hash, lake.tip.epoch)} />{/if}{/snippet}
			{#if data.rewards}
				{#await data.rewards}
					<Skeleton rows={3} />
				{:then rows}
					<ul class="divide-y divide-line/70">
						{#each rows as r (r.type)}
							<li class="flex items-center justify-between px-5 py-3 text-sm"><span class="capitalize">{r.type.toLowerCase()}</span><span class="tabular-nums text-muted">{short(r.rewards)} payouts · <b class="text-ink">{adaShort(r.ada)}</b></span></li>
						{:else}
							<li class="px-5 py-3 text-sm text-muted">No rewards for this epoch.</li>
						{/each}
					</ul>
				{:catch e}
					<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
				{/await}
			{:else}<Skeleton rows={3} />{/if}
		</Panel>
	</section>
	{#if indexed}<PoolDelegators pool={hash} />{/if}
{/if}
