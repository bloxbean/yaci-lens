<script lang="ts">
	import FileCode from '@lucide/svelte/icons/file-code';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Bug from '@lucide/svelte/icons/bug';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';
	import RangePicker, { rangeOf } from '$lib/charts/RangePicker.svelte';
	import { bucket, short, since, seriesColor } from '$lib/charts/series';
	import { lake, live, summaryQuery, summarySql } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { policyInfo } from '$lib/lake/assets';
	import { names } from '$lib/names/names.svelte';
	import { int, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/*
	 * One script: its dApp label (registries), lifetime totals and daily activity (summary pack), purpose mix,
	 * recent executions (one lake partition: the last active day) and links to the validator lab and debugger.
	 */
	const hash = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());
	const label = $derived(names.script(hash));

	interface Totals {
		script_hash: string;
		script_type: number;
		first_date: Date;
		last_date: Date;
		txs: number;
		redeemers: number;
		fees_ada: number;
		active_days: number;
	}
	interface Day {
		date: Date;
		txs: number;
		failed_txs: number;
		fees_ada: number;
		steps: number;
		mem: number;
		spend: number;
		mint: number;
		reward: number;
		other: number;
	}
	interface Exec {
		tx_hash: string;
		purpose: string;
		redeemer_index: number;
		unit_mem: number;
		unit_steps: number;
		block_time: Date;
	}

	let attempt = $state(0);
	const totals = $derived.by(() => {
		attempt;
		return summaryQuery<Totals>(`SELECT * FROM {script_totals} WHERE script_hash = '${hash}'`).then((r) => r[0] ?? null);
	});
	const policy = $derived.by(() => {
		attempt;
		return policyInfo(hash).catch(() => null);
	});

	let range = $state(rangeOf(hashParam('range'), '90d').id);
	const r = $derived(rangeOf(range));
	const daySql = $derived(
		`SELECT date, txs, failed_txs, fees_ada, steps, mem, spend, mint, reward, other FROM {script_daily} WHERE script_hash = '${hash}'${lake.tip?.date && r.days ? ` AND date > DATE '${since(lake.tip.date, r.days)}'` : ''} ORDER BY date`
	);
	const days = $derived.by(() => {
		attempt;
		return summaryQuery<Day>(daySql);
	});

	// Recent executions: the last active day's partition.
	const recent = $derived(
		totals.then((t) =>
			t
				? live<Exec>(
						`SELECT tx_hash, purpose, redeemer_index, unit_mem, unit_steps, block_time FROM transaction_scripts
WHERE date = DATE '${new Date(t.last_date).toISOString().slice(0, 10)}' AND script_hash = '${hash}' ORDER BY slot DESC LIMIT 25`
					).then((rows) => ({ day: new Date(t.last_date).toISOString().slice(0, 10), rows }))
				: null
		)
	);

	const PLUTUS: Record<number, string> = { 1: 'Plutus V1', 2: 'Plutus V2', 3: 'Plutus V3' };
	const sum = (rows: Day[], k: keyof Day) => rows.reduce((a, x) => a + (Number(x[k]) || 0), 0);
</script>

<svelte:head><title>{label?.label ?? `Script ${shorten(hash, 8, 6)}`} · Yaci Lens</title></svelte:head>

