import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createReceipt } from '../src/receipt.mjs';
import { renderReport } from '../src/report.mjs';

const form = `<!doctype html><meta charset="utf-8"><title>StepReceipt local fixture</title>
<style>body{font:18px/1.6 system-ui;max-width:650px;margin:65px auto;padding:25px;color:#142640}input,button{font:inherit;padding:12px}input{width:75%}button{background:#265ed7;color:white;border:0;border-radius:5px}small{color:#53647b;display:block;margin:20px 0}</style>
<small>StepReceipt / Synthetic local fixture / No real account</small><h1>Save a draft</h1><input id="title" aria-label="Draft title" value="Garden checklist"><button id="save">Save</button><p id="status">Ready</p>
<script>document.getElementById('save').onclick=async()=>{document.getElementById('status').textContent='Saving…';const r=await fetch('/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.getElementById('title').value})});await r.json();/* Intentionally missing the UI confirmation. The write has already committed. */}</script>`;

export async function runBrowserDemo({ outDir = 'artifacts/demo', channel = process.env.BROWSER_CHANNEL } = {}) {
  const records = [];
  let posts = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/records' && req.method === 'POST') {
      posts += 1;
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString());
      records.push({ id: records.length + 1, title: input.title });
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(records.at(-1))); return;
    }
    if (req.url === '/records' && req.method === 'GET') {
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(records)); return;
    }
    if (req.url === '/saved') {
      res.setHeader('Content-Type','text/html');
      res.end(`<!doctype html><meta charset="utf-8"><style>body{font:22px/1.7 system-ui;color:#142640;margin:70px}small{font-size:16px;color:#53647b}li{padding:20px;background:#eaf6ef;max-width:600px}</style><small>Synthetic local fixture · readback after the timeout</small><h1>Saved records: ${records.length}</h1><ol>${records.map((r)=>`<li>Record #${r.id} — Garden checklist</li>`).join('')}</ol>`); return;
    }
    if (req.url !== '/' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type','text/html'); res.end(form);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage();
    const receipt = createReceipt({ title: 'Save timed out. The record was there.' });
    const open = await receipt.attempt({ label: 'Open the draft', kind: 'read' }, () => page.goto(origin));
    await receipt.verify(open.id, async () => ({ status: await page.locator('#title').isVisible() ? 'verified' : 'rejected', summary: 'The draft form is visible on the synthetic local page.' }));
    const save = await receipt.attempt({ label: 'Save the draft', kind: 'write' }, async () => {
      await page.locator('#save').click();
      await page.locator('#status').filter({ hasText: 'Saved successfully' }).waitFor({ timeout: 600 });
    });
    await receipt.verify(save.id, async () => {
      const saved = await (await page.request.get(`${origin}/records`)).json();
      return { status: saved.length === 1 && saved[0].title === 'Garden checklist' ? 'verified' : 'rejected', summary: `A separate GET found ${saved.length} saved record. Record #1 contains “Garden checklist”. The Save action was not retried.` };
    });
    const read = await receipt.attempt({ label: 'Read back the saved record', kind: 'read' }, () => page.goto(`${origin}/saved`));
    await receipt.verify(read.id, async () => ({ status: await page.locator('h1').textContent() === 'Saved records: 1' ? 'verified' : 'rejected', summary: 'The saved-record page shows exactly one record after the tool timeout.' }));
    const run = receipt.toJSON();
    const output = resolve(outDir); await mkdir(output, { recursive: true });
    await writeFile(`${output}/run.json`, JSON.stringify(run, null, 2) + '\n');
    await writeFile(`${output}/report.html`, renderReport(run));
    await page.screenshot({ path: `${output}/fixture-readback.png` });
    return { run, posts, records: records.length, output };
  } finally { await browser?.close(); await new Promise((r) => server.close(r)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const result = await runBrowserDemo(); console.log(JSON.stringify(result, null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
