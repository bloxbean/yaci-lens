<script lang="ts">
	import AssetAvatar from './AssetAvatar.svelte';
	import { tokenDetail } from '$lib/lake/offchain';
	import { hexToText } from '$lib/format';

	/*
	 * A token's image for lists: its logo from the Cardano token registry (CIP-26) when it has one (fetched once,
	 * cached a week), else the coloured letter tile of its policy. NFT images (CIP-25) live in mint metadata, which
	 * would cost a lake query per token, so lists show the tile; the asset page shows the image.
	 */
	let { unit, size = 28 }: { unit: string; size?: number } = $props();
	const policy = $derived(unit.slice(0, 56));
	const name = $derived(hexToText(unit.slice(56)) ?? '');
	let logo = $state<string | null>(null);
	let failed = $state(false);
	$effect(() => {
		const u = unit;
		logo = null;
		failed = false;
		tokenDetail(u)
			.then((d) => {
				if (u === unit) logo = d?.logo ?? null;
			})
			.catch(() => undefined);
	});
</script>

{#if logo && !failed}
	<img src={logo} alt="" class="shrink-0 rounded-full border border-line bg-surface object-cover" style="width:{size}px;height:{size}px" onerror={() => (failed = true)} />
{:else}
	<AssetAvatar {policy} {name} {size} />
{/if}
