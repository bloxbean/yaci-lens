<script lang="ts">
	import Layers from '@lucide/svelte/icons/layers';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import AssetChip from '$lib/ui/AssetChip.svelte';
	import NameTag from '$lib/names/NameTag.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import RangePicker, { rangeOf, RANGES } from '$lib/charts/RangePicker.svelte';
	import { short, since } from '$lib/charts/series';
	import { policyAssets, policyInfo } from '$lib/lake/assets';
	import { lake, summaryQuery, summarySql } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { num, shorten } from '$lib/format';

	/* A minting policy: its assets (from the asset index, which is sorted by unit), totals and activity. */
	const policy = $derived((page.params.policy ?? '').split('?')[0].toLowerCase());
	const PAGE = 100;
	let offset = $state(0);
	let attempt = $state(0);
	const info = $derived.by(() => {
		attempt;
		return policyInfo(policy);
	});
	const assets = $derived.by(() => {
		attempt;
		return policyAssets(policy, PAGE, offset);
	});

	let range = $state(rangeOf(hashParam('range'), '90d').id);
	const r = $derived(rangeOf(range));
	const activity = $derived(
		lake.tip?.date && r.days
			? summaryQuery<{ date: Date; txs: number; units: number }>(
					`SELECT date, txs, units FROM {asset_daily} WHERE policy = '${policy}' AND date > DATE '${since(lake.tip.date, r.days)}' ORDER BY date`
				)
			: null
	);
</script>

<svelte:head><title>Policy {shorten(policy, 8, 6)} · Yaci Lens</title></svelte:head>

<PageHeader kind="Minting policy" title={shorten(policy, 12, 8)}>
	{#snippet icon()}<Layers class="h-5 w-5" />{/snippet}
	<div class="flex items-center gap-2">
		<span class="mono break-all text-xs text-faint">{policy}</span>
		<CopyButton value={policy} label="Policy id copied" />
		<NameTag kind="script" id={policy} />
	</div>
	{#snippet actions()}<a class="y-btn h-8 text-xs" href="#/scripts/{policy}">Policy script</a>{/snippet}
</PageHeader>

{#await info}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
{:then p}
	{#if !p}
		<div class="y-panel mb-6 p-6 text-sm text-muted">Nothing was minted under policy {shorten(policy, 12, 8)} in the published data.</div>
	{:else}
		<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
			<Stat label="Assets" value={num(p.units)} sub="{num(p.nft_units)} with a supply of one · {num(p.fungible_units)} fungible" />
			<Stat label="Mint events" value={num(p.mints)} sub="{num(p.burns)} burns" color="rgb(var(--c-violet))" />
			<Stat label="First mint" value={new Date(p.first_date).toISOString().slice(0, 10)} color="rgb(var(--c-mint))" />
			<Stat label="Last mint or burn" value={new Date(p.last_date).toISOString().slice(0, 10)} color="rgb(var(--c-blue))" />
		</section>
	{/if}
{:catch e}
	<div class="y-panel mb-6"><ErrorBox title="Couldn't load the policy" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}

<section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
	<Panel title="Activity" sub="Transactions moving this policy's tokens, per day">
		{#snippet actions()}<RangePicker bind:value={range} options={RANGES.filter((x) => x.days != null)} />{/snippet}
		{#if activity}
			{#await activity}
				<Skeleton rows={4} />
			{:then rows}
				<SeriesChart x={rows.map((x) => new Date(x.date).toISOString().slice(0, 10))} series={[{ name: 'Transactions', values: rows.map((x) => x.txs), slot: 0 }]} kind="bar" height={180} label="Transactions per day" />
				<div class="mt-2 text-right"><SqlButton sql={summarySql(`SELECT date, txs, outputs, units FROM {asset_daily} WHERE policy = '${policy}' ORDER BY date DESC`)} /></div>
			{/await}
		{/if}
	</Panel>
	<Panel title="Assets" sub="In unit order" flush>
		{#await assets}
			<Skeleton rows={10} />
		{:then rows}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead><tr class="border-b border-line text-left"><th class="y-label px-5 py-2">Asset</th><th class="y-label py-2 pr-4 text-right">Supply</th><th class="y-label py-2 pr-4 text-right">Mints</th><th class="y-label py-2 pr-5 text-right">First minted</th></tr></thead>
					<tbody>
						{#each rows as a (a.unit)}
							<tr class="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
								<td class="px-5 py-2"><AssetChip unit={a.unit} /></td>
								<td class="py-2 pr-4 text-right tabular-nums">{a.supply.length > 12 ? short(Number(a.supply)) : num(a.supply)}</td>
								<td class="py-2 pr-4 text-right tabular-nums text-muted">{a.mints}{a.burns ? ` / −${a.burns}` : ''}</td>
								<td class="py-2 pr-5 text-right tabular-nums text-muted">{new Date(a.first_date).toISOString().slice(0, 10)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
				<span class="text-muted">{rows.length ? `${offset + 1}–${offset + rows.length}` : 'None'}</span>
				<div class="flex gap-2">
					<button class="y-btn h-8 text-xs" disabled={!offset} onclick={() => (offset = Math.max(0, offset - PAGE))}>Previous</button>
					<button class="y-btn h-8 text-xs" disabled={rows.length < PAGE} onclick={() => (offset += PAGE)}>Next</button>
				</div>
			</div>
		{:catch e}
			<ErrorBox title="Couldn't list the assets" message={String(e?.message ?? e)} retry={() => attempt++} />
		{/await}
	</Panel>
</section>
