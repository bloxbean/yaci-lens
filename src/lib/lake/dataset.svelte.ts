import { network } from './config';

/*
 * Who publishes the data and under which license, as the data source itself declares it in metadata.json (written by
 * yaci-lens-publisher next to the catalog). Nothing is assumed: a source without metadata.json, or without a license
 * in it, is shown without a license, so a Lens pointed at someone else's data never shows BloxBean's license.
 */

export interface DatasetInfo {
	name: string | null;
	publisher: string | null;
	/** Public home of the data (https) */
	source: string | null;
	/** SPDX id, e.g. ODbL-1.0 */
	license: string | null;
	licenseName: string | null;
	licenseUrl: string | null;
	/** Full license text and the notice, published next to metadata.json */
	licenseFileUrl: string | null;
	noticeUrl: string | null;
	/** Suggested credit line */
	attributionText: string | null;
	metadataUrl: string;
}

const text = (v: unknown, max = 300): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Only http(s) links are rendered; relative ones resolve against metadata.json, so mirrors stay correct. */
function link(v: unknown, base: string): string | null {
	const s = text(v, 500);
	if (!s) return null;
	try {
		const u = new URL(s, base);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
	} catch {
		return null;
	}
}

/** "ODbL-1.0" -> "ODbL 1.0", "CC-BY-4.0" -> "CC-BY 4.0" */
export const shortLicense = (id: string): string => id.replace(/-(\d[\d.]*)$/, ' $1');

export function parseDatasetInfo(raw: unknown, metadataUrl: string): DatasetInfo {
	const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const license = text(m.license, 64);
	return {
		name: text(m.name, 120),
		publisher: text(m.publisher, 120),
		source: link(m.source, metadataUrl),
		license,
		licenseName: license ? (text(m.licenseName, 160) ?? license) : null,
		licenseUrl: license ? link(m.licenseUrl, metadataUrl) : null,
		licenseFileUrl: license ? link(m.licenseFile, metadataUrl) : null,
		noticeUrl: link(m.licenseNotice, metadataUrl),
		attributionText: license ? text(m.attributionText, 500) : null,
		metadataUrl
	};
}

class Dataset {
	status = $state<'idle' | 'loading' | 'ready' | 'missing'>('idle');
	info = $state<DatasetInfo | null>(null);

	/** Fetched once per session; a missing or unreadable metadata.json just means "no declared license". */
	load(): void {
		if (this.status !== 'idle') return;
		this.status = 'loading';
		fetch(network.metadataUrl)
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
			.then((raw) => {
				this.info = parseDatasetInfo(raw, network.metadataUrl);
				this.status = 'ready';
			})
			.catch(() => (this.status = 'missing'));
	}

	/** Host of the data, for sources that don't describe themselves */
	get host(): string {
		try {
			return new URL(network.catalogUrl).host;
		} catch {
			return network.catalogUrl;
		}
	}
}

export const dataset = new Dataset();
