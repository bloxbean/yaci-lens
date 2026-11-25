<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import Check from '@lucide/svelte/icons/check';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import { lake } from '$lib/lake/lake.svelte';
	import { network } from '$lib/lake/config';
	import { duckdbWasmVersion } from '$lib/lake/db';
	import { int, isoDay, utc } from '$lib/cardano';

	const points = [
		'No dedicated explorer backend.',
		'No centralized query API.',
		'Browser-side SQL execution.',
		'Low infrastructure and operating costs.',
		'Static website deployment.',
		'Self-hostable using compatible object storage.'
	];
</script>

<svelte:head><title>About · Yaci Lens</title></svelte:head>

<PageHeader kind="About" title="Yaci Lens">
	{#snippet icon()}<Info class="h-5 w-5" />{/snippet}
	The serverless Cardano explorer.
</PageHeader>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
	<div class="flex flex-col gap-6">
		<Panel>
			<p class="text-[15px] leading-relaxed">
				Explore Cardano blockchain data and analytics directly in your browser. Powered by
				<a class="y-link" href="https://github.com/bloxbean/yaci-store" target="_blank" rel="noopener noreferrer">Yaci Store</a>, Cloudflare R2, Apache Parquet and DuckDB-WASM.
			</p>
			<ul class="mt-4 grid gap-2 sm:grid-cols-2">
				{#each points as p (p)}<li class="flex items-center gap-2 text-sm"><Check class="h-4 w-4 shrink-0 text-mint" />{p}</li>{/each}
			</ul>
		</Panel>

		<Panel title="How it works">
			<ol class="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-muted">
				<li><b class="text-ink">Yaci Store indexes mainnet</b> and its analytics store exports every table as Apache Parquet files, one partition per UTC day or per epoch, tracked by a DuckLake catalog.</li>
				<li><b class="text-ink">A daily job publishes them to Cloudflare R2</b>: the new files, a copy of the catalog pointing at the public URL, and a small summary pack for dashboards. R2 has no egress fees, so serving the data costs only storage.</li>
				<li><b class="text-ink">This page is static.</b> DuckDB, compiled to WebAssembly, runs in your tab: it attaches the catalog over HTTPS and reads only the parts of the Parquet files a query needs, with HTTP range requests.</li>
				<li><b class="text-ink">Queries stay fast when they name a partition</b> (<code>WHERE date = …</code> or <code>WHERE epoch = …</code>): DuckDB skips every other file using the catalog's statistics. History-wide charts come from the summary pack.</li>
			</ol>
		</Panel>

		<Panel title="Use the data elsewhere">
			<p class="mb-3 text-sm text-muted">The same data works from any DuckDB 1.5+, with no key:</p>
			<pre class="overflow-x-auto rounded-xl border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed">INSTALL ducklake;
ATTACH '{network.catalogUrl}' AS cardano (TYPE ducklake);
SELECT count(*) FROM cardano.block;</pre>
		</Panel>
	</div>

	<div class="flex flex-col gap-6">
		<Panel title="This snapshot">
			<dl class="grid gap-3 text-sm">
				<div><dt class="y-label">Data through</dt><dd>{lake.tip ? `${isoDay(lake.tip.date)} (UTC)` : '…'}</dd></div>
				<div><dt class="y-label">Tip</dt><dd>{lake.tip ? `block #${int(lake.tip.block)}, epoch ${lake.tip.epoch}` : '…'}</dd></div>
				<div><dt class="y-label">Published</dt><dd>{lake.tip?.generatedAt ? utc(lake.tip.generatedAt) : '…'} · updated daily</dd></div>
				<div><dt class="y-label">Catalog</dt><dd class="break-all font-mono text-xs">{network.catalogUrl}</dd></div>
				<div><dt class="y-label">Engine</dt><dd>DuckDB-WASM {duckdbWasmVersion}</dd></div>
			</dl>
		</Panel>
		<Panel title="Good to know">
			<ul class="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
				<li>Data is a daily snapshot, not live: the newest blocks are up to a day old.</li>
				<li>Each Parquet file costs about 0.3 s to open from a browser. Scanning a big table without a date or epoch filter can take minutes; the SQL lab warns you.</li>
				<li>Looking a transaction up by hash alone needs a transaction index (planned). Open transactions from their block for now.</li>
				<li>Amounts in the lake are exact lovelace; the summary pack uses ADA as floating point for charts.</li>
			</ul>
		</Panel>
		<Panel title="Self-hosting">
			<p class="text-sm text-muted">
				Publish your own Yaci Store export with the <code>cardano-data-r2-publish</code> job to any S3-compatible bucket with public reads and CORS, then build Yaci Lens with
				<code>VITE_LENS_CATALOG_URL</code> and <code>VITE_LENS_SUMMARY_URL</code> pointing at it.
			</p>
		</Panel>
	</div>
</div>
