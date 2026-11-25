<script lang="ts">
	import TokenName from '$lib/names/TokenName.svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Bug from '@lucide/svelte/icons/bug';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import { live } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { txDay } from '$lib/lake/replay';
	import { int, utc } from '$lib/cardano';
	import { ada, shorten } from '$lib/format';

	const txHash = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());
	const given = $derived.by(() => {
		page.url.hash;
		const d = hashParam('date');
		return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
	});
	// Without ?date=, the tx index finds the day.
	let found = $state<{ hash: string; date: string | null } | null>(null);
	$effect(() => {
		const h = txHash;
		if (given || !/^[0-9a-f]{64}$/.test(h) || found?.hash === h) return;
		txDay(h)
			.then((d) => (found = { hash: h, date: d }))
			.catch(() => (found = { hash: h, date: null }));
	});
	const date = $derived(given ?? (found?.hash === txHash ? found.date : null));
	const lookingUp = $derived(!given && found?.hash !== txHash);
	let pickDate = $state('');

	interface Ref {
		tx_hash: string;
		output_index: number;
	}
	interface TxRow {
		tx_hash: string;
		block: number;
		slot: number;
		epoch: number;
		block_time: Date;
		tx_index: number;
		fee: number;
		invalid: boolean;
		ttl: number | null;
		validity_interval_start: number | null;
		total_collateral: number | null;
		treasury_donation: number | null;
		inputs: string | null;
		reference_inputs: string | null;
		collateral_inputs: string | null;
		required_signers: string | null;
		auxiliary_datahash: string | null;
		script_datahash: string | null;
	}
	interface OutRow {
		output_index: number;
		owner_addr: string;
		asset_unit: string;
		quantity: string;
		inline_datum: string | null;
		data_hash: string | null;
		reference_script_hash: string | null;
	}
	interface ScriptRow {
		purpose: string;
		redeemer_index: number;
		script_hash: string;
		script_type: number;
		unit_mem: number;
		unit_steps: number;
		redeemer_cbor: string;
		datum_hash: string | null;
	}
	interface MetaRow {
		label: string;
		body: string;
	}

	const q = (h: string, d: string) => ({
		tx: `SELECT * EXCLUDE (outputs, collateral_return, collateral_return_json) FROM transaction WHERE date = DATE '${d}' AND tx_hash = '${h}'`,
		outs: `SELECT output_index, owner_addr, asset_unit, quantity::VARCHAR AS quantity, inline_datum, data_hash, reference_script_hash
FROM address_utxo WHERE date = DATE '${d}' AND tx_hash = '${h}' ORDER BY output_index, asset_unit <> 'lovelace', asset_unit`,
		scripts: `SELECT purpose, redeemer_index, script_hash, script_type, unit_mem, unit_steps, redeemer_cbor, datum_hash
FROM transaction_scripts WHERE date = DATE '${d}' AND tx_hash = '${h}' ORDER BY purpose, redeemer_index`,
		meta: `SELECT label, body FROM transaction_metadata WHERE date = DATE '${d}' AND tx_hash = '${h}' ORDER BY label`
	});

	function load(h: string, d: string) {
		const s = q(h, d);
		const tx = live<TxRow>(s.tx);
		return { tx, outs: tx.then(() => live<OutRow>(s.outs)), scripts: tx.then(() => live<ScriptRow>(s.scripts)), meta: tx.then(() => live<MetaRow>(s.meta)) };
	}
	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return /^[0-9a-f]{64}$/.test(txHash) && date ? load(txHash, date) : null;
	});

	function refs(json: string | null): Ref[] {
		try {
			return json ? (JSON.parse(json) as Ref[]) : [];
		} catch {
			return [];
		}
	}

	function outputs(rows: OutRow[]) {
		const by = new Map<number, { index: number; address: string; lovelace: string; assets: { unit: string; quantity: string }[]; datum: string | null; dataHash: string | null; refScript: string | null }>();
		for (const r of rows) {
			let o = by.get(r.output_index);
			if (!o) {
				o = { index: r.output_index, address: r.owner_addr, lovelace: '0', assets: [], datum: r.inline_datum, dataHash: r.data_hash, refScript: r.reference_script_hash };
				by.set(r.output_index, o);
			}
			if (r.asset_unit === 'lovelace') o.lovelace = r.quantity;
			else o.assets.push({ unit: r.asset_unit, quantity: r.quantity });
		}
		return [...by.values()];
	}

	const PLUTUS: Record<number, string> = { 1: 'Plutus V1', 2: 'Plutus V2', 3: 'Plutus V3', 0: 'Native' };
