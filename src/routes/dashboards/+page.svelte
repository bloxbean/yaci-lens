<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Plus from '@lucide/svelte/icons/plus';
	import Upload from '@lucide/svelte/icons/upload';
	import Download from '@lucide/svelte/icons/download';
	import HardDrive from '@lucide/svelte/icons/hard-drive';
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import { toasts } from '$lib/ui/toast.svelte';
	import { dashboards, newId } from '$lib/dashboards/store.svelte';
	import { TEMPLATES } from '$lib/dashboards/templates';
	import { indexEnabled } from '$lib/indexdb/config';

	/*
	 * Dashboard lab: personal dashboards made of SQL widgets, kept only in this browser. Start empty or from a
	 * template; move them between browsers with export/import or a share link.
	 */
	dashboards.load();
	let name = $state('');
	let fileInput: HTMLInputElement;

	async function create(from?: (typeof TEMPLATES)[number]) {
		const d = await dashboards.create(from?.name ?? (name.trim() || 'My dashboard'), from?.description ?? '', (from?.widgets ?? []).map((w) => ({ ...w, id: newId() })), (from?.params ?? []).map((p) => ({ ...p })));
		name = '';
		goto(`#/dashboards/${d.id}${from ? '' : '?edit=1'}`);
	}

	function download(text: string, file: string) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
		a.download = file;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	async function importFile(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!f) return;
		if (f.size > 2_000_000) return toasts.show('That file is too large for a dashboard export.', 'error', 4000);
		try {
			const n = await dashboards.importJson(await f.text());
			toasts.show(`Imported ${n} dashboard${n > 1 ? 's' : ''}.`, 'ok', 3000);
		} catch (err) {
			toasts.show(`Couldn't import: ${(err as Error).message}`, 'error', 5000);
		}
	}
</script>

<svelte:head><title>Dashboard lab · Yaci Lens</title></svelte:head>

<PageHeader kind="Analytics" title="Dashboard lab">
	{#snippet icon()}<LayoutGrid class="h-5 w-5" />{/snippet}
	{#snippet actions()}
		<button class="y-btn h-9" onclick={() => fileInput.click()}><Upload class="h-4 w-4" />Import</button>
		<button class="y-btn h-9" disabled={!dashboards.list.length} onclick={() => download(dashboards.exportJson(), 'yaci-lens-dashboards.json')}><Download class="h-4 w-4" />Export all</button>
		<input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={importFile} />
	{/snippet}
	Build your own dashboards from SQL: each widget is a query over the published data, drawn as a number, chart, ranked list or table.
</PageHeader>

<div class="mb-6 flex items-start gap-2.5 rounded-xl border border-blue/30 bg-blue/10 px-4 py-3 text-sm">
	<HardDrive class="mt-0.5 h-4 w-4 shrink-0 text-blue" />
	<span>
		Dashboards live only in this browser (IndexedDB): their names, SQL and chart settings, never the data, which is queried again each time. Nothing is
		uploaded. Use <b>Export</b> or a dashboard's <b>Share link</b> to move them to another browser; clearing site data deletes them.
	</span>
</div>

<section class="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
	<Panel title="Your dashboards" sub={dashboards.loaded ? `${dashboards.list.length} in this browser` : 'Loading…'}>
		<form class="mb-4 flex gap-2" onsubmit={(e) => (e.preventDefault(), create())}>
			<input class="y-input h-10 flex-1" placeholder="New dashboard name" bind:value={name} />
			<button class="y-btn y-btn-primary h-10"><Plus class="h-4 w-4" />Create</button>
		</form>
		{#if dashboards.list.length}
			<ul class="flex flex-col gap-1.5">
				{#each dashboards.list as d (d.id)}
					<li>
						<a class="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 hover:border-brand/40 hover:bg-surface-2/60" href="#/dashboards/{d.id}">
							<LayoutGrid class="h-4 w-4 shrink-0 text-brand" />
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{d.name}</span>
								{#if d.description}<span class="block truncate text-xs text-muted">{d.description}</span>{/if}
							</span>
							<span class="shrink-0 text-xs text-faint">{d.widgets.length} widget{d.widgets.length === 1 ? '' : 's'}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if dashboards.loaded}
			<p class="text-sm text-muted">None yet. Create one, or start from a template.</p>
		{/if}
	</Panel>

	<Panel title="Start from a template" sub="A copy is added to your dashboards; change anything">
		<div class="grid gap-3 sm:grid-cols-2">
			{#each TEMPLATES.filter((t) => !t.indexed || indexEnabled()) as t (t.id)}
				<button class="flex flex-col items-start gap-1.5 rounded-xl border border-line p-4 text-left transition hover:border-brand/40 hover:bg-surface-2/60" onclick={() => create(t)}>
					<span class="font-display font-semibold">{t.name}</span>
					<span class="text-xs text-muted">{t.description}</span>
					<span class="mt-1 text-[11px] text-faint">{t.widgets.length} widgets</span>
				</button>
			{/each}
		</div>
	</Panel>
</section>
