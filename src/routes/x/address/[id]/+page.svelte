<script lang="ts">
	import Wallet from '@lucide/svelte/icons/wallet';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Tabs, { type Tab } from '$lib/ui/Tabs.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import PoolName from '$lib/names/PoolName.svelte';
	import TokenName from '$lib/names/TokenName.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import PrevNext from '$lib/ui/PrevNext.svelte';
	import { keysetPages } from '$lib/ui/keyset.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import type { Activity, Cost as CostT, Measured, StakeAddress, StakeEvent, WalletSummary, Held, RewardRow, Withdrawal, Utxo } from '$lib/indexdb/service';
	import { stakeAddressOf, bech32Decode } from '$lib/bech32';
	import { hashParam } from '$lib/lake/links';
	import { lake } from '$lib/lake/lake.svelte';
	import { ada, adaCompact } from '$lib/format';
	import { int, poolBech32 } from '$lib/cardano';

	/*
	 * EXPERIMENTAL wallet view from the SQLite indexes, for an address (addr1…, Byron) or a stake address (stake1…):
	 *  - overview: balance at the tip (lovelace received - sent, exact), totals, balance over time and monthly flows;
	 *  - transactions (newest first, keyset pages), tokens held at the tip, unspent outputs;
	 *  - stake addresses also: rewards every epoch and withdrawals, delegation certificates, and the addresses that
	 *    carry the credential (the explicit on-chain relation: nothing is inferred from transactions).
	 * Each tab reads its data when it is opened.
	 */
	const id = $derived((page.params.id ?? '').split('?')[0]);
	const isStake = $derived(/^stake(_test)?1/.test(id));
	const stakeOfAddr = $derived(isStake ? null : stakeAddressOf(id));
	/** Whose tokens / UTxOs: a base address's tokens are held under its stake address. */
	const holder = $derived(isStake ? id : (stakeOfAddr ?? id));
	const isScript = $derived(!isStake && (() => { const d = bech32Decode(id); return !!d && d.hrp.startsWith('addr') && ((d.bytes[0] >> 4) & 1) === 1; })());

	let svc: typeof import('$lib/indexdb/service') | null = null;
	const S = () => (svc ? Promise.resolve(svc) : import('$lib/indexdb/service').then((m) => (svc = m)));
	const time = (slot: number) => (svc ? svc.slotTime(slot).toISOString().slice(0, 16).replace('T', ' ') : int(slot));
	const cred = () => svc!.stakeCredential(id)!;

	let tab = $state(hashParam('tab') ?? 'overview');
	const tabs: Tab[] = $derived([
		{ id: 'overview', label: 'Overview' },
		{ id: 'txs', label: 'Transactions' },
		{ id: 'tokens', label: 'Tokens' },
		...(isStake ? [{ id: 'rewards', label: 'Rewards' }] : []),
		{ id: 'utxos', label: 'UTxOs' },
		...(isStake ? [{ id: 'delegation', label: 'Delegation' }, { id: 'addresses', label: 'Addresses' }] : [])
	]);

	// overview
	const summary = $derived(S().then((s) => (isStake ? s.getStakeSummary(s.stakeCredential(id)!) : s.getAddressSummary(id))) as Promise<Measured<WalletSummary>>);
	const monthLabel = (m: number) => `${Math.floor(m / 100)}-${String(m % 100).padStart(2, '0')}`;
	function balanceSeries(w: WalletSummary) {
		let run = 0;
		const vals = w.months.map((m) => (run += m.recv - m.sent) / 1e6);
		return { x: w.months.map((m) => monthLabel(m.month)), vals };
	}

	// transactions: pages of 25, newest first
	const txs = keysetPages<Activity>(async (c) => {
		const s = await S();
		return isStake ? s.getStakeActivity(s.stakeCredential(id)!, c, 25) : s.getAddressActivity(id, c, 25);
	});
	$effect(() => {
		if (tab === 'txs' && txs.st.key !== id) untrack(() => txs.reset(id));
	});

	// tokens
	const tokens = $derived(tab === 'tokens' ? S().then((s) => s.getTokensHeld(holder)) : null) as Promise<Measured<Held[]>> | null;

	// rewards
	const rewards = $derived(tab === 'rewards' && isStake ? S().then((s) => s.getRewards(id)) : null) as Promise<Measured<{ rewards: RewardRow[]; withdrawals: Withdrawal[] }>> | null;
	const total = (r: RewardRow) => r.member + r.leader + r.other;

	// UTxOs: pages of 50, newest first
	const utx = keysetPages<Utxo>(async (c) => (await S()).getUtxos(id, c, 50));
	$effect(() => {
		if (tab === 'utxos' && utx.st.key !== id) untrack(() => utx.reset(id));
	});

	// client-side pages (lists read whole, capped): tokens held, a stake key's addresses
	const SMALL_PAGE = 25;
	let tokenPage = $state(0);
	let addrPage = $state(0);
	$effect(() => {
		void id;
		tokenPage = 0;
		addrPage = 0;
	});

	// stake: delegation and addresses
	const delegation = $derived(tab === 'delegation' && isStake ? S().then((s) => s.getStakeEvents(cred(), 200)) : null) as Promise<Measured<StakeEvent[]>> | null;
	const addresses = $derived(tab === 'addresses' && isStake ? S().then((s) => s.getStakeAddresses(cred(), 500)) : null) as Promise<Measured<StakeAddress[]>> | null;

	const net = (a: Activity) => a.recv - a.sent;
	const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
