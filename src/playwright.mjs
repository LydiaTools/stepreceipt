async function snapshot(page) {
  try {
    const value = await page.evaluate(() => {
      const fingerprintText = (text) => {
        let first = 0x811c9dc5;
        let second = 0x9e3779b9;
        for (let index = 0; index < text.length; index += 1) {
          const code = text.charCodeAt(index);
          first = Math.imul(first ^ code, 0x01000193);
          second = Math.imul(second ^ code, 0x85ebca6b);
        }
        return `${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
      };
      const text = document.body?.innerText ?? '';
      const sample = text.length <= 65536
        ? text
        : Array.from({ length: 64 }, (_, index) => {
            const start = Math.floor((text.length - 1024) * index / 63);
            return text.slice(start, start + 1024);
          }).join('\u0000');
      const controls = document.querySelectorAll('button, [role="button"], input, textarea, select, a[href]').length;
      return {
        url: fingerprintText(location.href),
        title: fingerprintText(document.title),
        visibleText: fingerprintText(sample),
        visibleTextLength: text.length,
        controls,
      };
    });
    if (!value || typeof value.url !== 'string' || typeof value.title !== 'string' ||
        typeof value.visibleText !== 'string' || !Number.isFinite(value.visibleTextLength) ||
        !Number.isFinite(value.controls)) return null;
    return value;
  } catch {
    return null;
  }
}

function compare(before, after) {
  const beforeCaptured = Boolean(before);
  const afterCaptured = Boolean(after);
  if (!beforeCaptured || !afterCaptured) {
    return {
      captureStatus: beforeCaptured || afterCaptured ? 'partial' : 'unavailable',
      outcome: 'unavailable', beforeCaptured, afterCaptured, signals: [],
    };
  }
  const signals = [];
  if (before.url !== after.url) signals.push('url');
  if (before.title !== after.title) signals.push('title');
  if (before.visibleText !== after.visibleText || before.visibleTextLength !== after.visibleTextLength) signals.push('visible_text');
  if (before.controls !== after.controls) signals.push('controls');
  return {
    captureStatus: 'complete',
    outcome: signals.length ? 'changed' : 'no_visible_change',
    beforeCaptured, afterCaptured, signals,
  };
}

/**
 * Run one action and attach safe before/after Playwright page signals to its receipt.
 * A page change is diagnostic context, not proof that the requested task succeeded.
 */
export async function recordPageAction(receipt, page, { label, kind = 'read', action } = {}) {
  if (!receipt || typeof receipt.attempt !== 'function' || typeof receipt.addPageEvidence !== 'function') {
    throw new TypeError('Provide a StepReceipt recorder.');
  }
  if (!page || typeof page.evaluate !== 'function') throw new TypeError('Provide a Playwright-compatible page.');
  if (typeof action !== 'function') throw new TypeError('Provide one action function.');
  if (typeof label !== 'string' || !label.trim() || label.length > 240 || !['read', 'write'].includes(kind)) {
    throw new TypeError('Provide a label and read/write action kind.');
  }

  const before = await snapshot(page);
  const attempt = await receipt.attempt({ label, kind }, action);
  const after = await snapshot(page);
  const pageEvidence = receipt.addPageEvidence(attempt.id, compare(before, after));
  return { ...attempt, pageEvidence };
}
