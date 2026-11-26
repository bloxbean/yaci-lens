/** Hue for an asset avatar, stable per policy. */
export const policyHue = (policy: string) => parseInt(policy.slice(0, 6) || '0', 16) % 360;

/** An ipfs:// or https:// image link from NFT metadata, as a URL a browser can load (null for anything else). */
export function imageUrl(src: unknown): string | null {
	const s = Array.isArray(src) ? src.join('') : typeof src === 'string' ? src : '';
	if (s.startsWith('ipfs://')) {
		const cid = s.slice(7).replace(/^ipfs\//, '');
		return /^[a-zA-Z0-9]{20,}(\/[^?#\s]*)?$/.test(cid) ? `https://ipfs.io/ipfs/${cid}` : null;
	}
	if (/^Qm[a-zA-Z0-9]{44}$/.test(s)) return `https://ipfs.io/ipfs/${s}`;
	return /^https:\/\//i.test(s) ? s : null;
}
