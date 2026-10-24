# Validation

## Playwright page-signal adapter (v0.5.0 local validation)

Checked on 2026-10-24 with Node.js 22.23.0, Playwright 1.64.1 and Google Chrome 156.0.8078.47 in fresh browser contexts. `npm test` passed all 13 tests. `BROWSER_CHANNEL=chrome npm run test:e2e` passed against the local HTTP fixture and synthetic pages.

| Scenario | POSTs / records | Independent result | Visible page signal | CLI gate |
| --- | ---: | --- | --- | --- |
| Saved after tool timeout | 1 / 1 | Verified | Text changed | Passed (0) |
| UI said success, write rejected | 1 / 0 | Rejected | Text changed | Blocked (1) |
| Readback unavailable | 1 / 1 | Unknown | Text changed | Blocked (1) |

The browser test also exercised a no-change read, partial signal capture, the committed static homepage and page-signal report, Chinese and English rendering, 390px mobile layout, JSON import, standalone HTML export/reopen, malicious-title escaping, malformed-file handling, and zero external HTTP requests from the viewer. The page signal stores only changed signal names; the synthetic report pairs a visible change with a separate check and keeps an unchecked no-change read `unknown`.

`npm run test:blueprint` also passed its three guarded/unguarded local write cases against the pinned Blueprint commit. A separate LangGraph viewer browser check was not run locally in this round because the shared resource slot was occupied; CI runs that check independently. These results are local synthetic evidence, not a production-site, account, model, or adoption test. GitHub CI must pass for the specific pushed commit before claiming remote validation.

## Browser Agent Blueprint integration (v0.4.0 local validation)

Checked on 2026-10-21 with Node.js 22.23.0, npm 10.9.8, Playwright 1.64.1 and Google Chrome 155.0.8059.85 in fresh headless browser contexts. The Blueprint development dependency resolves from a public source archive pinned to commit `630d773c44cc41f35128d14344a77339906b9504`.

`npm test`: 10 tests passed, including the new custom-error-class check. The first browser integration run exposed that JavaScript subclasses such as Blueprint's `PolicyError` were recorded as the generic `Error`; StepReceipt now falls back to the safe constructor class name while continuing to omit messages and stacks.

`BROWSER_CHANNEL=chrome BLUEPRINT_EVIDENCE_OUT=<new-directory> npm run test:blueprint`: passed. The browser performed actual POSTs to the isolated local fixture, and the test opened the generated reports offline:

| Case | POSTs / stored records | Persisted state and replay | StepReceipt gate |
| --- | ---: | --- | --- |
| Saved after UI timeout | 1 / 1 | `DISPATCHED` before POST, `UNKNOWN` after timeout, separate GET confirmed one record; fresh controller refused replay | Passed (0) |
| Readback outage | 1 / 1 | Separate GET returned 503; state stayed `UNKNOWN`; fresh controller refused replay | Blocked (1) |
| Unguarded negative control | 2 / 2 | No guard; the fixture retained both records | Blocked (1) |

The test also checked refusal to overwrite an existing evidence folder, desktop and 390px mobile layouts, Chinese viewer controls, CLI gate exits, and zero external HTTP requests from the local reports. `npm run demo:blueprint -- --out <new-directory>` separately generated all three reports with the documented one-command interface.

This is local synthetic-fixture evidence. The restored controller is a new object in the same process; this run does not test operating-system process termination, user accounts, an external website, or model calls. The existing [LangGraph validation](#langgraph-example-v030) remains the process-restart example. GitHub-hosted CI must be checked separately before claiming remote CI success.

## LangGraph example (v0.3.0)

Checked on 2026-10-20 with Python 3.12, Node.js 22, LangGraph 1.2.16, checkpoint 4.3.0 and SQLite saver 3.1.2. Dependencies are pinned in the optional example's requirements file. Three cases run real worker processes and separate read-only inspectors, with tracing disabled and Python network events denied:

| Case | First/restart exit | Final node attempts | Final matching drafts | CLI check exit |
| --- | --- | ---: | ---: | ---: |
| Completed control | 0 / 0 | 1 | 1 | 0 |
| Commit, then `os._exit(73)` | 73 / 0 | 2 | 2 | 1 |
| Same exit, transactional target deduplication | 73 / 0 | 2 | 1 | 0 |

The runner checks these concrete counts and actual CLI exits. It fails if the negative case incorrectly passes. A second invocation with the existing output path was refused; the hashes of all six database files remained unchanged. The report checks do not change the graph's behavior. The last case is protected by the business database's unique logical operation key, not by StepReceipt.

`BROWSER_CHANNEL=chrome node test/langgraph-viewer.mjs` checks the three committed reports against their run JSON and the current renderer, their gate outcomes, English/Chinese controls, 390px overflow, download/reopen and absence of non-navigation HTTP(S) requests. The new CI job reruns the graph cases separately and retains its measured reports/databases for seven days. Remote CI results must be read from the actual run before being reported as successful.

See [scope and reproduction](LANGGRAPH.md) and the [committed measurements](langgraph/measurements.json). This is a local SQLite process-exit example, not a power-loss test, concurrency benchmark, Cloud validation, production adapter, or reproduction/fix of LangGraph #8039. The v0.3.0 source release contains it; v0.2.0 does not.

## v0.2.0 browser cases

Checked on 2026-10-20 (Asia/Shanghai), macOS, Node.js v22.23.0, Playwright 1.64.1 and Google Chrome 155.0.8059.84 in a fresh headless profile.

`npm test`: 9 tests passed, covering one-time action execution, unknown outcomes without an observation, observer failure, invalid kinds/verdicts, duplicate IDs, malformed durations, credential-pattern redaction, script-data escaping, CLI overwrite refusal, Markdown escaping, empty/rejected/unknown check gates and the CLI's 0/1/2 exit behavior. Malformed JSON errors do not echo the input's secret-like contents.

`BROWSER_CHANNEL=chrome npm run test:e2e`: passed.

| Check | Observed result |
| --- | --- |
| Actual localhost write | One POST, one saved record |
| UI confirmation | A real Playwright TimeoutError |
| Separate readback | GET returned one matching saved record |
| False-success UI | Storage returned 503; page nevertheless showed success; tool returned normally; separate GET found zero records; CLI gate exited 1 |
| Unavailable readback | One record saved internally, but GET returned 503; observation stayed unknown; CLI gate exited 1 |
| One-time writes | Each of the three isolated scenarios made exactly one POST |
| Recorded run | Three steps, three checks passed, one tool error |
| Viewer import | Unknown status remains unknown |
| File export | Exported HTML reopened successfully |
| Malicious title | Displayed as text; no injected script ran |
| Malformed JSON | Previous run preserved; error did not echo the file's secret-like text |
| Report rendering/import | Zero external HTTP(S) requests observed |
| Layout and language | Desktop and 390px mobile checked; English/Chinese switching passed |

The committed example JSON files and online reports are generated from these synthetic local workflows. The original screenshots remain genuine captures of the saved-after-timeout case from v0.1.0. The [fixture readback screenshot](assets/fixture-readback.png) shows that saved record. Dates in the run files use UTC. There is no real user account, production write, LLM call, or external service involved in the fixtures. GitHub-hosted CI has its own authoritative run logs; local success alone does not prove that a particular remote commit passed.

This does not validate browser-use/Stagehand/Codex/MCP integration, production idempotency, all browsers/operating systems, complete redaction, user adoption, or performance improvements. Each integration must provide a meaningful independent readback check.
