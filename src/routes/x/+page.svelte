<script lang="ts">
	import Zap from '@lucide/svelte/icons/zap';
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import { INDEX_URL, indexEnabled, setIndexEnabled } from '$lib/indexdb/config';
	import { lake } from '$lib/lake/lake.svelte';
	import { int } from '$lib/cardano';
	import { compact } from '$lib/format';

	/*
	 * EXPERIMENTAL: indexed lookups with SQLite-WASM. This page turns the experiment on or off, shows what is
	 * published (manifest), checks that the indexes and the lake describe the same chain point, and is the entry to
	 * the indexed pages: transaction graph, address / stake activity, script state, asset holders, search.
	 */
	let enabled = $state(indexEnabled());
	const svc = $derived(enabled ? import('$lib/indexdb/service') : null);
	const info = $derived(
		svc?.then(async (s) => {
			const m = await s.manifest();
			const init = await s.sqlite.init();
			return { m, init };
		})
	);

	// the lake's tip (summary pack), to check that the indexes describe the same chain point
	$effect(() => {
		if (enabled) lake.ready().catch(() => undefined);
	});

	function toggle() {
		setIndexEnabled(!enabled);
		location.reload();
	}

	let q = $state('');
	let hits = $state<Promise<import('$lib/indexdb/service').Measured<import('$lib/indexdb/service').SearchHit[]>> | null>(null);
	let spent = $state<Promise<import('$lib/indexdb/service').Measured<{ spent: boolean; edge: import('$lib/indexdb/service').Edge | null; known: boolean }>> | null>(null);

	async function go(e: SubmitEvent) {
		e.preventDefault();
		const s = q.trim();
		if (!s || !svc) return;
		hits = null;
		spent = null;
		const mod = await svc;
		if (/^[0-9a-f]{64}[#:]\d+$/i.test(s)) spent = mod.findSpendingTransaction(s);
		else if (/^[0-9a-f]{64}$/i.test(s)) goto(`#/x/graph/${s.toLowerCase()}`);
		else if (/^(addr|stake)(_test)?1[0-9a-z]+$/i.test(s) || /^(Ae2|DdzFF)[1-9A-HJ-NP-Za-km-z]+$/.test(s)) goto(`#/x/address/${s}`);
		else if (/^[0-9a-f]{56}$/i.test(s)) goto(`#/x/script/${s.toLowerCase()}`);
		else if (/^[0-9a-f]{58,120}$/i.test(s)) goto(`#/x/holders/${s.toLowerCase()}`);
		else hits = mod.search(s);
	}

	const kindHref: Record<string, (k: string) => string> = {
		pool: (k) => `#/pools/${k}`,
		drep: (k) => `#/governance/dreps/${k}`,
		proposal: (k) => `#/governance/actions/${k.replace('#', '/')}`,
		script: (k) => `#/x/script/${k}`,
		token: (k) => `#/x/holders/${k}`
	};
	const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`);
</script>

<svelte:head><title>Indexed lookups · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental" title="Indexed lookups">
	{#snippet icon()}<Zap class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		{#if INDEX_URL}
			<button class="y-btn h-9" onclick={toggle} data-testid="toggle">{enabled ? 'Turn off' : 'Turn on'}</button>
		{/if}
	{/snippet}
</PageHeader>

{#if !INDEX_URL}
	<div class="y-panel p-6 text-sm text-muted">
		This build has no index location. Build with <code class="font-mono">VITE_LENS_INDEX_URL=https://…/indexes/</code> to try indexed
		lookups (SQLite-WASM over HTTP range requests).
	</div>
{:else if !enabled}
	<div class="y-panel p-6 text-sm text-muted" data-testid="off">
		Indexed lookups use SQLite-WASM to read small SQLite index files published next to the lake ({INDEX_URL}), with HTTP range
		requests. They add a transaction graph, address and stake activity, script state, asset holders and a name search. You turned
		them off in this browser; turn them on again to use them.
	</div>
{:else}
	<Panel title="Look up" class="mb-6">
		<form class="flex items-center gap-3" onsubmit={go}>
			<div class="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-sm focus-within:border-brand/50">
				<Search class="h-4 w-4 shrink-0 text-faint" />
				<input bind:value={q} class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" placeholder="Tx hash, tx#index, addr1…, stake1…, script hash, asset unit, or a name" data-testid="lookup" />
			</div>
			<button class="y-btn h-10" type="submit">Go</button>
		</form>
		{#if spent}
			<div class="mt-4 text-sm" data-testid="spent">
				{#await spent}<Skeleton rows={1} />{:then r}
					{#if !r.data.known}Not a known output in the published data.
					{:else if r.data.spent && r.data.edge}
						Spent {r.data.edge.collateral ? 'as collateral ' : ''}by <Hash value={r.data.edge.byTx} href="#/transactions/{r.data.edge.byTx}" /> at slot {int(r.data.edge.slot)}
					{:else}Unspent at the published tip.{/if}
					<Cost cost={r.cost} />
				{:catch e}<ErrorBox message={e instanceof Error ? e.message : String(e)} />{/await}
			</div>
		{/if}
		{#if hits}
			<div class="mt-4" data-testid="hits">
				{#await hits}<Skeleton rows={4} />{:then r}
					<div class="mb-2 flex items-center justify-between text-xs text-muted"><span>{r.data.length} results</span><Cost cost={r.cost} /></div>
					<ul class="divide-y divide-line">
						{#each r.data as h (h.kind + h.key)}
							<li class="flex items-baseline gap-3 py-2 text-sm">
								<Badge>{h.kind}</Badge>
								<a class="y-link min-w-0 truncate" href={kindHref[h.kind]?.(h.key) ?? '#/x'}>{h.title}</a>
								<span class="min-w-0 truncate text-xs text-faint">{h.body}</span>
							</li>
						{/each}
					</ul>
				{:catch e}<ErrorBox message={e instanceof Error ? e.message : String(e)} />{/await}
			</div>
		{/if}
	</Panel>

	{#await info}
		<div class="y-panel"><Skeleton rows={6} /></div>
	{:then i}
		{#if i}
			{@const sameTip = lake.tip ? lake.tip.block === i.m.tip.block : null}
			<Panel title="Published indexes" sub="manifest.json · snapshot {i.m.snapshot}" class="mb-6">
				<div class="mb-4 flex flex-wrap items-center gap-3 text-sm" data-testid="consistency">
					<span>Tip block <b>{int(i.m.tip.block)}</b> ({i.m.tip.date}), built {i.m.generated_at.slice(0, 16).replace('T', ' ')} UTC</span>
					{#if sameTip === true}<Badge tone="ok">same chain point as the lake</Badge>
					{:else if sameTip === false}<Badge tone="warn">the lake is at block {int(lake.tip?.block)}: index results may differ by a day</Badge>
					{:else}<Badge>checking the lake…</Badge>{/if}
					<span class="text-xs text-faint">SQLite {i.init.version} · WASM start {i.init.initMs} ms</span>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-sm" data-testid="files">
						<thead class="text-left text-xs text-faint"><tr><th class="py-1.5">Index</th><th>Part</th><th>Covers</th><th class="text-right">Rows</th><th class="text-right">Size</th></tr></thead>
						<tbody class="divide-y divide-line">
							{#each Object.entries(i.m.dbs) as [name, d] (name)}
								{#each d.files as f (f.file)}
									<tr>
										<td class="py-1.5" title={d.description}><b>{name}</b></td>
										<td>{f.part}</td>
										<td class="text-xs text-muted">{f.to_date ? `to ${f.to_date}` : f.from_date ? `from ${f.from_date}` : 'tip'}</td>
										<td class="text-right font-mono text-xs">{Object.entries(f.rows).map(([t, n]) => `${t} ${compact(n ?? 0)}`).join(' · ')}</td>
										<td class="text-right font-mono text-xs">{mb(f.bytes)}</td>
									</tr>
								{/each}
							{/each}
						</tbody>
					</table>
				</div>
			</Panel>
		{/if}
	{:catch e}
		<ErrorBox message={e instanceof Error ? e.message : String(e)} />
	{/await}
{/if}
