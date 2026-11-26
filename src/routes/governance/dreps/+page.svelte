<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import Vote from '@lucide/svelte/icons/vote';
	import Scale from '@lucide/svelte/icons/scale';
	import PieChart from '@lucide/svelte/icons/chart-pie';
	import { onMount } from 'svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Stat from '$lib/ui/Stat.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import DataTable, { type Column } from '$lib/ui/DataTable.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import SqlButton from '$lib/ui/SqlButton.svelte';
	import SeriesChart from '$lib/charts/SeriesChart.svelte';
	import SplitBar from '$lib/charts/SplitBar.svelte';
	import { STATUS, short } from '$lib/charts/series';
	import { summary, summaryUrl } from '$lib/lake/lake.svelte';
	import { hashParam } from '$lib/lake/links';
	import { names } from '$lib/names/names.svelte';
	import { typeLabel } from '$lib/lake/governance';
	import { add, drepPower, emptyTally, latestVotes, proposals, roleOf, voteKey, type Tally } from '$lib/lake/votes';
	import type { DRep } from '$lib/lake/types';
	import type { DRepEpoch } from '$lib/lake/staking';
	import { adaShort } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/*
	 * DReps: how voting power is spread (and how it moved), who votes and how, by action type; then every DRep
	 * with power, participation and vote mix. Everything comes from the summary pack (dreps, drep_epochs,
	 * drep_power, votes, governance) and is analysed in the browser.
	 */
	function load() {
		return Promise.all([summary<DRep>('dreps'), summary<DRepEpoch>('drep_epochs'), drepPower(), latestVotes(), proposals()]).then(
			([dreps, epochs, power, votes, props]) => {
				// Concentration per epoch: DReps needed for half of the registered-DRep power, and the top-10 share.
				const conc = power.epochs.map((e) => {
					const vals = [...(power.byEpoch.get(e)?.values() ?? [])].sort((a, b) => b - a);
					const total = vals.reduce((a, b) => a + b, 0);
					let acc = 0;
					let n = 0;
					while (n < vals.length && acc <= total / 2) acc += vals[n++];
					return { epoch: e, half: n, top10: total ? vals.slice(0, 10).reduce((a, b) => a + b, 0) / total : 0, dreps: vals.length };
				});
				// Votes cast per epoch by role (latest vote per voter and action).
				const perEpoch = new Map<number, { DRep: number; SPO: number; CC: number }>();
				for (const v of votes) {
					const row = perEpoch.get(v.epoch) ?? perEpoch.set(v.epoch, { DRep: 0, SPO: 0, CC: 0 }).get(v.epoch)!;
					row[roleOf(v.voter_type)]++;
				}
				// How DReps vote, by action type; and per DRep: votes, mix, first epoch with power.
				const typeOf = new Map(props.map((p) => [`${p.tx_hash}#${p.idx}`, p.type]));
				const byType = new Map<string, Tally>();
				const perDrep = new Map<string, Tally & { n: number }>();
				for (const v of votes) {
					if (roleOf(v.voter_type) !== 'DRep') continue;
					const t = typeOf.get(voteKey(v)) ?? 'OTHER';
					add(byType.get(t) ?? byType.set(t, emptyTally()).get(t)!, v.vote);
					const d = perDrep.get(v.voter_hash) ?? perDrep.set(v.voter_hash, { ...emptyTally(), n: 0 }).get(v.voter_hash)!;
					add(d, v.vote);
					d.n++;
				}
				const firstEpoch = new Map<string, number>();
				for (const r of power.rows) if (!firstEpoch.has(r.drep_hash) || r.epoch < firstEpoch.get(r.drep_hash)!) firstEpoch.set(r.drep_hash, r.epoch);
				// Participation: of the actions proposed since the DRep first had power, how many it voted on.
				const proposedEpochs = props.map((p) => p.proposed_epoch);
				const eligible = (hash: string) => {
					const f = firstEpoch.get(hash);
					return f == null ? 0 : proposedEpochs.filter((e) => e >= f).length;
				};
				const lastEpoch = Math.max(...votes.map((v) => v.epoch));
				const recentVoters = new Set(votes.filter((v) => roleOf(v.voter_type) === 'DRep' && v.epoch > lastEpoch - 10).map((v) => v.voter_hash));
				return { dreps, epochs, conc, perEpoch: [...perEpoch].sort((a, b) => a[0] - b[0]), byType, perDrep, eligible, recentVoters, lastEpoch };
			}
		);
	}
	let data = $state(load());
	let filter = $state('');
	let limit = $state(100);
	onMount(() => (filter = hashParam('q') ?? ''));

	const columns: Column[] = [
		{ key: 'rank', label: '#' },
		{ key: 'drep', label: 'DRep' },
		{ key: 'status', label: 'Status', minor: true },
		{ key: 'power', label: 'Voting power', align: 'right' },
		{ key: 'share', label: 'Share', align: 'right', minor: true },
		{ key: 'part', label: 'Participation', align: 'right' },
		{ key: 'mix', label: 'Votes (yes / no / abstain)' }
	];
	const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
