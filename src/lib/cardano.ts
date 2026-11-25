import { bech32Decode, bech32Encode } from './bech32';

export function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
	return out;
}

export function bytesToHex(b: Uint8Array): string {
	return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** pool1… from a 28-byte pool key hash (hex). */
export function poolBech32(hash: string | null | undefined): string {
	if (!hash || !/^[0-9a-f]{56}$/i.test(hash)) return hash ?? '';
	return bech32Encode('pool', hexToBytes(hash));
}

/** Pool key hash (hex) from pool1… or hex. */
export function poolHash(id: string): string | null {
	if (/^[0-9a-f]{56}$/i.test(id)) return id.toLowerCase();
	const d = bech32Decode(id);
	return d && d.hrp === 'pool' ? bytesToHex(d.bytes) : null;
}

/** "₳1.43B" style amount from an ADA (not lovelace) number. */
export function adaShort(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return '—';
	const a = Math.abs(v);
	const [d, s] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'k'] : [1, ''];
	const n = v / d;
	return `₳${n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 })}${s}`;
}

/** "1.4M" style compact count. */
export function short(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return '—';
	const a = Math.abs(v);
	const [d, s] = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'k'] : [1, ''];
	const n = v / d;
	return `${n.toLocaleString('en-US', { maximumFractionDigits: d === 1 ? 0 : Math.abs(n) < 10 ? 2 : 1 })}${s}`;
}

/** "12,345" */
export function int(v: number | bigint | null | undefined): string {
	return v == null ? '—' : v.toLocaleString('en-US');
}

/** UTC date "2026-11-24" */
export function isoDay(d: Date | string | number | null | undefined): string {
	return d == null ? '—' : new Date(d).toISOString().slice(0, 10);
}

/** UTC date-time "2026-11-24 08:00 UTC" */
export function utc(d: Date | string | number | null | undefined): string {
	return d == null ? '—' : new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
