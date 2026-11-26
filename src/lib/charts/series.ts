/*
 * Shared chart helpers. Series colours come from the --s1…--s7 tokens (validated per theme), assigned by a series'
 * position in a fixed list, never by rank: a series keeps its colour when others are filtered out.
 */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
export const OTHER = 'rgb(var(--c-faint))';

export const seriesColor = (i: number) => (i < SERIES.length ? SERIES[i] : OTHER);

/** Status colours (used only with a text label next to them). */
export const STATUS = { yes: 'rgb(var(--c-mint))', no: 'rgb(var(--c-danger))', abstain: 'rgb(var(--c-faint))', warn: 'rgb(var(--c-amber))' };

/** Compact numbers for axes and tooltips: 1.2k, 3.4M, 5.6B. */
export function short(v: number, digits = 1): string {
	if (!Number.isFinite(v)) return '—';
	const a = Math.abs(v);
	if (a >= 1e12) return (v / 1e12).toFixed(digits) + 'T';
	if (a >= 1e9) return (v / 1e9).toFixed(digits) + 'B';
	if (a >= 1e6) return (v / 1e6).toFixed(digits) + 'M';
	if (a >= 1e4) return (v / 1e3).toFixed(digits) + 'k';
	if (a >= 100 || Number.isInteger(v)) return Math.round(v).toLocaleString('en-US');
	return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** A "nice" axis maximum at or above v (1, 2, 2.5, 5 × 10^n). */
export function niceMax(v: number): number {
	if (!(v > 0)) return 1;
	const p = 10 ** Math.floor(Math.log10(v));
	for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
	return 10 * p;
}

export const pct = (v: number, digits = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : '—');

/**
 * Group daily rows into weeks or months when a range is long, so bars stay readable: up to ~120 days stay daily,
 * up to ~2 years become weeks (Monday), longer become months. Values are summed.
 */
export function bucket<T extends { date: Date | string }>(rows: T[], keys: (keyof T)[], days: number | null): { label: string; values: Record<string, number> }[] {
	const span = days ?? (rows.length ? (Date.parse(String(new Date(rows[rows.length - 1].date).toISOString())) - Date.parse(new Date(rows[0].date).toISOString())) / 86_400_000 : 0);
	const unit = span <= 120 ? 'day' : span <= 730 ? 'week' : 'month';
	const out = new Map<string, Record<string, number>>();
	for (const r of rows) {
		const d = new Date(r.date);
		let label: string;
		if (unit === 'day') label = d.toISOString().slice(0, 10);
		else if (unit === 'month') label = d.toISOString().slice(0, 7);
		else {
			const m = new Date(d);
			m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7));
			label = `wk ${m.toISOString().slice(0, 10)}`;
		}
		const acc = out.get(label) ?? Object.fromEntries(keys.map((k) => [k as string, 0]));
		for (const k of keys) acc[k as string] += Number(r[k]) || 0;
		out.set(label, acc);
	}
	return [...out].map(([label, values]) => ({ label, values }));
}

/** ISO day `days` before `tip` (for WHERE date > …). */
export const since = (tip: Date | string, days: number) => new Date(Date.parse(new Date(tip).toISOString().slice(0, 10)) - days * 86_400_000).toISOString().slice(0, 10);
