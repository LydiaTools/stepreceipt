# Changelog

## 0.3.0 — GitHub install and package entry points

- Install the CLI directly from GitHub with `npm install -g github:LydiaTools/stepreceipt`.
- Expose the recorder, renderer, and summary modules through package entry points.
- Keep the install package focused on runtime files, examples, documentation, and the MIT license.
- Add a pre-publish test gate; the package is still not published to the npm registry.

## Current main — after v0.2.0

- Add an optional pinned LangGraph/SqliteSaver process-crash/restart example: completed control, duplicate effect after resume, and target-side transactional deduplication.
- Observe the business database through separate read-only processes and verify actual StepReceipt CLI gates (0/1/0).
- Provide English/Chinese reproduction guides and generated synthetic reports. The fixed v0.2.0 release ZIP is unchanged and does not contain this example.

## 0.2.0 — 2026-10-20

- Add Markdown summaries and an explicit `--check` CLI gate with distinct 0/1/2 exits.
- Block empty runs, rejected observations and unknown outcomes; permit verified readback after a tool error.
- Add real-browser false-confirmation and readback-outage fixtures, with one write attempt per scenario.
- Integrate summaries and seven-day synthetic report artifacts into this repository's GitHub Actions workflow.
- Open a failed or unknown write first in the viewer and show a separate failed-check count, including after file import.
- Escape untrusted Markdown and avoid echoing malformed JSON contents in CLI errors.

## 0.1.0 — 2026-10-20

- Record one-time JavaScript actions and separate explicit observations.
- Render standalone HTML with English/Chinese controls and local JSON import.
- Include a real Playwright localhost example where a saved record survives a UI confirmation timeout.
- Validate the data format and escape untrusted report text; omit raw error messages/stacks from capture and redact selected credential patterns.
- Test core behavior, CLI, real-browser readback, offline export/reopen, mobile layout and script injection handling.

Production workflows and general native SDK adapters are not yet tested.
