# Playwright page signals

StepReceipt's optional Playwright adapter records a small before/after signal around one action. It does not decide whether the business task succeeded.

## Use it

```js
import { createReceipt } from 'stepreceipt';
import { recordPageAction } from 'stepreceipt/playwright';

const receipt = createReceipt({ title: 'Publish a draft' });
const step = await recordPageAction(receipt, page, {
  label: 'Save the draft',
  kind: 'write',
  action: () => page.getByRole('button', { name: 'Save' }).click(),
});

// `step.ok` describes the tool call, not the page result.
await receipt.verify(step.id, async () => {
  const saved = await page.getByText('Draft saved').isVisible();
  return {
    status: saved ? 'verified' : 'unknown',
    summary: saved ? 'The independent check passed.' : 'The expected state was not observed.',
  };
});
```

The callback runs once. The adapter samples the page before and as soon as the callback settles, then adds `pageEvidence` to the same StepReceipt step. If the UI updates asynchronously, await the relevant page state inside the callback so the after-sample observes the settled page. If either capture fails, the action still runs once and the page evidence is marked unavailable or partial. It never retries or replays the action.

## What is recorded

The report shows whether these signals changed:

- `url`: a temporary fingerprint of the full URL changed.
- `title`: a temporary fingerprint of the document title changed.
- `visible_text`: the sampled visible text fingerprint or total text length changed. The fingerprint covers up to 65,536 characters distributed through the page text.
- `controls`: the count of buttons, form controls and links changed.

The raw URL, title, page text and fingerprints are not included in the receipt or report. The fingerprints are non-cryptographic equality checks; they are not signatures, evidence of identity, or proof of correctness. The visible-text sample can miss a small edit between sampled positions when total text length stays the same.

`changed` means one or more sampled page signals differed. `no_visible_change` means none differed. Neither is a task verdict: a DOM change can be unrelated to the goal, and a server-side effect can occur without a visible change. Keep a separate, task-specific `receipt.verify()` check. Without one, the result stays `unknown`.

## Tested scope

The adapter is tested with a local synthetic Playwright page. It has not been tested against production sites or as a native browser-use, Stagehand, Codex, or MCP integration. It needs a Playwright-compatible `page.evaluate()` method and adds no runtime dependency to StepReceipt.
