<script lang="ts">
	import Coins from '@lucide/svelte/icons/coins';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import HoldersPanel from '$lib/indexdb/HoldersPanel.svelte';
	import { indexEnabled } from '$lib/indexdb/config';
	// holders come from the SQLite indexes, when they are on and published
	let indexed = $state(false);
	if (indexEnabled()) import('$lib/indexdb/service').then((s) => s.indexAvailable()).then((ok) => (indexed = ok));
	import Panel from '$lib/ui/Panel.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import NameTag from '$lib/names/NameTag.svelte';
	import AssetAvatar from '$lib/assets/AssetAvatar.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import RangePicker, { rangeOf, RANGES } from '$lib/charts/RangePicker.svelte';
	import { since } from '$lib/charts/series';
	import { imageUrl } from '$lib/assets/types';
	import { assetByUnit, cip25Of, mintEvents, type AssetInfo, type MintEvent } from '$lib/lake/assets';
	import { tokenDetail, type TokenDetail } from '$lib/lake/offchain';
	import { lake, summaryQuery, summarySql } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { utc } from '$lib/cardano';
	import { num, parseUnit, shorten, tokenAmount } from '$lib/format';

	/*
	 * One native asset: supply and mint/burn history (from the asset index and the assets table), the token
	 * registry entry (CIP-26, fetched by the browser), the NFT's CIP-25 metadata from its mint transaction, and how
	 * busy its policy is.
	 */
	const unit = $derived((page.params.unit ?? '').split('?')[0].toLowerCase());
	const info = $derived(parseUnit(unit));
	let attempt = $state(0);
	const asset = $derived.by(() => {
		attempt;
		return assetByUnit(unit);
	});

	let registry = $state<{ unit: string; d: TokenDetail | null } | null>(null);
	$effect(() => {
		const u = unit;
		tokenDetail(u).then((d) => (registry = { unit: u, d }));
	});
	const reg = $derived(registry?.unit === unit ? registry.d : null);

	let events = $state<{ unit: string; rows: MintEvent[] } | null>(null);
	let nft = $state<{ unit: string; meta: Record<string, unknown> | null } | null>(null);
	$effect(() => {
		const p = asset;
		p.then(async (a) => {
			if (!a || asset !== p) return;
			const rows = await mintEvents(a).catch(() => []);
			events = { unit: a.unit, rows };
			const first = rows.filter((r) => !r.quantity.startsWith('-')).at(-1);
			if (first && a.supply !== '0' && a.mints <= 3) {
				const meta = await cip25Of(a, first.tx_hash, new Date(first.date).toISOString().slice(0, 10)).catch(() => null);
				nft = { unit: a.unit, meta };
			}
		});
	});
	const evRows = $derived(events?.unit === unit ? events.rows : null);
	const meta = $derived(nft?.unit === unit ? nft.meta : null);
	const image = $derived(meta ? imageUrl(meta.image) : null);
	let imageFailed = $state(false);

	let range = $state(rangeOf(hashParam('range'), '90d').id);
	const r = $derived(rangeOf(range));
	const activity = $derived(
		lake.tip?.date && r.days
			? summaryQuery<{ date: Date; txs: number; outputs: number }>(
					`SELECT date, txs, outputs FROM {asset_daily} WHERE policy = '${info.policy}' AND date > DATE '${since(lake.tip.date, r.days)}' ORDER BY date`
				)
			: null
	);

	const decimals = $derived(reg?.decimals ?? 0);
	const amount = (q: string) => (decimals ? tokenAmount(q, decimals) : num(q));
	const isNft = (a: AssetInfo) => a.supply === '1' || (a.supply === '0' && a.mints === 1);
</script>

<svelte:head><title>{reg?.ticker ?? info.name} · Asset · Yaci Lens</title></svelte:head>

