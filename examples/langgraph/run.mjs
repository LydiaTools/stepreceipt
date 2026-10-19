import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';
import { renderSummary } from '../../src/summary.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cases = [
  { id: 'completed-control', title: 'Completed node: restart without another write.', crash: false, records: 1, attempts: 1, gate: 0 },
  { id: 'crash-replay', title: 'The process died after Save. Resume made a second draft.', crash: true, records: 2, attempts: 2, gate: 1 },
  { id: 'target-dedup', title: 'The node ran twice. The target kept one draft.', crash: true, records: 1, attempts: 2, gate: 0 },
];

async function main() {
  const args = process.argv.slice(2);
  let python = 'python3', out = 'artifacts/langgraph';
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || !['--python', '--out'].includes(flag)) throw new TypeError('Usage: node examples/langgraph/run.mjs [--python PATH] [--out NEW_DIRECTORY]');
    if (flag === '--python') python = value; else out = value;
  }
  const output = resolve(out);
  // No reuse, cleanup or overwrite of a previous database/run.
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const env = {};
  for (const key of ['PATH', 'HOME', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false', PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' });
  const measured = [];
  for (const spec of cases) {
    const directory = join(output, spec.id);
    await mkdir(directory);
    async function worker(phase) {
      try {
        const result = await exec(python, [join(here, 'worker.py'), directory, spec.id, phase], { env, timeout: 30000, maxBuffer: 128 * 1024 });
        return { code: 0, data: JSON.parse(result.stdout) };
      } catch (error) {
        if (Number.isInteger(error.code) && !error.killed) return { code: error.code, diagnostic: String(error.stderr ?? '').slice(-2000) };
        throw error;
      }
    }
    const receipt = createReceipt({ title: spec.title });
    let first;
    const start = await receipt.attempt({ label: 'Start the graph and save one draft', kind: 'write' }, async () => {
      first = await worker('start');
      if (first.code !== 0) { const e = new Error('Worker exited.'); e.name = 'ProcessExit'; throw e; }
    });
    assert.equal(first.code, spec.crash ? 73 : 0, first.diagnostic);
    assert.equal(start.ok, !spec.crash);
    const before = await worker('inspect');
    assert.equal(before.code, 0, before.diagnostic);
    assert.deepEqual(before.data, { records: 1, matching: 1, nodeAttempts: 1 });
    await receipt.verify(start.id, async () => ({ status: 'verified', summary: `A separate read-only process found exactly one matching draft after the first process ${spec.crash ? 'exited with code 73, before the node returned' : 'completed'}. This checks the saved draft, not graph completion.` }));

    let second;
    const resumed = await receipt.attempt({ label: 'Restart the process and resume the same graph thread', kind: 'write' }, async () => {
      second = await worker('resume');
      if (second.code !== 0) { const e = new Error('Worker exited.'); e.name = 'ProcessExit'; throw e; }
    });
    assert.equal(second.code, 0, second.diagnostic);
    assert.equal(resumed.ok, true);
    assert.equal(second.data.done, true);
    assert.deepEqual(second.data.pending, []);
    const after = await worker('inspect');
    assert.equal(after.code, 0, after.diagnostic);
    assert.deepEqual(after.data, { records: spec.records, matching: spec.records, nodeAttempts: spec.attempts });
    await receipt.verify(resumed.id, async () => ({
      status: after.data.records === 1 && after.data.matching === 1 ? 'verified' : 'rejected',
      summary: `Independent readback: ${after.data.matching} matching ${after.data.matching === 1 ? 'draft' : 'drafts'}; ${after.data.nodeAttempts} node ${after.data.nodeAttempts === 1 ? 'attempt' : 'attempts'}. Expected one draft for this logical operation. ${spec.id === 'target-dedup' ? 'The target database enforces a UNIQUE operation key in the effect transaction. StepReceipt did not deduplicate the write.' : spec.id === 'crash-replay' ? 'Resume returned normally, but created a duplicate. This fixture intentionally exercises unsafe replay.' : 'The completed node was not executed again on this latest-thread resume.'}`,
    }));
    const run = receipt.toJSON();
    await writeFile(join(directory, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(directory, 'report.html'), renderReport(run), { flag: 'wx' });
    await writeFile(join(directory, 'summary.md'), renderSummary(run), { flag: 'wx' });
    let gate;
    try { await exec(process.execPath, [join(root, 'bin/stepreceipt.mjs'), join(directory, 'run.json'), '--check']); gate = 0; }
    catch (error) { if (Number.isInteger(error.code)) gate = error.code; else throw error; }
    assert.equal(gate, spec.gate, 'Recorded-check CLI did not match the expected outcome.');
    measured.push({ case: spec.id, firstExit: first.code, restartExit: second.code, before: before.data, after: after.data, gate, versions: second.data.versions });
  }
  const evidence = { synthetic: true, capturedAt: new Date().toISOString(), durability: 'sync', framework: 'LangGraph StateGraph with SqliteSaver', crashCut: 'business SQLite transaction committed, before node return', network: 'Python socket connect/DNS/sendto denied by audit hook; no model calls', cases: measured };
  await writeFile(join(output, 'measurements.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
