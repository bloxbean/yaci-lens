// Default-on flag, search box routing through the indexes, SQLite tx day, and fallback when the index is unreachable.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5174/';
const F = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));
const browser = await chromium.launch();

async function run(label, blockIndex) {
	const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
	if (blockIndex) await ctx.route('**/indexes/manifest.json', (r) => r.fulfill({ status: 404, body: 'gone' }));
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	let idxReq = 0;
	page.on('request', (r) => r.url().includes('/indexes/') && idxReq++);
	await page.goto(`${BASE}#/`); // no ?exp parameter
	await page.waitForTimeout(1500);
	const nav = await page.$$eval('nav[aria-label=Main] a', (as) => as.map((a) => a.textContent.trim()));
	console.log(`[${label}] experimental menu shown: ${nav.includes('Indexed lookups')}`);
	const box = page.locator('form input[aria-label=Search]');
	await box.fill('minswap');
	await box.press('Enter');
	await page.waitForTimeout(4000);
	console.log(`[${label}] text "minswap" -> ${page.url().split('#')[1]}`);
	if (page.url().includes('/x/search')) {
		await page.waitForSelector('[data-testid=search-results], .y-panel', { timeout: 30000 });
		console.log(`[${label}]   results: ${(await page.textContent('main')).replace(/\s+/g, ' ').slice(0, 220)}`);
		await page.screenshot({ path: 'shots/search.png', fullPage: true });
	}
	await box.fill(F.addrNormal);
	await box.press('Enter');
	await page.waitForTimeout(3000);
	console.log(`[${label}] address -> ${page.url().split('#')[1].slice(0, 40)}…`);
	const t0 = Date.now();
	await page.goto(`${BASE}#/transactions/${F.txHistory}`);
	try {
		await page.waitForFunction(() => /block\s*#[\d,]+/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 90000 });
	} catch (e) {
		await page.screenshot({ path: `shots/tx-${blockIndex ? 'fallback' : 'index'}.png`, fullPage: true });
		console.log(`[${label}] tx page did not show the block: ${(await page.textContent('main')).replace(/\s+/g, ' ').slice(0, 300)}`);
	}
	console.log(`[${label}] tx page (2021 tx) overview in ${Date.now() - t0} ms; index requests so far ${idxReq}`);
	await page.waitForTimeout(3000);
	console.log(`[${label}] tx page: Graph button ${await page.locator('a[href*="/x/graph/"]').count() > 0}, spent-by panel ${await page.locator('text=Outputs: spent by').count() > 0}`);
	console.log(`[${label}] errors: ${errors.length ? errors.join(' | ') : 'none'}`);
	await ctx.close();
}
await run('index available', false);
await run('index unreachable', true);
await browser.close();
