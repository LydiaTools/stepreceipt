# MCP：写入已经发生，响应却丢了

工具调用超时了。草稿到底创建成功没有？

这个源码示例使用 MCP TypeScript SDK 2.4.0。虚构的本地 `create_draft` 工具先提交一条记录，再由进程内 HTTP 包装器丢弃首次响应。示例对比了收到模糊错误后立即重试，与先读回再决定：

| 场景 | 创建调用 | 读回后的记录数 |
| --- | ---: | ---: |
| 响应不明确时立即重试 | 2 | 2 |
| 先按操作 ID 读回，再决定 | 1 | 1 |

两份报告均由 StepReceipt 实际运行生成：[立即重试](mcp/blind-retry.html) · [先读回](mcp/readback-first.html)。对应 JSON 观察记录：[立即重试](mcp/blind-retry-observation.json) · [先读回](mcp/readback-first-observation.json)。

## 运行示例

需要 Node.js 20+ 和 npm。示例不启动网络端口，也不调用外部服务。

```bash
cd examples/mcp
npm ci
npm run demo -- --out ../../artifacts/mcp-demo
```

命令会拒绝覆盖已有目录。再次运行时请换一个路径。每种场景都会写出 StepReceipt `run.json`、HTML `report.html` 和 `observation.json`。

## 这个示例展示什么

- 即使调用方收到错误，写入也可能已经提交。
- 再次写入之前，读回可以消除这次不确定性。
- 在这个非幂等的虚构场景里立即重试会产生重复记录。
- StepReceipt 记录调用和之后的观察，不控制其他 MCP 客户端的重试策略。

这是一个确定性的进程内小样，不衡量真实网络故障、生产 MCP Host/Router、远程服务或 Provider 的行为。虚构账本不代表所有 MCP 工具；接入真实系统需要合适的读回方式，或由目标端执行的操作键。本例位于当前源码树中，固定的 v0.8.1 Release 压缩包不包含它。
