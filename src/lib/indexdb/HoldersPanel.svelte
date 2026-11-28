<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from './Cost.svelte';
	import { int } from '$lib/cardano';

	/*
	 * Holders of a native asset at the published tip (SQLite holders index): how many, how concentrated (share of the
	 * top 1 / 10 / 50 / 100), and the largest holders. Holders are stake addresses (all their addresses) or addresses.
	 */
	let { unit, decimals = 0, top = 15 }: { unit: string; decimals?: number; top?: number } = $props();
	const data = $derived(import('./service').then((s) => s.getAssetHolders(unit, 0, 100)));
	const share = (q: string, total: string | null) => (total && Number(total) > 0 ? Number(q) / Number(total) : 0);
	const fmt = (q: string) => {
		const n = Number(q) / 10 ** decimals;
		return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n.toLocaleString('en-US', { maximumFractionDigits: decimals ? 2 : 0 });
	};
</script>

<Panel title="Holders" sub="at the published tip · indexed lookup" class="mb-6">
	{#await data}
		<Skeleton rows={4} />
	{:then r}
		{@const sum = (n: number) => r.data.holders.slice(0, n).reduce((a, h) => a + share(h.qty, r.data.total), 0)}
		<div class="-mt-1 mb-3 flex justify-end"><Cost cost={r.cost} /></div>
		{#if !r.data.count}
			<p class="text-sm text-muted">Not held in any unspent output.</p>
		{:else}
			<div class="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5" data-testid="holder-stats">
				<div><div class="y-label">Holders</div><div class="font-semibold">{int(r.data.count)}</div></div>
				{#each [1, 10, 50, 100] as n (n)}
					<div>
						<div class="y-label">Top {n}</div>
						<div class="font-semibold">{(sum(Math.min(n, r.data.holders.length)) * 100).toFixed(1)}%</div>
						<div class="mt-1 h-1.5 rounded-full bg-surface-2"><div class="h-1.5 rounded-full bg-brand" style="width:{Math.min(100, sum(n) * 100)}%"></div></div>
					</div>
				{/each}
			</div>
			<ol class="divide-y divide-line text-sm">
				{#each r.data.holders.slice(0, top) as h (h.rank)}
					<li class="flex items-center gap-3 py-1.5">
						<span class="w-6 text-right font-mono text-xs text-faint">{h.rank}</span>
						<span class="min-w-0 flex-1"><Hash value={h.holder} href="#/x/address/{h.holder}" head={14} tail={8} /></span>
						<span class="font-mono text-xs">{fmt(h.qty)}</span>
						<span class="w-14 text-right font-mono text-xs text-muted">{(share(h.qty, r.data.total) * 100).toFixed(2)}%</span>
					</li>
				{/each}
			</ol>
			<div class="mt-3 text-right"><a class="y-btn h-8 text-xs" href="#/x/holders/{unit}">All {int(r.data.count)} holders</a></div>
		{/if}
	{:catch e}
		<p class="text-sm text-muted">Holders unavailable: {e instanceof Error ? e.message : String(e)}</p>
	{/await}
</Panel>