</script>

<svelte:head><title>{isStake ? 'Stake' : 'Address'} {id.slice(0, 16)}… · Yaci Lens</title></svelte:head>

<PageHeader kind="Indexed · {isStake ? 'stake address' : isScript ? 'script address' : 'address'}" title={id.length > 40 ? `${id.slice(0, 22)}…${id.slice(-10)}` : id}>
	{#snippet icon()}<Wallet class="h-5 w-5" />{/snippet}
	<div class="text-xs text-muted"><Hash value={id} full /></div>
	{#snippet actions()}
		{#if stakeOfAddr}<a class="y-btn h-9" href="#/x/address/{stakeOfAddr}">Stake account</a>{/if}
	{/snippet}
</PageHeader>

<Gate>
	<div class="mb-5"><Tabs {tabs} bind:active={tab} param="tab" /></div>

	{#await S().then((s) => s.coverage(isStake ? 'stake' : 'address')) then c}
		{#if !c.full}
			<div class="mb-5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm" data-testid="coverage">
				The {isStake ? 'stake' : 'address'} index currently covers only activity since {c.from}: balances and totals below are for that period, not the full history.
			</div>
		{/if}
	{/await}

	{#if tab === 'overview'}
		{#await summary}
			<div class="y-panel"><Skeleton rows={6} /></div>
		{:then w}
			{@const b = balanceSeries(w.data)}
			<div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="wallet-stats">
				<Stat label={isStake ? 'Balance of its addresses' : 'Balance'} value={`${ada(w.data.balance)} ₳`} sub={isStake ? 'at the tip · rewards not included' : 'at the published tip'} />
				<Stat label="Received" value={`${adaCompact(w.data.recv)} ₳`} sub="all time" />
				<Stat label="Sent" value={`${adaCompact(w.data.sent)} ₳`} sub="all time" />
				<Stat label="Transactions" value={int(w.data.txs)} sub={w.data.months.length ? `${monthLabel(w.data.months[0].month)} → ${monthLabel(w.data.months[w.data.months.length - 1].month)}` : 'none'} />
			</div>
			{#if w.data.months.length}
				<div class="grid gap-6 xl:grid-cols-2">
					<Panel title="Balance over time" sub="ADA at the end of each month (lovelace received - sent)">
						{#snippet actions()}<Cost cost={w.cost} />{/snippet}
						<SeriesChart kind="area" x={b.x} series={[{ name: 'Balance (ADA)', values: b.vals }]} format={(v) => adaCompact(v * 1e6)} label="Balance over time" />
					</Panel>
					<Panel title="Monthly flows" sub="ADA received and sent per month">
						<SeriesChart kind="bar" x={b.x} series={[{ name: 'Received', values: w.data.months.map((m) => m.recv / 1e6), slot: 1 }, { name: 'Sent', values: w.data.months.map((m) => m.sent / 1e6), slot: 3 }]} format={(v) => adaCompact(v * 1e6)} label="Monthly flows" />
					</Panel>
				</div>
			{:else}
				<div class="y-panel p-6 text-sm text-muted">No activity in the published data.</div>
			{/if}
		{:catch e}<ErrorBox message={err(e)} />{/await}
	{:else if tab === 'txs'}
		<Panel title="Transactions" sub="newest first · lovelace received and sent by {isStake ? 'its addresses' : 'this address'}" flush>
			{#snippet actions()}<Cost cost={txs.st.cost} />{/snippet}
			{#if txs.st.error}<ErrorBox message={txs.st.error} retry={() => txs.show(txs.st.page)} />{/if}
			{#if !txs.st.rows.length && txs.st.busy}<Skeleton rows={8} />
			{:else if !txs.st.rows.length && !txs.st.error}<div class="p-6 text-sm text-muted">No transactions in the published data.</div>
			{:else}
				<div class="overflow-x-auto {txs.st.busy ? 'opacity-60' : ''}">
					<table class="w-full text-sm" data-testid="activity">
						<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Time (UTC)</th><th>Transaction</th><th class="text-right">Received</th><th class="text-right">Sent</th><th class="px-4 text-right">Net ADA</th></tr></thead>
						<tbody class="divide-y divide-line">
							{#each txs.st.rows as a (a.tx + a.slot)}
								<tr>
									<td class="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">{time(a.slot)}</td>
									<td><Hash value={a.tx} href="#/transactions/{a.tx}" /> <a class="text-xs text-faint hover:text-brand" href="#/x/graph/{a.tx}">graph</a>{#if a.invalid} <Badge tone="bad">failed</Badge>{/if}</td>
									<td class="text-right font-mono text-xs">{a.recv ? ada(a.recv) : ''}</td>
									<td class="text-right font-mono text-xs">{a.sent ? ada(a.sent) : ''}</td>
									<td class="px-4 text-right font-mono text-xs {net(a) < 0 ? 'text-danger' : 'text-mint'}">{net(a) > 0 ? '+' : ''}{ada(net(a))}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<PrevNext page={txs.st.page} size={25} shown={txs.st.rows.length} hasNext={!!txs.st.next} busy={txs.st.busy} onprev={() => txs.show(txs.st.page - 1)} onnext={() => txs.show(txs.st.page + 1)} />
			{/if}
		</Panel>
	{:else if tab === 'tokens'}
		{#await tokens}
			<div class="y-panel"><Skeleton rows={6} /></div>
		{:then t}
			{#if t}
				<Panel title="Native assets held" sub={holder !== id ? `held by its stake account ${holder.slice(0, 14)}… (all its addresses), at the tip` : 'at the published tip'} flush>
					{#snippet actions()}<Cost cost={t.cost} />{/snippet}
					{#if !t.data.length}
						<div class="p-6 text-sm text-muted">No native assets.</div>
					{:else}
						<ul class="divide-y divide-line text-sm" data-testid="tokens">
							{#each t.data.slice(tokenPage * SMALL_PAGE, (tokenPage + 1) * SMALL_PAGE) as h (h.unit)}
								<li class="flex items-center justify-between gap-3 px-4 py-2">
									<a class="min-w-0 truncate" href="#/assets/unit/{h.unit}"><TokenName unit={h.unit} quantity={h.qty} /></a>
									<span class="flex items-center gap-3 whitespace-nowrap text-xs text-faint">{h.utxos} UTxO{h.utxos === 1 ? '' : 's'} <a class="hover:text-brand" href="#/x/holders/{h.unit}">holders</a></span>
								</li>
							{/each}
						</ul>
						{#if t.data.length > SMALL_PAGE}
							<PrevNext page={tokenPage} size={SMALL_PAGE} shown={t.data.slice(tokenPage * SMALL_PAGE, (tokenPage + 1) * SMALL_PAGE).length} total={t.data.length} hasNext={(tokenPage + 1) * SMALL_PAGE < t.data.length} onprev={() => tokenPage--} onnext={() => tokenPage++} />
						{/if}
					{/if}
				</Panel>
			{/if}
		{:catch e}<ErrorBox message={err(e)} />{/await}
	{:else if tab === 'rewards'}
		{#await rewards}
			<div class="y-panel"><Skeleton rows={6} /></div>
		{:then r}
			{#if r}
				{@const earned = r.data.rewards.reduce((a, x) => a + total(x), 0)}
				{@const tipE = lake.tip?.epoch ?? 0}
				{@const spendable = r.data.rewards.filter((x) => x.epoch + 2 <= tipE).reduce((a, x) => a + total(x), 0)}
				{@const withdrawn = r.data.withdrawals.reduce((a, x) => a + x.amount, 0)}
				<div class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="reward-stats">
					<Stat label="Rewards earned" value={`${ada(earned)} ₳`} sub="{r.data.rewards.length} epochs" />
					<Stat label="Withdrawn" value={`${ada(withdrawn)} ₳`} sub="{r.data.withdrawals.length} withdrawals" />
					<Stat label="Available to withdraw" value={`${ada(Math.max(0, spendable - withdrawn))} ₳`} sub="spendable rewards - withdrawals" />
					<Stat label="Last epoch" value={r.data.rewards.length ? `${ada(total(r.data.rewards[r.data.rewards.length - 1]))} ₳` : '—'} sub={r.data.rewards.length ? `epoch ${r.data.rewards[r.data.rewards.length - 1].epoch}` : ''} />
				</div>
				{#if r.data.rewards.length}
					<Panel title="Rewards per epoch" sub="earned for the epoch (spendable two epochs later)" class="mb-6">
						{#snippet actions()}<Cost cost={r.cost} />{/snippet}
						<SeriesChart kind="stacked" x={r.data.rewards.map((x) => String(x.epoch))} series={[{ name: 'Member', values: r.data.rewards.map((x) => x.member / 1e6) }, { name: 'Leader', values: r.data.rewards.map((x) => x.leader / 1e6), slot: 2 }, { name: 'Other', values: r.data.rewards.map((x) => x.other / 1e6), slot: 4 }]} format={(v) => adaCompact(v * 1e6)} xFormat={(e) => `epoch ${e}`} label="Rewards per epoch" />
					</Panel>
					<div class="grid gap-6 xl:grid-cols-2">
						<Panel title="Recent epochs" flush>
							<table class="w-full text-sm">
								<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Epoch</th><th>Pool</th><th class="px-4 text-right">ADA</th></tr></thead>
								<tbody class="divide-y divide-line">
									{#each [...r.data.rewards].reverse().slice(0, 30) as x (x.epoch)}
										<tr><td class="px-4 py-1.5 font-mono text-xs">{x.epoch}</td><td>{#if x.pool}<PoolName hash={x.pool} />{/if}</td><td class="px-4 text-right font-mono text-xs">{ada(total(x))}</td></tr>
									{/each}
								</tbody>
							</table>
						</Panel>
						<Panel title="Withdrawals" flush>
							{#if !r.data.withdrawals.length}<div class="p-6 text-sm text-muted">No withdrawals.</div>{:else}
								<table class="w-full text-sm">
									<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Time (UTC)</th><th>Transaction</th><th class="px-4 text-right">ADA</th></tr></thead>
									<tbody class="divide-y divide-line">
										{#each [...r.data.withdrawals].reverse() as w (w.tx)}
											<tr><td class="px-4 py-1.5 font-mono text-xs text-muted">{time(w.slot)}</td><td><Hash value={w.tx} href="#/transactions/{w.tx}" head={8} tail={6} /></td><td class="px-4 text-right font-mono text-xs">{ada(w.amount)}</td></tr>
										{/each}
									</tbody>
								</table>
							{/if}
						</Panel>
					</div>
				{:else}
					<div class="y-panel p-6 text-sm text-muted">No rewards: this stake address has not earned any in the published data.</div>
				{/if}
			{/if}
		{:catch e}<ErrorBox message={err(e)} />{/await}
	{:else if tab === 'utxos'}
		<Panel title="Unspent outputs" sub="at the published tip, newest first" flush>
			{#snippet actions()}<Cost cost={utx.st.cost} />{/snippet}
			{#if utx.st.error}<ErrorBox message={utx.st.error} retry={() => utx.show(utx.st.page)} />{/if}
			{#if !utx.st.rows.length && utx.st.busy}<Skeleton rows={6} />
			{:else if !utx.st.rows.length && !utx.st.error}<div class="p-6 text-sm text-muted">No unspent outputs.</div>
			{:else}
				<div class="overflow-x-auto {utx.st.busy ? 'opacity-60' : ''}">
					<table class="w-full text-sm" data-testid="utxos">
						<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Created (UTC)</th><th>Output</th>{#if isStake}<th>Address</th>{/if}<th class="text-right">ADA</th><th class="px-4 text-right">Assets</th></tr></thead>
						<tbody class="divide-y divide-line">
							{#each utx.st.rows as u (u.tx + u.idx)}
								<tr>
									<td class="whitespace-nowrap px-4 py-1.5 font-mono text-xs text-muted">{time(u.slot)}</td>
									<td><Hash value={u.tx} href="#/transactions/{u.tx}" head={8} tail={4} /><span class="font-mono text-xs text-faint">#{u.idx}</span>{#if u.datum} <Badge tone="violet">datum</Badge>{/if}</td>
									{#if isStake}<td>{#if u.addr}<Hash value={u.addr} href="#/x/address/{u.addr}" head={12} tail={6} />{/if}</td>{/if}
									<td class="text-right font-mono text-xs">{ada(u.lovelace)}</td>
									<td class="px-4 text-right font-mono text-xs">{u.assets || ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<PrevNext page={utx.st.page} size={50} shown={utx.st.rows.length} hasNext={!!utx.st.next} busy={utx.st.busy} onprev={() => utx.show(utx.st.page - 1)} onnext={() => utx.show(utx.st.page + 1)} />
			{/if}
		</Panel>
	{:else if tab === 'delegation'}
		{#await delegation}
			<div class="y-panel"><Skeleton rows={5} /></div>
		{:then d}
			{#if d}
				<Panel title="Delegation history" sub="registration, pool and vote delegation certificates, newest first" flush>
					{#snippet actions()}<Cost cost={d.cost} />{/snippet}
					{#if !d.data.length}<div class="p-6 text-sm text-muted">No certificates: this stake key was never registered or delegated.</div>{:else}
						<ol class="divide-y divide-line text-sm" data-testid="stake-events">
							{#each d.data as e (e.tx + e.kind + e.slot)}
								<li class="flex items-center gap-3 px-4 py-2">
									<span class="w-32 shrink-0 font-mono text-xs text-muted">{time(e.slot).slice(0, 10)}</span>
									<Badge tone={e.kind === 'pool' ? 'brand' : e.kind === 'drep' ? 'violet' : e.kind === 'dereg' ? 'warn' : 'neutral'}>{e.kind === 'pool' ? 'pool' : e.kind === 'drep' ? 'vote' : e.kind === 'reg' ? 'registered' : e.kind === 'dereg' ? 'deregistered' : e.kind}</Badge>
									<span class="min-w-0 flex-1 truncate">
										{#if e.kind === 'pool' && e.target}<PoolName hash={e.target} />
										{:else if e.kind === 'drep' && e.target?.startsWith('drep')}<a class="y-link font-mono text-xs" href="#/governance/dreps/{e.target}">{e.target.slice(0, 20)}…</a>
										{:else}<span class="text-xs text-muted">{e.target?.toLowerCase().replaceAll('_', ' ') ?? ''}</span>{/if}
									</span>
									<a class="text-xs text-faint hover:text-brand" href="#/transactions/{e.tx}">tx</a>
								</li>
							{/each}
						</ol>
					{/if}
				</Panel>
			{/if}
		{:catch e}<ErrorBox message={err(e)} />{/await}
	{:else if tab === 'addresses'}
		{#await addresses}
			<div class="y-panel"><Skeleton rows={5} /></div>
		{:then a}
			{#if a}
				<Panel title="Addresses with this stake credential" sub="{a.data.length} addresses (the explicit on-chain relation)" flush>
					{#snippet actions()}<Cost cost={a.cost} />{/snippet}
					<ul class="divide-y divide-line text-sm" data-testid="stake-addrs">
						{#each a.data.slice(addrPage * SMALL_PAGE, (addrPage + 1) * SMALL_PAGE) as x (x.address)}
							<li class="flex items-center justify-between gap-3 px-4 py-2">
								<Hash value={x.address} href="#/x/address/{x.address}" head={16} tail={8} />
								<span class="whitespace-nowrap text-xs text-faint">{int(x.outputs)} outputs · last {time(x.lastSlot).slice(0, 10)}</span>
							</li>
						{/each}
					</ul>
					{#if a.data.length > SMALL_PAGE}
						<PrevNext page={addrPage} size={SMALL_PAGE} shown={a.data.slice(addrPage * SMALL_PAGE, (addrPage + 1) * SMALL_PAGE).length} total={a.data.length} hasNext={(addrPage + 1) * SMALL_PAGE < a.data.length} onprev={() => addrPage--} onnext={() => addrPage++} />
					{/if}
				</Panel>
			{/if}
		{:catch e}<ErrorBox message={err(e)} />{/await}
	{/if}
</Gate>
