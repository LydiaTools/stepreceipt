import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createReceipt } from '../src/receipt.mjs';
import { recordPageAction, recordPageClick } from '../src/playwright.mjs';

const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const fixture = '<!doctype html><title>Same synthetic page</title><button id="save">Save</button><p id="state">Pending</p><script>document.querySelector("#save").onclick=()=>document.querySelector("#state").textContent="Saved"</script>';
  await first.setContent(fixture);
  await second.setContent(fixture);
  assert.notEqual(first, second);
  assert.equal(first.url(), second.url());
  await second.bringToFront();

  const receipt = createReceipt({ title: 'Two same-URL tabs' });
  const bound = await recordPageClick(receipt, first, { label: 'Save on first page', selector: '#save' });
  assert.equal(bound.ok, true);
  assert.equal(await first.locator('#state').textContent(), 'Saved');
  assert.equal(await second.locator('#state').textContent(), 'Pending');
  assert.equal(bound.pageEvidence.outcome, 'changed');
  assert.equal(receipt.toJSON().steps[0].verification.status, 'unknown');
  assert.ok(!JSON.stringify(receipt.toJSON()).includes('#save'));

  await first.setContent('<button class="duplicate">A</button><button class="duplicate">B</button><p id="state">Pending</p><script>document.querySelectorAll("button").forEach(b=>b.onclick=()=>document.querySelector("#state").textContent="Saved")</script>');
  const duplicate = await recordPageClick(receipt, first, { label: 'Ambiguous target', selector: '.duplicate' });
  assert.equal(duplicate.ok, false);
  assert.equal(await first.locator('#state').textContent(), 'Pending');
  assert.equal(receipt.toJSON().steps[1].verification.status, 'unknown');

  const missing = await recordPageClick(receipt, first, { label: 'Missing target', selector: '#missing' });
  assert.equal(missing.ok, false);
  assert.equal(await first.locator('#state').textContent(), 'Pending');

  await first.setContent(fixture);
  const oldStyle = await recordPageAction(receipt, first, { label: 'Unbound callback', kind: 'write', action: () => second.locator('#save').click() });
  assert.equal(oldStyle.ok, true);
  assert.equal(oldStyle.pageEvidence.outcome, 'no_visible_change');
  assert.equal(await first.locator('#state').textContent(), 'Pending');
  assert.equal(await second.locator('#state').textContent(), 'Saved');
  assert.equal(receipt.toJSON().steps[3].verification.status, 'unknown');

  await first.close();
  const closed = await recordPageClick(receipt, first, { label: 'Closed target', selector: '#save' });
  assert.equal(closed.ok, false);
  assert.equal(closed.pageEvidence.outcome, 'unavailable');
  assert.equal(receipt.toJSON().steps[4].verification.status, 'unknown');
  console.log('PASS: two identical-URL pages, bound click, ambiguous and missing targets, unbound callback, closed page');
} finally {
  await browser.close();
}
