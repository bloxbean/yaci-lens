<script lang="ts">
	import { short } from './series';

	/*
	 * One 100% bar split into parts (yes/no/abstain, purposes, shares), with a labelled legend so colour is never
	 * the only cue. Parts with zero are left out of the bar but kept in the legend.
	 */
	let {
		parts,
		height = 10,
		format = (v: number) => short(v),
		legend = true
	}: { parts: { label: string; value: number; color: string }[]; height?: number; format?: (v: number) => string; legend?: boolean } = $props();

	const total = $derived(parts.reduce((a, p) => a + Math.max(0, p.value), 0));
</script>

<div>
	<div class="flex w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" style="height:{height}px" role="img" aria-label={parts.map((p) => `${p.label} ${format(p.value)}`).join(', ')}>
		{#each parts as p (p.label)}
			{#if p.value > 0 && total > 0}
				<div style="width:{(p.value / total) * 100}%; background:{p.color}" title="{p.label}: {format(p.value)} ({((p.value / total) * 100).toFixed(1)}%)"></div>
			{/if}
		{/each}
	</div>
	{#if legend}
		<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
			{#each parts as p (p.label)}
				<span class="inline-flex items-center gap-1.5 text-muted">
					<span class="h-2.5 w-2.5 rounded-sm" style="background:{p.color}"></span>{p.label}
					<span class="mono font-semibold text-ink tabular-nums">{format(p.value)}</span>
					{#if total > 0}<span class="tabular-nums text-faint">{((p.value / total) * 100).toFixed(1)}%</span>{/if}
				</span>
			{/each}
		</div>
	{/if}
</div>
