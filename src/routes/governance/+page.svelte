<script lang="ts">
	import { names } from '$lib/names/names.svelte';
	import { actionMeta } from '$lib/lake/offchain';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import { summary } from '$lib/lake/lake.svelte';
	import type { Proposal } from '$lib/lake/types';
	import { proposalTone, typeLabel } from '$lib/lake/governance';
	import { adaShort, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';

	function load() {
		return summary<Proposal>('governance');
	}
	let data = $state(load());
	let status = $state('ALL');
	let open = $state<string | null>(null);

	function votes(yes: number, no: number, abstain: number) {
		const t = yes + no + abstain;
		return { yes, no, abstain, t, y: t ? (yes / t) * 100 : 0, n: t ? (no / t) * 100 : 0 };
	}
</script>

<svelte:head><title>Governance · Yaci Lens</title></svelte:head>

<PageHeader kind="Governance" title="Governance actions">
	{#snippet icon()}<ScrollText class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<select class="y-input h-9 w-auto" bind:value={status}>
			{#each ['ALL', 'ACTIVE', 'RATIFIED', 'ENACTED', 'EXPIRED', 'DROPPED'] as s (s)}<option value={s}>{s === 'ALL' ? 'All statuses' : s}</option>{/each}
		</select>
	{/snippet}
	Every Conway governance action with its latest status and each voter's latest vote, counted by role.
</PageHeader>

{#await data}
	<div class="y-panel"><Skeleton rows={10} /></div>
{:then proposals}
	{@const rows = status === 'ALL' ? proposals : proposals.filter((p) => p.status === status)}
	<div class="flex flex-col gap-3">
		{#each rows as p (p.tx_hash + p.idx)}
			{@const key = p.tx_hash + p.idx}
			{@const d = votes(p.drep_yes, p.drep_no, p.drep_abstain)}
			{@const s = votes(p.spo_yes, p.spo_no, p.spo_abstain)}
			{@const c = votes(p.cc_yes, p.cc_no, p.cc_abstain)}
			<section class="y-panel overflow-hidden">
				<button class="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left" onclick={() => (open = open === key ? null : key)}>
					<Badge tone={proposalTone(p.status)}>{p.status ?? '—'}</Badge>
					<span class="min-w-0 font-display font-semibold">{names.action(p.tx_hash, p.idx) ?? typeLabel(p.type)}</span>{#if names.action(p.tx_hash, p.idx)}<span class="text-xs text-muted">{typeLabel(p.type)}</span>{/if}
					<span class="font-mono text-xs text-faint">{shorten(p.tx_hash, 8, 6)}#{p.idx}</span>
					<span class="ml-auto flex items-center gap-4 text-xs text-muted">
						{#each [['DReps', d], ['SPOs', s], ['CC', c]] as [label, v] (label)}
							{@const vv = v as ReturnType<typeof votes>}
							<span class="hidden items-center gap-1.5 md:flex" title="{vv.yes} yes · {vv.no} no · {vv.abstain} abstain">
								{label}
								<span class="flex h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
									<span class="bg-mint" style="width:{vv.y}%"></span><span class="bg-danger" style="width:{vv.n}%"></span>
								</span>
								<span class="tabular-nums">{vv.t}</span>
							</span>
						{/each}
						<span>epoch {p.proposed_epoch}</span>
						<ChevronDown class="h-4 w-4 transition {open === key ? 'rotate-180' : ''}" />
					</span>
				</button>
				{#if open === key}
					<div class="grid gap-5 border-t border-line/70 px-5 py-4 text-sm lg:grid-cols-2">
						<dl class="grid gap-3">
							<div><dt class="y-label">Submitted</dt><dd>{utc(p.block_time)} · deposit {adaShort(p.deposit_ada)}</dd></div>
							<div><dt class="y-label">Status</dt><dd>{p.status ?? '—'} as of epoch {p.status_epoch ?? '—'}</dd></div>
							<div><dt class="y-label">Votes (count of voters)</dt><dd class="tabular-nums">DReps {d.yes} yes / {d.no} no / {d.abstain} abstain · SPOs {s.yes} / {s.no} / {s.abstain} · CC {c.yes} / {c.no} / {c.abstain}</dd></div>
							{#if p.anchor_url}<div><dt class="y-label">Anchor</dt><dd class="break-all"><a class="y-link" href={p.anchor_url.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/')} target="_blank" rel="noopener noreferrer">{p.anchor_url}</a></dd></div>{/if}
							<div><dt class="y-label">Transaction</dt><dd class="font-mono text-xs break-all">{p.tx_hash}#{p.idx}</dd></div>
						</dl>
						<div class="flex min-w-0 flex-col gap-3">
							{#await actionMeta() then am}
								{@const m = am.get(`${p.tx_hash}#${p.idx}`)}
								{#if m?.fetched && m.hash_ok !== false}
									{#each [['Abstract', m.abstract], ['Motivation', m.motivation], ['Rationale', m.rationale]] as [label, text] (label)}
										{#if text}<div><div class="y-label mb-1">{label}</div><p class="max-h-60 overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{text}</p></div>{/if}
									{/each}
								{:else if m && m.hash_ok === false}<p class="text-xs text-danger">The anchored document changed since submission (hash mismatch).</p>{/if}
							{/await}
							{#if p.voting_stats}<JsonView value={p.voting_stats} label="Voting stats (stake-weighted)" maxHeight={220} />{/if}
							{#if p.details}<JsonView value={p.details} label="Details" maxHeight={220} />{/if}
						</div>
					</div>
				{/if}
			</section>
		{:else}
			<div class="y-panel p-6 text-sm text-muted">No governance actions with this status.</div>
		{/each}
	</div>
{:catch e}
	<div class="y-panel"><ErrorBox title="Couldn't load governance actions" message={String(e?.message ?? e)} retry={() => (data = load())} /></div>
{/await}
