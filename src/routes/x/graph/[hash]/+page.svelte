<script lang="ts">
	import Share2 from '@lucide/svelte/icons/share-2';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import type { Cost as CostT, Edge, TxInfo, TxLinks } from '$lib/indexdb/service';
	import { ada } from '$lib/format';
	import { int } from '$lib/cardano';

	/*
	 * EXPERIMENTAL transaction graph from the SQLite utxo index: a transaction's inputs come from the transactions
	 * whose outputs it spent (left), its outputs go to the transactions that spent them (right). Click a node to
	 * expand it. Traversal is bounded: at most PER_SIDE links per expansion (more on request) and MAX_NODES nodes.
	 * Collateral spends of failed transactions are dashed; unspent outputs are counted on the node.
	 */
	const PER_SIDE = 12;
	const MAX_NODES = 150;
	const W = 230;
	const H = 54;
	const GAP_X = 120;
	const GAP_Y = 18;

	const root = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());

	interface Node {
		hash: string;
		gen: number;
		row: number;
		tx: TxInfo | null;
		links: TxLinks | null;
		/** How many parents / children are shown. */
		shownP: number;
		shownC: number;
		loading: boolean;
	}
	interface GEdge extends Edge {
		key: string;
	}

	let nodes = $state<Map<string, Node>>(new Map());
	let edges = $state<Map<string, GEdge>>(new Map());
	let selected = $state<string | null>(null);
	let cost = $state<CostT | null>(null);
	let total = $state<CostT>({ requests: 0, bytes: 0, ms: 0, queries: 0 });
	let error = $state<string | null>(null);
	let svc: typeof import('$lib/indexdb/service') | null = null;

	const rowsIn = (gen: number) => [...nodes.values()].filter((n) => n.gen === gen).length;

	function place(hash: string, gen: number): Node | null {
		const have = nodes.get(hash);
		if (have) return have;
		if (nodes.size >= MAX_NODES) return null;
		const n: Node = { hash, gen, row: rowsIn(gen), tx: null, links: null, shownP: 0, shownC: 0, loading: false };
		nodes.set(hash, n);
		nodes = new Map(nodes);
		return n;
	}

	/** Nodes are replaced, not mutated: a Map in $state is not deeply reactive. */
	function setNode(hash: string, patch: Partial<Node>) {
		const n = nodes.get(hash);
		if (!n) return;
		nodes.set(hash, { ...n, ...patch });
		nodes = new Map(nodes);
	}

	function addEdge(e: Edge) {
		const key = `${e.outTx}#${e.outIdx}>${e.byTx}`;
		if (!edges.has(key)) {
			edges.set(key, { ...e, key });
			edges = new Map(edges);
		}
	}

	async function load(hash: string) {
		const n = nodes.get(hash);
		if (!n || n.links || n.loading) return;
		setNode(hash, { loading: true });
		try {
			svc ??= await import('$lib/indexdb/service');
			const r = await svc.txLinks(hash);
			cost = r.cost;
			total = { requests: total.requests + r.cost.requests, bytes: total.bytes + r.cost.bytes, ms: total.ms + r.cost.ms, queries: total.queries + r.cost.queries };
			setNode(hash, { links: r.data, tx: r.data.tx, loading: false });
			expand(hash, 'both');
		} catch (e) {
			setNode(hash, { loading: false });
			error = e instanceof Error ? e.message : String(e);
		}
	}

	/** Show the next PER_SIDE parents and/or children of a loaded node. */
	function expand(hash: string, side: 'parents' | 'children' | 'both') {
		const n = nodes.get(hash);
		if (!n?.links) return;
		let { shownP, shownC } = n;
		if (side !== 'children') {
			// group the inputs by the transaction that made them: one node per parent tx
			const byTx = groupBy(n.links.parents, (e) => e.outTx);
			const next = byTx.slice(shownP, shownP + PER_SIDE);
			for (const [tx, es] of next) if (place(tx, n.gen - 1)) es.forEach(addEdge);
			shownP += next.length;
		}
		if (side !== 'parents') {
			const byTx = groupBy(n.links.children, (e) => e.byTx);
			const next = byTx.slice(shownC, shownC + PER_SIDE);
			for (const [tx, es] of next) if (place(tx, n.gen + 1)) es.forEach(addEdge);
			shownC += next.length;
		}
		setNode(hash, { shownP, shownC });
	}

	function groupBy(es: Edge[], key: (e: Edge) => string): [string, Edge[]][] {
		const m = new Map<string, Edge[]>();
		for (const e of es) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
		return [...m.entries()];
	}

	function reset(hash: string) {
		nodes = new Map();
		edges = new Map();
		total = { requests: 0, bytes: 0, ms: 0, queries: 0 };
		error = null;
		selected = hash;
		place(hash, 0);
		void load(hash);
	}

	$effect(() => {
		const h = root;
		if (/^[0-9a-f]{64}$/.test(h)) untrack(() => reset(h));
	});

	function click(hash: string) {
		selected = hash;
		void load(hash);
	}

	// layout
	const gens = $derived([...new Set([...nodes.values()].map((n) => n.gen))].sort((a, b) => a - b));
	const minGen = $derived(gens[0] ?? 0);
	const maxRows = $derived(Math.max(1, ...gens.map((g) => rowsIn(g))));
	const width = $derived((gens.length || 1) * (W + GAP_X));
	const height = $derived(maxRows * (H + GAP_Y) + 20);
	const pos = (n: Node) => {
		const rows = rowsIn(n.gen);
		const offset = ((maxRows - rows) * (H + GAP_Y)) / 2;
		return { x: (n.gen - minGen) * (W + GAP_X) + 10, y: n.row * (H + GAP_Y) + offset + 10 };
	};
	const sel = $derived(selected ? nodes.get(selected) : null);
	const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;
	const time = (slot: number | undefined) => (slot == null ? '' : svc ? svc.slotTime(slot).toISOString().slice(0, 16).replace('T', ' ') : '');
	const moved = (n: Node) => (n.links ? n.links.parents.reduce((s, e) => s + (e.lovelace ?? 0), 0) : null);
