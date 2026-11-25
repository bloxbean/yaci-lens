<script lang="ts">
	import type { Column } from '$lib/lake/db';

	/* Any query result: typed alignment, null marks, long text clipped (full value on hover), paged rendering. */
	let { columns, rows }: { columns: Column[]; rows: unknown[][] } = $props();

	const PAGE = 200;
	let shown = $state(PAGE);
	$effect(() => {
		rows;
		shown = PAGE;
	});

	const numeric = (c: Column) => c.kind === 'number' || c.kind === 'bigint' || c.kind === 'decimal';

	function text(v: unknown, c: Column): string {
		if (v === null || v === undefined) return '';
		if (v instanceof Date) return c.kind === 'date' ? v.toISOString().slice(0, 10) : v.toISOString().replace('T', ' ').replace('.000Z', 'Z');
		if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 6 });
		if (typeof v === 'bigint') return v.toLocaleString('en-US');
		if (typeof v === 'object') return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
		return String(v);
	}
</script>

<div class="max-h-[560px] overflow-auto">
	<table class="w-full border-collapse text-[12.5px]">
		<thead class="sticky top-0 z-10">
			<tr class="border-b border-line bg-surface-2">
				<th class="px-3 py-2 text-right font-mono text-[11px] font-normal text-faint">#</th>
				{#each columns as c (c.name)}
					<th class="whitespace-nowrap px-3 py-2 text-left {numeric(c) ? 'text-right' : ''}">
						<div class="font-semibold text-ink">{c.name}</div>
						<div class="font-mono text-[10.5px] font-normal text-faint">{c.type}</div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows.slice(0, shown) as row, i (i)}
				<tr class="border-b border-line/60 hover:bg-surface-2/60">
					<td class="px-3 py-1.5 text-right font-mono text-[11px] text-faint tabular-nums">{i + 1}</td>
					{#each columns as c, j (c.name)}
						{@const v = row[j]}
						{@const t = text(v, c)}
						<td class="max-w-[420px] truncate whitespace-nowrap px-3 py-1.5 {numeric(c) ? 'text-right tabular-nums' : ''} {c.kind === 'text' && t.length > 40 ? 'font-mono text-[11.5px]' : ''}" title={t.length > 40 ? t : undefined}>
							{#if v === null || v === undefined}<span class="italic text-faint">null</span>{:else}{t}{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if rows.length > shown}
		<div class="p-3 text-center">
			<button class="y-btn h-8 text-xs" onclick={() => (shown += PAGE * 5)}>Show more ({(rows.length - shown).toLocaleString('en-US')} more rows)</button>
		</div>
	{/if}
</div>
