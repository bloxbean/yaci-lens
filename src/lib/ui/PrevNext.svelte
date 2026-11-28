<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	/*
	 * Back / forward paging inside a panel (the page size stays fixed): "← Newer" and "Older →" for lists newest first.
	 * Shows "1–25 of 340" when the total is known, else "page 3".
	 */
	let {
		page,
		size,
		shown,
		total = null,
		hasNext,
		busy = false,
		onprev,
		onnext
	}: { page: number; size: number; shown: number; total?: number | null; hasNext: boolean; busy?: boolean; onprev: () => void; onnext: () => void } = $props();
</script>

<div class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted" data-testid="prevnext">
	<button class="y-btn h-8 px-2.5 text-xs" disabled={page === 0 || busy} onclick={onprev} data-testid="newer"><ChevronLeft class="h-3.5 w-3.5" />Newer</button>
	<span class="tabular-nums">
		{#if shown}{`${page * size + 1}–${page * size + shown}${total != null ? ` of ${total.toLocaleString('en-US')}` : ''}`}{:else}—{/if}
		{#if total == null}<span class="text-faint"> · page {page + 1}</span>{/if}
	</span>
	<button class="y-btn h-8 px-2.5 text-xs" disabled={!hasNext || busy} onclick={onnext} data-testid="older">Older<ChevronRight class="h-3.5 w-3.5" /></button>
</div>