</script>

<svelte:head><title>Transaction graph · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental · indexed" title="Transaction graph">
	{#snippet icon()}<Share2 class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<a class="y-btn h-9" href="#/transactions/{root}">Open transaction</a>
	{/snippet}
</PageHeader>

<Gate>
	{#if !/^[0-9a-f]{64}$/.test(root)}
		<div class="y-panel p-6 text-sm text-muted">Not a transaction hash.</div>
	{:else}
		{#if error}<ErrorBox message={error} retry={() => reset(root)} />{/if}
		<div class="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
			<span>Click a transaction to load what it spent (left) and what spent its outputs (right). At most {PER_SIDE} per side at a time, {MAX_NODES} nodes.</span>
			<span class="ml-auto flex items-center gap-2">last <Cost {cost} /> · total <Cost cost={total} /></span>
		</div>
		<div class="y-panel mb-6 overflow-auto" style="max-height: 70vh" data-testid="graph">
			<svg {width} {height} class="block" role="img" aria-label="Transaction graph">
				<defs>
					<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" class="fill-faint" /></marker>
				</defs>
				{#each [...edges.values()] as e (e.key)}
					{@const a = nodes.get(e.outTx)}
					{@const b = nodes.get(e.byTx)}
					{#if a && b}
						{@const pa = pos(a)}
						{@const pb = pos(b)}
						{@const x1 = pa.x + W}
						{@const y1 = pa.y + H / 2}
						{@const x2 = pb.x}
						{@const y2 = pb.y + H / 2}
						<path d="M{x1},{y1} C{x1 + GAP_X / 2},{y1} {x2 - GAP_X / 2},{y2} {x2},{y2}" fill="none" class={e.collateral ? 'stroke-amber' : 'stroke-faint/60'} stroke-width="1.4" stroke-dasharray={e.collateral ? '4 3' : undefined} marker-end="url(#arrow)" />
						<text x={x1 + (x2 - x1) * 0.72} y={y1 + (y2 - y1) * 0.86 - 4} text-anchor="middle" class="fill-muted font-mono" font-size="10">#{e.outIdx} {e.lovelace != null ? ada(e.lovelace) : ''}</text>
					{/if}
				{/each}
				{#each [...nodes.values()] as n (n.hash)}
					{@const p = pos(n)}
					<g class="cursor-pointer" role="button" tabindex="0" onclick={() => click(n.hash)} onkeydown={(ev) => ev.key === 'Enter' && click(n.hash)} data-testid="node" data-hash={n.hash}>
						<rect x={p.x} y={p.y} width={W} height={H} rx="10" class="{n.hash === root ? 'fill-brand/15 stroke-brand' : n.hash === selected ? 'fill-surface-2 stroke-cyan' : 'fill-surface stroke-line'} {n.tx?.invalid ? 'stroke-danger' : ''}" stroke-width="1.4" />
						<text x={p.x + 10} y={p.y + 19} class="fill-ink font-mono" font-size="12">{short(n.hash)}</text>
						<text x={p.x + 10} y={p.y + 37} class="fill-muted" font-size="10.5">
							{#if n.loading}loading…{:else if n.tx}{time(n.tx.slot)}{#if n.links} · {n.links.parents.length} in · {n.links.children.length} spent · {n.links.unspent.length} unspent{/if}{:else}not loaded{/if}
						</text>
						{#if n.tx?.invalid}<text x={p.x + W - 10} y={p.y + 19} text-anchor="end" class="fill-danger" font-size="10">failed</text>{/if}
					</g>
				{/each}
			</svg>
		</div>

		{#if sel}
			<Panel title="Selected transaction" sub={sel.hash} class="mb-6">
				{#snippet actions()}
					<a class="y-btn h-8 text-xs" href="#/transactions/{sel.hash}">Details</a>
					<a class="y-btn h-8 text-xs" href="#/x/graph/{sel.hash}">Center here</a>
				{/snippet}
				{#if !sel.links}
					<div class="text-sm text-muted">{sel.loading ? 'Loading…' : 'Click the node to load it.'}</div>
				{:else}
					<dl class="grid gap-x-10 gap-y-3 text-sm md:grid-cols-3" data-testid="selected">
						<div><dt class="y-label">Slot</dt><dd>{sel.tx ? int(sel.tx.slot) : '—'} {sel.tx ? `(${time(sel.tx.slot)} UTC)` : ''}</dd></div>
						<div><dt class="y-label">Block · index</dt><dd>{sel.tx?.block != null ? int(sel.tx.block) : '—'} · {sel.tx?.idx ?? '—'}</dd></div>
						<div><dt class="y-label">Fee</dt><dd>{sel.tx?.fee != null ? `${ada(sel.tx.fee)} ADA` : '—'}</dd></div>
						<div><dt class="y-label">Spent (inputs)</dt><dd>{sel.links.parents.length} outputs · {ada(moved(sel) ?? 0)} ADA</dd></div>
						<div><dt class="y-label">Outputs</dt><dd>{sel.tx?.outs ?? '—'} · {sel.links.children.length} spent · {sel.links.unspent.length} unspent at the tip</dd></div>
						<div><dt class="y-label">Status</dt><dd>{#if sel.tx?.invalid}<Badge tone="bad">failed (collateral taken)</Badge>{:else}<Badge tone="ok">valid</Badge>{/if}{#if sel.links.ambiguous} <Badge tone="warn">hash prefix collision</Badge>{/if}</dd></div>
					</dl>
					<div class="mt-4 flex flex-wrap gap-2">
						{#if sel.links && sel.shownP < new Set(sel.links.parents.map((e) => e.outTx)).size}
							<button class="y-btn h-8 text-xs" onclick={() => expand(sel.hash, 'parents')}>More inputs</button>
						{/if}
						{#if sel.links && sel.shownC < new Set(sel.links.children.map((e) => e.byTx)).size}
							<button class="y-btn h-8 text-xs" onclick={() => expand(sel.hash, 'children')}>More spenders</button>
						{/if}
					</div>
					{#if sel.links.unspent.length}
						<p class="mt-3 text-xs text-muted">Unspent outputs: {sel.links.unspent.slice(0, 40).map((i) => `#${i}`).join(' ')}{sel.links.unspent.length > 40 ? ' …' : ''}</p>
					{/if}
				{/if}
			</Panel>
		{/if}
		<p class="text-xs text-faint">
			The graph shows explicit on-chain links (an output and the transaction that spent it). It does not say who owns what: transactions
			often combine inputs from different parties.
		</p>
	{/if}
</Gate>

