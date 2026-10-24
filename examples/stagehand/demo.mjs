import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localBrowser, Stagehand } from '@browserbasehq/stagehand';
import { createReceipt } from '../../src/receipt.mjs';
import { renderReport } from '../../src/report.mjs';
import { renderSummary } from '../../src/summary.mjs';
import { recordPageAction } from '../../src/playwright.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(resolve(here, 'fixture.html'));
const server = createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fixture);
});
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});

let browser;
let stagehand;
try {
  browser = await localBrowser.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  });
  stagehand = await Stagehand.create({ browser });
  const [page] = await browser.context.pages();
  if (!page) throw new Error('Stagehand did not open a page.');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The fixture server did not bind a TCP port.');
  await page.goto(`http://127.0.0.1:${address.port}/`);

  const receipt = createReceipt({ title: 'Stagehand action outcomes' });
  const save = await recordPageAction(receipt, page, {
    label: 'Save the fixture record',
    kind: 'write',
    action: () => page.locator('#save').click(),
  });
  assert.equal(save.ok, true);
  await receipt.verify(save.id, async () => {
    const saved = await page.evaluate(() =>
      document.querySelector('#save-status')?.textContent === 'Saved'
    );
    return {
      status: saved ? 'verified' : 'rejected',
      summary: saved ? 'The fixture shows the saved state.' : 'The saved state was not observed.',
    };
  });

  const noOp = await recordPageAction(receipt, page, {
    label: 'Click the no-op button',
    kind: 'write',
    action: () => page.locator('#noop').click(),
  });
  assert.equal(noOp.ok, true);
  await receipt.verify(noOp.id, async () => {
    const completed = await page.evaluate(() =>
      document.querySelector('#noop-status')?.textContent === 'Done'
    );
    return {
      status: completed ? 'verified' : 'rejected',
      summary: completed ? 'The fixture shows the requested state.' : 'The requested state was not observed.',
    };
  });

  const run = receipt.toJSON();
  assert.equal(run.steps[0].verification.status, 'verified');
  assert.equal(run.steps[0].pageEvidence.outcome, 'changed');
  assert.equal(run.steps[1].verification.status, 'rejected');
  assert.equal(run.steps[1].pageEvidence.outcome, 'no_visible_change');

  const artifacts = resolve(here, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  await writeFile(resolve(artifacts, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  await writeFile(resolve(artifacts, 'report.html'), renderReport(run));
  await writeFile(resolve(artifacts, 'summary.md'), renderSummary(run));
  process.stdout.write('PASS: Stagehand Page clicks completed; the independent checks verified Save and rejected the no-op.\n');
} finally {
  try {
    await stagehand?.close();
  } finally {
    try {
      await browser?.close();
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  }
}
