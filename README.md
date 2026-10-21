# StepReceipt

**“Save” timed out. Do you click it again?**

The error tells you what happened to the tool. You still need to know what happened on the page.

StepReceipt puts each browser action beside an explicit follow-up check, then turns the run into a standalone HTML report. A normal return stays **unknown** until you check it. A timeout can sit beside a successful readback. You can see both before deciding what to do next.

**[Open the live report](https://lydiatools.github.io/stepreceipt/)** · [中文说明](README.zh-CN.md) · [Download v0.4.0](https://github.com/LydiaTools/stepreceipt/releases/tag/v0.4.0)

![Actual viewer replay of three synthetic local-browser reports: saved after timeout, false confirmation, and unavailable readback](docs/assets/three-outcomes.gif)

*Recorded from the real report viewer using three committed synthetic local-browser runs. Each fixture made one POST with no retry. [Static timeout screenshot](docs/assets/report-focus.png) · [Capture and reproduction notes](docs/DEMO.md).*

## Three things you can keep separate

| Question | What StepReceipt records |
| --- | --- |
| What did I ask the tool to do? | A named read or write, its timing, and its tool return status |
| What did I actually check? | An explicit observation marked `verified`, `rejected`, or `unknown` |
| What can I share for review? | A local JSON file and a self-contained HTML report, with English and Chinese controls |

The recorder calls each action once. It has no automatic retry or replay mechanism. Your code supplies the observation; StepReceipt does not independently prove it or prevent another part of your system from retrying.

## Quick start

Node.js 20+ is enough to render a report. No install, model, account, or API key is needed for this step:

```bash
git clone https://github.com/LydiaTools/stepreceipt.git
cd stepreceipt
node bin/stepreceipt.mjs examples/save-timeout.json --out receipt.html
```

Open `receipt.html` in your browser. You can also open a run JSON in the [online viewer](https://lydiatools.github.io/stepreceipt/). The viewer reads it in the page; there is no upload endpoint or analytics code. GitHub Pages still receives ordinary page requests.

The CLI refuses to overwrite an existing output file. Choose a new filename for another report.

## Install the CLI or library from GitHub

The package is not published to the npm registry. You can install the current GitHub source directly with Node.js 20+ and Git:

```bash
npm install -g github:LydiaTools/stepreceipt
stepreceipt path/to/run.json --out receipt.html
```

To use the recorder in a Node.js project:

```bash
npm install github:LydiaTools/stepreceipt
```

Then import the public entry points:

```js
import { createReceipt } from 'stepreceipt';
import { renderReport } from 'stepreceipt/report';
```

Installing from GitHub avoids implying that the package is available through the npm registry.

## Run the browser example yourself

This example starts its own localhost fixture and a fresh, isolated browser. It does not connect to your signed-in Chrome session or a real site.

```bash
npm ci
npx playwright install chromium
npm run demo
```

If Google Chrome is already installed, you can use it without downloading a browser:

```bash
# macOS / Linux
BROWSER_CHANNEL=chrome npm run demo
```

PowerShell: `$env:BROWSER_CHANNEL="chrome"; npm run demo`.

Open `artifacts/demo/report.html`. The matching `run.json` contains the recorded tool error and the later observation. The expected fixture result is **one write request and one saved record**.

## Put recorded checks in CI

```bash
node bin/stepreceipt.mjs artifacts/demo/run.json --summary receipt-summary.md --check
```

The summary is Markdown, suitable for a GitHub Actions job summary. `--check` exits **0** only when a non-empty run has every observation marked `verified`; **1** for any `rejected`/`unknown` observation or an empty run; **2** for invalid input, arguments, or output errors. A verified readback can accompany a tool error. Generating a report without `--check` does not apply this gate.

The gate evaluates recorded checks; it does not independently inspect your application or prevent a caller from supplying a misleading observation. [CI recipe and boundaries](docs/CI.md).

Three real-browser cases run in `npm run test:e2e`, each against its own synthetic local service:

| Tool / page signal | Separate readback | Recorded-check gate | Actual report |
| --- | --- | --- | --- |
| Timeout after Save | Exactly one matching record | Passed | [Saved after timeout](https://lydiatools.github.io/stepreceipt/) |
| Page says “Saved successfully” | No saved record; storage returned 503 | Blocked | [False confirmation](https://lydiatools.github.io/stepreceipt/cases/rejected-write.html) |
| Timeout after Save | Readback returned 503; count unavailable | Blocked, unknown | [Unavailable readback](https://lydiatools.github.io/stepreceipt/cases/unknown-readback.html) |

Each case makes exactly one POST. Our [actual workflow](.github/workflows/test.yml) adds all three summaries and retains the synthetic HTML/JSON reports as a short-lived Actions artifact. The negative cases are expected to block; the test suite checks their CLI exit codes.

![Actual false-confirmation case: the tool returned normally while the separate check found no saved record](docs/assets/rejected-write.png)

## A real LangGraph process restart

**The graph returned normally. It saved the same draft twice.** An optional, provider-free example kills a Python process after the business commit and resumes the same thread in a new process. Ordinary insert: **2 attempts, 2 drafts**. A target-side unique operation key: **2 attempts, 1 draft**. A completed-node control stays at **1 attempt, 1 draft**.

[Run all three cases](docs/LANGGRAPH.md) · [Open the duplicate report](https://lydiatools.github.io/stepreceipt/langgraph/crash-replay.html) · [Open the target-deduplication report](https://lydiatools.github.io/stepreceipt/langgraph/target-dedup.html). This example is included in v0.3.0; the fixed v0.2.0 ZIP predates it. StepReceipt records the difference; the target database performs the deduplication.

![Actual synthetic LangGraph restart report: the resumed worker returned normally; independent readback found two drafts and failed the exactly-one-draft check](docs/assets/langgraph-replay.png)

## Put a recovery gate and a receipt in the same browser run

The [optional Blueprint integration](docs/BLUEPRINT-INTEGRATION.md) connects Browser Agent Blueprint's pinned write-ahead controller to StepReceipt's real browser action, separate readback, CLI gate, and HTML report. It runs three local synthetic cases: a saved draft whose UI confirmation times out, a failed readback that must stay unknown, and an unguarded retry that creates a duplicate. The first two reload the journal into a fresh controller and show whether another dispatch is refused.

![Actual report from the saved-timeout fixture: the browser timed out, readback verified one saved record, and the reloaded controller refused another dispatch](docs/assets/blueprint/saved-timeout.png)

[Open the saved-timeout report](https://lydiatools.github.io/stepreceipt/cases/blueprint-saved-timeout.html) · [Open the unknown-readback report](https://lydiatools.github.io/stepreceipt/cases/blueprint-unknown-readback.html) · [Open the unguarded-retry report](https://lydiatools.github.io/stepreceipt/cases/blueprint-unguarded-retry.html)

```bash
npm ci
npx playwright install chromium
npm run demo:blueprint -- --out artifacts/blueprint-demo
```

Open each generated `report.html` and `summary.md` under `artifacts/blueprint-demo/`. The checked-in CI test also captures the actual English and Chinese reports at desktop and mobile sizes. This is a same-process journal reload; the separate [LangGraph example](docs/LANGGRAPH.md) covers a real process restart. Neither local fixture proves behavior on a production website.

[English reproduction guide](docs/BLUEPRINT-INTEGRATION.md) · [中文复现指南](docs/BLUEPRINT-INTEGRATION.zh-CN.md)

## Use it in your Node.js project

After installing the package from GitHub as shown above, import the recorder. It has zero runtime dependencies:

```js
import { createReceipt } from 'stepreceipt';
import { renderReport } from 'stepreceipt/report';
import { writeFile } from 'node:fs/promises';

const receipt = createReceipt({ title: 'Save a draft' });
const step = await receipt.attempt(
  { label: 'Save the draft', kind: 'write' },
  async () => {
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByText('Saved successfully').waitFor();
  },
);

// Supply a separate read-only check, including after a tool error.
await receipt.verify(step.id, async () => {
  const found = await page.getByText('Draft #42').isVisible();
  return {
    status: found ? 'verified' : 'unknown',
    summary: found ? 'Draft #42 is visible.' : 'Draft #42 was not observed.',
  };
});

await writeFile('run.json', JSON.stringify(receipt.toJSON(), null, 2));
await writeFile('receipt.html', renderReport(receipt.toJSON()));
```

`attempt()` captures an action error and returns `{ id, ok, value }`; it does **not** rethrow the action error. Check `ok`, inspect the observation, and explicitly decide whether the workflow should continue. Observer errors remain `unknown`. Verifying a step a second time is rejected; record a new observation step if you need another check.

## What v0.4.0 is ready for

- Rendering your recorded actions and checks into a portable review report.
- Opening and exporting run JSON locally in a browser, with no backend.
- Trying the included real-browser timeout/readback fixture.
- Producing Markdown CI summaries and applying a recorded-observation gate, with three reproducible browser cases.
- Connecting a pinned browser write-ahead guard to a separately recorded browser outcome and report.
- Keeping raw error messages, stacks, page contents, and network traffic out of automatic capture. Only the error class is recorded.
- Redacting a few common credential patterns from exported text. This is heuristic redaction, not complete detection; labels and observations can still contain private information.

It is not a Playwright `trace.zip` viewer, a cryptographically signed audit trail, or a replacement for site-specific assertions. Native browser-use, Stagehand, Codex, and MCP adapters have **not** been tested. The JavaScript callback and JSON interfaces are the current integration points. The package is not published on npm. The Blueprint integration is a development example; the core recorder still has zero runtime dependencies.

## Development and evidence

```bash
npm test
# After installing a Playwright browser, or with BROWSER_CHANNEL=chrome:
npm run test:e2e
```

See [the run format](docs/FORMAT.md), [validation](docs/VALIDATION.md), and [why this small scope](docs/RESEARCH.md). The report shows observations supplied by the integration, including their limitations; it does not turn a claim into independent evidence.

If a report is misleading or an integration is hard to use, [open an issue](https://github.com/LydiaTools/stepreceipt/issues). Share a small synthetic example rather than a private session. If you want to follow the next integration, a Star is a useful way to keep track.

MIT. Built by [LydiaTools](https://github.com/LydiaTools). The related [Browser Agent Blueprint](https://github.com/LydiaTools/browser-agent-blueprint) contains prompt modules and local recovery scenarios; StepReceipt is the executable recorder and report tool.
