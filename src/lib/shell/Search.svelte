<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import { bech32Decode } from '$lib/bech32';
	import { toasts } from '$lib/ui/toast.svelte';
	import { summaryQuery } from '$lib/lake/lake.svelte';
	import { indexEnabled } from '$lib/indexdb/config';

	/*
	 * Lookup box: block number, epoch ("e600"), transaction hash, governance action (hash#index), pool id
	 * (pool1…), DRep id (drep1…), asset fingerprint (asset1…) or unit, and a 56-hex hash, which is looked up as a
	 * pool, a Plutus script, a minting policy or a DRep (whichever exists). Other text searches tokens by name.
	 * Transaction hashes open the transaction page, which finds the day through the tx index.
	 */
	let q = $state('');
	let input: HTMLInputElement;

	async function hash56(h: string) {
		const has = async (sql: string) => ((await summaryQuery<{ n: number }>(sql).catch(() => [{ n: 0 }]))[0]?.n ?? 0) > 0;
		if (await has(`SELECT count(*)::INT AS n FROM {pools} WHERE pool_hash = '${h}'`)) return nav(`/pools/${h}`);
		if (await has(`SELECT count(*)::INT AS n FROM {script_totals} WHERE script_hash = '${h}'`)) return nav(`/scripts/${h}`);
		if (await has(`SELECT count(*)::INT AS n FROM {asset_policies} WHERE policy = '${h}'`)) return nav(`/assets/policy/${h}`);
		if (await has(`SELECT count(*)::INT AS n FROM {dreps} WHERE drep_hash = '${h}'`)) return nav(`/governance/dreps/${h}`);
		return nav(`/pools/${h}`);
	}

	function go(e: SubmitEvent) {
		e.preventDefault();
		const s = q.trim();
		if (!s) return;
		const action = /^([0-9a-f]{64})[#_](\d+)$/i.exec(s);
		if (action) return nav(`/governance/actions/${action[1].toLowerCase()}/${action[2]}`);
		if (/^asset1[0-9a-z]{38}$/i.test(s)) return nav(`/assets/fingerprint/${s.toLowerCase()}`);
		if (/^[0-9a-f]{58,120}$/i.test(s) && s.length % 2 === 0) return nav(`/assets/unit/${s.toLowerCase()}`);
		const epoch = /^e(?:poch)?\s*(\d+)$/i.exec(s);
		if (epoch) return nav(`/epochs/${epoch[1]}`);
		if (/^#?\d+$/.test(s)) {
			const n = Number(s.replace('#', ''));
			return nav(n < 5000 ? `/epochs/${n}` : `/blocks/${n}`);
		}
		if (s.startsWith('pool1') && bech32Decode(s)) return nav(`/pools/${s}`);
		if (/^[0-9a-f]{56}$/i.test(s)) return void hash56(s.toLowerCase());
		if (/^drep1[0-9a-z]+$/i.test(s) && bech32Decode(s)) return nav(`/governance/dreps/${s.toLowerCase()}`);
		if (/^[0-9a-f]{64}$/i.test(s)) return nav(`/transactions/${s.toLowerCase()}`);
		// EXPERIMENTAL indexed lookups (only when the indexes are published): addresses and stake addresses have
		// activity pages, and free text searches every name (pools, DReps, proposals, dApps, tokens)
		const isAddress = /^(addr|stake)(_test)?1[0-9a-z]{20,}$/i.test(s) || /^(Ae2|DdzFF)[1-9A-HJ-NP-Za-km-z]{20,}$/.test(s);
		const isText = /^[\p{L}\p{N} ._$-]{2,40}$/u.test(s);
		if ((isAddress || isText) && indexEnabled()) {
			void indexed().then((ok) => {
				if (ok) nav(isAddress ? `/x/address/${s}` : `/x/search?q=${encodeURIComponent(s)}`);
				else if (isText) nav(`/assets?q=${encodeURIComponent(s)}`);
				else toasts.show('Address lookups need the published indexes, which are not reachable.', 'info', 5000);
			});
			return;
		}
		if (isText) return nav(`/assets?q=${encodeURIComponent(s)}`);
		toasts.show('Try a transaction hash, block number, epoch (e600), pool, DRep, script, policy or token name.', 'info', 5000);
	}

	async function indexed(): Promise<boolean> {
		try {
			return await (await import('$lib/indexdb/service')).indexAvailable();
		} catch {
			return false;
		}
	}

	// EXPERIMENTAL: name suggestions while typing (search index), when the indexes are published
	type Hit = import('$lib/indexdb/service').SearchHit;
	let hits = $state<Hit[]>([]);
	let open = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let seq = 0;
	const HREF: Record<Hit['kind'], (k: string) => string> = {
		pool: (k) => `/pools/${k}`,
		drep: (k) => `/governance/dreps/${k}`,
		proposal: (k) => `/governance/actions/${k.replace('#', '/')}`,
		script: (k) => `/scripts/${k}`,
		token: (k) => `/assets/unit/${k}`
	};
	function suggest() {
		if (timer) clearTimeout(timer);
		const s = q.trim();
		const plain = s.length >= 3 && /^[\p{L}\p{N} ._$-]+$/u.test(s) && !/^[0-9a-f]{20,}$/i.test(s) && !/^#?\d+$/.test(s) && !/^(addr|stake|pool|drep|asset)/i.test(s);
		if (!plain || !indexEnabled()) {
			hits = [];
			open = false;
			return;
		}
		const mine = ++seq;
		timer = setTimeout(async () => {
			try {
				const svc = await import('$lib/indexdb/service');
				if (!(await svc.indexAvailable())) return;
				const r = await svc.search(s, 8);
				if (mine !== seq) return;
				hits = r.data;
				open = hits.length > 0;
			} catch {
				/* suggestions are optional */
			}
		}, 300);
	}
	function pick(h: Hit) {
		open = false;
		hits = [];
		seq++;
		nav(HREF[h.kind](h.key));
	}

	function nav(path: string) {
		q = '';
		input?.blur();
		goto(`#${path}`);
	}
</script>

<form class="group relative hidden h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 text-sm transition focus-within:border-brand/50 sm:flex md:max-w-xl" onsubmit={(e) => { open = false; seq++; go(e); }}>
	<Search class="h-4 w-4 shrink-0 text-faint group-focus-within:text-brand" />
	<input
		bind:this={input}
		bind:value={q}
		class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
		placeholder={indexEnabled() ? 'Tx hash, address, stake key, block, epoch, pool, DRep, script, name…' : 'Tx hash, block, epoch (e600), pool, DRep, script, token…'}
		aria-label="Search"
		oninput={suggest}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
		onblur={() => setTimeout(() => (open = false), 200)}
		onfocus={() => (open = hits.length > 0)}
	/>
	{#if open}
		<ul class="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-card" data-testid="suggestions">
			{#each hits as h (h.kind + h.key)}
				<li>
					<button type="button" class="flex w-full items-baseline gap-2 px-3.5 py-2 text-left hover:bg-surface-2" onmousedown={(e) => { e.preventDefault(); pick(h); }}>
						<span class="w-16 shrink-0 text-[11px] uppercase tracking-wide text-faint">{h.kind}</span>
						<span class="min-w-0 truncate text-ink">{h.title}</span>
						<span class="min-w-0 truncate text-xs text-faint">{h.body}</span>
					</button>
				</li>
			{/each}
			<li class="border-t border-line"><button type="submit" class="w-full px-3.5 py-1.5 text-left text-xs text-muted hover:bg-surface-2">All results for “{q.trim()}” ↵</button></li>
		</ul>
	{/if}
</form>
