<script lang="ts">
	import TerminalSquare from '@lucide/svelte/icons/square-terminal';
	import Play from '@lucide/svelte/icons/play';
	import Square from '@lucide/svelte/icons/square';
	import Download from '@lucide/svelte/icons/download';
	import Link2 from '@lucide/svelte/icons/link-2';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import TableIcon from '@lucide/svelte/icons/table';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Chart from '$lib/ui/Chart.svelte';
	import SqlEditor from '$lib/sql/SqlEditor.svelte';
	import ResultTable from '$lib/sql/ResultTable.svelte';
	import SaveToDashboard from '$lib/dashboards/SaveToDashboard.svelte';
	import { cancel, query, type QueryResult } from '$lib/lake/db';
	import { lake, started, summaryUrl } from '$lib/lake/lake.svelte';
	import { tables, type TableInfo } from '$lib/lake/catalog';
	import { examples, type Example } from '$lib/lake/examples';
	import { hashParam, sqlHref } from '$lib/lake/links';
	import { SUMMARY_NOTES } from '$lib/lake/describe';
	import { copyText } from '$lib/ui/toast.svelte';
	import { short } from '$lib/cardano';

	const STORE = 'lens:sql';
	const DEFAULT = `-- Every table of the lake is here: block, transaction, address_utxo, epoch_stake, reward, ...
-- Filter on date or epoch (the partition columns) so DuckDB reads only a few files.
SELECT number, block_time, no_of_txs, total_fees / 1e6 AS fees_ada
FROM block
WHERE date = (SELECT max(date) FROM block)
ORDER BY number DESC
LIMIT 20`;

	let sql = $state(DEFAULT);
	let running = $state(false);
	let result = $state<QueryResult | null>(null);
	let error = $state<string | null>(null);
	let view = $state<'table' | 'chart'>('table');
	let elapsed = $state(0);
	let catalog = $state<TableInfo[]>([]);
	let filter = $state('');

	const schema = $derived(Object.fromEntries(catalog.map((t) => [t.name, t.columns.map((c) => c.name)])));
	const examplesList = $derived<Example[]>(lake.tip ? examples(lake.tip) : []);
	const groups = $derived([...new Set(examplesList.map((e) => e.group))]);

	// Columns usable for a quick chart: x = first column, y = any numeric column.
	const numericCols = $derived(result ? result.columns.map((c, i) => ({ c, i })).filter(({ c, i }) => i > 0 && (c.kind === 'number' || c.kind === 'bigint' || c.kind === 'decimal')) : []);
	let yCol = $state(1);
	const chartable = $derived(!!result && result.rows.length > 1 && result.rows.length <= 5000 && numericCols.length > 0);

	// Large tables queried without a partition filter read hundreds or thousands of files from the browser.
	const BIG = ['address_utxo', 'transaction', 'tx_input', 'epoch_stake', 'reward', 'transaction_metadata', 'transaction_scripts', 'datum', 'block', 'assets', 'delegation', 'withdrawal', 'stake_address_balance', 'stake_registration', 'pool', 'pool_registration', 'script'];
	const warning = $derived.by(() => {
		const s = sql.toLowerCase().replace(/--.*$/gm, '');
		const hit = BIG.filter((t) => new RegExp(`\\b(from|join)\\s+(lake\\.)?${t}\\b`).test(s));
		if (!hit.length) return null;
		if (/\b(date|epoch|number|slot|active_epoch|spent_epoch)\b\s*(=|between|>|<|in\b)/.test(s)) return null;
		return `No filter on date or epoch for ${hit.join(', ')}: this may read many files (~0.3 s each in the browser). Add WHERE date = … or WHERE epoch = …, or use the summary pack.`;
	});

	onMount(() => {
		const shared = hashParam('q');
		if (shared) sql = shared;
		else {
			try {
				sql = localStorage.getItem(STORE) || DEFAULT;
			} catch {
				/* storage unavailable */
			}
		}
		started()
			.then(() => tables())
			.then((t) => (catalog = t))
			.catch(() => {});
		if (shared) void run();
	});

	// A shared link opened while the page is already open.
	$effect(() => {
		page.url.hash;
		const q = hashParam('q');
		if (q && q !== sql) sql = q;
	});

	async function run() {
		if (running || !sql.trim()) return;
		running = true;
		error = null;
		const t0 = performance.now();
		const tick = setInterval(() => (elapsed = (performance.now() - t0) / 1000), 100);
		try {
			localStorage.setItem(STORE, sql);
		} catch {
			/* storage unavailable */
		}
		try {
			await started();
			result = await query(sql);
			yCol = numericCols[0]?.i ?? 1;
			if (!chartable) view = 'table';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			result = null;
		} finally {
			clearInterval(tick);
			elapsed = (performance.now() - t0) / 1000;
			running = false;
		}
	}

	function csv() {
		if (!result) return;
		const esc = (v: unknown) => {
			if (v === null || v === undefined) return '';
			const s = v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? v.toString() : String(v);
			return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
		};
		const lines = [result.columns.map((c) => esc(c.name)).join(','), ...result.rows.map((r) => r.map(esc).join(','))];
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
		a.download = 'yaci-lens-query.csv';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function share() {
		copyText(`${location.origin}${location.pathname}${sqlHref(sql)}`, 'Link copied');
	}

	function insert(text: string) {
		sql = text;
	}

	const tableList = $derived(catalog.filter((t) => !filter || t.name.includes(filter.toLowerCase())));
	const fmtX = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
</script>

<svelte:head><title>SQL lab · Yaci Lens</title></svelte:head>

<PageHeader kind="Analytics" title="SQL lab">
	{#snippet icon()}<TerminalSquare class="h-5 w-5" />{/snippet}
	DuckDB runs in this tab and reads the lake's Parquet files straight from object storage. No server, no API key.
</PageHeader>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
	<div class="flex min-w-0 flex-col gap-4">
		<SqlEditor bind:value={sql} {schema} onrun={run} />

		<div class="flex flex-wrap items-center gap-2">
			{#if running}
				<button class="y-btn h-9" onclick={() => cancel()}><Square class="h-4 w-4" /> Cancel</button>
			{:else}
				<button class="y-btn y-btn-primary h-9" onclick={run} disabled={lake.status === 'error'}><Play class="h-4 w-4" /> Run</button>
			{/if}
			<span class="text-xs text-faint"><kbd class="y-kbd">⌘/Ctrl</kbd> + <kbd class="y-kbd">Enter</kbd></span>
			<span class="ml-auto flex items-center gap-2 text-xs text-muted tabular-nums">
				{#if running}Running · {elapsed.toFixed(1)} s{:else if result}{result.rows.length.toLocaleString('en-US')} rows{result.truncated ? ' (cut)' : ''} · {elapsed.toFixed(2)} s{/if}
			</span>
			<button class="y-btn h-9" onclick={share} title="Copy a link that opens this query"><Link2 class="h-4 w-4" /> Share</button>
			<button class="y-btn h-9" onclick={csv} disabled={!result?.rows.length}><Download class="h-4 w-4" /> CSV</button>
			<SaveToDashboard {sql} />
		</div>

		{#if warning}
			<div class="flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm"><TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber" />{warning}</div>
		{/if}

		{#if error}
			<div class="whitespace-pre-wrap rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 font-mono text-xs text-danger">{error}</div>
		{:else if result}
			<Panel flush>
				{#snippet actions()}
					<div class="flex rounded-lg border border-line p-0.5">
						<button class="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs {view === 'table' ? 'bg-surface-2 text-ink' : 'text-muted'}" onclick={() => (view = 'table')}><TableIcon class="h-3.5 w-3.5" />Table</button>
						<button class="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs {view === 'chart' ? 'bg-surface-2 text-ink' : 'text-muted'} disabled:opacity-40" disabled={!chartable} onclick={() => (view = 'chart')}><ChartColumn class="h-3.5 w-3.5" />Chart</button>
					</div>
				{/snippet}
				{#if result.truncated}
					<div class="border-b border-line bg-amber/10 px-4 py-2 text-xs">Showing the first {result.rows.length.toLocaleString('en-US')} rows. Add a LIMIT, or aggregate, to see everything.</div>
				{/if}
				{#if view === 'chart' && chartable}
					<div class="p-5">
						<div class="mb-3 flex items-center gap-2 text-xs text-muted">
							<span>x: <b class="text-ink">{result.columns[0].name}</b></span>
							<span>y:</span>
							<select class="y-input h-8 w-auto py-0 text-xs" bind:value={yCol}>
								{#each numericCols as n (n.i)}<option value={n.i}>{n.c.name}</option>{/each}
							</select>
						</div>
						<Chart
							kind={result.rows.length > 60 ? 'area' : 'bar'}
							height={260}
							label={result.columns[yCol]?.name ?? 'value'}
							points={result.rows.map((r) => ({ label: fmtX(r[0]), value: Number(r[yCol] ?? 0) }))}
							format={(v) => short(v)}
						/>
					</div>
				{:else if result.columns.length}
					<ResultTable columns={result.columns} rows={result.rows} />
				{:else}
					<p class="p-5 text-sm text-muted">Done (no rows returned).</p>
				{/if}
			</Panel>
		{:else if !running}
			<div class="y-panel p-6 text-sm text-muted">
				Run the query above, or pick an example. Tips: filter large tables on <code>date</code> (UTC day) or <code>epoch</code>; numbers in lovelace are
				exact decimals (divide by 1e6 for ADA); the summary pack (<code>read_parquet('{summaryUrl('daily')}')</code>) has history-wide totals in one file each.
			</div>
		{/if}
	</div>

	<aside class="flex min-w-0 flex-col gap-6">
		<Panel title="Examples" flush>
			{#if !examplesList.length}
				<p class="p-4 text-xs text-muted">Loading…</p>
			{/if}
			{#each groups as g (g)}
				<div class="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{g}</div>
				{#each examplesList.filter((e) => e.group === g) as ex (ex.title)}
					<button class="block w-full px-4 py-1.5 text-left text-[13px] text-muted hover:bg-surface-2 hover:text-ink" onclick={() => insert(ex.sql)}>{ex.title}</button>
				{/each}
			{/each}
			<div class="h-3"></div>
		</Panel>

		<Panel title="Tables" sub="Click to insert" flush>
			<div class="p-3"><input class="y-input h-8 text-xs" placeholder="Filter tables" bind:value={filter} /></div>
			<div class="max-h-[420px] overflow-y-auto pb-2">
				{#each tableList as t (t.name)}
					<button class="flex w-full items-center gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-surface-2" onclick={() => insert(`SELECT *\nFROM ${t.name}${t.partition ? `\nWHERE ${t.partition} = ${t.partition === 'date' && lake.tip ? `DATE '${lake.tip.date.toISOString().slice(0, 10)}'` : (lake.tip?.epoch ?? 0) - 1}` : ''}\nLIMIT 100`)}>
						<span class="min-w-0 flex-1 truncate font-mono text-xs">{t.name}</span>
						<span class="text-[11px] text-faint tabular-nums">{short(t.rows)}</span>
					</button>
				{/each}
				<div class="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">Summary pack</div>
				{#each Object.keys(SUMMARY_NOTES) as s (s)}
					<button class="block w-full truncate px-4 py-1.5 text-left font-mono text-xs hover:bg-surface-2" title={SUMMARY_NOTES[s]} onclick={() => insert(`SELECT *\nFROM '${summaryUrl(s)}'\nLIMIT 100`)}>{s}</button>
				{/each}
			</div>
		</Panel>
	</aside>
</div>
