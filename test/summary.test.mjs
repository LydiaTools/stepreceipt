import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReceipt } from '../src/receipt.mjs';
import { renderSummary, summarizeRun } from '../src/summary.mjs';

test('the recorded-check gate blocks empty and unknown runs, but permits verified tool errors', async () => {
  const receipt = createReceipt({ title: 'Check result, not just exit status' });
  assert.equal(summarizeRun(receipt.toJSON()).passed, false);
  const step = await receipt.attempt({ label: '<img src=x> | [link](https://example.com)', kind: 'write' }, () => { throw new Error('private'); });
  assert.equal(summarizeRun(receipt.toJSON()).passed, false);
  await receipt.verify(step.id, () => ({ status: 'verified', summary: 'A separate read found exactly one record.' }));
  assert.equal(summarizeRun(receipt.toJSON()).passed, true);
  assert.equal(summarizeRun(receipt.toJSON()).counts.toolErrors, 1);
  const report = renderSummary(receipt.toJSON());
  assert.ok(!report.includes('<img'));
  assert.ok(!report.includes('[link](https://example.com)'));
  const rejected = structuredClone(receipt.toJSON());
  rejected.steps[0].toolStatus = 'ok';
  rejected.steps[0].verification.status = 'rejected';
  assert.equal(summarizeRun(rejected).passed, false);
});

test('CLI writes blocked summaries before exiting 1; invalid inputs exit 2 without echoing JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stepreceipt-gate-'));
  const input = join(dir, 'run.json'), output = join(dir, 'summary.md');
  const receipt = createReceipt({ title: 'Unknown write' });
  const step = await receipt.attempt({ label: 'Save', kind: 'write' }, () => {});
  await writeFile(input, JSON.stringify(receipt.toJSON()));
  const cli = (...args) => spawnSync(process.execPath, ['bin/stepreceipt.mjs', input, ...args], { encoding: 'utf8' });
  assert.equal(cli('--summary', output, '--check').status, 1);
  assert.match(await readFile(output, 'utf8'), /gate: blocked/);
  assert.equal(cli('--summary', output, '--check').status, 2);
  await receipt.verify(step.id, () => ({ status: 'verified', summary: 'Found one saved record.' }));
  await writeFile(input, JSON.stringify(receipt.toJSON()));
  assert.equal(cli('--check').status, 0);
  assert.equal(cli('--check', '--check').status, 2);
  await writeFile(input, '{"password":"fictional-private-value",BAD}');
  const invalid = cli('--check');
  assert.equal(invalid.status, 2);
  assert.ok(!invalid.stderr.includes('fictional-private-value'));
});
