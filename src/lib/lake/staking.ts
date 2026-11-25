/* Row shapes of the staking summaries (summary.sql: staking_daily, staking_epochs, drep_epochs). ADA as DOUBLE. */
export interface StakingDay {
	date: Date;
	stake_registrations: number;
	stake_deregistrations: number;
	delegations: number;
	vote_delegations: number;
	withdrawals: number;
	withdrawn_ada: number;
	pool_registrations: number;
	pool_updates: number;
	pool_retirements: number;
	drep_registrations: number;
	drep_updates: number;
	drep_retirements: number;
}

export interface StakingEpoch {
	epoch: number;
	member_rewards_ada: number | null;
	leader_rewards_ada: number | null;
	other_rewards_ada: number | null;
	rewarded_addresses: number | null;
	pools_with_stake: number | null;
	nakamoto: number | null;
	top10_share: number | null;
	top100_share: number | null;
}

export interface DRepEpoch {
	epoch: number;
	total_power_ada: number;
	drep_power_ada: number | null;
	abstain_ada: number | null;
	no_confidence_ada: number | null;
	dreps_with_power: number;
}
