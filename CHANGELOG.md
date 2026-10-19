# Changelog

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

Native agent-framework integrations and production workflows are not yet tested.
