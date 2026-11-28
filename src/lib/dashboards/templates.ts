/* Starter dashboards: copies the user can change. They read the summary pack, so they load in a second or two. */
import type { Param, Widget } from './store.svelte';

type Template = {
	id: string;
	name: string;
	description: string;
	widgets: Omit<Widget, 'id'>[];
	/** Inputs of the dashboard ({$name} in SQL, and lookups). */
	params?: Param[];
	/** Uses indexed lookups: offered only when they are on. */
	indexed?: boolean;
};

export const TEMPLATES: Template[] = [
	{
		id: 'network',
		name: 'Network pulse',
		description: 'Transactions, fees, smart-contract share and block size over the last 90 days.',
		widgets: [
			{ title: 'Transactions yesterday', width: 1, viz: { type: 'stat' }, sql: `SELECT txs, script_txs, fees_ada\nFROM {daily}\nWHERE date = {tip_date}` },
			{
				title: 'Smart-contract share',
				width: 1,
				viz: { type: 'area', format: 'percent' },
				sql: `SELECT date, script_txs / txs AS script_share\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date`
			},
			{ title: 'Fees per day', width: 1, viz: { type: 'bar', format: 'ada' }, sql: `SELECT date, fees_ada\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date` },
			{
				title: 'Transactions per day',
				width: 3,
				viz: { type: 'stacked' },
				sql: `SELECT date, script_txs AS smart_contract, txs - script_txs AS other\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date`
			},
			{ title: 'Average block size (bytes)', width: 2, viz: { type: 'line' }, sql: `SELECT date, avg_block_bytes\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date` },
			{
				title: 'Mints and burns, last 30 days',
				width: 1,
				viz: { type: 'split' },
				sql: `SELECT 'Mint events' AS kind, sum(mint_events) AS events FROM {daily} WHERE date > {tip_date} - 30\nUNION ALL\nSELECT 'Burn events', sum(burn_events) FROM {daily} WHERE date > {tip_date} - 30`
			}
		]
	},
	{
		id: 'defi',
		name: 'DeFi watch',
		description: 'Which dApps and scripts are busiest and what they cost.',
		widgets: [
			{
				title: 'Busiest dApps, last 30 days',
				width: 2,
				viz: { type: 'barlist' },
				sql: `SELECT n.project, sum(d.txs) AS txs\nFROM {script_daily} d JOIN {script_names} n USING (script_hash)\nWHERE d.date > {tip_date} - 30\nGROUP BY 1 ORDER BY txs DESC LIMIT 15`
			},
			{
				title: 'Plutus versions, last 30 days',
				width: 1,
				viz: { type: 'split' },
				sql: `SELECT 'Plutus V' || script_type AS version, sum(txs) AS executions\nFROM {script_daily}\nWHERE date > {tip_date} - 30 AND script_type IS NOT NULL\nGROUP BY 1 ORDER BY 1`
			},
			{
				title: 'Fees of smart-contract transactions per day',
				width: 1,
				viz: { type: 'bar', format: 'ada' },
				sql: `SELECT date, fees_ada * script_txs / txs AS script_fees_ada\nFROM {daily}\nWHERE date > {tip_date} - 90\nORDER BY date`,
				note: 'Estimated: the day\'s fees in proportion to its smart-contract transactions.'
			},
			{
				title: 'Most expensive scripts (CPU steps per tx), last 30 days',
				width: 2,
				viz: { type: 'table' },
				sql: `SELECT coalesce(n.label, left(d.script_hash, 12)) AS script, round(sum(d.steps) / sum(d.txs) / 1e6, 1) AS m_steps_per_tx, sum(d.txs) AS txs\nFROM {script_daily} d LEFT JOIN {script_names} n USING (script_hash)\nWHERE d.date > {tip_date} - 30\nGROUP BY 1 HAVING sum(d.txs) >= 100\nORDER BY 2 DESC LIMIT 15`
			},
			{
				title: 'Minswap vs SundaeSwap vs WingRiders (weekly)',
				width: 3,
				viz: { type: 'line' },
				sql: `SELECT date_trunc('week', d.date) AS week,\n  sum(d.txs) FILTER (WHERE n.project = 'Minswap') AS minswap,\n  sum(d.txs) FILTER (WHERE n.project = 'SundaeSwap') AS sundaeswap,\n  sum(d.txs) FILTER (WHERE n.project = 'WingRiders') AS wingriders\nFROM {script_daily} d JOIN {script_names} n USING (script_hash)\nWHERE d.date > {tip_date} - 365\nGROUP BY 1 ORDER BY 1`
			}
		]
	},
	{
		id: 'governance',
		name: 'Governance',
		description: 'DRep power, participation and how proposals fare.',
		widgets: [
			{
				title: 'Vote-delegated stake (ADA)',
				width: 2,
				viz: { type: 'stacked', format: 'ada' },
				sql: `SELECT epoch, drep_power_ada AS registered_dreps, abstain_ada AS always_abstain, no_confidence_ada AS no_confidence\nFROM {drep_epochs}\nORDER BY epoch`
			},
			{
				title: 'Proposals by status',
				width: 1,
				viz: { type: 'split' },
				sql: `SELECT status, count(*) AS proposals\nFROM {governance}\nGROUP BY 1 ORDER BY 2 DESC`
			},
			{
				title: 'Biggest DReps',
				width: 1,
				viz: { type: 'barlist', format: 'ada' },
				sql: `SELECT coalesce(m.given_name, left(d.drep_id, 16)) AS drep, d.voting_power_ada\nFROM {dreps} d LEFT JOIN {drep_meta} m USING (drep_hash)\nWHERE d.drep_id IS NOT NULL\nORDER BY 2 DESC LIMIT 15`
			},
			{
				title: 'Votes per epoch by role',
				width: 2,
				viz: { type: 'stacked' },
				sql: `SELECT epoch,\n  count(*) FILTER (WHERE voter_type LIKE 'DREP%') AS dreps,\n  count(*) FILTER (WHERE voter_type LIKE 'STAKING%') AS spos,\n  count(*) FILTER (WHERE voter_type LIKE 'CONST%') AS committee\nFROM {votes}\nGROUP BY 1 ORDER BY 1`
			},
			{
				title: 'Treasury withdrawals requested (ADA)',
				width: 3,
				viz: { type: 'table' },
				sql: `SELECT g.proposed_epoch AS epoch, coalesce(a.title, left(g.tx_hash, 12)) AS proposal, g.status, g.drep_yes, g.drep_no\nFROM {governance} g LEFT JOIN {action_meta} a USING (tx_hash, idx)\nWHERE g.type = 'TREASURY_WITHDRAWALS_ACTION'\nORDER BY g.proposed_epoch DESC LIMIT 30`
			}
		]
	},
	{
		id: 'live',
		name: 'Yesterday, from the lake',
		description: 'Live queries on the newest day of raw tables (one partition each).',
		widgets: [
			{
				title: 'Biggest transactions by output, newest day',
				width: 2,
				viz: { type: 'table' },
				sql: `SELECT tx_hash, sum(quantity) FILTER (WHERE asset_unit = 'lovelace') / 1e6 AS output_ada, count(DISTINCT output_index) AS outputs\nFROM address_utxo\nWHERE date = {tip_date}\nGROUP BY 1 ORDER BY 2 DESC LIMIT 15`
			},
			{
				title: 'Transactions per hour (UTC)',
				width: 1,
				viz: { type: 'bar' },
				sql: `SELECT hour(block_time) AS hour, count(*) AS txs\nFROM transaction\nWHERE date = {tip_date}\nGROUP BY 1 ORDER BY 1`
			},
			{
				title: 'Metadata labels used',
				width: 1,
				viz: { type: 'barlist' },
				sql: `SELECT label, count(*) AS txs\nFROM transaction_metadata\nWHERE date = {tip_date}\nGROUP BY 1 ORDER BY 2 DESC LIMIT 12`
			},
			{
				title: 'Blocks per pool, newest day',
				width: 2,
				viz: { type: 'barlist' },
				sql: `SELECT coalesce(p.ticker, left(b.slot_leader, 12)) AS pool, count(*) AS blocks\nFROM block b LEFT JOIN {pool_meta} p ON p.pool_hash = b.slot_leader\nWHERE b.date = {tip_date}\nGROUP BY 1 ORDER BY 2 DESC LIMIT 20`
			}
		]
	},
	{
		id: 'wallet',
		name: 'My wallet',
		description: 'Balance, balance over time, rewards, flows, tokens, delegation and latest transactions of a stake address (indexed lookups).',
		indexed: true,
		params: [{ name: 'stake', kind: 'stake', value: '' }],
		widgets: [
			{ title: 'Balance', width: 1, viz: { type: 'stat', format: 'ada' }, sql: '', lookup: { kind: 'wallet-balance', param: 'stake' }, note: 'ADA in its addresses at the published tip; rewards not included.' },
			{ title: 'Balance over time', width: 2, viz: { type: 'area', format: 'ada' }, sql: '', lookup: { kind: 'wallet-history', param: 'stake' } },
			{ title: 'Rewards per epoch', width: 2, viz: { type: 'stacked', format: 'ada' }, sql: '', lookup: { kind: 'rewards', param: 'stake' } },
			{ title: 'Received and sent per month', width: 1, viz: { type: 'bar', format: 'ada' }, sql: '', lookup: { kind: 'wallet-flows', param: 'stake' } },
			{ title: 'Tokens held', width: 1, viz: { type: 'table' }, sql: '', lookup: { kind: 'tokens-held', param: 'stake' } },
			{ title: 'Delegation history', width: 1, viz: { type: 'table' }, sql: '', lookup: { kind: 'delegation', param: 'stake' } },
			{ title: 'Unspent outputs', width: 1, viz: { type: 'table' }, sql: '', lookup: { kind: 'utxos', param: 'stake' } },
			{ title: 'Latest transactions', width: 3, viz: { type: 'table' }, sql: '', lookup: { kind: 'wallet-activity', param: 'stake' } }
		]
	},
	{
		id: 'pool',
		name: 'Pool operator',
		description: "A stake pool over time: stake, delegators, blocks vs expected, members' return, joins and leaves, parameter changes.",
		params: [{ name: 'pool', kind: 'pool', value: '' }],
		widgets: [
			{ title: 'Lifetime', width: 1, viz: { type: 'stat' }, sql: `SELECT count(*) AS epochs, sum(blocks) AS blocks, round(sum(member_rewards_ada)) AS member_rewards_ada\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND epoch <= {tip_epoch}` },
			{ title: 'Active stake', width: 2, viz: { type: 'area', format: 'ada' }, sql: `SELECT epoch, stake_ada\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND epoch <= {tip_epoch}\nORDER BY epoch` },
			{ title: 'Blocks made vs expected, last 50 epochs', width: 2, viz: { type: 'bar' }, sql: `SELECT epoch, blocks, round(expected_blocks, 1) AS expected\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND epoch <= {tip_epoch}\nORDER BY epoch DESC LIMIT 50` },
			{ title: "Members' return (annualised)", width: 1, viz: { type: 'line', format: 'percent' }, sql: `SELECT epoch, member_roa\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND member_roa IS NOT NULL\nORDER BY epoch` },
			{ title: 'Delegators', width: 1, viz: { type: 'line' }, sql: `SELECT epoch, delegators\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND epoch <= {tip_epoch}\nORDER BY epoch` },
			{ title: 'Stake keys joining and leaving', width: 2, viz: { type: 'bar' }, sql: `SELECT epoch, joins, leaves\nFROM {pool_epochs}\nWHERE pool_hash = {$pool} AND epoch <= {tip_epoch}\nORDER BY epoch DESC LIMIT 60` },
			{ title: 'Parameter changes', width: 3, viz: { type: 'table' }, sql: `SELECT block_time, kind, pledge_ada, margin, cost_ada, retiring_epoch\nFROM {pool_updates}\nWHERE pool_hash = {$pool}\nORDER BY slot DESC` },
			{ title: 'Latest delegators joining and leaving', width: 3, viz: { type: 'table' }, sql: '', lookup: { kind: 'pool-events', param: 'pool' }, note: 'Indexed lookup.' }
		]
	},
	{
		id: 'dapp',
		name: 'dApp and token',
		description: 'A smart contract (value locked, transactions, fees) and a token (largest holders), with indexed lookups.',
		indexed: true,
		params: [
			{ name: 'script', kind: 'script', value: 'a65ca58a4e9c755fa830173d2a5caed458ac0c73f97db7faae2e7e3b' },
			{ name: 'token', kind: 'unit', value: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59' }
		],
		widgets: [
			{ title: 'Value locked at the script', width: 2, viz: { type: 'area', format: 'ada' }, sql: '', lookup: { kind: 'script-tvl', param: 'script' } },
			{ title: 'Largest token holders', width: 1, viz: { type: 'barlist', format: 'percent' }, sql: '', lookup: { kind: 'holders', param: 'token' } },
			{ title: 'Script transactions per day', width: 2, viz: { type: 'stacked' }, sql: `SELECT date, txs - failed_txs AS ok, failed_txs AS failed\nFROM {script_daily}\nWHERE script_hash = {$script} AND date > {tip_date} - 180\nORDER BY date` },
			{ title: 'Fees paid per day', width: 1, viz: { type: 'line', format: 'ada' }, sql: `SELECT date, fees_ada\nFROM {script_daily}\nWHERE script_hash = {$script} AND date > {tip_date} - 180\nORDER BY date` }
		]
	}
];
