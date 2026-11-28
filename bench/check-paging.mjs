import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const first = async (sel) => (await p.locator(`${sel} li`).first().innerText()).replace(/\s+/g, ' ');
const pn = async (scope) => (await p.locator(`${scope} [data-testid=prevnext] span`).first().innerText()).replace(/\s+/g, ' ');
// pool delegator flows
await p.goto('http://localhost:5174/#/pools/aeee979966ad3a72f8bbc4fad3f03d81fa1777f59a40d2d3a3655df8');
await p.waitForSelector('[data-testid=deleg-events] li', { timeout: 90000 });
const scope = 'section:has([data-testid=deleg-events])';
const a1 = await first('[data-testid=deleg-events]'); const n1 = await p.locator('[data-testid=deleg-events] li').count();
console.log('pool p1:', n1, 'rows |', await pn(scope), '|', a1.slice(0, 60));
await p.click(`${scope} [data-testid=older]`); await p.waitForTimeout(2500);
console.log('pool p2:', await p.locator('[data-testid=deleg-events] li').count(), 'rows |', await pn(scope), '|', (await first('[data-testid=deleg-events]')).slice(0, 60));
await p.click(`${scope} [data-testid=newer]`); await p.waitForTimeout(2500);
console.log('pool back to p1 same first row:', (await first('[data-testid=deleg-events]')) === a1, '|', await pn(scope));
// DRep votes
await p.goto('http://localhost:5174/#/governance/dreps/drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w');
await p.waitForSelector('section:has(h2:text("Votes")) li', { timeout: 90000 });
const vs = 'section:has(h2:text("Votes"))';
console.log('votes p1:', await p.locator(`${vs} li`).count(), 'rows |', await pn(vs));
await p.click(`${vs} [data-testid=older]`); await p.waitForTimeout(500);
console.log('votes p2:', await p.locator(`${vs} li`).count(), 'rows |', await pn(vs));
await p.waitForSelector('[data-testid=deleg-events] li', { timeout: 60000 });
console.log('drep flows last on page:', await p.evaluate(() => { const el = document.querySelector('[data-testid=deleg-events]'); const panels = [...document.querySelectorAll('main section.y-panel')]; return panels[panels.length - 1]?.contains(el); }));
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await b.close();
