# 工具成功返回两次，草稿也保存了两份

[English](AGNO-RETRY.md) · [示例源码](../examples/agno/) · [打开合成运行报告](https://lydiatools.github.io/stepreceipt/agno/retry.html) · [查看运行数据](agno/run.json)

工具已经成功返回，但后续模型请求失败。如果整个 Agent 运行被重试，第一次写入会发生什么？

这个可选示例用 **Agno 3.0.10**、**OpenAI SDK 3.16.2** 和一次合成 Agent 调用演示：本地脚本模型先返回工具调用，再返回 HTTP 500；Agent 重试一次后重复这一过程。SDK 自身重试已关闭。合成本地业务服务接受两次工具调用，StepReceipt 在服务端记录写入，再用独立本地 GET 检查记录数量。

| 本次合成夹具的观察 | 结果 |
| --- | --- |
| 脚本模型请求 | 4 次：工具调用、500、工具调用、500 |
| 合成工具返回 | 两次均为 HTTP 201 |
| 业务写入／最终 GET | 2 次／2 条合成草稿 |
| 记录的检查 | 第一次 `verified`、第二次 `rejected`：调用方要求恰好一条 |
| Agent 返回 | `agent.run()` 正常返回，但 `result.status` 是 `RunStatus.error` |
| StepReceipt `--check` | 退出码 1，因为调用方提供的一项观察被拒绝 |

![合成 Agno 运行的真实 StepReceipt 报告：独立读取发现两条草稿，第二次检查未通过](assets/agno-retry.png)

*本地合成样例生成的真实报告，已选中第二次写入。*

示例用原创夹具代码复现 [Agno #10366](https://github.com/agno-agi/agno/issues/10366) 描述的“工具成功后、后续步骤失败”形态；没有测试报告者的实际环境、真实模型、生产接口或当前上游 main。

## 运行示例

需要 v0.8.1 发行 ZIP 或当前仓库源码、Node.js 20+ 和 Python 3.12。固定版 v0.8.0 早于本示例。先在新虚拟环境安装固定版本的可选依赖，安装需要联网；夹具运行时只使用本地 HTTP 服务和合成 API key。

```bash
python3.12 -m venv .venv-agno
.venv-agno/bin/python -m pip install -r examples/agno/requirements.txt
node examples/agno/run.mjs --python .venv-agno/bin/python --out artifacts/agno-run-1
node bin/stepreceipt.mjs artifacts/agno-run-1/run.json --check --summary artifacts/agno-run-1/summary.md
```

观测到预期的两次写入时，示例运行器返回 0；最后一条检查命令因第二个检查被拒绝而按预期返回 1。打开 `artifacts/agno-run-1/report.html`、`observation.json` 和 `summary.md` 查看结果。每次都要使用新输出目录，已有目录不会被覆盖。

子进程使用单独的 HOME、环境变量白名单、关闭的 Agno telemetry，以及应用层回环 socket/DNS 限制。这些是夹具保护，**不是操作系统沙盒**。内存业务服务只监听 `127.0.0.1`；不连接真实服务商，也不使用用户凭据。

## 报告的含义

StepReceipt 记录的是本地服务端的成功写入，不是直接拦截 Agno 工具函数。每次 GET 观察及“恰好一条”要求由集成代码提供；StepReceipt 不会自行判断两次操作是否属于同一业务，也不会阻止重试或去重。本示例不是通用 Agno 适配器、上游修复或恰好一次执行的保证。
