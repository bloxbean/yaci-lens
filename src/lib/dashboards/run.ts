/*
 * Running a widget's SQL in the browser, against the published data.
 * Placeholders:
 *   {tip_date}   the newest day in the data, as a DATE literal (e.g. WHERE date > {tip_date} - 30)
 *   {tip_epoch}  the newest epoch, as a number
 *   {name}       a summary-pack file, e.g. FROM {daily} or FROM {script_daily}
 *   {$name}      a dashboard parameter, as a SQL string literal (pool: its hex hash), e.g. WHERE pool_hash = {$pool}
 * Lake tables (transaction, block, …) are used by name as in the SQL lab.
 * Widgets with a `lookup` read the SQLite indexes instead (experimental indexed lookups), see runLookup.
 */
import { query, type Column, type QueryResult } from '$lib/lake/db';
import { lake, started, summaryUrl } from '$lib/lake/lake.svelte';
import type { Lookup, LookupKind, Param, ParamKind, Viz, VizType, Widget } from './store.svelte';
import { sqlString } from '$lib/lake/db';
import { poolHash } from '$lib/cardano';

export const MAX_ROWS = 5000;

export async function expand(sql: string): Promise<string> {
	await started();
	await waitTip();
	return expandNow(sql);
}

/** The SQL with placeholders filled from what is known now (for links to the SQL lab). */
export function expandNow(sql: string): string {
	const tip = lake.tip;
	const date = tip?.date ? new Date(tip.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
	return sql
		.replace(/\{tip_date\}/g, `DATE '${date}'`)
		.replace(/\{tip_epoch\}/g, String(tip?.epoch ?? 0))
		.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, n: string) => `read_parquet('${summaryUrl(n)}')`);
}

async function waitTip() {
	for (let i = 0; i < 50 && !lake.tip; i++) await new Promise((r) => setTimeout(r, 100));
}

export async function runSql(sql: string): Promise<QueryResult> {
	return query(await expand(sql), MAX_ROWS);
}

export const isNumeric = (c: Column) => c.kind === 'number' || c.kind === 'bigint' || c.kind === 'decimal';
export const isTime = (c: Column) => c.kind === 'date' || c.kind === 'time';

export function num(v: unknown): number {
	if (v == null) return NaN;
	if (typeof v === 'number') return v;
	if (typeof v === 'bigint') return Number(v);
	if (typeof v === 'string') return Number(v);
	return NaN;
}

export function label(v: unknown, c?: Column): string {
	if (v == null) return '—';
	if (v instanceof Date) {
		const iso = v.toISOString();
		return c?.kind === 'time' && !iso.endsWith('T00:00:00.000Z') ? iso.replace('T', ' ').slice(0, 16) : iso.slice(0, 10);
	}
	return String(v);
}

/** A reasonable chart for a result: a single number is a stat; time + numbers a line; text + number a ranked list. */
export function suggest(r: QueryResult): VizType {
	const cols = r.columns;
	if (!cols.length || !r.rows.length) return 'table';
	const nums = cols.filter(isNumeric);
	if (r.rows.length === 1 && nums.length >= 1 && cols.length <= 3) return 'stat';
	const first = cols[0];
	const seriesLike = isTime(first) || /^(epoch|date|day|week|month|year|block|slot)$/i.test(first.name);
	if (seriesLike && nums.filter((c) => c !== first).length >= 1) return r.rows.length > 60 ? 'area' : 'bar';
	if (!isNumeric(first) && nums.length >= 1 && r.rows.length <= 50) return r.rows.length <= 7 ? 'split' : 'barlist';
	return 'table';
}

/** Resolved columns for a chart: x (or label) and value columns. */
export function axes(r: QueryResult, viz: Viz, all = false): { x: number; ys: number[] } {
	const idx = (n: string | null | undefined) => (n ? r.columns.findIndex((c) => c.name === n) : -1);
	let x = idx(viz.x);
	if (x < 0) x = 0;
	let ys = (viz.y ?? []).map(idx).filter((i) => i >= 0 && i !== x);
	if (!ys.length) ys = r.columns.map((c, i) => ((all || i !== x) && isNumeric(c) ? i : -1)).filter((i) => i >= 0);
	return { x, ys: ys.slice(0, 7) };
}

// ---- parameters ---------------------------------------------------------------------------------------------------

