<script lang="ts">
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';
	import PoolName from '$lib/names/PoolName.svelte';
	import { STATUS, short } from '$lib/charts/series';
	import { summaryUrl } from '$lib/lake/lake.svelte';
	import { actionMeta, httpUrls } from '$lib/lake/offchain';
	import { proposalTone, typeLabel } from '$lib/lake/governance';
	import { add, drepPower, emptyTally, latestVotes, powerAt, proposals, roleOf, voteKey, type Role, type Tally } from '$lib/lake/votes';
	import { names } from '$lib/names/names.svelte';
	import { adaShort, utc } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/*
	 * One governance action: its text (CIP-108), how each body voted (by voter count, and DReps also by stake at
	 * the epoch the votes were tallied), how the votes came in over time, and every voter.
	 */
	const tx = $derived((page.params.tx ?? '').toLowerCase());
	const idx = $derived(Number((page.params.idx ?? '0').split('?')[0]));
	const key = $derived(`${tx}#${idx}`);

	const data = $derived.by(() => {
		const k = key;
		return Promise.all([proposals(), latestVotes(), drepPower(), actionMeta()]).then(([props, votes, power, metas]) => {
			const p = props.find((x) => `${x.tx_hash}#${x.idx}` === k) ?? null;
			const mine = votes.filter((v) => voteKey(v) === k).sort((a, b) => Number(a.slot) - Number(b.slot));
			const byRole: Record<Role, Tally> = { DRep: emptyTally(), SPO: emptyTally(), CC: emptyTally() };
			for (const v of mine) add(byRole[roleOf(v.voter_type)], v.vote);
			// DRep stake: power at the epoch the action was last tallied (its status epoch, else the newest distribution).
			const at = Math.min(p?.status_epoch ?? Infinity, power.epochs.at(-1) ?? 0);
			const stake = emptyTally();
			const voted = new Set<string>();
			for (const v of mine) {
				if (roleOf(v.voter_type) !== 'DRep') continue;
				add(stake, v.vote, powerAt(power, v.voter_hash, at));
				voted.add(v.voter_hash);
			}
			let notVoted = 0;
			for (const [h, w] of power.byEpoch.get(power.epochs.filter((e) => e <= at).at(-1) ?? at) ?? []) if (!voted.has(h)) notVoted += w;
			// Cumulative votes by epoch, per role.
			const epochs = [...new Set(mine.map((v) => v.epoch))].sort((a, b) => a - b);
			const cum = epochs.map((e) => {
				const t = { DRep: 0, SPO: 0, CC: 0 };
				for (const v of mine) if (v.epoch <= e) t[roleOf(v.voter_type)]++;
				return t;
			});
			return { p, mine, byRole, stake, notVoted, at, epochs, cum, meta: metas.get(k) ?? null, power, atEpoch: at };
		});
	});

	const voteTone = (v: string) => (v === 'YES' ? 'ok' : v === 'NO' ? 'bad' : 'neutral');
	const parts = (t: Tally) => [
		{ label: 'Yes', value: t.yes, color: STATUS.yes },
		{ label: 'No', value: t.no, color: STATUS.no },
		{ label: 'Abstain', value: t.abstain, color: STATUS.abstain }
	];
	let roleFilter = $state<Role | 'all'>('all');
</script>

<svelte:head><title>Governance action {shorten(tx, 8, 6)}#{idx} · Yaci Lens</title></svelte:head>

