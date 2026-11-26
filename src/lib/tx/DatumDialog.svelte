<script lang="ts">
	import PlutusView from '$lib/ui/PlutusView.svelte';
	import X from '@lucide/svelte/icons/x';
	import type { Utxo } from './types';
	import { datumCache } from '$lib/lake/replay';

	/* The datum of an output, in a dialog: inline, or by hash when the lake had it (loaded with the transaction). */
	let { utxo = $bindable() }: { utxo: Utxo | null } = $props();
	const cbor = $derived(utxo ? (utxo.inline_datum ?? (utxo.data_hash ? (datumCache.get(utxo.data_hash) ?? null) : null)) : null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (utxo = null)} />

{#if utxo}
	<div class="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Inline datum">
		<button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => (utxo = null)} aria-label="Close"></button>
		<div class="relative w-full max-w-2xl animate-fade-up rounded-2xl border border-line bg-surface p-5 shadow-card">
			<div class="mb-4 flex items-center justify-between">
				<div>
					<div class="y-label text-brand">{utxo.inline_datum ? 'Inline datum' : 'Datum by hash'}</div>
					<div class="mono text-sm text-muted">output #{utxo.output_index}</div>
				</div>
				<button class="y-icon-btn" onclick={() => (utxo = null)} aria-label="Close"><X class="h-4 w-4" /></button>
			</div>
			{#if cbor}
				<PlutusView {cbor} json={utxo.inline_datum ? (utxo.inline_datum_json ?? undefined) : undefined} label="Datum" />
			{:else}
				<p class="text-sm text-muted">The datum with hash <span class="mono text-xs break-all">{utxo.data_hash}</span> isn't in the lake for the days this transaction touches (it may have been supplied by a later transaction).</p>
			{/if}
		</div>
	</div>
{/if}
