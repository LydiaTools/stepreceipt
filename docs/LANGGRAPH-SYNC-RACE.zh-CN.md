# LangGraph 检查点写入顺序的受控复现

[English](LANGGRAPH-SYNC-RACE.md) · [可运行源码](../examples/langgraph-sync-race/) · [实测 JSON](langgraph-sync-race/measurements.json)

**在 LangGraph 1.2.17、`durability="sync"` 下，本夹具暂停了一次 task write；更新的 checkpoint 先到达 saver 边界，随后进程在该 checkpoint 落库前退出。** 新进程恢复后，未完成动作再次执行；3 次都产生了第二个业务效果。这是参考 [issue #8039](https://github.com/langchain-ai/langgraph/issues/8039) 写成的窄范围、事件门控复现，不是修复，也不代表上游认可。

| 场景 | 重复次数 | 相关动作尝试数 | 相关已提交效果数 | StepReceipt 检查 |
| --- | ---: | ---: | ---: | --- |
| 正常完成对照组 | 3 | 总计 1 次（序号 0） | 总计 1 个（序号 0） | 通过 |
| task write 在检查点边界等待 | 3 | 2 次（序号 1） | 2 个（序号 1） | 阻止 |
| 对照：先提交 task write，再在同一位置退出 | 3 | 1 次（序号 1） | 1 个（序号 1） | 通过 |
| 对照：操作键与效果在同一事务提交 | 3 | 2 次（序号 1） | 1 个（序号 1） | 通过 |

- [查看重复执行报告](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/race-replay.html)
- [查看先写入再退出的对照报告](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/ordered-write-control.html)
- [查看稳定操作键对照报告](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/stable-key-control.html)
- [查看正常完成对照报告](https://lydiatools.github.io/stepreceipt/langgraph-sync-race/completed-control.html)

报告把动作尝试次数和已提交效果数分开。稳定键案例恢复后动作执行两次，但目标 SQLite 事务对同一逻辑操作只保留一个效果。StepReceipt 不拦截、去重或修复 LangGraph 写入；它把动作状态和独立数据库读取整理成可检查报告。重复案例的 `--check` 必须失败；只有反例和三个对照组都符合实测结果，示例运行器才会返回成功。

## 运行示例

需要 Node.js 20+、Python 3.12 和仓库源码。安装可选且完整锁定的 Python 依赖需要访问包索引。执行 worker 时会拒绝 Python socket 连接、DNS 和 send-to 事件；不会调用模型或 Provider。

```bash
python3.12 -m venv .venv-langgraph-race
.venv-langgraph-race/bin/python -m pip install -r examples/langgraph-sync-race/requirements.txt
node examples/langgraph-sync-race/run.mjs \
  --python .venv-langgraph-race/bin/python \
  --out artifacts/langgraph-sync-race
```

PowerShell 命令见[英文说明](LANGGRAPH-SYNC-RACE.md#run-the-example)。每个场景报告位于 `artifacts/langgraph-sync-race/`，包含三次重复、源 JSON、Markdown 摘要和真实 `--check` 结果。顶层 `measurements.json` 记录版本、门控事件名、检查点读取、动作尝试和效果计数。输出目录必须是新路径；运行器不会覆盖或清理旧数据。

## 控制点说明

图使用一个 thread、单同步 `StateGraph`、`SqliteSaver`、本地业务效果 SQLite 和 `durability="sync"`。事件门控 saver 暂停返回序号 2 的动作所对应的 `put_writes`。在更新 checkpoint 到达 `put` 边界时，重复案例记录尝试顺序，并在该 checkpoint 持久化**之前**以退出码 73 终止进程。随后独立进程只读检查 checkpoint 与业务效果，恢复同一 thread，再次通过只读连接读取效果。

顺序对照组会先释放并等待同一个 task write 落库，再在同一退出点终止。稳定键对照组保留竞态退出点，但为逻辑操作设置唯一键，并在同一 SQLite 事务中提交操作键与效果。正常完成对照组给出一次动作的基线。每个场景使用新的数据库并重复三次。

## 范围与来源

这是确定性的合成 SQLite 夹具，不是性能基准，也不声称所有 saver、操作系统、存储、图结构或 LangGraph 版本都会如此。它没有测试 Cloud、分布式检查点、断电、生产 API、并发 worker、模型行为或外部副作用。Python audit hook 用于减少 worker 意外联网，不是通用安全沙箱。本地唯一键也不能让另一个邮件、支付或社媒 API 获得恰好一次保证。

链接中的 Issue 已包含作者自己的复现。本例是独立的 StepReceipt 示例，使用公开 LangGraph API 和固定依赖；新增内容是事件门控交错、隔离对照组、重复测量和可分享报告。没有复制 issue 评论中的代码、修改 LangGraph 或声称维护者接受/认可结果。单独的[进程崩溃示例](LANGGRAPH.zh-CN.md)仍使用自己的依赖版本，演示的是另一种故障点。
