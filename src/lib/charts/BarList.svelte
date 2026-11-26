<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { short } from './series';

	/*
	 * A ranked list with a horizontal bar per row (top tokens, top scripts, top DReps…). The bar is scaled to the
	 * largest value; the label is a snippet so rows can link and show names. Hover shows the exact value.
	 */
	let {
		rows,
		value,
		label,
		href = undefined,
		format = (v: number) => short(v),
		color = 'var(--s1)',
		extra = undefined
	}: {
		rows: T[];
		value: (r: T) => number;
		label: Snippet<[T]>;
		href?: (r: T) => string;
		format?: (v: number) => string;
		color?: string;
		/** A second, muted value on the right (share, count…). */
		extra?: (r: T) => string;
	} = $props();

	const max = $derived(Math.max(0, ...rows.map(value)) || 1);
</script>

<ol class="flex flex-col gap-1">
	{#each rows as r, i (i)}
		{@const v = value(r)}
		<li class="group relative rounded-lg px-2 py-1.5 hover:bg-surface-2/70">
			<div class="absolute inset-y-1 left-0 rounded-md opacity-[0.14] transition-opacity group-hover:opacity-25" style="width:{Math.max(1, (v / max) * 100)}%; background:{color}"></div>
			<div class="relative flex items-center gap-3 text-sm">
				<span class="w-5 shrink-0 text-right text-xs tabular-nums text-faint">{i + 1}</span>
				<span class="min-w-0 flex-1 truncate">
					{#if href}<a class="hover:text-brand" href={href(r)}>{@render label(r)}</a>{:else}{@render label(r)}{/if}
				</span>
				{#if extra}<span class="shrink-0 text-xs tabular-nums text-muted">{extra(r)}</span>{/if}
				<span class="mono w-20 shrink-0 text-right font-semibold tabular-nums" title={String(v)}>{format(v)}</span>
			</div>
		</li>
	{/each}
</ol>
