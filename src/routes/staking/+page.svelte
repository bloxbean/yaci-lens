<script lang="ts">
	import Layers from '@lucide/svelte/icons/layers';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Link2 from '@lucide/svelte/icons/link-2';
	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import Scale from '@lucide/svelte/icons/scale';
	import Gift from '@lucide/svelte/icons/gift';
	import Vote from '@lucide/svelte/icons/vote';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import { summary, summaryUrl } from '$lib/lake/lake.svelte';
	import type { DRepEpoch, StakingDay, StakingEpoch } from '$lib/lake/staking';
	import { adaShort, int, isoDay, short } from '$lib/cardano';

	function load() {
		return Promise.all([summary<StakingDay>('staking_daily'), summary<StakingEpoch>('staking_epochs'), summary<DRepEpoch>('drep_epochs')]);
	}
	let data = $state(load());
	let range = $state(365);

	const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + (f(r) || 0), 0);
	const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
</script>

<svelte:head><title>Staking · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Staking & certificates">
	{#snippet icon()}<Layers class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<div class="flex rounded-xl border border-line p-0.5 text-xs">
			{#each [[90, '90 days'], [365, '1 year'], [100000, 'All']] as [d, label] (d)}
				<button class="h-8 rounded-lg px-3 {range === d ? 'bg-surface-2 text-ink' : 'text-muted'}" onclick={() => (range = d as number)}>{label}</button>
			{/each}
		</div>
	{/snippet}
	Stake keys, delegations, withdrawals and pool and DRep certificates per day; rewards, decentralisation and DRep voting power per epoch.
</PageHeader>

{#await data}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel"><Skeleton rows={8} /></div>
{:then [days, epochs, dreps]}
	{@const last30 = days.slice(-30)}
	{@const shown = days.slice(-range)}
	{@const complete = epochs.filter((e) => e.member_rewards_ada != null)}
	{@const conc = epochs.filter((e) => e.nakamoto != null)}
	{@const cur = conc.at(-1)}
	{@const net30 = sum(last30, (d) => d.stake_registrations - d.stake_deregistrations)}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="Delegations" value={short(sum(last30, (d) => d.delegations))} sub="last 30 days · {short(sum(last30, (d) => d.vote_delegations))} vote delegations" trend={last30.map((d) => d.delegations)}>
			{#snippet icon()}<Link2 class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Stake keys" value="{net30 >= 0 ? '+' : ''}{short(net30)}" sub="net, last 30 days · {short(sum(last30, (d) => d.stake_registrations))} new" trend={last30.map((d) => d.stake_registrations - d.stake_deregistrations)} color="rgb(var(--c-violet))">
			{#snippet icon()}<KeyRound class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Withdrawals" value={adaShort(sum(last30, (d) => d.withdrawn_ada))} sub="last 30 days · {short(sum(last30, (d) => d.withdrawals))} withdrawals" trend={last30.map((d) => d.withdrawn_ada)} color="rgb(var(--c-mint))">
			{#snippet icon()}<ArrowDownLeft class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Nakamoto coefficient" value={cur?.nakamoto ?? '—'} sub="pools holding >50% of stake · epoch {cur?.epoch ?? '—'}" trend={conc.slice(-30).map((e) => e.nakamoto ?? 0)} color="rgb(var(--c-blue))">
			{#snippet icon()}<Scale class="h-4 w-4" />{/snippet}
		</Stat>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Delegation certificates per day">
			{#snippet actions()}<SqlButton sql={`SELECT date, delegations, vote_delegations\nFROM '${summaryUrl('staking_daily')}'\nORDER BY date DESC`} />{/snippet}
			<Chart kind="area" height={150} label="Delegations" points={shown.map((d) => ({ label: isoDay(d.date), value: d.delegations }))} format={(v) => int(Math.round(v))} />
		</Panel>
		<Panel title="Withdrawals per day" sub="Rewards withdrawn, ADA">
			<Chart kind="area" height={150} label="Withdrawn" color="rgb(var(--c-mint))" points={shown.map((d) => ({ label: isoDay(d.date), value: d.withdrawn_ada }))} format={(v) => adaShort(v)} />
		</Panel>
		<Panel title="Stake key registrations per day">
			<Chart kind="bar" height={130} label="Registrations" color="rgb(var(--c-violet))" points={shown.map((d) => ({ label: isoDay(d.date), value: d.stake_registrations }))} format={(v) => int(Math.round(v))} />
		</Panel>
		<Panel title="Stake key deregistrations per day">
			<Chart kind="bar" height={130} label="Deregistrations" color="rgb(var(--c-pink))" points={shown.map((d) => ({ label: isoDay(d.date), value: d.stake_deregistrations }))} format={(v) => int(Math.round(v))} />
		</Panel>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Rewards per epoch" sub="Member + leader rewards, ADA">
			{#snippet icon()}<Gift class="h-4 w-4" />{/snippet}
			{#snippet actions()}<SqlButton sql={`SELECT *\nFROM '${summaryUrl('staking_epochs')}'\nORDER BY epoch DESC`} />{/snippet}
			<Chart kind="bar" height={150} label="Rewards" color="rgb(var(--c-amber))" points={complete.map((e) => ({ label: `Epoch ${e.epoch}`, value: (e.member_rewards_ada ?? 0) + (e.leader_rewards_ada ?? 0) }))} format={(v) => adaShort(v)} />
		</Panel>
		<Panel title="Nakamoto coefficient per epoch" sub="Fewest pools holding more than half the active stake">
			{#snippet icon()}<Scale class="h-4 w-4" />{/snippet}
			<Chart kind="area" height={150} label="Nakamoto coefficient" color="rgb(var(--c-blue))" points={conc.map((e) => ({ label: `Epoch ${e.epoch}`, value: e.nakamoto ?? 0 }))} format={(v) => String(Math.round(v))} />
		</Panel>
		<Panel title="Pools with stake per epoch">
			<Chart kind="area" height={130} label="Pools" color="rgb(var(--c-cyan))" points={conc.map((e) => ({ label: `Epoch ${e.epoch}`, value: e.pools_with_stake ?? 0 }))} format={(v) => int(Math.round(v))} />
		</Panel>
		<Panel title="Stake held by the 10 largest pools" sub="Share of active stake">
			<Chart kind="area" height={130} label="Top 10 share" color="rgb(var(--c-violet))" points={conc.map((e) => ({ label: `Epoch ${e.epoch}`, value: (e.top10_share ?? 0) * 100 }))} format={(v) => `${v.toFixed(1)}%`} />
		</Panel>
	</section>

	{#if dreps.length}
		{@const d = dreps.at(-1)!}
		<section class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
			<Panel title="Stake delegated to DReps per epoch" sub="Registered DReps only, ADA">
				{#snippet icon()}<Vote class="h-4 w-4" />{/snippet}
				{#snippet actions()}<SqlButton sql={`SELECT *\nFROM '${summaryUrl('drep_epochs')}'\nORDER BY epoch DESC`} />{/snippet}
				<Chart kind="area" height={150} label="DRep-delegated stake" color="rgb(var(--c-blue))" points={dreps.map((e) => ({ label: `Epoch ${e.epoch}`, value: e.drep_power_ada ?? 0 }))} format={(v) => adaShort(v)} />
			</Panel>
			<Panel title="Voting power, epoch {d.epoch}">
				<dl class="grid gap-3 text-sm">
					{#each [['Registered DReps', d.drep_power_ada, `${int(d.dreps_with_power)} DReps`], ['Always abstain', d.abstain_ada, ''], ['Always no confidence', d.no_confidence_ada, '']] as [label, v, note] (label)}
						<div class="flex items-baseline justify-between gap-3">
							<dt class="text-muted">{label}{#if note}<span class="ml-1 text-xs text-faint">{note}</span>{/if}</dt>
							<dd class="font-semibold tabular-nums">{adaShort(v as number)} <span class="text-xs font-normal text-muted">{pct((v as number) / d.total_power_ada)}</span></dd>
						</div>
					{/each}
				</dl>
			</Panel>
		</section>
	{/if}

	<Panel title="Certificates, last 30 days" flush>
		<table class="w-full text-sm">
			<tbody>
				{#each [['Stake key registrations', (x: StakingDay) => x.stake_registrations], ['Stake key deregistrations', (x: StakingDay) => x.stake_deregistrations], ['Stake delegations', (x: StakingDay) => x.delegations], ['Vote delegations', (x: StakingDay) => x.vote_delegations], ['Pool registrations', (x: StakingDay) => x.pool_registrations], ['Pool updates', (x: StakingDay) => x.pool_updates], ['Pool retirements', (x: StakingDay) => x.pool_retirements], ['DRep registrations', (x: StakingDay) => x.drep_registrations], ['DRep updates', (x: StakingDay) => x.drep_updates], ['DRep retirements', (x: StakingDay) => x.drep_retirements]] as [label, f] (label)}
					<tr class="border-b border-line/70 last:border-0">
						<td class="px-5 py-2.5">{label}</td>
						<td class="px-5 py-2.5 text-right font-semibold tabular-nums">{int(sum(last30, f as (x: StakingDay) => number))}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Panel>
{:catch e}
	<div class="y-panel"><ErrorBox title="Couldn't load the staking summaries" message={String(e?.message ?? e)} retry={() => (data = load())} /></div>
{/await}
