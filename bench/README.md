# Indexed lookups: checks and benchmarks

Playwright scripts for the experimental SQLite-WASM indexed lookups (`#/x`). Separate from the app (own
`package.json`), run by hand against a dev or preview server built with `VITE_LENS_INDEX_URL`.

```bash
cd bench && npm install && npx playwright install chromium firefox
# keys to test with, picked from the published data (no addresses are kept in the repo)
duckdb -json -c "$(sed "s/{DAY}/2026-11-20/g; s#{CATALOG}#<catalog url>#g; s#{SUMMARY}#<summary url>#g" fixtures.sql)" | node to-fixtures.mjs > fixtures.json
BASE=http://localhost:5173/ node check-hub.mjs          # hub: manifest, chain-point check, spent-by, search
BASE=http://localhost:5173/ node check-pages.mjs        # address, stake, script, holders, graph, tx page (screenshots)
BASE=http://localhost:5173/ CHUNKS=4096,16384,65536 node bench.mjs > results.json   # cold / warm costs, SQLite vs DuckDB
```

`BROWSER=chromium|firefox|webkit`. `fixtures.json` (not committed) holds the keys the scenarios use. Each scenario starts a fresh browser context (cold HTTP cache) and then repeats with
another key in the same session (warm); requests and bytes are counted on the network, so SQLite-WASM and
DuckDB-WASM are measured the same way.
