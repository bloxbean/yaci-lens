import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Blocks from '@lucide/svelte/icons/blocks';
import Timer from '@lucide/svelte/icons/timer';
import Server from '@lucide/svelte/icons/server';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import Users from '@lucide/svelte/icons/users';
import TerminalSquare from '@lucide/svelte/icons/square-terminal';
import Table2 from '@lucide/svelte/icons/table-2';
import Info from '@lucide/svelte/icons/info';
import Layers from '@lucide/svelte/icons/layers';
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import Coins from '@lucide/svelte/icons/coins';
import FileCode from '@lucide/svelte/icons/file-code';
import LayoutGrid from '@lucide/svelte/icons/layout-grid';
import Fish from '@lucide/svelte/icons/fish';
import Zap from '@lucide/svelte/icons/zap';
import { INDEX_URL, indexEnabled } from '$lib/indexdb/config';

export interface NavItem {
	label: string;
	/** Route path (hash routing: links are rendered as #/path). */
	href: string;
	icon: Component;
	/** Other paths that should highlight this item. */
	match?: string[];
	keywords?: string;
}

export interface NavGroup {
	label: string;
	items: NavItem[];
}

export const NAV: NavGroup[] = [
	{
		label: 'Explore',
		items: [
			{ label: 'Dashboard', href: '/', icon: LayoutDashboard, keywords: 'home overview' },
			{ label: 'Epochs', href: '/epochs', icon: Timer, keywords: 'ada pots treasury stake' },
			{ label: 'Blocks', href: '/blocks', icon: Blocks, keywords: 'block' },
			{ label: 'Transactions', href: '/transactions', icon: ArrowLeftRight, keywords: 'tx transactions fees' },
			{ label: 'Assets', href: '/assets', icon: Coins, keywords: 'tokens nft native assets policy fingerprint' },
			{ label: 'Scripts', href: '/scripts', icon: FileCode, keywords: 'smart contracts plutus dapps registry' },
			{ label: 'Pools', href: '/pools', icon: Server, keywords: 'stake pool spo' },
			{ label: 'Staking', href: '/staking', icon: Layers, keywords: 'delegation certificates rewards withdrawals nakamoto' },
			{ label: 'Whales', href: '/whales', icon: Fish, keywords: 'largest stake accounts holders rich list balances' }
		]
	},
	{
		label: 'Governance',
		items: [
			{ label: 'Proposals', href: '/governance', icon: ScrollText, keywords: 'gov actions votes conway' },
			{ label: 'DReps', href: '/governance/dreps', icon: Users, keywords: 'delegated representatives voting power' }
		]
	},
	{
		label: 'Analytics',
		items: [
			{ label: 'SQL lab', href: '/sql', icon: TerminalSquare, keywords: 'query duckdb editor' },
			{ label: 'Dashboard lab', href: '/dashboards', icon: LayoutGrid, keywords: 'my dashboards personal charts widgets' },
			{ label: 'Tables', href: '/tables', icon: Table2, keywords: 'schema columns catalog' },
			{ label: 'Validator lab', href: '/lab', icon: FlaskConical, keywords: 'julc plutus uplc debug' },
			{ label: 'About', href: '/about', icon: Info, keywords: 'how it works self-host' }
		]
	}
];

/** EXPERIMENTAL: indexed lookups (SQLite-WASM), listed only when the build has an index URL and the viewer turned them on. */
const EXPERIMENTAL: NavGroup = {
	label: 'Experimental',
	items: [{ label: 'Indexed lookups', href: '/x', icon: Zap, keywords: 'sqlite index graph address stake holders search' }]
};

/** The navigation, with the experimental group when indexed lookups are on *and* the indexes are published. */
export async function navGroups(): Promise<NavGroup[]> {
	if (!INDEX_URL || !indexEnabled()) return NAV;
	const { indexAvailable } = await import('$lib/indexdb/service');
	return (await indexAvailable()) ? [...NAV, EXPERIMENTAL] : NAV;
}

export const ALL_PAGES: NavItem[] = [...NAV, ...(INDEX_URL ? [EXPERIMENTAL] : [])].flatMap((g) => g.items);

/** The nav item for a path: the one whose href or match prefix is the longest match. */
export function activeHref(path: string): string | null {
	let best: { href: string; len: number } | null = null;
	for (const item of ALL_PAGES) {
		for (const root of [item.href, ...(item.match ?? [])]) {
			const hit = root === '/' ? path === '/' : path === root || path.startsWith(root + '/');
			if (hit && (!best || root.length > best.len)) best = { href: item.href, len: root.length };
		}
	}
	return best?.href ?? null;
}

/** A link to a route (hash routing). */
export function href(path: string): string {
	return `#${path.startsWith('/') ? path : '/' + path}`;
}

/** The current route path, from the hash (#/epochs/600 -> /epochs/600). */
export function routePath(url: URL): string {
	const h = url.hash.startsWith('#/') ? url.hash.slice(1) : '';
	return (h || url.pathname || '/').split('?')[0];
}
