import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import policy from 'browser-agent-blueprint/runtime/policy.cjs';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';
import { summarizeRun, renderSummary } from '../../src/summary.mjs';

const { Controller, PolicyError, digest, readCheckpoint, writeCheckpoint } = policy;
const payload = { title: 'Original synthetic garden checklist' };
const scenarios = ['saved-timeout', 'unknown-readback', 'unguarded-retry'];
const titles = {
  'saved-timeout': 'The Save timed out. The journal blocked another write.',
  'unknown-readback': 'Readback failed. The journal stayed unresolved.',
  'unguarded-retry': 'A blind retry created two records.',
};
const form = `<!doctype html><meta charset="utf-8"><title>Guard and receipt fixture</title>
<style>body{font:20px/1.6 system-ui;max-width:720px;margin:60px auto;color:#142640}input,button{font:inherit;padding:12px}small{color:#53647b}</style>
<small>Original synthetic local fixture · no account or model</small><h1>Save a draft</h1>
<input aria-label="Draft title" value="Original synthetic garden checklist"><button id="save">Save</button><p id="status">Ready</p>
<script>document.getElementById('save').onclick=async()=>{document.getElementById('status').textContent='Saving…';const r=await fetch('/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.querySelector('input').value})});await r.json();/* Deliberately omit UI confirmation after storage succeeds. */};</script>`;

async function newDirectory(directory) {
  const full = resolve(directory);
  await mkdir(dirname(full), { recursive: true });
  await mkdir(full); // Refuse an existing output, including a previous test run.
  return full;
}

