# 保存已落库，进程却退出了：恢复后到底写了几次？

[English](LANGGRAPH.md) · [示例源码](../examples/langgraph/) · [实际测量 JSON](langgraph/measurements.json)

这个可选示例实际启动多个独立 Python 进程，运行 LangGraph、文件型 `SqliteSaver` 和另一个独立的模拟业务数据库。无需模型、Provider、API Key 或浏览器。StepReceipt 把进程返回与单独读取的业务结果放在一起。

故障点固定为：业务事务提交 → `os._exit(73)` → 节点尚未返回。随后新进程用同一 thread 和检查点数据库执行 `invoke(None, durability="sync")`，再用单独的只读进程统计记录与节点调用次数。

| 场景 | 首次进程 | 恢复后节点调用次数 | 匹配草稿数 | 报告判断 | 查看 |
| --- | --- | ---: | ---: | --- | --- |
| 正常完成的对照组 | 正常返回 | 1 | 1 | 0，通过 | [报告](https://lydiatools.github.io/stepreceipt/langgraph/completed-control.html) |
| 提交后退出，普通插入 | 退出码 73 | 2 | 2 | 1，未通过 | [报告](https://lydiatools.github.io/stepreceipt/langgraph/crash-replay.html) |
| 相同退出点，目标库去重 | 退出码 73 | 2 | 1 | 0，通过 | [报告](https://lydiatools.github.io/stepreceipt/langgraph/target-dedup.html) |

三组恢复调用都正常返回，但普通插入留下重复草稿。示例运行器只有在三组结果均符合预期时才返回成功；反例的报告必须判为未通过。

去重由**业务数据库**完成：稳定的逻辑操作键有 UNIQUE 约束，并与业务写入放进同一个事务。节点仍执行两次，StepReceipt 没有拦截或去重。这个本地事务方式不能直接保证另一个邮件、付款或社媒 API 的效果。

## 亲自运行

使用 v0.3.0 发布包或当前源码、Node.js 20+ 和 Python 3.12。固定 v0.2.0 ZIP 早于此示例。无需安装 npm 依赖。

```bash
git clone https://github.com/LydiaTools/stepreceipt.git
cd stepreceipt
python3.12 -m venv .venv-langgraph
.venv-langgraph/bin/python -m pip install -r examples/langgraph/requirements.txt
node examples/langgraph/run.mjs --python .venv-langgraph/bin/python --out artifacts/langgraph
```

PowerShell 命令见[英文页](LANGGRAPH.md#run-it)。安装阶段会下载 Python 包；执行阶段只向子进程传递少量必要环境变量，关闭 tracing，并通过 Python audit hook 拒绝 socket 连接、DNS 与 send-to 事件。该 hook 是测试保护，不是通用安全沙箱。Python 包只用于这个可选示例，不改变记录器零运行依赖的性质。

每组的 `report.html`、`run.json`、`summary.md` 与两个 SQLite 文件位于 `artifacts/langgraph/<case>/`，汇总数字在 `measurements.json`。输出目录必须全新，重复运行请换一个 `--out`，不会覆盖旧数据库。

## 验证范围

固定 LangGraph 1.2.16、checkpoint 4.3.0、SQLite saver 3.1.2 及已解析的 Python 依赖。这里只测一个同步单节点图、单线程任务、业务事务提交后的进程退出，以及最新检查点恢复。没有验证断电、操作系统或存储损坏、并发工作进程、旧检查点回放、Cloud、分布式 saver、生产 API 或模型行为。它是可运行的接入示例，不是通用 SDK 适配器，也不提供普遍的“恰好执行一次”保证。

官方[检查点文档](https://docs.langchain.com/oss/python/langgraph/checkpointers#durability-modes)说明持久化时机，[幂等说明](https://docs.langchain.com/oss/python/langgraph/functional-api#idempotency)讨论未完成任务的重放。[#9240](https://github.com/langchain-ai/langgraph/issues/9240)已有相关讨论与其他示例；[#8039](https://github.com/langchain-ai/langgraph/issues/8039)是另一个检查点写入顺序问题，本例没有复现或修复它。它们不代表上游认可或已验证的产品需求。

本例的价值是跨进程故障复现、可分享的动作/观察报告和必须失败的反例检查。代码为本仓库编写，没有复制上游或评论中的实现；外部 LangGraph 依赖单独安装并保留包内许可。
