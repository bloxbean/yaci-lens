<script lang="ts">
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
	import { summary } from '$lib/lake/lake.svelte';
	import { drepMeta, fetchAnchor, httpUrls } from '$lib/lake/offchain';
	import type { DRep } from '$lib/lake/types';
	import { adaShort } from '$lib/cardano';
	import { shorten } from '$lib/format';

	const id = $derived((page.params.id ?? '').toLowerCase());

	const data = $derived.by(() => {
		const key = id;
		const dist = summary<DRep>('dreps');
		return {
			drep: dist.then((ds) => ds.find((d) => d.drep_id === key || d.drep_hash === key) ?? null),
			total: dist.then((ds) => ds.reduce((s, d) => s + d.voting_power_ada, 0)),
			meta: Promise.all([dist, drepMeta()]).then(([ds, m]) => {
				const d = ds.find((x) => x.drep_id === key || x.drep_hash === key);
				return m.get(d?.drep_hash ?? key) ?? [...m.values()].find((x) => x.drep_id === key) ?? null;
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
					<Stat label="Voting power" value={adaShort(d.voting_power_ada)} sub="{((d.voting_power_ada / total) * 100).toFixed(3)}% · epoch {d.epoch}" />
					<Stat label="Status" value={d.status ?? '—'} color="rgb(var(--c-violet))" />
					<Stat label="Active until" value={d.active_until != null ? `epoch ${d.active_until}` : '—'} sub={d.expiry != null ? `expires epoch ${d.expiry}` : undefined} color="rgb(var(--c-blue))" />
				</section>
			{/if}
		{/await}
	{/await}

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
