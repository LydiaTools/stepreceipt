# Changelog

## 0.1.0 — 2026-10-20

- Record one-time JavaScript actions and separate explicit observations.
- Render standalone HTML with English/Chinese controls and local JSON import.
- Include a real Playwright localhost example where a saved record survives a UI confirmation timeout.
- Validate the data format and escape untrusted report text; omit raw error messages/stacks from capture and redact selected credential patterns.
- Test core behavior, CLI, real-browser readback, offline export/reopen, mobile layout and script injection handling.

Native agent-framework integrations and production workflows are not yet tested.
