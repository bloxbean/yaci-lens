<script module lang="ts">
export interface Tab {
	id: string;
	label: string;
	count?: number | null;
	/** Still loading: a spinner where the count goes. */
	loading?: boolean;
}
</script>

<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { hashWith } from '$lib/lake/links';


	/*
	 * Underlined tabs. With `param`, the active tab is kept in the URL so it survives reloads and can be shared.
	 * With `link`, tabs are plain links to ?param=id, for pages whose server load depends on the tab.
	 */
	let {
		tabs,
		active = $bindable(),
		param = undefined,
		link = false
	}: { tabs: Tab[]; active: string; param?: string; link?: boolean } = $props();

	// Hash routing: the route and its parameters both live after '#'.
	function hrefFor(id: string) {
		return hashWith({ [param ?? 'tab']: id, page: null });
	}

	function select(id: string) {
		active = id;
		if (param) replaceState(hashWith({ [param]: id }), {});
	}
</script>

<div class="-mb-px flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-3 [scrollbar-width:none]" role="tablist">
	{#each tabs as t (t.id)}
		{@const on = active === t.id}
		<svelte:element
			this={link ? 'a' : 'button'}
			href={link ? hrefFor(t.id) : undefined}
			data-sveltekit-noscroll={link ? '' : undefined}
			role="tab"
			tabindex="0"
			aria-selected={on}
			class="relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors {on ? 'text-ink' : 'text-muted hover:text-ink'}"
			onclick={link ? undefined : () => select(t.id)}
		>
			{t.label}
			{#if t.loading}
				<span class="h-3 w-3 animate-spin rounded-full border-[1.5px] border-faint/40 border-t-brand" aria-label="loading"></span>
			{:else if t.count != null}
				<span class="rounded-full px-1.5 text-[11px] tabular-nums {on ? 'bg-brand/15 text-brand' : 'bg-surface-2 text-faint'}">{t.count}</span>
			{/if}
			{#if on}<span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-grad"></span>{/if}
		</svelte:element>
	{/each}
</div>
