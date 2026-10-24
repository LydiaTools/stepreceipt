# Stagehand v4.3.0 整合示例

StepReceipt 的可选页面适配器需要浏览器对象提供 `evaluate()`。Stagehand v4 的 `Page` 提供此方法，因此可以记录 Stagehand 动作，而无需把 Stagehand 加入 StepReceipt 核心依赖。

可运行示例固定使用 Stagehand 4.3.0，调用它与 Playwright 兼容的 `Page.locator().click()` 接口。它不调用需要大模型的 `stagehand.act()`，因此不需要模型 Key 或 Browserbase 账号。本地测试页有一个会改变状态的按钮和一个无效果按钮。报告会分别显示浏览器调用结果、页面信号和单独的状态检查。

## 运行

需要 Node.js 22.18+，并在本机安装 Chrome 或 Chromium。如果 Stagehand 没有自动找到浏览器，可将 `CHROME_PATH` 设为浏览器可执行文件的路径。

```bash
cd examples/stagehand
npm ci
npm run demo
```

示例会在随机本地端口提供 `fixture.html`，并启动全新的无头浏览器。它不会访问生产网站，不需要模型或 Browserbase 凭据。报告写入 `examples/stagehand/artifacts/`。

预期结果：

| 动作 | Stagehand 调用 | 页面信号 | 独立检查 |
| --- | --- | --- | --- |
| 保存按钮 | Stagehand Page 点击返回 | `changed` | `verified` |
| 无效果按钮 | Stagehand Page 点击返回 | `no_visible_change` | `rejected` |

无效果案例说明：浏览器调用成功，不代表任务完成。这个示例验证了当前 Stagehand 版本与合成页面的兼容性，不代表它在生产网站上的可靠性，也不能证明业务结果。

## 接入方式

```js
const step = await recordPageAction(receipt, page, {
  label: '保存测试草稿',
  kind: 'write',
  action: () => page.locator('#save').click(),
});

await receipt.verify(step.id, async () => {
  const saved = await page.evaluate(() =>
    document.querySelector('#save-status')?.textContent === 'Saved'
  );
  return {
    status: saved ? 'verified' : 'rejected',
    summary: saved ? '页面显示已保存。' : '没有观察到已保存状态。',
  };
});
```

页面信号适配器只提供诊断信息。它不会把 DOM 变化直接当成任务结果、不会重试操作，也不声称目标应用已经持久化写入。详见[适配器边界](PLAYWRIGHT.zh-CN.md)。

如需包裹 `stagehand.act(...)`，需要先为 Stagehand 配置受支持的大模型及 API 凭据。本地示例没有调用该模型方法，因此未验收模型供应商配置或 AI 动作选择。
