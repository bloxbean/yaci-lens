<script lang="ts">
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import FileCode from '@lucide/svelte/icons/file-code';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Flame from '@lucide/svelte/icons/flame';
	import GitFork from '@lucide/svelte/icons/git-fork';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { indexEnabled } from '$lib/indexdb/config';
	// indexed lookups: only when they are on and the indexes are published
	let indexed = $state(false);
	if (indexEnabled()) import('$lib/indexdb/service').then((s) => s.indexAvailable()).then((ok) => (indexed = ok));
	// what spent each output (indexed): output index -> spending tx, null = unspent at the tip
	let spentMap = $state<Map<number, string | null> | null>(null);
	$effect(() => {
		const h = txHash;
		if (!indexed || !/^[0-9a-f]{64}$/.test(h)) return;
		spentMap = null;
		import('$lib/indexdb/service')
			.then((s) => s.txLinks(h))
			.then((r) => {
				if (h !== txHash) return;
				const m = new Map<number, string | null>();
				for (const e of r.data.children) m.set(e.outIdx, e.byTx);
				for (const i of r.data.unspent) m.set(i, null);
				spentMap = m;
			})
			.catch(() => undefined);
	});
	import Panel from '$lib/ui/Panel.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Ada from '$lib/ui/Ada.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Tabs from '$lib/ui/Tabs.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import CopyButton from '$lib/ui/CopyButton.svelte';
	import AssetChip from '$lib/ui/AssetChip.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import UtxoFlow from '$lib/tx/UtxoFlow.svelte';
	import UtxoCard from '$lib/tx/UtxoCard.svelte';
	import BalanceBar from '$lib/tx/BalanceBar.svelte';
	import DatumDialog from '$lib/tx/DatumDialog.svelte';
	import ScriptRuns from '$lib/julc/ScriptRuns.svelte';
	import PoolName from '$lib/names/PoolName.svelte';
	import NameTag from '$lib/names/NameTag.svelte';
	import { sumLovelace, type Utxo } from '$lib/tx/types';
	import { tryApi } from '$lib/api/client';
	import { live } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { stageLakeTx, txDay, type LakeMetadata, type LakeMint, type LakeTx, type LakeTxInputs, type TxRow } from '$lib/lake/replay';
	import type { StoreUtxo } from '$lib/julc/replay/build';
	import { int, utc } from '$lib/cardano';
	import { num, parseUnit, shorten } from '$lib/format';

	/*
	 * A transaction, the way Yaci Viewer shows one, from the lake, shown progressively: the transaction row first
	 * (header, overview, counts), then the same-day parts (outputs, mint & burn, metadata, withdrawals), then the
	 * inputs (resolved from the days they were created, through the tx index: the slow part), and finally what the
	 * script re-run needs (datums). Every section that is still loading says so.
	 */
	const txHash = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());
	const given = $derived.by(() => {
		page.url.hash;
		const d = hashParam('date');
		return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
	});
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

	// ---- stages ---------------------------------------------------------------------------------------------------
	interface Got {
		key: string;
		row?: TxRow;
		outputs?: { outputs: StoreUtxo[]; collateralReturn: StoreUtxo | null };
		mints?: LakeMint[];
		metadata?: LakeMetadata[];
		withdrawals?: { address: string; amount: string }[];
		inputs?: LakeTxInputs;
		full?: LakeTx;
		certs?: Cert[];
		errors: Record<string, string>;
	}
	interface Cert {
		kind: string;
		cert_index: number | null;
		j: string;
	}
	let attempt = $state(0);
	let got = $state<Got>({ key: '', errors: {} });
	let limits = $state({ mem: 14_000_000, steps: 10_000_000_000 });

	$effect(() => {
		attempt;
		const h = txHash;
		const d = date;
		if (!/^[0-9a-f]{64}$/.test(h) || !d) return;
		const key = `${h}@${d}#${attempt}`;
		got = { key, errors: {} };
		const s = stageLakeTx(h, d);
		const put = <K extends keyof Got>(k: K, p: Promise<Got[K]>) =>
			p.then(
				(v) => got.key === key && (got[k] = v),
				(e) => got.key === key && (got.errors[k as string] = String(e?.message ?? e))
			);
		put('row', s.row);
		put('outputs', s.outputs);
		put('mints', s.mints);
		put('metadata', s.metadata);
		put('withdrawals', s.withdrawals);
		put('inputs', s.inputs);
		put('full', s.full);
		s.row.then((t) => {
			tryApi<{ max_tx_ex_mem?: number; max_tx_ex_steps?: number }>(`/epochs/${t.epoch}/parameters`).then((pp) => {
				if (pp && got.key === key) limits = { mem: Number(pp.max_tx_ex_mem) || 14_000_000, steps: Number(pp.max_tx_ex_steps) || 10_000_000_000 };
			});
		});
		// Certificates, votes and proposals: small tables, after the same-day reads.
		const part = (kind: string, table: string, idx = 'cert_index') =>
			`SELECT '${kind}' AS kind, ${idx} AS cert_index, to_json(x)::VARCHAR AS j FROM ${table} x WHERE date = DATE '${d}' AND tx_hash = '${h}'`;
		put(
			'certs',
			Promise.all([s.outputs, s.mints, s.metadata, s.withdrawals]).then(() =>
				live<Cert>(
					[
						part('Stake registration', 'stake_registration'),
						part('Delegation', 'delegation'),
						part('Vote delegation', 'delegation_vote'),
						part('Pool registration', 'pool_registration'),
						part('Pool retirement', 'pool_retirement'),
						part('DRep certificate', 'drep_registration'),
						part('Vote', 'voting_procedure', 'idx'),
						part('Proposal', 'gov_action_proposal', 'idx')
					].join('\nUNION ALL\n') + '\nORDER BY cert_index'
				)
			)
		);
	});

	const METADATA_LABELS: Record<string, string> = {
		'674': 'Message (CIP-20)',
		'721': 'NFT metadata (CIP-25)',
		'20': 'Token metadata',
		'61284': 'Catalyst registration (CIP-15)',
		'61285': 'Catalyst signature (CIP-15)'
	};

	const parseJ = (j: string) => {
		try {
			return JSON.parse(j) as Record<string, unknown>;
		} catch {
			return {};
		}
	};
	const refs = (json: string | null | undefined): { tx_hash: string; output_index: number }[] => {
		try {
			return json ? JSON.parse(json) : [];
		} catch {
			return [];
		}
	};
	const label = (v: unknown) => String(v ?? '').replaceAll('_', ' ').toLowerCase();
	const asUtxos = (xs: unknown[]) => xs as Utxo[];

	// Counts known from the transaction row itself (its input/output reference lists), before anything else loads.
	const known = $derived.by(() => {
		const r = got.row;
		if (!r) return null;
		return {
			inputs: refs(r.inputs),
			references: refs(r.reference_inputs).length,
			collateral: refs(r.collateral_inputs).length,
			signers: refs(r.required_signers).length,
			scripts: !!r.script_datahash,
			metadata: !!r.auxiliary_datahash
		};
	});

	const tabs = $derived.by(() => {
		const k = known;
		if (!k) return [];
		const ioCount = got.outputs && got.inputs ? got.inputs.inputs.length + got.outputs.outputs.length : null;
		return [
			{ id: 'utxos', label: 'Inputs & outputs', count: ioCount ?? k.inputs.length + (got.outputs?.outputs.length ?? 0), loading: !got.outputs || !got.inputs },
			k.scripts && { id: 'scripts', label: 'Scripts', count: got.full?.page.scripts.length ?? null, loading: !got.full && !got.errors.full },
			(!got.mints || got.mints.length) && { id: 'mints', label: 'Mint & burn', count: got.mints?.length ?? null, loading: !got.mints },
			k.metadata && { id: 'metadata', label: 'Metadata', count: got.metadata?.length ?? null, loading: !got.metadata },
			(!got.certs || got.certs.length) && { id: 'certs', label: 'Certificates & votes', count: got.certs?.length ?? null, loading: !got.certs },
			(!got.withdrawals || got.withdrawals.length) && { id: 'withdrawals', label: 'Withdrawals', count: got.withdrawals?.length ?? null, loading: !got.withdrawals },
			(k.collateral || got.outputs?.collateralReturn) && { id: 'collateral', label: 'Collateral', count: k.collateral, loading: !got.inputs },
			k.references && { id: 'references', label: 'Reference inputs', count: k.references, loading: !got.inputs },
			k.signers && { id: 'signers', label: 'Signers', count: k.signers },
			{ id: 'raw', label: 'Raw' }
		].filter(Boolean) as { id: string; label: string; count?: number | null; loading?: boolean }[];
	});

	let active = $state(hashParam('tab') ?? 'utxos');
	const shown = $derived(tabs.some((x) => x.id === active) ? active : 'utxos');
	let datumOf = $state<Utxo | null>(null);

	const totalOut = $derived(got.outputs ? sumLovelace(asUtxos(got.outputs.outputs)) : null);
	const withdrawn = $derived(got.withdrawals ? got.withdrawals.reduce((s, w) => s + BigInt(w.amount ?? 0), 0n) : 0n);
	const minted = $derived((got.mints ?? []).filter((m) => !m.quantity.startsWith('-')));
	const burned = $derived((got.mints ?? []).filter((m) => m.quantity.startsWith('-')));

	// Previous/next transaction in the same block, else the neighbouring block.
	async function step(r: TxRow, d: string, dir: 1 | -1) {
		const [n] = await live<{ tx_hash: string }>(`SELECT tx_hash FROM transaction WHERE date = DATE '${d}' AND block = ${r.block} AND tx_index = ${r.tx_index + dir} LIMIT 1`);
		if (n) goto(`#/transactions/${n.tx_hash}?date=${d}`);
		else goto(`#/blocks/${r.block + dir}`);
	}
