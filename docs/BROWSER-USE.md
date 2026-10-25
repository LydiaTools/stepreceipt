# browser-use actions, separate outcome checks

[中文](BROWSER-USE.zh-CN.md) · [Python bridge](../integrations/browser-use/stepreceipt_browser_use.py) · [Open the disabled-click report](https://lydiatools.github.io/stepreceipt/browser-use/disabled.html)

**A native click can return normally without saving anything.** This optional Python bridge records a browser-use `ActionResult` beside a check that you supply. It exports the same v1 JSON accepted by the existing StepReceipt CLI and standalone viewer.

## Try four local cases

Use Node.js 20+, Python 3.11+ and an installed Chrome/Chromium executable. The checked run used Python 3.12 and browser-use **0.13.11**, the version currently published on PyPI when checked on October 25, 2026. GitHub also had a 0.13.13 tag; that was not an installable same-version PyPI package at this check.

```bash
git clone https://github.com/LydiaTools/stepreceipt.git
cd stepreceipt
python3 -m venv .venv-browser-use
.venv-browser-use/bin/python -m pip install -r examples/browser-use/requirements.txt
node examples/browser-use/run.mjs \
  --python .venv-browser-use/bin/python \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out artifacts/browser-use-first-run
```

Linux: replace the Chrome path with your installed executable, for example `/usr/bin/google-chrome`. Windows: use `.venv-browser-use\Scripts\python.exe` and your Chrome executable path; put the command on one line in PowerShell. The native Windows workflow has not been exercised here.

Open `artifacts/browser-use-first-run/disabled/report.html`. The output directory must be new: a repeated command refuses to overwrite an existing run **before** launching the worker. Installation downloads Python dependencies; the example makes no model/provider calls and needs no API key. It starts an isolated local browser, not your signed-in session. The runner does not pass provider-key environment variables to its worker, disables browser-use telemetry/cloud sync/version checks/default extensions, and uses a new configuration directory.

| Original synthetic fixture | Native tool return | Separate GET check | POSTs / saved drafts | Recorded-check exit |
| --- | --- | --- | ---: | ---: |
| Disabled button with a click listener | No error | Rejected | 0 / 0 | 1 |
| Enabled button, working storage | No error | Verified | 1 / 1 | 0 |
| POST returns 500, page still says saved | No error | Rejected | 1 / 0 | 1 |
| Save works, readback returns 503 | No error | Unknown | 1 / 1 internally; unavailable to observer | 1 |

The last row's internal fixture count is a test assertion, **not** evidence available to the observer. Its receipt remains unknown. Every case calls `Tools.click` once. A disabled native button produces no POST, so “one action” and “one request” are different counts. The runner asserts actual server counts, bridge-format parity and actual CLI exits; it fails if an expected rejection/unknown starts passing.

![Actual native browser-use disabled-click receipt: the tool returned normally while the independent GET found zero POSTs and zero saved drafts](assets/browser-use/disabled-click.png)

These are actual browser-use **tool-layer** calls against original local fixtures. There is no `Agent.run`, model decision, production website, account operation or overall browser-agent success-rate measurement. StepReceipt does not fix the upstream click behavior, enforce idempotency or block another component's retry.

## Use the bridge with your own checks

The bridge is one dependency-free Python file in this repository, **not a published PyPI package**. Copy the MIT-licensed file into your project or add its directory to your Python path. Your browser-use installation supplies `Tools`, `BrowserSession` and `ActionResult`.

```python
from stepreceipt_browser_use import BrowserUseReceipt

receipt = BrowserUseReceipt("Save one draft")
step = await receipt.attempt(
    label="Click Save", kind="write",
    action=lambda: tools.click(index=save_index, browser_session=session),
)

# Check step["ok"] before continuing your workflow. No automatic retry occurs.
# check_saved_draft is your application's read-only, operation-specific check.
await receipt.verify(step["id"], check_saved_draft)
run = receipt.to_dict()
```

`check_saved_draft` returns `{ "status": "verified" | "rejected" | "unknown", "summary": "..." }`, synchronously or asynchronously. Match a **new record for this operation**; an old matching record or a toast is not enough. An exception from the check becomes unknown. Invalid verdicts are rejected; a completed check cannot be replaced.

Write `run` as JSON, then render or gate it:

```bash
node bin/stepreceipt.mjs run.json --out receipt.html --summary summary.md --check
```

`ActionResult.error is not None` maps to `BrowserUseActionError`, including an empty error string. A Python action exception records only its safe class name. A normal result stays unknown until checked; the bridge does not derive a task verdict from `success`, `is_done` or generated result text. The raw result remains available in `step["value"]` for your caller, and is not stored in the receipt.

The exported receipt includes caller labels/check summaries, timing and error class. It omits raw tool arguments/results, error messages, stack traces, history, URLs and page content unless **your own label or summary** includes them. Common credential patterns are heuristically replaced; review your summaries before sharing.

## Evidence and prior work

- [Current synthetic measurements](browser-use/measurements.json) and the four [committed report inputs](browser-use/).
- The disabled-control problem was independently described in [browser-use #5964](https://github.com/browser-use/browser-use/issues/5964), with a proposed fix in [#5965](https://github.com/browser-use/browser-use/pull/5965). [#6031](https://github.com/browser-use/browser-use/issues/6031) contains other contributors' known-answer cases and tool-versus-agent-level discussion. This project does not claim to have discovered the bug. Its fixture and bridge code were written independently; none of those contributors' fixture packs or model results are republished here.
- [Validation record](VALIDATION.md). Source execution, CI, rendered files and external adoption are separate evidence levels.
