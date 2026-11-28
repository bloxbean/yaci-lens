<script lang="ts">
	import PoolDelegators from '$lib/indexdb/PoolDelegators.svelte';
	import { indexEnabled } from '$lib/indexdb/config';
	import Users from '@lucide/svelte/icons/users';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import JsonView from '$lib/ui/JsonView.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';
	import { STATUS } from '$lib/charts/series';
	import { summary, summaryUrl } from '$lib/lake/lake.svelte';
	import { drepMeta, fetchAnchor, httpUrls } from '$lib/lake/offchain';
	import { proposalTone, typeLabel } from '$lib/lake/governance';
	import { add, drepPower, emptyTally, latestVotes, majority, passed, proposals, roleOf, voteKey, type Tally } from '$lib/lake/votes';
	import { drepKey } from '$lib/names/keys';
	import { names } from '$lib/names/names.svelte';
	import type { DRep } from '$lib/lake/types';
	import { adaShort } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/*
	 * One DRep: profile (CIP-119), voting power now and over time, and its voting record: every action it voted on,
	 * how it voted, and how often it agreed with the outcome and with the SPOs' and the committee's majority.
	 */
	const id = $derived((page.params.id ?? '').toLowerCase());
	// delegators joining / leaving (SQLite deleg index), when the indexes are on and published
	let indexed = $state(false);
	if (indexEnabled()) import('$lib/indexdb/service').then((s) => s.indexAvailable()).then((ok) => (indexed = ok));

	const data = $derived.by(() => {
		const key = id;
		const dist = summary<DRep>('dreps');
		const hash = dist.then((ds) => ds.find((d) => d.drep_id === key || d.drep_hash === key)?.drep_hash ?? drepKey(key) ?? key);
		return {
			drep: dist.then((ds) => ds.find((d) => d.drep_id === key || d.drep_hash === key) ?? null),
			total: dist.then((ds) => ds.reduce((s, d) => s + d.voting_power_ada, 0)),
			meta: Promise.all([hash, drepMeta()]).then(([h, m]) => m.get(h) ?? [...m.values()].find((x) => x.drep_id === key) ?? null),
			record: Promise.all([hash, latestVotes(), proposals(), drepPower()]).then(([h, votes, props, power]) => {
				const byAction = new Map(props.map((p) => [`${p.tx_hash}#${p.idx}`, p]));
				// Majorities of the other bodies on each action (count of voters).
				const others = new Map<string, { SPO: Tally; CC: Tally }>();
				for (const v of votes) {
					const r = roleOf(v.voter_type);
					if (r === 'DRep') continue;
					const o = others.get(voteKey(v)) ?? others.set(voteKey(v), { SPO: emptyTally(), CC: emptyTally() }).get(voteKey(v))!;
					add(o[r], v.vote);
				}
				const mine = votes.filter((v) => roleOf(v.voter_type) === 'DRep' && v.voter_hash === h).sort((a, b) => Number(b.slot) - Number(a.slot));
				const mix = emptyTally();
				const agree = { outcome: [0, 0], spo: [0, 0], cc: [0, 0] };
				for (const v of mine) {
					add(mix, v.vote);
					if (v.vote === 'ABSTAIN') continue;
					const p = byAction.get(voteKey(v));
					if (p && p.status && p.status !== 'ACTIVE') {
						agree.outcome[1]++;
						if ((v.vote === 'YES') === passed(p)) agree.outcome[0]++;
					}
					const o = others.get(voteKey(v));
					for (const [k, t] of [['spo', o?.SPO], ['cc', o?.CC]] as const) {
						const mj = t ? majority(t) : null;
						if (!mj) continue;
						agree[k][1]++;
						if (mj === v.vote) agree[k][0]++;
					}
				}
				const history = power.rows.filter((r) => r.drep_hash === h);
				return { hash: h, mine, mix, agree, byAction, history };
			})
		};
	});

	// The full CIP-119 document, fetched by this browser when the host allows it (cached a day).
	let doc = $state<{ status: 'idle' | 'loading' | 'ok' | 'error'; json?: unknown; verified?: boolean | null; from?: string; error?: string }>({ status: 'idle' });
	async function loadDoc(url: string, hash: string | null) {
		doc = { status: 'loading' };
		try {
			const d = await fetchAnchor(url, hash);
			doc = { status: 'ok', json: d.json, verified: d.verified, from: d.fetchedFrom };
		} catch (e) {
			doc = { status: 'error', error: e instanceof Error ? e.message : String(e) };
		}
	}

	const imageUrl = (u: string | null) => httpUrls(u)[0] ?? null;
	const ratio = ([a, b]: number[]) => (b ? `${Math.round((a / b) * 100)}%` : '—');
	const voteTone = (v: string) => (v === 'YES' ? 'ok' : v === 'NO' ? 'bad' : 'neutral');
