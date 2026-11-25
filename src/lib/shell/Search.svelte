<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import { bech32Decode } from '$lib/bech32';
	import { toasts } from '$lib/ui/toast.svelte';

	/*
	 * Lookup box: block number, epoch ("e600" or a small number), pool id (pool1… or hex), DRep id.
	 * Transaction hashes open the transaction page, which finds the day through the tx index.
	 */
	let q = $state('');
	let input: HTMLInputElement;

	function go(e: SubmitEvent) {
		e.preventDefault();
		const s = q.trim();
		if (!s) return;
		const epoch = /^e(?:poch)?\s*(\d+)$/i.exec(s);
		if (epoch) return nav(`/epochs/${epoch[1]}`);
		if (/^#?\d+$/.test(s)) {
			const n = Number(s.replace('#', ''));
			return nav(n < 5000 ? `/epochs/${n}` : `/blocks/${n}`);
		}
		if (s.startsWith('pool1') && bech32Decode(s)) return nav(`/pools/${s}`);
		if (/^[0-9a-f]{56}$/i.test(s)) return nav(`/pools/${s.toLowerCase()}`);
		if (s.startsWith('drep1')) return nav(`/governance/dreps?q=${encodeURIComponent(s)}`);
		if (/^[0-9a-f]{64}$/i.test(s)) return nav(`/transactions/${s.toLowerCase()}`);
		toasts.show('Try a block number, an epoch (e600), or a pool id.', 'info', 4000);
	}

	function nav(path: string) {
		q = '';
		input?.blur();
		goto(`#${path}`);
	}
</script>

<form class="group hidden h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-sm transition focus-within:border-brand/50 sm:flex md:max-w-xl" onsubmit={go}>
	<Search class="h-4 w-4 shrink-0 text-faint group-focus-within:text-brand" />
	<input
		bind:this={input}
		bind:value={q}
		class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
		placeholder="Tx hash, block number, epoch (e600), pool id…"
		aria-label="Search"
	/>
</form>
