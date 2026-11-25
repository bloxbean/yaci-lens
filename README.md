# Yaci Lens

**The serverless Cardano explorer.**

Explore Cardano blockchain data and analytics directly in your browser. Powered by Yaci Store, Cloudflare R2,
Apache Parquet and DuckDB-WASM.

- No dedicated explorer backend.
- No centralized query API.
- Browser-side SQL execution.
- Low infrastructure and operating costs.
- Static website deployment.
- Self-hostable using compatible object storage.

## How it works

```
Yaci Store (mainnet) ──analytics export──► Parquet + DuckLake catalog (one partition per UTC day / epoch)
        │
        └─ cardano-data-r2-publish (daily) ──► Cloudflare R2: https://data.bloxbean.org/mainnet/v1/
                                                 catalog.ducklake   the catalog (frozen DuckLake)
                                                 a/ or b/           the Parquet files (A/B slots)
                                                 summary/*.parquet  small precomputed tables for dashboards

Browser: Yaci Lens (static) ── DuckDB-WASM ── ATTACH catalog.ducklake ── HTTP range reads of only the needed files
```

- **Explorer pages** (dashboard, epochs, blocks, transactions, pools, governance, DReps) read the summary pack for
  history-wide views (one request each) and run live lake queries that touch a few partitions (a block, a day, an
  epoch). Every live panel has an **SQL** button that opens its query in the SQL lab.
- **SQL lab**: any SQL over the whole lake (47 tables, ~150 GB) in DuckDB-WASM, with schema completion, examples,
  CSV export, share links and a quick chart. It warns when a query on a big table has no `date`/`epoch` filter.
- **Validator lab** (julc): write a validator in Java, or load any on-chain script by hash, evaluate it against a
  transaction you describe, and step-debug it at the UPLC level, all in the browser
  ([`@julclang/julc-wasm`](https://www.npmjs.com/package/@julclang/julc-wasm) 0.1.0-pre22).

Data is a daily snapshot (the header shows "Data through …"), not live.

### Performance model

DuckDB-WASM reads remote Parquet files one at a time, about 0.3 s per file. So:

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

## Deploy

- **GitHub Pages**: `.github/workflows/pages.yml` builds and deploys on push to `main` (enable Pages with source
  "GitHub Actions").
- **Cloudflare Pages / R2 / nginx**: upload `build/`. Note Cloudflare Pages' 25 MiB per-file limit: the julc engine
  (`*.wasm`, ~35 MB) exceeds it, so either host on GitHub Pages / R2 / nginx, or serve the engine elsewhere.

The page needs CORS on the data bucket (`GET`/`HEAD`, any origin, exposing `Content-Range`, `Content-Length`,
`ETag`), which the publish job's setup covers.

## Self-hosting the data

Publish your own Yaci Store analytics export (DuckLake with a DuckDB catalog) with the `cardano-data-r2-publish`
job (bloxbean/release-ops) to any S3-compatible bucket with public reads and CORS, then build Yaci Lens with the
two variables above pointing at it.

## Project layout

```
src/lib/lake/      DuckDB-WASM session, lake state, summary pack, catalog, examples, table notes
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

- **Transaction index** (tx hash → day) in the published data: search by transaction hash, input values, and
  replaying a historical transaction's scripts in the julc debugger with its real context (the viewer's replay
  pipeline is already here; it needs resolved inputs).
- Preprod and preview networks.
- A Claude skill and a serverless MCP over the same data.

## License

MIT
