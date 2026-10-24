# StepReceipt v1

The input is a JSON object, not a Playwright trace or arbitrary agent log. The CLI and viewer use the same normalizer.

```json
{
  "schemaVersion": 1,
  "title": "Save a draft",
  "startedAt": "2026-10-20T00:00:00.000Z",
  "steps": [{
    "id": "step-1",
    "label": "Save",
    "kind": "write",
    "startedAt": "2026-10-20T00:00:00.000Z",
    "durationMs": 600,
    "toolStatus": "error",
    "errorName": "TimeoutError",
    "verification": {
      "status": "unknown",
      "summary": "Readback was unavailable."
    },
    "pageEvidence": {
      "captureStatus": "complete",
      "outcome": "changed",
      "beforeCaptured": true,
      "afterCaptured": true,
      "signals": ["visible_text"]
    }
  }]
}
```

- `kind`: `read` or `write`, declared by the caller. This is not an automatic side-effect detector.
- `toolStatus`: `ok` or `error`. Incomplete actions cannot be exported.
- `verification.status`: `verified`, `rejected`, or `unknown`. Missing verification becomes unknown. An observer exception also becomes unknown. The integration owns the assertion and observation semantics.
- `verified` means the **supplied check passed**; it is not an independent certification of a site outcome. For example, seeing an existing record is insufficient unless your check distinguishes it from a newly submitted record.
- `pageEvidence` is optional. The Playwright adapter compares temporary page fingerprints and stores only whether `url`, `title`, `visible_text`, or `controls` changed. `changed` and `no_visible_change` are diagnostic signals; neither is a task verdict. A partial or unavailable capture leaves `outcome` as `unavailable`.
- `errorName`: an error class only, up to 60 simple alphanumeric characters. Raw error messages/stacks are not exported.
- At most 1,000 steps; unique simple IDs, titles/labels up to 240 characters, observation summaries up to 2,000 characters. Input files are limited to 2 MB. Unknown extra fields are discarded.
- Dates must be ISO timestamps; duration must be finite and non-negative. Data is rendered with text nodes, never as user-authored HTML.
- Common `Bearer`, `sk-`, `ghp_`, `github_pat_`, and key/value credential forms are heuristically replaced. This cannot detect every secret or personal detail. Review before sharing.

The report includes no remote screenshots, network bodies, browser credentials, uploaded files, page text, URL/title values, or cryptographic signatures. The adapter's temporary fingerprints are non-cryptographic and are not exported. JSON remains an interchange format that other tools can deliberately produce; only the optional Playwright page-signal adapter is included and tested against synthetic local pages.
