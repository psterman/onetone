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
const gatewaySrc = read('src/js/features/now/model-gateway.js');
const contractsSrc = read('src/js/features/now/run-contracts.js');
const controllerSrc = read('src/js/features/now/work-controller.js');
const registrySrc = read('src/js/features/now/tool-registry.js');
const archiveSrc = read('src/js/features/now/run-archive.js');
const researchSrc = read('src/js/features/now/home-research.js');
const shell = read('src/js/features/now/home-agent-v2.js');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');
const css = read('src/css/home-agent-v2.css');
const ssrf = read('src-tauri/src/research/ssrf.rs');
const ipcToml = read('src-tauri/permissions/app-ipc.toml');

assert.match(html, /home-research\.js/);
assert.match(html, /tool-registry\.js[\s\S]*run-contracts\.js[\s\S]*work-controller\.js/);
assert.match(registrySrc, /network_diagnostics/);
assert.match(registrySrc, /actionSchema/);
assert.match(archiveSrc, /OneToneRunArchive/);
assert.match(contractsSrc, /assertAction|toArchivePayload|coerceInterrupted/);
assert.match(controllerSrc, /executeAction|duplicate_action|restore|cancel/);
assert.match(gatewaySrc, /streamChat/);
assert.match(gatewaySrc, /cmd_workbuddy_local_chat_start/);
assert.match(gatewaySrc, /cmd_workbuddy_local_chat_poll/);
assert.match(gatewaySrc, /cmd_workbuddy_local_chat_cancel/);
assert.match(shell, /Gateway\.streamChat/);
assert.match(html, /model-gateway\.js[\s\S]*home-research\.js/);
assert.match(html, /work-controller\.js[\s\S]*home-research\.js/);
// Research mode is product-hidden from work-mode chrome (chat|work only).
assert.doesNotMatch(
  (shell.match(/function workModeSegmentHtml[\s\S]*?var modes = \[[\s\S]*?\];/) || [''])[0],
  /id:\s*'research'/
);
assert.match(storeSrc, /research[\s\S]{0,80}think|product-hidden/);
assert.match(researchSrc, /规划模型已回复但不是合法 JSON|正式路径未建立/);
assert.match(html, /home-agent-capabilities\.js[\s\S]*home-research\.js[\s\S]*home-agent-v2-store\.js/);
assert.match(shell, /researchPanelHtml|data-ha2-research-start|data-ha2-research-export/);
assert.match(shell, /ha2ModeResearch|workMode.*research|researchPanelHtml\(snap\)/);
assert.match(shell, /data-ha2-research-host|researchPageBodyHtml|resolveResearchTopic/);
assert.match(shell, /researchLiveFeedHtml|researchReportPreviewHtml|ha2-research-live/);
assert.match(shell, /researchNodesHtml|data-ha2-research-file|researchFilePreviewPaneHtml/);
assert.match(shell, /data-ha2-research-confirm|data-ha2-research-path|ha2-research-facet/);
assert.match(shell, /data-ha2-research-planning|ha2ResearchPlanning|规划中/);
assert.match(shell, /data-ha2-research-clarify|ha2-research-clarify|applyClarifyOption/);
assert.match(shell, /data-ha2-research-clarify-submit|data-ha2-research-clarify-text/);
assert.match(shell, /data-ha2-research-replan|ha2ResearchReplan|plan-degraded/);
assert.match(researchSrc, /no_sources_ask_model|finishEmptyTemplate|degradeReason/);
assert.match(researchSrc, /liveSources|rawMarkdown|isSkeletonHeading|stripPromptEcho/);
assert.match(researchSrc, /planSearchQueriesHeuristic|searchMany|selectBalancedHits/);
assert.match(researchSrc, /awaiting_approval|confirmAndRun|preparePlan|BUDGETS|classifyPath/);
assert.match(researchSrc, /needsClarify|normalizeModelClarify|applyClarifyOption/);
assert.doesNotMatch(researchSrc, /topicLooksTooBroad|buildClarifyOptionsLocal|isVagueDomainSubject/);
assert.match(css, /ha2-research-clarify/);
assert.match(researchSrc, /isFormalModelIntent|modelPlanBlockedIntent|isJunkPrimaryToken/);
assert.match(researchSrc, /Only model captain facets|Formal path: model JSON only/);
assert.match(shell, /ha2ResearchNeedModelPlan|正式路径需要模型规划/);
assert.match(researchSrc, /rewriteSearchQueries|buildQueryRewritePrompt|model_rewrite|skipLedger/);
assert.match(researchSrc, /authority_dig|corpusNeedsAuthorityDig|buildAuthorityDigPrompt/);
assert.match(researchSrc, /modelPickSearchHits|parseUrlPickJson|passthroughBriefFromSources|purpose:\s*'brief'/);
assert.match(researchSrc, /source_gate|local_quality_filtered|gateSerpHitsForModelPick/);
assert.match(researchSrc, /chatOnceWithRetry|retryAction/);
assert.match(researchSrc, /synthesis_input|excerptChars|fallback_source_excerpt/);
assert.match(researchSrc, /model_pick_ok|model_pick_empty|model_pick_failed|localDroppedAfterModelPick/);
assert.match(researchSrc, /source:\s*'model'|validated:\s*true/);
// Formal brief/synth must prefer Controller retry — not skipController as the retry path.
assert.doesNotMatch(
  researchSrc,
  /purpose:\s*'synthesis'[\s\S]{0,220}skipController:\s*true/
);
assert.doesNotMatch(
  researchSrc,
  /purpose:\s*'brief'[\s\S]{0,220}skipController:\s*true/
);
assert.match(researchSrc, /fail_open_relevance|blobHasToken|isDictionaryTrapHit/);
assert.match(researchSrc, /disambiguateCompareQuery|isTextDiffToolNoise|Diffchecker/);
assert.match(researchSrc, /coverageGaps/);
assert.doesNotMatch(researchSrc, /'未确认：'\s*\+/);
assert.doesNotMatch(researchSrc, /证据不足，整理缺口报告/);
assert.match(researchSrc, /modelCalls:\s*null/);
assert.match(researchSrc, /modelCapFinite|Omit model when uncapped/);
assert.match(researchSrc, /repairRounds:\s*1/);
assert.match(researchSrc, /repairRounds:\s*2/);
assert.match(researchSrc, /search:\s*10,\s*fetch:\s*12/);
assert.match(researchSrc, /authority_dig.*path:\s*'fast'|path: 'fast'[\s\S]*authority_dig|缺侧\/权威源补搜/);
assert.match(researchSrc, /planSource = 'wb'|isFormalModelIntent/);
assert.doesNotMatch(researchSrc, /local\+wb/);
assert.match(researchSrc, /programmaticCiteCheck|facetSourceCoverage|keyClaimCiteRate/);
assert.match(researchSrc, /maxTokens:\s*8192/);
assert.match(css, /ha2-research-live|ha2-research-preview|ha2-research-bar|ha2-research-nodes|ha2-research-file/);
assert.match(css, /ha2-research-metrics|ha2-research-facets/);
assert.match(css, /ha2-research-html-frame.*rd-card|\.rd-card|\.rd-evidence|\.rd-risk/s);
assert.match(researchSrc, /ResearchDocument|validateResearchDocument|documentToMarkdown|documentToHtml|extractJsonObject/);
assert.match(researchSrc, /documentMode|legacy_fallback|insufficientEvidence/);
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
// Research entry is hidden: setWorkMode('research') collapses to think.
assert.match(storeSrc, /next === 'readonly' \|\| next === 'research'|product-hidden/);
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
vm.runInContext(gatewaySrc, sandbox, { filename: 'model-gateway.js' });
vm.runInContext(registrySrc, sandbox, { filename: 'tool-registry.js' });
vm.runInContext(contractsSrc, sandbox, { filename: 'run-contracts.js' });
vm.runInContext(archiveSrc, sandbox, { filename: 'run-archive.js' });
vm.runInContext(controllerSrc, sandbox, { filename: 'work-controller.js' });
vm.runInContext(researchSrc, sandbox, { filename: 'home-research.js' });

