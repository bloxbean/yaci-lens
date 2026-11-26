<script lang="ts">
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileCode from '@lucide/svelte/icons/file-code';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import { replaceState } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import { lake, live, summary, day } from '$lib/lake/lake.svelte';
	import { hashParam, hashWith } from '$lib/lake/links';
	import type { Daily } from '$lib/lake/types';
	import { int } from '$lib/cardano';
	import { ada, shorten } from '$lib/format';

	/*
	 * Transactions, newest first, one UTC day at a time (the lake is partitioned by day, so a day is one read).
	 * The chart above picks the day; filters narrow to smart-contract, metadata or failed transactions.
	 */
	const PAGE = 50;
	type Filter = 'all' | 'scripts' | 'metadata' | 'failed';
	const FILTERS: { id: Filter; label: string; where: string }[] = [
		{ id: 'all', label: 'All', where: '' },
		{ id: 'scripts', label: 'Smart contract', where: 'AND script_datahash IS NOT NULL' },
		{ id: 'metadata', label: 'With metadata', where: 'AND auxiliary_datahash IS NOT NULL' },
		{ id: 'failed', label: 'Failed scripts', where: 'AND invalid' }
	];

	const recent = summary<Daily>('daily', 'ORDER BY date DESC LIMIT 60');

	let date = $state<string | null>(hashParam('date'));
	let filter = $state<Filter>((hashParam('filter') as Filter) ?? 'all');
	let offset = $state(Number(hashParam('page') ?? 0) * PAGE || 0);
	$effect(() => {
		if (!date && lake.tip?.date) date = day(lake.tip.date);
	});

	interface Row {
		tx_hash: string;
		block: number;
		block_time: Date;
		tx_index: number;
		fee: number;
		invalid: boolean;
		n_in: number;
		n_out: number;
		script: boolean;
		meta: boolean;
	}
	interface OutSum {
		tx_hash: string;
		lovelace: string;
		tokens: number;
	}

	const where = $derived(FILTERS.find((f) => f.id === filter)?.where ?? '');
	const sql = $derived(
		date
			? `SELECT tx_hash, block, block_time, tx_index, fee, invalid, json_array_length(inputs) AS n_in, json_array_length(outputs) AS n_out,
       script_datahash IS NOT NULL AS script, auxiliary_datahash IS NOT NULL AS meta
FROM transaction WHERE date = DATE '${date}' ${where}
ORDER BY slot DESC, tx_index DESC LIMIT ${PAGE} OFFSET ${offset}`
			: null
	);
	let attempt = $state(0);
	const page = $derived.by(() => {
		attempt;
		if (!sql || !date) return null;
		const d = date;
		return live<Row>(sql).then(async (rows) => {
			const sums = rows.length
				? await live<OutSum>(
						`SELECT tx_hash, sum(quantity) FILTER (WHERE asset_unit = 'lovelace')::VARCHAR AS lovelace, count(DISTINCT asset_unit) FILTER (WHERE asset_unit <> 'lovelace') AS tokens
FROM address_utxo WHERE date = DATE '${d}' AND NOT coalesce(is_collateral_return, false) AND tx_hash IN (${rows.map((r) => `'${r.tx_hash}'`).join(', ')}) GROUP BY 1`
					)
				: [];
			const by = new Map(sums.map((s) => [s.tx_hash, s]));
			return rows.map((r) => ({ ...r, out: by.get(r.tx_hash) }));
		});
	});

	function go(changes: { date?: string; filter?: Filter; offset?: number }) {
		if (changes.date !== undefined) date = changes.date;
		if (changes.filter !== undefined) filter = changes.filter;
		offset = changes.offset ?? 0;
		replaceState(hashWith({ date, filter: filter === 'all' ? null : filter, page: offset ? String(offset / PAGE) : null }), {});
	}
	const shift = (d: string, n: number) => day(new Date(Date.parse(d) + n * 86_400_000));
</script>

