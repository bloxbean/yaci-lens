/* Row shapes of the summary pack (yaci-lens-publisher/summary.sql). Amounts are ADA, not lovelace. */

export interface Epoch {
	epoch: number;
	start_time: Date;
	end_time: Date;
	blocks: number;
	txs: number;
	fees_ada: number;
	total_output_ada: number;
	treasury_ada: number | null;
	reserves_ada: number | null;
	circulation_ada: number | null;
	deposits_stake_ada: number | null;
	distributed_rewards_ada: number | null;
	active_stake_ada: number | null;
	delegators: number | null;
	pools: number | null;
}

export interface Daily {
	date: Date;
	epoch: number;
	blocks: number;
	txs: number;
	fees_ada: number;
	bytes: number;
	avg_block_bytes: number;
	script_txs: number;
	redeemers: number;
	metadata_txs: number;
	mint_events: number;
	burn_events: number;
}

export interface LatestBlock {
	number: number;
	hash: string;
	slot: number;
	epoch: number;
	epoch_slot: number;
	block_time: Date;
	no_of_txs: number;
	fees_ada: number;
	body_size: number;
	pool_hash: string;
	protocol_version: string;
}

export interface Pool {
	active_epoch: number;
	pool_hash: string;
	active_stake_ada: number;
	stake_share: number;
	delegators: number;
	pledge_ada: number | null;
	cost_ada: number | null;
	margin: number | null;
	metadata_url: string | null;
	reward_account: string | null;
	blocks_last_epoch: number;
}

export interface Proposal {
	tx_hash: string;
	idx: number;
	type: string;
	deposit_ada: number;
	proposed_epoch: number;
	block_time: Date;
	anchor_url: string | null;
	return_address: string | null;
	status: string | null;
	status_epoch: number | null;
	voting_stats: string | null;
	drep_yes: number;
	drep_no: number;
	drep_abstain: number;
	spo_yes: number;
	spo_no: number;
	spo_abstain: number;
	cc_yes: number;
	cc_no: number;
	cc_abstain: number;
	details: string | null;
}

export interface DRep {
	epoch: number;
	drep_hash: string;
	drep_id: string | null;
	drep_type: string;
	voting_power_ada: number;
	active_until: number | null;
	expiry: number | null;
	status: string | null;
}