const Caps = sandbox.OneToneHomeAgentCapabilities;
const Gateway = sandbox.OneToneModelGateway;
assert.ok(Gateway);
assert.ok(Gateway.providers().some((p) => p.id === 'workbuddy'));
assert.ok(Gateway.providers().some((p) => p.id === 'softpad_our_freemodel'));
assert.ok(Gateway.providers().some((p) => p.id === 'custom_openai_compatible'));
assert.equal(Gateway.resolveProvider('intent').id, 'workbuddy');
assert.equal(Gateway.resolveProvider('synthesis').id, 'workbuddy');
assert.match(Gateway.normalizeError({ code: '401', message: 'bad key' }).code, /auth_failed/);
assert.equal(Gateway.normalizeError({ message: 'upstream_boom' }).code, 'model_error');
assert.equal(Gateway.normalizeError({ message: 'ECONNREFUSED' }).code, 'network_error');
assert.match(researchSrc, /runIntentRepairChat|afterInvalidJson/);
assert.match(researchSrc, /Must not leave preparePlan hung/);
assert.match(researchSrc, /budgetCaps|ledger\.caps|modelCalls/);
// Soft Pad FreeOnly empty catalog → metered Soft Pad keys before WorkBuddy fallback.
{
  const softCalls = [];
  let wbHits = 0;
  Gateway.configure({
    softpadChat: function (req) {
      softCalls.push(!!(req && req.allowMetered));
      if (!(req && req.allowMetered)) {
        return Promise.reject(Object.assign(new Error('no_free_model'), { code: 'no_free_model' }));
      }
      return Promise.resolve({
        ok: true,
        providerId: 'deepseek',
        model: 'deepseek-chat',
        text: 'from-softpad-metered'
      });
    },
    invoke: function (cmd) {
      if (String(cmd || '').indexOf('workbuddy') >= 0) {
        wbHits += 1;
        return Promise.reject(new Error('should_not_reach_workbuddy'));
      }
      return Promise.reject(new Error('unexpected_invoke:' + cmd));
    }
  });
  const softRes = await Gateway.chat({
    purpose: 'synthesis',
    providerId: 'softpad_our_freemodel',
    messages: [{ role: 'user', content: 'ping' }]
  });
  assert.equal(softRes.text, 'from-softpad-metered');
  assert.equal(softRes.providerId, 'softpad_our_freemodel');
  assert.equal(softRes.routeProviderId, 'softpad_our_freemodel');
  assert.equal(softRes.backendProviderId, 'deepseek');
  assert.ok(!softRes.fallbackFrom);
  assert.deepEqual(softCalls, [false, true]);
  assert.equal(wbHits, 0);
  Gateway.configure({ softpadChat: null, invoke: null, resolveWorkbuddy: null });
}
// Soft Pad empty 200 → WorkBuddy fallback.
{
  let wbHits = 0;
  Gateway.configure({
    softpadChat: function () {
      return Promise.resolve({ ok: true, providerId: 'deepseek', text: '   ' });
    },
    resolveWorkbuddy: function () {
      return Promise.resolve({ accountId: 'a1', model: 'hy3' });
    },
    invoke: function (cmd) {
      if (String(cmd || '').indexOf('workbuddy') >= 0) {
        wbHits += 1;
        return Promise.resolve({ content: 'from-wb-after-empty', model: 'hy3' });
      }
      return Promise.reject(new Error('unexpected_invoke:' + cmd));
    }
  });
  const emptyFb = await Gateway.chat({
    purpose: 'synthesis',
    providerId: 'softpad_our_freemodel',
    messages: [{ role: 'user', content: 'ping' }]
  });
  assert.equal(emptyFb.text, 'from-wb-after-empty');
  assert.equal(emptyFb.providerId, 'workbuddy');
  assert.equal(emptyFb.fallbackFrom, 'softpad_our_freemodel');
  assert.equal(wbHits, 1);
  Gateway.configure({ softpadChat: null, invoke: null, resolveWorkbuddy: null });
}
const Controller = sandbox.OneToneWorkController;
const Registry = sandbox.OneToneToolRegistry;
assert.equal(Registry.validate('network_diagnostics', {}, 'research').ok, true);
assert.equal(Registry.validate('network_diagnostics', {}, 'unknown').code, 'tool_not_allowed');
{
  const c = Controller.create({
    runId: 'controller-contract',
    mode: 'research',
    budget: { model: 2 },
    skipArchiveLoad: true
  });
  const started = c.actionStarted({ actionId: 'a1', toolId: 'network_diagnostics', arguments: {} });
  assert.equal(started.ok, true);
  assert.equal(c.actionStarted({ actionId: 'a1', toolId: 'network_diagnostics', arguments: {} }).code, 'duplicate_action');
  c.actionResult({ actionId: 'a1', ok: true, evidence: { kind: 'network' } });
  c.cancel('test_cancel');
  assert.equal(c.snapshot().status, 'cancelled');
}
await (async function () {
  const c = Controller.create({
    runId: 'controller-retry',
    mode: 'research',
    budget: { model: 3 },
    skipArchiveLoad: true,
    invoke: function () {
      return Promise.resolve({ ok: true, internetReachable: true });
    }
  });
  c.actionStarted({ actionId: 'retry-1', toolId: 'network_diagnostics', arguments: {} });
  c.actionResult({ actionId: 'retry-1', error: { code: 'timeout', message: 'timeout' } });
  const retry = await c.retryAction('retry-1');
  assert.equal(retry.ok, true);
  assert.ok(c.snapshot().actions.some(function (a) { return a.attempt >= 2 || a.actionId.indexOf('retry-1') === 0; }));
})();
const c = Controller.create({ mode: 'research', budget: { search: 1, fetch: 1, model: 1 }, skipArchiveLoad: true });
assert.equal(c.choose({ action: 'search', query: '实体 近期信息' }).ok, true);
assert.equal(c.actionStarted({ action: 'search', query: '实体 近期信息' }).ok, true);
assert.equal(c.choose({ action: 'search', query: '第二次查询' }).code, 'budget_exhausted');
assert.equal(c.finish('completed').status, 'completed');
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

  assert.ok(result.document);
  assert.equal(result.metrics.documentMode, 'legacy_fallback');

  const outMd = R.renderMarkdown(result);
  assert.match(outMd, /^# Widgets/m);
  assert.match(outMd, /## 直接回答|## 摘要/);
  assert.match(outMd, /## 结论|## 机制/);
  assert.match(outMd, /## 附录/);
  assert.match(outMd, /### 来源列表/);
  assert.match(outMd, /生成时间：/);
  assert.doesNotMatch(outMd, /结论仅基于所列来源/);
  assert.match(outMd, /https:\/\/example\.com\/a/);
  assert.match(outMd, /网络调研完成|有来源但证据不足/);
  assert.doesNotMatch(outMd, /api[_-]?key|sk-/i);
  // Analysis lead before appendix sources
  assert.ok(outMd.indexOf('## 附录') > outMd.indexOf('## 直接回答') || outMd.indexOf('## 附录') > 0);

  const outHtml = R.renderHtml(result);
  assert.match(outHtml, /<!DOCTYPE html>/i);
  assert.match(outHtml, /<h1>Widgets<\/h1>/);
  assert.match(outHtml, /https:\/\/example\.com\/a/);
  assert.match(outHtml, /网络调研完成|有来源但证据不足/);
  assert.match(outHtml, /rd-card|callout|wrap/);
  assert.doesNotMatch(outHtml, /api[_-]?key|sk-/i);
  assert.equal(outMd, R.documentToMarkdown(result.document));
  assert.equal(outHtml, R.documentToHtml(result.document));
}

// --- structured ResearchDocument JSON + comparison table ---
{
  const json = JSON.stringify({
    title: 'A与B对比',
    executiveAnswer: { text: '选 A。', sourceIds: ['S1'] },
    blocks: [
      {
        type: 'comparison',
        title: '核心对比',
        columns: ['维度', 'A', 'B'],
        rows: [
          ['价格', '1', '2'],
          ['结论', '优', '可']
        ]
      },
      {
        type: 'evidence',
        title: '依据',
        items: [{ text: 'A 更便宜', sourceIds: ['S1'] }]
      }
    ],
    claims: [{ text: '选 A', sourceIds: ['S1'], confidence: 'high' }],
    uncertainties: [],
    limitations: []
  });
  const sourcesA = [
    {
      id: 'S1',
      title: 'A',
      url: 'https://a.test',
      text: 'long enough body text here!!!!',
      fetchedAt: '2026-01-01T00:00:00.000Z'
    }
  ];
  const rich = R.buildResultFromSynthesis({
    markdown: '```json\n' + json + '\n```',
    sources: sourcesA,
    topic: 'A与B对比'
  });
  assert.equal(rich.metrics.documentMode, 'structured');
  assert.ok(rich.document);
  assert.match(rich.summary, /选 A/);
  const htmlRich = R.renderHtml(rich);
  assert.match(htmlRich, /<table>/);
  assert.match(htmlRich, /callout|直接回答/);
  assert.match(htmlRich, /rd-evidence|依据/);
  assert.match(R.renderMarkdown(rich), /\| 维度 \| A \| B \|/);

  // Prefaced + section-wrapped JSON must still render as structured report, not raw JSON cards.
  const wrapped = R.buildResultFromSynthesis({
    markdown:
      '以下为成稿：\n\n## 直接回答\n```json\n\n## 摘要\n```json\n\n## 正文\n```json\n' +
      json +
      '\n```\n',
    sources: sourcesA,
    topic: 'cursor是干嘛的？'
  });
  assert.equal(wrapped.metrics.documentMode, 'structured');
  assert.match(wrapped.title, /A与B对比|Cursor|cursor/i);
  assert.match(wrapped.summary, /选 A/);
  const wrappedHtml = R.renderHtml(wrapped);
  assert.match(wrappedHtml, /callout|直接回答/);
  assert.match(wrappedHtml, /<table>/);
  assert.doesNotMatch(wrappedHtml, /"executiveAnswer"\s*:/);
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

// --- synthesis prompt forces JSON ResearchDocument + citations ---
{
  const prompt = R.buildSynthesisSystemPrompt(
    [{ id: 'S1', title: 'A', url: 'https://a.test', text: 'x' }],
    '北京和杭州哪个才是美食荒漠',
    ['北京美食', '杭州美食']
  );
  assert.match(prompt, /不得编造\/捏造 URL|不得捏造 URL|不得编造 URL/);
  assert.match(prompt, /未确认|缺口|uncertainties/);
  assert.match(prompt, /\[S1\]/);
  assert.match(prompt, /禁止写成「标题」|具体报告标题/);
  assert.match(prompt, /杭州美食|检索词/);
  assert.match(prompt, /JSON|executiveAnswer|blocks/);
  assert.match(prompt, /comparison/);
  assert.match(prompt, /理解|行动|诚实|大胆/);
  assert.match(prompt, /干货先行|3～6 句|具体事实/);
  assert.match(prompt, /禁止.*因此无法确认|禁止把直接回答写成材料边界/);
  assert.match(prompt, /禁止.*三板斧|无法直接回答/);
  assert.match(prompt, /禁止套话|结论仅基于所列来源|不得编造/);
  assert.doesNotMatch(prompt, /整理缺口报告/);
  assert.doesNotMatch(prompt, /^规则：/m);
  assert.match(researchSrc, /salvage_before_synth|sourceHasUsableBody/);
  const emptyPrompt = R.buildSynthesisSystemPrompt([], '主题x', []);
  assert.match(emptyPrompt, /已有材料整理|未做网络检索/);
  assert.doesNotMatch(emptyPrompt, /网络调研完成/);
  const cleaned = R.stripPromptEcho(
    '规则：\n1. 紧扣主题作答\n# 真标题\n\n## 摘要\n正文'
  );
  assert.match(cleaned, /^# 真标题/);
  assert.doesNotMatch(cleaned, /^规则/);
}

// --- extractJsonObject nested braces + demote bad sourceIds ---
{
  const nested = R.extractJsonObject(
    'prefix {"title":"T","executiveAnswer":{"text":"答 {内嵌}","sourceIds":["S1"]},"blocks":[{"type":"bullets","title":"要点","items":[{"text":"好","sourceIds":["S1"]},{"text":"无出处","sourceIds":["S9"]}]}],"claims":[],"uncertainties":[],"limitations":[]} trailing'
  );
  assert.ok(nested);
  assert.equal(nested.title, 'T');
  const srcs = [
    {
      id: 'S1',
      title: 'A',
      url: 'https://a.test',
      text: 'long enough body text here!!!!',
      fetchedAt: 't'
    }
  ];
  const doc = R.validateResearchDocument(nested, srcs, { topic: 'T', documentMode: 'structured' });
  assert.equal(doc.metrics.documentMode, 'structured');
  assert.ok(doc.uncertainties.some((u) => /无出处|缺少有效来源/.test(u)));
  const confirmed = doc.claims.filter((c) => c.confirmed);
  assert.ok(confirmed.some((c) => c.text === '好'));
  assert.ok(doc.claims.some((c) => c.text === '无出处' && !c.confirmed));
  const md = R.documentToMarkdown(doc);
  const html = R.documentToHtml(doc);
  // Programmatic cite-noise stays in doc.uncertainties but is demoted from the visible lead.
  assert.ok(doc.uncertainties.some((u) => /无出处|缺少有效来源/.test(u)));
  assert.match(md, /## 附录/);
  assert.ok(md.indexOf('## 附录') > md.indexOf('## 直接回答'));
  assert.doesNotMatch(md, /结论仅基于所列来源/);
  assert.ok(doc.metrics && doc.metrics.sourceBoundNote);
  assert.ok(!(doc.limitations || []).some((t) => /结论仅基于所列来源/.test(t)));
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror=/i);
}

// --- model-first brief passthrough + SERP pick parse; dictionary LQ ---
{
  assert.equal(
    R.isLowQualityResearchSource({
      url: 'https://www.zdic.net/hans/%E6%B1%AA',
      title: '汪 wāng - 汉典'
    }),
    true,
    'zdic/汉典 must drop'
  );
  assert.equal(
    R.isLowQualityResearchSource({
      url: 'https://wappass.baidu.com/static/captcha/',
      title: '百度安全验证'
    }),
    true,
    'captcha must drop'
  );
  const urls = R.parseUrlPickJson(
    '选这些：\n```json\n["https://baike.baidu.com/item/汪峰","https://zh.wikipedia.org/wiki/旭日阳刚"]\n```'
  );
  assert.ok(urls && urls.length === 2, JSON.stringify(urls));
  assert.match(urls[0], /汪峰/);
  const brief = R.passthroughBriefFromSources([
    {
      id: 'S1',
      title: '汪峰',
      url: 'https://example.com/wf',
      text: '汪峰是中国大陆摇滚歌手，代表作包括《怒放的生命》。'
    }
  ]);
  assert.equal(brief.passthrough, true);
  assert.equal(brief.mode, 'fallback_source_excerpt');
  assert.ok(brief.facts.length >= 1);
  assert.equal(brief.facts[0].sourceId, 'S1');
  assert.match(brief.facts[0].text, /摇滚/);
  const longBody = {
    id: 'S2',
    title: '长文',
    url: 'https://example.com/long',
    text: '甲'.repeat(1200)
  };
  const longBrief = R.passthroughBriefFromSources([longBody]);
  assert.ok(longBrief.facts[0].text.length >= 800, 'passthrough keeps ≥800 chars for synth');
  assert.equal(R.sourceGateReason({ url: 'https://www.zdic.net/hans/旭', title: '旭' }), 'zdic');
  assert.equal(
    R.sourceGateReason({ url: 'https://wappass.baidu.com/static/captcha/', title: '验证' }),
    'captcha'
  );
  const gated = R.gateSerpHitsForModelPick(
    [
      { title: '旭 组词', url: 'https://www.zdic.net/hans/旭', snippet: '词典' },
      { title: '汪峰百科', url: 'https://baike.baidu.com/item/汪峰', snippet: '歌手' },
      { title: '安全验证', url: 'https://wappass.baidu.com/x', snippet: 'captcha' }
    ],
    { silent: true }
  );
  assert.equal(gated.gated, 2);
  assert.equal(gated.candidates.length, 1);
  assert.match(gated.candidates[0].url, /汪峰/);
}

// --- authority dig helpers: official-heavy detect + prompt keeps primary ---
{
  assert.equal(R.BUDGETS.standard.repairRounds, 2);
  assert.equal(R.BUDGETS.standard.modelCalls, null);
  assert.equal(R.BUDGETS.standard.search, 10);
  assert.equal(R.BUDGETS.standard.fetch, 12);
  assert.equal(R.BUDGETS.deep.repairRounds, 2);
  const officialHeavy = [
    { id: 'S1', url: 'https://cursor.com/', title: 'Cursor' },
    { id: 'S2', url: 'https://www.cursor.com/pricing', title: 'Pricing' },
    { id: 'S3', url: 'https://cursor.com/docs', title: 'Docs' }
  ];
  assert.equal(R.corpusNeedsAuthorityDig(officialHeavy, {}), true);
  const mixed = [
    { id: 'S1', url: 'https://cursor.com/', title: 'Cursor' },
    { id: 'S2', url: 'https://en.wikipedia.org/wiki/Cursor_(code_editor)', title: 'Wiki' },
    { id: 'S3', url: 'https://www.theverge.com/cursor', title: 'Verge' }
  ];
  assert.equal(R.corpusNeedsAuthorityDig(mixed, {}), false);
  assert.equal(R.corpusNeedsAuthorityDig(mixed, { coverageBlocked: true }), true);
  assert.equal(
    R.corpusNeedsAuthorityDig(mixed, { pickedMiss: true, rawHits: 5 }),
    true
  );
  const digPrompt = R.buildAuthorityDigPrompt(
    '什么是 Cursor',
    {
      entities: [{ name: 'Cursor', aliases: [], kind: 'product' }]
    },
    ['cursor.com'],
    ['什么是 Cursor']
  );
  assert.match(digPrompt, /Cursor/);
  assert.match(digPrompt, /评测|对比|维基|权威|开放挖掘/);
  assert.match(digPrompt, /主实体：Cursor|禁止 UP主/);
  const geoPrompt = R.buildAuthorityDigPrompt(
    'augment在国内外',
    { entities: [{ name: 'Augment', aliases: [], kind: 'product' }] },
    ['augmentcode.com'],
    ['augment在国内外']
  );
  assert.match(geoPrompt, /国内|China|国内外/);
}

// --- relevance: Latin case-insensitive + strict fail-open ---
{
  const intent = {
    originalQuestion: 'augment在国内外',
    entities: [{ name: 'Augment', aliases: ['Augment'], kind: 'product' }]
  };
  const hit = {
    title: 'Augment Code — AI coding platform',
    url: 'https://www.augmentcode.com/',
    snippet: 'organization-level agents'
  };
  const scored = R.scoreHitRelevance(
    hit,
    { soft: ['Augment', '国内外'], strict: ['Augment'] },
    intent
  );
  assert.ok(scored.score > 0);
  assert.equal(scored.reject, false);

  const ranked = R.rankHitsForIntent(
    [
      {
        title: 'Unrelated noise page',
        url: 'https://example.com/other',
        snippet: 'hello'
      },
      hit
    ],
    intent,
    { query: 'augment在国内外', label: 'augment在国内外' },
    { strictAliases: true }
  );
  assert.ok(ranked.relevantHits >= 1);
  assert.ok(
    ranked.hits.some((h) => /augmentcode\.com/i.test(h.url)),
    'Augment entity must match augmentcode.com case-insensitively'
  );

  // Strict tokens that never appear on hit → do NOT fail-open junk without primary
  const fo = R.rankHitsForIntent(
    [
      {
        title: 'Some product page',
        url: 'https://www.augmentcode.com/pricing',
        snippet: 'pricing'
      }
    ],
    {
      originalQuestion: 'XYZ唯一令牌',
      entities: [{ name: 'XYZ唯一令牌', aliases: ['XYZ唯一令牌'], kind: 'other' }]
    },
    null,
    { strictAliases: true }
  );
  assert.ok(fo.rawHits === 1);
  assert.equal(fo.relevantHits, 0);
  assert.equal(!!fo.failOpen, false);
}

// --- multi-entity compare: generic sides + Diffchecker noise (no brand specialty) ---
{
  assert.equal(R.extractCompareSides('比较firefox和edge').join('|'), 'firefox|edge');
  assert.equal(R.extractCompareSides('对比firefox').join('|'), 'firefox');
  const q = R.normalizeResearchQuery('对比firefox');
  assert.match(q, /firefox/i);
  assert.match(q, /对比 评测/);
  assert.doesNotMatch(q, /^对比firefox$/i);
  assert.doesNotMatch(q, /Chrome|浏览器/i);
  assert.equal(
    R.disambiguateCompareQuery('对比firefox', '对比firefox和chrome'),
    'firefox vs chrome 对比 评测'
  );
  assert.equal(
    R.disambiguateCompareQuery('比较firefox和edge', '比较firefox和edge'),
    'firefox vs edge 对比 评测'
  );
  const seeded = R.seedEntitiesFromTopic('比较firefox和edge');
  assert.ok(seeded.some((e) => /firefox/i.test(e.name)));
  assert.ok(seeded.some((e) => /edge/i.test(e.name)));
  assert.doesNotMatch(
    JSON.stringify(seeded),
    /Mozilla Firefox|Google Chrome|Microsoft Edge/
  );
  const compareIntent = {
    originalQuestion: '比较firefox和edge',
    entities: [
      { name: 'firefox', aliases: ['firefox'], kind: 'product' },
      { name: 'edge', aliases: ['edge'], kind: 'product' }
    ]
  };
  const diffHit = {
    title: 'Diffchecker — Compare text online',
    url: 'https://www.diffchecker.com/',
    snippet: 'Compare text to find the difference between two text files'
  };
  assert.equal(R.isTextDiffToolNoise(diffHit, compareIntent), true);
  assert.equal(R.isOffTopicNoiseSource(diffHit, compareIntent), true);
  const moocHit = {
    title: '中国大学MOOC_优质在线课程学习平台',
    url: 'https://www.icourse163.org/',
    snippet: '国家精品课程在线学习平台'
  };
  // No specialty domain blacklist — entity gate rejects misses.
  assert.equal(R.isOffTopicNoiseSource(moocHit, compareIntent), false);
  const rankedJunk = R.rankHitsForIntent(
    [
      moocHit,
      {
        title: '13900K 默频 R23 温度电压',
        url: 'https://www.chiphell.com/thread-1.html',
        snippet: 'Cinebench 跑分'
      },
      {
        title: 'Firefox vs Edge browser comparison 2024',
        url: 'https://www.pcmag.com/comparisons/firefox-vs-edge',
        snippet: 'Mozilla Firefox and Microsoft Edge privacy and speed'
      }
    ],
    compareIntent,
    { query: 'firefox vs edge 对比 评测', label: '比较firefox和edge' },
    { strictAliases: true }
  );
  assert.equal(rankedJunk.relevantHits, 1);
  assert.ok(/pcmag\.com/i.test(rankedJunk.hits[0].url));
  const realHit = {
    title: 'Firefox vs Chrome: which browser is better?',
    url: 'https://www.browserstack.com/guide/firefox-vs-chrome',
    snippet: 'Compare Firefox and Chrome browsers on speed and privacy'
  };
  assert.equal(R.isTextDiffToolNoise(realHit, compareIntent), false);
  assert.match(
    R.buildSynthesisSystemPrompt([realHit], '比较firefox和edge', [q]),
    /主题忠实|旁支产品|Diffchecker/
  );
  assert.match(
    R.buildSynthesisSystemPrompt([realHit], '比较firefox和chrome', [q]),
    /对比题|怎么比|缺侧/
  );
  assert.doesNotMatch(
    R.planSearchQueriesHeuristic('比较firefox和chrome').join(' '),
    /Firefox vs Chrome 浏览器|Mozilla|Google Chrome browser official/
  );

  // Compare plan must open BOTH sides — never same-side×2
  const cmpEnts = R.seedEntitiesFromTopic('比较firefox和chrome');
  const cmpFacets = R.compareProductFacets('比较firefox和chrome', cmpEnts);
  assert.ok(cmpFacets && cmpFacets.length >= 2);
  const labels = cmpFacets.map((f) => f.label).join(' ');
  assert.match(labels, /firefox/i);
  assert.match(labels, /chrome/i);
  assert.ok(cmpFacets.some((f) => /chrome/i.test((f.queries || []).join(' '))));
  assert.doesNotMatch(
    cmpFacets.map((f) => (f.queries || []).join(' ')).join(' '),
    /浏览器|Mozilla|Google Chrome browser/
  );
  const onlyFf = [
    { id: 'S1', title: 'Firefox browser', url: 'https://www.mozilla.org/firefox/', text: 'Firefox privacy' }
  ];
  const missing = R.missingComparePartners(onlyFf, {
    originalQuestion: '比较firefox和chrome',
    entities: cmpEnts
  });
  assert.ok(missing.some((p) => /chrome/i.test(p.name)));
  assert.equal(R.corpusNeedsAuthorityDig(onlyFf, { missingPartners: missing }), true);

  // Phone compare: only OPPO official pages → missing vivo → dig needed (fast path gap).
  const phoneTopic = 'OPPO和vivo拍照样张对比评测';
  const phoneEnts = [
    { name: 'OPPO', aliases: ['oppo'], kind: 'product' },
    { name: 'vivo', aliases: ['Vivo'], kind: 'product' }
  ];
  const onlyOppo = [
    {
      id: 'S1',
      title: 'OPPO 智能手机',
      url: 'https://www.oppo.com/cn/smartphones/',
      text: 'OPPO Find 系列影像'
    },
    {
      id: 'S2',
      title: 'OPPO 官网',
      url: 'https://www.oppo.com/cn/',
      text: 'OPPO 品牌介绍'
    },
    {
      id: 'S3',
      title: 'OPPO 商城',
      url: 'https://www.opposhop.cn/',
      text: 'OPPO 商城促销'
    }
  ];
  const missVivo = R.missingComparePartners(onlyOppo, {
    originalQuestion: phoneTopic,
    entities: phoneEnts
  });
  assert.ok(missVivo.some((p) => /vivo/i.test(p.name)), JSON.stringify(missVivo));
  assert.equal(
    R.corpusNeedsAuthorityDig(onlyOppo, { missingPartners: missVivo }),
    true,
    'one-sided OPPO官网 must trigger authority dig'
  );
  const digFb = R.heuristicAuthorityDigQueries(
    phoneTopic,
    'OPPO',
    { originalQuestion: phoneTopic, entities: phoneEnts },
    onlyOppo
  );
  assert.ok(
    digFb.some((q) => /vivo/i.test(q)),
    'heuristic dig must name missing side: ' + digFb.join('|')
  );
  assert.match(
    R.buildResearchIntentPrompt(phoneTopic),
    /preferredPath|对比|faceted/
  );
}

// --- long CJK+latin titles: book marks / spaces must not collapse to「令人」---
{
  const marked = '《令人心动的offer3》和《令人心动的offer8》对比';
  assert.equal(
    R.extractCompareSides(marked).join('|'),
    '令人心动的offer3|令人心动的offer8'
  );
  assert.equal(
    R.extractCompareSides('令人心动的offer 3 和 令人心动的offer 8').join('|'),
    '令人心动的offer3|令人心动的offer8'
  );
  const offerIntent = R.buildLocalResearchIntent(marked);
  assert.ok(offerIntent.entities.some((e) => /令人心动的offer3/i.test(e.name)));
  assert.ok(offerIntent.entities.some((e) => /令人心动的offer8/i.test(e.name)));
  assert.ok(!offerIntent.entities.some((e) => e.name === '令人'));
  assert.ok((offerIntent.facets || []).length >= 2);
  assert.doesNotMatch(
    (offerIntent.facets || []).map((f) => f.label).join(' '),
    /^原问题检索$/
  );
  const offerQs = (offerIntent.facets || [])
    .map((f) => (f.queries || []).join(' '))
    .join(' ');
  assert.match(offerQs, /令人心动的offer3/);
  assert.match(offerQs, /令人心动的offer8/);
  assert.doesNotMatch(offerQs, /《|》/);
  const pruned = R.pruneStemEntities([
    { name: '令人', kind: 'other' },
    { name: '令人心动的offer3', kind: 'product' },
    { name: '令人心动的offer8', kind: 'product' }
  ]);
  assert.ok(!pruned.some((e) => e.name === '令人'));
  assert.equal(pruned.length, 2);
  const rankedOffer = R.rankHitsForIntent(
    [
      {
        title: '伊贺栗令人_百度百科',
        url: 'https://baike.baidu.com/item/伊贺栗令人',
        snippet: '奥特曼角色伊贺栗令人'
      },
      {
        title: '令人',
        url: 'https://baike.baidu.com/item/令人',
        snippet: '汉语词语'
      },
      {
        title: '令人心动的offer3_百度百科',
        url: 'https://baike.baidu.com/item/令人心动的offer3',
        snippet: '腾讯视频职场综艺 令人心动的offer 第三季'
      }
    ],
    offerIntent,
    offerIntent.facets[0],
    { strictAliases: true }
  );
  assert.equal(rankedOffer.relevantHits, 1);
  assert.match(rankedOffer.hits[0].title, /令人心动的offer3/);
  // Local scaffold is entity names only — model owns dig specialty (百科/横评等).
  assert.match(offerQs, /令人心动的offer3/);
  assert.match(offerQs, /令人心动的offer8|对比/);
  assert.doesNotMatch(offerQs, /百度百科|横评|official/i);
  assert.equal(
    R.isShallowPlayPageHit({
      url: 'https://v.qq.com/x/cover/abc/xyz.html',
      title: '令人心动的offer3 纯享'
    }),
    true
  );
  assert.equal(
    R.isShallowPlayPageHit({
      url: 'https://www.bilibili.com/video/BV1xxx',
      title: '令人心动的offer3 vs offer8 对比盘点'
    }),
    false
  );
  const playHeavy = [
    { url: 'https://v.qq.com/x/cover/a/b.html', title: 'offer3 纯享' },
    { url: 'https://www.bilibili.com/video/BV1a', title: 'offer3 剪辑' },
    { url: 'https://v.qq.com/x/cover/c/d.html', title: '职场综艺' }
  ];
  assert.equal(R.corpusMostlyShallowPlay(playHeavy), true);
  assert.equal(R.corpusNeedsAuthorityDig(playHeavy, { shallowPlay: true }), true);
  const onlyS3 = [
    {
      id: 'S1',
      title: '令人心动的offer3_百度百科',
      url: 'https://baike.baidu.com/item/令人心动的offer3',
      text: '令人心动的offer3 嘉宾 赛制'
    }
  ];
  const miss8 = R.missingComparePartners(onlyS3, offerIntent);
  assert.ok(miss8.some((p) => /offer8/i.test(p.name)));
  const repairQs = R.buildRepairQueriesFromCoverage(
    [{ ok: false, gapType: 'thin_evidence' }],
    offerIntent,
    []
  );
  assert.match(repairQs.join(' '), /offer3|offer8/);
  assert.match(repairQs.join(' '), /对比/);
  assert.doesNotMatch(repairQs.join(' '), /百度百科|横评/);
  assert.match(
    R.buildAuthorityDigPrompt(
      marked,
      offerIntent,
      ['v.qq.com', 'bilibili.com'],
      offerQs.split(/\s+/),
      playHeavy.concat(onlyS3)
    ),
    /由你判断|缺侧|播放页|按题意自选/
  );
  assert.match(
    R.buildResearchIntentPrompt(marked),
    /对比题|由你按题意自选|不会替你填固定/
  );
  assert.match(
    R.buildSynthesisSystemPrompt(onlyS3, marked, [offerQs]),
    /comparison 块|下一步补抓|材料未覆盖/
  );
  // Model facets must not be wholesale-replaced by local encyclopedia templates.
  const wbNorm = R.normalizeResearchIntent(
    {
      originalQuestion: marked,
      questionType: 'comparison',
      entities: [
        { name: '令人心动的offer3', aliases: [], kind: 'product' },
        { name: '令人心动的offer8', aliases: [], kind: 'product' }
      ],
      facets: [
        {
          id: 'f1',
          label: '第三季设定',
          queries: ['令人心动的offer3 嘉宾 赛制 主题'],
          questions: ['offer3 设定？'],
          keyPoints: ['题材']
        },
        {
          id: 'f2',
          label: '第八季设定',
          queries: ['令人心动的offer8 嘉宾 赛制 是否播出'],
          questions: ['offer8 设定？'],
          keyPoints: ['题材']
        }
      ]
    },
    marked
  );
  const wbQs = (wbNorm.facets || []).map((f) => (f.queries || []).join(' ')).join(' ');
  assert.match(wbQs, /嘉宾 赛制/);
  assert.doesNotMatch(wbQs, /百度百科|横评/);
}

// --- XSS: raw HTML in fragments must not rehydrate ---
{
  const evil = R.validateResearchDocument(
    {
      title: 'Safe',
      executiveAnswer: {
        text: '<script>alert(1)</script>**ok** <img onerror=alert(1) src=x>',
        sourceIds: []
      },
      blocks: [
        {
          type: 'paragraph',
          title: 'x',
          body: '<iframe src="https://evil.test"></iframe> click me'
        }
      ],
      claims: [],
      uncertainties: [],
      limitations: []
    },
    [],
    { topic: 'Safe' }
  );
  const html = R.documentToHtml(evil);
  assert.doesNotMatch(html, /<script[\s>]/i);
  assert.doesNotMatch(html, /<iframe[\s>]/i);
  assert.doesNotMatch(html, /<[^>]*\sonerror\s*=/i);
  assert.match(html, /&lt;img|onerror=alert/);
  assert.match(html, /<strong>ok<\/strong>/);
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

// --- intent JSON: loose repair + prefer intent shape (hy3 trailing commas / prose wrap) ---
{
  assert.match(researchSrc, /repairLooseJsonText|preferIntent|scoreResearchIntent/);
  assert.match(researchSrc, /只输出一个 ResearchIntent JSON|以 \{ 开头/);
  const wbLlm = read('src-tauri/src/workbuddy_local_llm.rs');
  assert.match(wbLlm, /obj\.remove\("reasoning_effort"\)/);
  assert.match(wbLlm, /empty content|invalid_json|reasoning_content/);
  const wrapped =
    '下面是规划：\n```json\n{"originalQuestion":"网络设计是什么","researchGoal":"弄清网络设计含义","questionType":"fact","entities":[{"name":"网络设计","aliases":[],"kind":"concept"}],"facets":[{"id":"f1","label":"定义","questions":["什么是网络设计"],"queries":["网络设计 定义","网络设计 百科"],"keyPoints":["定义"]}],"needsClarify":false}\n```\n完';
  const intent = R.extractResearchIntentJson(wrapped);
  assert.ok(intent, 'extract wrapped intent');
  assert.equal(intent.originalQuestion, '网络设计是什么');
  assert.ok(intent.facets && intent.facets.length >= 1);
  const trailing =
    '{"originalQuestion":"网络设计是什么","entities":[{"name":"网络设计","aliases":[],"kind":"concept",}],"facets":[{"id":"f1","label":"定义","questions":["q"],"queries":["网络设计 定义",],"keyPoints":["定义",],},],}';
  const loose = R.extractResearchIntentJson(trailing);
  assert.ok(loose, 'trailing commas repaired');
  assert.equal(loose.entities[0].name, '网络设计');
}

// --- next-step hints ---
assert.match(R.nextStepHint({ code: 'no_llm' }), /WorkBuddy|Soft Pad/);
assert.match(R.nextStepHint({ code: 'model_error' }), /调用失败|测通/);
assert.match(R.nextStepHint({ code: 'auth_failed' }), /鉴权|测通|重新登录/);
assert.match(R.nextStepHint({ code: 'search_unavailable' }), /搜索/);
assert.match(R.nextStepHint({ code: 'cancelled' }), /取消/);
{
  const a = R.classifyModelFailure({ code: 'model_error', message: 'model_error' });
  assert.equal(a.code, 'model_error');
  assert.doesNotMatch(a.message, /请先登录/);
  const b = R.classifyModelFailure({ code: 'no_account', message: 'no_account' });
  assert.equal(b.code, 'no_llm');
}

// --- synth fail must keep already-fetched sources (not wipe as failed) ---
{
  assert.match(researchSrc, /buildSourcesKeptResult|synth_failed_sources_kept/);
  const kept = R.buildSourcesKeptResult({
    topic: '勇哥是谁',
    reason: 'model_error',
    depth: 'standard',
    queries: ['勇哥'],
    sources: [
      {
        id: 'S1',
        title: '勇哥简介',
        url: 'https://example.test/yong',
        text: '勇哥是一位公开人物，近年活跃于短视频平台。正文足够长用于摘录测试。'
      },
      {
        id: 'S2',
        title: '相关报道',
        url: 'https://example.test/yong2',
        snippet: '媒体报道摘要'
      }
    ]
  });
  assert.ok(kept.sources && kept.sources.length >= 2);
  assert.match(kept.rawMarkdown || '', /勇哥是谁|来源摘录|模型整理失败/);
  assert.ok(
    kept.status === 'completed_with_sources' || kept.status === 'completed_without_sources',
    kept.status
  );
  assert.equal(kept.metrics && kept.metrics.synthDegraded, true);
}

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

// --- proper-name anchors: 李子柒 must not collapse to 李子 ---
{
  const topic = '李子柒为什么不直播了';
  const info = R.extractTopicAnchors(topic);
  assert.equal(info.primary, '李子柒');
  assert.equal(info.requirePrimary, true);
  assert.ok(info.anchors.includes('李子柒'));
  assert.ok(!info.anchors.includes('李子') || info.primary === '李子柒');

  const qs = R.planSearchQueriesHeuristic(topic);
  assert.ok(qs.some((q) => /李子柒/.test(q)));
  assert.ok(qs.some((q) => /人物|停更|原因|近况/.test(q)));
  assert.ok(qs.every((q) => !/^李子$/.test(String(q).trim())));

  const facets = R.buildFacetPlanHeuristic(topic);
  assert.ok(facets.length >= 2);
  assert.ok(facets.every((f) => /李子柒/.test(f.query)));
  assert.ok(facets.some((f) => f.label === '李子柒' || /李子柒/.test(f.label)));

  const plum = {
    title: '李子大量上市！中医提醒：李子真实身份是“五味药”',
    url: 'https://www.sohu.com/a/936292934_121948382',
    snippet: '食用 血糖 养生'
  };
  const person = {
    title: '李子柒停更原因曝光 为什么不直播了',
    url: 'https://news.example/liziqi',
    snippet: '李子柒 直播 停更'
  };
  const filtered = R.filterHitsByAnchors([plum, person], info);
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].title, /李子柒/);
  assert.equal(R.filterHitsByAnchors([plum], info).length, 0);
}

// --- leading-question anchors: 为什么+主体 must not degrade to weak tokens ---
{
  const topic = '为什么老高小茉不露面了';
  const info = R.extractTopicAnchors(topic);
  assert.equal(info.primary, '老高小茉');
  assert.equal(info.requirePrimary, true);
  assert.ok(info.anchors.includes('老高小茉'));

  const qs = R.planSearchQueriesHeuristic(topic);
  assert.ok(qs.some((q) => /老高小茉/.test(q)), 'queries must retain the subject: ' + qs.join('|'));
  assert.ok(qs.every((q) => String(q).trim().length >= 2));
  assert.ok(!qs.some((q) => /^为$|^调查面d*$/.test(String(q).trim())));

  const facets = R.buildFacetPlanHeuristic(topic);
  assert.ok(facets.length >= 2);
  assert.ok(facets.every((f) => /老高小茉/.test(f.query)));
}

// --- predicate clause must NOT become requirePrimary hard filter ---
{
  const food = '为什么b站这么多人喜欢美食下饭';
  const foodInfo = R.extractTopicAnchors(food);
  assert.equal(foodInfo.requirePrimary, false, 'food phenomenon is not a proper-name gate');
  assert.ok(!foodInfo.primary || !R.looksLikePredicateClause || !R.looksLikePredicateClause(foodInfo.primary || ''));
  const foodHits = [
    { title: 'B站下饭视频为什么这么香', url: 'https://ex.test/1', snippet: '吃播 陪伴感 美食' },
    { title: '完全跑题的天气新闻', url: 'https://ex.test/2', snippet: '台风路径' }
  ];
  const foodRank = R.rankHitsForIntent(
    foodHits,
    {
      status: 'ready',
      entities: [{ name: '哔哩哔哩', aliases: ['b站', 'B站'], kind: 'platform' }],
      phenomenon: '把美食视频当下饭内容',
      searchConcepts: ['下饭视频', '吃播', '陪伴感'],
      subjects: ['哔哩哔哩']
    },
    { questions: ['观看动机'], queries: ['哔哩哔哩 下饭视频'] },
    { strictAliases: false }
  );
  assert.ok(foodRank.relevantHits >= 1);
  assert.ok(foodRank.hits.some((h) => /下饭|吃播/.test(h.title + h.snippet)));
  // Hard filter must not empty on predicate primary
  assert.ok(R.filterHitsByAnchors(foodHits, foodInfo).length >= 1);

  const ye = '为什么b站现在没有办公室小野的消息了';
  const yeInfo = R.extractTopicAnchors(ye);
  assert.equal(yeInfo.primary, '办公室小野');
  assert.equal(yeInfo.requirePrimary, true);
  const yeHits = [
    { title: '办公室小野近况更新', url: 'https://ex.test/ye', snippet: '博主 停更' },
    { title: 'b站现在的推荐算法', url: 'https://ex.test/algo', snippet: '推荐' }
  ];
  const yeFiltered = R.filterHitsByAnchors(yeHits, yeInfo);
  assert.ok(yeFiltered.some((h) => /办公室小野/.test(h.title)));
  assert.ok(!yeFiltered.every((h) => /推荐算法/.test(h.title)));
}

// --- semantic ResearchIntent keeps long-question constraints ---
{
  const raw = JSON.stringify({
    originalQuestion: '为什么老高小茉最近不露面，是否与停更或家庭情况有关？',
    researchGoal: '调查老高小茉近期减少公开露面的原因',
    questionType: 'cause',
    entities: [{ name: '老高小茉', aliases: ['老高', '小茉'], kind: 'person' }],
    phenomenon: '减少公开露面',
    searchConcepts: ['停更', '近况'],
    subjects: ['老高小茉'],
    actions: ['解释原因', '核实近期状态'],
    timeRange: '近期',
    dimensions: ['账号更新', '本人回应', '媒体报道'],
    constraints: ['区分事实、传闻和推测'],
    ambiguities: [],
    facets: [
      {
        label: '账号更新与公开活动',
        questions: ['老高小茉近期账号更新和公开活动如何？'],
        queries: ['老高小茉 近期 更新 停更 直播', '停更 近况 公开说明']
      }
    ]
  });
  const intent = R.normalizeResearchIntent(R.extractResearchIntentJson(raw), '为什么老高小茉最近不露面，是否与停更或家庭情况有关？');
  assert.equal(intent.subjects[0], '老高小茉');
  assert.equal(intent.timeRange, '近期');
  assert.ok(intent.dimensions.includes('账号更新'));
  assert.ok(intent.facets[0].queries[0].includes('老高小茉'));
  assert.ok(intent.searchConcepts.includes('停更'));
  assert.equal(intent.status, 'ready');
  assert.equal(intent.originalQuestion, '为什么老高小茉最近不露面，是否与停更或家庭情况有关？');
  // cleanQuestion must not overwrite original
  assert.equal(intent.cleanQuestion, intent.originalQuestion);

  const bad = R.normalizeResearchIntent(
    { subjects: [], facets: [{ label: '调查面1', queries: ['为'] }] },
    '为什么老高小茉不露面了'
  );
  // Empty/junk facets → minimal subject seed (model owns specialty drills).
  assert.equal(bad.status, 'ready');
  assert.equal(bad.originalQuestion, '为什么老高小茉不露面了');
  assert.ok(bad.entities.some((e) => e.name === '老高小茉'));
  assert.ok(bad.facets[0].queries.some((q) => /老高小茉/.test(q)));
  assert.ok(!/人物 近况|评测 参数|UP主|bilibili/.test(bad.facets.map((f) => f.queries.join(' ')).join(' ')));
  const prompt = R.buildResearchIntentPrompt('为什么老高小茉最近不露面？');
  assert.match(prompt, /ResearchIntent/);
  assert.match(prompt, /originalQuestion/);
  assert.match(prompt, /searchConcepts/);
}

// --- UP主下探：人名优先于平台，丢掉通用 bilibili 落地页 ---
{
  const names = R.extractNamedSubjects('调研b站UP主玩主小小虫的履历与代表作');
  assert.ok(names.includes('玩主小小虫'), 'extract creator: ' + names.join('|'));
  const seeded = R.seedEntitiesFromTopic('b站UP主玩主小小虫履历与代表作');
  assert.equal(R.pickPrimarySearchEntity(seeded).name, '玩主小小虫');
  assert.ok(seeded.some((e) => e.name === '哔哩哔哩' && e.kind === 'platform'));
  const creatorIntent = R.normalizeResearchIntent(
    {
      originalQuestion: 'b站UP主玩主小小虫的履历与代表作',
      entities: [{ name: '哔哩哔哩', aliases: ['b站'], kind: 'platform' }],
      searchConcepts: [],
      facets: [{ label: '调查面1', queries: ['哔哩哔哩 热门视频 排行榜'] }]
    },
    'b站UP主玩主小小虫的履历与代表作'
  );
  assert.equal(creatorIntent.status, 'ready');
  assert.equal(R.pickPrimarySearchEntity(creatorIntent.entities).name, '玩主小小虫');
  const cq = creatorIntent.facets.map((f) => (f.queries || []).join(' ')).join(' ');
  assert.ok(/玩主小小虫/.test(cq), 'creator queries: ' + cq);
  assert.ok(!/^哔哩哔哩 热门/.test(creatorIntent.facets[0].queries[0]));
  const rankedCreator = R.rankHitsForIntent(
    [
      {
        title: '哔哩哔哩下载中心',
        url: 'https://app.bilibili.com/x/app-mang/',
        snippet: '客户端下载'
      },
      {
        title: '综合热门',
        url: 'https://www.bilibili.com/v/popular/all/',
        snippet: '热门推荐'
      },
      {
        title: '玩主小小虫的个人空间',
        url: 'https://space.bilibili.com/123',
        snippet: '玩主小小虫 UP主 代表作'
      }
    ],
    creatorIntent,
    creatorIntent.facets[0],
    { strictAliases: false }
  );
  assert.ok(rankedCreator.hits.length >= 1);
  assert.ok(rankedCreator.hits[0].url.indexOf('space.bilibili.com') >= 0);
  assert.ok(!rankedCreator.hits.some((h) => /app\.bilibili|popular\/all/.test(h.url)));
}

// --- B站热门：口语原句不足以当核心检索；须补排行/播放量 query，并丢掉什么值得买噪声 ---
{
  const weak = R.normalizeResearchIntent(
    {
      originalQuestion: '什么是b站最受欢迎视频',
      researchGoal: '找最受欢迎视频',
      questionType: 'fact',
      entities: [],
      searchConcepts: [],
      facets: [
        {
          label: '调查面1',
          questions: ['什么是b站最受欢迎视频'],
          queries: ['什么是b站最受欢迎视频']
        }
      ]
    },
    '什么是b站最受欢迎视频'
  );
  assert.equal(weak.status, 'ready');
  assert.ok(weak.entities.some((e) => e.name === '哔哩哔哩'));
  assert.ok(weak.searchConcepts.some((c) => /热门|播放/.test(c)));
  // Local no longer injects 排行榜 templates — model prompt owns ranking drills.
  const qBlob = weak.facets.map((f) => (f.queries || []).join(' ')).join(' ');
  assert.ok(qBlob.length > 0, 'keeps model/normalized queries: ' + qBlob);
  assert.ok(!/什么值得买/.test(qBlob));

  const deg = R.degradedIntent('什么是b站最受欢迎视频', 'missing_entities_or_facets');
  assert.equal(deg.status, 'degraded');
  assert.equal(deg.runnable, false);
  assert.equal((deg.facets || []).length, 0, 'degraded must not invent local search facets');
  assert.ok(deg.degradeReason);
  assert.equal(R.isFormalModelIntent(deg), false);

  const ranked = R.rankHitsForIntent(
    [
      {
        title: '什么值得买热搜：b站',
        url: 'https://www.smzdm.com/hot',
        snippet: '今日热搜词包含b站'
      },
      {
        title: '哔哩哔哩热门视频排行榜',
        url: 'https://example.test/bili-rank',
        snippet: '按播放量排序的热门视频'
      }
    ],
    weak,
    weak.facets[0],
    { strictAliases: false }
  );
  assert.ok(ranked.hits.length >= 1);
  assert.ok(ranked.hits[0].url.indexOf('bili-rank') >= 0);
  assert.ok(
    !ranked.hits.some((h) => /smzdm/.test(h.url)),
    'smzdm deal-site noise dropped for ranking goals'
  );
}

// --- Captain Plan: user aspects align prepare=run; plain 和 is not compare ---
{
  const q = '调研李子柒的早期视频和生平经历';
  const aspects = R.extractUserAspects(q);
  assert.equal(aspects.primary, '李子柒');
  assert.equal(aspects.aspects.join('|'), '早期视频|生平经历');
  const intent = R.buildLocalResearchIntent(q);
  assert.equal(intent.aspects.join('|'), '早期视频|生平经历');
  const labels = intent.facets.map((f) => f.label).join('|');
  assert.ok(/早期视频/.test(labels) && /生平经历/.test(labels), labels);
  assert.ok(!/对比与决策/.test(labels));
  assert.ok(intent.facets.every((f) => (f.queries || []).some((x) => x.indexOf('李子柒') >= 0)));
  assert.ok(intent.facets.some((f) => (f.queries || []).some((x) => /早期/.test(x))));
  assert.ok(intent.facets.some((f) => (f.queries || []).some((x) => /生平|成长|百科/.test(x))));
  // Heuristic must not invent compare facets for plain 和.
  const heur = R.buildFacetPlanHeuristic(q);
  assert.ok(!heur.some((f) => f.label === '对比与决策'));
  // prepare shape === runtime shape
  const prepared = R.facetsFromIntent(intent);
  assert.equal(
    prepared.map((f) => f.label).join('|'),
    intent.facets.map((f) => f.label).join('|')
  );
  const shallowCov = R.buildCoverageMatrix(intent, [
    {
      id: 'S1',
      title: '李子柒的个人空间',
      url: 'https://space.bilibili.com/19577966',
      snippet: '李子柒',
      text: '李子柒的个人空间',
      facetId: 'f1'
    }
  ]);
  assert.ok(shallowCov.some((c) => !c.ok));
  const drills = R.buildRepairQueriesFromCoverage(shallowCov, intent, intent.facets[0].queries);
  assert.ok(drills.length >= 1);
  assert.ok(drills.every((x) => x.indexOf('李子柒') >= 0));
  assert.ok(drills.some((x) => /早期|生平|成长|百科|代表作|团队/.test(x)), drills.join('|'));
}

// --- local fallback does NOT interpret topic; model owns specialty facets ---
{
  for (const q of ['时间是什么', '什么是Cursor', '什么是爱奇艺']) {
    const local = R.buildLocalResearchIntent(q);
    const blob = (local.facets || [])
      .map((f) => [f.label, ...(f.queries || [])].join(' '))
      .join('|');
    assert.ok(
      !/科学与哲学|物理学|相对论|业务与沿革|功能与评价|UP主|bilibili|下探资料|团队 成员/.test(
        blob
      ),
      'no specialty tpl for ' + q + ': ' + blob
    );
    assert.ok(
      (local.facets || []).some((f) => (f.queries || []).length > 0),
      'minimal queries exist: ' + q
    );
  }
  assert.match(
    R.buildResearchIntentPrompt('时间是什么'),
    /只输出一个 ResearchIntent JSON|什么是X|禁止 bilibili/
  );
  assert.match(R.buildResearchIntentPrompt('什么是Cursor'), /用户问题：什么是Cursor|只输出/);
  const clarifyPrompt = R.buildResearchIntentPrompt('怎么操作');
  assert.match(clarifyPrompt, /怎么操作|如何使用|needsClarify/);
  assert.match(clarifyPrompt, /人物事实题|前妻|人名/);
  assert.match(clarifyPrompt, /preferredPath/);
  assert.equal(R.queriesLookTooThin(['操作'], '怎么操作?'), true);
  assert.equal(R.queriesLookTooThin(['李亚鹏 前妻', '李亚鹏 王菲'], '李亚鹏的前妻有哪些?'), false);
}

// --- formal model path: SERP must not wipe to funnel 5→0 ---
{
  const intent = {
    planSource: 'wb',
    source: 'model',
    validated: true,
    runnable: true,
    degradeReason: null,
    status: 'ready',
    originalQuestion: '李亚鹏的前妻有哪些?',
    entities: [{ name: '李亚鹏', aliases: [], kind: 'person' }],
    facets: [
      {
        id: 'f1',
        label: '婚姻',
        questions: ['前妻是谁'],
        queries: ['李亚鹏 前妻', '李亚鹏 王菲']
      }
    ]
  };
  assert.equal(R.isFormalModelIntent(intent), true);
  assert.equal(
    R.isFormalModelIntent(Object.assign({}, intent, { validated: false })),
    false,
    'planSource wb alone is insufficient without validated'
  );
  assert.equal(
    R.isFormalModelIntent(
      Object.assign({}, intent, { source: 'local', validated: true })
    ),
    false,
    'source must be model'
  );
  const hits = [
    {
      title: '今日热搜无关页',
      url: 'https://hot.example/x',
      snippet: '娱乐八卦汇总'
    },
    {
      title: '李亚鹏与王菲离婚经过',
      url: 'https://baike.example/liyapeng',
      snippet: '前妻王菲'
    },
    {
      title: '随机购物页',
      url: 'https://shop.example/y',
      snippet: '优惠券'
    }
  ];
  const ranked = R.rankHitsForIntent(hits, intent, null, { formalModel: true });
  assert.ok(ranked.relevantHits >= 1, 'formal fail-open keeps SERP: ' + ranked.relevantHits);
  assert.ok(
    ranked.hits.some((h) => /李亚鹏/.test(h.title + h.snippet)),
    'person hit survives'
  );
  // Noise-only SERP still fail-opens on formal path (model owns queries).
  const junkOnly = R.rankHitsForIntent(
    [
      { title: '词典组词大全', url: 'https://zidian.example/a', snippet: '组词' },
      { title: '新闻门户首页', url: 'https://news.example/', snippet: '头条' }
    ],
    intent,
    null,
    { formalModel: true }
  );
  assert.equal(junkOnly.rawHits, 2);
  assert.ok(junkOnly.relevantHits >= 1, 'formal path keeps non-empty raw');
  assert.equal(!!junkOnly.failOpen, true);
}

// --- formal post-fetch: keep deal-suspect pages for model; only dictionary LQ drops ---
{
  const intent = {
    planSource: 'wb',
    source: 'model',
    validated: true,
    runnable: true,
    degradeReason: null,
    status: 'ready',
    originalQuestion: '评价腾讯混元大模型',
    entities: [{ name: '腾讯混元', aliases: ['混元'], kind: 'product' }],
    facets: [
      {
        id: 'f1',
        label: '能力',
        questions: ['混元怎么样'],
        queries: ['腾讯混元 评测', '混元大模型 能力']
      }
    ]
  };
  assert.equal(R.isFormalModelIntent(intent), true);
  const dealish = {
    id: 'S1',
    title: '腾讯混元大模型评测与促销汇总',
    url: 'https://review.example/hunyuan',
    snippet: '限时促销；混元能力与 GPT 对比',
    text: '腾讯混元大模型在多模态与长文本上表现……评测得分……',
    fetchedAt: '2026-11-02T00:00:00.000Z'
  };
  assert.equal(
    R.isOffTopicNoiseSource(dealish, intent),
    true,
    'deal heuristic still flags 促销'
  );
  const kept = R.keepSourcesForSynthesis([dealish], intent, { formal: true });
  assert.equal(kept.length, 1, 'formal path keeps fetched deal-suspect page');
  assert.equal(!!kept[0].noiseSuspect, true);
  const localDrop = R.keepSourcesForSynthesis(
    [dealish],
    Object.assign({}, intent, { planSource: 'local', runnable: false }),
    { formal: false }
  );
  assert.equal(localDrop.length, 0, 'non-formal still hard-drops noise');

  // Empty bodies → snippet leads still kept on formal (not wiped by 促销).
  const leads = R.buildSnippetLeadSources(
    [
      {
        title: '混元大模型体验促销页',
        url: 'https://serp.example/a',
        snippet: '促销活动介绍混元能力'
      },
      {
        title: '组词词典',
        url: 'https://zidian.example/b',
        snippet: '混元 组词'
      }
    ],
    8,
    0
  );
  const leadKept = R.keepSourcesForSynthesis(leads, intent, { formal: true });
  assert.ok(
    leadKept.some((s) => /serp\.example/.test(s.url)),
    'formal keeps snippet lead despite 促销'
  );
  assert.ok(
    !leadKept.some((s) => /zidian/.test(s.url)),
    'dictionary LQ still dropped'
  );
  assert.ok(R.formatSerpEvidenceForModel(leads, 4).length >= 1);

  const pathPrompt = R.buildResearchIntentPrompt('评价腾讯混元大模型');
  assert.match(pathPrompt, /preferredPath/);
  assert.match(pathPrompt, /faceted|评价|横评/);
  const parsed = R.normalizeResearchIntent(
    {
      originalQuestion: '评价腾讯混元大模型',
      researchGoal: '评价混元',
      questionType: 'comparison',
      preferredPath: 'faceted',
      entities: [{ name: '腾讯混元', aliases: ['混元'], kind: 'product' }],
      facets: [
        {
          id: 'f1',
          label: '能力',
          questions: ['能力如何'],
          queries: ['腾讯混元 评测']
        }
      ]
    },
    '评价腾讯混元大模型'
  );
  assert.equal(parsed.preferredPath, 'faceted');
}

// --- 「什么是爱奇艺」: no interrogative aspect, no bilibili/UP templates ---
{
  const q = '什么是爱奇艺';
  assert.equal(R.extractDefinitionSubject(q), '爱奇艺');
  const aspects = R.extractUserAspects(q);
  assert.equal(aspects.primary, '爱奇艺');
  assert.equal(aspects.aspects.join('|'), '', '什么是 must not become an aspect');
  const intent = R.buildLocalResearchIntent(q);
  const ent = R.pickPrimarySearchEntity(intent.entities);
  assert.equal(ent.name, '爱奇艺');
  assert.ok(ent.kind === 'org' || ent.kind === 'other', ent.kind);
  const allQ = intent.facets.reduce((a, f) => a.concat(f.queries || []), []);
  assert.ok(allQ.every((x) => !/什么是|啥是/.test(x)), 'queries: ' + allQ.join('|'));
  assert.ok(allQ.every((x) => !/bilibili|UP主/.test(x)), 'no creator templates: ' + allQ.join('|'));
  assert.ok(allQ.some((x) => x === '爱奇艺' || /^爱奇艺/.test(x)), 'keep subject: ' + allQ.join('|'));
  assert.ok(
    !intent.facets.some((f) => /业务与沿革|科学与哲学|功能与评价/.test(f.label || '')),
    'local must not interpret: ' + intent.facets.map((f) => f.label).join('|')
  );
  assert.equal(R.normalizeResearchQuery('爱奇艺 什么是'), '爱奇艺');
}

// --- bare「影视飓风/调研」must be primary; film-portal SEO must not pass ranking ---
{
  assert.equal(R.extractBareSubject('影视飓风'), '影视飓风');
  assert.equal(R.extractBareSubject('影视飓风调研'), '影视飓风');
  assert.equal(R.extractBareSubject('调研影视飓风'), '影视飓风');
  ['影视飓风', '影视飓风调研'].forEach((q) => {
    const intent = R.buildLocalResearchIntent(q);
    assert.equal(R.pickPrimarySearchEntity(intent.entities).name, '影视飓风', q);
    assert.equal(R.localIntentConfidence(intent), 'high', q + ' conf');
    assert.ok(intent.facets[0].queries.some((x) => x === '影视飓风' || /^影视飓风 /.test(x)));
    // Local is minimal seed — specialty depth facets belong to the model.
    const f1q = new Set(intent.facets[0].queries);
    assert.ok(
      !intent.facets.some((f) =>
        /下探资料|UP主|团队 成员|代表作/.test((f.label || '') + (f.queries || []).join(' '))
      ),
      q + ' no creator specialty: ' + JSON.stringify(intent.facets)
    );
    const shallowCov = R.buildCoverageMatrix(intent, [
      {
        id: 'S1',
        title: '影视飓风的个人空间',
        url: 'https://space.bilibili.com/946974',
        snippet: '影视飓风',
        text: '影视飓风的个人空间',
        facetId: 'f1'
      }
    ]);
    assert.ok(shallowCov.some((c) => c.gapType === 'shallow_evidence'));
    const drills = R.buildRepairQueriesFromCoverage(shallowCov, intent, intent.facets[0].queries);
    assert.ok(drills.length >= 1, q + ' shallow repair');
    assert.ok(drills.every((x) => x.indexOf('影视飓风') >= 0));
    assert.ok(drills.every((x) => !f1q.has(x)), 'repair avoids used identity queries');
    const ranked = R.rankHitsForIntent(
      [
        { title: '麻花影视', url: 'https://mh-ys.cc/', snippet: '免费影视' },
        { title: '爱迪影视', url: 'https://aidiyingshis.com.cn/', snippet: '短剧' },
        { title: '爱奇艺', url: 'https://www.iqiyi.com/', snippet: '在线' },
        {
          title: '影视飓风的个人空间',
          url: 'https://space.bilibili.com/946974',
          snippet: '影视飓风 UP主'
        }
      ],
      intent,
      intent.facets[0],
      { strictAliases: true }
    );
    assert.ok(ranked.hits.length >= 1, q + ' kept hits');
    assert.ok(
      ranked.hits.every((h) => String(h.title + h.url + h.snippet).indexOf('影视飓风') >= 0),
      q + ' only full-name hits: ' + ranked.hits.map((h) => h.title).join('|')
    );
    assert.ok(!ranked.hits.some((h) => /mh-ys|aidiyingshi|iqiyi\.com\/?$/.test(h.url)));
  });
}

// --- 「什么是X」must extract subject; never search bare 什么/啥 dictionary junk ---
{
  assert.equal(R.extractDefinitionSubject('什么是影视飓风'), '影视飓风');
  assert.equal(R.stripInterrogativeShell('什么是影视飓风'), '影视飓风');
  assert.equal(R.normalizeResearchQuery('什么是影视飓风'), '影视飓风');
  // Ranking clauses stay intact for platform salvage — not a simple definition subject.
  assert.equal(R.extractDefinitionSubject('什么是b站最受欢迎视频'), '');

  const jufeng = R.buildLocalResearchIntent('什么是影视飓风');
  assert.equal(R.pickPrimarySearchEntity(jufeng.entities).name, '影视飓风');
  assert.equal(R.localIntentConfidence(jufeng), 'high');
  assert.ok(jufeng.facets[0].queries[0].indexOf('影视飓风') >= 0);
  assert.ok(!/^什么是/.test(jufeng.facets[0].queries[0]), 'no interrogative shell as lead query');
  const jRank = R.rankHitsForIntent(
    [
      { title: '什么', url: 'https://baike.baidu.com/item/%E4%BB%80%E4%B9%88', snippet: '代词' },
      { title: '什么值得买', url: 'https://www.smzdm.com/', snippet: '消费指南' },
      { title: '啥', url: 'https://baike.baidu.com/item/%E5%95%A5', snippet: '口语' },
      {
        title: '影视飓风_哔哩哔哩',
        url: 'https://space.bilibili.com/946974',
        snippet: '影视飓风 UP主 团队'
      }
    ],
    jufeng,
    jufeng.facets[0],
    { strictAliases: true }
  );
  assert.ok(jRank.hits.length >= 1);
  assert.ok(jRank.hits[0].url.indexOf('space.bilibili') >= 0 || /影视飓风/.test(jRank.hits[0].title));
  assert.ok(!jRank.hits.some((h) => /smzdm|item\/%E4%BB%80%E4%B9%88|title:\s*什么$/.test(h.url + h.title)));
  assert.ok(!jRank.hits.some((h) => h.title === '什么' || h.title === '啥' || /smzdm/.test(h.url)));
}

// --- local fallback captain plan + coverage repair keeps primary ---
{
  const localUp = R.buildLocalResearchIntent('调研b站UP主玩主小小虫的履历与代表作');
  assert.equal(localUp.planSource, 'local');
  assert.equal(localUp.status, 'ready');
  assert.equal(R.pickPrimarySearchEntity(localUp.entities).name, '玩主小小虫');
  assert.equal(R.localIntentConfidence(localUp), 'high');
  const localQs = localUp.facets.map((f) => (f.queries || []).join(' ')).join(' ');
  assert.ok(/玩主小小虫/.test(localQs), 'local plan queries name creator: ' + localQs);
  assert.ok(!/^哔哩哔哩 热门/.test(localUp.facets[0].queries[0]));
  assert.match(
    R.buildResearchIntentPrompt('什么是爱奇艺'),
    /用户问题：什么是爱奇艺|禁止 bilibili|什么是X/
  );

  const localFood = R.buildLocalResearchIntent('为什么b站这么多人喜欢美食下饭');
  assert.ok(['high', 'medium', 'low'].includes(R.localIntentConfidence(localFood)));
  assert.ok(localFood.phenomenon.indexOf('下饭') >= 0 || localFood.searchConcepts.some((c) => /下饭|吃播/.test(c)));

  const missCov = R.buildCoverageMatrix(localUp, [
    {
      id: 'S1',
      title: '哔哩哔哩热门',
      url: 'https://www.bilibili.com/v/popular/all/',
      snippet: '综合热门',
      text: '热门推荐 排行榜',
      facetId: 'f1'
    }
  ]);
  assert.ok(missCov.some((c) => c.gapType === 'missing_subject'));
  const repairQs = R.buildRepairQueriesFromCoverage(missCov, localUp);
  assert.ok(repairQs.length >= 1);
  assert.ok(repairQs.every((q) => q.indexOf('玩主小小虫') >= 0), 'repair keeps primary: ' + repairQs.join('|'));
  assert.ok(!repairQs.some((q) => /热门视频 排行榜|播放量 排行/.test(q)));

  const hitCov = R.buildCoverageMatrix(localUp, [
    {
      id: 'S2',
      title: '玩主小小虫的个人空间',
      url: 'https://space.bilibili.com/1',
      snippet: '玩主小小虫',
      text: '玩主小小虫 UP主 代表作',
      facetId: 'f1'
    }
  ]);
  assert.ok(hitCov.every((c) => c.ok), 'coverage ok when primary in sources');
  assert.equal(R.buildRepairQueriesFromCoverage(hitCov, localUp).length, 0);
}

// --- intent tokens drive ranking; regex must not override ready intent ---
{
  const intent = R.normalizeResearchIntent(
    {
      originalQuestion: '为什么b站这么多人喜欢美食下饭',
      researchGoal: '调查动机与传播因素',
      questionType: 'cause',
      entities: [{ name: '哔哩哔哩', aliases: ['b站', 'B站'], kind: 'platform' }],
      phenomenon: '美食下饭',
      searchConcepts: ['下饭视频', '吃播', '陪伴感'],
      facets: [
        {
          id: 'f1',
          label: '观看动机',
          questions: ['为什么当美食下饭？'],
          queries: ['哔哩哔哩 下饭视频 观看动机', '美食视频 陪伴感 使用动机']
        }
      ]
    },
    '为什么b站这么多人喜欢美食下饭'
  );
  assert.equal(intent.status, 'ready');
  const hits = [
    { title: '吃播与陪伴感', url: 'https://a.test/1', snippet: '下饭视频' },
    { title: '水果李子功效', url: 'https://a.test/2', snippet: '李子 维生素' }
  ];
  const ranked = R.rankHitsForIntent(hits, intent, intent.facets[0], { strictAliases: false });
  assert.ok(ranked.hits[0].url.indexOf('a.test/1') >= 0);
  // Ready intent facets keep multiple queries (not only [0])
  const facets = R.facetsFromIntent(intent);
  assert.ok(facets[0].queries.length >= 2);
  const jobs = R.buildRoundRobinSearches(
    [
      { id: 'f1', queries: ['a1', 'a2'] },
      { id: 'f2', queries: ['b1', 'b2'] }
    ],
    8
  );
  assert.equal(jobs.map((j) => j.query).join('|'), 'a1|b1|a2|b2');
}

// --- empty skeleton blocks + 土豆/tudou homonym + place mismatch ---
{
  const emptyDoc = R.validateResearchDocument(
    {
      title: '土豆对英格兰',
      executiveAnswer: { text: '材料有限。', sourceIds: ['S1'] },
      blocks: [
        { type: 'paragraph', title: '', body: '', items: [] },
        { type: 'timeline', title: '', items: [] },
        { type: 'risk', title: '', items: [] },
        { type: 'quote', title: '', body: '' },
        {
          type: 'paragraph',
          title: '历史线索',
          body: '马铃薯后成为主粮作物。[S1]'
        }
      ],
      claims: [],
      uncertainties: [],
      limitations: []
    },
    [
      {
        id: 'S1',
        title: '马铃薯',
        url: 'https://baike.baidu.com/item/x',
        text: '英格兰与爱尔兰引入马铃薯后……',
        fetchedAt: 't',
        readState: 'fetched'
      }
    ],
    { topic: '土豆对于英格兰的意义' }
  );
  assert.equal(emptyDoc.blocks.length, 1);
  assert.equal(emptyDoc.blocks[0].title, '历史线索');
  const mdEmpty = R.documentToMarkdown(emptyDoc);
  assert.doesNotMatch(mdEmpty, /^## 说明$/m);
  assert.doesNotMatch(mdEmpty, /^## 时间线$/m);
  assert.doesNotMatch(mdEmpty, /^## 风险$/m);
  assert.doesNotMatch(mdEmpty, /^## 引用$/m);
  assert.match(mdEmpty, /历史线索/);

  const potatoIntent = {
    originalQuestion: '土豆对于英格兰的意义',
    searchConcepts: ['历史', '农业'],
    entities: [{ name: '土豆', aliases: ['马铃薯'], kind: 'other' }]
  };
  assert.equal(
    R.isOffTopicNoiseSource(
      { title: '土豆-召唤全球优秀短视频', url: 'https://www.tudou.com/', snippet: '短视频' },
      potatoIntent
    ),
    true
  );
  assert.equal(
    R.isOffTopicNoiseSource(
      {
        title: '土豆营养价值及功效与作用',
        url: 'https://health.baidu.com/m/detail/x',
        snippet: '热量与维生素'
      },
      potatoIntent
    ),
    true
  );
  const rankedPotato = R.rankHitsForIntent(
    [
      {
        title: '土豆-召唤全球优秀短视频',
        url: 'https://www.tudou.com/',
        snippet: '短视频'
      },
      {
        title: '土豆营养价值',
        url: 'https://health.baidu.com/x',
        snippet: '功效与作用'
      },
      {
        title: '马铃薯在英格兰与爱尔兰的传播',
        url: 'https://ex.test/potato-england',
        snippet: '英格兰农业历史 饥荒'
      }
    ],
    potatoIntent,
    null,
    { strictAliases: false }
  );
  assert.ok(rankedPotato.hits.length >= 1);
  assert.ok(rankedPotato.hits[0].url.indexOf('potato-england') >= 0);
  assert.ok(!rankedPotato.hits.some((h) => /tudou\.com/.test(h.url)));
  assert.equal(R.normalizeResearchQuery('土豆对于英格兰的意义？'), '土豆对于英格兰的意义');
}

// --- citeValid keeps snippet ids; confirmed ≠ verified ---
{
  const sources = R.__testOnly.annotateSourceReadState([
    {
      id: 'S1',
      title: '线索',
      url: 'https://ex.test/s',
      snippet: '仅摘要',
      text: '仅摘要',
      fetchedAt: null,
      readState: 'snippet'
    }
  ]);
  assert.equal(sources[0].readState, 'snippet');
  assert.equal(R.isCiteValid(sources[0]), true);
  assert.equal(R.isEvidenceEligible(sources[0]), true);
  const claim = R.validateResearchDocument(
    {
      title: 't',
      executiveAnswer: { text: '线索整理', sourceIds: ['S1'] },
      blocks: [],
      claims: [{ text: '有人讨论下饭', sourceIds: ['S1'], confidence: 'low' }],
      uncertainties: [],
      limitations: []
    },
    sources,
    { topic: '美食下饭' }
  );
  assert.ok(claim.claims[0].sourceIds.includes('S1'));
  assert.equal(claim.executiveAnswer.sourceIds[0], 'S1');
}

// --- fetch outage keeps search leads as explicitly unverified material ---
{
  const leads = R.buildSnippetLeadSources([
    { title: 'A', url: 'https://a.test', snippet: '摘要 A', facetId: 'f1' },
    { title: 'A duplicate', url: 'https://a.test', snippet: '重复', facetId: 'f1' },
    { title: 'B', url: 'https://b.test', snippet: '摘要 B', facetId: 'f2' }
  ]);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].readState, 'snippet');
  assert.equal(leads[0].fetchedAt, null);
  assert.equal(leads[0].text, '摘要 A');
  assert.match(leads[0].id, /^S\d+$/);
}

// --- default: modelCalls uncapped (no budget_exhausted on model) ---
{
  const T = R.__testOnly;
  assert.equal(R.BUDGETS.fast.modelCalls, null);
  assert.equal(R.BUDGETS.standard.modelCalls, null);
  assert.equal(R.BUDGETS.deep.modelCalls, null);
  assert.equal(R.BUDGETS.fast.repairRounds, 1);
  assert.equal(R.BUDGETS.fast.search, 5);
  T.setStateForTest({
    ledger: {
      path: 'fast',
      depth: 'standard',
      caps: Object.assign({}, R.BUDGETS.fast),
      search: 0,
      fetch: 0,
      modelCalls: 99,
      repairRounds: 0,
      hitCap: null
    }
  });
  assert.equal(T.ledgerCan('model', 1), true);
  assert.equal(T.ledgerCanOptionalModel(1, { reserveSynth: true }), true);
}
// --- finite cap override still reserves synth ---
{
  const T = R.__testOnly;
  T.setStateForTest({
    ledger: {
      path: 'fast',
      depth: 'standard',
      caps: Object.assign({}, R.BUDGETS.fast, { modelCalls: 4 }),
      search: 0,
      fetch: 0,
      modelCalls: 3,
      repairRounds: 0,
      hitCap: null
    }
  });
  assert.equal(T.ledgerCan('model', 1), true);
  assert.equal(T.ledgerCanOptionalModel(1, { reserveSynth: true }), false);
  assert.equal(T.ledgerCanOptionalModel(1, { reserveSynth: false }), true);
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
  const searchCap = R.BUDGETS.fast.search;
  assert.equal(T.ledgerCan('search', searchCap), true);
  assert.equal(T.ledgerSpend('search', searchCap), true);
  assert.equal(T.ledgerCan('search', 1), false);
  assert.equal(T.ledgerSpend('search', 1), false);
  assert.equal(T.getState().ledger.hitCap, 'search');
  // search exhaustion must not block reserved synth model call
  assert.equal(T.ledgerCan('model', 1), true);
  assert.equal(T.ledgerSpend('model', 1), true);
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
  // No model → formal path blocked; local must not seed confirm facets.
  const blockedSnap = await R.preparePlan({ topic: '荣耀和vivo怎么选', depth: 'standard' });
  assert.equal(blockedSnap.status, 'awaiting_approval');
  assert.equal(blockedSnap.plan.path, 'faceted');
  assert.equal((blockedSnap.plan.facets || []).length, 0, 'no local facet seed without model');
  assert.equal(blockedSnap.plan.researchIntent.runnable, false);
  assert.equal(R.isFormalModelIntent(blockedSnap.plan.researchIntent), false);
  const stillBlocked = await R.confirmAndRun({ force: true });
  assert.equal(stillBlocked.status, 'awaiting_approval', 'local cannot open a run');
  R.cancel();

  // Model captain → path switch restores model facets only (never specialty templates).
  const prevInvoke = sandbox.OneToneIpc.invoke;
  const modelIntent = {
    originalQuestion: '荣耀和vivo怎么选',
    researchGoal: '对比荣耀与 vivo',
    questionType: 'comparison',
    entities: [
      { name: '荣耀', aliases: [], kind: 'product' },
      { name: 'vivo', aliases: [], kind: 'product' }
    ],
    facets: [
      {
        id: 'f1',
        label: '荣耀侧证据',
        questions: ['荣耀参数'],
        queries: ['荣耀 评测 参数'],
        keyPoints: ['参数']
      },
      {
        id: 'f2',
        label: 'vivo侧证据',
        questions: ['vivo参数'],
        queries: ['vivo 评测 参数'],
        keyPoints: ['参数']
      }
    ]
  };
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({ content: JSON.stringify(modelIntent), model: 'hy3' });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  R.resetIdle();
  const snap = await R.preparePlan({ topic: '荣耀和vivo怎么选', depth: 'standard' });
  assert.equal(snap.status, 'awaiting_approval');
  assert.equal(snap.plan.path, 'faceted');
  assert.ok(snap.plan.facets.length >= 1, 'model seed has facets');
  assert.equal(snap.plan.researchIntent.planSource, 'wb');
  assert.equal(snap.plan.researchIntent.source, 'model');
  assert.equal(snap.plan.researchIntent.validated, true);
  assert.equal(R.isFormalModelIntent(snap.plan.researchIntent), true);
  R.updatePlan({ path: 'fast' });
  assert.equal(R.getSnapshot().plan.path, 'fast');
  assert.equal(R.getSnapshot().plan.facets.length, 0);
  assert.ok(R.getSnapshot().plan.researchIntent, 'captain intent kept on fast');
  R.updatePlan({ path: 'faceted' });
  assert.equal(R.getSnapshot().plan.path, 'faceted');
  const back = R.getSnapshot().plan.facets || [];
  assert.ok(back.length >= 1, 'faceted switch restores captain facets');
  assert.ok(
    !back.some((f) => f.label === '多方说法' || /科学与哲学|业务与沿革/.test(f.label || '')),
    'path switch must not use specialty templates: ' + back.map((f) => f.label).join('|')
  );
  R.cancel();
  assert.equal(R.getSnapshot().status, 'idle');
  sandbox.OneToneIpc.invoke = prevInvoke;
})();

// --- path switch from fast-classified topic uses captain, not heuristic「1是/多方说法」---
await (async () => {
  R.resetIdle();
  const topic = '影视飓风是怎么回事';
  const snap = await R.preparePlan({ topic, depth: 'standard' });
  assert.equal(snap.status, 'awaiting_approval');
  assert.equal(snap.plan.topic, topic);
  // No model → blocked stub; path switch must not invent heuristic facets.
  R.updatePlan({ path: 'fast' });
  R.updatePlan({ path: 'faceted' });
  const plan = R.getSnapshot().plan;
  assert.equal(plan.topic, topic);
  assert.ok(plan.researchIntent && plan.researchIntent.planSource === 'local');
  assert.equal(plan.researchIntent.runnable, false);
  assert.ok(plan.researchIntent.degradeReason);
  assert.equal(!!plan.planning, false, 'prepare awaits model then clears planning');
  assert.equal((plan.facets || []).length, 0, 'no local/heuristic facets on formal path');
  const anchors = R.extractTopicAnchors(topic);
  assert.equal(anchors.primary, '影视飓风');
  assert.equal(anchors.requirePrimary, true);
  const junk = R.extractTopicAnchors('1是怎么回事');
  assert.ok(junk.primary !== '1是', JSON.stringify(junk));
  assert.ok(!junk.requirePrimary, JSON.stringify(junk));

  // 「中药柜有哪些」must not capture「中药柜有」(that zeroed the search funnel).
  const cab = R.extractTopicAnchors('中药柜有哪些？');
  assert.equal(cab.primary, '中药柜', JSON.stringify(cab));
  const cabLocal = R.buildLocalResearchIntent('中药柜有哪些？');
  assert.equal(cabLocal.entities[0] && cabLocal.entities[0].name, '中药柜');
  assert.equal(cabLocal.runnable, false, 'local heuristic is not runnable');
  assert.ok(
    !(cabLocal.facets[0].queries || []).some((q) => /中药柜有/.test(q)),
    'queries: ' + JSON.stringify(cabLocal.facets[0].queries)
  );
  const cabRank = R.rankHitsForIntent(
    [
      {
        title: '中药柜种类大全',
        snippet: '抽屉式与开放式中药柜',
        url: 'https://ex.test/cab'
      },
      { title: '今日股市', snippet: '涨跌', url: 'https://ex.test/noise' }
    ],
    cabLocal,
    null,
    {}
  );
  assert.equal(cabRank.relevantHits, 1, JSON.stringify(cabRank.dropReasons));
  assert.equal(cabRank.hits[0].title, '中药柜种类大全');
  assert.equal(R.extractTopicAnchors('北京有哪些景点').primary, '北京');
  assert.equal(R.extractTopicAnchors('爱奇艺有哪些会员').primary, '爱奇艺');
  R.cancel();
})();

// --- model-first intent: success → wb; ipc fail → local; prepare reuses same intent ---
await (async () => {
  const prevInvoke = sandbox.OneToneIpc.invoke;
  const modelIntent = {
    originalQuestion: '什么是爱奇艺',
    researchGoal: '了解爱奇艺是什么公司/平台',
    questionType: 'fact',
    entities: [{ name: '爱奇艺', aliases: ['iqiyi'], kind: 'org' }],
    phenomenon: '',
    searchConcepts: ['百科', '公司简介'],
    facets: [
      {
        id: 'f1',
        label: '爱奇艺定义与百科',
        questions: ['什么是爱奇艺？'],
        queries: ['爱奇艺 百度百科', '爱奇艺 公司简介'],
        keyPoints: ['百科']
      },
      {
        id: 'f2',
        label: '爱奇艺业务与沿革',
        questions: ['何时成立？'],
        queries: ['爱奇艺 成立', '爱奇艺 官网'],
        keyPoints: ['沿革']
      }
    ]
  };
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({ content: JSON.stringify(modelIntent), model: 'hy3' });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  R.resetIdle();
  const snap = await R.preparePlan({ topic: '什么是爱奇艺', depth: 'standard', path: 'faceted' });
  assert.equal(snap.status, 'awaiting_approval');
  assert.equal(snap.plan.planning, false);
  assert.equal(snap.plan.researchIntent.planSource, 'wb');
  assert.ok(
    (snap.plan.facets || []).some((f) => /百科|公司/.test(f.label + f.query)),
    'model facets visible on confirm: ' + JSON.stringify(snap.plan.facets)
  );
  const intentId = snap.plan.researchIntent.originalQuestion;
  const beforeConfirm = JSON.stringify(snap.plan.researchIntent.facets);
  await R.confirmAndRun({ force: true });
  const after = R.getSnapshot();
  assert.equal(after.researchIntent && after.researchIntent.originalQuestion, intentId);
  assert.equal(
    JSON.stringify((after.plan && after.plan.researchIntent && after.plan.researchIntent.facets) || []),
    beforeConfirm,
    'confirm reuses prepare intent facets'
  );
  R.cancel();

  // Fail path: no LLM → blocked stub (local cannot invent a formal search plan).
  sandbox.OneToneIpc.invoke = () => Promise.reject(new Error('ipc_stub'));
  R.resetIdle();
  const localSnap = await R.preparePlan({ topic: '什么是爱奇艺', depth: 'standard', path: 'faceted' });
  assert.equal(localSnap.plan.researchIntent.planSource, 'local');
  assert.equal(localSnap.plan.researchIntent.runnable, false);
  assert.ok(localSnap.plan.researchIntent.degradeReason);
  assert.equal((localSnap.plan.facets || []).length, 0, 'no local facet invention after model fail');
  assert.equal(R.isFormalModelIntent(localSnap.plan.researchIntent), false);
  const noRun = await R.confirmAndRun({ force: true });
  assert.equal(noRun.status, 'awaiting_approval', 'blocked plan cannot confirm');
  R.cancel();
  sandbox.OneToneIpc.invoke = prevInvoke;
})();

// --- rewriteSearchQueries: primary filter + budget skip ---
await (async () => {
  const T = R.__testOnly;
  const prevInvoke = sandbox.OneToneIpc.invoke;
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          { id: 'a1', enabled: true, isDefault: true, selectedModel: 'hy3', models: [{ id: 'hy3' }] }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({
        content: JSON.stringify(['爱奇艺 百科', '无关平台 热门', '爱奇艺 官网']),
        model: 'hy3'
      });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  const intent = R.buildLocalResearchIntent('什么是爱奇艺');
  T.setStateForTest({
    ledger: {
      path: 'faceted',
      depth: 'standard',
      caps: Object.assign({}, R.BUDGETS.standard),
      search: 0,
      fetch: 0,
      modelCalls: 0,
      repairRounds: 0,
      hitCap: null
    }
  });
  const qs = await R.rewriteSearchQueries('什么是爱奇艺', intent, ['什么是爱奇艺'], {
    off_topic: 2
  });
  assert.ok(qs.length >= 1, 'rewrite returns queries');
  assert.ok(qs.every((q) => q.indexOf('爱奇艺') >= 0), 'primary filter: ' + qs.join('|'));
  assert.ok(!qs.some((q) => /无关平台/.test(q)), 'drops non-primary: ' + qs.join('|'));

  T.setStateForTest({
    ledger: {
      path: 'faceted',
      depth: 'standard',
      caps: Object.assign({}, R.BUDGETS.standard, { modelCalls: 4 }),
      search: 0,
      fetch: 0,
      modelCalls: 3,
      repairRounds: 0,
      hitCap: null
    }
  });
  const skipped = await R.rewriteSearchQueries('什么是爱奇艺', intent, ['x'], null);
  assert.ok(Array.isArray(skipped) && skipped.length === 0, 'finite cap + synth reserve → skip rewrite');
  sandbox.OneToneIpc.invoke = prevInvoke;
  R.cancel();
})();

// --- Model harness clarify (ATR-style): WB decides needsClarify; local never invents ---
await (async () => {
  R.resetIdle();
  const localOnly = R.buildLocalResearchIntent('帮我看看网络如何?');
  assert.equal(localOnly.needsClarify, false, 'local captain does not invent clarify');
  assert.equal((localOnly.clarifyOptions || []).length, 0);

  const prevInvoke = sandbox.OneToneIpc.invoke;
  const clarifyIntent = {
    originalQuestion: '帮我看看网络如何?',
    researchGoal: '待澄清：网络指什么',
    questionType: 'general',
    needsClarify: true,
    clarifyQuestion: '「网络如何」范围偏宽，先确认方向：',
    clarifyOptions: [
      {
        id: 'local_pc_net',
        label: '本机电脑网络连通性',
        refinedTopic: '本机电脑网络状态：网卡、IP、网关与外网连通性'
      },
      {
        id: 'carrier_outage',
        label: '运营商/地区网络故障',
        refinedTopic: '运营商 网络故障 通告 地区 中断'
      }
    ],
    entities: [],
    facets: [
      {
        id: 'f1',
        label: '待澄清',
        questions: ['帮我看看网络如何?'],
        queries: ['网络'],
        keyPoints: ['先澄清']
      }
    ]
  };
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({ content: JSON.stringify(clarifyIntent), model: 'hy3' });
    }
    return Promise.reject(new Error('ipc_stub'));
  };

  R.resetIdle();
  R.rememberRecentTopic('荣耀和vivo怎么选');
  const snap = await R.preparePlan({ topic: '帮我看看网络如何?', depth: 'standard' });
  assert.equal(snap.status, 'awaiting_approval');
  assert.equal(snap.plan.planning, false);
  assert.equal(snap.researchIntent.planSource, 'wb');
  assert.equal(snap.researchIntent.needsClarify, true);
  assert.ok((snap.researchIntent.clarifyOptions || []).length >= 2);
  const blocked = await R.confirmAndRun({ force: true });
  assert.equal(blocked.status, 'awaiting_approval');
  assert.equal(blocked.researchIntent.needsClarify, true);
  assert.ok(!blocked.isRunning, 'model clarify blocks dig');

  // After pick: mock returns a concrete plan (no clarify).
  const concreteIntent = {
    originalQuestion: '本机电脑网络状态：网卡、IP、网关与外网连通性',
    researchGoal: '查本机网络连通性资料',
    questionType: 'fact',
    needsClarify: false,
    entities: [{ name: '网卡', aliases: [], kind: 'other' }],
    facets: [
      {
        id: 'f1',
        label: '本机网络',
        questions: ['网卡与连通性'],
        queries: ['本机 网卡 IP 连通性'],
        keyPoints: ['连通']
      }
    ]
  };
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({ content: JSON.stringify(concreteIntent), model: 'hy3' });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  const next = await R.applyClarifyOption('local_pc_net');
  assert.equal(next.status, 'awaiting_approval');
  assert.equal(!!next.researchIntent.needsClarify, false, 'refined topic clears gate');
  assert.ok(/本机|网卡/.test(next.plan.topic), 'topic refined: ' + next.plan.topic);
  R.cancel();

  // Chip id alone must never become the research topic (UI race used to set topic=opt3).
  R.resetIdle();
  const labelOnly = R.normalizeResearchIntent(
    {
      needsClarify: true,
      clarifyQuestion: '选一个方向',
      clarifyOptions: [
        { id: 'opt1', label: '指定一个具体平台/产品' },
        { id: 'opt2', label: '指定一个具体人物/创作者' },
        { id: 'opt3', label: '指定一个抽象概念或现象' }
      ],
      facets: []
    },
    '什么是你好'
  );
  assert.equal(labelOnly.needsClarify, true);
  assert.equal(labelOnly.clarifyOptions.length, 3, 'label fills refinedTopic');
  assert.equal(labelOnly.clarifyOptions[2].refinedTopic, '指定一个抽象概念或现象');
  assert.notEqual(labelOnly.clarifyOptions[2].refinedTopic, 'opt3');

  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      return Promise.resolve({
        content: JSON.stringify({
          originalQuestion: '什么是你好',
          researchGoal: '概念',
          questionType: 'fact',
          needsClarify: false,
          entities: [{ name: '你好', aliases: [], kind: 'concept' }],
          facets: [
            {
              id: 'f1',
              label: '概念',
              questions: ['含义'],
              queries: ['你好 含义'],
              keyPoints: ['定义']
            }
          ]
        }),
        model: 'hy3'
      });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  // Simulate wiped clarifyOptions (first click already started preparePlan).
  const beforeWipe = R.getSnapshot();
  const wiped = await R.applyClarifyOption('opt3');
  assert.notEqual(
    (wiped.plan && wiped.plan.topic) || '',
    'opt3',
    'bare opt3 id must not become topic'
  );
  assert.equal(
    wiped.status,
    beforeWipe.status,
    'unknown optN chip is a no-op when options are gone'
  );
  const fromChip = await R.applyClarifyOption({
    id: 'opt3',
    refinedTopic: '指定一个抽象概念或现象（如某社会现象）'
  });
  assert.ok(
    /抽象概念|社会现象/.test((fromChip.plan && fromChip.plan.topic) || ''),
    'chip topic attr wins: ' + ((fromChip.plan && fromChip.plan.topic) || '')
  );
  R.cancel();

  // Model unavailable → blocked stub with reason, no invented clarify chips / facets.
  sandbox.OneToneIpc.invoke = () => Promise.reject(new Error('ipc_stub'));
  R.resetIdle();
  const degraded = await R.preparePlan({ topic: '帮我看看网络如何?', depth: 'standard' });
  assert.equal(degraded.researchIntent.planSource, 'local');
  assert.equal(degraded.researchIntent.runnable, false);
  assert.ok(degraded.researchIntent.degradeReason, 'degradeReason recorded');
  assert.equal(!!degraded.researchIntent.needsClarify, false, 'no fake clarify without model');
  assert.equal((degraded.plan.facets || []).length, 0, 'no local facet seed');
  assert.match(degraded.progress.message || '', /正式路径未建立|规划模型/);
  R.cancel();

  // No web hits → still call model; clarify flips back to awaiting_approval (not empty report).
  let chatN = 0;
  sandbox.OneToneIpc.invoke = (cmd) => {
    if (cmd === 'cmd_workbuddy_local_accounts_list') {
      return Promise.resolve({
        defaultAccountId: 'a1',
        accounts: [
          {
            id: 'a1',
            enabled: true,
            isDefault: true,
            selectedModel: 'hy3',
            models: [{ id: 'hy3', name: 'hy3' }]
          }
        ]
      });
    }
    if (cmd === 'cmd_workbuddy_local_chat') {
      chatN += 1;
      if (chatN === 1) {
        // prepare: concrete dig plan (no clarify)
        return Promise.resolve({
          content: JSON.stringify({
            originalQuestion: '看看本地网络有什么问题',
            researchGoal: '查本地网络问题',
            questionType: 'procedure',
            needsClarify: false,
            entities: [{ name: '本地网络', aliases: [], kind: 'other' }],
            facets: [
              {
                id: 'f1',
                label: '本地网络',
                questions: ['有什么问题'],
                queries: ['本地网络 故障'],
                keyPoints: ['故障']
              }
            ]
          }),
          model: 'hy3'
        });
      }
      // after empty search: model asks clarify
      return Promise.resolve({
        content: JSON.stringify({
          needsClarify: true,
          clarifyQuestion: '「本地网络」是指本机连通性还是运营商故障？',
          clarifyOptions: [
            {
              id: 'pc',
              label: '本机网卡/连通性',
              refinedTopic: '本机电脑网络状态：网卡 IP 外网连通'
            }
          ],
          facets: []
        }),
        model: 'hy3'
      });
    }
    if (cmd === 'cmd_research_web_search') {
      return Promise.resolve({ hits: [], results: [] });
    }
    return Promise.reject(new Error('ipc_stub'));
  };
  R.resetIdle();
  await R.preparePlan({
    topic: '看看本地网络有什么问题',
    depth: 'quick',
    path: 'fast'
  });
  const afterEmpty = await R.confirmAndRun({ force: true });
  assert.equal(afterEmpty.status, 'awaiting_approval', 'model clarify after no sources');
  assert.equal(afterEmpty.researchIntent.needsClarify, true);
  assert.ok(chatN >= 2, 'model called for prepare + no-source recover: ' + chatN);
  assert.ok(!afterEmpty.result, 'no empty template report');
  R.cancel();
  sandbox.OneToneIpc.invoke = prevInvoke;
})();

console.log('test-home-research: ok');
