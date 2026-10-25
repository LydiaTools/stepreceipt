import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { normalizeRun } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';
import { renderSummary } from '../../src/summary.mjs';

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

async function main() {
  let python = 'python3', chrome, out = 'artifacts/browser-use';
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift(), value = args.shift();
    if (!value || !['--python', '--chrome', '--out'].includes(flag)) throw new TypeError('Use --python PATH --chrome PATH --out NEW_DIRECTORY.');
    if (flag === '--python') python = value;
    else if (flag === '--chrome') chrome = value;
    else out = value;
  }
  if (!chrome) throw new TypeError('Provide --chrome with an installed Chromium-based browser executable.');
  if (python.includes('/') || python.includes('\\')) python = resolve(python);
  const output = resolve(out);
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const env = {};
  for (const key of ['PATH', 'HOME', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' });
  let worker;
  try {
    worker = await exec(python, [join(here, 'worker.py'), '--out', join(output, 'native'), '--chrome', resolve(chrome)], {
      env, cwd: output, timeout: 120000, maxBuffer: 256 * 1024,
    });
  } catch (error) {
    await writeFile(join(output, 'worker.log'), String(error.stderr ?? '') + String(error.stdout ?? ''), { flag: 'wx' });
    throw new Error('The native worker failed; inspect worker.log. No automatic rerun was made.');
  }
  await writeFile(join(output, 'worker.log'), worker.stderr + worker.stdout, { flag: 'wx' });
  const measurements = JSON.parse(await readFile(join(output, 'native/measurements.json'), 'utf8'));
  assert.equal(measurements.version, '0.13.11');
  assert.equal(measurements.cases.length, 4);
  for (const spec of measurements.cases) {
    const directory = join(output, spec.case);
    await mkdir(directory);
    const raw = JSON.parse(await readFile(join(output, 'native', `${spec.case}.json`), 'utf8'));
    const run = normalizeRun(raw);
    assert.deepEqual(run, raw, 'The Python bridge must produce the documented normalized v1 format.');
    assert.equal(run.steps.length, 1);
    assert.equal(run.steps[0].toolStatus, spec.toolStatus);
    assert.equal(run.steps[0].verification.status, spec.verification);
    await writeFile(join(directory, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(directory, 'report.html'), renderReport(run), { flag: 'wx' });
    await writeFile(join(directory, 'summary.md'), renderSummary(run), { flag: 'wx' });
    let gate = 0;
    try { await exec(process.execPath, [join(root, 'bin/stepreceipt.mjs'), join(directory, 'run.json'), '--check']); }
    catch (error) { if (Number.isInteger(error.code)) gate = error.code; else throw error; }
    assert.equal(gate, spec.verification === 'verified' ? 0 : 1);
    spec.gate = gate;
  }
  await writeFile(join(output, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(measurements, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
