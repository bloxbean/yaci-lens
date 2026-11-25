import { summaryUrl } from './lake.svelte';

/*
 * Starter queries for the SQL lab. Built from the published tip so they always hit data that exists.
 * Rule of thumb they demonstrate: filter by `date` or `epoch` (the partition columns) to read a few files,
 * and use the summary pack for anything over all of history.
 */
export interface Example {
	title: string;
	group: 'Summary' | 'Blocks & transactions' | 'Staking' | 'Governance' | 'Tokens & scripts' | 'Lake';
	sql: string;
}

export function examples(tip: { date: Date; epoch: number }): Example[] {
	const d = tip.date.toISOString().slice(0, 10);
	const week = new Date(tip.date.getTime() - 6 * 86400_000).toISOString().slice(0, 10);
	const e = tip.epoch;
	const s = (name: string) => `'${summaryUrl(name)}'`;
	return [
		{
			group: 'Summary',
			title: 'Transactions and fees per day, last 30 days',
			sql: `SELECT date, txs, round(fees_ada) AS fees_ada, script_txs, metadata_txs
FROM ${s('daily')}
ORDER BY date DESC
LIMIT 30`
		},
		{
			group: 'Summary',
			title: 'Treasury, reserves and active stake per epoch',
			sql: `SELECT epoch, round(treasury_ada / 1e6, 2) AS treasury_m_ada,
       round(reserves_ada / 1e9, 3) AS reserves_bn_ada,
       round(active_stake_ada / 1e9, 2) AS active_stake_bn_ada, pools, delegators
FROM ${s('epochs')}
ORDER BY epoch DESC`
		},
		{
			group: 'Blocks & transactions',
			title: `Biggest fees on ${d}`,
			sql: `SELECT tx_hash, block, fee / 1e6 AS fee_ada, json_array_length(inputs) AS inputs, json_array_length(outputs) AS outputs
FROM transaction
WHERE date = DATE '${d}'
ORDER BY fee DESC
LIMIT 20`
		},
		{
			group: 'Blocks & transactions',
			title: `Blocks per hour on ${d}`,
			sql: `SELECT date_trunc('hour', block_time AT TIME ZONE 'UTC') AS hour_utc, count(*) AS blocks, sum(no_of_txs) AS txs
FROM block
WHERE date = DATE '${d}'
GROUP BY 1 ORDER BY 1`
		},
		{
			group: 'Staking',
			title: `Top pools by active stake in epoch ${e}`,
			sql: `-- epoch_stake.epoch is the snapshot epoch; that stake is active two epochs later
SELECT pool_id, count(*) AS delegators, round(sum(amount) / 1e6) AS stake_ada
FROM epoch_stake
WHERE epoch = ${e - 2}
GROUP BY 1
ORDER BY stake_ada DESC
LIMIT 20`
		},
		{
			group: 'Staking',
			title: `Rewards paid for epoch ${e - 2}, by type`,
			sql: `SELECT type, count(*) AS rewards, round(sum(amount) / 1e6) AS ada
FROM reward
WHERE epoch = ${e - 2}
GROUP BY 1 ORDER BY ada DESC`
		},
		{
			group: 'Staking',
			title: `Blocks per pool in epoch ${e - 1}`,
			sql: `SELECT slot_leader AS pool_hash, count(*) AS blocks
FROM block
WHERE epoch = ${e - 1}
GROUP BY 1 ORDER BY blocks DESC
LIMIT 25`
		},
		{
			group: 'Governance',
			title: 'Governance actions with vote counts',
			sql: `SELECT type, status, proposed_epoch, drep_yes, drep_no, spo_yes, spo_no, cc_yes, cc_no, anchor_url
FROM ${s('governance')}
ORDER BY proposed_epoch DESC`
		},
		{
			group: 'Governance',
			title: 'Top DReps by voting power',
			sql: `SELECT coalesce(drep_id, drep_type) AS drep, drep_type, round(voting_power_ada / 1e6, 2) AS voting_power_m_ada, status
FROM ${s('dreps')}
ORDER BY voting_power_ada DESC
LIMIT 25`
		},
		{
			group: 'Tokens & scripts',
			title: `Script executions by Plutus version on ${d}`,
			sql: `SELECT CASE script_type WHEN 1 THEN 'V1' WHEN 2 THEN 'V2' WHEN 3 THEN 'V3' ELSE script_type::VARCHAR END AS plutus,
       purpose, count(*) AS redeemers, count(DISTINCT script_hash) AS scripts, sum(unit_steps) AS cpu_steps
FROM transaction_scripts
WHERE date = DATE '${d}'
GROUP BY ALL ORDER BY redeemers DESC`
		},
		{
			group: 'Tokens & scripts',
			title: `Most active minting policies, ${week} to ${d}`,
			sql: `SELECT policy, count(*) AS mint_events, count(DISTINCT asset_name) AS assets, sum(quantity) AS net_quantity
FROM assets
WHERE date BETWEEN DATE '${week}' AND DATE '${d}'
GROUP BY 1 ORDER BY mint_events DESC
LIMIT 20`
		},
		{
			group: 'Tokens & scripts',
			title: `Metadata labels on ${d}`,
			sql: `SELECT label, count(*) AS entries
FROM transaction_metadata
WHERE date = DATE '${d}'
GROUP BY 1 ORDER BY entries DESC
LIMIT 20`
		},
		{
			group: 'Lake',
			title: 'Tables, rows, files and size',
			sql: `SELECT t.table_name, s.record_count AS rows, round(s.file_size_bytes / 1e9, 2) AS gb,
       (SELECT count(*) FROM lake_meta.ducklake_data_file f WHERE f.table_id = t.table_id AND f.end_snapshot IS NULL) AS files
FROM lake_meta.ducklake_table t JOIN lake_meta.ducklake_table_stats s USING (table_id)
WHERE t.end_snapshot IS NULL
ORDER BY s.file_size_bytes DESC`
		},
		{
			group: 'Lake',
			title: 'How a query prunes files (EXPLAIN ANALYZE)',
			sql: `EXPLAIN ANALYZE
SELECT count(*) FROM block WHERE epoch = ${e - 1}`
		}
	];
}