</script>

<svelte:head><title>Transaction {shorten(txHash, 8, 6)} · Yaci Lens</title></svelte:head>

<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
	{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
	<Hash value={txHash} full />
</PageHeader>

{#if !date && lookingUp}
	<div class="y-panel"><Skeleton rows={4} /></div>
{:else if !date}
	<div class="y-panel p-6 text-sm">
		<p class="text-muted">
			This transaction isn't in the transaction index of the published data (it may be newer than the snapshot). If you know the UTC date it was
			included on, enter it:
		</p>
		<form class="mt-4 flex gap-2" onsubmit={(e) => (e.preventDefault(), pickDate && goto(`#/transactions/${txHash}?date=${pickDate}`))}>
			<input class="y-input h-9 w-48" type="date" bind:value={pickDate} />
			<button class="y-btn h-9">Open</button>
		</form>
	</div>
{:else if data}
	{#await data.tx}
		<div class="y-panel"><Skeleton rows={8} /></div>
	{:then [t]}
		{#if !t}
			<div class="y-panel p-6 text-sm text-muted">No transaction {shorten(txHash)} on {date}. Check the date (UTC) of its block.</div>
		{:else}
			<Panel title="Overview" class="mb-6">
				{#snippet actions()}<SqlButton sql={q(txHash, date).tx} />{/snippet}
				<dl class="grid gap-x-10 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
					<KV label="Block"><a class="y-link" href="#/blocks/{t.block}">#{int(t.block)}</a> · index {t.tx_index}</KV>
					<KV label="Time">{utc(t.block_time)}</KV>
					<KV label="Epoch / slot"><a class="y-link" href="#/epochs/{t.epoch}">{t.epoch}</a> / {int(t.slot)}</KV>
					<KV label="Fee">₳{ada(t.fee)}</KV>
					<KV label="Validity">{t.validity_interval_start ? `from slot ${int(t.validity_interval_start)}` : 'any'} · {t.ttl ? `until slot ${int(t.ttl)}` : 'no TTL'}</KV>
					<KV label="Status">{#if t.invalid}<Badge tone="bad">phase-2 invalid</Badge>{:else}<Badge tone="ok">valid</Badge>{/if}</KV>
					{#if t.total_collateral}<KV label="Collateral">₳{ada(t.total_collateral)}</KV>{/if}
					{#if t.treasury_donation}<KV label="Treasury donation">₳{ada(t.treasury_donation)}</KV>{/if}
					{#if t.required_signers}<KV label="Required signers" wide><span class="font-mono text-xs break-all">{t.required_signers}</span></KV>{/if}
				</dl>
			</Panel>

			<section class="mb-6 grid gap-6 xl:grid-cols-2">
				<Panel title="Inputs" sub="Outputs this transaction spends" flush>
					<ul class="divide-y divide-line/70 text-sm">
						{#each refs(t.inputs) as r (r.tx_hash + r.output_index)}
							<li class="px-5 py-2.5 font-mono text-xs">{shorten(r.tx_hash, 12, 8)}#{r.output_index}</li>
						{/each}
						{#each refs(t.reference_inputs) as r (r.tx_hash + r.output_index)}
							<li class="flex items-center gap-2 px-5 py-2.5 font-mono text-xs">{shorten(r.tx_hash, 12, 8)}#{r.output_index} <Badge tone="info">reference</Badge></li>
						{/each}
						{#each refs(t.collateral_inputs) as r (r.tx_hash + r.output_index)}
							<li class="flex items-center gap-2 px-5 py-2.5 font-mono text-xs">{shorten(r.tx_hash, 12, 8)}#{r.output_index} <Badge tone="warn">collateral</Badge></li>
						{/each}
					</ul>
					<p class="border-t border-line/70 px-5 py-2.5 text-xs text-faint">Input values need the transaction index (planned): an input's output lives in the partition of the day it was created.</p>
				</Panel>

				<Panel title="Outputs" flush>
					{#snippet actions()}<SqlButton sql={q(txHash, date).outs} />{/snippet}
					{#await data.outs}
						<Skeleton rows={3} />
					{:then rows}
						<ul class="divide-y divide-line/70">
							{#each outputs(rows) as o (o.index)}
								<li class="px-5 py-3 text-sm">
									<div class="flex items-center justify-between gap-3">
										<span class="min-w-0 truncate font-mono text-xs"><span class="text-faint">#{o.index}</span> {shorten(o.address, 16, 10)}</span>
										<span class="font-semibold tabular-nums">₳{ada(o.lovelace)}</span>
									</div>
									{#if o.assets.length}
										<div class="mt-1.5 flex flex-wrap gap-1">
											{#each o.assets.slice(0, 6) as a (a.unit)}<Badge tone="neutral"><TokenName unit={a.unit} quantity={a.quantity} /></Badge>{/each}
											{#if o.assets.length > 6}<Badge tone="neutral">+{o.assets.length - 6}</Badge>{/if}
										</div>
									{/if}
									{#if o.datum || o.dataHash || o.refScript}
										<div class="mt-1.5 flex flex-wrap gap-1">
											{#if o.datum}<Badge tone="violet">inline datum</Badge>{/if}
											{#if o.dataHash}<Badge tone="violet">datum hash</Badge>{/if}
											{#if o.refScript}<Badge tone="cyan">reference script</Badge>{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{:catch e}
						<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
					{/await}
				</Panel>
			</section>

			{#await data.scripts then scripts}
				{#if scripts.length}
					<Panel title="Script executions" sub="Redeemers, in ledger order" class="mb-6" flush>
						{#snippet actions()}<SqlButton sql={q(txHash, date).scripts} />{/snippet}
						<ul class="divide-y divide-line/70">
							{#each scripts as s (s.purpose + s.redeemer_index)}
								<li class="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
									<Badge tone="violet">{s.purpose} #{s.redeemer_index}</Badge>
									<span class="font-mono text-xs">{shorten(s.script_hash, 10, 8)}</span>
									<span class="text-xs text-muted">{PLUTUS[s.script_type] ?? `type ${s.script_type}`}</span>
									<span class="ml-auto text-xs tabular-nums text-muted">{int(s.unit_steps)} steps · {int(s.unit_mem)} mem</span>
									<a class="y-btn h-8 text-xs" href="#/lab?script={s.script_hash}" title="Open the script in the validator lab">Lab</a>
									<a class="y-btn y-btn-primary h-8 text-xs" href="#/transactions/{txHash}/debug/{s.purpose.toLowerCase()}/{s.redeemer_index}?date={date}" title="Re-run this script with the transaction's real inputs in the julc debugger"><Bug class="h-3.5 w-3.5" />Debug</a>
								</li>
							{/each}
						</ul>
					</Panel>
				{/if}
			{/await}

			{#await data.meta then meta}
				{#if meta.length}
					<Panel title="Metadata" class="mb-6">
						{#snippet actions()}<SqlButton sql={q(txHash, date).meta} />{/snippet}
						{#each meta as m (m.label)}
							<div class="mb-3 last:mb-0">
								<div class="y-label mb-1">Label {m.label}</div>
								<JsonView value={(() => { try { return JSON.parse(m.body); } catch { return m.body; } })()} />
							</div>
						{/each}
					</Panel>
				{/if}
			{/await}
		{/if}
	{:catch e}
		<div class="y-panel"><ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
	{/await}
{/if}
