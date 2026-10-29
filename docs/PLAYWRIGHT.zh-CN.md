# Playwright 页面信号

StepReceipt 的可选 Playwright 适配器会在一次动作前后记录少量页面信号。它不会替你判断业务任务是否成功。

## 接入方式

```js
import { createReceipt } from 'stepreceipt';
import { recordPageAction } from 'stepreceipt/playwright';

const receipt = createReceipt({ title: '发布草稿' });
const step = await recordPageAction(receipt, page, {
  label: '保存草稿',
  kind: 'write',
  action: () => page.getByRole('button', { name: '保存' }).click(),
});

// step.ok 只描述工具调用，不代表页面结果。
await receipt.verify(step.id, async () => {
  const saved = await page.getByText('草稿已保存').isVisible();
  return {
    status: saved ? 'verified' : 'unknown',
    summary: saved ? '独立检查通过。' : '没有观察到预期状态。',
  };
});
```

动作回调只运行一次。适配器在动作前、以及回调结束后立即读取页面信号，并把 `pageEvidence` 加到同一条 StepReceipt 记录。如果页面会异步更新，请在回调里等待相关页面状态稳定后再返回。任一侧采样失败时，页面信号会标为部分可用或不可用；动作仍只运行一次，不会自动重试或重放。

回调也可能引用另一个页面；适配器无法从任意回调中判断动作实际使用了哪个页面。请明确选择目标：`ok` 和页面信号都不证明目标身份。

## 在选定的 Playwright 页面点击

对于用 Playwright 选择器定位的点击，`recordPageClick` 通过采样所用的同一个 `Page` 对象创建并执行点击：

此入口在当前源码中提供，早期固定版本不包含它。

```js
import { recordPageClick } from 'stepreceipt/playwright';

const step = await recordPageClick(receipt, page, {
  label: '保存草稿',
  selector: 'button[data-action="save"]',
});
```

选择器必须恰好匹配一个元素；没有匹配或匹配多个元素时记录工具错误，不执行点击。页面已关闭时也记录错误。选择器不会写入回执。点击后仍需通过 `receipt.verify()` 独立核对业务结果；不做检查时结果保持 `unknown`。

调用方需要自己选择正确的 `Page` 对象并确认操作范围。该方法仅把自己的点击绑定到这个对象，不能验证浏览器会话或远程工具的目标身份，也不能冻结页面导航、使检查与点击成为原子操作，或证明服务端保存成功。它不修复 BrowserSkill，也不能直接用于其 API。其他动作可以继续使用 `recordPageAction`，注意回调要使用正在采样的页面。

安装开发依赖和 Playwright 浏览器后，可运行 `npm run test:page-click`。该检查使用两个网址相同、对象不同的合成页面，也覆盖目标缺失、匹配多个元素和页面关闭的情况。

## 记录哪些信号

报告会显示以下信号是否变化：

- `url`：完整网址的临时指纹是否变化。
- `title`：页面标题的临时指纹是否变化。
- `visible_text`：可见文本样本的指纹或文本总长度是否变化。样本最多取 65,536 个字符，并分散覆盖页面文本。
- `controls`：按钮、表单控件和链接的数量是否变化。

原始网址、标题、页面文字和指纹都不会写入回执或报告。指纹不是密码学签名、身份凭据或正确性证明，只用于比较是否相同。可见文本样本可能漏掉采样点之间的小改动；如果文本总长度也没变，这种改动可能检测不到。

`changed` 表示至少一项采样信号发生变化，`no_visible_change` 表示这些信号都没变。两者都不是任务判定：DOM 变化可能与目标无关；服务器端也可能已完成操作，但页面没有可见变化。请另写针对具体任务的 `receipt.verify()` 检查。没有单独检查时，结果仍为 `unknown`。

## 已测试范围

当前适配器通过本地合成 Playwright 页面测试，尚未在生产网站上验收，也不是 browser-use、Stagehand、Codex 或 MCP 原生适配器。它需要兼容 Playwright 的 `page.evaluate()` 方法，不会给 StepReceipt 增加运行时依赖。
