import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { runBrowserDemo } from '../examples/demo.mjs';
import { renderSummary, summarizeRun } from '../src/summary.mjs';
import { createReceipt } from '../src/receipt.mjs';
import { renderReport } from '../src/report.mjs';
import { recordPageAction } from '../src/playwright.mjs';
import { spawnSync } from 'node:child_process';

const result = await runBrowserDemo();
assert.equal(result.posts, 1); assert.equal(result.records, 1);
assert.equal(result.run.steps[1].toolStatus, 'error');
assert.equal(result.run.steps[1].verification.status, 'verified');
assert.equal(result.run.steps[1].pageEvidence.outcome, 'changed');
assert.deepEqual(result.run.steps[1].pageEvidence.signals, ['visible_text']);
assert.equal(summarizeRun(result.run).passed, true);
const rejected = await runBrowserDemo({ scenario: 'rejected-write', outDir: 'artifacts/rejected-write' });
assert.equal(rejected.posts, 1); assert.equal(rejected.records, 0);
assert.equal(rejected.run.steps[1].toolStatus, 'ok');
assert.equal(rejected.run.steps[1].verification.status, 'rejected');
assert.equal(rejected.run.steps[1].pageEvidence.outcome, 'changed');
assert.equal(summarizeRun(rejected.run).passed, false);
const unknown = await runBrowserDemo({ scenario: 'unknown-readback', outDir: 'artifacts/unknown-readback' });
assert.equal(unknown.posts, 1); assert.equal(unknown.records, 1);
assert.equal(unknown.run.steps[1].toolStatus, 'error');
assert.equal(unknown.run.steps[1].verification.status, 'unknown');
assert.equal(unknown.run.steps[1].pageEvidence.outcome, 'changed');
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
  const pageEvidenceRun = createReceipt({ title: 'Synthetic page signal demo' }); let pageWrites = 0;
  await page.setContent('<!doctype html><html><head><title>Local page</title></head><body><h1>Draft</h1><p id="status">Waiting</p><button id="save">Save</button><button id="inspect">Inspect</button></body></html>');
  const savedStep = await recordPageAction(pageEvidenceRun, page, {
    label: 'Save the draft', kind: 'write', action: async () => {
      pageWrites += 1; await page.locator('#save').click(); await page.locator('#status').evaluate((element) => { element.textContent = 'Draft saved'; });
    },
  });
  await pageEvidenceRun.verify(savedStep.id, async () => ({
    status: await page.locator('#status').textContent() === 'Draft saved' ? 'verified' : 'rejected',
    summary: 'A separate check read the expected state on the synthetic page.',
  }));
  const unchangedStep = await recordPageAction(pageEvidenceRun, page, {
    label: 'Inspect without changing the page', kind: 'read', action: async () => { await page.locator('#inspect').click(); },
  });
  await pageEvidenceRun.verify(unchangedStep.id, () => ({ status: 'unknown', summary: 'No task-specific check was supplied.' }));
  assert.equal(pageWrites, 1);
  assert.deepEqual(savedStep.pageEvidence.signals, ['visible_text']);
  assert.equal(unchangedStep.pageEvidence.outcome, 'no_visible_change');
  const pageEvidenceOutput = 'artifacts/page-evidence'; await mkdir(pageEvidenceOutput, { recursive: true });
  const pageEvidenceJson = pageEvidenceRun.toJSON();
  assert.ok(!JSON.stringify(pageEvidenceJson).includes('Draft saved'));
  await writeFile(`${pageEvidenceOutput}/run.json`, JSON.stringify(pageEvidenceJson, null, 2));
  await writeFile(`${pageEvidenceOutput}/report.html`, renderReport(pageEvidenceJson));
  await writeFile(`${pageEvidenceOutput}/summary.md`, renderSummary(pageEvidenceJson));
  await mkdir('artifacts/screenshots', { recursive: true });
  const signalPage = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  await signalPage.goto(pathToFileURL(`${pageEvidenceOutput}/report.html`).href);
  assert.match(await signalPage.locator('#detail').textContent(), /No visible change detected/);
  await signalPage.screenshot({ path: 'artifacts/screenshots/page-evidence-no-change.png', fullPage: true });
  await signalPage.locator('#timeline .step').first().click();
  assert.match(await signalPage.locator('#detail').textContent(), /Visible page changes detected/);
  assert.match(await signalPage.locator('#detail').textContent(), /Visible text/);
  await signalPage.screenshot({ path: 'artifacts/screenshots/page-evidence-changed.png', fullPage: true });
  await signalPage.locator('#language').click();
  assert.match(await signalPage.locator('#detail').textContent(), /检测到页面可见变化/);
  await signalPage.close();
  const partialRun = createReceipt({ title: 'Partial capture' });
  const partialStep = await partialRun.attempt({ label: 'Inspect the page' }, () => {});
  partialRun.addPageEvidence(partialStep.id, { captureStatus: 'partial', outcome: 'unavailable', beforeCaptured: true, afterCaptured: false, signals: [] });
  await writeFile(`${pageEvidenceOutput}/partial-run.json`, JSON.stringify(partialRun.toJSON(), null, 2));
  await writeFile(`${pageEvidenceOutput}/partial-report.html`, renderReport(partialRun.toJSON()));
  const partialPage = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  await partialPage.goto(pathToFileURL(`${pageEvidenceOutput}/partial-report.html`).href);
  assert.match(await partialPage.locator('#detail').textContent(), /Some page signals were unavailable/);
  await partialPage.locator('#language').click();
  assert.match(await partialPage.locator('#detail').textContent(), /部分页面信号不可用/);
  await partialPage.close();
  const pageEvidenceMobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await pageEvidenceMobile.goto(pathToFileURL(`${pageEvidenceOutput}/report.html`).href);
  assert.ok(await pageEvidenceMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await pageEvidenceMobile.locator('#language').click();
  assert.match(await pageEvidenceMobile.locator('#detail').textContent(), /没有检测到可见变化/);
  await pageEvidenceMobile.screenshot({ path: 'artifacts/screenshots/page-evidence-mobile.png', fullPage: true });
  await pageEvidenceMobile.close();
  const publicDocsPage = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  await publicDocsPage.goto(pathToFileURL('docs/index.html').href);
  assert.match(await publicDocsPage.locator('#detail').textContent(), /Visible page changes detected/);
  const publicCasePage = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  await publicCasePage.goto(pathToFileURL('docs/cases/page-signals.html').href);
  assert.match(await publicCasePage.locator('#detail').textContent(), /No visible change detected/);
  await publicCasePage.locator('#timeline .step').first().click();
  assert.match(await publicCasePage.locator('#detail').textContent(), /Visible page changes detected/);
  await publicCasePage.locator('#language').click();
  assert.match(await publicCasePage.locator('#detail').textContent(), /检测到页面可见变化/);
  await publicDocsPage.close(); await publicCasePage.close();
  const pageEvidenceZh = createReceipt({ title: '合成页面信号演示' });
  const zhSaved = await pageEvidenceZh.attempt({ label: '保存草稿', kind: 'write' }, () => {});
  pageEvidenceZh.addPageEvidence(zhSaved.id, { captureStatus: 'complete', outcome: 'changed', beforeCaptured: true, afterCaptured: true, signals: ['visible_text'] });
  await pageEvidenceZh.verify(zhSaved.id, () => ({ status: 'verified', summary: '单独读取确认草稿已保存。' }));
  const zhInspect = await pageEvidenceZh.attempt({ label: '查看页面状态', kind: 'read' }, () => {});
  pageEvidenceZh.addPageEvidence(zhInspect.id, { captureStatus: 'complete', outcome: 'no_visible_change', beforeCaptured: true, afterCaptured: true, signals: [] });
  await pageEvidenceZh.verify(zhInspect.id, () => ({ status: 'unknown', summary: '没有执行针对任务结果的检查。' }));
  await writeFile(`${pageEvidenceOutput}/report.zh-CN.html`, renderReport(pageEvidenceZh.toJSON()));
  const localizedPage = await browser.newPage({ viewport: { width: 1440, height: 1060 }, deviceScaleFactor: 1 });
  await localizedPage.goto(pathToFileURL(`${pageEvidenceOutput}/report.zh-CN.html`).href);
  await localizedPage.locator('#language').click();
  await localizedPage.locator('#timeline .step').first().click();
  assert.match(await localizedPage.locator('#run-title').textContent(), /合成页面信号演示/);
  assert.match(await localizedPage.locator('#detail').textContent(), /检测到页面可见变化/);
  assert.match(await localizedPage.locator('#detail').textContent(), /单独读取确认草稿已保存/);
  await localizedPage.screenshot({ path: 'artifacts/screenshots/page-evidence-zh.png', fullPage: true });
  await localizedPage.close();
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
  console.log(JSON.stringify({passed:true,posts:result.posts,records:result.records,steps:result.run.steps.length,verified:3,toolErrors:1,viewerExternalRequests:network.length,scenarios:[result,rejected,unknown].map((r)=>({scenario:r.scenario,posts:r.posts,records:r.records,gate:summarizeRun(r.run).passed?'passed':'blocked'})),checks:['real write and readback','one page signal capture around each one-shot action','normal tool return with rejected write','unknown after readback outage','changed and no-op signal display','partial capture English/Chinese display','fully localized Chinese report','public docs index and page-signal case contain working signals','page signals at 390px without horizontal overflow','unknown on import','language toggle','script injection','offline export and reopen','invalid file preserves previous run']},null,2));
} finally { await browser.close(); }
