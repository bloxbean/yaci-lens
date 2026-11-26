<script lang="ts">
	import Coins from '@lucide/svelte/icons/coins';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Layers from '@lucide/svelte/icons/layers';
	import Activity from '@lucide/svelte/icons/activity';
	import Image from '@lucide/svelte/icons/image';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import AssetChip from '$lib/ui/AssetChip.svelte';
	import NameTag from '$lib/names/NameTag.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import BarList from '$lib/charts/BarList.svelte';
	import RangePicker, { rangeOf, RANGES } from '$lib/charts/RangePicker.svelte';
	import { bucket, short, since } from '$lib/charts/series';
	import { lake, summaryQuery, summarySql } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { searchTokens, unitByFingerprint, type TokenRow } from '$lib/lake/assets';
	import { tokenName } from '$lib/names/names.svelte';
	import { parseUnit, shorten } from '$lib/format';

	/*
	 * Native assets: look up any token (name, ticker, policy id, unit or asset1… fingerprint), see how busy tokens
	 * are (transactions moving them) and what is being minted. History-wide views come from the summary pack.
	 */
	const RANGES_365 = RANGES.filter((r) => r.days != null);
	let range = $state(rangeOf(hashParam('range'), '30d').id);
	const r = $derived(rangeOf(range));
	const tipDay = $derived(lake.tip?.date ?? null);

	// ---- search -------------------------------------------------------------------------------------------------
	let text = $state('');
	let results = $state<TokenRow[] | null>(null);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function direct(v: string): Promise<string | null> {
		const s = v.trim().toLowerCase();
		if (/^asset1[0-9a-z]{38}$/.test(s)) {
			const u = await unitByFingerprint(s);
			if (!u) throw new Error(`No asset with fingerprint ${s} in the published data.`);
			return `#/assets/unit/${u}`;
		}
		if (/^[0-9a-f]{56}$/.test(s)) return `#/assets/policy/${s}`;
		if (/^[0-9a-f]{58,120}$/.test(s) && s.length % 2 === 0) return `#/assets/unit/${s}`;
		return null;
	}
	async function submit(e: Event) {
		e.preventDefault();
		searchError = null;
		try {
			const to = await direct(text);
			if (to) return goto(to);
			run(text);
		} catch (err) {
			searchError = (err as Error).message;
		}
	}
	function run(v: string) {
		if (v.trim().length < 2) return void (results = null);
		searching = true;
		searchTokens(v)
			.then((rows) => (results = rows))
			.catch((err) => (searchError = String(err?.message ?? err)))
			.finally(() => (searching = false));
	}
	function typed(v: string) {
		text = v;
		searchError = null;
		if (timer) clearTimeout(timer);
		if (/^(asset1|[0-9a-f]{40,})/i.test(v.trim())) return;
		timer = setTimeout(() => run(v), 250);
	}

	// ---- data -----------------------------------------------------------------------------------------------------
	interface MintDay {
		date: Date;
		new_units: number;
		new_nfts: number;
		new_policies: number;
		mint_events: number;
		burn_events: number;
	}
	interface TokenDay {
		date: Date;
		token_txs: number;
		active_policies: number;
	}
	interface TopPolicy {
		policy: string;
		txs: number;
		days: number;
		unit: string | null;
		name: string | null;
		sample_unit: string | null;
		units: number | null;
	}

	let attempt = $state(0);
	const totals = $derived.by(() => {
		attempt;
		return Promise.all([
			summaryQuery<{ units: number; nfts: number; policies: number }>(`SELECT sum(new_units)::DOUBLE AS units, sum(new_nfts)::DOUBLE AS nfts, sum(new_policies)::DOUBLE AS policies FROM {asset_mint_daily}`),
			summaryQuery<{ n: number }>(`SELECT count(*)::DOUBLE AS n FROM {asset_tokens}`),
			summaryQuery<MintDay>(`SELECT * FROM {asset_mint_daily} ORDER BY date`),
			summaryQuery<TokenDay>(`SELECT * FROM {token_daily} ORDER BY date`)
		]).then(([[t], [ft], mints, tokenDays]) => ({ t, ft: ft.n, mints, tokenDays }));
	});

	const topSql = (from: string) => `WITH a AS (
  SELECT policy, sum(txs)::DOUBLE AS txs, count(*)::DOUBLE AS days FROM {asset_daily} WHERE date > DATE '${from}' GROUP BY 1 ORDER BY txs DESC LIMIT 15
),
t AS (SELECT policy, arg_max(unit, mints) AS unit, arg_max(name, mints) AS name FROM {asset_tokens} WHERE policy IN (SELECT policy FROM a) GROUP BY 1),
p AS (SELECT policy, sample_unit, units FROM {asset_policies} WHERE policy IN (SELECT policy FROM a))
SELECT a.policy, a.txs, a.days, t.unit, t.name, p.sample_unit, p.units FROM a LEFT JOIN t USING (policy) LEFT JOIN p USING (policy) ORDER BY a.txs DESC`;
	const top = $derived(tipDay && r.days ? summaryQuery<TopPolicy>(topSql(since(tipDay, r.days))) : null);
	const collections = summaryQuery<{ policy: string; units: number; nft_units: number; sample_unit: string | null; last_date: Date }>(
		`SELECT policy, units, nft_units, sample_unit, last_date FROM {asset_policies} ORDER BY units DESC LIMIT 10`
	);

	const inRange = <T extends { date: Date }>(rows: T[]) => (tipDay && r.days ? rows.filter((x) => new Date(x.date) > new Date(since(tipDay, r.days!))) : rows);
	const nameOf = (p: TopPolicy) => {
		const unit = p.unit ?? p.sample_unit;
		const reg = unit ? tokenName(unit) : null;
		return reg?.ticker ?? reg?.name ?? p.name ?? (unit ? parseUnit(unit).name : null) ?? shorten(p.policy, 8, 6);
	};
