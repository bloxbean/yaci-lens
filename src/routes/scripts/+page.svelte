<script lang="ts">
	import FileCode from '@lucide/svelte/icons/file-code';
	import Search from '@lucide/svelte/icons/search';
	import Activity from '@lucide/svelte/icons/activity';
	import Coins from '@lucide/svelte/icons/coins';
	import Cpu from '@lucide/svelte/icons/cpu';
	import Boxes from '@lucide/svelte/icons/boxes';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import NameTag from '$lib/names/NameTag.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import BarList from '$lib/charts/BarList.svelte';
	import RangePicker, { rangeOf } from '$lib/charts/RangePicker.svelte';
	import { bucket, short, since } from '$lib/charts/series';
	import { lake, summaryQuery, summarySql } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { names } from '$lib/names/names.svelte';
	import { shorten } from '$lib/format';

	/*
	 * Smart-contract analytics: which Plutus scripts and dApps are used, by transactions, fees, execution units
	 * and failures, over a chosen range. Per-script daily totals come from the summary pack (script_daily); dApp
	 * names from Strica's and Cardano Fans' registries (script_names). Fees of a transaction count for every script
	 * it ran.
	 */
	let range = $state(rangeOf(hashParam('range'), '30d').id);
	const r = $derived(rangeOf(range));
	const from = $derived(lake.tip?.date && r.days ? since(lake.tip.date, r.days) : '1900-01-01');
	const where = $derived(`date > DATE '${from}'`);

	type Metric = 'txs' | 'fees_ada' | 'steps' | 'failed_txs';
	const METRICS: { id: Metric; label: string; fmt: (v: number) => string }[] = [
		{ id: 'txs', label: 'Transactions', fmt: (v) => short(v) },
		{ id: 'fees_ada', label: 'Fees', fmt: (v) => `₳${short(v)}` },
		{ id: 'steps', label: 'CPU steps', fmt: (v) => short(v) },
		{ id: 'failed_txs', label: 'Failures', fmt: (v) => short(v) }
	];
	let metric = $state<Metric>((hashParam('by') as Metric) ?? 'txs');
	const m = $derived(METRICS.find((x) => x.id === metric) ?? METRICS[0]);

	interface Day {
		date: Date;
		txs: number;
		fees_ada: number;
		v1: number;
		v2: number;
		v3: number;
		scripts: number;
	}
	interface Top {
		script_hash: string;
		script_type: number;
		value: number;
		txs: number;
	}
	interface DApp {
		project: string;
		category: string | null;
		value: number;
		scripts: number;
	}

	const daySql = $derived(`SELECT date, sum(txs)::DOUBLE AS txs, sum(fees_ada)::DOUBLE AS fees_ada,
  sum(txs) FILTER (WHERE script_type = 1)::DOUBLE AS v1, sum(txs) FILTER (WHERE script_type = 2)::DOUBLE AS v2, sum(txs) FILTER (WHERE script_type = 3)::DOUBLE AS v3,
  count(*)::DOUBLE AS scripts
FROM {script_daily} WHERE ${where} GROUP BY 1 ORDER BY 1`);
	const topSql = $derived(`SELECT script_hash, any_value(script_type) AS script_type, sum(${metric})::DOUBLE AS value, sum(txs)::DOUBLE AS txs
FROM {script_daily} WHERE ${where} GROUP BY 1 HAVING sum(${metric})::DOUBLE > 0 ORDER BY value DESC LIMIT 20`);
	const dappSql = $derived(`SELECT n.project, any_value(n.category) AS category, sum(d.${metric})::DOUBLE AS value, count(DISTINCT d.script_hash)::DOUBLE AS scripts
FROM {script_daily} d JOIN {script_names} n USING (script_hash) WHERE ${where.replace('date', 'd.date')}
GROUP BY 1 HAVING sum(d.${metric})::DOUBLE > 0 ORDER BY value DESC LIMIT 15`);
	const top5Sql = $derived(`SELECT n.project FROM {script_daily} d JOIN {script_names} n USING (script_hash) WHERE ${where.replace('date', 'd.date')}
GROUP BY 1 ORDER BY sum(d.txs)::DOUBLE DESC LIMIT 5`);
	const trendSql = $derived(`SELECT d.date, coalesce(n.project, 'Unlabelled') AS project, sum(d.txs)::DOUBLE AS txs
FROM {script_daily} d LEFT JOIN {script_names} n USING (script_hash)
WHERE ${where.replace('date', 'd.date')} GROUP BY ALL ORDER BY 1`);

	let attempt = $state(0);
	const days = $derived.by(() => {
		attempt;
		return summaryQuery<Day>(daySql);
	});
	const top = $derived.by(() => {
		attempt;
		return summaryQuery<Top>(topSql);
	});
	const dapps = $derived.by(() => {
		attempt;
		return summaryQuery<DApp>(dappSql);
	});
	const trend = $derived.by(() => {
		attempt;
		return Promise.all([summaryQuery<{ project: string }>(top5Sql), summaryQuery<{ date: Date; project: string; txs: number }>(trendSql)]);
	});

	// ---- search: a script hash, or a dApp name from the registries ---------------------------------------------
	let text = $state('');
	const matches = $derived.by(() => {
		const t = text.trim().toLowerCase();
		if (t.length < 2 || /^[0-9a-f]{56}$/.test(t) || !names.scripts) return [];
		const out: { hash: string; label: string; project: string }[] = [];
		for (const [hash, s] of names.scripts) {
			if (s.label.toLowerCase().includes(t) || s.project.toLowerCase().includes(t)) out.push({ hash, label: s.label, project: s.project });
			if (out.length >= 12) break;
		}
		return out;
	});
	$effect(() => void names.script(null));
	function submit(e: Event) {
		e.preventDefault();
		const t = text.trim().toLowerCase();
		if (/^[0-9a-f]{56}$/.test(t)) goto(`#/scripts/${t}`);
		else if (matches[0]) goto(`#/scripts/${matches[0].hash}`);
	}

	const PLUTUS: Record<number, string> = { 1: 'V1', 2: 'V2', 3: 'V3' };
	const cat = (c: string | null) => (c ? c.replaceAll('_', ' ').toLowerCase() : '');
