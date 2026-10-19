# v0.2.0 validation

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