<svelte:head><title>Transactions · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Transactions">
	{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
	Every transaction of a UTC day, newest first. Pick a day on the chart or with the date field; open any transaction for its inputs, outputs, scripts
	and metadata.
</PageHeader>

{#await recent}
	<div class="y-panel mb-6"><Skeleton rows={5} /></div>
{:then rows}
	{@const days = [...rows].reverse()}
	{@const sel = rows.find((r) => day(r.date) === date)}
	<section class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<Stat label="Transactions on {date ?? '…'}" value={sel ? int(sel.txs) : '—'} />
		<Stat label="Smart-contract txs" value={sel ? int(sel.script_txs) : '—'} sub={sel && sel.txs ? `${((sel.script_txs / sel.txs) * 100).toFixed(1)}% of the day` : ''} />
		<Stat label="Fees" value={sel ? `₳${Math.round(sel.fees_ada).toLocaleString('en-US')}` : '—'} sub={sel && sel.txs ? `₳${(sel.fees_ada / sel.txs).toFixed(3)} per tx` : ''} />
		<Stat label="With metadata" value={sel ? int(sel.metadata_txs) : '—'} />
	</section>
	<Panel title="Transactions per day" sub="Last 60 days · click a bar to open that day" class="mb-6">
		<SeriesChart
			x={days.map((r) => day(r.date))}
			series={[
				{ name: 'Smart contract', values: days.map((r) => r.script_txs), slot: 3 },
				{ name: 'Other', values: days.map((r) => r.txs - r.script_txs), slot: 0 }
			]}
			kind="stacked"
			height={150}
			label="Transactions per day, split into smart-contract and other transactions"
			onselect={(i) => go({ date: day(days[i].date) })}
		/>
	</Panel>
{:catch}
	<span></span>
{/await}

<Panel flush>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5">
				{#each FILTERS as f (f.id)}
					<button class="rounded-[10px] px-2.5 py-1 text-xs font-medium {filter === f.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}" onclick={() => go({ filter: f.id })}>{f.label}</button>
				{/each}
			</div>
			{#if date}
				<button class="y-icon-btn h-8 w-8" aria-label="Previous day" title="Previous day" onclick={() => go({ date: shift(date!, -1) })}><ChevronLeft class="h-4 w-4" /></button>
				<input class="y-input h-8 w-40" type="date" value={date} onchange={(e) => e.currentTarget.value && go({ date: e.currentTarget.value })} aria-label="Day (UTC)" />
				<button class="y-icon-btn h-8 w-8" aria-label="Next day" title="Next day" onclick={() => go({ date: shift(date!, 1) })}><ChevronRight class="h-4 w-4" /></button>
			{/if}
			{#if sql}<SqlButton {sql} />{/if}
		</div>
	{/snippet}
	{#if !page}
		<Skeleton rows={12} />
	{:else}
		{#await page}
			<Skeleton rows={12} />
		{:then rows}
			{#if !rows.length}
				<p class="p-8 text-center text-sm text-muted">{offset ? 'No more transactions on this day.' : 'No transactions match on this day (or it is outside the snapshot).'}</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-line text-left">
								<th class="y-label px-5 py-2.5">Transaction</th>
								<th class="y-label py-2.5 pr-4">Time (UTC)</th>
								<th class="y-label py-2.5 pr-4">Block</th>
								<th class="y-label py-2.5 pr-4 text-right">In → out</th>
								<th class="y-label py-2.5 pr-4 text-right">Output</th>
								<th class="y-label py-2.5 pr-4 text-right">Fee</th>
								<th class="y-label py-2.5 pr-5"></th>
							</tr>
						</thead>
						<tbody>
							{#each rows as r (r.tx_hash)}
								<tr class="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
									<td class="px-5 py-2.5"><a class="y-link mono text-[13px]" href="#/transactions/{r.tx_hash}?date={date}">{shorten(r.tx_hash, 12, 8)}</a></td>
									<td class="py-2.5 pr-4 tabular-nums text-muted">{new Date(r.block_time).toISOString().slice(11, 19)}</td>
									<td class="py-2.5 pr-4"><a class="y-link mono text-xs" href="#/blocks/{r.block}">#{int(r.block)}</a><span class="text-xs text-faint"> · {r.tx_index}</span></td>
									<td class="py-2.5 pr-4 text-right tabular-nums text-muted">{r.n_in} → {r.n_out}</td>
									<td class="py-2.5 pr-4 text-right tabular-nums">
										{#if r.out}₳{ada(r.out.lovelace, 'auto')}{#if r.out.tokens}<span class="ml-1 text-xs text-faint">+{r.out.tokens} token{r.out.tokens > 1 ? 's' : ''}</span>{/if}{:else}<span class="text-faint">—</span>{/if}
									</td>
									<td class="py-2.5 pr-4 text-right tabular-nums">₳{ada(r.fee, 4)}</td>
									<td class="py-2.5 pr-5">
										<span class="flex justify-end gap-1.5 text-faint">
											{#if r.script}<span title="Smart contract" class="text-violet"><FileCode class="h-4 w-4" /></span>{/if}
											{#if r.meta}<span title="Metadata" class="text-cyan"><MessageSquare class="h-4 w-4" /></span>{/if}
											{#if r.invalid}<span title="Script failed (collateral taken)" class="text-danger"><CircleX class="h-4 w-4" /></span>{/if}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
					<span class="text-muted">{offset + 1}–{offset + rows.length}</span>
					<div class="flex gap-2">
						<button class="y-btn h-8 text-xs" disabled={!offset} onclick={() => go({ offset: Math.max(0, offset - PAGE) })}>Newer</button>
						<button class="y-btn h-8 text-xs" disabled={rows.length < PAGE} onclick={() => go({ offset: offset + PAGE })}>Older</button>
					</div>
				</div>
			{/if}
		{:catch e}
			<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
		{/await}
	{/if}
</Panel>
