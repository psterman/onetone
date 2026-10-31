/**
 * Home research mode — normalize, panel HTML, ResearchResult, export, SSRF contract.
 * Run: npm run test:home-research
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('src/index.html');
const capsSrc = read('src/js/features/now/home-agent-capabilities.js');
const researchSrc = read('src/js/features/now/home-research.js');
const shell = read('src/js/features/now/home-agent-v2.js');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');
const css = read('src/css/home-agent-v2.css');
const ssrf = read('src-tauri/src/research/ssrf.rs');
const ipcToml = read('src-tauri/permissions/app-ipc.toml');

assert.match(html, /home-research\.js/);
assert.match(html, /home-agent-capabilities\.js[\s\S]*home-research\.js[\s\S]*home-agent-v2-store\.js/);
assert.match(shell, /researchPanelHtml|data-ha2-research-start|data-ha2-research-export/);
assert.match(shell, /ha2ModeResearch|workMode.*research|researchPanelHtml\(snap\)/);
assert.match(shell, /data-ha2-research-host|researchPageBodyHtml|resolveResearchTopic/);
assert.match(shell, /researchLiveFeedHtml|researchReportPreviewHtml|ha2-research-live/);
assert.match(shell, /researchNodesHtml|data-ha2-research-file|researchFilePreviewPaneHtml/);
assert.match(shell, /data-ha2-research-confirm|data-ha2-research-path|ha2-research-facet/);
assert.match(researchSrc, /liveSources|rawMarkdown|isSkeletonHeading|stripPromptEcho/);
assert.match(researchSrc, /planSearchQueriesHeuristic|searchMany|selectBalancedHits/);
assert.match(researchSrc, /awaiting_approval|confirmAndRun|preparePlan|BUDGETS|classifyPath/);
assert.match(researchSrc, /programmaticCiteCheck|facetSourceCoverage|keyClaimCiteRate/);
assert.match(researchSrc, /maxTokens:\s*8192/);
assert.match(css, /ha2-research-live|ha2-research-preview|ha2-research-bar|ha2-research-nodes|ha2-research-file/);
assert.match(css, /ha2-research-metrics|ha2-research-facets/);
assert.match(shell, /workMode\) \|\| ''\) === 'research'/);
assert.match(shell, /clearResearchComposeInputs|paintResearchLiveNow|researchPaintRaf/);
assert.match(researchSrc, /invokeArgs|resolveWbLlm|accountId/);
assert.match(researchSrc, /provider:\s*'auto'|emptyNoSourceResult|finishWithoutSources/);
assert.match(researchSrc, /emitTimer|420|yieldUi/);
assert.doesNotMatch(shell, /data-ha2-research-topic/);
assert.match(shell, /paintResearchLive/);
assert.ok(fs.existsSync('scripts/research-fixtures.json'));
assert.ok(fs.existsSync('scripts/research-baseline.mjs'));
{
  const fixtures = JSON.parse(read('scripts/research-fixtures.json'));
  assert.ok(Array.isArray(fixtures.cases) && fixtures.cases.length >= 4);
  fixtures.cases.forEach((c) => {
    assert.ok(c.topic && c.userConditions && c.evaluationPoints);
    assert.ok(c.evaluationPoints.length >= 3);
  });
}

{
  const ssrfSrc = read('src-tauri/src/research/search.rs');
  assert.match(ssrfSrc, /search_auto_with_diag|search_bing|search_wikipedia|lite\.duckduckgo/);
  assert.match(ssrfSrc, /parse_ddg_lite_fixture|parses_ddg_lite|parses_bing_h2/);
  assert.match(ssrfSrc, /research_log|bot_challenge|diagnostics/);
}
assert.match(storeSrc, /workMode === 'research'|openConfig/);
assert.match(css, /\.ha2-research\b/);
assert.match(ipcToml, /allow-cmd-research-web-search/);
assert.match(ipcToml, /allow-cmd-research-fetch-url/);
assert.match(ipcToml, /allow-cmd-research-export/);
assert.match(ssrf, /ssrf_blocked/);
assert.match(ssrf, /is_private_or_special/);
assert.match(ssrf, /blocks_file_and_localhost/);

const sandbox = {
  console,
  Date,
  JSON,
  Array,
  Object,
  String,
  Promise,
  Error,
  Math,
  setTimeout,
  clearTimeout,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] != null ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    }
  },
  OneToneIpc: {
    invoke() {
      return Promise.reject(new Error('ipc_stub'));
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(capsSrc, sandbox, { filename: 'home-agent-capabilities.js' });
vm.runInContext(researchSrc, sandbox, { filename: 'home-research.js' });

const Caps = sandbox.OneToneHomeAgentCapabilities;
const R = sandbox.OneToneHomeResearch;
assert.ok(Caps && Caps.normalizeWorkMode);
assert.ok(R && R.renderMarkdown && R.buildResultFromSynthesis);

// --- workMode normalize ---
assert.equal(Caps.normalizeWorkMode('research'), 'research');
assert.equal(Caps.normalizeWorkMode('调研'), 'research');
assert.equal(Caps.normalizeWorkMode('investigate'), 'research');
assert.equal(Caps.normalizeWorkMode('think'), 'think');
assert.equal(Caps.normalizeWorkMode('chat'), 'think');
assert.equal(Caps.normalizeWorkMode('edit'), 'edit');
assert.equal(Caps.normalizeWorkMode('work'), 'edit');
assert.equal(Caps.normalizeWorkMode('readonly'), 'readonly');

{
  const sess = Caps.projectSession({
    selectedKind: 'workbuddy',
    wbSendMode: 'local',
    workMode: 'research'
  });
  assert.equal(sess.mode, 'research');
  assert.equal(sess.modeEffective, true);
}

{
  const sess = Caps.projectSession({
    selectedKind: 'workbuddy',
    wbSendMode: 'desktop',
    workMode: 'research'
  });
  assert.equal(sess.mode, 'research');
  assert.equal(sess.modeEffective, false);
}

// --- config panel / status ---
{
  R.openConfig({ topic: 'DeepSeek Team Agent', depth: 'quick', format: 'markdown' });
  const snap = R.getSnapshot();
  assert.equal(snap.status, 'configuring');
  assert.equal(snap.config.topic, 'DeepSeek Team Agent');
  assert.equal(snap.config.depth, 'quick');
  assert.equal(snap.config.format, 'markdown');
  assert.match(shell, /data-ha2-research-config|data-ha2-research-topic|data-ha2-research-start/);
}

// --- structured sources + with-sources result ---
{
  const sources = R.normalizeSources([
    {
      title: 'Example',
      url: 'https://example.com/a',
      snippet: 'hello',
      fetchedAt: '2026-01-01T00:00:00.000Z',
      text: 'body about widgets [S1]'
    },
    { title: 'dup', url: 'https://example.com/a', snippet: 'x' },
    { title: 'bad', url: '', snippet: '' }
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'S1');
  assert.equal(sources[0].url, 'https://example.com/a');

  const md =
    '# Widgets\n\n## 摘要\nWidgets matter [S1].\n\n## 机制\nDetail [S1].\n\n## 结论\nOk.\n';
  const result = R.buildResultFromSynthesis({
    markdown: md,
    sources: sources,
    topic: 'Widgets',
    model: 'test-model',
    queries: ['Widgets'],
    depth: 'quick'
  });
  assert.equal(result.status, 'completed_with_sources');
  assert.equal(result.title, 'Widgets');
  assert.match(result.summary, /Widgets matter/);
  assert.ok(result.sources.length >= 1);
  assert.ok(result.sources[0].usedInSections.length >= 1);

  const outMd = R.renderMarkdown(result);
  assert.match(outMd, /^# Widgets/m);
  assert.match(outMd, /## 摘要/);
  assert.match(outMd, /## 结论/);
  assert.match(outMd, /## 生成时间/);
  assert.match(outMd, /## 调研限制/);
  assert.match(outMd, /## 来源列表/);
  assert.match(outMd, /https:\/\/example\.com\/a/);
  assert.match(outMd, /网络调研完成/);
  assert.doesNotMatch(outMd, /api[_-]?key|sk-/i);

  const outHtml = R.renderHtml(result);
  assert.match(outHtml, /<!DOCTYPE html>/i);
  assert.match(outHtml, /<h1>Widgets<\/h1>/);
  assert.match(outHtml, /https:\/\/example\.com\/a/);
  assert.match(outHtml, /网络调研完成/);
  assert.match(outHtml, /class="card"|callout|wrap/);
  assert.doesNotMatch(outHtml, /api[_-]?key|sk-/i);
}

// --- dossier HTML renders markdown tables ---
{
  const rich = R.buildResultFromSynthesis({
    markdown:
      '# 对比\n\n## 摘要\n> 核心结论一句话。\n\n## 核心对比\n| 维度 | A | B |\n| --- | --- | --- |\n| 价格 | 1 | 2 |\n\n## 结论与建议\n选 A。\n',
    sources: [{ id: 'S1', title: 'A', url: 'https://a.test', text: 'x' }],
    topic: 'A与B对比'
  });
  const htmlRich = R.renderHtml(rich);
  assert.match(htmlRich, /<table>/);
  assert.match(htmlRich, /callout/);
  assert.match(htmlRich, /核心结论/);
}

// --- empty sources → completed_without_sources (never “网络调研完成”) ---
{
  const result = R.buildResultFromSynthesis({
    markdown: '# Topic\n\n## 摘要\n整理一下。\n\n## 结论\n未确认。\n',
    sources: [],
    topic: 'Topic',
    model: 'm'
  });
  assert.equal(result.status, 'completed_without_sources');
  assert.match(result.limitations.join(' '), /基于已有材料整理/);
  const md = R.renderMarkdown(result);
  assert.match(md, /基于已有材料整理/);
  assert.doesNotMatch(md, /状态：网络调研完成/);
  assert.match(md, /不是网络调研完成|无网络来源/);
  const htmlOut = R.renderHtml(result);
  assert.match(htmlOut, /基于已有材料整理/);
  assert.doesNotMatch(htmlOut, /状态：网络调研完成/);
  assert.equal(R.statusLabel(result.status), '基于已有材料整理');
}

// --- synthesis prompt forces citations + multi-entity coverage ---
{
  const prompt = R.buildSynthesisSystemPrompt(
    [{ id: 'S1', title: 'A', url: 'https://a.test', text: 'x' }],
    '北京和杭州哪个才是美食荒漠',
    ['北京美食', '杭州美食']
  );
  assert.match(prompt, /不得捏造 URL/);
  assert.match(prompt, /未确认|缺口/);
  assert.match(prompt, /\[S1\]/);
  assert.match(prompt, /禁止写成「标题」|具体报告标题/);
  assert.match(prompt, /杭州美食|检索词/);
  assert.doesNotMatch(prompt, /^规则：/m);
  const emptyPrompt = R.buildSynthesisSystemPrompt([], '主题x', []);
  assert.match(emptyPrompt, /已有材料整理|未做网络检索/);
  assert.doesNotMatch(emptyPrompt, /网络调研完成/);
  const cleaned = R.stripPromptEcho(
    '规则：\n1. 紧扣主题作答\n# 真标题\n\n## 摘要\n正文'
  );
  assert.match(cleaned, /^# 真标题/);
  assert.doesNotMatch(cleaned, /^规则/);
}

// --- heuristic query plan covers both cities ---
{
  const qs = R.planSearchQueriesHeuristic('北京和杭州哪个才是美食荒漠？');
  assert.ok(qs.some((q) => /杭州/.test(q)), 'should include Hangzhou query: ' + qs.join('|'));
  assert.ok(qs.some((q) => /北京/.test(q)), 'should include Beijing query');
  assert.ok(qs.some((q) => /美食/.test(q)), 'should include food aspect');
  const bal = R.selectBalancedHits(
    [
      { title: '北京美食', url: 'https://bj.test', snippet: '北京' },
      { title: '北京旅游', url: 'https://bj2.test', snippet: '北京' },
      { title: '杭州美食', url: 'https://hz.test', snippet: '杭州' },
      { title: '杭州小吃', url: 'https://hz2.test', snippet: '杭州' },
      { title: '其他', url: 'https://x.test', snippet: '' }
    ],
    3,
    ['北京', '杭州']
  );
  assert.equal(bal.length, 3);
  assert.ok(bal.some((h) => /杭州/.test(h.title)));
  assert.ok(bal.some((h) => /北京/.test(h.title)));
}

// --- preview prefers raw markdown over skeleton headings ---
{
  const raw =
    '# 北京与杭州美食对比\n\n## 摘要\n杭州菜系多样，北京烤鸭与小吃丰富。[S1]\n\n## 结论\n未确认谁是荒漠。\n';
  const result = R.buildResultFromSynthesis({
    markdown: raw,
    sources: [{ id: 'S1', title: 'A', url: 'https://a.test', text: 'x' }],
    topic: '北京杭州美食',
    depth: 'quick'
  });
  assert.equal(result.title, '北京与杭州美食对比');
  assert.match(result.rawMarkdown, /北京与杭州美食对比/);
  assert.match(R.renderMarkdown(result), /北京与杭州美食对比/);
  assert.doesNotMatch(R.renderMarkdown(result), /^## 正文$/m);
}

// --- next-step hints ---
assert.match(R.nextStepHint({ code: 'no_llm' }), /WorkBuddy|Soft Pad/);
assert.match(R.nextStepHint({ code: 'search_unavailable' }), /搜索/);
assert.match(R.nextStepHint({ code: 'cancelled' }), /取消/);

// --- cancel ---
{
  R.openConfig({ topic: 'x' });
  R.cancel();
  assert.equal(R.getSnapshot().status, 'idle');
  assert.equal(R.getSnapshot().error.code, 'cancelled');
}

// --- classify path ---
{
  assert.equal(R.classifyPath('今天星期几', 'quick').path, 'fast');
  assert.equal(R.classifyPath('随便问问', 'deep').path, 'faceted');
  assert.equal(R.classifyPath('A和B怎么选', 'standard').path, 'faceted');
  assert.equal(R.classifyPath('杭州办理居住证材料', 'standard').path, 'faceted');
  assert.equal(R.classifyPath('事实核实', 'standard', 'faceted').path, 'faceted');
}

// --- task deps + attempt guard ---
{
  const T = R.__testOnly;
  T.setStateForTest({
    tasks: [
      T.makeTask({ id: 'a', kind: 'plan', status: 'pending', attemptId: 1 }),
      T.makeTask({ id: 'b', kind: 'search', deps: ['a'], status: 'pending', attemptId: 1 })
    ]
  });
  assert.equal(T.setTaskStatus('b', 'running', { attemptId: 1 }), false);
  T.setTaskStatus('a', 'completed', { attemptId: 1 });
  assert.equal(T.setTaskStatus('b', 'running', { attemptId: 1 }), true);
  T.setTaskStatus('b', 'completed', { attemptId: 1, bumpAttempt: true });
  const b = T.findTask('b');
  assert.equal(b.attemptId, 2);
  assert.equal(T.setTaskStatus('b', 'failed', { attemptId: 1 }), false);
  assert.equal(b.status, 'completed');
}

// --- global ledger caps ---
{
  const T = R.__testOnly;
  T.setStateForTest({ ledger: T.blankLedger('standard', 'fast') });
  assert.equal(T.ledgerCan('search', 3), true);
  assert.equal(T.ledgerSpend('search', 3), true);
  assert.equal(T.ledgerCan('search', 1), false);
  assert.equal(T.ledgerSpend('search', 1), false);
  assert.equal(T.getState().ledger.hitCap, 'search');
}

// --- programmatic cite check + readState ---
{
  const sources = R.__testOnly.annotateSourceReadState([
    { id: 'S1', url: 'https://a.test', text: 'long enough body text here!!!!', fetchedAt: 't' },
    { id: 'S2', url: 'https://b.test', snippet: 'only snip', text: 'x', fetchedAt: 't', readState: 'fetched' }
  ]);
  assert.equal(sources[0].readState, 'fetched');
  assert.equal(sources[1].readState, 'snippet');
  assert.equal(sources[1].fetchedAt, null);
  const ok = R.programmaticCiteCheck('结论 [S1]', sources);
  assert.equal(ok.ok, true);
  const bad = R.programmaticCiteCheck('结论 [S9]', sources);
  assert.equal(bad.ok, false);
  assert.ok(bad.missingCiteIds.includes('S9'));
}

// --- coverage denominators ---
{
  const cov = R.computeCoverage(
    [{ id: 'f1' }, { id: 'f2' }],
    {
      f1: [{ url: 'https://a', text: 'x' }],
      f2: []
    },
    '## 直接回答\n选 A [S1]。\n无引用的一句足够长的关键结论。\n',
    null
  );
  assert.equal(cov.facetSourceCoverage.num, 1);
  assert.equal(cov.facetSourceCoverage.den, 2);
  assert.ok(cov.keyClaimCiteRate.den >= 1);
  assert.ok(cov.keyClaimCiteRate.num >= 1);
}

await (async () => {
  R.resetIdle();
  const snap = await R.preparePlan({ topic: '荣耀和vivo怎么选', depth: 'standard' });
  assert.equal(snap.status, 'awaiting_approval');
  assert.equal(snap.plan.path, 'faceted');
  assert.ok(snap.plan.facets.length >= 2);
  R.updatePlan({ path: 'fast' });
  assert.equal(R.getSnapshot().plan.path, 'fast');
  R.updatePlan({ path: 'faceted' });
  assert.equal(R.getSnapshot().plan.path, 'faceted');
  R.cancel();
  assert.equal(R.getSnapshot().status, 'idle');
})();

console.log('test-home-research: ok');
