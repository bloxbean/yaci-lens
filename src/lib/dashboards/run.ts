/*
 * Running a widget's SQL in the browser, against the published data.
 * Placeholders:
 *   {tip_date}   the newest day in the data, as a DATE literal (e.g. WHERE date > {tip_date} - 30)
 *   {tip_epoch}  the newest epoch, as a number
 *   {name}       a summary-pack file, e.g. FROM {daily} or FROM {script_daily}
 * Lake tables (transaction, block, …) are used by name as in the SQL lab.
 */
import { query, type Column, type QueryResult } from '$lib/lake/db';
import { lake, started, summaryUrl } from '$lib/lake/lake.svelte';
import type { Viz, VizType } from './store.svelte';

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
