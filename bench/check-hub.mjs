// Playwright check of the experimental hub page: manifest, consistency, spent-by lookup, FTS search.
import { chromium, webkit, firefox } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:5175/';
const OUT = process.env.OUT ?? '.';
const which = { webkit, firefox, chromium }[process.env.BROWSER ?? 'chromium'];

const browser = await which.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
let idx = 0;
page.on('request', (r) => r.url().includes('/indexes/') && idx++);

await page.goto(`${BASE}#/x?exp=index`);
await page.waitForSelector('[data-testid=files] tbody tr', { timeout: 60_000 });
console.log('consistency:', (await page.textContent('[data-testid=consistency]')).replace(/\s+/g, ' ').trim());
console.log('files:\n' + (await page.$$eval('[data-testid=files] tbody tr', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')).join('\n'))));

await page.fill('[data-testid=lookup]', 'c6f9f2e20c4fb7369e1b146c8bd89eb5e3611766733087501ff4153c9e0bb742#4');
await page.press('[data-testid=lookup]', 'Enter');
await page.waitForSelector('[data-testid=spent] [data-testid=cost]', { timeout: 60_000 });
console.log('spent:', (await page.textContent('[data-testid=spent]')).replace(/\s+/g, ' ').trim());

await page.fill('[data-testid=lookup]', 'minswap');
await page.press('[data-testid=lookup]', 'Enter');
await page.waitForSelector('[data-testid=hits] [data-testid=cost]', { timeout: 60_000 });
console.log('search:', (await page.textContent('[data-testid=hits]')).replace(/\s+/g, ' ').trim().slice(0, 400));

await page.screenshot({ path: `${OUT}/hub.png`, fullPage: true });
console.log('index requests seen by the page:', idx);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