</script>

<svelte:head><title>DReps · Yaci Lens</title></svelte:head>

<PageHeader kind="Governance" title="DReps">
	{#snippet icon()}<Users class="h-5 w-5" />{/snippet}
	{#snippet actions()}<input class="y-input h-9 w-64" placeholder="Filter by name or DRep id" bind:value={filter} />{/snippet}
	Delegated representatives: how voting power is spread, who votes and how, and every DRep's record.
</PageHeader>

{#await data}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		{#each [1, 2, 3, 4] as i (i)}<div class="y-panel"><Skeleton rows={2} /></div>{/each}
	</section>
	<div class="y-panel"><Skeleton rows={12} /></div>
{:then d}
	{@const cur = d.epochs.at(-1)}
	{@const conc = d.conc.at(-1)}
	{@const total = d.dreps.reduce((s, x) => s + x.voting_power_ada, 0)}
	<section class="mb-6 grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
		<Stat label="DReps with voting power" value={short(cur?.dreps_with_power ?? 0)} sub={`epoch ${cur?.epoch ?? '—'}`} trend={d.epochs.slice(-40).map((e) => e.dreps_with_power)}>
			{#snippet icon()}<Users class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="Delegated to DReps" value={adaShort(cur?.drep_power_ada ?? 0)} sub={`${cur ? pct((cur.drep_power_ada ?? 0) / cur.total_power_ada) : '—'} of all vote-delegated stake`} trend={d.epochs.slice(-40).map((e) => e.drep_power_ada ?? 0)} color="rgb(var(--c-blue))">
			{#snippet icon()}<PieChart class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="DReps for 50% of power" value={conc?.half ?? '—'} sub={`top 10 hold ${conc ? pct(conc.top10) : '—'}`} trend={d.conc.slice(-40).map((c) => c.half)} color="rgb(var(--c-violet))">
			{#snippet icon()}<Scale class="h-4 w-4" />{/snippet}
		</Stat>
		<Stat label="DReps voting" value={short(d.recentVoters.size)} sub="voted in the last 10 epochs" color="rgb(var(--c-mint))">
			{#snippet icon()}<Vote class="h-4 w-4" />{/snippet}
		</Stat>
	</section>

	<section class="mb-6 grid gap-6 xl:grid-cols-2">
		<Panel title="Vote-delegated stake" sub="Per epoch: to registered DReps, Always abstain and Always no confidence">
			{#snippet actions()}<SqlButton sql={`SELECT * FROM '${summaryUrl('drep_epochs')}' ORDER BY epoch DESC`} />{/snippet}
			<SeriesChart
				x={d.epochs.map((e) => String(e.epoch))}
				xFormat={(s) => `epoch ${s}`}
				series={[
					{ name: 'Registered DReps', values: d.epochs.map((e) => e.drep_power_ada ?? 0), slot: 0 },
					{ name: 'Always abstain', values: d.epochs.map((e) => e.abstain_ada ?? 0), color: 'rgb(var(--c-faint))' },
					{ name: 'Always no confidence', values: d.epochs.map((e) => e.no_confidence_ada ?? 0), slot: 1 }
				]}
				kind="stacked"
				height={200}
				format={(v) => adaShort(v)}
				label="Vote-delegated stake per epoch"
			/>
		</Panel>
		<Panel title="How concentrated DRep power is" sub="DReps needed to reach half of the registered-DRep power, per epoch">
			{#snippet actions()}<SqlButton sql={`SELECT epoch, count(*) AS dreps, sum(power_ada) AS power_ada FROM '${summaryUrl('drep_power')}' GROUP BY 1 ORDER BY 1 DESC`} />{/snippet}
			<SeriesChart x={d.conc.map((c) => String(c.epoch))} xFormat={(s) => `epoch ${s}`} series={[{ name: 'DReps for 50%', values: d.conc.map((c) => c.half), slot: 3 }]} kind="area" height={200} label="DReps needed for half of the power" />
		</Panel>
		<Panel title="Votes cast per epoch" sub="By role; a voter's latest vote on each action">
			{#snippet actions()}<SqlButton sql={`SELECT epoch, voter_type, vote, count(*) AS votes FROM '${summaryUrl('votes')}' GROUP BY ALL ORDER BY 1 DESC`} />{/snippet}
			<SeriesChart
				x={d.perEpoch.map(([e]) => String(e))}
				xFormat={(s) => `epoch ${s}`}
				series={[
					{ name: 'DReps', values: d.perEpoch.map(([, v]) => v.DRep), slot: 0 },
					{ name: 'SPOs', values: d.perEpoch.map(([, v]) => v.SPO), slot: 5 },
					{ name: 'Constitutional committee', values: d.perEpoch.map(([, v]) => v.CC), slot: 3 }
				]}
				kind="stacked"
				height={200}
				label="Votes per epoch by role"
			/>
		</Panel>
		<Panel title="How DReps vote, by action type" sub="Latest DRep votes, counted by voter">
			<div class="flex flex-col gap-4">
				{#each [...d.byType].sort((a, b) => b[1].yes + b[1].no + b[1].abstain - (a[1].yes + a[1].no + a[1].abstain)) as [type, t] (type)}
					<div>
						<div class="mb-1.5 flex items-baseline justify-between text-sm"><span class="font-medium">{typeLabel(type)}</span><span class="text-xs text-muted tabular-nums">{short(t.yes + t.no + t.abstain)} votes</span></div>
						<SplitBar parts={[{ label: 'Yes', value: t.yes, color: STATUS.yes }, { label: 'No', value: t.no, color: STATUS.no }, { label: 'Abstain', value: t.abstain, color: STATUS.abstain }]} />
					</div>
				{/each}
			</div>
		</Panel>
	</section>

	{@const ranked = d.dreps.map((x, i) => ({ ...x, rank: i + 1, id: x.drep_id ?? x.drep_type }))}
	{@const f = filter.trim().toLowerCase()}
	{@const rows = f ? ranked.filter((x) => x.id.toLowerCase().includes(f) || x.drep_hash.includes(f) || (names.drep(x.drep_hash) ?? '').toLowerCase().includes(f)) : ranked}
	<Panel flush title="All DReps" sub={`Distribution of epoch ${d.dreps[0]?.epoch ?? '—'} · participation = actions voted on, of those proposed since the DRep first had power`}>
		<DataTable rows={rows.slice(0, limit)} {columns} key={(x) => x.drep_hash + x.drep_type} dense>
			{#snippet cell(x, k)}
				{@const t = d.perDrep.get(x.drep_hash)}
				{@const el = x.drep_id ? d.eligible(x.drep_hash) : 0}
				{#if k === 'rank'}<span class="text-faint tabular-nums">{x.rank}</span>
				{:else if k === 'drep'}{#if x.drep_id}<a class="y-link {names.drep(x.drep_hash) ? '' : 'font-mono text-xs'}" href="#/governance/dreps/{x.drep_id}" title={x.id}>{names.drep(x.drep_hash) ?? shorten(x.drep_id, 14, 8)}</a>{:else}<span class="text-xs font-medium">{x.drep_type === 'ABSTAIN' ? 'Always abstain' : x.drep_type === 'NO_CONFIDENCE' ? 'Always no confidence' : x.drep_type}</span>{/if}
				{:else if k === 'status'}{#if x.status}<Badge tone={x.status === 'ACTIVE' || x.status === 'REGISTERED' ? 'ok' : 'neutral'}>{x.status}</Badge>{/if}
				{:else if k === 'power'}<span class="font-semibold tabular-nums">{adaShort(x.voting_power_ada)}</span>
				{:else if k === 'share'}<span class="tabular-nums">{((x.voting_power_ada / total) * 100).toFixed(2)}%</span>
				{:else if k === 'part'}{#if x.drep_id && el}<span class="tabular-nums" title="{t?.n ?? 0} of {el} actions">{pct(Math.min(1, (t?.n ?? 0) / el))}</span>{:else}<span class="text-faint">—</span>{/if}
				{:else if k === 'mix'}
					{#if t}
						<div class="flex w-44 items-center gap-2">
							<div class="flex-1"><SplitBar legend={false} height={6} parts={[{ label: 'Yes', value: t.yes, color: STATUS.yes }, { label: 'No', value: t.no, color: STATUS.no }, { label: 'Abstain', value: t.abstain, color: STATUS.abstain }]} /></div>
							<span class="text-[11px] tabular-nums text-muted">{t.yes}/{t.no}/{t.abstain}</span>
						</div>
					{:else}<span class="text-xs text-faint">no votes</span>{/if}
				{/if}
			{/snippet}
		</DataTable>
		<div class="flex items-center justify-between border-t border-line/70 px-5 py-3 text-xs text-muted">
			<span>{rows.length.toLocaleString('en-US')} entries</span>
			{#if rows.length > limit}<button class="y-btn h-8 text-xs" onclick={() => (limit += 200)}>Show more</button>{/if}
		</div>
	</Panel>
{:catch e}
	<ErrorBox title="Couldn't load DReps" message={String(e?.message ?? e)} retry={() => (data = load())} />
{/await}
