---
name: stepreceipt-outcome-check
description: Use for browser or UI coding tasks with an observable requested result. Separate the action from a later readback and create a StepReceipt JSON record; skip code-only work.
---

# StepReceipt Outcome Check

Use this skill when a coding task changes something a person can observe in a browser or app: a saved record, a filter, a navigation path, a dialog, a visible result, or a layout. The goal is to check the requested behavior and leave a truthful, shareable record. Do not turn every code task into a browser workflow.

## Workflow

1. Read the request and the project's existing run instructions. State the expected user-visible result in one sentence. Keep it within the request; do not add features or acceptance criteria the user did not imply.
2. Find the project's existing local or test-environment path. Prefer an isolated fixture or staging setup. Use a signed-in production account only when the user explicitly asked to test that account or site.
3. Make the requested change using the project's existing design and architecture.
4. Check the outcome with a readback that occurs after the action and can distinguish the expected result from the prior state. A successful click, tool return, toast, generated test, or changed-page signal alone is not a readback. Use the app's own read-only state, a reload, a separate query, or another existing independent observation when available.
5. Do not repeat a write just to see whether it worked. If the action times out or the readback is unavailable, keep the result `unknown` unless a separate observation proves the expected outcome. Never infer success from the agent's implementation summary.
6. Create a StepReceipt v1 JSON run for the observed workflow. Record actual actions and actual observations. A step's `toolStatus` describes the action return; `verification.status` describes the later check. Use `verified` only when that check observed the requested condition, `rejected` when it disproved it, and `unknown` when no adequate observation exists. Put the reason in a concise `verification.summary`.
7. Include only evidence the format supports: title, timestamps, step IDs and labels, read/write kind, duration, tool status, verification, and optional page-signal names. Do not add credentials, personal page contents, or raw screenshots to the receipt JSON. Keep screenshots and other artifacts separate and point to their local paths in your final summary.
8. If the StepReceipt CLI is already available, render the JSON to HTML with the documented CLI. Do not install packages automatically. If the CLI is unavailable, leave the valid JSON file and link the user to the [online viewer](https://lydiatools.github.io/stepreceipt/) to open it; say HTML was not rendered.

## Report the result

Give the expected behavior, what action actually ran, what the separate readback observed, and the `verified` / `rejected` / `unknown` status. Report test-suite results separately from the receipt. A receipt documents a supplied observation; it does not certify all code, prove production safety, or imply deployment or adoption.

For the v1 fields and limits, see the [StepReceipt format](https://github.com/LydiaTools/stepreceipt/blob/main/docs/FORMAT.md). For local rendering, see the [CLI guide](https://github.com/LydiaTools/stepreceipt#install-the-cli-or-library-from-github).
