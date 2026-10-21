import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { runBlueprintSuite } from '../examples/blueprint/run.mjs';

const root=process.env.BLUEPRINT_EVIDENCE_OUT ?? 'artifacts/blueprint';
const suite=await runBlueprintSuite(root);
const [saved,unknown,control]=suite.results;
assert.deepEqual(suite.results.map(x=>x.evidence.posts),[1,1,2]);
assert.deepEqual(suite.results.map(x=>x.evidence.targetRecords),[1,1,2]);
for (const result of [saved,unknown]) {
  assert.deepEqual(result.evidence.journalAtPost,['DISPATCHED']);
  assert.equal(result.evidence.afterTimeout,'UNKNOWN');
  assert.equal(result.evidence.replayDispatchBlocked,true);
  assert.equal(result.run.steps[1].toolStatus,'error');
  assert.equal(result.run.steps[1].errorName,'TimeoutError');
  assert.equal(result.run.steps[3].errorName,'PolicyError');
}
assert.equal(saved.evidence.journalStatus,'CONFIRMED');
assert.equal(saved.evidence.gatePassed,true);
assert.equal(saved.run.steps[1].verification.status,'verified');
assert.equal(unknown.evidence.journalStatus,'UNKNOWN');
assert.equal(unknown.evidence.gatePassed,false);
assert.equal(unknown.run.steps[1].verification.status,'unknown');
assert.equal(unknown.run.steps[3].verification.status,'unknown');
assert.equal(control.evidence.gatePassed,false);
assert.equal(control.run.steps[2].verification.status,'rejected');
for (const result of suite.results) {
  const cli=spawnSync(process.execPath,['bin/stepreceipt.mjs',join(result.output,'run.json'),'--check'],{encoding:'utf8'});
  assert.equal(cli.status,result===saved?0:1,cli.stderr);
}
await assert.rejects(runBlueprintSuite(root),/EEXIST/);
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const images=join(root,'screenshots');await mkdir(images);
  for (const result of suite.results) {
    await page.goto(pathToFileURL(resolve(result.output,'report.html')).href);
    await page.locator('#timeline .step').nth(result===control?2:3).click();
    assert.match(await page.locator('#detail').textContent(),result===saved?/refused dispatch/:result===unknown?/HTTP 503/:/2 matching records/);
    await page.screenshot({path:join(images,result.evidence.scenario+'.png'),fullPage:true});
  }
  const committedReports=[
    ['docs/cases/blueprint-saved-timeout.html','The Save timed out. The journal blocked another write.'],
    ['docs/cases/blueprint-unknown-readback.html','Readback failed. The journal stayed unresolved.'],
    ['docs/cases/blueprint-unguarded-retry.html','A blind retry created two records.'],
  ];
  for (const [file,title] of committedReports) {
    await page.goto(pathToFileURL(resolve(file)).href);
    assert.equal(await page.locator('#run-title').textContent(),title);
    assert.equal(await page.locator('#count-steps').textContent(),title.startsWith('A blind')?'3':'4');
  }
  await page.goto(pathToFileURL(resolve(saved.output,'report.html')).href);
  await page.locator('#language').click();
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(images,'saved-mobile-zh.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
} finally {await browser.close();}
console.log(JSON.stringify({passed:true,cases:suite.results.map(x=>x.evidence),checks:['actual guarded and unguarded HTTP writes','DISPATCHED persisted before destination receives write','timeout remains distinct from successful readback','failed read remains UNKNOWN','journal reload blocks new attempt ID','CLI gates and existing-output refusal','English Chinese mobile offline reports']},null,2));
