import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { renderReport } from '../src/report.mjs';
import { summarizeRun } from '../src/summary.mjs';

const base = process.argv[2];
if (base && !/^https:\/\/lydiatools\.github\.io\/stepreceipt\/?$/.test(base)) throw new TypeError('Use the known public site or omit the argument for local files.');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
await mkdir('artifacts/langgraph-screenshots', { recursive: true });
try {
  for (const [id, expectedGate] of [['completed-control', 0], ['crash-replay', 1], ['target-dedup', 0]]) {
    const run = JSON.parse(await readFile(`docs/langgraph/${id}.json`, 'utf8'));
    assert.equal((await readFile(`docs/langgraph/${id}.html`, 'utf8')), renderReport(run));
    assert.equal(summarizeRun(run).passed, expectedGate === 0);
    const page = await browser.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [], external = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.isNavigationRequest()) external.push(request.url()); });
    const url = base ? `${base.replace(/\/$/, '')}/langgraph/${id}.html` : pathToFileURL(resolve(`docs/langgraph/${id}.html`)).href;
    const response = await page.goto(url);
    if (base) assert.equal(response.status(), 200);
    assert.equal(await page.locator('#run-title').textContent(), run.title);
    await page.locator('.step').nth(1).click();
    assert.match(await page.locator('#detail .comparison').textContent(), /Returned normally/);
    assert.match(await page.locator('#detail .comparison').textContent(), expectedGate ? /Check failed/ : /Verified/);
    assert.equal(await page.locator('#count-rejected').textContent(), String(expectedGate));
    const afterText = run.steps[1].verification.summary;
    assert.ok((await page.locator('#detail').textContent()).includes(afterText));
    await page.locator('main').screenshot({ path: `artifacts/langgraph-screenshots/${id}.png` });
    await page.locator('#language').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert.match(await page.locator('#detail').textContent(), /正常返回/);
    assert.ok((await page.locator('#detail').textContent()).includes(afterText));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (id === 'crash-replay') await page.screenshot({ path: 'artifacts/langgraph-screenshots/mobile-zh.png', fullPage: true });
    const wait = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await wait;
    const exported = `artifacts/langgraph-screenshots/${id}-export.html`;
    await download.saveAs(exported);
    const offline = await browser.newPage();
    await offline.goto(pathToFileURL(resolve(exported)).href);
    assert.equal(await offline.locator('#run-title').textContent(), run.title);
    assert.equal(await offline.locator('#count-rejected').textContent(), String(expectedGate));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    await offline.close(); await page.close();
  }
  console.log(JSON.stringify({ passed: true, source: base ?? 'local files', cases: 3, checks: ['source/render byte parity', '0/1/0 gates', 'actual observed text', 'English/Chinese controls', '390px layout', 'HTML download and offline reopen', 'no render HTTP requests'] }));
} finally { await browser.close(); }