</script>

{#snippet loading(text: string)}
	<div class="flex items-center gap-2 py-6 text-sm text-muted" role="status"><LoaderCircle class="h-4 w-4 animate-spin text-brand" />{text}</div>
{/snippet}

{#snippet stageError(text: string)}
	<ErrorBox title="Couldn't load this part" message={text} retry={() => attempt++} />
{/snippet}

<svelte:head><title>Transaction {shorten(txHash, 8, 6)} · Yaci Lens</title></svelte:head>

{#if !date && lookingUp}
	<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
		{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
		<span class="text-sm text-muted">Finding the transaction's day in the transaction index…</span>
	</PageHeader>
	<div class="y-panel"><Skeleton rows={4} /></div>
{:else if !date}
	<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
		{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
	</PageHeader>
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
{:else if got.errors.row}
	<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
		{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
	</PageHeader>
	<div class="y-panel"><ErrorBox title="Couldn't load the transaction" message={got.errors.row} retry={() => attempt++} /></div>
{:else}
	{@const r = got.row}
	<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
		{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
		<div class="flex flex-wrap items-center gap-2">
			<span class="mono hidden break-all text-xs text-faint md:inline">{txHash}</span>
			<CopyButton value={txHash} label="Transaction hash copied" />
		</div>
		{#snippet actions()}
			{#if r}
				{#if r.invalid}
					<Badge tone="bad"><CircleX class="h-3.5 w-3.5" />Script failed · collateral taken</Badge>
				{:else}
					<Badge tone="ok"><CircleCheck class="h-3.5 w-3.5" />Success</Badge>
				{/if}
				{#if r.script_datahash}<Badge tone="violet"><FileCode class="h-3.5 w-3.5" />Smart contract</Badge>{/if}
				{#if minted.length}<Badge tone="brand"><Sparkles class="h-3.5 w-3.5" />Mint</Badge>{/if}
				{#if burned.length}<Badge tone="warn"><Flame class="h-3.5 w-3.5" />Burn</Badge>{/if}
				{#if r.auxiliary_datahash}<Badge tone="cyan"><MessageSquare class="h-3.5 w-3.5" />Metadata</Badge>{/if}
				{#if r.script_datahash}
					<a class="y-btn h-8 text-xs" href="#/transactions/{txHash}/fork?date={date}" title="Change redeemers, datums, signers or outputs and re-run every script"><GitFork class="h-3.5 w-3.5" />Fork in the lab</a>
				{/if}
				{#if indexed}<a class="y-btn h-8 text-xs" href="#/x/graph/{txHash}" title="Transaction graph (experimental indexed lookup)">Graph</a>{/if}
				<span class="flex">
					<button class="y-icon-btn h-8 w-8" title="Previous transaction" aria-label="Previous transaction" onclick={() => step(r, date!, -1)}><ChevronLeft class="h-4 w-4" /></button>
					<button class="y-icon-btn h-8 w-8" title="Next transaction" aria-label="Next transaction" onclick={() => step(r, date!, 1)}><ChevronRight class="h-4 w-4" /></button>
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	{#if got.inputs?.missingInputs.length}
		<div class="mb-5 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm">
			<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber" />
			<span>{got.inputs.missingInputs.length} input(s) couldn't be resolved from the published data ({got.inputs.missingInputs.map((x) => shorten(x, 8, 6)).join(', ')}).</span>
		</div>
	{/if}

	<div class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
		<Panel title="Overview">
			{#snippet actions()}<SqlButton sql={`SELECT * FROM transaction WHERE date = DATE '${date}' AND tx_hash = '${txHash}'`} />{/snippet}
			{#if !r}
				<Skeleton rows={4} />
			{:else}
				<dl class="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
					<KV label="Block"><a class="y-link mono font-medium" href="#/blocks/{r.block}">#{int(r.block)}</a> <span class="text-faint">· tx {r.tx_index}</span></KV>
					<KV label="Time (UTC)">{utc(r.block_time)}</KV>
					<KV label="Epoch / slot"><a class="y-link" href="#/epochs/{r.epoch}">{r.epoch}</a><span class="text-faint"> / </span><span class="mono">{num(r.slot)}</span></KV>
					<KV label="Fee"><Ada value={r.fee} decimals={6} class="font-semibold" /></KV>
					<KV label="Total output">{#if totalOut != null}<Ada value={totalOut} decimals={6} />{:else}<span class="inline-block h-4 w-24 animate-pulse rounded bg-surface-2"></span>{/if}</KV>
					<KV label="Validity">
						{#if r.validity_interval_start || r.ttl}
							<span class="mono text-[13px]">{r.validity_interval_start ? num(r.validity_interval_start) : '…'} → {r.ttl ? num(r.ttl) : '∞'}</span>
						{:else}<span class="text-muted">No limit</span>{/if}
					</KV>
					{#if r.script_datahash}<KV label="Script data hash"><Hash value={r.script_datahash} /></KV>{/if}
					{#if r.auxiliary_datahash}<KV label="Metadata hash"><Hash value={r.auxiliary_datahash} /></KV>{/if}
					{#if r.total_collateral}<KV label="Collateral"><Ada value={r.total_collateral} decimals={6} /></KV>{/if}
					{#if r.treasury_donation}<KV label="Treasury donation"><Ada value={r.treasury_donation} decimals={6} /></KV>{/if}
				</dl>
			{/if}
		</Panel>

		<Panel title="Where the ADA went">
			{#if got.inputs && totalOut != null && r}
				<BalanceBar inputs={sumLovelace(asUtxos(got.inputs.inputs))} outputs={totalOut} fee={BigInt(r.fee ?? 0)} withdrawals={withdrawn} />
			{:else if got.errors.inputs}
				{@render stageError(got.errors.inputs)}
			{:else}
				<Skeleton rows={3} />
				<p class="mt-2 flex items-center gap-1.5 text-xs text-faint"><LoaderCircle class="h-3.5 w-3.5 animate-spin" />Resolving the inputs from the days they were created…</p>
			{/if}
			{#if got.mints?.length}
				<div class="mt-5 border-t border-line pt-4">
					<div class="y-label mb-2">Tokens {minted.length && burned.length ? 'minted and burned' : minted.length ? 'minted' : 'burned'}</div>
					<div class="flex flex-wrap gap-1.5">
						{#each got.mints.slice(0, 8) as m (m.unit)}
							<AssetChip unit={m.unit} quantity={(m.quantity.startsWith('-') ? '' : '+') + m.quantity} />
						{/each}
						{#if got.mints.length > 8}<button class="text-xs text-brand hover:underline" onclick={() => (active = 'mints')}>+{got.mints.length - 8} more</button>{/if}
					</div>
				</div>
			{/if}
		</Panel>
	</div>

	<section class="y-panel overflow-hidden">
		{#if !r}
			<Skeleton rows={8} />
		{:else}
			<Tabs {tabs} bind:active param="tab" />
			<div class="p-4 sm:p-5">
				{#if shown === 'utxos'}
					{#if got.inputs && got.outputs}
						<UtxoFlow inputs={asUtxos(got.inputs.inputs)} outputs={asUtxos(got.outputs.outputs)} fee={r.fee} ondatum={(u) => (datumOf = u)} spent={spentMap} linkAddress={indexed} />
					{:else}
						<!-- Progressive: outputs (same day) usually arrive first; inputs need the tx index and the days they were created -->
						<div class="grid gap-6 lg:grid-cols-2">
							<div>
								<div class="y-label mb-2.5">Inputs · {known?.inputs.length ?? '…'}</div>
								{#if got.errors.inputs}
									{@render stageError(got.errors.inputs)}
								{:else}
									<div class="flex flex-col gap-2.5">
										{#each known?.inputs ?? [] as ref (ref.tx_hash + ref.output_index)}
											<div class="rounded-xl border border-dashed border-line bg-surface-2/40 p-3.5" role="status">
												<div class="flex items-center justify-between gap-2">
													<span class="inline-block h-4 w-40 animate-pulse rounded bg-surface-2"></span>
													<span class="mono text-[11px] text-faint">{shorten(ref.tx_hash, 6, 4)}#{ref.output_index}</span>
												</div>
												<p class="mt-2 flex items-center gap-1.5 text-[11px] text-faint"><LoaderCircle class="h-3 w-3 animate-spin" />Resolving from the day it was created…</p>
											</div>
										{/each}
									</div>
								{/if}
							</div>
							<div>
								<div class="y-label mb-2.5">Outputs{got.outputs ? ` · ${got.outputs.outputs.length}` : ''}</div>
								{#if got.outputs}
									<div class="flex flex-col gap-2.5">
										{#each asUtxos(got.outputs.outputs) as u (u.tx_hash + u.output_index)}<UtxoCard utxo={u} side="out" ondatum={(x) => (datumOf = x)} spentBy={spentMap ? spentMap.get(u.output_index) : undefined} linkAddress={indexed} />{/each}
									</div>
								{:else if got.errors.outputs}
									{@render stageError(got.errors.outputs)}
								{:else}
									<Skeleton rows={4} />
								{/if}
							</div>
						</div>
					{/if}
				{:else if shown === 'scripts'}
					{#if got.full}
						<ScriptRuns page={got.full.page} invalid={!!r.invalid} maxMem={limits.mem} maxSteps={limits.steps} date={date} />
					{:else if got.errors.full}
						{@render stageError(got.errors.full)}
					{:else}
						{@render loading(got.inputs ? 'Loading datums and redeemers for the re-run…' : 'Waiting for the inputs: the script re-run needs the outputs it spends…')}
					{/if}
				{:else if shown === 'mints'}
					{#if !got.mints}
						{@render loading('Loading mint and burn events…')}
					{:else}
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead><tr class="border-b border-line text-left"><th class="y-label py-2 pr-4">Asset</th><th class="y-label py-2 pr-4">Policy</th><th class="y-label py-2 pr-4">Fingerprint</th><th class="y-label py-2 text-right">Quantity</th></tr></thead>
								<tbody>
									{#each got.mints as m (m.unit)}
										<tr class="border-b border-line/60 last:border-0">
											<td class="py-2.5 pr-4"><AssetChip unit={m.unit} /></td>
											<td class="py-2.5 pr-4"><Hash value={m.policy} href="#/assets/policy/{m.policy}" head={8} tail={6} /></td>
											<td class="py-2.5 pr-4">{#if m.fingerprint}<Hash value={m.fingerprint} href="#/assets/unit/{m.unit}" head={10} tail={6} />{:else}<span class="text-faint">{parseUnit(m.unit).name}</span>{/if}</td>
											<td class="py-2.5 text-right font-semibold tabular-nums {m.quantity.startsWith('-') ? 'text-danger' : 'text-mint'}">{m.quantity.startsWith('-') ? '' : '+'}{num(m.quantity)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{:else if shown === 'metadata'}
					{#if !got.metadata}
						{@render loading('Loading metadata…')}
					{:else}
						<div class="grid gap-4">
							{#each got.metadata as m (m.label)}
								<div>
									<div class="mb-2 flex items-center gap-2">
										<Badge tone="cyan">Label {m.label}</Badge>
										{#if METADATA_LABELS[m.label]}<span class="text-sm text-muted">{METADATA_LABELS[m.label]}</span>{/if}
									</div>
									<JsonView value={m.json} label="Label {m.label}" />
								</div>
							{/each}
						</div>
					{/if}
				{:else if shown === 'certs'}
					{#if !got.certs}
						{@render loading('Loading certificates, votes and proposals…')}
					{:else}
						<ul class="divide-y divide-line">
							{#each got.certs as c, i (i)}
								{@const x = parseJ(c.j)}
								<li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-sm">
									<Badge tone={c.kind === 'Vote' ? 'info' : c.kind === 'Proposal' ? 'violet' : c.kind.startsWith('Pool') ? 'cyan' : 'neutral'}>{c.kind}{x.type ? ` · ${label(x.type)}` : ''}</Badge>
									{#if c.kind === 'Delegation'}
										<span class="mono text-xs">{shorten(String(x.address ?? x.credential), 12, 8)}</span><span class="text-faint">→</span><PoolName hash={String(x.pool_id)} />
									{:else if c.kind === 'Vote delegation'}
										<span class="mono text-xs">{shorten(String(x.address ?? x.credential), 12, 8)}</span><span class="text-faint">→</span>
										{#if x.drep_hash}<a class="y-link mono text-xs" href="#/governance/dreps/{x.drep_id ?? x.drep_hash}">{shorten(String(x.drep_id ?? x.drep_hash), 12, 8)}</a><NameTag kind="drep" id={String(x.drep_hash)} />{:else}<span>{label(x.drep_type)}</span>{/if}
									{:else if c.kind === 'Pool registration' || c.kind === 'Pool retirement'}
										<PoolName hash={String(x.pool_id)} />
										{#if x.pledge != null}<span class="text-xs text-muted">pledge <Ada value={String(x.pledge)} decimals={0} /> · cost <Ada value={String(x.cost)} decimals={0} /> · margin {(Number(x.margin) * 100).toFixed(2)}%</span>{/if}
										{#if x.retirement_epoch != null}<span class="text-xs text-muted">retires in epoch {x.retirement_epoch}</span>{/if}
									{:else if c.kind === 'DRep certificate'}
										<a class="y-link mono text-xs" href="#/governance/dreps/{x.drep_id ?? x.drep_hash}">{shorten(String(x.drep_id ?? x.drep_hash), 12, 8)}</a><NameTag kind="drep" id={String(x.drep_hash)} />
										{#if x.deposit}<span class="text-xs text-muted">deposit <Ada value={String(x.deposit)} decimals={0} /></span>{/if}
									{:else if c.kind === 'Vote'}
										<Badge tone={x.vote === 'YES' ? 'ok' : x.vote === 'NO' ? 'bad' : 'neutral'}>{x.vote}</Badge>
										<span class="text-xs text-muted">{label(x.voter_type)}</span>
										<span class="mono text-xs">{shorten(String(x.voter_hash), 8, 6)}</span>
										<span class="text-faint">on</span>
										<a class="y-link mono text-xs" href="#/governance/actions/{x.gov_action_tx_hash}/{x.gov_action_index}">{shorten(String(x.gov_action_tx_hash), 8, 6)}#{x.gov_action_index}</a>
										<NameTag kind="action" id="{x.gov_action_tx_hash}#{x.gov_action_index}" />
									{:else if c.kind === 'Proposal'}
										<a class="y-link" href="#/governance/actions/{txHash}/{x.idx}">{label(x.type)}</a>
										<NameTag kind="action" id="{txHash}#{x.idx}" />
									{:else}
										<span class="mono text-xs">{shorten(String(x.address ?? x.credential ?? ''), 12, 8)}</span>
									{/if}
									{#if c.cert_index != null}<span class="ml-auto text-xs text-faint">#{c.cert_index}</span>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{:else if shown === 'withdrawals'}
					{#if !got.withdrawals}
						{@render loading('Loading withdrawals…')}
					{:else}
						<ul class="divide-y divide-line">
							{#each got.withdrawals as w (w.address)}
								<li class="flex items-center justify-between gap-3 py-3">
									<span class="mono text-xs">{shorten(w.address, 14, 8)}</span>
									<Ada value={w.amount} decimals={6} class="font-semibold" />
								</li>
							{/each}
						</ul>
					{/if}
				{:else if shown === 'collateral'}
					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<div class="y-label mb-2">Collateral inputs</div>
							{#if got.inputs}
								<div class="flex flex-col gap-2.5">
									{#each asUtxos(got.inputs.collateralInputs) as u (u.tx_hash + u.output_index)}<UtxoCard utxo={u} side="in"  linkAddress={indexed} />{/each}
								</div>
							{:else}
								{@render loading('Resolving collateral inputs…')}
							{/if}
						</div>
						<div>
							<div class="y-label mb-2">Collateral return</div>
							{#if !got.outputs}<Skeleton rows={2} />{:else if got.outputs.collateralReturn}<UtxoCard utxo={got.outputs.collateralReturn as Utxo} side="out"  linkAddress={indexed} />{:else}<p class="text-sm text-muted">None</p>{/if}
							<p class="mt-3 text-xs text-muted">Collateral is only taken if a script fails. {r.invalid ? 'It failed, so it was.' : 'This transaction succeeded, so it was not.'}</p>
						</div>
					</div>
				{:else if shown === 'references'}
					<p class="mb-3 text-sm text-muted">Read but not spent: these outputs supply reference scripts or datums.</p>
					{#if got.inputs}
						<div class="grid gap-2.5 lg:grid-cols-2">
							{#each asUtxos(got.inputs.referenceInputs) as u (u.tx_hash + u.output_index)}<UtxoCard utxo={u} side="in" ondatum={(x) => (datumOf = x)} />{/each}
						</div>
					{:else}
						{@render loading('Resolving reference inputs from the days they were created…')}
					{/if}
				{:else if shown === 'signers'}
					<p class="mb-3 text-sm text-muted">Key hashes that must sign this transaction (for scripts that check signatures).</p>
					<ul class="flex flex-col gap-2">
						{#each refs(r.required_signers) as s (s)}<li class="rounded-xl border border-line bg-surface-2/60 px-3 py-2"><Hash value={String(s)} full /></li>{/each}
					</ul>
				{:else if shown === 'raw'}
					<JsonView
						value={{ ...r, outputs: got.outputs?.outputs ?? '(loading)', inputs_resolved: got.inputs?.inputs ?? '(loading)', scripts: got.full?.page.scripts ?? '(loading)', metadata: got.metadata ?? '(loading)', mints: got.mints ?? '(loading)' }}
						label="Transaction"
						maxHeight={560}
					/>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<DatumDialog bind:utxo={datumOf} />
