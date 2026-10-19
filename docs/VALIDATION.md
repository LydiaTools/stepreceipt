# v0.1.0 validation

Checked on 2026-10-20 (Asia/Shanghai), macOS, Node.js v22.23.0, Playwright 1.64.1 and Google Chrome 155.0.8059.84 in a fresh headless profile.

`npm test`: 7 tests passed, covering one-time action execution, unknown outcomes without an observation, observer failure, invalid kinds/verdicts, duplicate IDs, malformed durations, credential-pattern redaction, script-data escaping, and CLI overwrite refusal.

`BROWSER_CHANNEL=chrome npm run test:e2e`: passed.

| Check | Observed result |
| --- | --- |
| Actual localhost write | One POST, one saved record |
| UI confirmation | A real Playwright TimeoutError |
| Separate readback | GET returned one matching saved record |
| Recorded run | Three steps, three checks passed, one tool error |
| Viewer import | Unknown status remains unknown |
| File export | Exported HTML reopened successfully |
| Malicious title | Displayed as text; no injected script ran |
| Malformed JSON | Previous run preserved; error did not echo the file's secret-like text |
| Report rendering/import | Zero external HTTP(S) requests observed |
| Layout and language | Desktop and 390px mobile checked; English/Chinese switching passed |

The committed `examples/save-timeout.json`, online demo, and screenshots are generated from this synthetic local workflow. The [fixture readback screenshot](assets/fixture-readback.png) shows the saved record. Dates in the run file use UTC. There is no real user account, production write, LLM call, or external service involved.

This does not validate browser-use/Stagehand/Codex/MCP integration, production idempotency, all browsers/operating systems, complete redaction, user adoption, or performance improvements. Each integration must provide a meaningful independent readback check.
