<script lang="ts">
	import type { Cost } from './service';

	/* What an indexed lookup cost: HTTP range requests, bytes and time. */
	let { cost }: { cost: Cost | null | undefined } = $props();
	const kb = (b: number) => (b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
</script>

{#if cost}
	<span class="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg-2 px-2 py-0.5 font-mono text-[11px] text-muted" title="SQLite-WASM over HTTP range requests" data-testid="cost">
		<span class="h-1.5 w-1.5 rounded-full bg-cyan"></span>
		{cost.requests} req · {kb(cost.bytes)} · {cost.ms} ms
	</span>
{/if}
