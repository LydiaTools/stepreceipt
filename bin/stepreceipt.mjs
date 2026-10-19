#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { renderReport } from '../src/report.mjs';

const args = process.argv.slice(2);
const help = 'Usage: node bin/stepreceipt.mjs run.json --out report.html\nNo dependencies, server, API key, or model needed. Existing output files are not overwritten.';
if (args.includes('--help')) { console.log(help); process.exit(0); }
try {
  if (args.length !== 3 || args[1] !== '--out') throw new Error(help);
  if ((await stat(args[0])).size > 2 * 1024 * 1024) throw new Error('Input exceeds the 2 MB limit.');
  const run = JSON.parse(await readFile(args[0], 'utf8'));
  await writeFile(args[2], renderReport(run), { flag: 'wx' });
  console.log(`Report written to ${args[2]}`);
} catch (error) { console.error(error.message); process.exitCode = 2; }
