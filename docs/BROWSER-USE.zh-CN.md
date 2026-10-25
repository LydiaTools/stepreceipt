# browser-use 动作与独立结果核对

[English](BROWSER-USE.md) · [Python 桥接文件](../integrations/browser-use/stepreceipt_browser_use.py) · [打开禁用按钮报告](https://lydiatools.github.io/stepreceipt/browser-use/disabled.html)

**点击工具正常返回，仍可能什么都没保存。** 这个可选 Python 桥接把 browser-use 的 `ActionResult` 和你提供的独立检查放在一起，输出现有 StepReceipt CLI、离线报告支持的 v1 JSON。

## 跑四个本地案例

需要 Node.js 20+、Python 3.11+ 和已安装的 Chrome/Chromium。实测使用 Python 3.12、browser-use **0.13.11**。2026-10-25 核实时，这是 PyPI 实际发布的版本；GitHub 有 0.13.13 标签，但当时 PyPI 没有同版本包。

```bash
git clone https://github.com/LydiaTools/stepreceipt.git
cd stepreceipt
python3 -m venv .venv-browser-use
.venv-browser-use/bin/python -m pip install -r examples/browser-use/requirements.txt
node examples/browser-use/run.mjs \
  --python .venv-browser-use/bin/python \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out artifacts/browser-use-first-run
```

Linux 把浏览器路径换成实际可执行文件，例如 `/usr/bin/google-chrome`。Windows 使用 `.venv-browser-use\Scripts\python.exe` 和实际 Chrome 路径，在 PowerShell 中把命令写成一行；Windows 原生流程尚未实测。

打开 `artifacts/browser-use-first-run/disabled/report.html`。输出目录必须是新的；重用旧目录会在启动 worker 前被拒绝。安装阶段要下载 Python 依赖；案例不调用模型或 Provider，不需要 API Key。它启动独立本地浏览器，不连接已登录会话。运行器不把 Provider 密钥环境变量传给 worker，关闭 browser-use 遥测、云同步、版本检查、默认扩展，并使用新的配置目录。

| 原创合成本地页面 | 原生工具返回 | 独立 GET 核对 | POST / 已保存草稿 | 检查退出码 |
| --- | --- | --- | ---: | ---: |
| 带点击监听的禁用按钮 | 无错误 | 不通过 | 0 / 0 | 1 |
| 正常按钮，存储正常 | 无错误 | 通过 | 1 / 1 | 0 |
| POST 返回 500，页面仍显示已保存 | 无错误 | 不通过 | 1 / 0 | 1 |
| 保存成功，读回返回 503 | 无错误 | 未知 | 内部 1 / 1，观察者无法读取 | 1 |

最后一行的内部计数只用于测试断言，不是观察者拿到的证据，报告仍为“未知”。每个案例只调用一次 `Tools.click`；禁用按钮不产生 POST，所以动作次数和请求次数不同。运行器核对真实服务端计数、桥接格式和 CLI 退出码；预期失败或未知错误地通过时，测试会失败。

![真实 browser-use 禁用按钮报告：工具正常返回，独立 GET 发现 0 次 POST、0 条已保存草稿](assets/browser-use/disabled-click.png)

这些是原生 browser-use **工具层**调用，页面为本项目原创合成案例；没有 `Agent.run`、模型决策、生产网站或真实账号操作，也不是整体 Agent 成功率评测。StepReceipt 不修复上游点击行为、不负责业务幂等，也不能阻止其他组件再次尝试。

## 接到你的检查逻辑

桥接是仓库中的一个无运行时依赖 Python 文件，**没有发布到 PyPI**。可复制这个 MIT 文件，或把所在目录加入 Python 路径；你的 browser-use 安装提供 `Tools`、`BrowserSession` 和 `ActionResult`。

```python
from stepreceipt_browser_use import BrowserUseReceipt

receipt = BrowserUseReceipt("保存一条草稿")
step = await receipt.attempt(
    label="点击保存", kind="write",
    action=lambda: tools.click(index=save_index, browser_session=session),
)

# 继续流程前检查 step["ok"]；桥接不会自动重试。
# check_saved_draft 是你的应用针对本次操作的只读核对函数。
await receipt.verify(step["id"], check_saved_draft)
run = receipt.to_dict()
```

`check_saved_draft` 同步或异步返回 `{ "status": "verified" | "rejected" | "unknown", "summary": "..." }`。核对本次操作产生的新记录；旧记录或页面提示不足以证明本次保存。观察异常保留未知；非法状态会被拒绝，完成的核对不能替换。

把 `run` 写入 JSON，再生成报告和检查结果：

```bash
node bin/stepreceipt.mjs run.json --out receipt.html --summary summary.md --check
```

`ActionResult.error is not None` 会记为 `BrowserUseActionError`，空错误字符串也一样。Python 动作抛异常时只记录安全类名。正常返回在核对前仍是未知，不根据 `success`、`is_done` 或生成文本推断结果。原始结果仅留在调用方的 `step["value"]`，不会写入报告。

报告保存调用方提供的标签、核对摘要、时间和错误类，不自动保存原始参数、结果、错误消息、调用栈、历史、网址或页面内容；你自己写进标签或摘要的内容仍会保留。常见凭据格式会做启发式替换，分享前仍需检查摘要。

## 证据与前人工作

- [本次合成案例实测](browser-use/measurements.json)及四份[报告输入](browser-use/)。
- 禁用控件问题已由其他贡献者在 [browser-use #5964](https://github.com/browser-use/browser-use/issues/5964) 中报告，[#5965](https://github.com/browser-use/browser-use/pull/5965) 提供候选修复。[#6031](https://github.com/browser-use/browser-use/issues/6031) 有已知答案案例以及工具层、Agent 层的区分讨论。本项目不认领该问题的发现；桥接和页面独立编写，没有复制或重发他人的案例包、模型测试结果。
- [验收记录](VALIDATION.md)。源码运行、CI、页面与外部采用分别记录。
