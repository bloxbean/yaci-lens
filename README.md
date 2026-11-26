<p align="center"><img src="docs/yaci-lens-icon.svg" width="112" alt="Yaci Lens"></p>

<h1 align="center">Yaci Lens</h1>

<p align="center"><b>The serverless Cardano analytics explorer.</b></p>

<p align="center">
<i>A deeper look into Cardano.</i><br>
Explore blockchain data. Discover insights. Build dashboards. Debug smart contracts.
</p>

<p align="center">
Open data. Open source. Powered by your browser.<br>
Powered by <a href="https://github.com/bloxbean/yaci-store">Yaci Store</a>, <a href="https://ducklake.select">DuckLake</a>,
<a href="https://duckdb.org">DuckDB</a> and <a href="https://parquet.apache.org">Apache Parquet</a>.
</p>

Yaci Lens is a static website hosted on GitHub Pages. DuckDB-WASM runs the queries in your browser.

> **Analytics, not real time.** Yaci Lens works on a daily snapshot that is about two days behind the chain (T-2).
> For real-time data (the latest blocks, transactions, balances), use a community Cardano explorer such as
> [Cardanoscan](https://cardanoscan.io), [Cexplorer](https://cexplorer.io) or [AdaStat](https://adastat.net).

- No dedicated explorer backend.
- No centralized query API.
- Browser-side SQL execution.
- Low infrastructure and operating costs.
- Static website deployment.
- Self-hostable using compatible object storage.

**Open source (MIT): fork it and make your own Yaci Lens, or contribute to Yaci Lens.** Add the pages and
dashboards your community needs, change the look, point it at your own data and host it on your own GitHub Pages,
or send your improvements back so everyone gets them. See
[Make your own Yaci Lens, or contribute](#make-your-own-yaci-lens-or-contribute).

## How it works

```
Yaci Store (mainnet) ──analytics export──► Parquet + DuckLake catalog (one partition per UTC day / epoch)
        │
        └─ yaci-lens-publisher (daily) ──────► object storage: https://data.bloxbean.org/mainnet/v1/
                                                 catalog.ducklake   the catalog (frozen DuckLake)
                                                 a/ or b/           the Parquet files (A/B slots)
                                                 summary/*.parquet  small precomputed tables for dashboards

Browser: Yaci Lens (static) ── DuckDB-WASM ── ATTACH catalog.ducklake ── HTTP range reads of only the needed files
```

- **Explorer pages** (dashboard, epochs, blocks, transactions, assets, scripts, pools, staking, governance, DReps) read
  the summary pack for history-wide views (one request each) and run live lake queries that touch a few partitions
  (a block, a day, an epoch). Every panel has an **SQL** button that opens its query in the SQL lab.
- **Transactions** as in Yaci Viewer: inputs and outputs (inputs resolved from the days they were created), the
  balance, scripts re-run in the browser with julc and compared with the on-chain budget, mint & burn, metadata,
  certificates & votes, collateral, reference inputs, signers. **Fork in the lab** opens the what-if lab with the
  real transaction loaded. A transaction list shows any day, newest first.
- **Assets**: search tokens by name, ticker, policy, unit or `asset1…` fingerprint (an index of all ~11M assets is
  read with range requests); token activity, minting trends, most used tokens and largest collections; token pages
  with supply, mint/burn history, CIP-26 registry details and CIP-25 metadata.
- **Smart contracts**: scripts and dApps ranked by transactions, fees, CPU or failures over a chosen range, Plutus
  version mix, dApp trends; a page per script with activity and recent executions (each one debuggable). dApp names
  come from Strica's Cardano Contracts Registry and Cardano Fans' registry.
- **Whales**: the 1,000 largest stake accounts by ADA held under their stake key, delegating or not: share of all
  stake, 7- and 30-day change, pool and DRep, unwithdrawn rewards, and whether they moved in the last 24 hours, 7 or
  30 days; how much the top 10 / 100 hold over time, and how many accounts hold 1k … 100M+ ADA.
- **Governance**: DRep power over time and its concentration, votes by role and action type, every DRep's
  participation and record (agreement with outcomes, SPOs and the committee), and a page per action with votes by
  body, the stake-weighted DRep tally and every voter.
- **Dashboard lab**: personal dashboards of SQL widgets (number, line, area, bars, stacked bars, ranked list, split
  bar, table), stored only in the browser (IndexedDB). Export/import as JSON, or share a link that carries the
  whole dashboard in the URL. Templates to start from.
- **SQL lab**: any SQL over the whole lake (47 tables, ~150 GB) in DuckDB-WASM, with schema completion, examples,
  CSV export, share links and a quick chart. It warns when a query on a big table has no `date`/`epoch` filter.
- **Transactions by hash** and **script debugging of real transactions**: the published tx index maps a hash to
  its day; Lens resolves the inputs and reference inputs from the days they were created and re-runs each script in
  the julc debugger with the transaction's real context (`#/transactions/<hash>/debug/<purpose>/<index>`).
- **Names and metadata**: pool tickers/names (CIP-6), DRep profiles (CIP-119) and proposal texts (CIP-108) are
  fetched and hash-checked by the publish job (most metadata hosts send no CORS headers) and published in the
  summary pack; DRep/proposal pages also load the full document in the browser when the host allows it, and token
  names come from the CIP-26 registry. Browser fetches are cached in localStorage (a day; failures an hour; tokens a
  week).
- **Validator lab** (julc): write a validator in Java, or load any on-chain script by hash, evaluate it against a
  transaction you describe, and step-debug it at the UPLC level, all in the browser
  ([`@julclang/julc-wasm`](https://www.npmjs.com/package/@julclang/julc-wasm) 0.1.0-pre22).

Data is a daily snapshot, about two days behind the chain (T-2); the header shows "Data through …". For real-time
data, use a community explorer such as [Cardanoscan](https://cardanoscan.io), [Cexplorer](https://cexplorer.io) or [AdaStat](https://adastat.net).

### Do I need a server?

No. Yaci Lens is a static site: fork it and host `build/` on GitHub Pages or any static web server.
Everything it shows comes from files in the data bucket or is fetched by the browser itself:

- the lake and the summary pack (Parquet) from `data.bloxbean.org`, read with HTTP range requests;
- token names from the CIP-26 registry and governance documents from IPFS/hosts that allow it, cached in
  `localStorage`; personal dashboards in IndexedDB.

The only server is the one that **produces** the data (Yaci Store plus the daily publish job), which also fetches
off-chain metadata most hosts don't let browsers read (pool, DRep and proposal documents) and the dApp registries,
and publishes the results as static files. A fork that reads `data.bloxbean.org` runs nothing at all.

### Performance model

DuckDB-WASM (with the `httpfs` extension) reads only the parts of each Parquet file a query needs, using HTTP range
requests, and opens files one at a time, about 0.3 s per file. So:

| Query shape | Files read | Time |
|---|---|---|
| Catalog metadata (`count(*)`, `max(number)`), summary pack | 0–1 | < 0.1–1 s |
| One day, one epoch, a block by number (pruned by column stats) | 1–6 | 0.2–2 s |
| 90 days of a daily table | ~90 | ~25 s |
| A whole table without a partition filter | hundreds–thousands | minutes |

That is why history-wide views come from the summary pack, built by the publish job on the server.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # svelte-check
npm run build      # static site in build/
```

Node 22. The app uses SvelteKit with the static adapter and **hash routing** (`#/epochs/600`), so `build/` works
on any static host without rewrite rules.

### Configuration

| Variable (build time) | Default |
|---|---|
| `VITE_LENS_CATALOG_URL` | `https://data.bloxbean.org/mainnet/v1/catalog.ducklake` |
| `VITE_LENS_SUMMARY_URL` | `https://data.bloxbean.org/mainnet/v1/summary/` |

## Make your own Yaci Lens, or contribute

Yaci Lens is open source under the MIT license, and everything it needs is static, so your own version is a fork away:

1. **Fork** this repository on GitHub.
2. **Change what you like**: add pages under `src/routes/`, charts with the kit in `src/lib/charts/`, starter
   dashboards in `src/lib/dashboards/templates.ts`, or your own branding in `src/lib/shell/`. Pages query the
   published data with SQL (`summary()`, `summaryQuery()` and `live()` in `src/lib/lake/`).
3. **Pick the data**: keep BloxBean's public mainnet data (the default), or publish your own Yaci Store export
   with [Yaci Lens Publisher](https://github.com/bloxbean/yaci-lens-publisher) and set `VITE_LENS_CATALOG_URL` and
   `VITE_LENS_SUMMARY_URL` (see [Configuration](#configuration)).
4. **Deploy**: enable GitHub Pages in your fork (source "GitHub Actions"); every push to `main` publishes your
   version at `https://<you>.github.io/<repo>/`. No servers, no API keys.

**Contribute to Yaci Lens.** Ideas, bug reports and pull requests are welcome: new explorer pages and charts,
dashboard templates, better SQL examples, fixes, and docs. Open an issue to discuss a bigger change first.

## Deploy

Yaci Lens is hosted on **GitHub Pages** at [lens.yaci.xyz](https://lens.yaci.xyz). A fork can use GitHub Pages too, or
upload `build/` to any static web server.

The page needs CORS on the data bucket (`GET`/`HEAD`, any origin, exposing `Content-Range`, `Content-Length`,
`ETag`), which the publish job's setup covers.

## Self-hosting the data

Publish your own Yaci Store analytics export (DuckLake with a DuckDB catalog) with
[Yaci Lens Publisher](https://github.com/bloxbean/yaci-lens-publisher) to any S3-compatible bucket with public reads and CORS, then build Yaci Lens with the
two variables above pointing at it.

## Project layout

```
src/lib/lake/      DuckDB-WASM session, lake state, summary pack, catalog, examples, assets, votes, replay loader
src/lib/charts/    SeriesChart, BarList, SplitBar, RangePicker (series colours validated per theme)
src/lib/dashboards/ Dashboard lab: store (IndexedDB), runner, widgets, templates
src/lib/api/       lake-backed stand-in for Yaci Store's REST client (used by the julc code)
src/lib/julc/      julc engine, validator lab, UPLC debugger, replay pipeline (forked from Yaci Viewer)
src/lib/shell/     sidebar, top bar, search, data badge (from Yaci Viewer)
src/lib/ui/        panels, stats, charts, tables (from Yaci Viewer)
src/lib/sql/       SQL editor (CodeMirror 6) and result grid
src/routes/        pages (hash-routed)
```

The UI, julc integration and replay pipeline are forked from
[Yaci DevKit Viewer](https://github.com/bloxbean/yaci-devkit/tree/main/applications/viewer) (MIT).

## Roadmap

- Preprod and preview networks.
- A serverless MCP over the same data (the Claude skill is in bloxbean/yaci-lens-skill).

## Data sources and credits

Not everything comes from the chain. Yaci Lens shows:

- **On-chain data**: blocks, transactions, UTxOs, assets, scripts, staking, rewards and governance, indexed from Cardano
  mainnet by [Yaci Store](https://github.com/bloxbean/yaci-store) and published daily by
  [Yaci Lens Publisher](https://github.com/bloxbean/yaci-lens-publisher). NFT metadata (CIP-25) comes from the minting
  transaction.
- **Token names, tickers, decimals and logos**: the
  [Cardano Token Registry](https://github.com/cardano-foundation/cardano-token-registry) (CIP-26) by the Cardano
  Foundation, read by the browser from `tokens.cardano.org`.
- **dApp names for smart contracts**: [Strica's Cardano Contracts Registry](https://github.com/StricaHQ/cardano-contracts-registry)
  and [Cardano Fans' off-chain data registry](https://github.com/Cardano-Fans/crfa-offchain-data-registry), fetched
  daily by the publisher (Strica's label wins when both list a script).
- **Pool tickers and names** (CIP-6), **DRep profiles** (CIP-119) and **governance action texts** (CIP-108): the
  documents their owners anchored on chain, fetched by the publisher and checked against the on-chain hash.
  Self-declared, not verified.
- **IPFS** content through public gateways (ipfs.io, dweb.link, Pinata, Blockfrost).
- **Software**: [DuckDB-WASM](https://duckdb.org/docs/stable/clients/wasm/overview) and DuckLake by DuckDB Labs,
  [julc](https://github.com/bloxbean/julc) for the validator lab, the UI forked from
  [Yaci DevKit Viewer](https://github.com/bloxbean/yaci-devkit), Svelte and Lucide icons.

Thank you to all of these projects. The About page in the app lists the same.

## License

MIT
