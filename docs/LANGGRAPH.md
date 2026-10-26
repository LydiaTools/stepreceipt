# The process died after Save. What does resume actually do?

[中文](LANGGRAPH.zh-CN.md) · [Run the source](../examples/langgraph/) · [Measured JSON](langgraph/measurements.json)

This optional example runs **real LangGraph in separate Python processes**, with a file-backed `SqliteSaver` and a separate synthetic business database. No model, provider, API key or browser is needed. StepReceipt records the worker return separately from a read-only database observation.

The failure cut is deliberately narrow:

```text
business transaction commits → os._exit(73) → node never returns
new process → same thread + checkpoint database → invoke(None, durability="sync")
separate read-only process → count matching drafts and node attempts
```

## Observed on the pinned example

| Case | First process | Node attempts after restart | Matching drafts | Receipt gate | Report |
| --- | --- | ---: | ---: | --- | --- |
| Completed control | Returns normally | 1 | 1 | 0, passed | [Open](https://lydiatools.github.io/stepreceipt/langgraph/completed-control.html) |
| Crash, ordinary insert | Exits 73 after commit | 2 | 2 | 1, rejected | [Open](https://lydiatools.github.io/stepreceipt/langgraph/crash-replay.html) |
| Same crash, target deduplication | Exits 73 after commit | 2 | 1 | 0, passed | [Open](https://lydiatools.github.io/stepreceipt/langgraph/target-dedup.html) |

All restarted graph calls return normally. **A normal graph return does not establish that only one draft exists.** The duplicate case must fail the receipt gate; the example runner succeeds only if all three expected outcomes are observed.

The deduplication is implemented by the **target SQLite database**: a stable logical operation key has a `UNIQUE` constraint, and that key and the effect are committed in the same transaction. StepReceipt does not suppress either node attempt. This local transaction pattern does not by itself cover a separate email, payment or social-platform API.

## Run it

Use the v0.3.0 release or current source, Node.js 20+ and Python 3.12. The fixed v0.2.0 ZIP predates this example. No npm install is required for this example.

```bash
git clone https://github.com/LydiaTools/stepreceipt.git
cd stepreceipt
python3.12 -m venv .venv-langgraph
.venv-langgraph/bin/python -m pip install -r examples/langgraph/requirements.txt
node examples/langgraph/run.mjs --python .venv-langgraph/bin/python --out artifacts/langgraph
```

PowerShell:

```powershell
py -3.12 -m venv .venv-langgraph
.\.venv-langgraph\Scripts\python.exe -m pip install -r examples/langgraph/requirements.txt
node examples/langgraph/run.mjs --python .\.venv-langgraph\Scripts\python.exe --out artifacts/langgraph
```

Installation downloads the pinned Python packages. During execution the worker gets a small environment allowlist, tracing is disabled, and a Python audit hook rejects socket connect, DNS and send-to events. The hook is a fixture guard, not a general security sandbox. The ordinary recorder still has zero runtime dependencies; Python packages are only for this optional example.

Open each `artifacts/langgraph/<case>/report.html`; inspect its `run.json`, `summary.md` and two SQLite files. `measurements.json` records the process exits, observed counts and per-case CLI exits. Output directories must be new: rerunning with the same path refuses to overwrite anything. Use a different `--out` path for another run.

## Scope and provenance

The example uses LangGraph **1.2.16**, checkpoint **4.3.0**, SQLite saver **3.1.2** and pins the resolved Python dependencies. It tests one synchronous, single-node graph, one thread, a clean `os._exit` after a committed local transaction and a latest-thread resume. It does not test power loss, OS/storage failure, concurrent workers, old-checkpoint time travel, LangGraph Cloud, distributed savers, production APIs or an LLM's behavior. It is an executable integration example, not a general native SDK adapter or a universal exactly-once guarantee.

The official [checkpointer guide](https://docs.langchain.com/oss/python/langgraph/checkpointers#durability-modes) describes checkpoint timing; the [Functional API idempotency guide](https://docs.langchain.com/oss/python/langgraph/functional-api#idempotency) explains unfinished-task replay and target-side safeguards. [Issue #9240](https://github.com/langchain-ai/langgraph/issues/9240) discusses this distinction and already contains other examples. The process-crash fixture on this page neither reproduces nor fixes the different ordering race in [issue #8039](https://github.com/langchain-ai/langgraph/issues/8039); see the separate [event-gated reproduction](LANGGRAPH-SYNC-RACE.md). Open issues and community examples do not establish demand for StepReceipt or upstream endorsement.

Our contribution here is a fresh-process failure fixture plus portable, inspectable action/observation reports and explicit negative-case CLI checks. The fixture was written for this repository; upstream source and commenters' implementations were not copied. LangGraph and its SQLite saver are MIT-licensed external dependencies, installed separately with their package notices.
