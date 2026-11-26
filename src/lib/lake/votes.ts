/*
 * Governance votes and DRep voting power from the summary pack (votes.parquet: every vote; drep_power.parquet: each
 * DRep's power per epoch). Both are small (a few MB), so they are loaded once and analysed in the browser.
 * A voter may vote again on the same action: only the latest vote (by slot) counts.
 */
import { summary } from './lake.svelte';
import type { Proposal } from './types';

export type Role = 'DRep' | 'SPO' | 'CC';
export type VoteValue = 'YES' | 'NO' | 'ABSTAIN';

export interface Vote {
	tx_hash: string;
	voter_type: string;
	voter_hash: string;
	gov_action_tx_hash: string;
	gov_action_index: number;
	vote: VoteValue;
	anchor_url: string | null;
	epoch: number;
	slot: number;
	block_time: Date;
	date: Date;
}

export interface PowerRow {
	epoch: number;
	drep_hash: string;
	drep_type: string;
	power_ada: number;
}

export const roleOf = (voterType: string): Role => (voterType.startsWith('DREP') ? 'DRep' : voterType.startsWith('STAKING_POOL') ? 'SPO' : 'CC');
export const actionKey = (tx: string, idx: number) => `${tx}#${idx}`;
export const voteKey = (v: Vote) => actionKey(v.gov_action_tx_hash, v.gov_action_index);

let latest: Promise<Vote[]> | null = null;
/** The vote that counts for each (voter, action): the latest. */
export function latestVotes(): Promise<Vote[]> {
	latest ??= summary<Vote>('votes').then((all) => {
		const by = new Map<string, Vote>();
		for (const v of all) {
			const k = `${v.voter_type}|${v.voter_hash}|${voteKey(v)}`;
			const prev = by.get(k);
			if (!prev || Number(v.slot) >= Number(prev.slot)) by.set(k, v);
		}
		return [...by.values()];
	});
	latest.catch(() => (latest = null));
	return latest;
}

export const allVotes = () => summary<Vote>('votes');

let power: Promise<{ rows: PowerRow[]; byEpoch: Map<number, Map<string, number>>; epochs: number[] }> | null = null;
/** DRep power per epoch, indexed. */
export function drepPower() {
	power ??= summary<PowerRow>('drep_power').then((rows) => {
		const byEpoch = new Map<number, Map<string, number>>();
		for (const r of rows) (byEpoch.get(r.epoch) ?? byEpoch.set(r.epoch, new Map()).get(r.epoch)!).set(r.drep_hash, r.power_ada);
		return { rows, byEpoch, epochs: [...byEpoch.keys()].sort((a, b) => a - b) };
	});
	power.catch(() => (power = null));
	return power;
}

/** A DRep's power in an epoch, or in the nearest earlier epoch with a distribution. */
export function powerAt(p: { byEpoch: Map<number, Map<string, number>>; epochs: number[] }, hash: string, epoch: number): number {
	for (let i = p.epochs.length - 1; i >= 0; i--) {
		if (p.epochs[i] <= epoch) return p.byEpoch.get(p.epochs[i])?.get(hash) ?? 0;
	}
	return 0;
}

export interface Tally {
	yes: number;
	no: number;
	abstain: number;
}
export const emptyTally = (): Tally => ({ yes: 0, no: 0, abstain: 0 });
export function add(t: Tally, v: VoteValue, w = 1) {
	if (v === 'YES') t.yes += w;
	else if (v === 'NO') t.no += w;
	else t.abstain += w;
}

/** The majority of yes/no (abstain ignored); null on a tie or no votes. */
export function majority(t: Tally): 'YES' | 'NO' | null {
	return t.yes > t.no ? 'YES' : t.no > t.yes ? 'NO' : null;
}

/** Whether a proposal passed (ratified or enacted). */
export const passed = (p: Proposal | undefined) => p?.status === 'RATIFIED' || p?.status === 'ENACTED';

export const proposals = () => summary<Proposal>('governance');
