<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Download from '@lucide/svelte/icons/download';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { copyText, toasts } from '$lib/ui/toast.svelte';
	import { hashParam } from '$lib/lake/links';
	import { dashboards, newId, shareParam, type Widget } from '$lib/dashboards/store.svelte';
	import WidgetCard from '$lib/dashboards/WidgetCard.svelte';
	import WidgetEditor from '$lib/dashboards/WidgetEditor.svelte';

	/* One personal dashboard: its widgets run their queries in order; edit mode adds, edits, reorders and removes. */
	dashboards.load();
	const id = $derived((page.params.id ?? '').split('?')[0]);
	const d = $derived(dashboards.get(id));

	let editing = $state(hashParam('edit') === '1');
	let editorFor = $state<Widget | 'new' | null>(null);
	let confirmDelete = $state(false);

	async function saveWidget(w: Widget) {
		if (!d) return;
		const i = d.widgets.findIndex((x) => x.id === w.id);
		if (i < 0) d.widgets.push(w);
		else d.widgets[i] = w;
		editorFor = null;
		await dashboards.save(d);
	}
	async function remove(w: Widget) {
		if (!d) return;
		d.widgets = d.widgets.filter((x) => x.id !== w.id);
		await dashboards.save(d);
	}
	async function move(i: number, dir: -1 | 1) {
		if (!d) return;
		const j = i + dir;
		if (j < 0 || j >= d.widgets.length) return;
		[d.widgets[i], d.widgets[j]] = [d.widgets[j], d.widgets[i]];
		await dashboards.save(d);
	}
	async function rename(name: string, description: string) {
		if (!d) return;
		d.name = name.trim() || d.name;
		d.description = description.trim();
		await dashboards.save(d);
	}
	async function share() {
		if (!d) return;
		const p = await shareParam(d);
		const url = `${location.origin}${location.pathname}#/dashboards/import?d=${p}`;
		if (url.length > 32_000) return toasts.show('This dashboard is too big for a link; use Export instead.', 'error', 5000);
		copyText(url, 'Share link copied: it carries the whole dashboard (no server involved)');
	}
	function exportOne() {
		if (!d) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([dashboards.exportJson([d.id])], { type: 'application/json' }));
		a.download = `${d.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'dashboard'}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	async function duplicate() {
		if (!d) return;
		const c = await dashboards.create(`${d.name} (copy)`, d.description, d.widgets.map((w) => ({ ...$state.snapshot(w), id: newId() })));
		goto(`#/dashboards/${c.id}`);
	}
	async function del() {
		if (!d) return;
		await dashboards.remove(d.id);
		goto('#/dashboards');
	}
</script>

<svelte:head><title>{d?.name ?? 'Dashboard'} · Yaci Lens</title></svelte:head>

{#if !dashboards.loaded}
	<div class="y-panel"><Skeleton rows={8} /></div>
{:else if !d}
	<div class="y-panel p-6 text-sm text-muted">This dashboard isn't in this browser. <a class="y-link" href="#/dashboards">Your dashboards</a></div>
{:else}
	<PageHeader kind="Dashboard" title={d.name}>
		{#snippet icon()}<LayoutGrid class="h-5 w-5" />{/snippet}
		{#if editing}
			<div class="mt-1 flex max-w-2xl flex-col gap-2">
				<input class="y-input h-9" value={d.name} onchange={(e) => rename(e.currentTarget.value, d.description)} aria-label="Dashboard name" />
				<input class="y-input h-9" value={d.description} placeholder="Description (optional)" onchange={(e) => rename(d.name, e.currentTarget.value)} aria-label="Description" />
			</div>
		{:else if d.description}{d.description}{/if}
		{#snippet actions()}
			{#if editing}
				<button class="y-btn h-9" onclick={() => (editorFor = 'new')}><Plus class="h-4 w-4" />Add widget</button>
				<button class="y-btn y-btn-primary h-9" onclick={() => (editing = false)}><Check class="h-4 w-4" />Done</button>
			{:else}
				<button class="y-btn h-9" onclick={() => (editing = true)}><Pencil class="h-4 w-4" />Edit</button>
				<button class="y-btn h-9" onclick={share} title="Copy a link that carries this dashboard"><Link2 class="h-4 w-4" />Share link</button>
				<button class="y-icon-btn h-9 w-9" onclick={exportOne} title="Export as JSON" aria-label="Export as JSON"><Download class="h-4 w-4" /></button>
				<button class="y-icon-btn h-9 w-9" onclick={duplicate} title="Duplicate" aria-label="Duplicate"><Copy class="h-4 w-4" /></button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if !d.widgets.length}
		<button class="y-panel flex w-full flex-col items-center gap-2 border-dashed p-10 text-center hover:border-brand/40" onclick={() => ((editing = true), (editorFor = 'new'))}>
			<Plus class="h-6 w-6 text-brand" />
			<span class="font-medium">Add your first widget</span>
			<span class="text-sm text-muted">Write a SQL query and pick how to show it.</span>
		</button>
	{:else}
		<section class="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
			{#each d.widgets as w, i (w.id)}
				<WidgetCard widget={w} {editing} onedit={() => (editorFor = w)} onremove={() => remove(w)} onmove={(dir) => move(i, dir)} />
			{/each}
		</section>
	{/if}

	{#if editing}
		<div class="mt-8 flex items-center gap-3 border-t border-line pt-5 text-sm">
			{#if confirmDelete}
				<span class="text-danger">Delete “{d.name}” from this browser?</span>
				<button class="y-btn h-8 text-xs" onclick={() => (confirmDelete = false)}>Keep it</button>
				<button class="y-btn h-8 border-danger/40 text-xs text-danger" onclick={del}><Trash2 class="h-3.5 w-3.5" />Delete</button>
			{:else}
				<button class="text-xs text-muted hover:text-danger" onclick={() => (confirmDelete = true)}>Delete this dashboard…</button>
			{/if}
		</div>
	{/if}

	{#if editorFor}
		<WidgetEditor widget={editorFor === 'new' ? null : editorFor} onsave={saveWidget} onclose={() => (editorFor = null)} />
	{/if}
{/if}
