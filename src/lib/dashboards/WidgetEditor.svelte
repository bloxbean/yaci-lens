<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Play from '@lucide/svelte/icons/play';
	import SqlEditor from '$lib/sql/SqlEditor.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { tables } from '$lib/lake/catalog';
	import type { QueryResult } from '$lib/lake/db';
	import WidgetView from './WidgetView.svelte';
	import { isNumeric, runSql, suggest } from './run';
	import { newId, type Format, type VizType, type Widget } from './store.svelte';

	/*
	 * Add or edit a widget: SQL, chart type, columns, number format and width, with a live preview.
	 * Placeholders: {tip_date}, {tip_epoch}, and {name} for a summary-pack file.
	 */
	let { widget = null, onsave, onclose }: { widget?: Widget | null; onsave: (w: Widget) => void; onclose: () => void } = $props();

	// svelte-ignore state_referenced_locally
	const start = widget;
	let title = $state(start?.title ?? 'New widget');
	let sql = $state(start?.sql ?? `SELECT date, txs, script_txs\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date`);
	let type = $state<VizType>(start?.viz.type ?? 'auto');
	let x = $state<string>(start?.viz.x ?? '');
	let y = $state<string[]>(start?.viz.y ?? []);
	let format = $state<Format>(start?.viz.format ?? 'number');
	let width = $state<1 | 2 | 3>(start?.width ?? 1);
	let note = $state(start?.note ?? '');

	let result = $state<QueryResult | null>(null);
	let error = $state<string | null>(null);
	let running = $state(false);
	async function run() {
		running = true;
		error = null;
		try {
			result = await runSql(sql);
		} catch (e) {
			error = (e as Error)?.message ?? String(e);
			result = null;
		} finally {
			running = false;
		}
	}
	run();

	let schema = $state<Record<string, string[]>>({});
	tables()
		.then((ts) => (schema = Object.fromEntries(ts.map((t) => [t.name, t.columns.map((c) => c.name)]))))
		.catch(() => {});

	const TYPES: { id: VizType; label: string }[] = [
		{ id: 'auto', label: 'Auto' },
		{ id: 'table', label: 'Table' },
		{ id: 'stat', label: 'Number' },
		{ id: 'line', label: 'Line' },
		{ id: 'area', label: 'Area' },
		{ id: 'bar', label: 'Bars' },
		{ id: 'stacked', label: 'Stacked bars' },
		{ id: 'barlist', label: 'Ranked list' },
		{ id: 'split', label: 'Split bar' }
	];
	const viz = $derived({ type, x: x || null, y: y.length ? y : null, format });
	const numericCols = $derived(result ? result.columns.filter(isNumeric).map((c) => c.name) : []);

	function save() {
		onsave({ id: start?.id ?? newId(), title: title.trim() || 'Untitled', sql: sql.trim(), viz: $state.snapshot(viz), width, note: note.trim() || undefined });
	}
	function toggleY(c: string) {
		y = y.includes(c) ? y.filter((v) => v !== c) : [...y, c];
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-[60] flex items-stretch justify-center p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit widget">
	<button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={onclose} aria-label="Close"></button>
	<div class="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
		<header class="flex items-center gap-3 border-b border-line px-5 py-3">
			<input class="y-input h-9 flex-1 font-semibold" bind:value={title} aria-label="Widget title" />
			<button class="y-btn h-9" onclick={onclose}>Cancel</button>
			<button class="y-btn y-btn-primary h-9" onclick={save} disabled={!sql.trim()}>Save widget</button>
			<button class="y-icon-btn h-9 w-9" onclick={onclose} aria-label="Close"><X class="h-4 w-4" /></button>
		</header>
		<div class="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div class="flex min-w-0 flex-col gap-3 border-b border-line p-5 lg:border-b-0 lg:border-r">
				<div class="overflow-hidden rounded-xl border border-line"><SqlEditor bind:value={sql} {schema} onrun={run} /></div>
				<div class="flex items-center gap-2">
					<button class="y-btn y-btn-primary h-9" onclick={run} disabled={running}><Play class="h-4 w-4" />{running ? 'Running…' : 'Run'}</button>
					<span class="text-xs text-muted">Ctrl/⌘ + Enter</span>
				</div>
				<p class="text-xs leading-relaxed text-muted">
					Placeholders: <code class="text-ink">{'{tip_date}'}</code> (newest day), <code class="text-ink">{'{tip_epoch}'}</code>, and
					<code class="text-ink">{'{daily}'}</code>, <code class="text-ink">{'{epochs}'}</code>, <code class="text-ink">{'{script_daily}'}</code>… for summary-pack
					files. Lake tables by name (filter big ones on <code class="text-ink">date</code> or <code class="text-ink">epoch</code>). Up to 5,000 rows.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<label class="text-xs text-muted">Chart
						<select class="y-input mt-1 h-9 w-full" bind:value={type}>{#each TYPES as t (t.id)}<option value={t.id}>{t.label}{t.id === 'auto' && result ? ` (${suggest(result)})` : ''}</option>{/each}</select>
					</label>
					<label class="text-xs text-muted">Numbers as
						<select class="y-input mt-1 h-9 w-full" bind:value={format}>
							<option value="number">Plain (1.2k, 3.4M)</option><option value="ada">ADA (₳)</option><option value="lovelace">Lovelace → ADA</option><option value="percent">Percent (0.25 → 25%)</option>
						</select>
					</label>
					<label class="text-xs text-muted">X axis / labels
						<select class="y-input mt-1 h-9 w-full" bind:value={x}>
							<option value="">First column</option>
							{#each result?.columns ?? [] as c (c.name)}<option value={c.name}>{c.name}</option>{/each}
						</select>
					</label>
					<label class="text-xs text-muted">Width
						<select class="y-input mt-1 h-9 w-full" bind:value={width}><option value={1}>One column</option><option value={2}>Two columns</option><option value={3}>Full width</option></select>
					</label>
				</div>
				{#if numericCols.length}
					<div class="text-xs text-muted">
						Values <span class="text-faint">(none selected: every numeric column)</span>
						<div class="mt-1.5 flex flex-wrap gap-1.5">
							{#each numericCols as c (c)}
								<button class="rounded-full border px-2.5 py-0.5 text-xs {y.includes(c) ? 'border-brand/50 bg-brand/10 text-brand' : 'border-line text-muted hover:text-ink'}" onclick={() => toggleY(c)}>{c}</button>
							{/each}
						</div>
					</div>
				{/if}
				<label class="text-xs text-muted">Note (optional)<input class="y-input mt-1 h-9 w-full" bind:value={note} placeholder="What this shows, caveats…" /></label>
			</div>
			<div class="min-w-0 p-5">
				<div class="y-label mb-3">Preview</div>
				{#if running && !result}
					<Skeleton rows={6} />
				{:else if error}
					<ErrorBox title="Query failed" message={error} retry={run} />
				{:else if result}
					<WidgetView {result} {viz} height={240} />
					<p class="mt-3 text-[11px] text-faint">{result.rows.length.toLocaleString('en-US')} rows · {(result.ms / 1000).toFixed(2)} s{result.truncated ? ' · truncated' : ''}</p>
				{/if}
			</div>
		</div>
	</div>
</div>
