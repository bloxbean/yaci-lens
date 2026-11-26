import { SvelteMap } from 'svelte/reactivity';
import {
	actionMeta,
	drepMeta,
	poolMeta,
	poolLabel,
	scriptLabels,
	tokenMeta,
	type ActionMeta,
	type DRepMeta,
	type PoolMeta,
	type ScriptLabel,
	type TokenMeta
} from '$lib/lake/offchain';
import { actionKey, drepKey, poolKey, scriptKey, scriptKeyOfAddress, tokenKey } from './keys';
import type { PoolName, ScriptName, TokenName } from './types';

/*
 * Reactive name lookups: the summary pack's metadata maps (pools, DReps, governance actions, dApp script labels),
 * loaded once, plus CIP-26 token names fetched on demand. Components read names.pool(hash) etc. (or the
 * Yaci Viewer-compatible functions below) and re-render when the data arrives. Everything comes from static files
 * or the browser itself; there is no names server.
 */
class Names {
	pools = $state<Map<string, PoolMeta> | null>(null);
	dreps = $state<Map<string, DRepMeta> | null>(null);
	actions = $state<Map<string, ActionMeta> | null>(null);
	scripts = $state<Map<string, ScriptLabel> | null>(null);
	tokens = new SvelteMap<string, TokenMeta | null>();
	#asked = new Set<string>();
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		queueMicrotask(() => {
			poolMeta().then((m) => (this.pools = m));
			drepMeta().then((m) => (this.dreps = m));
			actionMeta().then((m) => (this.actions = m));
			scriptLabels().then((m) => (this.scripts = m));
		});
	}

	pool(hash: string | null | undefined): string | null {
		this.start();
		return hash ? poolLabel(this.pools?.get(hash)) : null;
	}

	drep(hash: string | null | undefined): string | null {
		this.start();
		const m = hash ? this.dreps?.get(hash) : null;
		return m?.fetched && m.hash_ok !== false ? m.given_name : null;
	}

	action(txHash: string, idx: number): string | null {
		this.start();
		const m = this.actions?.get(`${txHash}#${idx}`);
		return m?.fetched && m.hash_ok !== false ? m.title : null;
	}

	script(hash: string | null | undefined): ScriptLabel | null {
		this.start();
		return hash ? (this.scripts?.get(hash) ?? null) : null;
	}

	token(unit: string): TokenMeta | null {
		// Read during rendering (often inside $derived), so the map is only written later, when the answer arrives.
		if (!this.#asked.has(unit)) {
			this.#asked.add(unit);
			queueMicrotask(() => tokenMeta(unit).then((m) => this.tokens.set(unit, m)));
		}
		return this.tokens.get(unit) ?? null;
	}
}

export const names = new Names();

// ---- the Yaci Viewer names API (used by the components forked from it) ----------------------------------------

/** The dApp label for a script hash, or for the script behind an address or a stake address. */
export function scriptName(hashOrAddress: string | null | undefined): ScriptName | null {
	const key = /^(addr|stake)/.test(hashOrAddress ?? '') ? scriptKeyOfAddress(hashOrAddress) : scriptKey(hashOrAddress);
	const s = names.script(key);
	return s ? { label: s.label, project: s.project, category: s.category ?? undefined, url: s.url ?? undefined, source: s.source } : null;
}
export const drepName = (id: string | null | undefined) => names.drep(drepKey(id));
export function poolName(id: string | null | undefined): PoolName | null {
	names.start();
	const key = poolKey(id);
	const m = key ? names.pools?.get(key) : null;
	return m?.fetched && m.hash_ok !== false && (m.ticker || m.name) ? { ticker: m.ticker ?? undefined, name: m.name ?? undefined } : null;
}
export function actionTitle(id: string | null | undefined): string | null {
	const key = actionKey(id);
	if (!key) return null;
	const [tx, i] = key.split('#');
	return names.action(tx, Number(i));
}
export function tokenName(unit: string | null | undefined): TokenName | null {
	const key = tokenKey(unit);
	const m = key ? names.token(key) : null;
	return m ? { ticker: m.ticker ?? undefined, name: m.name ?? undefined, decimals: m.decimals ?? undefined } : null;
}
