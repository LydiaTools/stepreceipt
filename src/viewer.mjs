export function boot(normalizeRun) {
  const $ = (id) => document.getElementById(id);
  let run = normalizeRun(JSON.parse($('receipt-data').textContent));
  function initialStep() {
    for (const match of [
      (step) => step.kind === 'write' && step.verification.status !== 'verified',
      (step) => step.verification.status !== 'verified',
      (step) => step.toolStatus === 'error',
    ]) {
      const index = run.steps.findIndex(match);
      if (index >= 0) return index;
    }
    return 0;
  }
  let selected = initialStep();
  let lang = 'en';
  const words = {
    en: {
      headline: 'See what happened after the click.', sub: 'Tool results and observations, side by side.',
      load: 'Open JSON', download: 'Save HTML report', source: 'Source & setup', example: 'Local fixture demo',
      steps: 'Recorded steps', verified: 'Checks passed', rejected: 'Checks failed', unknown: 'Unknown outcomes', errors: 'Tool errors',
      timeline: 'Run timeline', attempted: 'What the tool returned', observed: 'What was checked afterward',
      ok: 'Returned normally', error: 'Returned an error', read: 'Read', write: 'Write',
      vverified: 'Verified', vrejected: 'Check failed', vunknown: 'Not verified', duration: 'Duration',
      next: 'Before the next action', raw: 'Inspect the exported JSON', empty: 'No steps recorded yet.',
      unknownAdvice: 'Observe the target before repeating a write. This report has no confirmed outcome for this step.',
      rejectedAdvice: 'The check did not pass. Inspect the observation before choosing a recovery.',
      verifiedAdvice: 'The observation passed. Decide whether any further action is necessary.',
      footer: 'Checks are supplied by your code. StepReceipt does not independently verify them or replay actions. Review task details before sharing.',
      local: 'File import and report rendering run in this page. No upload endpoint, analytics, or account.',
      jsonError: 'Could not open this file: ', fileSize: 'Use a JSON file smaller than 2 MB.',
    },
    zh: {
      headline: '点击之后，到底发生了什么？', sub: '把工具返回和后续观察放在一起看。',
      load: '打开运行 JSON', download: '下载这份报告', source: '源码与上手', example: '本地测试页演示',
      steps: '已记录步骤', verified: '检查通过', rejected: '检查未通过', unknown: '结果未知', errors: '工具报错',
      timeline: '运行时间线', attempted: '工具返回了什么', observed: '随后检查到了什么',
      ok: '正常返回', error: '返回错误', read: '读取', write: '写入',
      vverified: '已核验', vrejected: '检查未通过', vunknown: '尚未核验', duration: '耗时',
      next: '下一步操作之前', raw: '查看导出的 JSON', empty: '尚未记录步骤。',
      unknownAdvice: '重复写入之前，先观察目标状态。这一步还没有已确认的结果。',
      rejectedAdvice: '这次检查未通过。先查看观察结果，再选择恢复方式。',
      verifiedAdvice: '这次观察检查通过了。请判断是否还需要后续操作。',
      footer: '检查结果由接入代码提供。StepReceipt 不会独立验证它们，也不会重放操作。分享前请检查任务详情。',
      local: '文件读取与报告渲染都在当前页面完成，无上传接口、统计或账号。',
      jsonError: '无法打开该文件：', fileSize: '请选择小于 2 MB 的 JSON 文件。',
    },
  };
  function node(tag, value, className = '') {
    const el = document.createElement(tag); el.textContent = String(value); el.className = className; return el;
  }
  function render() {
    const t = words[lang]; document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-word]').forEach((el) => { el.textContent = t[el.dataset.word]; });
    $('language').textContent = lang === 'en' ? '中文' : 'English';
    $('run-title').textContent = run.title;
    $('run-date').textContent = new Date(run.startedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const values = [run.steps.length, run.steps.filter((s) => s.verification.status === 'verified').length, run.steps.filter((s) => s.verification.status === 'rejected').length, run.steps.filter((s) => s.verification.status === 'unknown').length, run.steps.filter((s) => s.toolStatus === 'error').length];
    ['count-steps','count-verified','count-rejected','count-unknown','count-errors'].forEach((id,i) => { $(id).textContent = values[i]; });
    $('timeline').replaceChildren();
    run.steps.forEach((step, index) => {
      const button = node('button', '', `step ${selected === index ? 'selected' : ''}`);
      button.setAttribute('aria-pressed', String(selected === index));
      button.append(node('span', String(index + 1).padStart(2, '0'), 'number'));
      const content = node('span', '', 'step-content'); content.append(node('strong', step.label), node('span', `${t[step.kind]} · ${t['v' + step.verification.status]}`, 'step-caption'));
      button.append(content); button.addEventListener('click', () => { selected = index; render(); }); $('timeline').append(button);
    });
    const detail = $('detail'); detail.replaceChildren();
    const step = run.steps[selected];
    if (!step) { detail.append(node('p', t.empty)); return; }
    const heading = node('div', '', 'detail-heading');
    heading.append(node('span', `${selected + 1} / ${run.steps.length}`, 'position'), node('h2', step.label));
    detail.append(heading);
    const panels = node('div', '', 'comparison');
    const returned = node('section', '', `observation ${step.toolStatus}`);
    returned.append(node('h3', t.attempted), node('strong', t[step.toolStatus], 'result'), node('p', step.toolStatus === 'error' ? step.errorName : t.ok), node('span', `${t.duration}: ${step.durationMs} ms`, 'meta'));
    const observed = node('section', '', `observation ${step.verification.status}`);
    observed.append(node('h3', t.observed), node('strong', t['v' + step.verification.status], 'result'), node('p', step.verification.summary));
    panels.append(returned, observed); detail.append(panels);
    const advice = node('section', '', 'advice');
    advice.append(node('h3', t.next), node('p', t[step.verification.status + 'Advice'])); detail.append(advice);
    $('raw').textContent = JSON.stringify(run, null, 2);
    $('receipt-data').textContent = JSON.stringify(run).replace(/</g, '\\u003c');
  }
  $('language').addEventListener('click', () => { lang = lang === 'en' ? 'zh' : 'en'; render(); });
  $('file').addEventListener('change', async (event) => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error(words[lang].fileSize);
      const next = normalizeRun(JSON.parse(await file.text()));
      run = next; selected = initialStep(); $('notice').textContent = ''; render();
    } catch { $('notice').textContent = words[lang].jsonError + (lang === 'en' ? 'Use a StepReceipt v1 JSON file under 2 MB with a title, timestamps, and steps.' : '请使用小于 2 MB、含标题、时间与步骤的 StepReceipt v1 JSON。'); }
    event.target.value = '';
  });
  $('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob(['<!doctype html>\n' + document.documentElement.outerHTML], { type: 'text/html' }));
    const a = node('a', ''); a.href = url; a.download = 'stepreceipt-report.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
}
