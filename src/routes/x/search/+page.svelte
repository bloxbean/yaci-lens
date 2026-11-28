<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import ErrorBox from '$lib/ui/ErrorBox.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import Cost from '$lib/indexdb/Cost.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import type { SearchHit } from '$lib/indexdb/service';

	/*
	 * EXPERIMENTAL name search over the SQLite search index (FTS5): pools, DReps, governance proposals, dApps and
	 * tokens, by any word or word prefix. The top search box comes here for free text when the indexes are published;
	 * token search in Assets stays available.
	 */
	const q = $derived(new URLSearchParams(page.url.hash.split('?')[1] ?? '').get('q') ?? '');
	let text = $state('');
	$effect(() => {
		text = q;
	});

	const data = $derived(q.trim() ? import('$lib/indexdb/service').then((s) => s.search(q, 60)) : null);

	const KINDS: { kind: SearchHit['kind']; label: string; tone: 'brand' | 'violet' | 'cyan' | 'ok' | 'warn' }[] = [
		{ kind: 'token', label: 'Tokens', tone: 'brand' },
		{ kind: 'pool', label: 'Stake pools', tone: 'cyan' },
		{ kind: 'drep', label: 'DReps', tone: 'violet' },
		{ kind: 'proposal', label: 'Governance proposals', tone: 'warn' },
		{ kind: 'script', label: 'dApps and scripts', tone: 'ok' }
	];
	const href: Record<SearchHit['kind'], (k: string) => string> = {
		pool: (k) => `#/pools/${k}`,
		drep: (k) => `#/governance/dreps/${k}`,
		proposal: (k) => `#/governance/actions/${k.replace('#', '/')}`,
		script: (k) => `#/scripts/${k}`,
		token: (k) => `#/assets/unit/${k}`
	};

	function go(e: SubmitEvent) {
		e.preventDefault();
		if (text.trim()) goto(`#/x/search?q=${encodeURIComponent(text.trim())}`);
	}
</script>

<svelte:head><title>Search {q} · Yaci Lens</title></svelte:head>

<PageHeader kind="Indexed search" title={q ? `“${q}”` : 'Search names'}>
	{#snippet icon()}<Search class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		{#if q}<a class="y-btn h-9" href="#/assets?q={encodeURIComponent(q)}">Token search in Assets</a>{/if}
	{/snippet}
</PageHeader>

<Gate>
	<form class="mb-6 flex items-center gap-3" onsubmit={go}>
		<div class="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-sm focus-within:border-brand/50">
			<Search class="h-4 w-4 shrink-0 text-faint" />
			<input bind:value={text} class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" placeholder="Pool, DRep, proposal, dApp or token name" data-testid="search-input" />
		</div>
		<button class="y-btn h-10" type="submit">Search</button>
	</form>

	{#if data}
		{#await data}
			<div class="y-panel"><Skeleton rows={8} /></div>
		{:then r}
			<div class="mb-3 flex items-center justify-between text-xs text-muted"><span>{r.data.length} results</span><Cost cost={r.cost} /></div>
			{#if !r.data.length}
				<div class="y-panel p-6 text-sm text-muted">No names match. Try fewer words, or <a class="y-link" href="#/assets?q={encodeURIComponent(q)}">search tokens in Assets</a>.</div>
			{:else}
				<div class="grid gap-6 lg:grid-cols-2" data-testid="search-results">
					{#each KINDS as k (k.kind)}
						{@const hits = r.data.filter((h) => h.kind === k.kind)}
						{#if hits.length}
							<Panel title={k.label} sub="{hits.length} match{hits.length === 1 ? '' : 'es'}" flush>
								<ul class="divide-y divide-line text-sm">
									{#each hits as h (h.key)}
										<li class="flex items-baseline gap-3 px-4 py-2">
											<Badge tone={k.tone}>{k.kind}</Badge>
											<a class="y-link min-w-0 truncate font-medium" href={href[h.kind](h.key)}>{h.title}</a>
											<span class="min-w-0 truncate text-xs text-faint">{h.body}</span>
										</li>
									{/each}
								</ul>
							</Panel>
						{/if}
					{/each}
				</div>
			{/if}
		{:catch e}
			<ErrorBox message={e instanceof Error ? e.message : String(e)} />
		{/await}
	{/if}
</Gate>
