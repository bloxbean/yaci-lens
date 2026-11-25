<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
	import { lake } from '$lib/lake/lake.svelte';
	import { dateTime } from '$lib/format';

	/* What the published data covers. Replaces the viewer's live badge: Yaci Lens shows a daily snapshot. */
	const label = $derived.by(() => {
		if (lake.status === 'error') return 'Offline';
		if (!lake.tip) return lake.status === 'starting' ? lake.step || 'Starting' : 'Loading';
		return `Data through ${lake.tip.date.toISOString().slice(0, 10)}`;
	});
	const title = $derived(
		lake.tip
			? `Published snapshot up to block #${lake.tip.block.toLocaleString('en-US')} (epoch ${lake.tip.epoch}), ${dateTime(lake.tip.blockTime.getTime())}. Updated daily.`
			: (lake.error ?? 'Connecting to the data lake')
	);
</script>

<a
	href="#/about"
	class="hidden h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-muted hover:text-ink sm:flex"
	{title}
>
	<Database class="h-3.5 w-3.5 {lake.status === 'error' ? 'text-danger' : lake.tip ? 'text-mint' : 'animate-pulse text-amber'}" />
	<span class="tabular-nums">{label}</span>
</a>
