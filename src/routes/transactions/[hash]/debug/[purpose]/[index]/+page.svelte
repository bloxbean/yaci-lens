<script lang="ts">
	import Bug from '@lucide/svelte/icons/bug';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Hash from '$lib/ui/Hash.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Debugger from '$lib/julc/debug/Debugger.svelte';
	import { plutusVersion, purposeOf } from '$lib/julc/replay/build';
	import { loadLakeTx } from '$lib/lake/replay';
	import { hashParam } from '$lib/lake/links';
	import { shorten } from '$lib/format';

	/*
	 * Re-run one script of a historical transaction in the julc debugger, with the transaction's real inputs, datums
	 * and redeemers from the lake (Yaci Viewer's replay pipeline, fed by lake/replay.ts).
	 */
	const PURPOSES = ['spend', 'mint', 'cert', 'reward', 'vote', 'propose'];
	const hash = $derived((page.params.hash ?? '').toLowerCase());
	const purpose = $derived((page.params.purpose ?? '').toLowerCase());
	const index = $derived(Number((page.params.index ?? '').split('?')[0]));
	const valid = $derived(/^[0-9a-f]{64}$/.test(hash) && PURPOSES.includes(purpose) && Number.isInteger(index));

	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return valid ? loadLakeTx(hash, hashParam('date')) : null;
	});

	function scriptOf(scripts: { script_hash: string; type?: string | null; redeemer?: unknown }[]) {
		return scripts.find((s) => {
			const r = s.redeemer as { tag?: string; index?: number } | null;
			return r && purposeOf(r.tag) === purpose && Number(r.index ?? 0) === index;
		});
	}
</script>

<svelte:head><title>Debug {purpose} #{index} · Tx {shorten(hash, 8, 6)} · Yaci Lens</title></svelte:head>

{#if !valid}
	<div class="y-panel p-6 text-sm text-muted">Use #/transactions/&lt;hash&gt;/debug/&lt;{PURPOSES.join('|')}&gt;/&lt;index&gt;.</div>
{:else if data}
	{#await data}
		<PageHeader kind="Script debugger" title="{purpose} #{index}">
			{#snippet icon()}<Bug class="h-5 w-5" />{/snippet}
			Loading the transaction, its inputs and datums from the lake…
		</PageHeader>
		<div class="y-panel"><Skeleton rows={8} /></div>
	{:then t}
		{@const script = scriptOf(t.page.scripts)}
		<a href="#/transactions/{hash}?date={t.date}" class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft class="h-4 w-4" />Transaction {shorten(hash, 10, 8)}</a>
		<PageHeader kind="Script debugger" title="{purpose} #{index}">
			{#snippet icon()}<Bug class="h-5 w-5" />{/snippet}
			{#if script}<div class="flex flex-wrap items-center gap-2 text-sm text-muted">Script <Hash value={script.script_hash} head={10} tail={8} /></div>{/if}
			{#snippet actions()}
				{#if script?.type && plutusVersion(script.type)}<Badge tone="violet">Plutus {plutusVersion(script.type)}</Badge>{/if}
				{#if t.invalid}<Badge tone="bad">Failed on chain</Badge>{/if}
				<Badge tone="neutral">block #{t.block} · {t.date}</Badge>
			{/snippet}
		</PageHeader>
		{#if t.missingInputs.length}
			<div class="mb-5 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber" />
				<span>{t.missingInputs.length} input(s) couldn't be resolved from the lake ({t.missingInputs.map((r) => shorten(r, 8, 6)).join(', ')}); the rebuilt context may differ from the one the ledger saw.</span>
			</div>
		{/if}
		{#key `${hash}/${purpose}/${index}`}
			<Debugger page={t.page} {purpose} {index} />
		{/key}
	{:catch e}
		<div class="y-panel"><ErrorBox title="Couldn't load the transaction" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
	{/await}
{/if}