{#await data}
	<PageHeader kind="Governance action" title={shorten(tx, 12, 8) + '#' + idx}>
		{#snippet icon()}<ScrollText class="h-5 w-5" />{/snippet}
	</PageHeader>
	<div class="y-panel"><Skeleton rows={10} /></div>
{:then d}
	{@const title = d.meta?.fetched && d.meta.hash_ok !== false ? d.meta.title : null}
	<PageHeader kind={typeLabel(d.p?.type)} title={title ?? `${typeLabel(d.p?.type)} ${shorten(tx, 8, 6)}#${idx}`}>
		{#snippet icon()}<ScrollText class="h-5 w-5" />{/snippet}
		<span class="mono break-all text-xs text-faint">{tx}#{idx}</span>
		{#snippet actions()}
			{#if d.p?.status}<Badge tone={proposalTone(d.p.status)}>{d.p.status}{d.p.status_epoch ? ` · epoch ${d.p.status_epoch}` : ''}</Badge>{/if}
			{#if d.p?.anchor_url && httpUrls(d.p.anchor_url)[0]}<a class="y-btn h-8 text-xs" href={httpUrls(d.p.anchor_url)[0]} target="_blank" rel="noopener noreferrer nofollow">Document<ExternalLink class="h-3.5 w-3.5" /></a>{/if}
		{/snippet}
	</PageHeader>

	{#if !d.p}
		<div class="y-panel p-6 text-sm text-muted">No governance action {shorten(tx, 10, 6)}#{idx} in the published data.</div>
	{:else}
		<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
			<Stat label="Proposed" value={`epoch ${d.p.proposed_epoch}`} sub={utc(d.p.block_time)} />
			<Stat label="Deposit" value={adaShort(d.p.deposit_ada)} color="rgb(var(--c-violet))" />
			<Stat label="Voters" value={short(d.mine.length)} sub={`${d.byRole.DRep.yes + d.byRole.DRep.no + d.byRole.DRep.abstain} DReps · ${d.byRole.SPO.yes + d.byRole.SPO.no + d.byRole.SPO.abstain} SPOs · ${d.byRole.CC.yes + d.byRole.CC.no + d.byRole.CC.abstain} CC`} color="rgb(var(--c-blue))" />
			<Stat label="DRep stake voting yes" value={d.stake.yes + d.stake.no ? `${((d.stake.yes / (d.stake.yes + d.stake.no + d.notVoted)) * 100).toFixed(1)}%` : '—'} sub={`of DRep stake (yes, no and not voted), epoch ${d.atEpoch}`} color="rgb(var(--c-mint))" />
		</section>

		<section class="mb-6 grid gap-6 xl:grid-cols-2">
			<Panel title="Votes by body" sub="Latest vote of each voter, by count">
				<div class="flex flex-col gap-5">
					{#each [{ label: 'DReps', t: d.byRole.DRep }, { label: 'Stake pools (SPOs)', t: d.byRole.SPO }, { label: 'Constitutional committee', t: d.byRole.CC }] as g (g.label)}
						<div>
							<div class="mb-1.5 text-sm font-medium">{g.label}</div>
							{#if g.t.yes + g.t.no + g.t.abstain}<SplitBar parts={parts(g.t)} />{:else}<p class="text-xs text-muted">No votes{g.label.startsWith('Stake') && d.p?.type === 'TREASURY_WITHDRAWALS_ACTION' ? ' (SPOs don’t vote on treasury withdrawals)' : ''}.</p>{/if}
						</div>
					{/each}
				</div>
			</Panel>
			<Panel title="DRep votes by stake" sub={`Voting power at epoch ${d.atEpoch}; registered DReps that didn't vote are counted separately`}>
				<SplitBar
					format={(v) => adaShort(v)}
					parts={[...parts(d.stake), { label: 'Not voted', value: d.notVoted, color: 'rgb(var(--c-line))' }]}
				/>
				{#if d.p.voting_stats}<div class="mt-5"><JsonView value={d.p.voting_stats} label="Ledger voting stats (Yaci Store)" maxHeight={200} /></div>{/if}
			</Panel>
		</section>

		{#if d.epochs.length > 1}
			<Panel title="How the votes came in" sub="Cumulative voters by epoch" class="mb-6">
				<SeriesChart
					x={d.epochs.map(String)}
					xFormat={(s) => `epoch ${s}`}
					series={[
						{ name: 'DReps', values: d.cum.map((c) => c.DRep), slot: 0 },
						{ name: 'SPOs', values: d.cum.map((c) => c.SPO), slot: 5 },
						{ name: 'Constitutional committee', values: d.cum.map((c) => c.CC), slot: 3 }
					]}
					kind="line"
					height={180}
					label="Cumulative voters by epoch"
				/>
			</Panel>
		{/if}

		{#if d.meta?.fetched}
			<Panel title="Proposal" sub="CIP-108 document, hash-checked by the publish job" class="mb-6">
				{#if d.meta.hash_ok === false}<p class="mb-3 text-xs text-danger">The anchored document changed since submission (hash mismatch).</p>{/if}
				<div class="grid gap-4 text-sm">
					{#each [['Abstract', d.meta.abstract], ['Motivation', d.meta.motivation], ['Rationale', d.meta.rationale]] as [label, text] (label)}
						{#if text}<div><div class="y-label mb-1">{label}</div><p class="max-h-72 overflow-y-auto whitespace-pre-line leading-relaxed">{text}</p></div>{/if}
					{/each}
				</div>
			</Panel>
		{/if}

		<Panel title="Voters" sub="Latest vote of each voter" flush class="mb-6">
			{#snippet actions()}
				<div class="flex items-center gap-2">
					<div class="inline-flex rounded-xl border border-line bg-surface-2/60 p-0.5">
						{#each [['all', 'All'], ['DRep', 'DReps'], ['SPO', 'SPOs'], ['CC', 'CC']] as [id, label] (id)}
							<button class="rounded-[10px] px-2.5 py-1 text-xs font-medium {roleFilter === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}" onclick={() => (roleFilter = id as Role | 'all')}>{label}</button>
						{/each}
					</div>
					<SqlButton sql={`SELECT * FROM '${summaryUrl('votes')}' WHERE gov_action_tx_hash = '${tx}' AND gov_action_index = ${idx} ORDER BY slot`} />
				</div>
			{/snippet}
			<ul class="max-h-[32rem] divide-y divide-line/70 overflow-y-auto">
				{#each d.mine.filter((v) => roleFilter === 'all' || roleOf(v.voter_type) === roleFilter).sort((a, b) => (roleOf(a.voter_type) === 'DRep' && roleOf(b.voter_type) === 'DRep' ? powerAt(d.power, b.voter_hash, d.atEpoch) - powerAt(d.power, a.voter_hash, d.atEpoch) : 0)) as v (v.voter_type + v.voter_hash)}
					{@const role = roleOf(v.voter_type)}
					<li class="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
						<Badge tone={voteTone(v.vote)}>{v.vote}</Badge>
						<span class="w-10 text-xs text-muted">{role}</span>
						<span class="min-w-0 flex-1 truncate">
							{#if role === 'DRep'}<a class="y-link" href="#/governance/dreps/{v.voter_hash}">{names.drep(v.voter_hash) ?? shorten(v.voter_hash, 10, 6)}</a>
							{:else if role === 'SPO'}<PoolName hash={v.voter_hash} />
							{:else}<span class="mono text-xs">{shorten(v.voter_hash, 10, 6)}</span>{/if}
						</span>
						{#if role === 'DRep'}<span class="text-xs tabular-nums text-muted">{adaShort(powerAt(d.power, v.voter_hash, d.atEpoch))}</span>{/if}
						<span class="text-xs tabular-nums text-faint">epoch {v.epoch}</span>
						{#if v.anchor_url && httpUrls(v.anchor_url)[0]}<a class="text-xs text-faint hover:text-brand" href={httpUrls(v.anchor_url)[0]} target="_blank" rel="noopener noreferrer nofollow">rationale</a>{/if}
						<a class="mono text-xs text-faint hover:text-brand" href="#/transactions/{v.tx_hash}?date={new Date(v.date).toISOString().slice(0, 10)}">{shorten(v.tx_hash, 6, 4)}</a>
					</li>
				{:else}
					<li class="px-5 py-6 text-sm text-muted">No votes.</li>
				{/each}
			</ul>
		</Panel>

		{#if d.p.details}<Panel title="Details"><JsonView value={d.p.details} label="Action details" maxHeight={360} /></Panel>{/if}
	{/if}
{/await}
