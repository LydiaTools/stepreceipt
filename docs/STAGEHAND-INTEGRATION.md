# Stagehand v4.3.0 integration

StepReceipt's optional page adapter needs a browser page with `evaluate()`. Stagehand v4 exposes that method on its `Page`, so you can wrap a Stagehand action without adding Stagehand to StepReceipt's core dependencies.

The runnable example is pinned to Stagehand 4.3.0 and uses Stagehand's Playwright-compatible `Page.locator().click()` API. It does not call the LLM-backed `stagehand.act()` method, so it needs no model key or Browserbase account. A local fixture contains one button that changes state and one button that does nothing. The report separates the browser call result, observed page signals, and an independent state check.

## Run it

Requirements: Node.js 22.18+ and a local Chrome or Chromium installation. If Stagehand does not find your browser, set `CHROME_PATH` to its executable.

```bash
cd examples/stagehand
npm ci
npm run demo
```

The example serves `fixture.html` on an ephemeral loopback port and launches a new headless browser. It makes no request to a production website and needs no model or Browserbase credentials. Reports are written under `examples/stagehand/artifacts/`.

Expected result:

| Action | Stagehand call | Page signals | Independent check |
| --- | --- | --- | --- |
| Save button | Stagehand Page click returned | `changed` | `verified` |
| No-op button | Stagehand Page click returned | `no_visible_change` | `rejected` |

The no-op case shows why a successful browser call is not the same as a completed task. The example verifies compatibility with this Stagehand version and synthetic page; it does not establish reliability on production websites or prove business outcomes.

## Integration pattern

```js
const step = await recordPageAction(receipt, page, {
  label: 'Save the fixture record',
  kind: 'write',
  action: () => page.locator('#save').click(),
});

await receipt.verify(step.id, async () => {
  const saved = await page.evaluate(() =>
    document.querySelector('#save-status')?.textContent === 'Saved'
  );
  return {
    status: saved ? 'verified' : 'rejected',
    summary: saved ? 'The fixture shows the saved state.' : 'The saved state was not observed.',
  };
});
```

The page-signal adapter remains diagnostic context. The integration does not convert a DOM delta into a task verdict, retry an action, or claim the target application persisted a write. See [adapter boundaries](PLAYWRIGHT.md).

To wrap `stagehand.act(...)` instead, initialize Stagehand with a supported model and its API credentials. The local example does not call that model-backed method, so it does not validate provider configuration or AI action selection.
