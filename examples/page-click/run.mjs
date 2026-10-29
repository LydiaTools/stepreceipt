import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';
import { renderSummary, summarizeRun } from '../../src/summary.mjs';
import { recordPageAction, recordPageClick } from '../../src/playwright.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out')) throw new Error('Use --out followed by an empty output directory.');
const output = resolve(args[1] ?? 'artifacts/page-click');
await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw new Error('Choose an empty output directory.');
const fixture = `<!doctype html><meta charset="utf-8"><title>Same synthetic draft</title>
<style>body{font:18px/1.6 system-ui;max-width:650px;margin:65px auto;padding:25px;color:#142640}button{font:inherit;padding:12px 24px;background:#265ed7;color:white;border:0;border-radius:5px}small{color:#53647b}#state{padding:18px;background:#edf3fc;max-width:400px}</style>
<small>StepReceipt / Synthetic local fixture / No real account</small><h1>Save a draft</h1><p id="state">Pending</p><button class="save">Save</button>
<script>document.querySelectorAll('button').forEach(b=>b.onclick=()=>document.querySelector('#state').textContent='Saved')</script>`;
const launch = { headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) };
const browser = await chromium.launch(launch);
const summary = {};
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 650 } });
  const first = await context.newPage();
  const second = await context.newPage();
  async function reset() { await first.setContent(fixture); await second.setContent(fixture); await second.bringToFront(); }
  async function save(name, receipt) {
    const run = receipt.toJSON();
    await writeFile(`${output}/${name}.json`, JSON.stringify(run, null, 2) + '\n');
    await writeFile(`${output}/${name}.html`, renderReport(run));
    await writeFile(`${output}/${name}.md`, renderSummary(run));
    summary[name] = { toolStatus: run.steps[0].toolStatus, verification: run.steps[0].verification.status,
      pageSignals: run.steps[0].pageEvidence.outcome, gatePassed: summarizeRun(run).passed,
      first: await first.locator('#state').textContent(), second: await second.locator('#state').textContent() };
  }
  await reset();
  assert.notEqual(first, second); assert.equal(first.url(), second.url());
  const bound = createReceipt({ title: 'Bound click: same URL, selected page' });
  const b = await recordPageClick(bound, first, { label: 'Click Save on first page', selector: '.save' });
  await bound.verify(b.id, async () => {
    const firstState = await first.locator('#state').textContent();
    const secondState = await second.locator('#state').textContent();
    return { status: firstState === 'Saved' && secondState === 'Pending' ? 'verified' : 'rejected',
      summary: `Independent read: first page ${firstState}; second page ${secondState}.` };
  });
  assert.equal(b.ok, true); assert.equal(summarizeRun(bound.toJSON()).passed, true);
  await first.screenshot({ path: `${output}/selected-page.png` });
  await second.screenshot({ path: `${output}/other-page.png` });
  await save('bound', bound);

  await reset();
  await first.locator('button').evaluate((button) => button.after(button.cloneNode(true)));
  const ambiguous = createReceipt({ title: 'Ambiguous selector: click blocked' });
  const a = await recordPageClick(ambiguous, first, { label: 'Click ambiguous Save buttons', selector: '.save' });
  await ambiguous.verify(a.id, async () => ({ status: 'rejected',
    summary: `Two buttons matched. First page remained ${await first.locator('#state').textContent()}; no click was made.` }));
  assert.equal(a.ok, false); assert.equal(await first.locator('#state').textContent(), 'Pending');
  assert.equal(summarizeRun(ambiguous.toJSON()).passed, false);
  await save('ambiguous', ambiguous);

  await reset();
  const unbound = createReceipt({ title: 'Unbound callback: click went to the other page' });
  const u = await recordPageAction(unbound, first, { label: 'Attempt to save on first page', kind: 'write', action: () => second.locator('.save').click() });
  await unbound.verify(u.id, async () => ({ status: 'rejected',
    summary: `Independent read: first page ${await first.locator('#state').textContent()}; other page ${await second.locator('#state').textContent()}.` }));
  assert.equal(u.ok, true); assert.equal(u.pageEvidence.outcome, 'no_visible_change');
  assert.equal(await first.locator('#state').textContent(), 'Pending'); assert.equal(await second.locator('#state').textContent(), 'Saved');
  assert.equal(summarizeRun(unbound.toJSON()).passed, false);
  await save('unbound', unbound);
  await writeFile(`${output}/measurements.json`, JSON.stringify({ sameUrl: first.url() === second.url(), summary }, null, 2) + '\n');
  console.log(JSON.stringify({ output, sameUrl: first.url() === second.url(), summary }, null, 2));
} finally {
  await browser.close();
}
