<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import { unitByFingerprint } from '$lib/lake/assets';

	/* asset1… fingerprint (CIP-14) -> the asset's page, through the fingerprint index. */
	const fp = $derived((page.params.fingerprint ?? '').split('?')[0].toLowerCase());
	let missing = $state(false);
	$effect(() => {
		const f = fp;
		missing = false;
		unitByFingerprint(f).then((u) => {
			if (u) goto(`#/assets/unit/${u}`, { replaceState: true });
			else missing = true;
		});
	});
</script>

{#if missing}
	<div class="y-panel p-6 text-sm text-muted">No asset with fingerprint <span class="mono">{fp}</span> in the published data.</div>
{:else}
	<div class="y-panel"><Skeleton rows={4} /></div>
{/if}
