# A controlled LangGraph checkpoint-ordering reproduction

[中文复现说明](LANGGRAPH-SYNC-RACE.zh-CN.md) · [Runnable source](../examples/langgraph-sync-race/) · [Measured JSON](langgraph-sync-race/measurements.json)

**With LangGraph 1.2.17 and `durability="sync"`, the harness held a task write, observed a newer checkpoint reach the saver boundary first, then stopped the process before that checkpoint was persisted.** On restart, the unfinished action ran again and committed a second effect in **all 3 trials**. This is a narrow, event-gated reproduction informed by [issue #8039](https://github.com/langchain-ai/langgraph/issues/8039), not a fix or an upstream endorsement.

| Case | Repeats | Relevant action attempts | Relevant committed effects | StepReceipt gate |
| --- | ---: | ---: | ---: | --- |
| Completed control | 3 | 1 total (sequence 0) | 1 total (sequence 0) | Passed |
| Task write held at checkpoint boundary | 3 | 2 (sequence 1) | 2 (sequence 1) | Blocked |
| Control: commit task write before same exit cut | 3 | 1 (sequence 1) | 1 (sequence 1) | Passed |
| Control: stable key and effect in one transaction | 3 | 2 (sequence 1) | 1 (sequence 1) | Passed |

- [Open the replay report](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/race-replay.html)
- [Open the ordered-write control](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/ordered-write-control.html)
- [Open the stable-key control](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/stable-key-control.html)
- [Open the completed control](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/completed-control.html)

The table shows action attempts separately from committed effects. In the stable-key case, the action executes twice after resume, but the target SQLite transaction keeps one effect for the logical operation. StepReceipt does not intercept, deduplicate or repair LangGraph writes; it turns the returned action status and independent database readback into a reviewable report. The replay case is expected to fail `--check`; the example runner succeeds only when this negative case and all three controls match their measured outcomes.

## Run the example

Use Node.js 20+, Python 3.12 and the repository source. Installing the optional, fully pinned Python dependencies needs package-index access. The example's worker denies Python socket connection, DNS and send-to events while it runs; it makes no model/provider calls.

```bash
python3.12 -m venv .venv-langgraph-race
.venv-langgraph-race/bin/python -m pip install -r examples/langgraph-sync-race/requirements.txt
node examples/langgraph-sync-race/run.mjs \
  --python .venv-langgraph-race/bin/python \
  --out artifacts/langgraph-sync-race
```

PowerShell:

```powershell
py -3.12 -m venv .venv-langgraph-race
.\.venv-langgraph-race\Scripts\python.exe -m pip install -r examples/langgraph-sync-race/requirements.txt
node examples/langgraph-sync-race/run.mjs --python .\.venv-langgraph-race\Scripts\python.exe --out artifacts/langgraph-sync-race
```

Each report under `artifacts/langgraph-sync-race/` includes the three repetitions, its source JSON, the Markdown summary, and an actual `--check` result. The top-level `measurements.json` records versions, controlled event names, checkpoint readback, action attempts and effect counts. Output paths must be new; the runner does not overwrite or clean previous data.

## What the control point means

The graph uses one thread, a single synchronous `StateGraph`, `SqliteSaver`, a local business-effects SQLite database and `durability="sync"`. An event-controlled saver pauses `put_writes` for the action returning sequence 2. At the newer checkpoint's `put` boundary, the race case records the attempted order and terminates the process with exit 73 **before** persisting that checkpoint. A separate process then reads the checkpoint and effects, resumes the same thread, and reads the effects again through a read-only connection.

The ordered control releases and waits for the same task write to commit before that exit cut. The stable-key control leaves the race cut intact but makes the operation key unique and commits the key with the effect in one SQLite transaction. The completed control establishes the ordinary one-action baseline. Each case is isolated in fresh databases and repeated three times.

## Boundaries and provenance

This is a deterministic synthetic SQLite fixture, not a benchmark or a claim that all savers, operating systems, storage, graph shapes or LangGraph versions behave this way. It does not test Cloud, distributed checkpointers, power loss, production APIs, concurrent workers, model behavior or external side effects. The audit hook reduces accidental network access for this worker; it is not a general security sandbox. A local unique key does not make an unrelated email, payment or social-platform API exactly-once.

The linked issue already contains its own reproduction. This is a separate StepReceipt example using public LangGraph APIs and pinned packages; its contribution is the event-gated interleaving, isolated controls, repeated outcomes and portable reports. It does not copy code from issue comments, alter LangGraph, or claim that maintainers accepted or endorsed the result. The separate [process-crash example](LANGGRAPH.md) remains pinned to its own dependency set and demonstrates a different failure point.
