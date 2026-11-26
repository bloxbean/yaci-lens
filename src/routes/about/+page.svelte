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
	The serverless Cardano analytics explorer.
</PageHeader>

<div class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
	<div class="flex flex-col gap-6">
		<Panel>
			<p class="text-[15px] leading-relaxed">
				Explore Cardano blockchain data and analytics directly in your browser. Powered by
				<a class="y-link" href="https://github.com/bloxbean/yaci-store" target="_blank" rel="noopener noreferrer">Yaci Store</a>, Apache Parquet and DuckDB-WASM, and hosted on GitHub Pages.
			</p>
			<ul class="mt-4 grid gap-2 sm:grid-cols-2">
				{#each points as p (p)}<li class="flex items-center gap-2 text-sm"><Check class="h-4 w-4 shrink-0 text-mint" />{p}</li>{/each}
			</ul>
		</Panel>

		<Panel title="How it works">
			<ol class="flex list-decimal flex-col gap-3 pl-5 text-sm leading-relaxed text-muted">
				<li><b class="text-ink">Yaci Store indexes mainnet</b> and its analytics store exports every table as Apache Parquet files, one partition per UTC day or per epoch, tracked by a DuckLake catalog.</li>
				<li><b class="text-ink">A daily job publishes them to object storage</b>: the new files, a copy of the catalog pointing at the public URL, and a small summary pack for dashboards. Serving static files costs little more than storage.</li>
				<li><b class="text-ink">This page is static.</b> DuckDB, compiled to WebAssembly, runs in your tab: it attaches the catalog over HTTPS and reads only the parts of the Parquet files a query needs, with HTTP range requests.</li>
				<li><b class="text-ink">Queries stay fast when they name a partition</b> (<code>WHERE date = …</code> or <code>WHERE epoch = …</code>): DuckDB skips every other file using the catalog's statistics. History-wide charts come from the summary pack.</li>
			</ol>
		</Panel>

		<Panel title="Data sources and credits" sub="Not everything comes from the chain: names, labels and documents come from these sources">
			<dl class="flex flex-col gap-4 text-sm leading-relaxed">
				<div>
					<dt class="font-medium">On-chain data</dt>
					<dd class="text-muted">Blocks, transactions, UTxOs, assets, scripts, staking, rewards and governance: indexed from Cardano mainnet by <a class="y-link" href="https://github.com/bloxbean/yaci-store" target="_blank" rel="noopener noreferrer">Yaci Store</a> and published daily by <a class="y-link" href="https://github.com/bloxbean/yaci-lens-publisher" target="_blank" rel="noopener noreferrer">Yaci Lens Publisher</a>. NFT metadata (CIP-25) comes from the minting transaction itself.</dd>
				</div>
				<div>
					<dt class="font-medium">Token names, tickers, decimals and logos</dt>
					<dd class="text-muted">The <a class="y-link" href="https://github.com/cardano-foundation/cardano-token-registry" target="_blank" rel="noopener noreferrer">Cardano Token Registry</a> (CIP-26), run by the Cardano Foundation. Your browser reads it from <code>tokens.cardano.org</code>.</dd>
				</div>
				<div>
					<dt class="font-medium">dApp names for smart contracts</dt>
					<dd class="text-muted"><a class="y-link" href="https://github.com/StricaHQ/cardano-contracts-registry" target="_blank" rel="noopener noreferrer">Strica's Cardano Contracts Registry</a> (the labels Cardanoscan shows) and <a class="y-link" href="https://github.com/Cardano-Fans/crfa-offchain-data-registry" target="_blank" rel="noopener noreferrer">Cardano Fans' off-chain data registry</a>, fetched daily by the publisher. Strica's label wins when both list a script. Thank you to both projects.</dd>
				</div>
				<div>
					<dt class="font-medium">Pool tickers and names</dt>
					<dd class="text-muted">Each pool's own metadata (CIP-6), at the URL its operator registered on chain. Fetched daily by the publisher and checked against the hash on chain: self-declared by the operator, not verified by anyone.</dd>
				</div>
				<div>
					<dt class="font-medium">DRep profiles and governance action texts</dt>
					<dd class="text-muted">The documents their authors anchored on chain (CIP-119, CIP-108), fetched by the publisher and hash-checked; DRep and proposal pages can also load the full document in your browser. Self-declared, like pool names.</dd>
				</div>
				<div>
					<dt class="font-medium">IPFS</dt>
					<dd class="text-muted"><code>ipfs://</code> links (documents, NFT images) are read through public gateways: ipfs.io, dweb.link, Pinata and Blockfrost.</dd>
				</div>
				<div>
					<dt class="font-medium">Software</dt>
					<dd class="text-muted">
						<a class="y-link" href="https://duckdb.org/docs/stable/clients/wasm/overview" target="_blank" rel="noopener noreferrer">DuckDB-WASM</a> and DuckLake by DuckDB Labs (the engine loads from jsDelivr, its extensions from extensions.duckdb.org);
						<a class="y-link" href="https://github.com/bloxbean/julc" target="_blank" rel="noopener noreferrer">julc</a> for the validator lab and script debugger; the UI is forked from
						<a class="y-link" href="https://github.com/bloxbean/yaci-devkit" target="_blank" rel="noopener noreferrer">Yaci DevKit Viewer</a>; built with Svelte and Lucide icons.
					</dd>
				</div>
			</dl>
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
				<div><dt class="y-label">Yaci Lens</dt><dd>v{__LENS_VERSION__}</dd></div>
				<div><dt class="y-label">Engine</dt><dd>DuckDB-WASM {duckdbWasmVersion}</dd></div>
			</dl>
		</Panel>
		<Panel title="Good to know">
			<ul class="flex list-disc flex-col gap-2 pl-5 text-sm text-muted">
				<li>
					Data is a daily snapshot, about two days behind the chain (T-2): Yaci Lens is for analytics, not for following the chain live. For real-time
					data, use a community explorer such as <a class="y-link" href="https://cardanoscan.io" target="_blank" rel="noopener noreferrer">Cardanoscan</a>,
					<a class="y-link" href="https://cexplorer.io" target="_blank" rel="noopener noreferrer">Cexplorer</a> or
					<a class="y-link" href="https://adastat.net" target="_blank" rel="noopener noreferrer">AdaStat</a>.
				</li>
				<li>Each Parquet file costs about 0.3 s to open from a browser. Scanning a big table without a date or epoch filter can take minutes; the SQL lab warns you.</li>
				<li>A transaction found by hash alone is located through the transaction index; the first lookup of a session takes a few seconds.</li>
				<li>Amounts in the lake are exact lovelace; the summary pack uses ADA as floating point for charts.</li>
			</ul>
		</Panel>
		<Panel title="Make your own, or contribute">
			<p class="mb-3 text-sm text-muted">
				Yaci Lens is open source (MIT). <a class="y-link" href="https://github.com/bloxbean/yaci-lens" target="_blank" rel="noopener noreferrer">Fork it on GitHub</a>, add the pages
				and dashboards your community needs, change the look, and host your own version on GitHub Pages: no servers, no API keys. Or
				<a class="y-link" href="https://github.com/bloxbean/yaci-lens" target="_blank" rel="noopener noreferrer">contribute to Yaci Lens</a>: ideas, bug reports and pull requests
				are welcome.
			</p>
			<p class="text-sm text-muted">
				Publish your own Yaci Store export with <a class="y-link" href="https://github.com/bloxbean/yaci-lens-publisher" target="_blank" rel="noopener noreferrer">Yaci Lens Publisher</a> to any S3-compatible bucket with public reads and CORS, then build Yaci Lens with
				<code>VITE_LENS_CATALOG_URL</code> and <code>VITE_LENS_SUMMARY_URL</code> pointing at it.
			</p>
		</Panel>
	</div>
</div>
