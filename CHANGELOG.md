# Changelog

## 0.8.0 — Click through the sampled Playwright page

- Add `recordPageClick`, which constructs a selector-based click on the supplied Playwright Page and requires exactly one matching element.
- Add a reproducible two-tab demonstration and portable reports for a bound click, a rejected ambiguous target, and an unbound callback control.
- Verify distinct same-URL tabs, missing, ambiguous and closed targets in local Chrome and GitHub CI. The caller still chooses the Page and performs a separate business outcome check; no remote-agent session or atomic navigation guarantee is implied.

## 0.7.0 — LangGraph checkpoint-ordering reproduction

- Add an original event-gated LangGraph 1.2.17 fixture informed by issue #8039, with fresh-process resume and four isolated cases repeated three times each.
- Record checkpoint state, pending task writes, action attempts and independently read committed effects in StepReceipt reports.
- Include the expected rejected replay case, completed baseline, ordered-write control and transactional stable-key control.
- Add English and Chinese run guides and actual report links. The fixture does not patch LangGraph or claim upstream endorsement.

## 0.6.0 — Python browser-use outcome checks

- Add an optional dependency-free Python bridge for native browser-use ActionResult and explicit independent checks. Raw result/error text stays out of the receipt; no retry is added.
- Add four original local-browser cases with browser-use 0.13.11: disabled click, stored draft, false toast and unavailable readback. Native tool returns and separate checks remain distinct.
- Export the existing v1 JSON format into standalone reports and actual CLI checks; include English/Chinese guides and real report captures.
- Run Python bridge tests and native browser-use cases in a separate CI job. Preserve the previously added optional Stagehand Page example.
- The examples make no model calls and do not test browser-use Agent.run, production websites, or overall agent success rates.

## 0.5.0 — Playwright page signals

- Add an optional Playwright adapter that records before/after URL, title, visible-text and interactive-element-count changes around one action.
- Export only the names of changed signals; raw page text, URL, title, and temporary fingerprints are not written to receipts.
- Keep task verification separate: visible change is not success, and no visible change does not rule out a server-side effect.
- Preserve one-shot action behavior when page capture is unavailable; do not retry or replay.
- Add English/Chinese integration guides, HTML evidence display and a page-signal column in Markdown summaries.

## 0.4.0 — Browser Agent Blueprint integration

- Add a real localhost Playwright integration that sends guarded browser actions and independent observations into StepReceipt reports.
- Cover saved-after-timeout, unavailable-readback, and an unguarded duplicate-producing retry; refuse replay after loading a persisted journal into a fresh controller instance.
- Keep the integration optional and development-only; the StepReceipt runtime still has zero dependencies.
- Run the integration and retain its generated reports/screenshots in GitHub Actions.
- Pin the public Blueprint source archive to commit `630d773c44cc41f35128d14344a77339906b9504`.

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
