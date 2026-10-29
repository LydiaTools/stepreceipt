import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';

const args = process.argv.slice(2);
let python = 'python3', output = 'artifacts/agno';
for (let i = 0; i < args.length; i += 2) {
  if (!args[i + 1] || !['--python', '--out'].includes(args[i])) throw new Error('Usage: node examples/agno/run.mjs [--python PATH] [--out NEW_DIR]');
  if (args[i] === '--python') python = args[i + 1]; else output = args[i + 1];
}
if (python.includes('/') || python.includes('\\')) python = resolve(python);
const out = resolve(output), worker = fileURLToPath(new URL('./worker.py', import.meta.url));
await mkdir(dirname(out), { recursive: true });
await mkdir(out); // Fail rather than overwrite an earlier run.
await mkdir(resolve(out, 'home'));
const rows = []; let modelCalls = 0, posts = 0;
const receipt = createReceipt({ title: 'Synthetic retry with Agno 3.0.10' });
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      modelCalls++;
      if (modelCalls % 2 === 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'scripted local model failure', type: 'server_error' } })); return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `synthetic-${modelCalls}`, object: 'chat.completion', created: 1, model: 'scripted', choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `tool-${modelCalls}`, type: 'function', function: { name: 'save_draft', arguments: JSON.stringify({ title: 'One intended draft' }) } }] } }] })); return;
    }
    if (req.method === 'POST' && req.url === '/records') {
      const chunks = []; for await (const part of req) chunks.push(part);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const write = await receipt.attempt({ label: `Synthetic draft write ${posts + 1}`, kind: 'write' }, async () => {
        posts++; const row = { id: rows.length + 1, title: input.title }; rows.push(row); return 201;
      });
      await receipt.verify(write.id, async () => {
        const response = await fetch(`${origin}/records`), list = await response.json(), count = list.length;
        return { status: response.ok ? (count === 1 ? 'verified' : 'rejected') : 'unknown', summary: `Separate local GET: ${count} draft(s); exactly one was intended.` };
      });
      res.writeHead(write.value, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows.at(-1))); return;
    }
    if (req.method === 'GET' && req.url === '/records') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(rows)); return; }
    res.writeHead(404); res.end();
  } catch (error) { res.writeHead(500); res.end('fixture error'); console.error(error.name); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const child = spawn(python, [worker], { cwd: out, timeout: 20000, env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: resolve(out, 'home'), FIXTURE_ORIGIN: origin, NO_PROXY: '*', no_proxy: '*', PYTHONNOUSERSITE: '1' } });
  let log = ''; child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
  const childExit = await new Promise((done, fail) => { child.on('error', fail); child.on('close', done); });
  const readback = await (await fetch(`${origin}/records`)).json(), run = receipt.toJSON();
  const result = { childExit, modelCalls, postRequests: posts, readbackCount: readback.length, verification: run.steps.map((s) => s.verification.status), workerLog: log };
  await writeFile(resolve(out, 'run.json'), JSON.stringify(run, null, 2) + '\n');
  await writeFile(resolve(out, 'report.html'), renderReport(run));
  await writeFile(resolve(out, 'observation.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (childExit !== 0 || modelCalls !== 4 || posts !== 2 || readback.length !== 2 || !log.includes('result status: RunStatus.error') || (log.match(/synthetic tool returned HTTP 201/g) ?? []).length !== 2 || run.steps.map((s) => s.verification.status).join(',') !== 'verified,rejected') process.exitCode = 1;
} finally { await new Promise((done) => server.close(done)); }
