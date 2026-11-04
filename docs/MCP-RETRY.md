# MCP: the write happened, but the response vanished

The tool call timed out. Did the draft get created?

This source-tree example uses the MCP TypeScript SDK 2.4.0. A local synthetic `create_draft` tool commits one row, then the in-process HTTP wrapper drops the first response. It compares a blind retry with a readback-first decision:

| Scenario | Create calls | Rows after readback |
| --- | ---: | ---: |
| Retry immediately after the ambiguous response | 2 | 2 |
| Read by operation ID before deciding | 1 | 1 |

The two reports are generated from actual StepReceipt runs: [blind retry](mcp/blind-retry.html) · [read back first](mcp/readback-first.html). Their matching JSON observations are [here](mcp/blind-retry-observation.json) and [here](mcp/readback-first-observation.json).

## Run it

Requires Node.js 20+ and npm. The demo starts no server socket and calls no external service.

```bash
cd examples/mcp
npm ci
npm run demo -- --out ../../artifacts/mcp-demo
```

The command refuses to overwrite an existing output directory. Choose a new path for another run. Each scenario writes a StepReceipt `run.json`, an HTML `report.html`, and an `observation.json` under that path.

## What this shows

- A write can commit even when the caller receives an error.
- A readback can resolve that ambiguity before another write is sent.
- Retrying the synthetic non-idempotent operation produces a duplicate in this fixture.
- StepReceipt records the call and the later observation; it does not control another MCP client's retry policy.

This is one deterministic, in-process fixture. It does not measure real network failures, a production MCP host/router, remote services, or provider behavior. The synthetic ledger is not a universal model of MCP tools; a real target needs a suitable readback or an operation key enforced by that target. It is an example in the current source tree and is not included in the fixed v0.8.1 release archive.
