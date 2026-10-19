# A recorded-check gate for CI

The CLI reads a StepReceipt v1 JSON file; it never launches a browser, calls a model, repeats a write, or decides which application assertion is meaningful. Your integration supplies the observations.

```sh
# Render a human-readable summary and apply the gate.
node bin/stepreceipt.mjs artifacts/demo/run.json --summary receipt-summary.md --check

# Or apply only the gate without writing a file.
node bin/stepreceipt.mjs artifacts/demo/run.json --check
```

The first command writes the summary even for a blocked run, then exits 1. Existing output files are never overwritten. `--out report.html` and `--summary report.md` are alternative output modes; either may be combined with `--check`.

| Exit | Meaning |
| --- | --- |
| 0 | A non-empty run has every observation `verified`, or a report-only command completed without `--check` |
| 1 | `--check` found a `rejected`/`unknown` observation or an empty run |
| 2 | Invalid JSON/schema/arguments, oversized input, or an output error |

A tool returning normally is not enough to pass. A tool error is not enough to fail if a separate observation is verified. Missing observations normalize to `unknown`. The gate covers every recorded action, including reads; no severity override is provided.

## Preserve the summary when the gate blocks

In a checkout of this repository, after `npm run test:e2e`, this GitHub Actions step evaluates the real saved-after-timeout run:

```yaml
- name: Evaluate the recorded checks
  shell: bash
  run: |
    gate_status=0
    node bin/stepreceipt.mjs artifacts/demo/run.json --summary "$RUNNER_TEMP/receipt-summary.md" --check || gate_status=$?
    if [ -f "$RUNNER_TEMP/receipt-summary.md" ]; then
      cat "$RUNNER_TEMP/receipt-summary.md" >> "$GITHUB_STEP_SUMMARY"
    fi
    exit "$gate_status"
```

Replace only the input path with a run produced by your own integration. That producer must run before this step, and its observations need to test your actual postconditions. The non-zero exit is preserved after the summary is displayed. See [GitHub's job-summary reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary).

Our [running workflow](../.github/workflows/test.yml) also keeps the three synthetic reports for seven days with `actions/upload-artifact`. The failing fixtures are deliberate test inputs: their check gates must exit 1 for the end-to-end test suite to pass. This is different from accepting a failed business workflow.

## Public artifact boundary

Repository Actions summaries and artifacts can disclose the contents you put into labels and observations. This repository uploads only its isolated synthetic fixtures. Do not copy the artifact-upload step onto private account sessions without reviewing the resulting files and repository visibility. The pattern redaction is incomplete. Raw messages, DOM, and network content are not captured automatically.

## 中文

`--check` 只检查记录中的观察状态，不会再次执行浏览器动作。空记录、结果未知和检查未通过均返回 1；有效且全部已核验的非空记录返回 0；参数或文件错误返回 2。上面的 Actions 示例保留退出码，因此展示摘要不会把失败变成成功。接入方需要自己提供有意义的检查，报告本身不是独立证明。
