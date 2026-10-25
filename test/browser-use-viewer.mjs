import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { renderReport } from '../src/report.mjs';

const exec = promisify(execFile);
const base = process.argv[2];
if (base && !/^https:\/\/lydiatools\.github\.io\/stepreceipt\/?$/.test(base)) throw new TypeError('Use the known public site or local files.');
const out = resolve(process.env.BROWSER_USE_VIEWER_OUT ?? 'artifacts/browser-use-viewer');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const cases = [['disabled', 'rejected'], ['stored', 'verified'], ['false-toast', 'rejected'], ['readback-unavailable', 'unknown']];
try {
  for (const [id, status] of cases) {
    const run = JSON.parse(await readFile(`docs/browser-use/${id}.json`, 'utf8'));
    assert.equal(await readFile(`docs/browser-use/${id}.html`, 'utf8'), renderReport(run));
    const context = await browser.newContext({ viewport: { width: 1240, height: 960 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.isNavigationRequest()) external.push(request.url()); });
    const url = base ? `${base.replace(/\/$/, '')}/browser-use/${id}.html` : pathToFileURL(resolve(`docs/browser-use/${id}.html`)).href;
    const response = await page.goto(url);
    if (base) assert.equal(response.status(), 200);
    assert.equal(await page.locator('#run-title').textContent(), run.title);
    const detail = await page.locator('#detail').textContent();
    assert.match(detail, /Returned normally/);
    assert.ok(detail.includes(run.steps[0].verification.summary));
    const expected = status === 'verified' ? 'Verified' : status === 'rejected' ? 'Check failed' : 'Not verified';
    assert.ok((await page.locator('#detail .comparison').textContent()).includes(expected));
    assert.equal(await page.locator(`#count-${status}`).textContent(), '1');
    await page.locator('main').screenshot({ path: join(out, `${id}.png`) });
    await page.locator('#language').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert.match(await page.locator('#detail').textContent(), /正常返回/);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (id === 'disabled') await page.screenshot({ path: join(out, 'disabled-mobile-zh.png'), fullPage: true });
    const wait = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await wait;
    const exported = join(out, `${id}-export.html`);
    await download.saveAs(exported);
    await context.setOffline(true);
    const offline = await context.newPage();
    await offline.goto(pathToFileURL(exported).href);
    assert.equal(await offline.locator('#run-title').textContent(), run.title);
    assert.equal(await offline.locator(`#count-${status}`).textContent(), '1');
    const cli = await exec(process.execPath, ['bin/stepreceipt.mjs', `docs/browser-use/${id}.json`, '--check']).then(() => 0, (error) => error.code);
    assert.equal(cli, status === 'verified' ? 0 : 1);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await context.close();
  }
  console.log(JSON.stringify({ passed: true, source: base ?? 'local files', cases: 4,
    checks: ['native Python JSON/render parity', 'actual 1/0/1/1 CLI exits', 'tool status beside independent verdict', 'EN/ZH controls', '390px layout', 'HTML export and offline reopen', 'no report HTTP subrequests'] }));
} finally { await browser.close(); }