</script>

<svelte:head><title>Scripts · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Smart contracts">
	{#snippet icon()}<FileCode class="h-5 w-5" />{/snippet}
	{#snippet actions()}<RangePicker bind:value={range} />{/snippet}
	Plutus scripts and the dApps behind them: how much they are used, what they cost and how often they fail. dApp names come from Strica's Cardano Contracts
	Registry and Cardano Fans' dApp registry.
</PageHeader>

<section class="y-panel relative mb-6 p-5">
	<form class="flex gap-2" onsubmit={submit}>
		<label class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
			<input class="y-input h-11 w-full pl-9" placeholder="Script hash (56 hex) or dApp name, e.g. Minswap, Liqwid, Indigo" bind:value={text} spellcheck="false" aria-label="Search scripts" />
		</label>
		<button class="y-btn y-btn-primary h-11 px-5">Open</button>
	</form>
	{#if matches.length}
		<ul class="mt-3 grid gap-1 sm:grid-cols-2">
			{#each matches as s (s.hash)}
				<li><a class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2" href="#/scripts/{s.hash}"><span class="font-medium">{s.label}</span><span class="mono ml-auto text-xs text-faint">{shorten(s.hash, 6, 4)}</span></a></li>
			{/each}
		</ul>
	{/if}
</section>

{#await days}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel mb-6"><Skeleton rows={6} /></div>
{:then rows}
	{@const b = bucket(rows, ['txs', 'v1', 'v2', 'v3', 'fees_ada'], r.days)}
	{@const total = rows.reduce((a, x) => a + x.txs, 0)}
	{@const fees = rows.reduce((a, x) => a + x.fees_ada, 0)}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="Script executions" value={short(total)} sub={`transaction × script pairs, ${r.days ? `last ${r.label.toLowerCase()}` : 'all time'}`} trend={rows.slice(-60).map((x) => x.txs)}>
			{#snippet icon()}<Activity class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Fees of script transactions" value="₳{short(fees)}" sub="per script, so shared transactions count more than once" trend={rows.slice(-60).map((x) => x.fees_ada)} color="rgb(var(--c-mint))">
			{#snippet icon()}<Coins class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Active scripts per day" value={short(rows.length ? rows.reduce((a, x) => a + x.scripts, 0) / rows.length : 0)} sub="average" trend={rows.slice(-60).map((x) => x.scripts)} color="rgb(var(--c-violet))">
			{#snippet icon()}<Boxes class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Plutus V3 share" value={total ? `${((rows.reduce((a, x) => a + (x.v3 || 0), 0) / total) * 100).toFixed(1)}%` : '—'} sub="of script executions" color="rgb(var(--c-blue))">
			{#snippet icon()}<Cpu class="h-4 w-4" />{/snippet}
		</Stat>
	</section>
	<Panel title="Script executions by Plutus version" sub={`${b.length && b[0].label.startsWith('wk') ? 'Per week' : b.length && b[0].label.length === 7 ? 'Per month' : 'Per day'}`} class="mb-6">
		{#snippet actions()}<SqlButton sql={summarySql(daySql)} />{/snippet}
		<SeriesChart
			x={b.map((x) => x.label)}
			series={[
				{ name: 'Plutus V1', values: b.map((x) => x.values.v1), slot: 4 },
				{ name: 'Plutus V2', values: b.map((x) => x.values.v2), slot: 0 },
				{ name: 'Plutus V3', values: b.map((x) => x.values.v3), slot: 2 }
			]}
			kind="stacked"
			height={200}
			label="Script executions by Plutus version"
		/>
	</Panel>
{:catch e}
	<div class="y-panel mb-6"><ErrorBox title="Couldn't load script activity" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}

<div class="mb-4 flex flex-wrap items-center gap-2">
	<span class="text-sm text-muted">Rank by</span>
	<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5">
		{#each METRICS as x (x.id)}
			<button class="rounded-[10px] px-2.5 py-1 text-xs font-medium {metric === x.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}" onclick={() => (metric = x.id)}>{x.label}</button>
		{/each}
	</div>
</div>

<section class="mb-6 grid gap-6 xl:grid-cols-2">
	<Panel title="Top dApps" sub={`${m.label}, ${r.days ? `last ${r.label.toLowerCase()}` : 'all time'} · labelled scripts only`}>
		{#snippet actions()}<SqlButton sql={summarySql(dappSql)} />{/snippet}
		{#await dapps}
			<Skeleton rows={8} />
		{:then rows}
			<BarList {rows} value={(d) => d.value} format={m.fmt} color="var(--s2)" extra={(d) => `${cat(d.category)}${d.scripts > 1 ? ` · ${d.scripts} scripts` : ''}`}>
				{#snippet label(d)}<span class="font-medium">{d.project}</span>{/snippet}
			</BarList>
		{:catch e}
			<ErrorBox title="Query failed" message={String(e?.message ?? e)} />
		{/await}
	</Panel>
	<Panel title="Top scripts" sub={`${m.label}, ${r.days ? `last ${r.label.toLowerCase()}` : 'all time'}`}>
		{#snippet actions()}<SqlButton sql={summarySql(topSql)} />{/snippet}
		{#await top}
			<Skeleton rows={8} />
		{:then rows}
			<BarList {rows} value={(s) => s.value} format={m.fmt} href={(s) => `#/scripts/${s.script_hash}`} extra={(s) => `Plutus ${PLUTUS[s.script_type] ?? '?'}`}>
				{#snippet label(s)}
					{@const n = names.script(s.script_hash)}
					{#if n}<span class="font-medium">{n.label}</span>{:else}<span class="mono text-xs">{shorten(s.script_hash, 10, 8)}</span>{/if}
				{/snippet}
			</BarList>
		{:catch e}
			<ErrorBox title="Query failed" message={String(e?.message ?? e)} />
		{/await}
	</Panel>
</section>

<Panel title="Top dApps over time" sub="Script executions of the five busiest labelled dApps, and everything else">
	{#snippet actions()}<SqlButton sql={summarySql(trendSql)} />{/snippet}
	{#await trend}
		<Skeleton rows={6} />
	{:then [topProjects, rows]}
		{@const names5 = topProjects.map((p) => p.project)}
		{@const keys = [...names5, 'Other']}
		{@const byDay = Object.values(
			rows.reduce<Record<string, { date: Date } & Record<string, number>>>((acc, x) => {
				const k = new Date(x.date).toISOString().slice(0, 10);
				const row = (acc[k] ??= Object.assign({ date: x.date }, Object.fromEntries(keys.map((n) => [n, 0]))) as { date: Date } & Record<string, number>);
				row[names5.includes(x.project) ? x.project : 'Other'] += x.txs;
				return acc;
			}, {})
		)}
		{@const b = bucket(byDay, keys as never[], r.days)}
		<SeriesChart x={b.map((x) => x.label)} series={keys.map((k, i) => ({ name: k, values: b.map((x) => x.values[k]), slot: k === 'Other' ? 99 : i }))} kind="stacked" height={220} label="Script executions per dApp" />
	{:catch e}
		<ErrorBox title="Query failed" message={String(e?.message ?? e)} />
	{/await}
</Panel>
