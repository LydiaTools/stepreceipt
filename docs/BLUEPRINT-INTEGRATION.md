# Browser Agent Blueprint + StepReceipt

This optional example connects the pinned `Controller` from [Browser Agent Blueprint](https://github.com/LydiaTools/browser-agent-blueprint/tree/630d773c44cc41f35128d14344a77339906b9504) to a real Playwright action and the StepReceipt run, CLI gate, and report. It uses a synthetic HTTP service on loopback. It does not log into an account, contact an external site, call a model, or claim production reliability.

## Run it

Requirements: Node.js 20+, npm, and a Chromium browser. From the repository root:

```bash
npm ci
npx playwright install chromium
npm run demo:blueprint -- --out artifacts/blueprint-demo
```

If Chrome is already installed, set `BROWSER_CHANNEL=chrome` before the final command. The chosen output directory must not already exist. Each case contains `run.json`, `report.html`, `summary.md`, and `evidence.json`; guarded cases also include the persisted checkpoint and its post-timeout copy. Open the HTML files locally.

To run the assertions, including the offline report-viewer screenshots:

```bash
npm run test:blueprint
```

CI uses a clean `artifacts/blueprint/` directory and retains its reports and screenshots for seven days. No output directory is overwritten.

## What each case establishes

| Case | Observed local event | StepReceipt result |
| --- | --- | --- |
| `saved-timeout` | The browser submits one Save. The service stores one record, then the UI confirmation wait times out. A separate GET finds exactly one record. A fresh controller loads the checksum-checked journal and refuses a new attempt ID for the same operation. | The timeout and verified readback appear as separate facts; the final recorded-check gate passes. |
| `unknown-readback` | The browser submits one Save. The separate GET returns HTTP 503, so the host cannot establish the count. A fresh controller loads the journal and refuses replay while the write remains unresolved. | The outcome stays `unknown`; the recorded-check gate blocks. |
| `unguarded-retry` | A deliberately unguarded negative control submits Save twice; the fixture stores two records. | The exactly-one check is rejected and the recorded-check gate blocks. |

## Actual reports

These screenshots were captured from the generated reports without altering the run data:

![Saved after timeout: one POST, separate readback verified one record, reloaded guard refused replay](assets/blueprint/saved-timeout.png)

[Open the saved-timeout report](cases/blueprint-saved-timeout.html)

![Readback returned HTTP 503; the write remains unknown and replay is refused](assets/blueprint/unknown-readback.png)

[Open the unknown-readback report](cases/blueprint-unknown-readback.html)

![Negative control: the unguarded retry creates two saved records](assets/blueprint/unguarded-retry.png)

[Open the unguarded-retry report](cases/blueprint-unguarded-retry.html)

The fixture records the journal as `DISPATCHED` at the moment the destination receives each guarded POST. It makes no use of a private server counter to claim that a separate read succeeded. In the `unknown-readback` case, the server's internal state is never exposed to the host observation.

The restored controller is a fresh object in the **same operating-system process**. This example does not exercise process termination or worker recovery; see [the separate LangGraph process-restart example](LANGGRAPH.md). The negative control is intentionally outside the Blueprint controller so it can demonstrate an unguarded retry.

The fixed dependency archive points to Blueprint commit `630d773c44cc41f35128d14344a77339906b9504`. This is a test fixture showing how the two libraries can be wired together. It does not measure user adoption, prevent retries by unrelated code, or prove what a third-party website stored.