export const PARAM_KINDS: { kind: ParamKind; label: string; hint: string }[] = [
	{ kind: 'stake', label: 'Stake address', hint: 'stake1…' },
	{ kind: 'address', label: 'Address', hint: 'addr1… or a Byron address' },
	{ kind: 'pool', label: 'Pool', hint: 'pool1… or the 56-hex hash' },
	{ kind: 'script', label: 'Script hash', hint: '56 hex characters' },
	{ kind: 'unit', label: 'Asset unit', hint: 'policy id + asset name, hex' },
	{ kind: 'drep', label: 'DRep id', hint: 'drep1…' }
];

const PATTERNS: Record<ParamKind, RegExp> = {
	stake: /^stake(_test)?1[0-9a-z]{20,120}$/,
	address: /^(addr(_test)?1[0-9a-z]{20,200}|[1-9A-HJ-NP-Za-km-z]{50,130})$/,
	pool: /^(pool1[0-9a-z]{20,80}|[0-9a-f]{56})$/,
	script: /^[0-9a-f]{56}$/,
	unit: /^[0-9a-f]{56,120}$/,
	drep: /^drep1[0-9a-z]{20,120}$/
};

/** The value a parameter stands for (pool ids become their hex hash), or null when it is not valid. */
export function paramValue(p: Param | undefined): string | null {
	if (!p) return null;
	const v = p.value.trim();
	if (!PATTERNS[p.kind]?.test(v)) return null;
	return p.kind === 'pool' ? (poolHash(v) ?? null) : v;
}

/** The SQL with {$name} parameters filled in as string literals; fails on a missing or invalid value. */
export function expandParams(sql: string, params: Param[] = []): string {
	return sql.replace(/\{\$([a-z][a-z0-9_]*)\}/g, (_, n: string) => {
		const p = params.find((x) => x.name === n);
		const v = paramValue(p);
		if (v == null) throw new Error(p ? `the parameter "${n}" is not a valid ${p.kind}` : `this dashboard has no parameter "${n}"`);
		return sqlString(v);
	});
}

/** Runs a widget: its lookup, or its SQL with the dashboard's parameters. */
export function runWidget(w: Pick<Widget, 'sql' | 'lookup'>, params: Param[] = []): Promise<QueryResult> {
	if (w.lookup) {
		const p = params.find((x) => x.name === w.lookup!.param);
		const v = paramValue(p);
		if (!p || v == null) return Promise.reject(new Error(`set the dashboard's "${w.lookup.param}" parameter`));
		return runLookup(w.lookup, p.kind, v);
	}
	try {
		return runSql(expandParams(w.sql, params));
	} catch (e) {
		return Promise.reject(e);
	}
}

/** A stable cache key for a widget run with these parameters. */
export function runKey(w: Pick<Widget, 'sql' | 'lookup'>, params: Param[] = []): string {
	if (w.lookup) return `lookup|${w.lookup.kind}|${paramValue(params.find((x) => x.name === w.lookup!.param)) ?? ''}`;
	try {
		return expandParams(w.sql, params);
	} catch {
		return `invalid|${w.sql}`;
	}
}

// ---- lookups (SQLite indexes) -------------------------------------------------------------------------------------

export const LOOKUPS: { kind: LookupKind; label: string; for: ParamKind[]; viz: VizType }[] = [
	{ kind: 'wallet-balance', label: 'Balance and totals', for: ['stake', 'address'], viz: 'stat' },
	{ kind: 'wallet-history', label: 'Balance over time (monthly)', for: ['stake', 'address'], viz: 'area' },
	{ kind: 'wallet-flows', label: 'Received and sent per month', for: ['stake', 'address'], viz: 'bar' },
	{ kind: 'wallet-activity', label: 'Latest transactions', for: ['stake', 'address'], viz: 'table' },
	{ kind: 'tokens-held', label: 'Native assets held', for: ['stake', 'address'], viz: 'table' },
	{ kind: 'utxos', label: 'Unspent outputs', for: ['stake', 'address'], viz: 'table' },
	{ kind: 'rewards', label: 'Rewards per epoch', for: ['stake'], viz: 'stacked' },
	{ kind: 'delegation', label: 'Delegation history', for: ['stake'], viz: 'table' },
	{ kind: 'pool-events', label: 'Delegators joining and leaving', for: ['pool', 'drep'], viz: 'table' },
	{ kind: 'holders', label: 'Largest holders', for: ['unit'], viz: 'barlist' },
	{ kind: 'script-tvl', label: 'Value locked over time', for: ['script'], viz: 'area' }
];

