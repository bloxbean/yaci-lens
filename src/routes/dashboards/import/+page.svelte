<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { hashParam } from '$lib/lake/links';
	import { dashboards, fromShareParam } from '$lib/dashboards/store.svelte';

	/*
	 * A share link: the dashboard definition travels in the URL (#/dashboards/import?d=…). It is shown for review,
	 * since its queries come from whoever sent the link, and saved to this browser only when the user says so.
	 */
	dashboards.load();
	const incoming = fromShareParam(hashParam('d') ?? '');

	async function add(p: Awaited<typeof incoming>) {
		if (!p) return;
		await dashboards.save(p);
		goto(`#/dashboards/${p.id}`, { replaceState: true });
	}
</script>

<svelte:head><title>Shared dashboard · Yaci Lens</title></svelte:head>

<PageHeader kind="Dashboard lab" title="Shared dashboard">
	{#snippet icon()}<LayoutGrid class="h-5 w-5" />{/snippet}
	Someone shared a dashboard with you. Its definition came in the link itself; nothing was downloaded from a server.
</PageHeader>

{#await incoming}
	<div class="y-panel"><Skeleton rows={4} /></div>
{:then p}
	{#if !p}
		<div class="y-panel p-6 text-sm text-muted">This link doesn't contain a valid dashboard (it may be cut short). <a class="y-link" href="#/dashboards">Dashboard lab</a></div>
	{:else}
		<section class="y-panel p-5">
			<h2 class="font-display text-lg font-semibold">{p.name}</h2>
			{#if p.description}<p class="mt-1 text-sm text-muted">{p.description}</p>{/if}
			<p class="mt-4 text-sm">{p.widgets.length} widget{p.widgets.length === 1 ? '' : 's'}:</p>
			<ul class="mt-2 flex flex-col gap-2">
				{#each p.widgets as w (w.id)}
					<li class="rounded-xl border border-line p-3">
						<div class="text-sm font-medium">{w.title} <span class="text-xs text-faint">· {w.viz.type}</span></div>
						<pre class="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed text-muted">{w.sql}</pre>
					</li>
				{/each}
			</ul>
			<div class="mt-4 flex items-start gap-2 text-xs text-muted">
				<TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
				Queries run only in your browser, read-only, against the published data. A careless query can still take long or use a lot of memory; review them first.
			</div>
			<div class="mt-5 flex gap-2">
				<button class="y-btn y-btn-primary h-9" onclick={() => add(p)}>Add to my dashboards</button>
				<a class="y-btn h-9" href="#/dashboards">Cancel</a>
			</div>
		</section>
	{/if}
{/await}
