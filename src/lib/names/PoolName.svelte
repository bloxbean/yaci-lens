<script lang="ts">
	import { names } from './names.svelte';
	import { poolBech32 } from '$lib/cardano';
	import { shorten } from '$lib/format';

	/* A pool by its self-declared ticker and name (hash-checked metadata), else its shortened pool1… id. */
	let { hash, link = true, head = 10, tail = 6 }: { hash: string; link?: boolean; head?: number; tail?: number } = $props();
	const bech = $derived(poolBech32(hash));
	const label = $derived(names.pool(hash));
</script>

{#if link}
	<a class="y-link {label ? '' : 'font-mono text-xs'}" href="#/pools/{bech}" title="{label ? `${label} · ` : ''}{bech}">{label ?? shorten(bech, head, tail)}</a>
{:else}
	<span class={label ? '' : 'font-mono text-xs'} title={bech}>{label ?? shorten(bech, head, tail)}</span>
{/if}
