<script lang="ts">
	import type { Snippet } from 'svelte';
	import { INDEX_URL, indexEnabled } from './config';

	/* Shows its content only when the indexed-lookups experiment is configured and turned on. */
	let { children }: { children: Snippet } = $props();
	const on = indexEnabled();
</script>

{#if on}
	{@render children()}
{:else}
	<div class="y-panel p-6 text-sm text-muted" data-testid="gate">
		{#if INDEX_URL}
			This page uses indexed lookups (experimental). <a class="y-link" href="#/x">Turn them on</a> to use it.
		{:else}
			This page needs indexed lookups, which this build doesn't have (VITE_LENS_INDEX_URL is not set).
		{/if}
	</div>
{/if}
