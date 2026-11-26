<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import X from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import { dashboards, newId } from './store.svelte';

	/* "Save to dashboard" for the SQL lab: the query becomes a widget (chart picked automatically, editable later). */
	let { sql }: { sql: string } = $props();

	let open = $state(false);
	let title = $state('');
	let target = $state<string>('new');
	let newName = $state('My dashboard');

	async function openDialog() {
		await dashboards.load();
		target = dashboards.list.at(-1)?.id ?? 'new';
		title = (sql.match(/--\s*(.+)/)?.[1] ?? 'Query').slice(0, 80);
		open = true;
	}

	async function save() {
		const widget = { id: newId(), title: title.trim() || 'Query', sql: sql.trim(), viz: { type: 'auto' as const }, width: 2 as const };
		let id = target;
		if (target === 'new') id = (await dashboards.create(newName.trim() || 'My dashboard', '', [widget])).id;
		else {
			const d = dashboards.get(target);
			if (!d) return;
			d.widgets.push(widget);
			await dashboards.save(d);
		}
		open = false;
		goto(`#/dashboards/${id}`);
	}
</script>

<button class="y-btn h-9" onclick={openDialog} disabled={!sql.trim()} title="Keep this query as a widget on one of your dashboards (stored in this browser)"><LayoutGrid class="h-4 w-4" /> Save to dashboard</button>

{#if open}
	<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Save to dashboard">
		<button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => (open = false)} aria-label="Close"></button>
		<form class="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card" onsubmit={(e) => (e.preventDefault(), save())}>
			<div class="mb-4 flex items-center justify-between">
				<h2 class="font-display font-semibold">Save to a dashboard</h2>
				<button type="button" class="y-icon-btn h-8 w-8" onclick={() => (open = false)} aria-label="Close"><X class="h-4 w-4" /></button>
			</div>
			<label class="mb-3 block text-xs text-muted">Widget title<input class="y-input mt-1 h-9 w-full" bind:value={title} /></label>
			<label class="mb-3 block text-xs text-muted">Dashboard
				<select class="y-input mt-1 h-9 w-full" bind:value={target}>
					{#each dashboards.list as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
					<option value="new">New dashboard…</option>
				</select>
			</label>
			{#if target === 'new'}<label class="mb-3 block text-xs text-muted">New dashboard name<input class="y-input mt-1 h-9 w-full" bind:value={newName} /></label>{/if}
			<p class="mb-4 text-xs text-faint">Only the SQL and chart settings are saved, in this browser. The chart type is picked from the result; change it from the dashboard's Edit mode.</p>
			<div class="flex justify-end gap-2">
				<button type="button" class="y-btn h-9" onclick={() => (open = false)}>Cancel</button>
				<button class="y-btn y-btn-primary h-9">Save</button>
			</div>
		</form>
	</div>
{/if}
