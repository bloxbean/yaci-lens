import { SvelteMap } from 'svelte/reactivity';
import { actionMeta, drepMeta, poolMeta, poolLabel, tokenMeta, type ActionMeta, type DRepMeta, type PoolMeta, type TokenMeta } from '$lib/lake/offchain';

/*
 * Reactive name lookups for lists: the summary pack's metadata maps, loaded once, plus CIP-26 token names fetched
 * on demand. Components read names.pool(hash) etc. and re-render when the data arrives.
 */
class Names {
	pools = $state<Map<string, PoolMeta> | null>(null);
	dreps = $state<Map<string, DRepMeta> | null>(null);
	actions = $state<Map<string, ActionMeta> | null>(null);
	tokens = new SvelteMap<string, TokenMeta | null>();
	#started = false;

	start() {
		if (this.#started) return;
		this.#started = true;
		queueMicrotask(() => {
			poolMeta().then((m) => (this.pools = m));
			drepMeta().then((m) => (this.dreps = m));
			actionMeta().then((m) => (this.actions = m));
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

	token(unit: string): TokenMeta | null {
		if (!this.tokens.has(unit)) {
			this.tokens.set(unit, null);
			queueMicrotask(() => tokenMeta(unit).then((m) => this.tokens.set(unit, m)));
		}
		return this.tokens.get(unit) ?? null;
	}
}

export const names = new Names();
