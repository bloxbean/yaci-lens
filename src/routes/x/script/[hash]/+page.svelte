<script lang="ts">
	import FileCode from '@lucide/svelte/icons/file-code';
	import Bug from '@lucide/svelte/icons/bug';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import PlutusView from '$lib/ui/PlutusView.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import { adaCompact } from '$lib/format';
	import Cost from '$lib/indexdb/Cost.svelte';
	import PrevNext from '$lib/ui/PrevNext.svelte';
	import { keysetPages } from '$lib/ui/keyset.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import type { Cost as CostT, ScriptOutput, ScriptRun } from '$lib/indexdb/service';
	import { live } from '$lib/lake/lake.svelte';
	import { ada, compact } from '$lib/format';
	import { int } from '$lib/cardano';

	/*
	 * EXPERIMENTAL smart contract explorer from the SQLite script index:
	 *  - executions: every redeemer of the script, newest first, each debuggable in julc with the real context;
	 *  - state: the outputs locked at the script's address over time, with their datum (hash, or inline) and the
	 *    transaction that spent each one. A datum's content is read from the lake (one partition) on request.
	 * Outputs at one script are not assumed to form one state machine: that needs contract-specific knowledge.
	 */
	const hash = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());

	let svc: typeof import('$lib/indexdb/service') | null = null;
	const time = (slot: number) => (svc ? svc.slotTime(slot).toISOString().slice(0, 16).replace('T', ' ') : int(slot));
	const day = (slot: number) => (svc ? svc.slotDay(slot) : '');

	const S = async () => (svc ??= await import('$lib/indexdb/service'));

	// value locked at the script's address over time (outputs locked minus spent, per day)
	const tvl = $derived(/^[0-9a-f]{56}$/.test(hash) ? import('$lib/indexdb/service').then((s) => s.getScriptDays(hash)) : null);
	function locked(days: import('$lib/indexdb/service').ScriptDay[]) {
		let run = 0;
		return days.map((d) => (run += d.adaIn - d.adaOut) / 1e6);
	}

	// executions and state outputs: pages of 25, newest first
	const runs = keysetPages<ScriptRun>(async (c) => (await S()).getScriptActivity(hash, c, 25));
	const outs = keysetPages<ScriptOutput>(async (c) => (await S()).getScriptOutputs(hash, c, 25));
	// what spent each listed output: loaded after the table shows (one indexed lookup per output, in parallel)
	let spent = $state(new Map<string, string | null>());
	let spentCost = $state<CostT | null>(null);
	$effect(() => {
		const rows = outs.st.rows.filter((o) => !spent.has(`${o.tx}#${o.idx}`));
		if (!rows.length || !svc) return;
		const s = svc;
		untrack(() =>
			s.spentStatus(rows).then((r) => {
				spent = new Map([...spent, ...r.data]);
				spentCost = r.cost;
			})
		);
	});

	$effect(() => {
		hash;
		untrack(() => {
			void runs.reset(hash);
			void outs.reset(hash);
		});
	});

	let datum = $state<{ key: string; cbor: Promise<string | null> } | null>(null);
	function showDatum(o: ScriptOutput) {
		const key = `${o.tx}#${o.idx}`;
		if (datum?.key === key) return (datum = null);
		datum = {
			key,
			cbor: live<{ inline_datum: string | null }>(
				`SELECT inline_datum FROM address_utxo WHERE date = DATE '${day(o.slot)}' AND tx_hash = '${o.tx}' AND output_index = ${o.idx} AND asset_unit = 'lovelace'`
			).then(async (r) => {
				if (r[0]?.inline_datum) return r[0].inline_datum;
				if (!o.datum) return null;
				// the datum table is partitioned by the day a datum was first seen: try the output's day (one partition)
				const d = await live<{ datum: string }>(`SELECT datum FROM datum WHERE date = DATE '${day(o.slot)}' AND hash = '${o.datum}' LIMIT 1`);
				return d[0]?.datum ?? null;
			})
		};
	}
</script>

