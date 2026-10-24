# What the README animation shows

The animation is a continuous recording of the actual StepReceipt viewer importing three committed run files. It replays saved reports from the v0.2.0 synthetic local-browser tests. It does not show a fresh agent run, a live social account, or an independent verification service.

| File | Displayed result |
| --- | --- |
| `examples/save-timeout.json` | The Save callback timed out; a separate GET found exactly one matching record. |
| `examples/rejected-write.json` | The page displayed success despite a storage error; a separate GET found no saved record. |
| `examples/unknown-readback.json` | The readback service was unavailable; the observation stayed unknown. |
| `examples/page-signals.json` | A visible-text change is shown beside a separate check; a no-change read remains unknown without a task-specific check. |

Each of the three write scenarios made exactly one POST to the isolated test server. The page-signal example uses a synthetic local page without an API call. These are isolated test cases; the recorder is not a retry-prevention layer for other parts of an application.

## Capture

The [capture script](../scripts/record-viewer.mjs) opens the real viewer in a new headless browser. It imports each JSON through the viewer's file input, asserts the selected write and result text, and records a 3.6-second reading interval per case. No page content or result text is altered for the recording. No cursor overlay, mockup, voice, account, or model is used. The capture observed zero external HTTP requests.

With Node.js, the development dependencies and an installed compatible Chrome:

```sh
npm ci
npx playwright install ffmpeg
BROWSER_CHANNEL=chrome node scripts/record-viewer.mjs
```

Without Chrome, install the Playwright browser with `npx playwright install chromium ffmpeg`, then run `node scripts/record-viewer.mjs`. Output is written to a new folder under ignored `artifacts/recordings/`; the script prints its path. Set `STEPRECEIPT_DEMO_DIR` to use another parent directory. The video helper is a development dependency; ordinary report rendering does not need it.

The published GIF trims the first 0.4 seconds of browser startup, scales the 1200×780 viewport to 1000×650, and uses 4 fps with a 128-color palette and no dithering. There are no inserted outcome frames. The original recording is retained outside Git; only the lightweight GIF, capture code and provenance are committed.

## v0.5.0 page-signal example

The [page-signal report](cases/page-signals.html) and screenshots are generated from the checked-in browser test's synthetic local page. One action changes visible text and receives a separate verified check; a read action leaves the page visibly unchanged and remains `unknown` without a task-specific check. The report stores signal names only. See the [changed-state English capture](assets/page-signals.png), [unchanged-state capture](assets/page-signals-no-change.png), and [Chinese capture](assets/page-signals-zh.png). These images are evidence of the local fixture and current viewer, not a production-site result.

See [machine-readable capture metadata](assets/three-outcomes.json) for the recording date, input SHA-256 values and GIF hash. The fixed v0.2.0 ZIP remains its original release snapshot; the current repository additionally contains these presentation assets.

## 中文

动图录制的是现有工具界面导入三份已提交运行文件的过程，展示不同观察结果。源文件来自三组真实执行的本地合成浏览器测试，每组只发出一次 POST。动图自身是报告回放，不是真实社媒账号操作或新的 Agent 验收；没有虚拟箭头或 AI 界面。源文件哈希、录制日期和压缩参数均在元数据中保留。