</script>

<svelte:head><title>DRep {shorten(id, 10, 6)} · Yaci Lens</title></svelte:head>

{#await data.meta}
	<div class="y-panel"><Skeleton rows={6} /></div>
{:then m}
	{@const named = m?.fetched && m.hash_ok !== false ? m : null}
	<PageHeader kind="DRep" title={named?.given_name ?? shorten(id, 14, 8)}>
		{#snippet icon()}
			{#if named?.image && imageUrl(named.image)}<img src={imageUrl(named.image)} alt="" class="h-full w-full rounded-2xl object-cover" referrerpolicy="no-referrer" />{:else}<Users class="h-5 w-5" />{/if}
		{/snippet}
		<Hash value={id} full />
	</PageHeader>

	{#await data.drep then d}
		{#await data.total then total}
			{#if d}
				<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-3 sm:gap-4">
					<Stat label="Voting power" value={adaShort(d.voting_power_ada)} sub={`${((d.voting_power_ada / total) * 100).toFixed(3)}% · epoch ${d.epoch}`} />
					<Stat label="Status" value={d.status ?? '—'} color="rgb(var(--c-violet))" />
					<Stat label="Active until" value={d.active_until != null ? `epoch ${d.active_until}` : '—'} sub={d.expiry != null ? `expires epoch ${d.expiry}` : undefined} color="rgb(var(--c-blue))" />
				</section>
			{/if}
		{/await}
	{/await}

	{#await data.record}
		<div class="y-panel mb-6"><Skeleton rows={6} /></div>
	{:then rec}
		<section class="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
			<Panel title="Voting power over time" sub="Per epoch (DRep distribution)">
				{#snippet actions()}<SqlButton sql={`SELECT epoch, power_ada FROM '${summaryUrl('drep_power')}' WHERE drep_hash = '${rec.hash}' ORDER BY epoch`} />{/snippet}
				{#if rec.history.length}
					<SeriesChart x={rec.history.map((x) => String(x.epoch))} xFormat={(s) => `epoch ${s}`} series={[{ name: 'Voting power', values: rec.history.map((x) => x.power_ada), slot: 0 }]} kind="area" height={180} format={(v) => adaShort(v)} label="Voting power per epoch" />
				{:else}
					<p class="text-sm text-muted">No voting power recorded.</p>
				{/if}
			</Panel>
			<Panel title="Voting record" sub={`${rec.mine.length} actions voted on`}>
				<SplitBar parts={[{ label: 'Yes', value: rec.mix.yes, color: STATUS.yes }, { label: 'No', value: rec.mix.no, color: STATUS.no }, { label: 'Abstain', value: rec.mix.abstain, color: STATUS.abstain }]} />
				<dl class="mt-5 grid grid-cols-3 gap-4 text-sm">
					<div title="Of decided actions it voted yes or no on: yes on one that passed, or no on one that didn't">
						<dt class="text-xs text-muted">Agreed with the outcome</dt>
						<dd class="font-display text-xl font-semibold tabular-nums">{ratio(rec.agree.outcome)}</dd>
						<dd class="text-xs text-faint">{rec.agree.outcome[1]} decided actions</dd>
					</div>
					<div title="Same as the majority of SPO votes (yes vs no) on the action">
						<dt class="text-xs text-muted">Agreed with SPOs</dt>
						<dd class="font-display text-xl font-semibold tabular-nums">{ratio(rec.agree.spo)}</dd>
						<dd class="text-xs text-faint">{rec.agree.spo[1]} actions</dd>
					</div>
					<div title="Same as the majority of constitutional committee votes on the action">
						<dt class="text-xs text-muted">Agreed with the CC</dt>
						<dd class="font-display text-xl font-semibold tabular-nums">{ratio(rec.agree.cc)}</dd>
						<dd class="text-xs text-faint">{rec.agree.cc[1]} actions</dd>
					</div>
				</dl>
			</Panel>
		</section>

		{#if rec.mine.length}
			<Panel title="Votes" sub="Latest vote on each action, newest first" class="mb-6" flush>
				{#snippet actions()}<SqlButton sql={`SELECT * FROM '${summaryUrl('votes')}' WHERE voter_hash = '${rec.hash}' ORDER BY slot DESC`} />{/snippet}
				<ul class="divide-y divide-line/70">
					{#each rec.mine as v (v.tx_hash + voteKey(v))}
						{@const p = rec.byAction.get(voteKey(v))}
						<li class="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
							<Badge tone={voteTone(v.vote)}>{v.vote}</Badge>
							<a class="y-link min-w-0 flex-1 truncate" href="#/governance/actions/{v.gov_action_tx_hash}/{v.gov_action_index}">{names.action(v.gov_action_tx_hash, v.gov_action_index) ?? `${shorten(v.gov_action_tx_hash, 8, 6)}#${v.gov_action_index}`}</a>
							<span class="text-xs text-muted">{typeLabel(p?.type)}</span>
							{#if p?.status}<Badge tone={proposalTone(p.status)}>{p.status}</Badge>{/if}
							<span class="text-xs tabular-nums text-faint">epoch {v.epoch}</span>
							<a class="mono text-xs text-faint hover:text-brand" href="#/transactions/{v.tx_hash}?date={new Date(v.date).toISOString().slice(0, 10)}">{shorten(v.tx_hash, 6, 4)}</a>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}
	{/await}

	{#await data.drep then d}{#if indexed && d?.drep_id}<PoolDelegators drep={d.drep_id} />{/if}{/await}

	<Panel title="Profile" sub="Self-declared by the DRep (CIP-119), fetched and hash-checked by the publish job" class="mb-6">
		{#if !m}
			<p class="text-sm text-muted">No metadata anchor registered.</p>
		{:else if !m.fetched}
			<p class="text-sm text-muted">The document couldn't be fetched ({m.error ?? 'unknown error'}).</p>
		{:else}
			<p class="mb-4 flex items-center gap-1.5 text-xs {m.hash_ok === false ? 'text-danger' : 'text-mint'}">
				{#if m.hash_ok === false}<ShieldAlert class="h-3.5 w-3.5" />The document changed since it was anchored on chain (hash mismatch).{:else}<ShieldCheck class="h-3.5 w-3.5" />Hash matches the chain.{/if}
			</p>
			<dl class="grid gap-4 text-sm">
				{#each [['Objectives', m.objectives], ['Motivations', m.motivations], ['Qualifications', m.qualifications]] as [label, text] (label)}
					{#if text}<div><dt class="y-label mb-1">{label}</dt><dd class="whitespace-pre-line leading-relaxed">{text}</dd></div>{/if}
				{/each}
			</dl>
		{/if}
	</Panel>

	{#if m?.url}
		<Panel title="Document" sub={m.url}>
			{#if doc.status === 'idle'}
				<button class="y-btn" onclick={() => loadDoc(m.url!, null)}>Load the full document in this browser</button>
				<p class="mt-2 text-xs text-faint">Works for IPFS and hosts that allow cross-origin reads; cached for a day.</p>
			{:else if doc.status === 'loading'}
				<Skeleton rows={4} />
			{:else if doc.status === 'error'}
				<p class="text-sm text-muted">Couldn't load it here: {doc.error}. <a class="y-link" href={httpUrls(m.url)[0] ?? m.url} target="_blank" rel="noopener noreferrer nofollow">Open it directly</a>.</p>
			{:else}
				<p class="mb-3 text-xs text-muted">Fetched from <span class="font-mono">{doc.from}</span></p>
				<JsonView value={doc.json} maxHeight={480} />
			{/if}
		</Panel>
	{/if}
{/await}