const col = (name: string, kind: Column['kind']): Column => ({ name, type: kind, kind });
const ok = (columns: Column[], rows: unknown[][], t0: number): QueryResult => ({ columns, rows, truncated: false, ms: Math.round(performance.now() - t0) });

export async function runLookup(l: Lookup, kind: ParamKind, value: string): Promise<QueryResult> {
	const s = await import('$lib/indexdb/service');
	if (!(await s.indexAvailable())) throw new Error('indexed lookups are not available here');
	const t0 = performance.now();
	const day = (slot: number) => new Date(s.slotTime(slot).toISOString().slice(0, 10));
	const monthDate = (m: number) => new Date(Date.UTC(Math.floor(m / 100), (m % 100) - 1, 1));
	const stake = kind === 'stake';
	const summary = () => (stake ? s.getStakeSummary(s.stakeCredential(value)!) : s.getAddressSummary(value));
	switch (l.kind) {
		case 'wallet-balance': {
			const w = (await summary()).data;
			return ok([col('balance_ada', 'number'), col('received_ada', 'number'), col('sent_ada', 'number'), col('transactions', 'number')], [[w.balance / 1e6, w.recv / 1e6, w.sent / 1e6, w.txs]], t0);
		}
		case 'wallet-history': {
			const w = (await summary()).data;
			let run = 0;
			return ok([col('month', 'date'), col('balance_ada', 'number')], w.months.map((m) => [monthDate(m.month), (run += m.recv - m.sent) / 1e6]), t0);
		}
		case 'wallet-flows': {
			const w = (await summary()).data;
			return ok([col('month', 'date'), col('received_ada', 'number'), col('sent_ada', 'number')], w.months.map((m) => [monthDate(m.month), m.recv / 1e6, m.sent / 1e6]), t0);
		}
		case 'wallet-activity': {
			const r = stake ? await s.getStakeActivity(s.stakeCredential(value)!, null, 25) : await s.getAddressActivity(value, null, 25);
			return ok([col('time', 'time'), col('tx', 'text'), col('received_ada', 'number'), col('sent_ada', 'number')], r.data.rows.map((a) => [s.slotTime(a.slot), a.tx, a.recv / 1e6, a.sent / 1e6]), t0);
		}
		case 'tokens-held': {
			const holder = stake ? value : value;
			const r = await s.getTokensHeld(holder);
			return ok([col('unit', 'text'), col('quantity', 'text'), col('utxos', 'number')], r.data.map((h) => [h.unit, h.qty, h.utxos]), t0);
		}
		case 'utxos': {
			const r = await s.getUtxos(value, null, 100);
			return ok([col('created', 'time'), col('output', 'text'), col('ada', 'number'), col('assets', 'number')], r.data.rows.map((u) => [s.slotTime(u.slot), `${u.tx}#${u.idx}`, u.lovelace / 1e6, u.assets]), t0);
		}
		case 'rewards': {
			const r = await s.getRewards(value);
			return ok([col('epoch', 'text'), col('member_ada', 'number'), col('leader_ada', 'number')], r.data.rewards.map((x) => [String(x.epoch), x.member / 1e6, x.leader / 1e6]), t0);
		}
		case 'delegation': {
			const r = await s.getStakeEvents(s.stakeCredential(value)!, 100);
			return ok([col('date', 'date'), col('kind', 'text'), col('target', 'text')], r.data.map((e) => [day(e.slot), e.kind, e.target ?? '']), t0);
		}
		case 'pool-events': {
			const r = kind === 'drep' ? await s.getDrepEvents(value, null, 100) : await s.getPoolEvents(value, null, 100);
			return ok([col('date', 'date'), col('event', 'text'), col('stake_address', 'text'), col('other', 'text')], r.data.rows.map((e) => [day(e.slot), e.kind, e.stake, e.other ?? '']), t0);
		}
		case 'holders': {
			const r = await s.getAssetHolders(value, 0, 25);
			const total = Number(r.data.total ?? 0) || 1;
			return ok([col('holder', 'text'), col('share', 'number')], r.data.holders.map((h) => [h.holder, Number(h.qty) / total]), t0);
		}
		case 'script-tvl': {
			const r = await s.getScriptDays(value);
			let run = 0;
			return ok([col('date', 'date'), col('locked_ada', 'number')], r.data.map((d) => [new Date(d.date), (run += d.adaIn - d.adaOut) / 1e6]), t0);
		}
	}
}
