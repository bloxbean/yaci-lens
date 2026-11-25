<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import KV from '$lib/ui/KV.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import { live, day } from '$lib/lake/lake.svelte';
	import { int, poolBech32, utc } from '$lib/cardano';
	import { ada } from '$lib/format';

	const number = $derived(Number(page.params.number));

	interface BlockRow {
		hash: string;
		number: number;
		slot: number;
		epoch: number;
		epoch_slot: number;
		block_time: Date;
		date: Date;
		no_of_txs: number;
		total_fees: number;
		total_output: string;
		body_size: number;
		slot_leader: string;
		prev_hash: string;
		protocol_version: string;
		era: number;
		op_cert_seq_number: number;
		op_cert_kes_period: number;
	}
	interface TxRow {
		tx_hash: string;
		tx_index: number;
		fee: number;
		invalid: boolean;
		outputs: number;
		redeemers: number;
		metadata: number;
	}

	const blockSql = (n: number) => `SELECT * EXCLUDE (vrf_result, vrf_vkey, leader_vrf, nonce_vrf, issuer_vkey, op_cert_hot_vkey, op_cert_sigma, body_hash)
FROM block WHERE number = ${n}`;
	const txSql = (n: number, d: string) => `SELECT t.tx_hash, t.tx_index, t.fee, t.invalid,
       json_array_length(t.outputs) AS outputs,
       (SELECT count(*) FROM transaction_scripts s WHERE s.date = DATE '${d}' AND s.tx_hash = t.tx_hash) AS redeemers,
       (SELECT count(*) FROM transaction_metadata m WHERE m.date = DATE '${d}' AND m.tx_hash = t.tx_hash) AS metadata
FROM transaction t
WHERE t.date = DATE '${d}' AND t.block = ${n}
ORDER BY t.tx_index`;

	async function load(n: number) {
		const [b] = await live<BlockRow>(blockSql(n));
		if (!b) return { block: null, txs: Promise.resolve([] as TxRow[]), d: '' };
		const d = day(b.date);
		return { block: b, d, txs: b.no_of_txs ? live<TxRow>(txSql(n, d)) : Promise.resolve([] as TxRow[]) };
	}
	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return load(number);
	});

	const columns: Column[] = [
		{ key: 'idx', label: '#' },
		{ key: 'hash', label: 'Transaction' },
		{ key: 'outputs', label: 'Outputs', align: 'right', minor: true },
		{ key: 'tags', label: '' },
		{ key: 'fee', label: 'Fee', align: 'right' }
	];
</script>

<svelte:head><title>Block #{number} · Yaci Lens</title></svelte:head>

<PageHeader kind="Block" title="#{int(number)}">
	{#snippet icon()}<Box class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<a class="y-btn h-9" href="#/blocks/{number - 1}" aria-label="Previous block"><ChevronLeft class="h-4 w-4" /></a>
		<a class="y-btn h-9" href="#/blocks/{number + 1}" aria-label="Next block"><ChevronRight class="h-4 w-4" /></a>
	{/snippet}
</PageHeader>

{#await data}
	<div class="y-panel"><Skeleton rows={8} /></div>
{:then { block: b, d, txs }}
	{#if !b}
		<div class="y-panel p-6 text-sm text-muted">Block #{int(number)} isn't in this snapshot (it may be newer than the published data).</div>
	{:else}
		<Panel title="Block" class="mb-6">
			{#snippet actions()}<SqlButton sql={blockSql(number)} />{/snippet}
			<dl class="grid gap-x-10 gap-y-4 md:grid-cols-2">
				<KV label="Hash"><Hash value={b.hash} /></KV>
				<KV label="Time">{utc(b.block_time)}</KV>
				<KV label="Epoch / slot"><a class="y-link" href="#/epochs/{b.epoch}">{b.epoch}</a> / {int(b.epoch_slot)} · slot {int(b.slot)}</KV>
				<KV label="Pool"><a class="y-link font-mono text-xs" href="#/pools/{poolBech32(b.slot_leader)}">{poolBech32(b.slot_leader)}</a></KV>
				<KV label="Transactions">{b.no_of_txs}</KV>
				<KV label="Fees">₳{ada(b.total_fees)}</KV>
				<KV label="Size">{int(b.body_size)} bytes</KV>
				<KV label="Protocol">{b.protocol_version} · era {b.era}</KV>
				<KV label="Previous"><a class="y-link font-mono text-xs" href="#/blocks/{number - 1}">{b.prev_hash?.slice(0, 16)}…</a></KV>
				<KV label="Op cert">#{b.op_cert_seq_number} · KES {b.op_cert_kes_period}</KV>
			</dl>
		</Panel>

		<Panel title="Transactions" sub="Live query on the {d} partition" flush>
			{#snippet actions()}<SqlButton sql={txSql(number, d)} />{/snippet}
			{#await txs}
				<Skeleton rows={Math.min(8, b.no_of_txs || 1)} />
			{:then rows}
				<DataTable {rows} {columns} key={(t) => t.tx_hash} rowHref={(t) => `#/transactions/${t.tx_hash}?date=${d}`} dense emptyTitle="No transactions in this block">
					{#snippet cell(t, k)}
						{#if k === 'idx'}<span class="tabular-nums text-faint">{t.tx_index}</span>
						{:else if k === 'hash'}<a class="y-link font-mono text-xs" href="#/transactions/{t.tx_hash}?date={d}">{t.tx_hash}</a>
						{:else if k === 'outputs'}<span class="tabular-nums">{t.outputs}</span>
						{:else if k === 'tags'}
							<span class="flex gap-1">
								{#if t.redeemers}<Badge tone="violet">{t.redeemers} script{t.redeemers > 1 ? 's' : ''}</Badge>{/if}
								{#if t.metadata}<Badge tone="cyan">metadata</Badge>{/if}
								{#if t.invalid}<Badge tone="bad">invalid</Badge>{/if}
							</span>
						{:else if k === 'fee'}<span class="tabular-nums">₳{ada(t.fee)}</span>
						{/if}
					{/snippet}
				</DataTable>
			{:catch e}
				<ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} />
			{/await}
		</Panel>
	{/if}
{:catch e}
	<div class="y-panel"><ErrorBox title="Query failed" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
{/await}
