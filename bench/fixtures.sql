-- Picks benchmark keys from the published lake, so no addresses are kept in the repo.
-- duckdb -json -c "$(sed "s/{DAY}/2026-11-20/g; s#{CATALOG}#https://data-test.bloxbean.org/mainnet/v1/catalog.ducklake#g; s#{SUMMARY}#https://data-test.bloxbean.org/mainnet/v1/summary/#g" fixtures.sql)" | node to-fixtures.mjs > fixtures.json
INSTALL httpfs; LOAD httpfs; INSTALL ducklake; LOAD ducklake;
ATTACH '{CATALOG}' AS l (TYPE ducklake, READ_ONLY);
WITH s AS (
  SELECT i.tx_hash, i.output_index, i.spent_tx_hash, o.owner_addr, o.owner_stake_addr
  FROM l.tx_input i JOIN l.address_utxo o ON o.tx_hash = i.tx_hash AND o.output_index = i.output_index AND o.asset_unit = 'lovelace'
  WHERE i.date = DATE '{DAY}' + 1 AND o.date = DATE '{DAY}' AND o.owner_stake_addr IS NOT NULL
  USING SAMPLE 2 ROWS
), busy AS (
  SELECT owner_addr, owner_stake_addr, count(*) n FROM l.address_utxo WHERE date = DATE '{DAY}' AND asset_unit = 'lovelace' AND owner_stake_addr IS NOT NULL
  GROUP BY ALL ORDER BY n DESC LIMIT 1
), old AS (
  SELECT tx_hash, output_index, spent_tx_hash FROM l.tx_input WHERE date = DATE '2021-09-15' LIMIT 1
), byron AS (
  SELECT tx_hash, output_index FROM l.tx_input WHERE date = DATE '2018-03-01' LIMIT 1
), scripts AS (
  SELECT list(script_hash ORDER BY txs DESC)[1:2] AS top FROM read_parquet('{SUMMARY}script_totals.parquet')
), tokens AS (
  SELECT list(unit ORDER BY policy_txs_30d DESC NULLS LAST)[1:2] AS top FROM read_parquet('{SUMMARY}asset_tokens.parquet')
)
SELECT (SELECT list(struct_pack(tx := tx_hash, idx := output_index, by := spent_tx_hash, addr := owner_addr, stake := owner_stake_addr)) FROM s) AS recent,
       (SELECT struct_pack(addr := owner_addr, stake := owner_stake_addr) FROM busy) AS busy,
       (SELECT struct_pack(tx := tx_hash, idx := output_index, by := spent_tx_hash) FROM old) AS old,
       (SELECT struct_pack(tx := tx_hash, idx := output_index) FROM byron) AS byron,
       (SELECT top FROM scripts) AS scripts, (SELECT top FROM tokens) AS tokens;
