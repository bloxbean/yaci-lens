// Playwright check of the indexed pages: address, stake, script, holders, graph, tx page panel. Screenshots to OUT.
import { chromium, webkit, firefox } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5175/';
const OUT = process.env.OUT ?? '.';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const F = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));
const browser = await ({ webkit, firefox, chromium }[process.env.BROWSER ?? 'chromium']).launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 200)}`));

await page.goto(`${BASE}#/x?exp=index`);
await page.waitForSelector('[data-testid=files] tbody tr', { timeout: 60_000 });

const checks = [
	['address', `#/x/address/${F.addrNormal}`, '[data-testid=activity] tbody tr', '[data-testid=activity]'],
	['stake', `#/x/address/${F.stakeBusy}`, '[data-testid=stake-events] li, [data-testid=stake-addrs] li', 'main'],
	['script', `#/x/script/${F.scriptTop}`, '[data-testid=state] tbody tr', 'main'],
	['holders', `#/x/holders/${F.tokenA}`, '[data-testid=holders] tbody tr, [data-testid=gate]', 'main'],
	['graph', `#/x/graph/${F.txRecent}`, '[data-testid=selected]', 'main'],
	['tx', `#/transactions/${F.txRecent}`, '[data-testid=spent-by] li', 'main']
];
for (const [name, url, sel, text] of checks) {
	if (ONLY && !ONLY.includes(name)) continue;
	const t0 = Date.now();
	await page.goto(`${BASE}${url}`);
	try {
		await page.waitForSelector(sel, { timeout: 90_000 });
		await page.waitForTimeout(800);
		const n = await page.$$eval(sel, (es) => es.length);
		const cost = await page.$$eval('[data-testid=cost]', (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
		console.log(`${name}: ok in ${Date.now() - t0} ms, ${n} items; cost ${cost.join(' | ')}`);
		if (name === 'graph') {
			// expand the first non-root node
			const nodes = await page.$$('[data-testid=node]');
			if (nodes.length > 1) {
				await nodes[1].click();
				await page.waitForTimeout(6000);
				console.log(`graph: ${(await page.$$('[data-testid=node]')).length} nodes after expanding one`);
			}
		}
		const first = await page.$eval(text, (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 300));
		console.log(`   ${first}`);
	} catch (e) {
		console.log(`${name}: FAILED after ${Date.now() - t0} ms: ${String(e.message).split('\n')[0]}`);
	}
	await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}
console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
