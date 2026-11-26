<script lang="ts">
	import Fish from '@lucide/svelte/icons/fish';
	import Activity from '@lucide/svelte/icons/activity';
	import PieChart from '@lucide/svelte/icons/chart-pie';
	import Users from '@lucide/svelte/icons/users';
	import Search from '@lucide/svelte/icons/search';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Info from '@lucide/svelte/icons/info';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import Sparkline from '$lib/ui/Sparkline.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import BarList from '$lib/charts/BarList.svelte';
	import PoolName from '$lib/names/PoolName.svelte';
	import { short } from '$lib/charts/series';
	import { summary, summaryUrl } from '$lib/lake/lake.svelte';
	import { names } from '$lib/names/names.svelte';
	import { adaShort } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/*
	 * Whales: the 1,000 largest stake accounts by ADA held in UTxOs under their stake key (summary pack: whales,
	 * whale_daily, whale_stats, built daily by the publisher from stake_address_balance). Accounts that don't
	 * delegate are included; addresses without a stake key are not. One account is not one owner.
	 */
	interface Whale {
		rank: number;
		address: string;
		balance_ada: number;
		share: number;
		rewards_ada: number;
		pool_id: string | null;
		live_stake_ada: number | null;
		drep: string | null;
		drep_hash: string | null;
		last_change: Date;
		first_seen: Date;
		change_1d_ada: number | null;
		change_7d_ada: number | null;
		change_30d_ada: number | null;
		changes_30d: number;
		active_days_30d: number;
	}
	interface Stats {
		date: Date;
		accounts: number;
		total_ada: number;
		top10_ada: number;
		top100_ada: number;
		top1000_ada: number;
		n_1k: number;
		n_10k: number;
		n_100k: number;
		n_1m: number;
		n_10m: number;
		n_100m: number;
	}
	interface Day {
		date: Date;
		address: string;
		balance_ada: number | null;
	}

	function load() {
		return Promise.all([summary<Whale>('whales'), summary<Stats>('whale_stats'), summary<Day>('whale_daily')]).then(([whales, [stats], days]) => {
			const series = new Map<string, number[]>();
			const dates: string[] = [];
			for (const d of days) {
				const k = new Date(d.date).toISOString().slice(0, 10);
				if (dates[dates.length - 1] !== k) dates.push(k);
				(series.get(d.address) ?? series.set(d.address, []).get(d.address)!).push(d.balance_ada ?? 0);
			}
			const rank = new Map(whales.map((w) => [w.address, w.rank]));
			// Totals of today's top 10 and top 100 on each of the last 90 days
			const top10 = dates.map((_, i) => whales.filter((w) => w.rank <= 10).reduce((a, w) => a + (series.get(w.address)?.[i] ?? 0), 0));
			const top100 = dates.map((_, i) => whales.filter((w) => w.rank <= 100).reduce((a, w) => a + (series.get(w.address)?.[i] ?? 0), 0));
			return { whales, stats, series, dates, top10, top100, rank };
		});
	}
	let data = $state(load());

	type Deleg = 'all' | 'delegated' | 'not';
	type Moved = 'any' | '1' | '7' | '30';
	let deleg = $state<Deleg>('all');
	let moved = $state<Moved>('any');
	let q = $state('');
	let limit = $state(100);
	let open = $state<string | null>(null);

	const daysSince = (d: Date, tip: Date) => Math.round((Date.parse(new Date(tip).toISOString().slice(0, 10)) - Date.parse(new Date(d).toISOString().slice(0, 10))) / 86_400_000);
	const signed = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${adaShort(Math.abs(v))}`);
	const tone = (v: number | null) => (v == null || v === 0 ? 'text-faint' : v > 0 ? 'text-mint' : 'text-danger');
	const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
	function lastMoved(days: number) {
		if (days <= 0) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 30) return `${days} days ago`;
		if (days < 365) return `${Math.round(days / 30)} months ago`;
		return `${(days / 365).toFixed(1)} years ago`;
	}
	const drepLabel = (w: Whale) =>
		w.drep_hash ? (names.drep(w.drep_hash) ?? shorten(w.drep ?? w.drep_hash, 10, 6)) : w.drep === 'ABSTAIN' ? 'Always abstain' : w.drep === 'NO_CONFIDENCE' ? 'No confidence' : null;
</script>

<svelte:head><title>Whales · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Whales">
	{#snippet icon()}<Fish class="h-5 w-5" />{/snippet}
	The 1,000 largest stake accounts by ADA held under their stake key, whether they delegate or not: how much they hold, where they delegate, and
	whether they moved recently.
</PageHeader>

{#await data}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel"><Skeleton rows={12} /></div>
{:then d}
	{@const s = d.stats}
	{@const tip = s.date}
	{@const ws = d.whales}
	{@const moved1 = ws.filter((w) => daysSince(w.last_change, tip) < 1).length}
	{@const moved7 = ws.filter((w) => daysSince(w.last_change, tip) < 7).length}
	{@const moved30 = ws.filter((w) => daysSince(w.last_change, tip) < 30).length}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="Top 10 accounts hold" value={pct(s.top10_ada / s.total_ada)} sub={`${adaShort(s.top10_ada)} of ${adaShort(s.total_ada)} in stake accounts`} trend={d.top10}>
			{#snippet icon()}<PieChart class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Top 100 accounts hold" value={pct(s.top100_ada / s.total_ada)} sub={`${adaShort(s.top100_ada)} · top 1,000: ${pct(s.top1000_ada / s.total_ada)}`} trend={d.top100} color="rgb(var(--c-violet))">
			{#snippet icon()}<Fish class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Whales that moved" value={`${moved1} · ${moved7} · ${moved30}`} sub="of the top 1,000: last 24 h · 7 days · 30 days" color="rgb(var(--c-mint))">
			{#snippet icon()}<Activity class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Accounts with 1M+ ADA" value={short(s.n_1m)} sub={`${short(s.n_10m)} with 10M+ · ${s.n_100m} with 100M+ · of ${short(s.accounts)} non-empty`} color="rgb(var(--c-blue))">
			{#snippet icon()}<Users class="h-4 w-4" />{/snippet}
		</Stat>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
		<Panel title="What the largest accounts hold" sub="Today's top 10 and top 100 accounts, at the end of each of the last 90 days">
			{#snippet actions()}<SqlButton sql={`SELECT date, sum(balance_ada) AS balance_ada\nFROM '${summaryUrl('whale_daily')}'\nGROUP BY 1 ORDER BY 1`} />{/snippet}
			<SeriesChart
				x={d.dates}
				series={[
					{ name: 'Top 100', values: d.top100, slot: 0 },
					{ name: 'Top 10', values: d.top10, slot: 1 }
				]}
				kind="line"
				height={200}
				format={(v) => adaShort(v)}
				label="Balance of the top 10 and top 100 accounts over 90 days"
			/>
		</Panel>
		<Panel title="How many accounts hold at least…" sub={`All ${short(s.accounts)} non-empty stake accounts`}>
			{#snippet actions()}<SqlButton sql={`SELECT * FROM '${summaryUrl('whale_stats')}'`} />{/snippet}
			<BarList
				rows={[
					{ label: '1,000 ADA', n: s.n_1k },
					{ label: '10,000 ADA', n: s.n_10k },
					{ label: '100,000 ADA', n: s.n_100k },
					{ label: '1 million ADA', n: s.n_1m },
					{ label: '10 million ADA', n: s.n_10m },
					{ label: '100 million ADA', n: s.n_100m }
				]}
				value={(r) => r.n}
				color="var(--s4)"
				format={(v) => v.toLocaleString('en-US')}
			>
				{#snippet label(r)}<span class="font-medium">{r.label}</span>{/snippet}
			</BarList>
		</Panel>
	</section>

	{@const f = q.trim().toLowerCase()}
	{@const rows = ws.filter(
		(w) =>
			(deleg === 'all' || (deleg === 'delegated' ? !!w.pool_id : !w.pool_id)) &&
			(moved === 'any' || daysSince(w.last_change, tip) < Number(moved)) &&
			(!f || w.address.includes(f) || (w.pool_id ?? '').includes(f))
	)}
	<Panel flush title="The largest stake accounts" sub={`Balances as of ${new Date(tip).toISOString().slice(0, 10)} (UTC) · ${rows.length.toLocaleString('en-US')} shown of 1,000`}>
		{#snippet actions()}<SqlButton sql={`SELECT * FROM '${summaryUrl('whales')}' ORDER BY rank`} />{/snippet}
		<div class="flex flex-wrap items-center gap-2 border-b border-line/70 px-5 py-3">
			<label class="relative">
				<Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
				<input class="y-input h-8 w-60 pl-8 text-xs" placeholder="Stake address or pool id" bind:value={q} aria-label="Filter accounts" spellcheck="false" />
			</label>
			<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5">
				{#each [['all', 'All'], ['delegated', 'Delegating'], ['not', 'Not delegating']] as [id, label] (id)}
					<button class="rounded-[10px] px-2.5 py-1 text-xs font-medium {deleg === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}" onclick={() => (deleg = id as Deleg)}>{label}</button>
				{/each}
			</div>
			<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5">
				{#each [['any', 'Any time'], ['1', 'Moved 24 h'], ['7', '7 days'], ['30', '30 days']] as [id, label] (id)}
					<button class="rounded-[10px] px-2.5 py-1 text-xs font-medium {moved === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}" onclick={() => (moved = id as Moved)}>{label}</button>
				{/each}
			</div>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-line text-left">
						<th class="y-label py-2.5 pl-5 pr-3">#</th>
						<th class="y-label py-2.5 pr-4">Stake account</th>
						<th class="y-label py-2.5 pr-4 text-right">Balance</th>
						<th class="y-label py-2.5 pr-4 text-right">Share</th>
						<th class="y-label py-2.5 pr-4 text-right">7 days</th>
						<th class="y-label py-2.5 pr-4 text-right">30 days</th>
						<th class="y-label py-2.5 pr-4">Delegates to</th>
						<th class="y-label py-2.5 pr-4">Last moved</th>
						<th class="y-label py-2.5 pr-5">90 days</th>
					</tr>
				</thead>
				<tbody>
					{#each rows.slice(0, limit) as w (w.address)}
						{@const ago = daysSince(w.last_change, tip)}
						{@const isOpen = open === w.address}
						<tr class="cursor-pointer border-b border-line/60 hover:bg-surface-2/60 {isOpen ? 'bg-surface-2/60' : ''}" onclick={() => (open = isOpen ? null : w.address)}>
							<td class="py-2.5 pl-5 pr-3 tabular-nums text-faint">{w.rank}</td>
							<td class="py-2.5 pr-4"><span class="mono text-xs" title={w.address}>{shorten(w.address, 12, 6)}</span></td>
							<td class="py-2.5 pr-4 text-right font-semibold tabular-nums">{adaShort(w.balance_ada)}</td>
							<td class="py-2.5 pr-4 text-right tabular-nums text-muted">{(w.share * 100).toFixed(2)}%</td>
							<td class="py-2.5 pr-4 text-right tabular-nums {tone(w.change_7d_ada)}">{signed(w.change_7d_ada)}</td>
							<td class="py-2.5 pr-4 text-right tabular-nums {tone(w.change_30d_ada)}">{signed(w.change_30d_ada)}</td>
							<td class="py-2.5 pr-4">
								{#if w.pool_id}<span role="presentation" onclick={(e) => e.stopPropagation()}><PoolName hash={w.pool_id} /></span>{:else}<Badge tone="neutral">not delegating</Badge>{/if}
							</td>
							<td class="py-2.5 pr-4 whitespace-nowrap">
								<span class="inline-flex items-center gap-1.5 text-xs {ago < 1 ? 'text-mint' : ago < 7 ? 'text-ink' : 'text-muted'}">
									{#if ago < 7}<span class="h-1.5 w-1.5 rounded-full {ago < 1 ? 'bg-mint' : 'bg-amber'}"></span>{/if}{lastMoved(ago)}
								</span>
							</td>
							<td class="py-1.5 pr-5"><Sparkline values={d.series.get(w.address) ?? []} width={90} height={24} color={(w.change_30d_ada ?? 0) >= 0 ? 'rgb(var(--c-mint))' : 'rgb(var(--c-danger))'} /></td>
						</tr>
						{#if isOpen}
							<tr class="border-b border-line/60 bg-surface-2/40">
								<td></td>
								<td colspan="8" class="py-4 pr-5">
									<div class="mb-3 flex items-center gap-2"><span class="mono break-all text-xs">{w.address}</span><CopyButton value={w.address} label="Stake address copied" /></div>
									<dl class="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
										<div><dt class="y-label">Unwithdrawn rewards</dt><dd class="tabular-nums">{adaShort(w.rewards_ada)}</dd></div>
										<div><dt class="y-label">Ledger stake (latest snapshot)</dt><dd class="tabular-nums">{w.live_stake_ada != null ? adaShort(w.live_stake_ada) : 'not delegating'}</dd></div>
										<div><dt class="y-label">Change in 24 hours</dt><dd class="tabular-nums {tone(w.change_1d_ada)}">{signed(w.change_1d_ada)}</dd></div>
										<div><dt class="y-label">Activity, last 30 days</dt><dd>{w.active_days_30d} active days · {w.changes_30d} balance changes</dd></div>
										<div><dt class="y-label">DRep</dt><dd>{#if w.drep_hash}<a class="y-link" href="#/governance/dreps/{w.drep ?? w.drep_hash}">{drepLabel(w)}</a>{:else}{drepLabel(w) ?? 'none'}{/if}</dd></div>
										<div><dt class="y-label">First seen</dt><dd>{new Date(w.first_seen).getUTCFullYear() < 2017 ? 'at genesis' : new Date(w.first_seen).toISOString().slice(0, 10)}</dd></div>
										<div><dt class="y-label">Last balance change</dt><dd>{new Date(w.last_change).toISOString().slice(0, 10)}</dd></div>
										<div><dt class="y-label">Pool</dt><dd>{#if w.pool_id}<PoolName hash={w.pool_id} />{:else}—{/if}</dd></div>
									</dl>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
		<div class="flex items-center justify-between border-t border-line/70 px-5 py-3 text-xs text-muted">
			<span>Click a row for rewards, ledger stake, DRep and activity.</span>
			{#if rows.length > limit}<button class="y-btn h-8 text-xs" onclick={() => (limit = 1000)}>Show all {rows.length.toLocaleString('en-US')}</button>{/if}
		</div>
	</Panel>

	<div class="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
		<Info class="mt-0.5 h-4 w-4 shrink-0" />
		<span>
			Balance is the ADA in UTxOs under a stake key (Yaci Store's stake address balances); unwithdrawn rewards are listed separately. Addresses
			without a stake key aren't counted, and one account is not one owner: exchanges and custodians hold large accounts for many people, and one
			owner can spread funds over many accounts. "Moved" means the balance changed: a transaction sent or received ADA, or rewards were withdrawn.
		</span>
	</div>
{:catch e}
	<ErrorBox title="Couldn't load whales" message={`${String(e?.message ?? e)}. The whales summary is published by the daily job; it may not exist yet.`} retry={() => (data = load())} />
{/await}