export async function runBlueprintScenario({ scenario, outDir, channel = process.env.BROWSER_CHANNEL }) {
  if (!scenarios.includes(scenario)) throw new TypeError('Unknown integration scenario.');
  const output = await newDirectory(outDir);
  const file = join(output, 'checkpoint.json');
  const taskId = 'guard-receipt-' + randomUUID();
  const operationId = randomUUID();
  const guarded = scenario !== 'unguarded-retry';
  let state = { schema_version: 1, task_id: taskId, revision: 1, status: 'PAUSED',
    objective: 'Save one original synthetic draft', ledger: {}, module_ids: ['05','06'], retry_count: 0,
    next_safe_action: 'Read the destination before another write',
    intent: { operation_id: operationId, payload_sha256: digest(payload) } };
  const records = [], journalAtPost = [];
  let posts = 0;
  const server = http.createServer(async (req, res) => {
    const json = (value, status = 200) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
    if (req.url === '/records' && req.method === 'POST') {
      posts += 1;
      const chunks = []; let size = 0, tooLarge = false;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) tooLarge = true;
        else if (!tooLarge) chunks.push(chunk);
      }
      if (tooLarge) return json({error:'Synthetic fixture request too large'},413);
      let value;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json({error:'Invalid synthetic fixture JSON'},400); }
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.title !== payload.title)
        return json({error:'Unexpected synthetic fixture payload'},400);
      if (guarded) {
        try { journalAtPost.push(readCheckpoint(file, taskId).ledger['save-1']?.status ?? 'MISSING'); }
        catch { journalAtPost.push('INVALID'); }
      } else journalAtPost.push(null);
      records.push({ id: records.length + 1, title: value.title }); // No target-side deduplication.
      return json(records.at(-1));
    }
    if (req.url === '/records' && req.method === 'GET') {
      return scenario === 'unknown-readback' ? json({error:'Synthetic readback outage'},503) : json(records);
    }
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(form); return;
    }
    return json({},404);
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0,'127.0.0.1',done); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const scope = { origin, account:'synthetic-account', allowed:['read','fill','save_draft'], highRisk:[], maxWrites:2, batchThreshold:2, expiresAt:Date.now()+60000 };
  const action = { kind:'save_draft', count:1, origin, account:scope.account, operation_id:operationId, payload_sha256:digest(payload) };
  let browser;
  try {
    browser = await chromium.launch({ headless:true, ...(channel ? {channel} : {}) });
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const receipt = createReceipt({ title:titles[scenario] });
    const open = await receipt.attempt({label:'Open the isolated draft',kind:'read'},()=>page.goto(origin));
    await receipt.verify(open.id,async()=>({status:await page.getByLabel('Draft title').isVisible()?'verified':'rejected',summary:'The original synthetic draft form is visible.'}));
    const save = async () => {
      await page.locator('#save').click();
      await page.getByText('Saved successfully',{exact:true}).waitFor({timeout:600});
    };
    const observe = async () => {
      try {
        const response = await page.request.get(origin+'/records', {maxRetries:0,timeout:3000});
        if (!response.ok()) return { present:null, verification:{status:'unknown',summary:`The separate GET returned HTTP ${response.status()}. No count was established; this is not evidence of absence.`} };
        let saved;
        try { saved = await response.json(); }
        catch { return {present:null,verification:{status:'unknown',summary:'The separate read returned an invalid response; the outcome is unknown.'}}; }
        if (!Array.isArray(saved) || saved.some(row=>!row || row.title!==payload.title)) return {present:null,verification:{status:'unknown',summary:'The separate read did not establish the exact expected synthetic records.'}};
        return {present:saved.length===1?true:saved.length===0?false:null,verification:{status:saved.length===1?'verified':'rejected',summary:`A separate successful GET found ${saved.length} matching records; exactly one is required.`}};
      } catch {
        return {present:null,verification:{status:'unknown',summary:'The separate read failed; the outcome is unknown.'}};
      }
    };
    let blocked = false, afterTimeout = null, journalStatus = null;
    if (!guarded) {
      const first = await receipt.attempt({label:'Save without a journal',kind:'write'},save);
      await receipt.verify(first.id,async()=>({status:'unknown',summary:'This negative control deliberately skipped independent readback before retrying.'}));
      const retry = await receipt.attempt({label:'Blindly repeat Save after the timeout',kind:'write'},save);
      await receipt.verify(retry.id,async()=>(await observe()).verification);
    } else {
      writeCheckpoint(file,state);
      const persist = async ledger => { state={...state,revision:state.revision+1,ledger};writeCheckpoint(file,state); };
      const controller = new Controller(scope,state.ledger,{persist});
      let savedStep, observation, toolError;
      try {
        await controller.run('save-1',action,async()=>{
          savedStep = await receipt.attempt({label:'Save the draft behind the write-ahead guard',kind:'write'},async()=>{
            try { return await save(); } catch(error) { toolError=error;throw error; }
          });
          if (!savedStep.ok) throw toolError;
        },async()=>{observation=await observe();return observation.verification.status==='verified';});
      } catch(error) {
        if (!savedStep || controller.persistenceFailed || error!==toolError) throw error;
      }
      afterTimeout=readCheckpoint(file,taskId).ledger['save-1'].status;
      await copyFile(file,join(output,'after-timeout-checkpoint.json'));
      observation ??= await observe();
      await receipt.verify(savedStep.id,async()=>observation.verification);
      if (['UNKNOWN','DISPATCHED'].includes(controller.ledger['save-1'].status) && typeof observation.present==='boolean') {
        await controller.reconcileAndPersist('save-1',observation.present);
      }
      const load = await receipt.attempt({label:'Reload the journal from disk',kind:'read'},()=>readCheckpoint(file,taskId));
      assert(load.ok);
      const loaded=load.value;
      assert.equal(loaded.intent.operation_id,operationId);assert.equal(loaded.intent.payload_sha256,digest(payload));
      journalStatus=loaded.ledger['save-1'].status;
      await receipt.verify(load.id,async()=>({status:'verified',summary:`The checksum-checked journal was reloaded into a fresh controller instance in the same process. Save state: ${journalStatus}.`}));
      const restored=new Controller(scope,loaded.ledger,{persist});
      let dispatched=false, replayError;
      const replay=await receipt.attempt({label:'Try the same operation with a new attempt ID',kind:'write'},async()=>{
        try { return await restored.run('save-replay',action,async()=>{dispatched=true;return save();},async()=>true); }
        catch(error) { replayError=error;throw error; }
      });
      blocked=!dispatched && replayError instanceof PolicyError;
      assert(blocked,'The restored controller must refuse another dispatch.');
      await receipt.verify(replay.id,async()=>{
        const checked=await observe();
        return {status:checked.verification.status,summary:`The host refused dispatch before the browser callback ran. ${checked.verification.summary}`};
      });
    }
    const run=receipt.toJSON();
    const summary=summarizeRun(run);
    const evidence={capturedAt:new Date().toISOString(),scenario,posts,targetRecords:records.length,journalAtPost,afterTimeout,journalStatus,replayDispatchBlocked:blocked,gatePassed:summary.passed,
      scope:'Real local browser and HTTP writes; journal reload into a new controller instance in the same process. No worker kill, model, account, target deduplication or production guarantee.',
      blueprintCommit:'630d773c44cc41f35128d14344a77339906b9504'};
    await writeFile(join(output,'run.json'),JSON.stringify(run,null,2)+'\n');
    await writeFile(join(output,'report.html'),renderReport(run));
    await writeFile(join(output,'summary.md'),renderSummary(run));
    await writeFile(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    await writeFile(join(output,'target-snapshot.json'),JSON.stringify(records,null,2)+'\n');
    return {run,evidence,output};
  } finally {
    await browser?.close();
    await new Promise(done=>server.close(done));
  }
}

export async function runBlueprintSuite(outDir) {
  const output=await newDirectory(outDir);
  const results=[];
  for (const scenario of scenarios) results.push(await runBlueprintScenario({scenario,outDir:join(output,scenario)}));
  return {output,results};
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    if (args.length && (args.length!==2 || args[0]!=='--out')) throw new TypeError('Usage: node examples/blueprint/run.mjs [--out NEW_DIRECTORY]');
    const result=await runBlueprintSuite(args[1] ?? 'artifacts/blueprint-'+Date.now()+'-'+randomUUID().slice(0,8));
    console.log(JSON.stringify({output:result.output,cases:result.results.map(x=>x.evidence)},null,2));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