</script>

<svelte:head><title>Assets · Yaci Lens</title></svelte:head>

<PageHeader kind="Explore" title="Native assets">
	{#snippet icon()}<Coins class="h-5 w-5" />{/snippet}
	{#snippet actions()}<RangePicker bind:value={range} options={RANGES_365} />{/snippet}
	Every token and NFT minted on Cardano: look one up, see which tokens move the most and what is being minted.
</PageHeader>

<section class="y-panel mb-6 p-5">
	<form class="flex gap-2" onsubmit={submit}>
		<label class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
			<input
				class="y-input h-11 w-full pl-9"
				placeholder="Token name or ticker (e.g. SNEK, iUSD), policy id, unit or asset1… fingerprint"
				value={text}
				oninput={(e) => typed(e.currentTarget.value)}
				spellcheck="false"
				aria-label="Search assets"
			/>
		</label>
		<button class="y-btn y-btn-primary h-11 px-5">Search</button>
	</form>
	{#if searchError}<p class="mt-3 text-sm text-danger">{searchError}</p>{/if}
	{#if searching}
		<div class="mt-4"><Skeleton rows={3} /></div>
	{:else if results}
		{#if !results.length}
			<p class="mt-4 text-sm text-muted">No fungible token named like “{text}”. NFTs are found by policy id, unit or fingerprint.</p>
		{:else}
			<div class="mt-4 overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-line text-left"><th class="y-label py-2 pr-4">Token</th><th class="y-label py-2 pr-4">Policy</th><th class="y-label py-2 pr-4 text-right">Supply</th><th class="y-label py-2 pr-4 text-right">Mints</th><th class="y-label py-2 text-right" title="Transactions moving the policy's tokens, last 30 days">Txs (30d)</th></tr>
					</thead>
					<tbody>
						{#each results as t (t.unit)}
							<tr class="border-b border-line/60 last:border-0 hover:bg-surface-2/60">
								<td class="py-2 pr-4"><AssetChip unit={t.unit} />{#if t.standard}<span class="ml-1.5 text-[10px] text-faint">{t.standard}</span>{/if}</td>
								<td class="py-2 pr-4"><a class="y-link mono text-xs" href="#/assets/policy/{t.policy}">{shorten(t.policy, 8, 6)}</a> <NameTag kind="script" id={t.policy} /></td>
								<td class="py-2 pr-4 text-right tabular-nums">{short(Number(t.supply))}</td>
								<td class="py-2 pr-4 text-right tabular-nums text-muted">{t.mints}</td>
								<td class="py-2 text-right tabular-nums">{short(t.policy_txs_30d)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</section>

{#await totals}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel mb-6"><Skeleton rows={6} /></div>
{:then d}
	{@const shownTokens = inRange(d.tokenDays)}
	{@const shownMints = inRange(d.mints)}
	{@const mintBuckets = bucket(shownMints, ['new_units', 'new_nfts'], r.days)}
	{@const newInRange = shownMints.reduce((a, x) => a + x.new_units, 0)}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="Assets ever minted" value={short(d.t.units)} sub="{short(d.t.nfts)} with a supply of one (NFTs)">
			{#snippet icon()}<Sparkles class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Minting policies" value={short(d.t.policies)} sub="{short(d.ft)} fungible tokens" color="rgb(var(--c-violet))">
			{#snippet icon()}<Layers class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="New assets" value={short(newInRange)} sub="last {r.label.toLowerCase()} · {short(shownMints.reduce((a, x) => a + x.new_policies, 0))} new policies" trend={shownMints.map((x) => x.new_units)} color="rgb(var(--c-mint))">
			{#snippet icon()}<Image class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Token transactions / day" value={short(shownTokens.length ? shownTokens.reduce((a, x) => a + x.token_txs, 0) / shownTokens.length : 0)} sub="average, last {r.label.toLowerCase()}" trend={shownTokens.map((x) => x.token_txs)} color="rgb(var(--c-blue))">
			{#snippet icon()}<Activity class="h-4 w-4" />{/snippet}
		</Stat>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Transactions moving native tokens" sub="Per day: transactions with an output holding any native token">
			{#snippet actions()}<SqlButton sql={summarySql(`SELECT date, token_txs, active_policies FROM {token_daily} ORDER BY date DESC`)} />{/snippet}
			<SeriesChart
				x={shownTokens.map((x) => new Date(x.date).toISOString().slice(0, 10))}
				series={[{ name: 'Token transactions', values: shownTokens.map((x) => x.token_txs), slot: 0 }]}
				kind="area"
				height={180}
				label="Transactions moving native tokens per day"
			/>
		</Panel>
		<Panel title="New assets minted" sub="NFTs (supply of one) and fungible tokens, by first mint">
			{#snippet actions()}<SqlButton sql={summarySql(`SELECT date, new_units, new_nfts, new_policies, mint_events, burn_events FROM {asset_mint_daily} ORDER BY date DESC`)} />{/snippet}
			<SeriesChart
				x={mintBuckets.map((b) => b.label)}
				series={[
					{ name: 'NFTs', values: mintBuckets.map((b) => b.values.new_nfts), slot: 3 },
					{ name: 'Fungible tokens', values: mintBuckets.map((b) => b.values.new_units - b.values.new_nfts), slot: 2 }
				]}
				kind="stacked"
				height={180}
				label="New assets minted, NFTs and fungible tokens"
			/>
		</Panel>
	</section>
{:catch e}
	<div class="y-panel mb-6"><ErrorBox title="Couldn't load asset summaries" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}

<section class="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
	<Panel title="Most used tokens" sub="Transactions moving the policy's tokens, last {r.label.toLowerCase()}">
		{#snippet actions()}{#if tipDay && r.days}<SqlButton sql={summarySql(topSql(since(tipDay, r.days)))} />{/if}{/snippet}
		{#if !top}
			<Skeleton rows={8} />
		{:else}
			{#await top}
				<Skeleton rows={8} />
			{:then rows}
				<BarList {rows} value={(p) => p.txs} href={(p) => (p.unit ? `#/assets/unit/${p.unit}` : `#/assets/policy/${p.policy}`)} extra={(p) => (p.units && p.units > 1 ? `${short(p.units)} assets` : '')}>
					{#snippet label(p)}
						<span class="font-medium">{nameOf(p)}</span>
						<NameTag kind="script" id={p.policy} />
					{/snippet}
				</BarList>
			{:catch e}
				<ErrorBox title="Query failed" message={String(e?.message ?? e)} />
			{/await}
		{/if}
	</Panel>
	<Panel title="Largest collections" sub="Policies with the most assets, all time">
		{#await collections}
			<Skeleton rows={8} />
		{:then rows}
			<BarList {rows} value={(p) => p.units} href={(p) => `#/assets/policy/${p.policy}`} color="var(--s4)" extra={(p) => `last mint ${new Date(p.last_date).toISOString().slice(0, 7)}`}>
				{#snippet label(p)}
					<span class="font-medium">{p.sample_unit ? parseUnit(p.sample_unit).name.replace(/\s*#?\d+$/, '') || shorten(p.policy, 8, 6) : shorten(p.policy, 8, 6)}</span>
					<NameTag kind="script" id={p.policy} />
				{/snippet}
			</BarList>
		{/await}
	</Panel>
</section>
