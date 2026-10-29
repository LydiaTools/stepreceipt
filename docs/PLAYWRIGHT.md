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

The callback can refer to a different page than the one being sampled. The adapter cannot determine which page an arbitrary callback used. Choose the target explicitly; an `ok` result or a page signal does not prove target identity.

## Click on the selected Playwright page

For a click addressed by a Playwright selector, `recordPageClick` builds and executes the click through the same `Page` object it samples:

This helper is available from the current source; it is not included in earlier fixed releases.

```js
import { recordPageClick } from 'stepreceipt/playwright';

const step = await recordPageClick(receipt, page, {
  label: 'Save the draft',
  selector: 'button[data-action="save"]',
});
```

The selector must match exactly one element; no match or multiple matches records a tool error and does not click. A closed page also records an error. The selector is not added to the receipt. Follow the click with a task-specific `receipt.verify()`; without an explicit check the outcome stays `unknown`.

The caller must select and authorize the correct `Page` object and scope. This helper binds its own click to that object; it does not identify a browser session or remote tool target, freeze navigation, make target checks atomic, or prove that a server-side save happened. It does not fix BrowserSkill or apply to its API. Use `recordPageAction` for other actions, taking care that the callback uses the sampled page.

To run the local two-tab check after installing the development dependencies and a Playwright browser, use `npm run test:page-click`. It compares two distinct synthetic pages with the same URL, including missing, ambiguous, and closed targets.

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
