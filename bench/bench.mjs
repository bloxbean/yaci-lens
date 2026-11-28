// Benchmark driver for Yaci Lens indexed lookups (SQLite-WASM) vs the existing DuckDB-WASM / Parquet path.
// Each scenario runs in a fresh browser context (cold HTTP cache); "warm" repeats with other keys in the same session.
// Requests/bytes are counted on the network (Playwright), so both engines are measured the same way.
//   BROWSER=chromium|webkit BASE=http://localhost:5175/ CHUNKS=16384 node bench.mjs > out.json
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5175/';
const BROWSER = process.env.BROWSER ?? 'chromium';
const CHUNKS = (process.env.CHUNKS ?? '16384').split(',').map(Number);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const F = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));

const launcher = BROWSER === 'webkit' ? webkit : chromium;
const browser = await launcher.launch();

async function session(chunk) {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	const net = { idx: { n: 0, b: 0 }, lake: { n: 0, b: 0 }, cdn: { n: 0, b: 0 } };
	page.on('requestfinished', async (req) => {
		const u = req.url();
		const k = u.includes('/indexes/') ? 'idx' : u.includes('data-test.bloxbean.org') ? 'lake' : /jsdelivr|duckdb\.org|extensions/.test(u) ? 'cdn' : null;
		if (!k) return;
		let size = 0;
		try {
			size = (await req.sizes()).responseBodySize;
		} catch {}
		net[k].n++;
		net[k].b += size;
	});
	page.on('pageerror', (e) => console.error('pageerror', e.message));
	await page.goto(`${BASE}#/x/bench?exp=index`);
	await page.waitForSelector('[data-testid=bench][data-ready=true]', { timeout: 60_000 });
	if (chunk) await page.evaluate((c) => window.__lensBench.setVfs({ chunk: c }), chunk);
	const snap = () => JSON.parse(JSON.stringify(net));
	const diff = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, { n: b[k].n - a[k].n, b: b[k].b - a[k].b }]));
	async function run(label, fn, arg) {
		await page.waitForTimeout(150);
		const before = snap();
		const t0 = Date.now();
		let res, err = null;
		try {
			res = await page.evaluate(fn, arg);
		} catch (e) {
			err = String(e.message ?? e).split('\n')[0];
		}
		const wall = Date.now() - t0;
		await page.waitForTimeout(300); // let requestfinished events land
		const d = diff(before, snap());
		return { label, wall, net: d, cost: res?.cost ?? null, summary: res?.summary ?? null, err };
	}
	return { ctx, page, run };
}

// scenario bodies run in the page; each returns { cost?, summary }
const S = {
	sqliteInit: async () => { const t0 = performance.now(); const r = await window.__lensBench.sqliteInit(); await window.__lensBench.svc.manifest(); return { summary: { initMs: r.initMs, totalMs: Math.round(performance.now() - t0) } }; },
	txByHash: async (h) => { const r = await window.__lensBench.svc.txByHash([h]); const t = r.data.get(h); return { cost: r.cost, summary: t ? `slot ${t.slot}` : 'miss' }; },
	spent: async (ref) => { const r = await window.__lensBench.svc.findSpendingTransaction(ref); return { cost: r.cost, summary: r.data.spent ? `spent by ${r.data.edge.byTx.slice(0, 12)}` : r.data.known ? 'unspent' : 'unknown' }; },
	links: async (h) => { const r = await window.__lensBench.svc.txLinks(h); return { cost: r.cost, summary: `${r.data.parents.length} in, ${r.data.children.length} spent, ${r.data.unspent.length} unspent` }; },
	graph: async (h) => {
		const svc = window.__lensBench.svc; const seen = new Set([h]); const q = [h]; const tot = { requests: 0, bytes: 0, ms: 0, queries: 0 }; const t0 = performance.now();
		while (q.length && seen.size < 25) { const x = q.shift(); const r = await svc.txLinks(x); tot.requests += r.cost.requests; tot.bytes += r.cost.bytes; tot.queries += r.cost.queries;
			for (const e of [...r.data.parents.map((e) => e.outTx), ...r.data.children.map((e) => e.byTx)].slice(0, 6)) if (!seen.has(e) && seen.size < 25) { seen.add(e); q.push(e); } }
		tot.ms = Math.round(performance.now() - t0); return { cost: tot, summary: `${seen.size} nodes` };
	},
	addr: async (a) => { const s = window.__lensBench.svc; const p1 = await s.getAddressActivity(a); const p2 = p1.data.cursor ? await s.getAddressActivity(a, p1.data.cursor) : null;
		return { cost: { requests: p1.cost.requests + (p2?.cost.requests ?? 0), bytes: p1.cost.bytes + (p2?.cost.bytes ?? 0), ms: p1.cost.ms + (p2?.cost.ms ?? 0), queries: 0 }, summary: `p1 ${p1.data.rows.length} rows ${p1.cost.ms} ms; p2 ${p2?.data.rows.length ?? 0} rows ${p2?.cost.ms ?? 0} ms` }; },
	stake: async (sa) => { const s = window.__lensBench.svc; const c = s.stakeCredential(sa); const a = await s.getStakeActivity(c); const b = await s.getStakeAddresses(c); const e = await s.getStakeEvents(c);
		return { cost: { requests: a.cost.requests + b.cost.requests + e.cost.requests, bytes: a.cost.bytes + b.cost.bytes + e.cost.bytes, ms: a.cost.ms + b.cost.ms + e.cost.ms, queries: 0 }, summary: `${a.data.rows.length} txs, ${b.data.length} addrs, ${e.data.length} certs` }; },
	script: async (h) => { const s = window.__lensBench.svc; const a = await s.getScriptActivity(h); const b = await s.getScriptOutputs(h);
		return { cost: { requests: a.cost.requests + b.cost.requests, bytes: a.cost.bytes + b.cost.bytes, ms: a.cost.ms + b.cost.ms, queries: 0 }, summary: `${a.data.rows.length} runs, ${b.data.rows.length} outputs` }; },
	holders: async (u) => { const r = await window.__lensBench.svc.getAssetHolders(u, 0, 50); return { cost: r.cost, summary: `${r.data.count} holders` }; },
	search: async (t) => { const r = await window.__lensBench.svc.search(t); return { cost: r.cost, summary: `${r.data.length} hits` }; },
	duckInit: async () => { const r = await window.__lensBench.duckInit(); return { summary: { ms: r.ms } }; },
	duckTx: async (h) => { const r = await window.__lensBench.duckTxDay(h); return { cost: { requests: 0, bytes: 0, ms: r.ms, queries: 0 }, summary: r.data ?? 'miss' }; },
	duckAddrDay: async ([a, d]) => { const r = await window.__lensBench.duckQuery(`SELECT tx_hash, output_index FROM address_utxo WHERE date = DATE '${d}' AND owner_addr = '${a}' AND asset_unit = 'lovelace'`); return { cost: { requests: 0, bytes: 0, ms: r.ms, queries: 0 }, summary: `${r.data.length} outputs on ${d}` }; }
};

