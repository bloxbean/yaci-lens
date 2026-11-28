<script lang="ts">
	import Gauge from '@lucide/svelte/icons/gauge';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Gate from '$lib/indexdb/Gate.svelte';
	import { onMount } from 'svelte';

	/*
	 * EXPERIMENTAL benchmark harness for indexed lookups: exposes the SQLite index service and the existing
	 * DuckDB / Parquet lookups on window.__lensBench, for a driver such as Playwright (see the publisher's
	 * SQLITE-INDEXES.md, "Benchmarks"). Nothing runs until the driver calls it.
	 */
	let ready = $state(false);

	async function timed<T>(f: () => Promise<T>): Promise<{ data: T; ms: number }> {
		const t0 = performance.now();
		const data = await f();
		return { data, ms: Math.round(performance.now() - t0) };
	}

	onMount(async () => {
		const svc = await import('$lib/indexdb/service');
		const { DEFAULT_VFS } = await import('$lib/indexdb/client');
		const replay = await import('$lib/lake/replay');
		const lakeMod = await import('$lib/lake/lake.svelte');
		(window as unknown as Record<string, unknown>).__lensBench = {
			svc,
			defaults: DEFAULT_VFS,
			sqliteInit: () => svc.sqlite.init(),
			setVfs: (o: Record<string, number>) => svc.sqlite.setOptions(o),
			clearCache: () => svc.sqlite.clearCache(),
			resetWorker: () => svc.sqlite.reset(new Error('bench reset')),
			// any published SQLite file (e.g. page-size variants), outside the manifest
			rawOpen: (name: string, url: string, size: number) => svc.sqlite.open(name, url, size),
			rawQuery: (name: string, sql: string, params: (string | number | null)[] = []) => svc.sqlite.query(name, sql, params),
			// DuckDB-WASM side: start-up, and the Parquet tx index (hash -> day), confirmed in the day's partition
			duckInit: () => timed(() => lakeMod.lake.ready()),
			duckTxDay: (hash: string) => timed(() => replay.txDay(hash)),
			duckQuery: (sql: string) => timed(() => lakeMod.live(sql))
		};
		ready = true;
	});
</script>

<svelte:head><title>Index benchmarks · Yaci Lens</title></svelte:head>

<PageHeader kind="Experimental" title="Index benchmarks">
	{#snippet icon()}<Gauge class="h-5 w-5" />{/snippet}
</PageHeader>

<Gate>
	<div class="y-panel p-6 text-sm text-muted" data-testid="bench" data-ready={ready}>
		{ready ? 'Ready: drive window.__lensBench from a benchmark script.' : 'Loading…'}
	</div>
</Gate>
