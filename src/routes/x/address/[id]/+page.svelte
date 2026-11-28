<script lang="ts">
	import Wallet from '@lucide/svelte/icons/wallet';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import type { Activity, Cost as CostT, Measured, StakeAddress, StakeEvent } from '$lib/indexdb/service';
	import { stakeAddressOf } from '$lib/bech32';
	import { ada } from '$lib/format';
	import { int } from '$lib/cardano';

	/*
	 * EXPERIMENTAL address / stake activity from the SQLite address and stake indexes. An address (addr1…, or a Byron
	 * address) lists the transactions that paid to it or spent from it. A stake address (stake1…) lists the
	 * transactions of every address carrying its credential (amounts summed), those addresses, and its certificates.
	 * Newest first, paged by keyset (slot, tx). Related addresses are only those with the same stake credential, an
	 * explicit on-chain relation: nothing is inferred from transactions.
	 */
	const id = $derived((page.params.id ?? '').split('?')[0]);
	const isStake = $derived(/^stake(_test)?1/.test(id));
	const stakeOfAddr = $derived(isStake ? null : stakeAddressOf(id));

	let rows = $state<Activity[]>([]);
	let cursor = $state<string | null>(null);
	let done = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let cost = $state<CostT | null>(null);
	let extra = $state<Promise<{ addrs: Measured<StakeAddress[]>; events: Measured<StakeEvent[]> }> | null>(null);
	let svc: typeof import('$lib/indexdb/service') | null = null;

	async function more(first = false) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			svc ??= await import('$lib/indexdb/service');
			const s = svc;
			let r;
			if (isStake) {
				const cred = s.stakeCredential(id);
				if (!cred) throw new Error('not a stake address');
				r = await s.getStakeActivity(cred, first ? null : cursor);
			} else {
				r = await s.getAddressActivity(id, first ? null : cursor);
			}
			rows = first ? r.data.rows : [...rows, ...r.data.rows];
			cursor = r.data.cursor;
			done = !r.data.cursor;
			cost = r.cost;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	$effect(() => {
		const key = id;
		untrack(() => start(key));
	});

	function start(_key: string) {
		rows = [];
		cursor = null;
		done = false;
		void more(true);
		extra = isStake
			? import('$lib/indexdb/service').then(async (s) => {
					const cred = s.stakeCredential(id)!;
					return { addrs: await s.getStakeAddresses(cred), events: await s.getStakeEvents(cred) };
				})
			: null;
	}

	const time = (slot: number) => (svc ? svc.slotTime(slot).toISOString().slice(0, 16).replace('T', ' ') : int(slot));
	const net = (a: Activity) => a.recv - a.sent;
</script>

<svelte:head><title>{isStake ? 'Stake' : 'Address'} activity · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental · indexed · {isStake ? 'stake address' : 'address'}" title={id.length > 40 ? `${id.slice(0, 22)}…${id.slice(-10)}` : id}>
	{#snippet icon()}<Wallet class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		{#if stakeOfAddr}<a class="y-btn h-9" href="#/x/address/{stakeOfAddr}">Stake account</a>{/if}
	{/snippet}
</PageHeader>

<Gate>
	<div class="mb-4 text-xs text-muted"><Hash value={id} full /></div>

	<Panel title="Transactions" sub="newest first · lovelace received and sent by {isStake ? 'its addresses' : 'this address'}" flush class="mb-6">
		{#snippet actions()}<Cost {cost} />{/snippet}
		{#if error}<ErrorBox message={error} retry={() => more(rows.length === 0)} />{/if}
		{#if !rows.length && busy}
			<Skeleton rows={8} />
		{:else if !rows.length && !error}
			<div class="p-6 text-sm text-muted">No transactions in the published data.</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm" data-testid="activity">
					<thead class="text-left text-xs text-faint"><tr><th class="px-4 py-2">Time (UTC)</th><th>Transaction</th><th class="text-right">Received</th><th class="text-right">Sent</th><th class="px-4 text-right">Net ADA</th></tr></thead>
					<tbody class="divide-y divide-line">
						{#each rows as a (a.tx + a.slot)}
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
			<div class="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
				<span>{rows.length} shown</span>
				{#if !done}<button class="y-btn h-8 text-xs" onclick={() => more()} disabled={busy} data-testid="older">{busy ? 'Loading…' : 'Older'}</button>{:else}<span>end of history</span>{/if}
			</div>
		{/if}
	</Panel>

	{#if extra}
		{#await extra}
			<div class="y-panel"><Skeleton rows={4} /></div>
		{:then x}
			<div class="grid gap-6 lg:grid-cols-2">
				<Panel title="Addresses with this stake credential" sub="{x.addrs.data.length} addresses" flush>
					{#snippet actions()}<Cost cost={x.addrs.cost} />{/snippet}
					<ul class="max-h-96 divide-y divide-line overflow-auto text-sm" data-testid="stake-addrs">
						{#each x.addrs.data as a (a.address)}
							<li class="flex items-center justify-between gap-3 px-4 py-2">
								<Hash value={a.address} href="#/x/address/{a.address}" head={16} tail={8} />
								<span class="whitespace-nowrap text-xs text-faint">{int(a.outputs)} outputs · last {time(a.lastSlot).slice(0, 10)}</span>
							</li>
						{/each}
					</ul>
				</Panel>
				<Panel title="Certificates" sub="registration and delegation" flush>
					{#snippet actions()}<Cost cost={x.events.cost} />{/snippet}
					<ul class="max-h-96 divide-y divide-line overflow-auto text-sm" data-testid="stake-events">
						{#each x.events.data as e (e.tx + e.kind + e.slot)}
							<li class="flex items-center gap-3 px-4 py-2">
								<Badge tone={e.kind === 'pool' ? 'brand' : e.kind === 'drep' ? 'violet' : e.kind === 'dereg' ? 'warn' : 'neutral'}>{e.kind}</Badge>
								<span class="min-w-0 flex-1 truncate font-mono text-xs">
									{#if e.kind === 'pool' && e.target}<a class="y-link" href="#/pools/{e.target}">{e.target}</a>
									{:else if e.kind === 'drep' && e.target && e.target.startsWith('drep')}<a class="y-link" href="#/governance/dreps/{e.target}">{e.target}</a>
									{:else}{e.target ?? ''}{/if}
								</span>
								<span class="whitespace-nowrap text-xs text-faint">{time(e.slot).slice(0, 10)}</span>
								<a class="text-xs text-faint hover:text-brand" href="#/transactions/{e.tx}">tx</a>
							</li>
						{/each}
					</ul>
				</Panel>
			</div>
		{:catch e}
			<ErrorBox message={e instanceof Error ? e.message : String(e)} />
		{/await}
	{/if}
</Gate>
