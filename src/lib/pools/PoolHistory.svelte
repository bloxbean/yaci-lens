<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import { summaryQuery, summarySql, lake } from '$lib/lake/lake.svelte';
	import { adaShort, int } from '$lib/cardano';

	/*
	 * A pool over its whole life, from the summary pack (pool_epochs, pool_updates; built by the publisher):
	 * lifetime numbers, per-epoch charts (active stake, delegators, blocks made vs expected, members' return, stake
	 * keys joining and leaving) and every parameter change. Rewards for an epoch are known two epochs later.
	 */
	let { hash }: { hash: string } = $props();

	interface Ep {
		epoch: number;
		stake_ada: number;
		delegators: number;
		stake_share: number;
		blocks: number;
		expected_blocks: number;
		member_rewards_ada: number | null;
		leader_rewards_ada: number | null;
		member_roa: number | null;
		joins: number;
		leaves: number;
	}
	interface Upd {
		epoch: number;
		block_time: Date;
		kind: string;
		pledge_ada: number | null;
		cost_ada: number | null;
		margin: number | null;
		metadata_url: string | null;
		reward_account: string | null;
		retiring_epoch: number | null;
		tx_hash: string;
	}

	const ok = $derived(/^[0-9a-f]{56}$/.test(hash));
	const epochSql = $derived(`SELECT * EXCLUDE (pool_hash) FROM {pool_epochs} WHERE pool_hash = '${hash}' ORDER BY epoch`);
	const updSql = $derived(`SELECT * EXCLUDE (pool_hash) FROM {pool_updates} WHERE pool_hash = '${hash}' ORDER BY slot`);
	const data = $derived(ok ? Promise.all([summaryQuery<Ep>(epochSql), summaryQuery<Upd>(updSql)]) : null);

	let span = $state<'all' | '100' | '30'>('100');
	const cut = (rows: Ep[]) => {
		const done = rows.filter((r) => r.epoch <= (lake.tip?.epoch ?? Infinity));
		return span === 'all' ? done : done.slice(-Number(span));
	};
	const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);
	const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
	const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
	const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
</script>