<PageHeader kind="Script" title={label?.label ?? shorten(hash, 12, 8)}>
	{#snippet icon()}<FileCode class="h-5 w-5" />{/snippet}
	<div class="flex items-center gap-2">
		<span class="mono break-all text-xs text-faint">{hash}</span>
		<CopyButton value={hash} label="Script hash copied" />
	</div>
	{#if label}
		<p class="mt-1 text-sm text-muted">
			{label.project}{label.category ? ` · ${label.category.replaceAll('_', ' ').toLowerCase()}` : ''} · label from {label.source === 'strica' ? "Strica's Cardano Contracts Registry" : "Cardano Fans' dApp registry"}
		</p>
	{/if}
	{#snippet actions()}
		{#await totals then t}{#if t}<Badge tone="violet">{PLUTUS[t.script_type] ?? 'Plutus'}</Badge>{/if}{/await}
		{#if label?.url}<a class="y-btn h-8 text-xs" href={label.url} target="_blank" rel="noopener noreferrer nofollow">Website<ExternalLink class="h-3.5 w-3.5" /></a>{/if}
		<a class="y-btn y-btn-primary h-8 text-xs" href="#/lab?script={hash}"><FlaskConical class="h-3.5 w-3.5" />Open in the validator lab</a>
	{/snippet}
</PageHeader>

{#await totals}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
{:then t}
	{#if !t}
		<div class="y-panel mb-6 p-6 text-sm text-muted">
			No Plutus executions of this script in the published data. It may be a native (multisig) script or a minting policy without a Plutus redeemer.
			{#await policy then p}{#if p}<a class="y-link" href="#/assets/policy/{hash}">It is a minting policy with {p.units} asset(s).</a>{/if}{/await}
		</div>
	{:else}
		<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
			<Stat label="Transactions" value={short(t.txs)} sub={`${short(t.redeemers)} redeemers, all time`} />
			<Stat label="Fees of its transactions" value="₳{short(t.fees_ada)}" sub={`₳${(t.fees_ada / Math.max(1, t.txs)).toFixed(3)} per transaction`} color="rgb(var(--c-mint))" />
			<Stat label="Active days" value={int(t.active_days)} sub={`since ${new Date(t.first_date).toISOString().slice(0, 10)}`} color="rgb(var(--c-violet))" />
			<Stat label="Last used" value={new Date(t.last_date).toISOString().slice(0, 10)} color="rgb(var(--c-blue))">
				{#await policy then p}{#if p}<a class="y-link text-xs" href="#/assets/policy/{hash}">Minting policy · {short(p.units)} assets</a>{/if}{/await}
			</Stat>
		</section>
	{/if}
{:catch e}
	<div class="y-panel mb-6"><ErrorBox title="Couldn't load the script" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}

<Panel title="Activity" sub="Transactions running this script, and those where a script failed" class="mb-6">
	{#snippet actions()}
		<div class="flex items-center gap-2"><RangePicker bind:value={range} /><SqlButton sql={summarySql(daySql)} /></div>
	{/snippet}
	{#await days}
		<Skeleton rows={5} />
	{:then rows}
		{@const b = bucket(rows, ['txs', 'failed_txs', 'fees_ada', 'steps'], r.days)}
		<SeriesChart
			x={b.map((x) => x.label)}
			series={[
				{ name: 'Succeeded', values: b.map((x) => x.values.txs - x.values.failed_txs), slot: 0 },
				{ name: 'Failed (collateral taken)', values: b.map((x) => x.values.failed_txs), color: 'rgb(var(--c-danger))' }
			]}
			kind="stacked"
			height={190}
			label="Transactions per period, succeeded and failed"
		/>
		<div class="mt-6 grid gap-6 lg:grid-cols-2">
			<div>
				<div class="y-label mb-2">What it was run for</div>
				<SplitBar
					parts={[
						{ label: 'Spend', value: sum(rows, 'spend')::DOUBLE, color: seriesColor(0) },
						{ label: 'Mint', value: sum(rows, 'mint')::DOUBLE, color: seriesColor(1) },
						{ label: 'Withdraw (reward)', value: sum(rows, 'reward')::DOUBLE, color: seriesColor(2) },
						{ label: 'Other (cert, vote, propose)', value: sum(rows, 'other')::DOUBLE, color: seriesColor(3) }
					]}
				/>
			</div>
			<div>
				<div class="y-label mb-2">Average cost per transaction</div>
				<dl class="grid grid-cols-3 gap-4 text-sm">
					<div><dt class="text-xs text-muted">Fee</dt><dd class="font-semibold tabular-nums">₳{(sum(rows, 'fees_ada')::DOUBLE / Math.max(1, sum(rows, 'txs')::DOUBLE)).toFixed(3)}</dd></div>
					<div><dt class="text-xs text-muted">CPU steps</dt><dd class="font-semibold tabular-nums">{short(sum(rows, 'steps')::DOUBLE / Math.max(1, sum(rows, 'txs')::DOUBLE))}</dd></div>
					<div><dt class="text-xs text-muted">Memory</dt><dd class="font-semibold tabular-nums">{short(sum(rows, 'mem')::DOUBLE / Math.max(1, sum(rows, 'txs')::DOUBLE))}</dd></div>
				</dl>
			</div>
		</div>
	{:catch e}
		<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
	{/await}
</Panel>

<Panel title="Recent executions" sub="On the last day it was used · debug any of them with the transaction's real context" flush>
	{#await recent}
		<Skeleton rows={6} />
	{:then rec}
		{#if !rec || !rec.rows.length}
			<p class="p-5 text-sm text-muted">None.</p>
		{:else}
			<ul class="divide-y divide-line/70">
				{#each rec.rows as x (x.tx_hash + x.purpose + x.redeemer_index)}
					<li class="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
						<a class="y-link mono text-xs" href="#/transactions/{x.tx_hash}?date={rec.day}">{shorten(x.tx_hash, 12, 8)}</a>
						<Badge tone="neutral">{x.purpose.toLowerCase()} #{x.redeemer_index}</Badge>
						<span class="text-xs text-faint">{utc(x.block_time)}</span>
						<span class="ml-auto text-xs tabular-nums text-muted">{short(x.unit_steps)} steps · {short(x.unit_mem)} mem</span>
						<a class="y-btn h-7 px-2 text-xs" href="#/transactions/{x.tx_hash}/debug/{x.purpose.toLowerCase()}/{x.redeemer_index}?date={rec.day}"><Bug class="h-3.5 w-3.5" />Debug</a>
					</li>
				{/each}
			</ul>
		{/if}
	{:catch e}
		<ErrorBox title="Query failed" message={String(e?.message ?? e)} />
	{/await}
</Panel>
