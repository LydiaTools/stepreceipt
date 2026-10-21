import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createReceipt, normalizeRun } from '../src/receipt.mjs';
import { renderReport } from '../src/report.mjs';

test('a write runs once; later evidence can pass despite a tool error', async () => {
  const run = createReceipt({ title: 'Timeout case' }); let writes = 0;
  const step = await run.attempt({ label: 'Save', kind: 'write' }, () => { writes++; throw new Error('secret=never-export-this'); });
  assert.equal(step.ok, false); assert.equal(writes, 1);
  await run.verify(step.id, () => ({ status: 'verified', summary: 'One record exists.' }));
  const result = run.toJSON();
  assert.equal(result.steps[0].toolStatus, 'error'); assert.equal(result.steps[0].verification.status, 'verified');
  assert.equal(writes, 1); assert.ok(!JSON.stringify(result).includes('never-export-this'));
});
test('normal tool return does not imply verified outcome', async () => {
  const run = createReceipt({ title: 'Unknown case' }); await run.attempt({ label: 'Click', kind: 'write' }, () => true);
  assert.equal(run.toJSON().steps[0].verification.status, 'unknown');
});
test('observer failures stay unknown and cannot rerun the action', async () => {
  const run = createReceipt({ title: 'Readback failed' }); let writes = 0;
  const s = await run.attempt({ label: 'Save', kind: 'write' }, () => writes++);
  await run.verify(s.id, () => { throw new Error('token=private'); });
  assert.equal(run.toJSON().steps[0].verification.status, 'unknown'); assert.equal(writes,1);
  await assert.rejects(run.verify(s.id, () => ({ status: 'verified', summary: 'Override' })));
});
test('custom Error subclasses keep their class name without exporting their message', async () => {
  class PolicyError extends Error {}
  const run = createReceipt({ title: 'Guard blocked replay' });
  await run.attempt({ label: 'Replay write', kind: 'write' }, () => { throw new PolicyError('private detail'); });
  const result = run.toJSON();
  assert.equal(result.steps[0].errorName, 'PolicyError');
  assert.ok(!JSON.stringify(result).includes('private detail'));
});
test('invalid inputs fail before actions and invalid verdicts never become success', async () => {
  const run = createReceipt({ title: 'Validation' }); let calls = 0;
  await assert.rejects(run.attempt({ label: 'Save', kind: 'other' }, () => calls++)); assert.equal(calls,0);
  const s = await run.attempt({ label: 'Click' }, () => {});
  await assert.rejects(run.verify(s.id, () => ({ status: 'success', summary: 'Ambiguous' })));
  assert.equal(run.toJSON().steps[0].verification.status, 'unknown');
});
test('duplicate IDs and malformed durations are rejected', async () => {
  const r = createReceipt({ title: 'Schema' }); await r.attempt({ label: 'Read' }, () => {}); const d=r.toJSON();
  assert.throws(() => normalizeRun({ ...d, steps: [d.steps[0],d.steps[0]] }));
  assert.throws(() => normalizeRun({ ...d, steps: [{ ...d.steps[0], durationMs: -1 }] }));
});
test('common credentials are redacted and script payloads stay inside JSON', async () => {
  const r=createReceipt({ title: '</script><img src=x onerror=alert(1)>' });
  const s=await r.attempt({ label: 'Read password=fictional123' }, () => {});
  await r.verify(s.id,()=>({status:'unknown',summary:'Bearer fictionalAccessToken123 ghp_abcdefghijklmnopqrst'}));
  const d=r.toJSON(); assert.ok(!JSON.stringify(d).includes('fictional123')); assert.ok(!JSON.stringify(d).includes('fictionalAccessToken123'));
  const html=renderReport(d); assert.ok(!html.includes('</script><img')); assert.ok(html.includes('connect-src'));
});
test('CLI creates a standalone report and refuses to overwrite it', async () => {
  const r=createReceipt({title:'CLI'}); await r.attempt({label:'Inspect'},()=>{});
  const dir=await mkdtemp(join(tmpdir(),'stepreceipt-')); const input=join(dir,'run.json'); const output=join(dir,'report.html');
  const {writeFile}=await import('node:fs/promises'); await writeFile(input,JSON.stringify(r.toJSON()));
  execFileSync(process.execPath,['bin/stepreceipt.mjs',input,'--out',output]);
  assert.match(await readFile(output,'utf8'),/StepReceipt/);
  assert.throws(()=>execFileSync(process.execPath,['bin/stepreceipt.mjs',input,'--out',output],{stdio:'pipe'}));
});
