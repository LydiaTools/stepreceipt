# Why start with action outcomes?

Research snapshot: 2026-10-20. These sources establish related problems and an active ecosystem; they do not establish demand for StepReceipt specifically or imply endorsement.

- [Stagehand issue #2982](https://github.com/browserbase/stagehand/issues/2982) describes a wait failing after click-triggered navigation and explains why retrying arbitrary evaluations can repeat side effects. StepReceipt does not fix that SDK bug; it makes an action's tool result and a separately supplied observation visible together.
- [Browser Use issue #5515](https://github.com/browser-use/browser-use/issues/5515) concerns duplicate download events and partial downloads being treated as completed. This is another reason an event and a checked outcome should be distinct.
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) already provides rich action, source, DOM and network inspection. StepReceipt serves a narrower purpose: a portable summary of caller-supplied observations. It does not parse or replace Playwright traces.
- [Browser Agent Blueprint](https://github.com/LydiaTools/browser-agent-blueprint) is the author's earlier prompt-module and local-fixture project. This project turns a small part of that workflow into an executable recorder and report.

For context, GitHub's API reported approximately 118.5k stars for Browser Use, 25.7k for Stagehand, 28.9k for Repomix, 22.7k for CodexBar, and 11.2k for Presenton at this snapshot. Existing attention is not a prediction for a new repository. The initial hypothesis is that some browser-agent developers want a compact report they can review without rerunning a write or opening a full tracing system.

The implementation was written for this project. No upstream source was copied into it. Node.js/browser APIs provide the runtime; Playwright is a development dependency under Apache-2.0. Its license is retained in the installed package. The repository's original code is MIT.

## A bounded LangGraph integration example

On 2026-10-20, [LangGraph #9240](https://github.com/langchain-ai/langgraph/issues/9240) and its existing examples made the checkpoint/side-effect distinction concrete. It already has documentation proposals and community reproductions; an open status is not evidence that no solution exists. [#8039](https://github.com/langchain-ai/langgraph/issues/8039) is a different checkpoint-ordering problem. The official [idempotency guide](https://docs.langchain.com/oss/python/langgraph/functional-api#idempotency) already discusses unfinished tasks and idempotent effects.

Instead of creating another workflow engine, this repository adds an optional [fresh-process crash/restart fixture](LANGGRAPH.md) using the public StateGraph API. Its narrow additional value is a real process exit after a separate business commit, portable action/observation reports, a completed-node control, and a negative-case CLI gate. It does not patch LangGraph or claim the underlying pattern is novel. The target database, not this recorder, implements transactional deduplication. Whether real developers will use these reports remains unverified.
