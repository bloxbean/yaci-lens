<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from './Cost.svelte';
	import { ada } from '$lib/format';

	/*
	 * EXPERIMENTAL (indexed lookups): where each output of a transaction went, from the SQLite utxo index: the
	 * transaction that spent it, or "unspent" at the published tip. Loaded on demand (the first use starts the
	 * SQLite-WASM worker).
	 */
	let { hash }: { hash: string } = $props();
	const data = $derived(import('./service').then((s) => s.txLinks(hash)));
</script>

<Panel title="Outputs: spent by" sub="indexed lookup (experimental) · at the published tip" class="mb-6">
	{#snippet actions()}<a class="y-btn h-8 text-xs" href="#/x/graph/{hash}">Graph</a>{/snippet}
	{#await data}
		<Skeleton rows={2} />
	{:then r}
		<div class="mb-2 flex justify-end"><Cost cost={r.cost} /></div>
		<ul class="grid gap-x-8 gap-y-1.5 text-sm md:grid-cols-2" data-testid="spent-by">
			{#each r.data.children as e (e.outIdx + e.byTx)}
				<li class="flex items-center gap-2">
					<span class="w-10 font-mono text-xs text-faint">#{e.outIdx}</span>
					<span class="w-28 text-right font-mono text-xs">{e.lovelace != null ? `${ada(e.lovelace)} ₳` : ''}</span>
					<span class="text-xs text-muted">→</span>
					<Hash value={e.byTx} href="#/transactions/{e.byTx}" head={8} tail={6} />
					{#if e.collateral}<Badge tone="warn">collateral</Badge>{/if}
				</li>
			{/each}
			{#each r.data.unspent as i (i)}
				<li class="flex items-center gap-2">
					<span class="w-10 font-mono text-xs text-faint">#{i}</span>
					<Badge tone="ok">unspent</Badge>
				</li>
			{/each}
		</ul>
		{#if !r.data.tx}<p class="mt-2 text-xs text-muted">This transaction is not in the index (it may be newer than the published indexes).</p>{/if}
	{:catch e}
		<p class="text-sm text-muted">Indexed lookup failed: {e instanceof Error ? e.message : String(e)}</p>
	{/await}
</Panel>
