<script lang="ts">
	import { names } from './names.svelte';
	import { hexToText, shorten } from '$lib/format';

	/* A native token's registered ticker (CIP-26), else its asset name as text, else a shortened unit; with the quantity in its decimals. */
	let { unit, quantity = null }: { unit: string; quantity?: string | number | null } = $props();
	const meta = $derived(names.token(unit));
	const label = $derived(meta?.ticker ?? meta?.name ?? hexToText(unit.slice(56)) ?? shorten(unit, 8, 4));
	const amount = $derived.by(() => {
		if (quantity == null) return null;
		const d = meta?.decimals ?? 0;
		const n = Number(quantity) / 10 ** d;
		return n.toLocaleString('en-US', { maximumFractionDigits: d });
	});
</script>

<span title="{meta?.name ? `${meta.name} · ` : ''}{unit}">{#if amount != null}{amount} {/if}{label}</span>
