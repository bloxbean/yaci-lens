<script lang="ts">
	import { untrack } from 'svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import PrevNext from '$lib/ui/PrevNext.svelte';
	import PoolName from '$lib/names/PoolName.svelte';
	import Cost from './Cost.svelte';
	import type { Cost as CostT, DelegEvent } from './service';

	/*
	 * Stake keys that joined or left a pool (or a DRep), newest first, from the SQLite deleg index: where a joining
	 * key came from and where a leaving key went (another pool, or deregistered).
	 */
	let { pool = undefined, drep = undefined }: { pool?: string; drep?: string } = $props();

	const PAGE = 25;
	let rows = $state<DelegEvent[]>([]);
	/** starts[i] = the cursor of page i (null: the newest page); next = the cursor after the shown page. */
	let starts = $state<(string | null)[]>([null]);
	let page = $state(0);
	let next = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let cost = $state<CostT | null>(null);
	let svc: typeof import('./service') | null = null;

	async function show(i: number) {
		if (busy) return;
		busy = true;
		error = null;
		try {
			svc ??= await import('./service');
			const c = starts[i] ?? null;
			const r = pool ? await svc.getPoolEvents(pool, c, PAGE) : await svc.getDrepEvents(drep!, c, PAGE);
			rows = r.data.rows;
			next = r.data.cursor;
			if (next && starts.length === i + 1) starts = [...starts, next];
			page = i;
			cost = r.cost;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	$effect(() => {
		void (pool ?? drep);
		untrack(() => {
			starts = [null];
			show(0);
		});
	});
	const time = (slot: number) => (svc ? svc.slotTime(slot).toISOString().slice(0, 10) : '');
</script>

<Panel title="Delegators joining and leaving" sub="newest first · indexed lookup" class="mb-6" flush>
	{#snippet actions()}<Cost {cost} />{/snippet}
	{#if error}<p class="px-5 py-4 text-sm text-muted">Unavailable: {error}</p>
	{:else if !rows.length && busy}<Skeleton rows={6} />
	{:else if !rows.length}<p class="px-5 py-4 text-sm text-muted">No delegation changes in the published data.</p>
	{:else}
		<ol class="divide-y divide-line text-sm" data-testid="deleg-events">
			{#each rows as e (e.slot + e.stake + e.kind)}
				<li class="flex items-center gap-3 px-4 py-2">
					<span class="w-24 shrink-0 font-mono text-xs text-muted">{time(e.slot)}</span>
					<Badge tone={e.kind === 'join' ? 'ok' : 'warn'}>{e.kind === 'join' ? 'joined' : 'left'}</Badge>
					<span class="min-w-0 flex-1"><Hash value={e.stake} href="#/x/address/{e.stake}" head={14} tail={6} /></span>
					<span class="min-w-0 truncate text-xs text-muted">
						{#if e.kind === 'join'}{#if e.other}from {#if pool}<PoolName hash={e.other} />{:else}{e.other}{/if}{:else}new delegation{/if}
						{:else}{#if e.other}to {#if pool}<PoolName hash={e.other} />{:else}{e.other}{/if}{:else}deregistered{/if}{/if}
					</span>
				</li>
			{/each}
		</ol>
		<PrevNext {page} size={PAGE} shown={rows.length} hasNext={!!next} {busy} onprev={() => show(page - 1)} onnext={() => show(page + 1)} />
	{/if}
</Panel>
