export function normalizeRun(input) {
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  function text(value, max = 1000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError('Expected non-empty text within the length limit.');
    return value.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/g, '[redacted]')
      .replace(/\b(api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  }
  function date(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError('Expected an ISO timestamp.');
    return new Date(value).toISOString();
  }
  if (!object(input) || input.schemaVersion !== 1 || !Array.isArray(input.steps) || input.steps.length > 1000) throw new TypeError('Expected a StepReceipt v1 run with at most 1,000 steps.');
  const ids = new Set();
  const steps = input.steps.map((s) => {
    if (!object(s) || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(s.id) || ids.has(s.id)) throw new TypeError('Every step needs a unique, simple ID.');
    ids.add(s.id);
    if (!['read', 'write'].includes(s.kind) || !['ok', 'error'].includes(s.toolStatus)) throw new TypeError('Unknown action kind or unfinished tool status.');
    if (!Number.isFinite(s.durationMs) || s.durationMs < 0) throw new TypeError('Invalid duration.');
    const v = s.verification ?? { status: 'unknown', summary: 'No observation was recorded.' };
    if (!object(v) || !['verified', 'rejected', 'unknown'].includes(v.status)) throw new TypeError('Unknown verification status.');
    return {
      id: s.id, label: text(s.label, 240), kind: s.kind,
      startedAt: date(s.startedAt), durationMs: Math.round(s.durationMs), toolStatus: s.toolStatus,
      ...(s.toolStatus === 'error' ? { errorName: /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(s.errorName ?? '') ? s.errorName : 'Error' } : {}),
      verification: { status: v.status, summary: text(v.summary, 2000), ...(v.observedAt ? { observedAt: date(v.observedAt) } : {}) },
    };
  });
  return { schemaVersion: 1, title: text(input.title, 240), startedAt: date(input.startedAt), steps };
}

function errorClassName(error) {
  const valid = (name) => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,59}$/.test(name);
  const candidates = [error?.name, error?.constructor?.name].filter(valid);
  return candidates.find((name) => name !== 'Error') ?? candidates[0] ?? 'Error';
}

export function createReceipt({ title }) {
  normalizeRun({ schemaVersion: 1, title, startedAt: new Date().toISOString(), steps: [] });
  const run = { schemaVersion: 1, title, startedAt: new Date().toISOString(), steps: [] };
  const busy = new Set();
  return {
    async attempt({ label, kind = 'read' }, action) {
      if (!['read', 'write'].includes(kind) || typeof label !== 'string' || !label.trim() || label.length > 240 || typeof action !== 'function') throw new TypeError('Provide a label, read/write kind, and action function.');
      const step = { id: `step-${run.steps.length + 1}`, label, kind, startedAt: new Date().toISOString(), durationMs: 0, toolStatus: 'running' };
      run.steps.push(step);
      const start = performance.now();
      let value;
      try { value = await action(); step.toolStatus = 'ok'; }
      catch (error) { step.toolStatus = 'error'; step.errorName = errorClassName(error); }
      finally { step.durationMs = performance.now() - start; }
      // Deliberately capture only the error class, never messages, stacks, or page contents.
      return { id: step.id, ok: step.toolStatus === 'ok', value };
    },
    async verify(id, observe) {
      const step = run.steps.find((s) => s.id === id);
      if (!step || step.toolStatus === 'running' || step.verification || busy.has(id) || typeof observe !== 'function') throw new TypeError('Verify a completed step once, using an observation function.');
      busy.add(id);
      let result;
      try {
        try { result = await observe(); }
        catch { result = { status: 'unknown', summary: 'The observation raised an error. The outcome is unknown.' }; }
        const verification = { ...result, observedAt: new Date().toISOString() };
        const validated = normalizeRun({ ...run, steps: [{ ...step, verification }] });
        step.verification = validated.steps[0].verification;
        return { ...step.verification };
      } finally { busy.delete(id); }
    },
    toJSON() {
      if (busy.size) throw new TypeError('Wait for observations to finish before exporting.');
      return normalizeRun(run);
    },
  };
}
