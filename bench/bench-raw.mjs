// Raw SQLite-over-HTTP lookups: page size x chunk size, and one 250 MB shard vs one 8 GB file.
// Each run: fresh browser context, open the file, then N point lookups (first tx hash >= a random prefix).
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5176/';
const T = 'https://data-test.bloxbean.org/mainnet/v1/';
const N = Number(process.env.N ?? 12);
const FILES = JSON.parse(process.env.FILES); // [{label, url, size, prefixByte}]
const CHUNKS = (process.env.CHUNKS ?? '4096,16384,65536').split(',').map(Number);
const browser = await chromium.launch();
const out = [];
for (const f of FILES) {
	for (const chunk of CHUNKS) {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await page.goto(`${BASE}#/x/bench?exp=index`);
		await page.waitForSelector('[data-testid=bench][data-ready=true]', { timeout: 60_000 });
		const r = await page.evaluate(
			async ({ f, chunk, N }) => {
				const b = window.__lensBench;
				await b.setVfs({ chunk, maxReadAhead: 1 });
				const t0 = performance.now();
				await b.sqliteInit();
				const init = performance.now() - t0;
				const name = `${f.label}-${chunk}`;
				const t1 = performance.now();
				await b.rawOpen(name, f.url, f.size);
				const first = await b.rawQuery(name, 'SELECT 1'); // open cost is folded into the first query
				const open = { ms: Math.round(performance.now() - t1), req: first.stats.requests, bytes: first.stats.bytes };
				const looks = [];
				for (let i = 0; i < N; i++) {
					const p = (f.prefixByte ?? '') + Array.from(crypto.getRandomValues(new Uint8Array(f.prefixByte ? 7 : 8)), (x) => x.toString(16).padStart(2, '0')).join('');
					const t = performance.now();
					const q = await b.rawQuery(name, 'SELECT hex(hash) AS h, slot FROM tx WHERE hash >= ? ORDER BY hash LIMIT 1', [`x'${p}'`]);
					looks.push({ ms: Math.round(performance.now() - t), req: q.stats.requests, bytes: q.stats.bytes, hit: q.rows.length });
				}
				return { init: Math.round(init), open, looks };
			},
			{ f, chunk, N }
		);
		const l = r.looks;
		const avg = (k) => Math.round(l.reduce((s, x) => s + x[k], 0) / l.length);
		const row = { file: f.label, chunk, open: r.open, first: l[0], avgMs: avg('ms'), avgReq: +(l.reduce((s, x) => s + x.req, 0) / l.length).toFixed(2), avgKB: Math.round(avg('bytes') / 1024), last4Ms: Math.round(l.slice(-4).reduce((s, x) => s + x.ms, 0) / 4) };
		out.push(row);
		process.stderr.write(`${f.label} chunk ${chunk}: open ${r.open.ms} ms ${r.open.req} req; first lookup ${l[0].ms} ms ${l[0].req} req; avg ${row.avgMs} ms ${row.avgReq} req ${row.avgKB} KB; last4 ${row.last4Ms} ms\n`);
		await ctx.close();
	}
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