const PLAN = [
	// [group, scenario, cold key, warm key]
	['tx lookup', 'txByHash', F.txRecent, F.txHistory],
	['tx lookup (miss)', 'txByHash', F.txMiss, F.txMiss2],
	['spent-by', 'spent', F.outRecent, F.outHistory],
	['spent-by (Byron)', 'spent', F.outByron, F.outRecent2],
	['graph node', 'links', F.txRecent, F.txHistory],
	['graph 25 nodes', 'graph', F.txHistory, F.txRecent],
	['address (2 pages)', 'addr', F.addrNormal, F.addrBusy],
	['stake (txs, addrs, certs)', 'stake', F.stakeNormal, F.stakeBusy],
	['script (runs, state)', 'script', F.scriptTop, F.scriptTop2],
	['holders top 50', 'holders', F.tokenA, F.tokenB],
	['search', 'search', 'minswap', 'hosky']
];
const DUCK = [
	['tx lookup (Parquet index)', 'duckTx', F.txRecent, F.txHistory],
	['tx lookup (Parquet, miss)', 'duckTx', F.txMiss, F.txMiss2],
	['address, ONE day of address_utxo', 'duckAddrDay', [F.addrBusy, '2026-11-20'], [F.addrNormal, '2026-11-20']]
];

const results = { browser: BROWSER, base: BASE, at: new Date().toISOString(), sqlite: {}, duckdb: [] };
for (const chunk of CHUNKS) {
	const rows = [];
	// engine start-up, alone
	{
		const s = await session(chunk);
		rows.push({ group: 'start-up', ...(await s.run('sqlite init + manifest', S.sqliteInit)) });
		await s.ctx.close();
	}
	for (const [group, sc, cold, warm] of PLAN) {
		if (ONLY && !ONLY.includes(sc)) continue;
		const s = await session(chunk);
		await s.run('init', S.sqliteInit);
		const c = await s.run('cold', S[sc], cold);
		const w = await s.run('warm (other key)', S[sc], warm);
		const r = await s.run('repeat', S[sc], warm);
		rows.push({ group, cold: c, warm: w, repeat: r });
		process.stderr.write(`[${BROWSER} chunk ${chunk}] ${group}: cold ${c.cost?.ms ?? c.wall} ms ${c.net.idx.n} req ${Math.round(c.net.idx.b / 1024)} KB · warm ${w.cost?.ms ?? w.wall} ms ${w.net.idx.n} req${c.err ? ' ERR ' + c.err : ''}${w.err ? ' ERR ' + w.err : ''}\n`);
	}
	results.sqlite[chunk] = rows;
}
if (!ONLY || ONLY.includes('duck')) {
	const s = await session(0);
	results.duckdb.push({ group: 'start-up', ...(await s.run('duckdb init (catalog attach)', S.duckInit)) });
	await s.ctx.close();
	for (const [group, sc, cold, warm] of DUCK) {
		const s2 = await session(0);
		await s2.run('init', S.duckInit);
		const c = await s2.run('cold', S[sc], cold);
		const w = await s2.run('warm (other key)', S[sc], warm);
		results.duckdb.push({ group, cold: c, warm: w });
		process.stderr.write(`[${BROWSER} duckdb] ${group}: cold ${c.wall} ms ${c.net.lake.n} req ${Math.round(c.net.lake.b / 1024)} KB · warm ${w.wall} ms ${w.net.lake.n} req${c.err ? ' ERR ' + c.err : ''}\n`);
		await s2.ctx.close();
	}
}
await browser.close();
console.log(JSON.stringify(results, null, 1));
