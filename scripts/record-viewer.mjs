import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Maintainer capture: replay the actual report viewer, without an account or live site.
const root = fileURLToPath(new URL('../', import.meta.url));
const parent = resolve(process.env.STEPRECEIPT_DEMO_DIR ?? join(root, 'artifacts/recordings'));
await mkdir(parent, { recursive: true });
const out = await mkdtemp(join(parent, 'viewer-'));
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const requests = [];
const cases = [
  { file: 'save-timeout.json', count: '3', text: 'Verified', label: 'Saved after timeout' },
  { file: 'rejected-write.json', count: '2', text: 'Check failed', label: 'False confirmation' },
  { file: 'unknown-readback.json', count: '1', text: 'Not verified', label: 'Readback unavailable' },
];
const frames = [];
let video, context;
try {
  context = await browser.newContext({ viewport: { width: 1200, height: 780 }, recordVideo: { dir: out, size: { width: 1200, height: 780 } } });
  const page = await context.newPage();
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(new URL('../docs/index.html', import.meta.url).href);
  await page.locator('main').evaluate((element) => element.scrollIntoView({ block: 'start' }));
  for (const sample of cases) {
    const path = join(root, 'examples', sample.file);
    const bytes = await readFile(path);
    await page.locator('#file').setInputFiles(path);
    assert.equal(await page.locator('#detail h2').textContent(), 'Save the draft');
    assert.equal(await page.locator('#count-verified').textContent(), sample.count);
    assert.equal(await page.locator('#detail .observation:last-child .result').textContent(), sample.text);
    await page.screenshot({ path: join(out, sample.file.replace('.json', '.png')) });
    frames.push({ input: 'examples/' + sample.file, sha256: createHash('sha256').update(bytes).digest('hex'), label: sample.label, observedResult: sample.text });
    // Deliberate reading time for the demo, not a synchronization condition.
    await page.waitForTimeout(3600);
  }
  assert.deepEqual(requests, []);
  video = page.video();
} finally {
  await context?.close();
  await browser.close();
}
const videoPath = join(out, 'viewer-demo.webm');
await rename(await video.path(), videoPath);
const evidence = {
  recordedAt: new Date().toISOString(),
  scope: 'Actual report-viewer playback of three previously generated synthetic local-browser runs; not a new agent run or a production session.',
  viewport: { width: 1200, height: 780 }, externalRequests: requests.length,
  frames, video: videoPath, output: out,
};
await writeFile(join(out, 'capture.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
