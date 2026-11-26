<script lang="ts">
	import GitFork from '@lucide/svelte/icons/git-fork';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import ForkLab from '$lib/julc/fork/ForkLab.svelte';
	import { loadLakeTx } from '$lib/lake/replay';
	import { hashParam } from '$lib/lake/links';
	import { shorten } from '$lib/format';

	/*
	 * The what-if lab for a historical transaction (Yaci Viewer's fork lab on lake data): every script starts from
	 * the transaction's real inputs, datums, redeemers and signers, so it runs as on chain; edit any of them and
	 * every script runs again. Nothing is submitted.
	 */
	const hash = $derived((page.params.hash ?? '').split('?')[0].toLowerCase());
	let attempt = $state(0);
	const data = $derived.by(() => {
		attempt;
		return /^[0-9a-f]{64}$/.test(hash) ? loadLakeTx(hash, hashParam('date')) : null;
	});
</script>

<svelte:head><title>Fork Tx {shorten(hash, 8, 6)} · Yaci Lens</title></svelte:head>

{#if data}
	{#await data}
		<PageHeader kind="What-if lab" title="Fork this transaction">
			{#snippet icon()}<GitFork class="h-5 w-5" />{/snippet}
			Loading the transaction, its inputs and datums from the lake…
		</PageHeader>
		<div class="y-panel"><Skeleton rows={10} /></div>
	{:then t}
		<a href="#/transactions/{hash}?date={t.date}&tab=scripts" class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft class="h-4 w-4" />Transaction {shorten(hash, 10, 8)}</a>
		<PageHeader kind="What-if lab" title="Fork this transaction">
			{#snippet icon()}<GitFork class="h-5 w-5" />{/snippet}
			<p class="max-w-2xl text-sm text-muted">
				Every script starts with this transaction's real context. Change redeemers, datums, signers, the validity range, outputs or mint, and every
				script runs again as you type. Nothing is submitted: the fork exists only in your browser.
			</p>
			{#snippet actions()}
				{#if t.invalid}<Badge tone="bad">Failed on chain</Badge>{/if}
				<Badge tone="neutral">block #{t.block} · {t.date}</Badge>
			{/snippet}
		</PageHeader>
		{#if t.missingInputs.length}
			<div class="mb-5 flex items-start gap-2.5 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-amber" />
				<span>{t.missingInputs.length} input(s) couldn't be resolved from the lake; the rebuilt context may differ from the one the ledger saw.</span>
			</div>
		{/if}
		{#key hash}
			<ForkLab page={t.page} />
		{/key}
	{:catch e}
		<div class="y-panel"><ErrorBox title="Couldn't load the transaction" message={String(e?.message ?? e)} retry={() => attempt++} /></div>
	{/await}
{:else}
	<div class="y-panel p-6 text-sm text-muted">Use #/transactions/&lt;hash&gt;/fork.</div>
{/if}
