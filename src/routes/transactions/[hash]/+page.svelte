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
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Ada from '$lib/ui/Ada.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Tabs from '$lib/ui/Tabs.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import Empty from '$lib/ui/Empty.svelte';
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
	import { loadLakeTx, txDay, type LakeTx } from '$lib/lake/replay';
	import { int, utc } from '$lib/cardano';
	import { num, parseUnit, shorten } from '$lib/format';

	/*
	 * A transaction, the way Yaci Viewer shows one, from the lake: the tx index finds its day, then its inputs
	 * (and reference and collateral inputs) are resolved from the days they were created. Scripts re-run in the
	 * browser with julc; "Fork in the lab" opens the what-if lab with the real transaction loaded.
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

	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return /^[0-9a-f]{64}$/.test(txHash) && date ? loadLakeTx(txHash, date) : null;
	});

	// Execution limits of the transaction's epoch (for the re-run's budget bars).
	let limits = $state({ mem: 14_000_000, steps: 10_000_000_000 });
	// Certificates, votes and proposals: small tables, loaded after the transaction.
	interface Cert {
		kind: string;
		cert_index: number | null;
		j: string;
	}
	let certs = $state<{ hash: string; rows: Cert[] } | null>(null);
	$effect(() => {
		const p = data;
		p?.then((t) => {
			if (data !== p) return;
			tryApi<{ max_tx_ex_mem?: number; max_tx_ex_steps?: number }>(`/epochs/${t.row.epoch}/parameters`).then((pp) => {
				if (pp) limits = { mem: Number(pp.max_tx_ex_mem) || 14_000_000, steps: Number(pp.max_tx_ex_steps) || 10_000_000_000 };
			});
			const h = t.row.tx_hash;
			const d = t.date;
			const part = (kind: string, table: string, idx = 'cert_index') =>
				`SELECT '${kind}' AS kind, ${idx} AS cert_index, to_json(x)::VARCHAR AS j FROM ${table} x WHERE date = DATE '${d}' AND tx_hash = '${h}'`;
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
				.then((rows) => (certs = { hash: h, rows }))
				.catch(() => (certs = { hash: h, rows: [] }));
		});
	});
	const certRows = $derived(certs?.hash === txHash ? certs.rows : []);

	const METADATA_LABELS: Record<string, string> = {
		'674': 'Message (CIP-20)',
		'721': 'NFT metadata (CIP-25)',
		'20': 'Token metadata',
		'61284': 'Catalyst registration (CIP-15)',
		'61285': 'Catalyst signature (CIP-15)'
	};

	const parse = (j: string) => {
		try {
			return JSON.parse(j) as Record<string, unknown>;
		} catch {
			return {};
		}
	};

	function tabsOf(t: LakeTx, nCerts: number) {
		return [
			{ id: 'utxos', label: 'Inputs & outputs', count: t.inputs.length + t.outputs.length },
			t.page.scripts.length && { id: 'scripts', label: 'Scripts', count: t.page.scripts.length },
			t.mints.length && { id: 'mints', label: 'Mint & burn', count: t.mints.length },
			t.metadata.length && { id: 'metadata', label: 'Metadata', count: t.metadata.length },
			nCerts && { id: 'certs', label: 'Certificates & votes', count: nCerts },
			t.page.withdrawals.length && { id: 'withdrawals', label: 'Withdrawals', count: t.page.withdrawals.length },
			(t.collateralInputs.length || t.collateralReturn) && { id: 'collateral', label: 'Collateral', count: t.collateralInputs.length },
			t.referenceInputs.length && { id: 'references', label: 'Reference inputs', count: t.referenceInputs.length },
			t.page.tx.required_signers?.length && { id: 'signers', label: 'Signers', count: t.page.tx.required_signers.length },
			{ id: 'raw', label: 'Raw' }
		].filter(Boolean) as { id: string; label: string; count?: number }[];
	}

	let active = $state(hashParam('tab') ?? 'utxos');
	let datumOf = $state<Utxo | null>(null);

	const asUtxos = (xs: unknown[]) => xs as Utxo[];
	const withdrawn = (t: LakeTx) => t.page.withdrawals.reduce((s, w) => s + BigInt(w.amount ?? 0), 0n);
	const minted = (t: LakeTx) => t.mints.filter((m) => !m.quantity.startsWith('-'));
	const burned = (t: LakeTx) => t.mints.filter((m) => m.quantity.startsWith('-'));
	const totalOut = (t: LakeTx) => sumLovelace(asUtxos(t.outputs));
	const label = (v: unknown) => String(v ?? '').replaceAll('_', ' ').toLowerCase();

	// Previous/next transaction in the same block, else the neighbouring block.
	async function step(t: LakeTx, dir: 1 | -1) {
		const [n] = await live<{ tx_hash: string }>(
			`SELECT tx_hash FROM transaction WHERE date = DATE '${t.date}' AND block = ${t.row.block} AND tx_index = ${t.row.tx_index + dir} LIMIT 1`
		);
		if (n) goto(`#/transactions/${n.tx_hash}?date=${t.date}`);
		else goto(`#/blocks/${t.row.block + dir}`);
	}
</script>

<svelte:head><title>Transaction {shorten(txHash, 8, 6)} · Yaci Lens</title></svelte:head>

{#if !date && lookingUp}
	<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
		{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
		<span class="text-sm text-muted">Finding the transaction in the index…</span>
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
{:else if data}
	{#await data}
		<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
			{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
			<span class="text-sm text-muted">Loading the transaction and resolving its inputs from the days they were created…</span>
		</PageHeader>
		<div class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
			<div class="y-panel"><Skeleton rows={6} /></div>
			<div class="y-panel"><Skeleton rows={4} /></div>
		</div>
		<div class="y-panel"><Skeleton rows={8} /></div>
	{:then t}
		{@const r = t.row}
		{@const tabs = tabsOf(t, certRows.length)}
		{@const shown = tabs.some((x) => x.id === active) ? active : 'utxos'}
		<PageHeader kind="Transaction" title={shorten(r.tx_hash, 14, 10)}>
			{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
			<div class="flex flex-wrap items-center gap-2">
				<span class="mono hidden break-all text-xs text-faint md:inline">{r.tx_hash}</span>
				<CopyButton value={r.tx_hash} label="Transaction hash copied" />
			</div>
			{#snippet actions()}
				{#if r.invalid}
					<Badge tone="bad"><CircleX class="h-3.5 w-3.5" />Script failed · collateral taken</Badge>
				{:else}
					<Badge tone="ok"><CircleCheck class="h-3.5 w-3.5" />Success</Badge>
				{/if}
				{#if t.page.scripts.length}<Badge tone="violet"><FileCode class="h-3.5 w-3.5" />Smart contract</Badge>{/if}
				{#if minted(t).length}<Badge tone="brand"><Sparkles class="h-3.5 w-3.5" />Mint</Badge>{/if}
				{#if burned(t).length}<Badge tone="warn"><Flame class="h-3.5 w-3.5" />Burn</Badge>{/if}
				{#if t.metadata.length}<Badge tone="cyan"><MessageSquare class="h-3.5 w-3.5" />Metadata</Badge>{/if}
				{#if t.page.scripts.length}
					<a class="y-btn h-8 text-xs" href="#/transactions/{r.tx_hash}/fork?date={t.date}" title="Change redeemers, datums, signers or outputs and re-run every script"><GitFork class="h-3.5 w-3.5" />Fork in the lab</a>
				{/if}
				<span class="flex">
					<button class="y-icon-btn h-8 w-8" title="Previous transaction" aria-label="Previous transaction" onclick={() => step(t, -1)}><ChevronLeft class="h-4 w-4" /></button>
					<button class="y-icon-btn h-8 w-8" title="Next transaction" aria-label="Next transaction" onclick={() => step(t, 1)}><ChevronRight class="h-4 w-4" /></button>
				</span>
			{/snippet}
		</PageHeader>

		{#if t.missingInputs.length}
			<div class="mb-5 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber" />
				<span>{t.missingInputs.length} input(s) couldn't be resolved from the published data ({t.missingInputs.map((x) => shorten(x, 8, 6)).join(', ')}).</span>
			</div>
		{/if}

		<div class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
			<Panel title="Overview">
				{#snippet actions()}<SqlButton sql={`SELECT * FROM transaction WHERE date = DATE '${t.date}' AND tx_hash = '${r.tx_hash}'`} />{/snippet}
				<dl class="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
					<KV label="Block"><a class="y-link mono font-medium" href="#/blocks/{r.block}">#{int(r.block)}</a> <span class="text-faint">· tx {r.tx_index}</span></KV>
					<KV label="Time (UTC)">{utc(r.block_time)}</KV>
					<KV label="Epoch / slot"><a class="y-link" href="#/epochs/{r.epoch}">{r.epoch}</a><span class="text-faint"> / </span><span class="mono">{num(r.slot)}</span></KV>
					<KV label="Fee"><Ada value={r.fee} decimals={6} class="font-semibold" /></KV>
					<KV label="Total output"><Ada value={totalOut(t)} decimals={6} /></KV>
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
			</Panel>

			<Panel title="Where the ADA went">
				<BalanceBar inputs={sumLovelace(asUtxos(t.inputs))} outputs={totalOut(t)} fee={BigInt(r.fee ?? 0)} withdrawals={withdrawn(t)} />
				{#if t.mints.length}
					<div class="mt-5 border-t border-line pt-4">
						<div class="y-label mb-2">Tokens {minted(t).length && burned(t).length ? 'minted and burned' : minted(t).length ? 'minted' : 'burned'}</div>
						<div class="flex flex-wrap gap-1.5">
							{#each t.mints.slice(0, 8) as m (m.unit)}
								<AssetChip unit={m.unit} quantity={(m.quantity.startsWith('-') ? '' : '+') + m.quantity} />
							{/each}
							{#if t.mints.length > 8}<button class="text-xs text-brand hover:underline" onclick={() => (active = 'mints')}>+{t.mints.length - 8} more</button>{/if}
						</div>
					</div>
				{/if}
			</Panel>
		</div>

		<section class="y-panel overflow-hidden">
			<Tabs {tabs} bind:active param="tab" />
			<div class="p-4 sm:p-5">
				{#if shown === 'utxos'}
					<UtxoFlow inputs={asUtxos(t.inputs)} outputs={asUtxos(t.outputs)} fee={r.fee} ondatum={(u) => (datumOf = u)} />
				{:else if shown === 'scripts'}
					<ScriptRuns page={t.page} invalid={!!r.invalid} maxMem={limits.mem} maxSteps={limits.steps} date={t.date} />
				{:else if shown === 'mints'}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead><tr class="border-b border-line text-left"><th class="y-label py-2 pr-4">Asset</th><th class="y-label py-2 pr-4">Policy</th><th class="y-label py-2 pr-4">Fingerprint</th><th class="y-label py-2 text-right">Quantity</th></tr></thead>
							<tbody>
								{#each t.mints as m (m.unit)}
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
				{:else if shown === 'metadata'}
					<div class="grid gap-4">
						{#each t.metadata as m (m.label)}
							<div>
								<div class="mb-2 flex items-center gap-2">
									<Badge tone="cyan">Label {m.label}</Badge>
									{#if METADATA_LABELS[m.label]}<span class="text-sm text-muted">{METADATA_LABELS[m.label]}</span>{/if}
								</div>
								<JsonView value={m.json} label="Label {m.label}" />
							</div>
						{/each}
					</div>
				{:else if shown === 'certs'}
					<ul class="divide-y divide-line">
						{#each certRows as c, i (i)}
							{@const x = parse(c.j)}
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
									<span class="mono text-xs">{shorten(String(x.gov_action_tx_hash), 8, 6)}#{x.gov_action_index}</span>
									<NameTag kind="action" id="{x.gov_action_tx_hash}#{x.gov_action_index}" />
								{:else if c.kind === 'Proposal'}
									<span>{label(x.type)}</span>
									<NameTag kind="action" id="{r.tx_hash}#{x.idx}" />
								{:else}
									<span class="mono text-xs">{shorten(String(x.address ?? x.credential ?? ''), 12, 8)}</span>
								{/if}
								{#if c.cert_index != null}<span class="ml-auto text-xs text-faint">#{c.cert_index}</span>{/if}
							</li>
						{/each}
					</ul>
				{:else if shown === 'withdrawals'}
					<ul class="divide-y divide-line">
						{#each t.page.withdrawals as w (w.address)}
							<li class="flex items-center justify-between gap-3 py-3">
								<span class="mono text-xs">{shorten(w.address, 14, 8)}</span>
								<Ada value={w.amount} decimals={6} class="font-semibold" />
							</li>
						{/each}
					</ul>
				{:else if shown === 'collateral'}
					<div class="grid gap-6 lg:grid-cols-2">
						<div>
							<div class="y-label mb-2">Collateral inputs</div>
							<div class="flex flex-col gap-2.5">
								{#each asUtxos(t.collateralInputs) as u (u.tx_hash + u.output_index)}<UtxoCard utxo={u} side="in" />{/each}
							</div>
						</div>
						<div>
							<div class="y-label mb-2">Collateral return</div>
							{#if t.collateralReturn}<UtxoCard utxo={t.collateralReturn as Utxo} side="out" />{:else}<p class="text-sm text-muted">None</p>{/if}
							<p class="mt-3 text-xs text-muted">Collateral is only taken if a script fails. {r.invalid ? 'It failed, so it was.' : 'This transaction succeeded, so it was not.'}</p>
						</div>
					</div>
				{:else if shown === 'references'}
					<p class="mb-3 text-sm text-muted">Read but not spent: these outputs supply reference scripts or datums.</p>
					<div class="grid gap-2.5 lg:grid-cols-2">
						{#each asUtxos(t.referenceInputs) as u (u.tx_hash + u.output_index)}<UtxoCard utxo={u} side="in" ondatum={(x) => (datumOf = x)} />{/each}
					</div>
				{:else if shown === 'signers'}
					<p class="mb-3 text-sm text-muted">Key hashes that must sign this transaction (for scripts that check signatures).</p>
					<ul class="flex flex-col gap-2">
						{#each t.page.tx.required_signers ?? [] as s (s)}<li class="rounded-xl border border-line bg-surface-2/60 px-3 py-2"><Hash value={s} full /></li>{/each}
					</ul>
				{:else if shown === 'raw'}
					<JsonView value={{ ...r, outputs: t.outputs, inputs_resolved: t.inputs, scripts: t.page.scripts, metadata: t.metadata, mints: t.mints }} label="Transaction" maxHeight={560} />
				{:else}
					<Empty />
				{/if}
			</div>
		</section>
	{:catch e}
		<PageHeader kind="Transaction" title={shorten(txHash, 14, 10)}>
			{#snippet icon()}<ArrowLeftRight class="h-5 w-5" />{/snippet}
		</PageHeader>
		<div class="y-panel"><ErrorBox title="Couldn't load the transaction" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
	{/await}
{/if}

<DatumDialog bind:utxo={datumOf} />
