/*
 * The julc code forked from Yaci Viewer calls Yaci Store's REST API (tryApi('/scripts/<hash>/cbor'), ...).
 * Yaci Lens has no API: this module answers the same paths from the lake, so the forked code stays as it is.
 *
 * A path is answered only when it can be done with a few partition reads. The rest return null (tryApi) or throw
 * (api), and the julc features degrade the way they do against a store without that endpoint:
 *   /epochs/{n|latest}/parameters   epoch_param, one partition
 *   /genesis                        mainnet slot configuration (constants)
 *   /blocks/latest                  summary pack
 *   /scripts/{hash}[/cbor]          summary script_index -> one script partition
 *   /scripts/datum/{hash}/cbor      datums found while loading a transaction (lake/replay.ts)
 *   /governance/votes/txs/{tx}, /governance/proposals/{tx}, /blockfrost/txs/{tx}/stakes|delegations
 *                                   the transaction's day from the tx index, then one partition
 *   /txs/{tx}/cbor/hex              not in the lake (the replay rebuilds from JSON instead): null
 */
import { live, summary } from '$lib/lake/lake.svelte';
import type { LatestBlock } from '$lib/lake/types';
import { datumCache, txDay, txDays } from '$lib/lake/replay';
import { poolBech32 } from '$lib/cardano';

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public path: string,
		public timedOut = false
	) {
		super(message);
	}
}

export interface ApiOptions {
	fetch?: typeof fetch;
	params?: Record<string, string | number | boolean | null | undefined>;
	timeoutMs?: number;
	signal?: AbortSignal;
	body?: unknown;
}

export function apiBase(): string {
	return 'lake:';
}

const MAINNET_GENESIS = {
	network_magic: 764824073,
	system_start: '2017-09-23T21:44:51Z',
	shelley_start_time: 1596059091,
	slot_length: 1,
	epoch_length: 432000
};

const HEX56 = /^[0-9a-f]{56}$/;

async function resolve(path: string): Promise<unknown> {
	const p = path.replace(/\/+$/, '');
	let m: RegExpMatchArray | null;

	if ((m = p.match(/^\/epochs\/(latest|\d+)\/parameters$/))) {
		const where = m[1] === 'latest' ? `epoch = (SELECT max(epoch) FROM epoch_param)` : `epoch = ${Number(m[1])}`;
		const [row] = await live<{ epoch: number; params: string }>(`SELECT epoch, params FROM epoch_param WHERE ${where}`);
		if (!row) return null;
		const params = JSON.parse(row.params) as Record<string, unknown>;
		return { ...params, epoch: row.epoch, cost_models_raw: params.cost_models ?? null };
	}

	if (p === '/genesis') return MAINNET_GENESIS;

	if (p === '/blocks/latest') {
		const [b] = await summary<LatestBlock>('latest_blocks');
		return b ? { ...b, height: b.number } : null;
	}

	if ((m = p.match(/^\/scripts\/([0-9a-f]+)(\/cbor)?$/)) && HEX56.test(m[1])) {
		const hash = m[1];
		const [idx] = await summary<{ script_hash: string; date: Date; script_type: string }>('script_index', `WHERE script_hash = '${hash}'`);
		if (!idx) return null;
		if (!m[2]) return { script_hash: hash, type: idx.script_type };
		const day = idx.date.toISOString().slice(0, 10);
		const [row] = await live<{ content: string }>(`SELECT "content" FROM script WHERE date = DATE '${day}' AND script_hash = '${hash}' LIMIT 1`);
		if (!row) return null;
		try {
			const env = JSON.parse(row.content) as { content?: string };
			return { cbor: env.content ?? null };
		} catch {
			return { cbor: row.content };
		}
	}

	// Datums found while loading a transaction for replay (lake/replay.ts fills the cache).
	if ((m = p.match(/^\/scripts\/datum\/([0-9a-f]{64})\/cbor$/))) {
		const c = datumCache.get(m[1]);
		return c ? { cbor: c } : null;
	}

	// Transaction parts the replay asks for only when a script runs for them: one partition each, on the
	// transaction's day (known from the tx index once the transaction was loaded).
	if ((m = p.match(/^\/(governance\/votes\/txs|blockfrost\/txs|governance\/proposals)\/([0-9a-f]{64})(\/stakes|\/delegations)?$/))) {
		const h = m[2];
		const d = txDays.get(h) ?? (await txDay(h));
		if (!d) return null;
		const where = `date = DATE '${d}' AND tx_hash = '${h}'`;
		if (m[1] === 'governance/votes/txs')
			return live(`SELECT voter_type, voter_hash, gov_action_tx_hash, gov_action_index, vote FROM voting_procedure WHERE ${where} ORDER BY idx`);
		if (m[1] === 'governance/proposals') {
			const rows = await live<{ idx: number; type: string; deposit: number; return_address: string; details: string | null }>(
				`SELECT idx, type, deposit, return_address, details FROM gov_action_proposal WHERE ${where} ORDER BY idx`
			);
			return rows.map((r) => ({ index: r.idx, type: r.type, deposit: r.deposit, return_address: r.return_address, details: r.details ? JSON.parse(r.details) : null }));
		}
		if (m[3] === '/stakes') {
			const rows = await live<{ cert_index: number; type: string; address: string }>(`SELECT cert_index, type, address FROM stake_registration WHERE ${where} ORDER BY cert_index`);
			return rows.map((r) => ({ cert_index: r.cert_index, address: r.address, registration: r.type === 'STAKE_REGISTRATION' }));
		}
		if (m[3] === '/delegations') {
			const rows = await live<{ cert_index: number; address: string; pool_id: string }>(`SELECT cert_index, address, pool_id FROM delegation WHERE ${where} ORDER BY cert_index`);
			return rows.map((r) => ({ cert_index: r.cert_index, address: r.address, pool_id: poolBech32(r.pool_id) }));
		}
	}

	return undefined; // not available from the lake
}

export async function api<T>(path: string, _opts: ApiOptions = {}): Promise<T> {
	const r = await resolve(path);
	if (r === undefined || r === null) throw new ApiError(`Not available in Yaci Lens: ${path}`, 404, path);
	return r as T;
}

export async function tryApi<T>(path: string, opts: ApiOptions = {}): Promise<T | null> {
	try {
		return await api<T>(path, opts);
	} catch {
		return null;
	}
}
