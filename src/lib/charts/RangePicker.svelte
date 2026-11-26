<script lang="ts" module>
	export interface Range {
		id: string;
		label: string;
		/** Days back from the data tip; null = all history. */
		days: number | null;
	}
	export const RANGES: Range[] = [
		{ id: '7d', label: '7D', days: 7 },
		{ id: '30d', label: '30D', days: 30 },
		{ id: '90d', label: '90D', days: 90 },
		{ id: '1y', label: '1Y', days: 365 },
		{ id: 'all', label: 'All', days: null }
	];
	export const rangeOf = (id: string | null | undefined, fallback = '30d') => RANGES.find((r) => r.id === id) ?? RANGES.find((r) => r.id === fallback)!;
</script>

<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { hashWith } from '$lib/lake/links';

	/* A segmented control for a time range, kept in the URL (?range=30d) so a view can be shared. */
	let { value = $bindable(), options = RANGES, param = 'range' }: { value: string; options?: Range[]; param?: string | null } = $props();

	function pick(id: string) {
		value = id;
		if (param) replaceState(hashWith({ [param]: id }), {});
	}
</script>

<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5" role="radiogroup" aria-label="Time range">
	{#each options as o (o.id)}
		<button
			class="rounded-[10px] px-2.5 py-1 text-xs font-medium transition {value === o.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}"
			role="radio"
			aria-checked={value === o.id}
			onclick={() => pick(o.id)}>{o.label}</button
		>
	{/each}
</div>
