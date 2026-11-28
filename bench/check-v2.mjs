// Playwright check of the enhanced views: wallet tabs, holders, spent-by, graph trace, suggestions, pool history,
// delegator flows, dashboards with parameters, script value locked. Screenshots in shots-v2/.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5174/';
const F = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));
const POOL = 'aeee979966ad3a72f8bbc4fad3f03d81fa1777f59a40d2d3a3655df8';
const DREP = 'drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync('shots-v2', { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 160)}`));
const text = async (sel) => ((await page.textContent(sel)) ?? '').replace(/\s+/g, ' ').trim();
async function step(name, fn) {
	if (ONLY && !ONLY.includes(name)) return;
	const t0 = Date.now();
	try {
		const r = await fn();
		console.log(`OK   ${name} (${Date.now() - t0} ms) ${r ?? ''}`.slice(0, 400));
	} catch (e) {
		console.log(`FAIL ${name} (${Date.now() - t0} ms): ${String(e.message).split('\n')[0]}`);
	}
	await page.screenshot({ path: `shots-v2/${name}.png`, fullPage: true });
}
const go = async (h) => page.goto(`${BASE}#${h}`);

await step('wallet-overview', async () => {
	await go(`/x/address/${F.stakeBusy}`);
	await page.waitForSelector('[data-testid=wallet-stats]', { timeout: 60000 });
	await page.waitForTimeout(1500);
	return await text('[data-testid=wallet-stats]');
});
for (const [tab, sel] of [['tokens', '[data-testid=tokens], .y-panel'], ['rewards', '[data-testid=reward-stats], .y-panel'], ['utxos', '[data-testid=utxos], .y-panel'], ['delegation', '[data-testid=stake-events], .y-panel']]) {
	await step(`wallet-${tab}`, async () => {
		await go(`/x/address/${F.stakeBusy}?tab=${tab}`);
		await page.waitForSelector(sel, { timeout: 60000 });
		await page.waitForTimeout(4000);
		return (await text('main')).slice(150, 420);
	});
}
await step('holders-panel', async () => {
	await go(`/assets/unit/${F.tokenA}`);
	await page.waitForSelector('[data-testid=holder-stats]', { timeout: 90000 });
	return await text('[data-testid=holder-stats]');
});
await step('tx-spent-by', async () => {
	await go(`/transactions/${F.txHistory}`);
	await page.waitForSelector('[data-testid=spent-by-link]', { timeout: 90000 });
	return `${await page.locator('[data-testid=spent-by-link]').count()} spent-by links; first: ${await page.locator('[data-testid=spent-by-link]').first().textContent()}`;
});
await step('graph-trace', async () => {
	await go(`/x/graph/${F.txHistory}`);
	await page.waitForSelector('[data-testid=selected]', { timeout: 60000 });
	await page.selectOption('[data-testid=graph-controls] select', '2');
	await page.click('[data-testid=trace-forward]');
	await page.waitForFunction(() => !document.body.innerText.includes('tracing…'), null, { timeout: 120000 });
	return `${await page.locator('[data-testid=node]').count()} nodes after tracing 2 hops forward`;
});
await step('suggestions', async () => {
	await go('/');
	const box = page.locator('form input[aria-label=Search]');
	await box.click();
	await box.pressSequentially('minsw', { delay: 60 });
	await page.waitForSelector('[data-testid=suggestions]', { timeout: 30000 });
	return await text('[data-testid=suggestions]');
});
await step('pool-history', async () => {
	await go(`/pools/${POOL}`);
	await page.waitForSelector('[data-testid=pool-lifetime]', { timeout: 90000 });
	await page.waitForSelector('[data-testid=pool-updates]', { timeout: 30000 });
	await page.waitForSelector('[data-testid=deleg-events]', { timeout: 60000 }).catch(() => {});
	return `${await text('[data-testid=pool-lifetime]')} | updates ${await page.locator('[data-testid=pool-updates] li').count()} | deleg events ${await page.locator('[data-testid=deleg-events] li').count()}`;
});
await step('drep-flows', async () => {
	await go(`/governance/dreps/${DREP}`);
	await page.waitForSelector('[data-testid=deleg-events]', { timeout: 90000 });
	return `${await page.locator('[data-testid=deleg-events] li').count()} events; ${(await text('[data-testid=deleg-events]')).slice(0, 160)}`;
});
await step('script-tvl', async () => {
	await go(`/x/script/${F.scriptTop}`);
	await page.waitForSelector('[data-testid=script-tvl]', { timeout: 60000 });
	return (await text('[data-testid=script-tvl]')).slice(0, 160);
});
await step('dashboard-wallet', async () => {
	await go('/dashboards');
	await page.click('button:has-text("My wallet")');
	await page.waitForSelector('[data-testid=param-stake]', { timeout: 30000 });
	await page.fill('[data-testid=param-stake]', F.stakeBusy);
	await page.click('[data-testid=params] button[type=submit]');
	await page.waitForTimeout(12000);
	const cards = await page.$$eval('section.y-panel', (ss) => ss.map((s) => s.innerText.replace(/\s+/g, ' ').slice(0, 70)));
	return `${cards.length} widgets: ${cards.join(' || ')}`;
});
await step('dashboard-pool', async () => {
	await go('/dashboards');
	await page.click('button:has-text("Pool operator")');
	await page.waitForSelector('[data-testid=param-pool]', { timeout: 30000 });
	await page.fill('[data-testid=param-pool]', POOL);
	await page.click('[data-testid=params] button[type=submit]');
	await page.waitForTimeout(15000);
	const cards = await page.$$eval('section.y-panel', (ss) => ss.map((s) => s.innerText.replace(/\s+/g, ' ').slice(0, 60)));
	return `${cards.length} widgets: ${cards.join(' || ')}`;
});
console.log('errors:', errors.length ? [...new Set(errors)].slice(0, 12).join('\n  ') : 'none');
await browser.close();
