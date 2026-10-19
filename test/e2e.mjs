import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { runBrowserDemo } from '../examples/demo.mjs';
import { summarizeRun } from '../src/summary.mjs';
import { spawnSync } from 'node:child_process';

const result = await runBrowserDemo();
assert.equal(result.posts, 1); assert.equal(result.records, 1);
assert.equal(result.run.steps[1].toolStatus, 'error');
assert.equal(result.run.steps[1].verification.status, 'verified');
assert.equal(summarizeRun(result.run).passed, true);
const rejected = await runBrowserDemo({ scenario: 'rejected-write', outDir: 'artifacts/rejected-write' });
assert.equal(rejected.posts, 1); assert.equal(rejected.records, 0);
assert.equal(rejected.run.steps[1].toolStatus, 'ok');
assert.equal(rejected.run.steps[1].verification.status, 'rejected');
assert.equal(summarizeRun(rejected.run).passed, false);
const unknown = await runBrowserDemo({ scenario: 'unknown-readback', outDir: 'artifacts/unknown-readback' });
assert.equal(unknown.posts, 1); assert.equal(unknown.records, 1);
assert.equal(unknown.run.steps[1].toolStatus, 'error');
assert.equal(unknown.run.steps[1].verification.status, 'unknown');
assert.equal(summarizeRun(unknown.run).passed, false);
const summaryDir = await mkdtemp(join(tmpdir(), 'stepreceipt-e2e-'));
for (const example of [result, rejected, unknown]) {
  const summary = join(summaryDir, `${example.scenario}.md`);
  const gate = spawnSync(process.execPath, ['bin/stepreceipt.mjs', `${example.output}/run.json`, '--summary', summary, '--check'], { encoding: 'utf8' });
  assert.equal(gate.status, example.scenario === 'saved-timeout' ? 0 : 1, gate.stderr);
  await copyFile(summary, `${example.output}/summary.md`);
}
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const network = []; page.on('request', (r) => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(pathToFileURL(`${result.output}/report.html`).href);
  assert.equal(await page.locator('#count-verified').textContent(),'3');
  assert.match(await page.locator('#detail').textContent(),/Returned an error/);
  assert.match(await page.locator('#detail').textContent(),/One|1 saved record/);
  await mkdir('artifacts/screenshots',{recursive:true});
  await page.screenshot({path:'artifacts/screenshots/report-desktop.png',fullPage:true});
  await page.locator('#language').click(); assert.match(await page.locator('h1').textContent(),/点击/);
  await page.screenshot({path:'artifacts/screenshots/report-zh.png',fullPage:true});
  await page.locator('#language').click();
  const casePage = await browser.newPage({ viewport: { width: 1200, height: 960 } });
  for (const example of [rejected, unknown]) {
    await casePage.goto(pathToFileURL(`${example.output}/report.html`).href);
    assert.equal(await casePage.locator('#detail h2').textContent(), 'Save the draft');
    if (example.scenario === 'rejected-write') {
      assert.equal(await casePage.locator('#count-rejected').textContent(), '1');
      assert.match(await casePage.locator('#detail').textContent(), /Returned normally/);
      assert.match(await casePage.locator('#detail').textContent(), /Check failed/);
    } else {
      assert.equal(await casePage.locator('#count-unknown').textContent(), '2');
      assert.match(await casePage.locator('#detail').textContent(), /Not verified/);
    }
    await casePage.locator('main').screenshot({ path: `artifacts/screenshots/${example.scenario}.png` });
  }
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await mobile.goto(pathToFileURL(`${result.output}/report.html`).href);
  assert.equal(await mobile.locator('header').count(),1);
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.screenshot({path:'artifacts/screenshots/report-mobile.png',fullPage:true});
  await mobile.locator('#file').setInputFiles({name:'rejected.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rejected.run))});
  assert.equal(await mobile.locator('#detail h2').textContent(), 'Save the draft');
  assert.equal(await mobile.locator('#count-rejected').textContent(), '1');
  await mobile.screenshot({path:'artifacts/screenshots/rejected-mobile.png',fullPage:true});
  const payload=structuredClone(result.run); payload.title='</script><img src=x onerror="window.injected=1">'; payload.steps[1].verification.status='unknown';
  await page.locator('#file').setInputFiles({name:'run.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
  assert.equal(await page.locator('#run-title').textContent(),payload.title);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  assert.equal(await page.locator('#count-unknown').textContent(),'1');
  assert.match(await page.locator('#detail').textContent(),/before repeating a write/);
  const downloadWait=page.waitForEvent('download'); await page.locator('#download').click();
  const download=await downloadWait; const file=`${result.output}/exported.html`; await download.saveAs(file);
  const newPage=await browser.newPage(); await newPage.goto(pathToFileURL(file).href);
  assert.equal(await newPage.locator('#run-title').textContent(),payload.title);
  await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":2}')});
  assert.match(await page.locator('#notice').textContent(),/Could not open/);
  assert.equal(await page.locator('#run-title').textContent(),payload.title);
  await page.locator('#file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"password":"fictional-private-value",BROKEN}')});
  assert.ok(!(await page.locator('#notice').textContent()).includes('fictional-private-value'));
  assert.deepEqual(errors,[]); assert.deepEqual(network,[]);
  console.log(JSON.stringify({passed:true,posts:result.posts,records:result.records,steps:result.run.steps.length,verified:3,toolErrors:1,viewerExternalRequests:network.length,scenarios:[result,rejected,unknown].map((r)=>({scenario:r.scenario,posts:r.posts,records:r.records,gate:summarizeRun(r.run).passed?'passed':'blocked'})),checks:['real write and readback','normal tool return with rejected write','unknown after readback outage','unknown on import','language toggle','mobile overflow','script injection','offline export and reopen','invalid file preserves previous run']},null,2));
} finally { await browser.close(); }
