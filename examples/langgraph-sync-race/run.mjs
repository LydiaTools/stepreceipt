import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  {
    id: 'completed-control', title: 'Completed task: restart without replay.', crash: false,
    expectedEffects: { '0': 1 }, expectedAttempts: { '0': 1 }, gate: 0,
  },
  {
    id: 'race-replay', title: 'Task write is still pending when the checkpoint advances.', crash: true,
    expectedEffects: { '0': 1, '1': 2, '2': 1 }, expectedAttempts: { '0': 1, '1': 2, '2': 1 }, gate: 1,
  },
  {
    id: 'ordered-write-control', title: 'Control: persist the task write before the same crash cut.', crash: true,
    expectedEffects: { '0': 1, '1': 1, '2': 1 }, expectedAttempts: { '0': 1, '1': 1, '2': 1 }, gate: 0,
  },
  {
    id: 'stable-key-control', title: 'Control: commit a stable operation key with the effect.', crash: true,
    expectedEffects: { '0': 1, '1': 1, '2': 1 }, expectedAttempts: { '0': 1, '1': 2, '2': 1 }, gate: 0,
  },
];

async function child(python, directory, caseId, phase) {
  try {
    const { stdout } = await exec(python, [join(here, 'worker.py'), directory, caseId, phase], {
      env: workerEnv(), timeout: 30000, maxBuffer: 128 * 1024,
    });
    return { code: 0, data: JSON.parse(stdout) };
  } catch (error) {
    if (Number.isInteger(error.code) && !error.killed) {
      return { code: error.code, diagnostic: String(error.stderr ?? '').slice(-1200) };
    }
    throw error;
  }
}

function workerEnv() {
  const env = {};
  for (const key of ['PATH', 'HOME', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    LANGSMITH_TRACING: 'false', LANGCHAIN_TRACING_V2: 'false',
    PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1',
  });
  return env;
}

async function expectedCheck(receipt, step, condition, passed, failed) {
  await receipt.verify(step.id, async () => ({ status: condition ? 'verified' : 'rejected', summary: condition ? passed : failed }));
}

