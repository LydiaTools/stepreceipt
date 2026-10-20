#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { renderReport } from '../src/report.mjs';
import { renderSummary, summarizeRun } from '../src/summary.mjs';

const args = process.argv.slice(2);
const help = 'Usage: node bin/stepreceipt.mjs run.json [--out report.html | --summary report.md] [--check]\n--check exits 1 for an empty run or any rejected/unknown observation; invalid input exits 2.\nNo actions are run. Existing output files are not overwritten.';
if (args.includes('--help')) { console.log(help); process.exit(0); }
try {
  const input = args.shift();
  if (!input || input.startsWith('--')) throw new Error(help);
  let format, output, check = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--check' && !check) { check = true; continue; }
    if (!['--out', '--summary'].includes(flag) || format || !args[0] || args[0].startsWith('--')) throw new Error(help);
    format = flag; output = args.shift();
  }
  if (!format && !check) throw new Error(help);
  if ((await stat(input)).size > 2 * 1024 * 1024) throw new Error('Input exceeds the 2 MB limit.');
  const raw = await readFile(input, 'utf8');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Input is not valid JSON.'); }
  const { run, counts, passed } = summarizeRun(parsed);
  if (format) {
    await writeFile(output, format === '--out' ? renderReport(run) : renderSummary(run), { flag: 'wx' });
    console.log(`Report written to ${output}`);
  }
  if (check) {
    console.log(`Recorded-check gate: ${passed ? 'passed' : 'blocked'} (${counts.verified}/${counts.total} verified; ${counts.rejected} rejected; ${counts.unknown} unknown).`);
    if (!passed) process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
