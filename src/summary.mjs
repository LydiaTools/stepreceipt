import { normalizeRun } from './receipt.mjs';

export function summarizeRun(input) {
  const run = normalizeRun(input);
  const counts = { total: run.steps.length, verified: 0, rejected: 0, unknown: 0, toolErrors: 0 };
  for (const step of run.steps) {
    counts[step.verification.status] += 1;
    if (step.toolStatus === 'error') counts.toolErrors += 1;
  }
  return { run, counts, passed: counts.total > 0 && counts.verified === counts.total };
}

function markdown(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/[\r\n]+/g, ' ');
}

export function renderSummary(input) {
  const { run, counts, passed } = summarizeRun(input);
  const pageSignal = (step) => {
    if (!step.pageEvidence) return 'not captured';
    if (step.pageEvidence.captureStatus === 'partial') return 'partial capture';
    if (step.pageEvidence.outcome === 'unavailable') return 'unavailable';
    if (step.pageEvidence.outcome === 'no_visible_change') return 'no visible change';
    return `changed: ${step.pageEvidence.signals.map((signal) => signal.replaceAll('_', ' ')).join(', ')}`;
  };
  return [
    `## StepReceipt: ${markdown(run.title)}`,
    '',
    `**Recorded-check gate: ${passed ? 'passed' : 'blocked'}.** ${counts.total} actions; ${counts.verified} verified; ${counts.rejected} rejected; ${counts.unknown} unknown; ${counts.toolErrors} tool errors.`,
    '',
    '| Action | Tool return | Page signals | Recorded check | Observation |',
    '| --- | --- | --- | --- | --- |',
    ...run.steps.map((step) => `| ${markdown(step.label)} | ${step.toolStatus} | ${markdown(pageSignal(step))} | ${step.verification.status} | ${markdown(step.verification.summary)} |`),
    '',
    'Checks are supplied by the integration. StepReceipt has not rerun the actions or independently verified these observations. An empty run is blocked. A verified observation may accompany a tool error.',
    '',
  ].join('\n');
}