{#if data}
	{#await data}
		<div class="y-panel mb-6"><Skeleton rows={5} /></div>
	{:then [eps, upds]}
		{#if eps.length}
			{@const done = eps.filter((r) => r.epoch <= (lake.tip?.epoch ?? Infinity))}
			{@const last18 = done.filter((r) => r.member_roa != null).slice(-18)}
			{@const recent = done.slice(-18)}
			{@const luck = sum(recent.map((r) => r.blocks)) / Math.max(1e-9, sum(recent.map((r) => r.expected_blocks)))}
			{@const now = done[done.length - 1]}
			{@const rows = cut(eps)}
			{@const x = rows.map((r) => String(r.epoch))}
			<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-5" data-testid="pool-lifetime">
				<Stat label="Active since" value={`epoch ${eps[0].epoch}`} sub="{done.length} epochs with stake" />
				<Stat label="Blocks made" value={int(sum(done.map((r) => r.blocks)))} sub="all time" color="rgb(var(--c-blue))" />
				<Stat label="Luck, last 18 epochs" value={pct(luck, 0)} sub="blocks made / expected" color="rgb(var(--c-amber))" />
				<Stat label="Members' return" value={pct(avg(last18.map((r) => r.member_roa ?? 0)))} sub="annualised, last {last18.length} epochs with rewards" color="rgb(var(--c-mint))" />
				<Stat label="Saturation" value={pct(now.stake_share * 500, 1)} sub="share of stake x 500 (k)" color={now.stake_share * 500 > 1 ? 'rgb(var(--c-danger))' : 'rgb(var(--c-violet))'} />
			</section>

			<div class="mb-3 flex items-center justify-between">
				<h2 class="font-display text-lg font-semibold">History</h2>
				<div class="flex items-center gap-1 text-xs">
					{#each [['30', 'Last 30 epochs'], ['100', 'Last 100'], ['all', 'All']] as [v, l] (v)}
						<button class="rounded-lg px-2.5 py-1 {span === v ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-surface-2'}" onclick={() => (span = v as typeof span)}>{l}</button>
					{/each}
					<SqlButton sql={summarySql(epochSql)} />
				</div>
			</div>
			<div class="mb-6 grid gap-6 xl:grid-cols-2" data-testid="pool-history">
				<Panel title="Active stake" sub="ADA active in the epoch">
					<SeriesChart kind="area" {x} series={[{ name: 'Stake', values: rows.map((r) => r.stake_ada) }]} format={(v) => adaShort(v)} xFormat={(e) => `epoch ${e}`} label="Active stake" />
				</Panel>
				<Panel title="Delegators" sub="stake keys delegated in the epoch's snapshot">
					<SeriesChart kind="line" {x} series={[{ name: 'Delegators', values: rows.map((r) => r.delegators), slot: 2 }]} xFormat={(e) => `epoch ${e}`} label="Delegators" />
				</Panel>
				<Panel title="Blocks made vs expected" sub="expected = share of active stake x the epoch's blocks">
					<SeriesChart kind="bar" {x} series={[{ name: 'Made', values: rows.map((r) => r.blocks), slot: 1 }, { name: 'Expected', values: rows.map((r) => r.expected_blocks), slot: 6 }]} xFormat={(e) => `epoch ${e}`} label="Blocks made vs expected" />
				</Panel>
				<Panel title="Members' return" sub="member rewards / active stake, annualised (73 epochs)">
					<SeriesChart kind="line" x={rows.filter((r) => r.member_roa != null).map((r) => String(r.epoch))} series={[{ name: 'Return %', values: rows.filter((r) => r.member_roa != null).map((r) => (r.member_roa ?? 0) * 100), slot: 3 }]} format={(v) => `${v.toFixed(2)}%`} xFormat={(e) => `epoch ${e}`} label="Members' return" />
				</Panel>
				<Panel title="Rewards" sub="ADA earned for the epoch: members and the operator">
					<SeriesChart kind="stacked" x={rows.filter((r) => r.member_rewards_ada != null).map((r) => String(r.epoch))} series={[{ name: 'Members', values: rows.filter((r) => r.member_rewards_ada != null).map((r) => r.member_rewards_ada ?? 0) }, { name: 'Operator', values: rows.filter((r) => r.member_rewards_ada != null).map((r) => r.leader_rewards_ada ?? 0), slot: 2 }]} format={(v) => adaShort(v)} xFormat={(e) => `epoch ${e}`} label="Rewards" />
				</Panel>
				<Panel title="Stake keys joining and leaving" sub="delegation certificates in the epoch (re-delegations to the same pool not counted)">
					<SeriesChart kind="bar" {x} series={[{ name: 'Joined', values: rows.map((r) => r.joins), slot: 1 }, { name: 'Left', values: rows.map((r) => r.leaves), slot: 3 }]} xFormat={(e) => `epoch ${e}`} label="Stake keys joining and leaving" />
				</Panel>
			</div>
		{/if}
		{#if upds.length}
			<Panel title="Registration history" sub="every registration, parameter update and retirement" class="mb-6" flush>
				{#snippet actions()}<SqlButton sql={summarySql(updSql)} />{/snippet}
				<ol class="divide-y divide-line text-sm" data-testid="pool-updates">
					{#each [...upds].reverse() as u, i (u.tx_hash + u.kind + i)}
						{@const prev = [...upds].reverse()[i + 1]}
						<li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
							<span class="w-24 shrink-0 font-mono text-xs text-muted">{day(u.block_time)}</span>
							<span class="w-20 shrink-0 font-mono text-xs text-faint">epoch {u.epoch}</span>
							{#if u.kind === 'retirement'}
								<Badge tone="bad">retiring in epoch {u.retiring_epoch}</Badge>
							{:else}
								<Badge tone={prev ? 'neutral' : 'brand'}>{prev ? 'update' : 'registered'}</Badge>
								<span class={prev && prev.pledge_ada !== u.pledge_ada ? 'font-semibold text-amber' : 'text-muted'}>pledge {adaShort(u.pledge_ada ?? 0)}</span>
								<span class={prev && prev.margin !== u.margin ? 'font-semibold text-amber' : 'text-muted'}>margin {pct(u.margin)}</span>
								<span class={prev && prev.cost_ada !== u.cost_ada ? 'font-semibold text-amber' : 'text-muted'}>cost ₳{u.cost_ada}</span>
								{#if prev && prev.metadata_url !== u.metadata_url}<span class="text-xs text-amber">metadata changed</span>{/if}
								{#if prev && prev.reward_account !== u.reward_account}<span class="text-xs text-amber">reward account changed</span>{/if}
							{/if}
							<a class="ml-auto text-xs text-faint hover:text-brand" href="#/transactions/{u.tx_hash}">tx</a>
						</li>
					{/each}
				</ol>
			</Panel>
		{/if}
	{:catch}
		<!-- an older summary pack without pool_epochs / pool_updates: the page shows the current snapshot only -->
	{/await}
{/if}
