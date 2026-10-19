import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createReceipt } from '../src/receipt.mjs';
import { renderReport } from '../src/report.mjs';

const form = (scenario) => `<!doctype html><meta charset="utf-8"><title>StepReceipt local fixture</title>
<style>body{font:18px/1.6 system-ui;max-width:650px;margin:65px auto;padding:25px;color:#142640}input,button{font:inherit;padding:12px}input{width:75%}button{background:#265ed7;color:white;border:0;border-radius:5px}small{color:#53647b;display:block;margin:20px 0}</style>
<small>StepReceipt / Synthetic local fixture / No real account / ${scenario}</small><h1>Save a draft</h1><input id="title" aria-label="Draft title" value="Garden checklist"><button id="save">Save</button><p id="status">Ready</p>
<script>document.getElementById('save').onclick=async()=>{document.getElementById('status').textContent='Saving…';const r=await fetch('/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.getElementById('title').value})});await r.json();${scenario === 'rejected-write' ? "document.getElementById('status').textContent='Saved successfully';/* Intentionally wrong: UI ignores the failed HTTP response. */" : '/* Intentionally missing confirmation after the write committed. */'}}</script>`;

export async function runBrowserDemo({ outDir = 'artifacts/demo', channel = process.env.BROWSER_CHANNEL, scenario = 'saved-timeout' } = {}) {
  const titles = {
    'saved-timeout': 'Save timed out. The record was there.',
    'rejected-write': 'The page said Saved. No record was there.',
    'unknown-readback': 'Save timed out. Readback was unavailable.',
  };
  if (!Object.hasOwn(titles, scenario)) throw new TypeError('Unknown local scenario.');
  const records = [];
  let posts = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/records' && req.method === 'POST') {
      posts += 1;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      if (scenario === 'rejected-write') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"Synthetic storage outage"}'); return; }
      records.push({ id: records.length + 1, title: input.title });
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(records.at(-1))); return;
    }
    if (req.url === '/records' && req.method === 'GET') {
      if (scenario === 'unknown-readback') { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end('{"error":"Synthetic readback outage"}'); return; }
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(records)); return;
    }
    if (req.url === '/saved') {
      if (scenario === 'unknown-readback') { res.writeHead(503, { 'Content-Type': 'text/html' }); res.end('<h1>Synthetic readback outage</h1>'); return; }
      res.setHeader('Content-Type','text/html');
      res.end(`<!doctype html><meta charset="utf-8"><style>body{font:22px/1.7 system-ui;color:#142640;margin:70px}small{font-size:16px;color:#53647b}li{padding:20px;background:#eaf6ef;max-width:600px}</style><small>Synthetic local fixture · readback after the timeout</small><h1>Saved records: ${records.length}</h1><ol>${records.map((r)=>`<li>Record #${r.id} — Garden checklist</li>`).join('')}</ol>`); return;
    }
    if (req.url !== '/' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type','text/html'); res.end(form(scenario));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage();
    const receipt = createReceipt({ title: titles[scenario] });
    const open = await receipt.attempt({ label: 'Open the draft', kind: 'read' }, () => page.goto(origin));
    await receipt.verify(open.id, async () => ({ status: await page.locator('#title').isVisible() ? 'verified' : 'rejected', summary: 'The draft form is visible on the synthetic local page.' }));
    const save = await receipt.attempt({ label: 'Save the draft', kind: 'write' }, async () => {
      await page.locator('#save').click();
      await page.locator('#status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 600 });
    });
    await receipt.verify(save.id, async () => {
      const response = await page.request.get(`${origin}/records`);
      if (!response.ok()) return { status: 'unknown', summary: `The separate GET returned HTTP ${response.status()}. No record count could be observed. The Save action was not retried.` };
      const saved = await response.json();
      const matched = saved.length === 1 && saved[0].title === 'Garden checklist';
      return { status: matched ? 'verified' : 'rejected', summary: `A separate GET found ${saved.length} saved ${saved.length === 1 ? 'record' : 'records'}. ${matched ? 'Record #1 contains “Garden checklist”.' : 'The required record was absent.'} The Save action was not retried.` };
    });
    const read = await receipt.attempt({ label: 'Read back the saved record', kind: 'read' }, () => page.goto(`${origin}/saved`));
    await receipt.verify(read.id, async () => {
      if (!read.value?.ok()) return { status: 'unknown', summary: 'The saved-record page was unavailable. This read cannot establish the write outcome.' };
      const heading = await page.locator('h1').textContent();
      return { status: /^Saved records: \d+$/.test(heading) ? 'verified' : 'unknown', summary: `The readback page displays “${heading}”. This checks that the count is readable; the save requirement is evaluated in the write step.` };
    });
    const run = receipt.toJSON();
    const output = resolve(outDir); await mkdir(output, { recursive: true });
    await writeFile(`${output}/run.json`, JSON.stringify(run, null, 2) + '\n');
    await writeFile(`${output}/report.html`, renderReport(run));
    await page.screenshot({ path: `${output}/fixture-readback.png` });
    return { run, posts, records: records.length, output, scenario };
  } finally { await browser?.close(); await new Promise((r) => server.close(r)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = await runBrowserDemo(); console.log(JSON.stringify(result, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