<svelte:head><title>Script {hash.slice(0, 10)} · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental · indexed · script" title={`${hash.slice(0, 12)}…${hash.slice(-8)}`}>
	{#snippet icon()}<FileCode class="h-5 w-5" />{/snippet}
	{#snippet actions()}<a class="y-btn h-9" href="#/scripts/{hash}">Script analytics</a>{/snippet}
</PageHeader>

<Gate>
	{#if !/^[0-9a-f]{56}$/.test(hash)}
		<div class="y-panel p-6 text-sm text-muted">Not a script hash.</div>
	{:else}
		{#if tvl}
			{#await tvl}
				<div class="y-panel mb-6"><Skeleton rows={4} /></div>
			{:then t}
				{#if t.data.length}
					{@const v = locked(t.data)}
					<div class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" data-testid="script-tvl">
						<Panel title="Value locked over time" sub="ADA in outputs at the script's address (locked - spent, per day) · now {adaCompact(v[v.length - 1] * 1e6)} ₳">
							{#snippet actions()}<Cost cost={t.cost} />{/snippet}
							<SeriesChart kind="area" x={t.data.map((d) => d.date)} series={[{ name: 'Locked (ADA)', values: v.map((x) => Math.max(0, x)) }]} format={(x) => adaCompact(x * 1e6)} label="Value locked" />
						</Panel>
						<Panel title="Outputs locked and spent per day" sub="last 90 active days">
							<SeriesChart kind="bar" x={t.data.slice(-90).map((d) => d.date)} series={[{ name: 'Locked', values: t.data.slice(-90).map((d) => d.outsIn), slot: 1 }, { name: 'Spent', values: t.data.slice(-90).map((d) => d.outsOut), slot: 3 }]} label="Outputs per day" />
						</Panel>
					</div>
				{/if}
			{:catch}{/await}
		{/if}
		<div class="grid gap-6 xl:grid-cols-2">
			<Panel title="Executions" sub="redeemers, newest first" flush>
				{#snippet actions()}<Cost cost={runs.st.cost} />{/snippet}
				{#if runs.st.error}<ErrorBox message={runs.st.error} retry={() => runs.show(runs.st.page)} />{/if}
				{#if !runs.st.rows.length && runs.st.busy}<Skeleton rows={8} />
				{:else if !runs.st.rows.length}<div class="p-6 text-sm text-muted">No executions in the published data.</div>
				{:else}
					<table class="w-full text-sm" data-testid="runs">
						<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Time (UTC)</th><th>Transaction</th><th>Purpose</th><th class="text-right">Steps</th><th class="px-4"></th></tr></thead>
						<tbody class="divide-y divide-line">
							{#each runs.st.rows as r (r.tx + r.purpose + r.ridx)}
								<tr>
									<td class="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">{time(r.slot)}</td>
									<td><Hash value={r.tx} href="#/transactions/{r.tx}" head={8} tail={6} /></td>
									<td><Badge>{r.purpose.toLowerCase()} #{r.ridx}</Badge></td>
									<td class="text-right font-mono text-xs">{r.steps != null ? compact(r.steps) : ''}</td>
									<td class="px-4 text-right"><a class="y-btn h-7 px-2 text-xs" href="#/transactions/{r.tx}/debug/{r.purpose.toLowerCase()}/{r.ridx}?date={day(r.slot)}"><Bug class="h-3.5 w-3.5" />Debug</a></td>
								</tr>
							{/each}
						</tbody>
					</table>
					<PrevNext page={runs.st.page} size={25} shown={runs.st.rows.length} hasNext={!!runs.st.next} busy={runs.st.busy} onprev={() => runs.show(runs.st.page - 1)} onnext={() => runs.show(runs.st.page + 1)} />
				{/if}
			</Panel>

			<Panel title="State: outputs at the script address" sub="newest first, with datum and the transaction that spent each" flush>
				{#snippet actions()}<Cost cost={outs.st.cost} />{#if spentCost}<span class="text-xs text-faint">spent:</span><Cost cost={spentCost} />{/if}{/snippet}
				{#if outs.st.error}<ErrorBox message={outs.st.error} retry={() => outs.show(outs.st.page)} />{/if}
				{#if !outs.st.rows.length && outs.st.busy}<Skeleton rows={8} />
				{:else if !outs.st.rows.length}<div class="p-6 text-sm text-muted">No outputs at this script's address in the published data.</div>
				{:else}
					<table class="w-full text-sm" data-testid="state">
						<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Time (UTC)</th><th>Output</th><th class="text-right">ADA</th><th>Datum</th><th class="px-4">Spent by</th></tr></thead>
						<tbody class="divide-y divide-line">
							{#each outs.st.rows as o (o.tx + o.idx)}
								<tr>
									<td class="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">{time(o.slot)}</td>
									<td><Hash value={o.tx} href="#/transactions/{o.tx}" head={8} tail={4} /><span class="font-mono text-xs text-faint">#{o.idx}</span></td>
									<td class="text-right font-mono text-xs">{o.lovelace != null ? ada(o.lovelace) : ''}</td>
									<td>
										{#if o.inline || o.datum}<button class="text-xs text-brand hover:underline" onclick={() => showDatum(o)}>{o.inline ? 'inline' : `${o.datum?.slice(0, 8)}…`}</button>{:else}<span class="text-xs text-faint">none</span>{/if}
									</td>
									<td class="px-4">{#if !spent.has(`${o.tx}#${o.idx}`)}<span class="text-xs text-faint">…</span>{:else if spent.get(`${o.tx}#${o.idx}`)}<Hash value={spent.get(`${o.tx}#${o.idx}`) ?? ''} href="#/x/graph/{spent.get(`${o.tx}#${o.idx}`)}" head={8} tail={4} />{:else}<Badge tone="ok">unspent</Badge>{/if}</td>
								</tr>
								{#if datum?.key === `${o.tx}#${o.idx}`}
									<tr><td colspan="5" class="bg-bg-2 px-4 py-3">
										{#await datum.cbor}<Skeleton rows={2} />{:then c}{#if c}<PlutusView cbor={c} label="Datum" />{:else}<span class="text-xs text-muted">Datum content not found.</span>{/if}{:catch e}<ErrorBox message={String(e)} />{/await}
									</td></tr>
								{/if}
							{/each}
						</tbody>
					</table>
					<PrevNext page={outs.st.page} size={25} shown={outs.st.rows.length} hasNext={!!outs.st.next} busy={outs.st.busy} onprev={() => outs.show(outs.st.page - 1)} onnext={() => outs.show(outs.st.page + 1)} />
				{/if}
			</Panel>
		</div>
		<p class="mt-4 text-xs text-faint">
			Outputs at one script address are not necessarily one state machine (many users can lock funds at the same script). Following one
			contract instance needs contract-specific rules, for example a state token or a datum field; a future version could take those
			from the script's blueprint.
		</p>
	{/if}
</Gate>
