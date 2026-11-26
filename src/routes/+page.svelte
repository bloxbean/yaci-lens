<script lang="ts">
	import PoolName from '$lib/names/PoolName.svelte';
	import Activity from '@lucide/svelte/icons/activity';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Box from '@lucide/svelte/icons/box';
	import Coins from '@lucide/svelte/icons/coins';
	import Landmark from '@lucide/svelte/icons/landmark';
	import PiggyBank from '@lucide/svelte/icons/piggy-bank';
	import Server from '@lucide/svelte/icons/server';
	import TerminalSquare from '@lucide/svelte/icons/square-terminal';
	import Zap from '@lucide/svelte/icons/zap';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import { lake, summary } from '$lib/lake/lake.svelte';
	import type { Daily, Epoch, LatestBlock, Pool, Proposal } from '$lib/lake/types';
	import { adaShort, int, isoDay, poolBech32, short, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';
	import { proposalTone, typeLabel } from '$lib/lake/governance';

	function load() {
		return Promise.all([
			summary<Epoch>('epochs'),
			summary<Daily>('daily'),
			summary<LatestBlock>('latest_blocks'),
			summary<Pool>('pools'),
			summary<Proposal>('governance')
		]);
	}
	let data = $state(load());
</script>

<svelte:head><title>Dashboard · Yaci Lens</title></svelte:head>

<section class="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
	<div>
		<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
			<span class="y-pill border-brand/25 bg-brand/10 font-semibold text-brand">Cardano mainnet</span>
			<span class="y-pill border-line bg-surface text-muted" title="Updated daily; about two days behind the chain">Daily snapshot · T-2 · serverless</span>
		</div>
		<h1 class="text-3xl font-semibold sm:text-4xl">
			Cardano, through
			{#if lake.tip}<span class="y-grad-text tabular-nums">{isoDay(lake.tip.date)}</span>{:else}<span class="text-faint">…</span>{/if}
		</h1>
		<p class="mt-1.5 text-sm text-muted">
			{#if lake.tip}
				Tip block <a class="y-link tabular-nums" href="#/blocks/{lake.tip.block}">#{int(lake.tip.block)}</a> · epoch
				<a class="y-link" href="#/epochs/{lake.tip.epoch}">{lake.tip.epoch}</a>
				{#if lake.tip.generatedAt}· published {utc(lake.tip.generatedAt)}{/if}
			{:else if lake.status === 'error'}
				Can't load the data lake: {lake.error}
			{:else}
				{lake.step || 'Starting DuckDB'}…
			{/if}
		</p>
		<p class="mt-1 text-xs text-faint">
			Analytics on daily data, about two days behind the chain (T-2). For real-time data, use a community explorer:
			<a class="y-link" href="https://cardanoscan.io" target="_blank" rel="noopener noreferrer">Cardanoscan</a>,
			<a class="y-link" href="https://cexplorer.io" target="_blank" rel="noopener noreferrer">Cexplorer</a> or
			<a class="y-link" href="https://adastat.net" target="_blank" rel="noopener noreferrer">AdaStat</a>.
		</p>
	</div>
	<a href="#/sql" class="y-btn y-btn-primary h-11 px-4"><TerminalSquare class="h-4 w-4" /> Query any table in SQL</a>
</section>

{#await data}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel"><Skeleton rows={8} /></div>
{:then [epochs, daily, blocks, pools, proposals]}
	{@const last30 = daily.slice(-30)}
	{@const recentEpochs = epochs.slice(-30)}
	{@const cur = epochs.at(-1)}
	{@const txs30 = last30.reduce((s, d) => s + d.txs, 0)}
	{@const activeProposals = proposals.filter((p) => p.status === 'ACTIVE')}

	<!-- KPIs -->
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="Transactions" value={short(txs30)} sub="last 30 days · {short(txs30 / 30)}/day" trend={last30.map((d) => d.txs)} href="#/epochs">
			{#snippet icon()}<Zap class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat
			label="Active stake"
			value={adaShort(cur?.active_stake_ada)}
			sub="epoch {cur?.epoch} · {short(cur?.delegators)} delegations"
			trend={recentEpochs.map((e) => e.active_stake_ada ?? 0)}
			color="rgb(var(--c-violet))"
			href="#/pools"
		>
			{#snippet icon()}<Server class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Treasury" value={adaShort(cur?.treasury_ada)} sub="reserves {adaShort(cur?.reserves_ada)}" trend={recentEpochs.map((e) => e.treasury_ada ?? 0)} color="rgb(var(--c-mint))" href="#/epochs">
			{#snippet icon()}<PiggyBank class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Governance" value="{activeProposals.length} active" sub="{proposals.length} proposals since Conway" href="#/governance" color="rgb(var(--c-blue))">
			{#snippet icon()}<Landmark class="h-4 w-4" />{/snippet}
		</Stat>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Transactions per day" sub="Last 365 days (UTC)">
			{#snippet icon()}<Activity class="h-4 w-4" />{/snippet}
			<Chart kind="area" height={160} label="Transactions per day" points={daily.slice(-365).map((d) => ({ label: isoDay(d.date), value: d.txs }))} format={(v) => int(Math.round(v))} />
		</Panel>
		<Panel title="Fees per epoch" sub="Shelley era onward, in ADA">
			{#snippet icon()}<Coins class="h-4 w-4" />{/snippet}
			<Chart kind="bar" height={160} label="Fees per epoch" color="rgb(var(--c-amber))" points={epochs.map((e) => ({ label: `Epoch ${e.epoch}`, value: e.fees_ada }))} format={(v) => adaShort(v)} />
		</Panel>
		<Panel title="Treasury" sub="At each epoch boundary">
			{#snippet icon()}<PiggyBank class="h-4 w-4" />{/snippet}
			<Chart kind="area" height={140} label="Treasury" color="rgb(var(--c-mint))" points={epochs.filter((e) => e.treasury_ada != null).map((e) => ({ label: `Epoch ${e.epoch}`, value: e.treasury_ada! }))} format={(v) => adaShort(v)} />
		</Panel>
		<Panel title="Reserves" sub="At each epoch boundary">
			{#snippet icon()}<PiggyBank class="h-4 w-4" />{/snippet}
			<Chart kind="area" height={140} label="Reserves" color="rgb(var(--c-violet))" points={epochs.filter((e) => e.reserves_ada != null).map((e) => ({ label: `Epoch ${e.epoch}`, value: e.reserves_ada! }))} format={(v) => adaShort(v)} />
		</Panel>
	</section>

	<section class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
		<Panel title="Latest blocks" sub="Newest in this snapshot" flush>
			{#snippet icon()}<Box class="h-4 w-4" />{/snippet}
			{#snippet actions()}<a href="#/blocks" class="y-btn h-8 text-xs">All blocks <ArrowRight class="h-3.5 w-3.5" /></a>{/snippet}
			<ul class="divide-y divide-line/70">
				{#each blocks.slice(0, 8) as b (b.number)}
					<li>
						<a href="#/blocks/{b.number}" class="flex items-center gap-4 px-5 py-3 transition hover:bg-surface-2/60">
							<span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-faint"><Box class="h-4 w-4" /></span>
							<div class="min-w-0 flex-1">
								<div class="font-mono text-sm font-semibold tabular-nums">#{int(b.number)}</div>
								<div class="truncate text-xs text-muted">{utc(b.block_time)} · <PoolName hash={b.pool_hash} link={false} /></div>
							</div>
							<div class="text-right text-xs">
								<div class="font-semibold tabular-nums">{b.no_of_txs} txs</div>
								<div class="text-muted tabular-nums">{short(b.body_size)} B</div>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		</Panel>

		<div class="flex flex-col gap-6">
			<Panel title="Largest pools" sub="Active stake, epoch {cur?.epoch}" flush>
				{#snippet icon()}<Server class="h-4 w-4" />{/snippet}
				{#snippet actions()}<a href="#/pools" class="y-btn h-8 text-xs">All pools <ArrowRight class="h-3.5 w-3.5" /></a>{/snippet}
				<ul class="divide-y divide-line/70">
					{#each pools.slice(0, 6) as p (p.pool_hash)}
						<li>
							<a href="#/pools/{poolBech32(p.pool_hash)}" class="flex items-center gap-3 px-5 py-2.5 text-sm transition hover:bg-surface-2/60">
								<span class="min-w-0 flex-1 truncate"><PoolName hash={p.pool_hash} link={false} head={12} tail={8} /></span>
								<span class="tabular-nums text-muted">{(p.stake_share * 100).toFixed(2)}%</span>
								<span class="w-20 text-right font-semibold tabular-nums">{adaShort(p.active_stake_ada)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</Panel>
			<Panel title="Recent proposals" flush>
				{#snippet icon()}<Landmark class="h-4 w-4" />{/snippet}
				{#snippet actions()}<a href="#/governance" class="y-btn h-8 text-xs">All <ArrowRight class="h-3.5 w-3.5" /></a>{/snippet}
				<ul class="divide-y divide-line/70">
					{#each proposals.slice(0, 5) as p (p.tx_hash + p.idx)}
						<li class="flex items-center gap-3 px-5 py-2.5 text-sm">
							<span class="min-w-0 flex-1 truncate">{typeLabel(p.type)}</span>
							<span class="text-xs text-muted">epoch {p.proposed_epoch}</span>
							<Badge tone={proposalTone(p.status)}>{p.status ?? '—'}</Badge>
						</li>
					{/each}
				</ul>
			</Panel>
		</div>
	</section>
{:catch e}
	<div class="y-panel">
		<ErrorBox title="Couldn't load the summary data" message={e instanceof Error ? e.message : String(e)} retry={() => (data = load())} />
	</div>
{/await}