<PageHeader kind="Asset" title={reg?.name ?? (meta?.name ? String(meta.name) : info.name)}>
	{#snippet icon()}<Coins class="h-5 w-5" />{/snippet}
	<div class="flex items-start gap-1.5">
		<span class="mono break-all text-xs text-faint">{unit}</span>
		<CopyButton value={unit} label="Asset unit copied" />
	</div>
	{#if reg?.description}<p class="mt-2 max-w-3xl text-sm text-muted">{reg.description}</p>{/if}
	{#snippet actions()}
		{#if reg?.ticker}<span title="Cardano token registry (CIP-26)"><Badge tone="cyan">{reg.ticker}</Badge></span>{/if}
		{#if info.label}<Badge tone="violet">CIP-68 {info.label}</Badge>{/if}
		{#if reg?.url}<a class="y-btn h-8 text-xs" href={reg.url} target="_blank" rel="noopener noreferrer nofollow">Website<ExternalLink class="h-3.5 w-3.5" /></a>{/if}
	{/snippet}
</PageHeader>

{#await asset}
	<div class="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
		<div class="y-panel"><Skeleton rows={3} /></div>
		<div class="y-panel"><Skeleton rows={3} /></div>
	</div>
{:then a}
	{#if !a}
		<div class="y-panel p-6 text-sm text-muted">No asset with unit {shorten(unit, 16, 10)} was minted in the published data. Check the policy id and the asset name (hex).</div>
	{:else}
		<section class="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
			<div class="y-panel relative flex items-center gap-5 overflow-hidden p-5">
				<div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/10 blur-2xl"></div>
				{#if reg?.logo}
					<img src={reg.logo} alt={reg.ticker ?? info.name} class="h-16 w-16 shrink-0 rounded-full border border-line object-cover" />
				{:else if image && !imageFailed}
					<img src={image} alt={String(meta?.name ?? info.name)} class="h-20 w-20 shrink-0 rounded-2xl border border-line object-cover" referrerpolicy="no-referrer" loading="lazy" onerror={() => (imageFailed = true)} />
				{:else}
					<AssetAvatar policy={info.policy} name={info.name} size={64} />
				{/if}
				<div class="min-w-0">
					<div class="y-label">{isNft(a) ? 'NFT' : 'Supply'}</div>
					<div class="mt-1 break-all font-display text-3xl font-semibold tabular-nums tracking-tight" title={a.supply}>
						{isNft(a) ? (a.supply === '0' ? 'Burned' : 'One of one') : amount(a.supply)}
					</div>
					<div class="mt-1 text-xs text-muted">
						{#if isNft(a)}supply {a.supply}{:else if decimals}in circulation ({reg?.ticker ?? 'token'}, {decimals} decimals){:else}units in circulation, before decimals{/if}
					</div>
				</div>
			</div>
			<div class="y-panel p-5">
				<dl class="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
					<KV label="Policy id"><Hash value={a.policy} href="#/assets/policy/{a.policy}" head={10} tail={6} /> <NameTag kind="script" id={a.policy} /></KV>
					<KV label="Fingerprint">{#if a.fingerprint}<Hash value={a.fingerprint} head={12} tail={6} />{:else}<span class="text-faint">—</span>{/if}</KV>
					<KV label="Asset name">
						{#if info.nameHex}<span class="font-medium">{info.name}</span> <span class="mono text-xs text-faint" title={info.nameHex}>0x{shorten(info.nameHex, 10, 6)}</span>{:else}<span class="text-muted">Empty name</span>{/if}
					</KV>
					<KV label="Mints / burns">{a.mints} / {a.burns}</KV>
					<KV label="First minted">{new Date(a.first_date).toISOString().slice(0, 10)}</KV>
					<KV label="Last mint or burn">{new Date(a.last_date).toISOString().slice(0, 10)}</KV>
				</dl>
			</div>
		</section>

		{#if indexed}<HoldersPanel {unit} {decimals} />{/if}

		<section class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
			<Panel title="Policy activity" sub="Transactions with an output holding this policy's tokens, per day">
				{#snippet actions()}<RangePicker bind:value={range} options={RANGES.filter((x) => x.days != null)} />{/snippet}
				{#if activity}
					{#await activity}
						<Skeleton rows={4} />
					{:then rows}
						<SeriesChart x={rows.map((x) => new Date(x.date).toISOString().slice(0, 10))} series={[{ name: 'Transactions', values: rows.map((x) => x.txs), slot: 0 }]} kind="bar" height={170} label="Transactions moving this policy's tokens per day" />
						<div class="mt-2 text-right"><SqlButton sql={summarySql(`SELECT date, txs, outputs, units FROM {asset_daily} WHERE policy = '${a.policy}' ORDER BY date DESC`)} /></div>
					{/await}
				{/if}
			</Panel>
			<Panel title="Mint & burn" sub={a.event_dates && a.event_dates.split(',').length >= 40 ? 'The 40 earliest days with a mint or burn' : 'Every mint and burn'} flush>
				{#if !evRows}
					<Skeleton rows={5} />
				{:else if !evRows.length}
					<p class="p-5 text-sm text-muted">No events found.</p>
				{:else}
					<ul class="max-h-80 divide-y divide-line/70 overflow-y-auto">
						{#each evRows as ev (ev.tx_hash + ev.quantity)}
							<li class="flex items-center gap-3 px-5 py-2.5 text-sm">
								<Badge tone={ev.quantity.startsWith('-') ? 'warn' : 'brand'}>{ev.quantity.startsWith('-') ? 'Burn' : 'Mint'}</Badge>
								<a class="y-link mono text-xs" href="#/transactions/{ev.tx_hash}?date={new Date(ev.date).toISOString().slice(0, 10)}">{shorten(ev.tx_hash, 10, 6)}</a>
								<span class="text-xs text-faint">{utc(ev.block_time)}</span>
								<span class="ml-auto font-semibold tabular-nums {ev.quantity.startsWith('-') ? 'text-danger' : 'text-mint'}">{ev.quantity.startsWith('-') ? '' : '+'}{amount(ev.quantity)}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Panel>
		</section>

		{#if meta}
			<Panel title="Mint metadata (CIP-25)" sub="Label 721 of the transaction that first minted it" class="mb-6">
				<JsonView value={meta} label="CIP-25 metadata" />
			</Panel>
		{/if}
		<p class="text-xs text-faint">
			Holders and current UTxOs aren't in the published data (it has no address index); query <span class="mono">address_utxo</span> for a day in the
			<a class="y-link" href="#/sql">SQL lab</a>.
		</p>
	{/if}
{:catch e}
	<div class="y-panel"><ErrorBox title="Couldn't look up the asset" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}
