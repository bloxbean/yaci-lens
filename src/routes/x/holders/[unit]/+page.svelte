<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import { parseUnit, compact } from '$lib/format';
	import { int } from '$lib/cardano';

	/*
	 * EXPERIMENTAL native asset holders at the published tip, from the SQLite holders index (built from the unspent
	 * outputs). Holders are stake addresses when the output's address has one, else addresses; the top-N share
	 * shows concentration. Quantities are raw (no decimals applied).
	 */
	const unit = $derived((page.params.unit ?? '').split('?')[0].toLowerCase());
	const name = $derived(parseUnit(unit));
	const PAGE = 50;
	let offset = $state(0);

	const data = $derived.by(() => {
		const off = offset;
		return import('$lib/indexdb/service').then((s) => s.getAssetHolders(unit, off, PAGE));
	});
	const share = (qty: string, total: string | null) => (total && Number(total) > 0 ? (Number(qty) / Number(total)) * 100 : 0);
</script>

<svelte:head><title>Holders · {name.label ?? name.name ?? unit.slice(0, 12)} · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental · indexed · holders" title={name.label ?? name.name ?? `${unit.slice(0, 16)}…`}>
	{#snippet icon()}<Users class="h-5 w-5" />{/snippet}
	{#snippet actions()}<a class="y-btn h-9" href="#/assets/unit/{unit}">Asset page</a>{/snippet}
</PageHeader>

<Gate>
	{#await data}
		<div class="y-panel"><Skeleton rows={10} /></div>
	{:then r}
		{@const top10 = r.data.holders.filter((h) => h.rank <= 10).reduce((s, h) => s + share(h.qty, r.data.total), 0)}
		<div class="mb-6 grid gap-4 sm:grid-cols-3">
			<Stat label="Holders" value={int(r.data.count)} />
			<Stat label="Held (raw units)" value={r.data.total ? compact(Number(r.data.total)) : '—'} />
			<Stat label="Top 10 hold" value={offset === 0 ? `${top10.toFixed(1)}%` : '—'} />
		</div>
		<Panel title="Holders at the published tip" sub="largest first" flush>
			{#snippet actions()}<Cost cost={r.cost} />{/snippet}
			{#if !r.data.holders.length}
				<div class="p-6 text-sm text-muted">No holders: the asset is not held in any unspent output, or is not in the index.</div>
			{:else}
				<table class="w-full text-sm" data-testid="holders">
					<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">#</th><th>Holder</th><th class="text-right">Quantity</th><th class="text-right">Share</th><th class="px-4 text-right">UTxOs</th></tr></thead>
					<tbody class="divide-y divide-line">
						{#each r.data.holders as h (h.rank)}
							<tr>
								<td class="px-4 py-2 font-mono text-xs text-faint">{h.rank}</td>
								<td><Hash value={h.holder} href="#/x/address/{h.holder}" head={14} tail={8} /></td>
								<td class="text-right font-mono text-xs">{BigInt(h.qty).toLocaleString('en-US')}</td>
								<td class="text-right font-mono text-xs">{share(h.qty, r.data.total).toFixed(2)}%</td>
								<td class="px-4 text-right font-mono text-xs">{h.utxos}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
					<button class="y-btn h-8 text-xs" disabled={offset === 0} onclick={() => (offset = Math.max(0, offset - PAGE))}>Previous</button>
					<span>{offset + 1}–{offset + r.data.holders.length} of {int(r.data.count)}</span>
					<button class="y-btn h-8 text-xs" disabled={offset + PAGE >= r.data.count} onclick={() => (offset += PAGE)}>Next</button>
				</div>
			{/if}
		</Panel>
	{:catch e}
		<ErrorBox message={e instanceof Error ? e.message : String(e)} />
	{/await}
</Gate>