async function runTrial(python, output, spec, trialNumber, receipt) {
  const directory = join(output, 'trials', `trial-${String(trialNumber).padStart(2, '0')}`);
  await mkdir(directory, { recursive: true });

  let first;
  const start = await receipt.attempt({ label: `Trial ${trialNumber}: start graph and reach the controlled cut`, kind: 'write' }, async () => {
    first = await child(python, directory, spec.id, 'start');
    if (first.code !== 0) { const error = new Error('Worker process exited.'); error.name = 'WorkerExit'; throw error; }
  });
  let events = [];
  try {
    events = (await readFile(join(directory, 'events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`Worker produced no event log (exit ${first.code}): ${first.diagnostic ?? 'no worker diagnostic'}`);
  }
  const reachedCut = spec.crash
    ? first.code === 73 && events.some((event) => event.event === (spec.id === 'ordered-write-control'
      ? 'checkpoint_attempted_after_task_write' : 'checkpoint_attempted_while_task_write_blocked'))
    : first.code === 0 && events.some((event) => event.event === 'graph_returned' && event.phase === 'start');
  await expectedCheck(receipt, start, reachedCut,
    spec.crash ? `Observed the controlled exit 73 at the intended ${spec.id === 'ordered-write-control' ? 'after-write' : 'write-pending'} checkpoint cut.` : 'The completed control returned normally.',
    'The worker did not stop at the requested deterministic control point.');

  const checkpoint = await child(python, directory, spec.id, 'inspect-checkpoint');
  assert.equal(checkpoint.code, 0, checkpoint.diagnostic);
  const checkpointData = checkpoint.data;
  const checkpointExpected = spec.id === 'completed-control'
    ? checkpointData.checkpoint_sequence === 1
    : checkpointData.checkpoint_sequence === 1 && (spec.id === 'ordered-write-control'
      ? checkpointData.current_pending_write_count > 0
      : checkpointData.current_pending_write_count === 0);
  const checkpointStep = await receipt.attempt({ label: `Trial ${trialNumber}: read checkpoint and pending task writes`, kind: 'read' }, async () => checkpointData);
  await expectedCheck(receipt, checkpointStep, checkpointExpected,
    `Separate read-only inspection found checkpoint sequence ${checkpointData.checkpoint_sequence} and ${checkpointData.current_pending_write_count} pending task writes.`,
    'The separate checkpoint inspection did not match the expected sequence/write state.');

  let resumed;
  const resume = await receipt.attempt({ label: `Trial ${trialNumber}: resume this thread in a fresh process`, kind: 'write' }, async () => {
    resumed = await child(python, directory, spec.id, 'resume');
    if (resumed.code !== 0) { const error = new Error('Resume worker did not return normally.'); error.name = 'WorkerExit'; throw error; }
    assert.deepEqual(resumed.data.pending, []);
    return resumed.data;
  });
  await expectedCheck(receipt, resume, resume.ok && resumed?.code === 0,
    'The resumed graph returned normally and reported no pending next node.',
    'The resumed graph failed or did not complete the expected thread.');

  const business = await child(python, directory, spec.id, 'inspect-business');
  assert.equal(business.code, 0, business.diagnostic);
  const result = business.data;
  const businessMatches = JSON.stringify(result.effects_by_sequence) === JSON.stringify(spec.expectedEffects)
    && JSON.stringify(result.attempts_by_sequence) === JSON.stringify(spec.expectedAttempts);
  const businessStep = await receipt.attempt({ label: `Trial ${trialNumber}: independently read committed effects`, kind: 'read' }, async () => result);
  const exactMeasurement = businessMatches;
  await receipt.verify(businessStep.id, async () => ({
    status: spec.id === 'race-replay' ? 'rejected' : exactMeasurement ? 'verified' : 'rejected',
    summary: spec.id === 'race-replay' && exactMeasurement
      ? `The negative case reproduced as designed: ${result.effects_by_sequence['1']} committed effects for logical sequence 1. The exactly-one-effect check correctly blocks this run.`
      : exactMeasurement
        ? `Readback matched the control: effects ${JSON.stringify(result.effects_by_sequence)}; action attempts ${JSON.stringify(result.attempts_by_sequence)}.`
        : `Readback did not match this case's expected effect/attempt counts: effects ${JSON.stringify(result.effects_by_sequence)}; attempts ${JSON.stringify(result.attempts_by_sequence)}.`,
  }));

  return {
    trial: trialNumber, firstExit: first.code, checkpoint: checkpointData,
    resumeExit: resumed.code, versions: resumed.data.versions,
    effects: result.effects_by_sequence, attempts: result.attempts_by_sequence,
    eventNames: events.map((event) => event.event),
  };
}

async function main() {
  const args = process.argv.slice(2);
  let python = 'python3', out = 'artifacts/langgraph-sync-race';
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || !['--python', '--out'].includes(flag)) throw new TypeError('Usage: node examples/langgraph-sync-race/run.mjs [--python PATH] [--out NEW_DIRECTORY]');
    if (flag === '--python') python = value; else out = value;
  }
  const output = resolve(out);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const all = [];

  for (const spec of cases) {
    const caseDirectory = join(output, spec.id);
    await mkdir(caseDirectory);
    const receipt = createReceipt({ title: spec.title });
    const trials = [];
    for (let trial = 1; trial <= 3; trial += 1) {
      trials.push(await runTrial(python, caseDirectory, spec, trial, receipt));
    }
    const run = receipt.toJSON();
    await writeFile(join(caseDirectory, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(caseDirectory, 'report.html'), renderReport(run), { flag: 'wx' });
    await writeFile(join(caseDirectory, 'summary.md'), renderSummary(run), { flag: 'wx' });
    let gate;
    try { await exec(process.execPath, [join(root, 'bin/stepreceipt.mjs'), join(caseDirectory, 'run.json'), '--check']); gate = 0; }
    catch (error) { if (Number.isInteger(error.code)) gate = error.code; else throw error; }
    assert.equal(gate, spec.gate, `${spec.id}: recorded-check CLI produced an unexpected exit code.`);
    all.push({ case: spec.id, gate, trials });
  }

  const evidence = {
    synthetic: true,
    capturedAt: new Date().toISOString(),
    issue: 'https://github.com/langchain-ai/langgraph/issues/8039',
    framework: 'LangGraph StateGraph with SQLite SqliteSaver',
    versions: { langgraph: '1.2.17', 'langgraph-checkpoint': '4.3.0', 'langgraph-checkpoint-sqlite': '3.1.2' },
    crashCut: 'task put_writes is held; a newer checkpoint put is attempted before the task write is persisted',
    resume: 'same thread and checkpoint database, fresh Python process, invoke(None, durability="sync")',
    network: 'Python socket connect/DNS/sendto events denied by audit hook; no model/provider calls',
    repetitionsPerCase: 3,
    cases: all,
    decision: {
      race_reproduced_three_of_three: all.find((item) => item.case === 'race-replay')?.trials.every((trial) => trial.firstExit === 73 && JSON.stringify(trial.effects) === JSON.stringify(cases[1].expectedEffects) && JSON.stringify(trial.attempts) === JSON.stringify(cases[1].expectedAttempts)) ?? false,
      ordered_control_passed_three_of_three: all.find((item) => item.case === 'ordered-write-control')?.trials.every((trial) => trial.firstExit === 73 && trial.checkpoint.current_pending_write_count > 0 && JSON.stringify(trial.effects) === JSON.stringify(cases[2].expectedEffects) && JSON.stringify(trial.attempts) === JSON.stringify(cases[2].expectedAttempts)) ?? false,
      stable_key_control_passed_three_of_three: all.find((item) => item.case === 'stable-key-control')?.trials.every((trial) => trial.firstExit === 73 && JSON.stringify(trial.effects) === JSON.stringify(cases[3].expectedEffects) && JSON.stringify(trial.attempts) === JSON.stringify(cases[3].expectedAttempts)) ?? false,
      completed_control_passed_three_of_three: all.find((item) => item.case === 'completed-control')?.trials.every((trial) => trial.firstExit === 0 && JSON.stringify(trial.effects) === JSON.stringify(cases[0].expectedEffects) && JSON.stringify(trial.attempts) === JSON.stringify(cases[0].expectedAttempts)) ?? false,
    },
  };
  evidence.decision.eligible_for_example = Object.values(evidence.decision).every(Boolean);
  assert.equal(evidence.decision.eligible_for_example, true, 'At least one repeated race/control outcome differed from the expected measurement.');
  await writeFile(join(output, 'measurements.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
