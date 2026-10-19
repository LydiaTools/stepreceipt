# Why start with action outcomes?

Research snapshot: 2026-10-20. These sources establish related problems and an active ecosystem; they do not establish demand for StepReceipt specifically or imply endorsement.

- [Stagehand issue #2982](https://github.com/browserbase/stagehand/issues/2982) describes a wait failing after click-triggered navigation and explains why retrying arbitrary evaluations can repeat side effects. StepReceipt does not fix that SDK bug; it makes an action's tool result and a separately supplied observation visible together.
- [Browser Use issue #5515](https://github.com/browser-use/browser-use/issues/5515) concerns duplicate download events and partial downloads being treated as completed. This is another reason an event and a checked outcome should be distinct.
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) already provides rich action, source, DOM and network inspection. StepReceipt serves a narrower purpose: a portable summary of caller-supplied observations. It does not parse or replace Playwright traces.
- [Browser Agent Blueprint](https://github.com/LydiaTools/browser-agent-blueprint) is the author's earlier prompt-module and local-fixture project. This project turns a small part of that workflow into an executable recorder and report.

For context, GitHub's API reported approximately 118.5k stars for Browser Use, 25.7k for Stagehand, 28.9k for Repomix, 22.7k for CodexBar, and 11.2k for Presenton at this snapshot. Existing attention is not a prediction for a new repository. The initial hypothesis is that some browser-agent developers want a compact report they can review without rerunning a write or opening a full tracing system.

The implementation was written for this project. No upstream source was copied into it. Node.js/browser APIs provide the runtime; Playwright is a development dependency under Apache-2.0. Its license is retained in the installed package. The repository's original code is MIT.
