export function normalizePageEvidence(input) {
  const pageSignals = new Set(['url', 'title', 'visible_text', 'controls']);
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const captureStatus = input?.captureStatus;
  const outcome = input?.outcome;
  const beforeCaptured = input?.beforeCaptured;
  const afterCaptured = input?.afterCaptured;
  const signals = input?.signals;
  if (!object(input) || !['complete', 'partial', 'unavailable'].includes(captureStatus) ||
      !['changed', 'no_visible_change', 'unavailable'].includes(outcome) ||
      typeof beforeCaptured !== 'boolean' || typeof afterCaptured !== 'boolean' ||
      !Array.isArray(signals) || signals.length > pageSignals.size ||
      signals.some((signal) => !pageSignals.has(signal)) || new Set(signals).size !== signals.length) {
    throw new TypeError('Invalid page evidence.');
  }
  const complete = beforeCaptured && afterCaptured;
  if ((captureStatus === 'complete') !== complete ||
      (captureStatus === 'partial') !== (beforeCaptured !== afterCaptured) ||
      (captureStatus === 'unavailable') !== (!beforeCaptured && !afterCaptured) ||
      (captureStatus === 'complete' && outcome === 'unavailable') ||
      (captureStatus !== 'complete' && (outcome !== 'unavailable' || signals.length !== 0)) ||
      (outcome === 'changed' && signals.length === 0) ||
      (outcome === 'no_visible_change' && signals.length !== 0)) {
    throw new TypeError('Page evidence fields do not describe a consistent capture.');
  }
  return { captureStatus, outcome, beforeCaptured, afterCaptured, signals: [...signals] };
}
