/**
 * Smoke: Now home — Hero + 情景条 + 现在/可以/今天（fixtures）。
 * Run: npm run test:now-home
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/js/features/now');

const ctx = {
  window: {},
  globalThis: null,
  document: {
    readyState: 'complete',
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    }
  },
  URLSearchParams,
  location: { search: '' },
  localStorage: {
    _m: Object.create(null),
    getItem(k) {
      return this._m[k] != null ? this._m[k] : null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    }
  }
};
ctx.globalThis = ctx;
ctx.window = ctx;

for (const f of [
  'fixtures.js',
  'now-model.js',
  'now-today.js',
  'now-agent-home.js',
  'home-focus-store.js',
  'home-focus-adapter.js',
  'home-action-policy.js',
  'home-focus-view.js',
  'cursor-work-view.js',
  'history-view.js',
  'memory-view.js',
  'now-home-ui.js',
  'now-home.js'
]) {
  vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
}

const m = ctx.OneToneNowModel;
const fx = ctx.OneToneNowFixtures;
const ui = ctx.OneToneNowHomeUi;
const todayApi = ctx.OneToneNowToday;
const AH = ctx.OneToneNowAgentHome;
const HFAdapter = ctx.OneToneHomeFocusAdapter;
const HFView = ctx.OneToneHomeFocusView;
if (!AH || !AH.buildHomeView) throw new Error('OneToneNowAgentHome missing');
if (!HFAdapter || !HFAdapter.toViewModel) throw new Error('HomeFocusAdapter missing');
if (!HFView || !HFView.renderFocus) throw new Error('HomeFocusView missing');

// —— Home Focus four modes (v1 situational canvas) ——
function assertFocus(dto, expectMode, expectPrimaryId) {
  const vm = HFAdapter.toViewModel(dto);
  if (vm.mode !== expectMode) {
    throw new Error(`focus mode want ${expectMode} got ${vm.mode}`);
  }
  const html = HFView.renderFocus(vm, {});
  if (!html.includes('hn-canvas')) throw new Error('focus missing hn-canvas');
  if (!html.includes('hn-headline')) throw new Error('focus missing headline');
  if (!html.includes('查看判断依据')) throw new Error('focus missing evidence');
  if (!html.includes('data-hf-view="focus"')) throw new Error('focus missing 现在 nav');
  if (!html.includes('我的习惯')) throw new Error('focus missing 我的习惯 nav');
  if (!html.includes('设置')) throw new Error('focus missing 设置 nav');
  if (html.includes('你想让我现在帮你做什么')) {
    throw new Error('v1 must not use chatty fixed hero');
  }
  if (html.includes('直接说一句话')) {
    throw new Error('v1 must not show permanent voice CTA card');
  }
  if (html.includes('data-hf-view="history"') || html.includes('项目记忆')) {
    throw new Error('v1 must not put history/memory in top nav');
  }
  for (const bad of [
    'Agent Session',
    'Checkpoint',
    'Provider',
    'state.vscdb',
    'Memory injection',
    'Probable match'
  ]) {
    if (html.includes(bad)) throw new Error(`focus must not show jargon: ${bad}`);
  }
  const ctas = (html.match(/class="hn-cta"/g) || []).length;
  if (ctas > 1) throw new Error('focus must have at most one primary CTA');
  if (expectMode === 'quiet') {
    if (ctas !== 0) throw new Error('quiet must have no CTA');
    if (vm.primary) throw new Error('quiet must have null primary');
    // Thin desk: Living zone, summary zone, or legacy presence.
    if (
      !html.includes('hn-presence') &&
      !html.includes('hn-desk-zone')
    ) {
      throw new Error('quiet should show presence or desk zone');
    }
  }
  if (expectPrimaryId) {
    if (!vm.primary || vm.primary.id !== expectPrimaryId) {
      throw new Error(
        `primary want ${expectPrimaryId} got ${vm.primary && vm.primary.id}`
      );
    }
    if (!html.includes('data-hf-act="' + expectPrimaryId + '"')) {
      throw new Error('primary button missing for ' + expectPrimaryId);
    }
  } else if (expectMode === 'quiet' && html.includes('class="hn-cta"')) {
    throw new Error('quiet rendered CTA unexpectedly');
  }
  return { vm, html };
}

{
  const r = assertFocus(
    {
      foreground: { appName: 'Cursor', windowTitle: 'x — voice-pilot — Cursor' },
      project: {
        id: 'p1',
        name: 'voice-pilot',
        root: 'E:/voice-pilot',
        match: 'probable',
        confirmed: false
      },
      provider: { id: 'cursor', status: 'ready' },
      work: {
        status: 'idle',
        title: '这可能是 voice-pilot',
        description: '需要确认',
        updatedAt: 1
      },
      nextAction: {
        title: '确认这是当前项目',
        kind: 'confirm_project',
        executable: true
      },
      source: { freshness: 'cached', reason: 't' }
    },
    'quiet'
  );
  if (!r.vm.desk || !r.vm.desk.projectGate) {
    throw new Error('unconfirmed project must be desk.projectGate, not page degraded');
  }
  if (r.vm.desk.projectGate.actId !== 'confirm_project') {
    throw new Error('projectGate row must carry confirm_project act');
  }
  if (/暂时无法确认你正在处理的项目/.test(r.vm.headline || '')) {
    throw new Error('project uncertainty must not hijack H1');
  }
  if (!r.html.includes('hn-desk-zone--gate')) {
    throw new Error('project gate zone must render');
  }
  if (!r.html.includes('data-hf-act="confirm_project"')) {
    throw new Error('project gate row must be actionable');
  }
}

{
  const r = assertFocus(
    {
      foreground: { appName: 'Cursor' },
      project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
      provider: { id: 'cursor', status: 'ready' },
      work: {
        status: 'resumable',
        title: '首页 Agent 原型设计',
        description: '继续整理',
        updatedAt: 1
      },
      nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
      source: { freshness: 'live', reason: 't' }
    },
    'return',
    'resume'
  );
  if (!r.vm.desk || !r.vm.desk.continueCard) {
    throw new Error('return mode must project Continue desk card');
  }
  if (!r.html.includes('hn-desk-zone') || !r.html.includes('Continue')) {
    throw new Error('return mode must render Continue desk zone');
  }
  if (r.html.includes('Marvis') || r.html.includes('第 7 轮')) {
    throw new Error('thin desk must not invent Marvis / deep narrative');
  }
}

{
  const r = assertFocus(
    {
      foreground: { appName: 'Cursor' },
      project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
      provider: { id: 'cursor', status: 'ready' },
      work: { status: 'waiting', title: '确认文件修改', description: '等待批准', updatedAt: Date.now() },
      nextAction: { title: '查看并决定', kind: 'view_progress', executable: true },
      source: { freshness: 'live', reason: 't' }
    },
    'attention',
    'view_progress'
  );
  if (!r.vm.desk || !r.vm.desk.needsYou) {
    throw new Error('attention must project Needs You desk zone');
  }
  if (!r.html.includes('Needs You') || !r.html.includes('确认文件修改')) {
    throw new Error('attention must render Needs You with task title');
  }
  if (r.vm.desk.living) throw new Error('Needs You must not also invent Living');
}

// Running without block → quiet companionship (no inventing CTA)
{
  const r = assertFocus(
    {
      foreground: { appName: 'Cursor' },
      project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
      provider: { id: 'cursor', status: 'ready' },
      work: { status: 'running', title: '首页结构', description: '处理中', updatedAt: Date.now() },
      nextAction: { title: '我想看看进展', kind: 'view_progress', executable: true },
      source: { freshness: 'live', reason: 't' }
    },
    'quiet',
    null
  );
  if (!r.vm.desk || !r.vm.desk.living) {
    throw new Error('running quiet must project Living desk zone');
  }
  if (!r.html.includes('Living Now') || !r.html.includes('正在活动')) {
    throw new Error('running quiet must render generic Living copy');
  }
  if (r.vm.desk.needsYou) throw new Error('Living must not mix waiting');
}

// Soft Pad multi-agent attention lifts quiet → Needs You (Cursor home_focus alone is not enough)
{
  const quietDto = {
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  };
  let vm = HFAdapter.toViewModel(quietDto);
  if (vm.mode !== 'quiet') throw new Error('fixture should start quiet');
  vm = HFAdapter.enrichFromAttention(vm, {
    revision: 1,
    waitingKinds: ['codex'],
    rows: [
      {
        agent: 'codex',
        state: 'needsInput',
        cause: 'permission',
        source: 'officialHook',
        waitingEligible: true,
        observedAtMs: Date.now() - 180000
      }
    ]
  });
  if (vm.mode !== 'attention') throw new Error('Soft Pad waiting must upgrade quiet → attention');
  if (!vm.desk || !vm.desk.needsYou) throw new Error('Soft Pad waiting must fill Needs You');
  if (!vm.desk.needsYouRows || vm.desk.needsYouRows.length < 1) {
    throw new Error('Needs You must project rows[] not only scalar');
  }
  if (!/Codex/.test(vm.desk.needsYou.title) && !/Codex/.test(vm.headline)) {
    throw new Error('Needs You should name Codex');
  }
  const html = HFView.renderFocus(vm, {});
  if (!html.includes('Needs You')) throw new Error('enriched attention must render Needs You');
  // Multi-agent: map all waitingEligible + working — do not collapse N→1
  let multi = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  multi = HFAdapter.enrichFromAttention(multi, {
    rows: [
      {
        agent: 'codex',
        state: 'needsInput',
        cause: 'permission',
        waitingEligible: true,
        confidence: 'authoritative',
        observedAtMs: Date.now()
      },
      {
        agent: 'claude',
        state: 'needsInput',
        cause: 'agent_needs_input',
        waitingEligible: true,
        confidence: 'authoritative',
        observedAtMs: Date.now() - 60000
      },
      {
        agent: 'workbuddy',
        state: 'working',
        cause: 'Notification',
        waitingEligible: false,
        observedAtMs: Date.now()
      }
    ]
  });
  if (!multi.desk.needsYouRows || multi.desk.needsYouRows.length !== 2) {
    throw new Error('must map all waitingEligible rows (got ' + ((multi.desk.needsYouRows && multi.desk.needsYouRows.length) || 0) + ')');
  }
  if (!multi.desk.livingRows || multi.desk.livingRows.length !== 1) {
    throw new Error('must keep Living rows alongside Needs You');
  }
  if (!/2 个会话/.test(multi.headline)) {
    throw new Error('multi waiting headline should count sessions');
  }
  const multiHtml = HFView.renderFocus(multi, {});
  if ((multiHtml.match(/hn-desk-badge/g) || []).length < 2) {
    throw new Error('multi rows must render provider badges');
  }
  // Expired waitingEligible → reconfirm zone, not Needs You
  let staleVm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  staleVm = HFAdapter.enrichFromAttention(staleVm, {
    rows: [
      {
        agent: 'codex',
        state: 'needsInput',
        cause: 'permission',
        waitingEligible: true,
        confidence: 'high',
        source: 'officialHook',
        observedAtMs: Date.now() - 600000,
        expiresAtMs: Date.now() - 1000
      },
      {
        agent: 'claude',
        state: 'needsInput',
        cause: 'permission',
        waitingEligible: true,
        confidence: 'high',
        source: 'officialHook',
        observedAtMs: Date.now(),
        expiresAtMs: Date.now() + 600000
      }
    ]
  });
  if (!staleVm.desk.needsYouRows || staleVm.desk.needsYouRows.length !== 1) {
    throw new Error('fresh waiting stays in Needs You');
  }
  if (!staleVm.desk.reconfirmRows || staleVm.desk.reconfirmRows.length !== 1) {
    throw new Error('expired waiting must go to reconfirm');
  }
  const staleHtml = HFView.renderFocus(staleVm, {});
  if (!staleHtml.includes('需重新确认')) throw new Error('reconfirm zone must render');
  if (!staleHtml.includes('hn-desk-chip--stale') && !staleHtml.includes('已过期')) {
    throw new Error('stale chip must render');
  }
  // ProbeStatus foot from home snapshot
  let probeVm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  probeVm = HFAdapter.enrichFromHomeSnapshot(probeVm, {
    probeStatus: 'stale',
    syncStatus: 'stale',
    recentSessions: [
      {
        sessionId: 's1',
        provider: 'cursor',
        title: 'older',
        matchConfidence: 0.9,
        projectMatch: 'exact',
        updatedAt: Date.now()
      }
    ]
  });
  if (!probeVm.desk.probeFoot || !/慢|stale/.test(probeVm.desk.probeFoot)) {
    throw new Error('probeStatus must surface as desk foot');
  }
  if (!probeVm.desk.recent || !probeVm.desk.recent[0].matchBadge) {
    throw new Error('recent must carry matchConfidence badge');
  }
  const probeHtml = HFView.renderFocus(probeVm, {});
  if (!probeHtml.includes('hn-desk-probe')) throw new Error('probe foot must render');
  // Unconfirmed project stays quiet + projectGate; Soft Pad waiting upgrades to attention
  let deg = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'x', root: '', match: 'unknown', confirmed: false },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '选择当前项目', kind: 'pick_project', executable: true },
    source: { freshness: 'stale', reason: 't' }
  });
  if (deg.mode !== 'quiet') throw new Error('unconfirmed project alone must stay quiet, not degraded');
  if (!deg.desk || !deg.desk.projectGate) throw new Error('unconfirmed project must expose desk.projectGate');
  deg = HFAdapter.enrichFromAttention(deg, {
    rows: [{ agent: 'codex', state: 'needsInput', cause: 'permission', waitingEligible: true }]
  });
  if (deg.mode !== 'attention') throw new Error('Soft Pad waiting must upgrade quiet→attention');
  if (!deg.desk || !deg.desk.needsYou) {
    throw new Error('attention must still show Soft Pad Needs You on desk');
  }
  if (!deg.desk.projectGate) throw new Error('projectGate must remain as row when Soft Pad waits');
  const degHtml = HFView.renderFocus(deg, {});
  if (!degHtml.includes('Needs You')) throw new Error('desk must render Needs You');
  if (!degHtml.includes('hn-desk-zone--gate') && !degHtml.includes('项目未确认')) {
    throw new Error('project gate row must still render beside Soft Pad');
  }
}

// cmd_agent_home_snapshot → Continue + Recent on thin desk
{
  let vm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  if (vm.mode !== 'quiet') throw new Error('home enrich fixture should start quiet');
  vm = HFAdapter.enrichFromHomeSnapshot(vm, {
    project: { displayName: 'voice-pilot' },
    checkpoint: {
      checkpointId: 'c1',
      sessionId: 'sess-a',
      currentTask: 'desk IA',
      updatedAt: Date.now() - 7200000
    },
    recentSessions: [
      { sessionId: 'sess-a', provider: 'cursor', title: 'same as ckpt', updatedAt: Date.now() },
      { sessionId: 'sess-b', provider: 'cursor', title: 'older work', updatedAt: Date.now() - 1000 }
    ],
    activeSession: { provider: 'cursor', sessionId: 'sess-a' }
  });
  if (!vm.desk || !vm.desk.continueCard) throw new Error('home snapshot must fill Continue');
  if (vm.mode !== 'return') throw new Error('checkpoint on quiet should promote return');
  if (!vm.desk.recent || !vm.desk.recent.length) throw new Error('home snapshot must fill Recent/ledger');
  if (vm.desk.recent.some((r) => r.sessionId === 'sess-a')) {
    throw new Error('ledger must skip continue session (shown on Continue card)');
  }
  if (!vm.desk.recent.some((r) => r.sessionId === 'sess-b')) {
    throw new Error('ledger must keep other recent sessions');
  }
  if (vm.desk.continueCard.title === '继续上次工作') {
    throw new Error('continueCard.title must be task/content, not the CTA label');
  }
  if (vm.primary.label !== '继续上次工作') {
    throw new Error('primary.label is the sole CTA copy source');
  }
  if (!/停在\s+Cursor/.test(vm.headline || '')) {
    throw new Error('return H1 must use provider with spacing, got: ' + vm.headline);
  }
  const homeHtml = HFView.renderFocus(vm, {});
  if (!homeHtml.includes('Continue')) throw new Error('Continue zone must render');
  if (!homeHtml.includes('Agent 台账')) throw new Error('ledger zone must render');
  if ((homeHtml.match(/继续上次工作/g) || []).length !== 1) {
    throw new Error('继续上次工作 must appear exactly once (page CTA only)');
  }
  if (homeHtml.includes('hn-desk-meta">checkpoint')) {
    throw new Error('Continue header must not repeat checkpoint');
  }
  if (/\bcheckpoint\b/i.test(vm.desk.continueCard.detail || '')) {
    throw new Error('Continue detail must not repeat the word checkpoint');
  }
  if (homeHtml.includes('项目匹配') === false && vm.desk.recent[0].matchBadge) {
    // badge may render as 项目匹配
  }
  if (vm.desk.recent[0].matchBadge && !/项目匹配/.test(vm.desk.recent[0].matchBadge.label || '')) {
    throw new Error('match badge must say 项目匹配, got ' + vm.desk.recent[0].matchBadge.label);
  }
  // Unconfirmed project: provider badge stays Codex, not 未知项目
  let unk = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'unknown-project', name: '未知项目', match: 'unknown', confirmed: false },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'cached', reason: 't' }
  });
  unk = HFAdapter.enrichFromHomeSnapshot(unk, {
    project: { displayName: '未知项目' },
    checkpoint: {
      checkpointId: 'c-u',
      sessionId: 'sess-codex',
      currentTask: '续写',
      updatedAt: Date.now() - 59 * 60 * 1000
    },
    recentSessions: [
      { sessionId: 'sess-codex', provider: 'codex', title: '续写', updatedAt: Date.now() }
    ]
  });
  if (!unk.desk || !unk.desk.continueCard) throw new Error('unconfirmed must still show Continue');
  if (unk.desk.continueCard.badge !== 'Codex') {
    throw new Error('ckProv badge must be session provider, got ' + unk.desk.continueCard.badge);
  }
  if (/未知项目/.test(unk.desk.continueCard.badge || '')) {
    throw new Error('provider badge must not become 未知项目');
  }
  if (/\bcheckpoint\b/i.test(unk.desk.continueCard.detail || '')) {
    throw new Error('Continue detail must not include checkpoint word');
  }
  if (!unk.desk.projectGate) throw new Error('unconfirmed+checkpoint must keep projectGate row');
  // Active running session → Living; same-session checkpoint not duplicated as Continue
  let live = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  live = HFAdapter.enrichFromHomeSnapshot(live, {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sess-run',
      provider: 'cursor',
      title: 'OneTone agent home plan',
      status: 'running',
      isActive: true,
      updatedAt: Date.now()
    },
    checkpoint: {
      checkpointId: 'c-run',
      sessionId: 'sess-run',
      currentTask: 'OneTone agent home plan',
      updatedAt: Date.now() - 1000
    },
    recentSessions: [
      { sessionId: 'sess-run', provider: 'cursor', title: 'OneTone agent home plan', updatedAt: Date.now() },
      { sessionId: 'sess-old', provider: 'cursor', title: 'older work', updatedAt: Date.now() - 5000 }
    ]
  });
  if (!live.desk.living) throw new Error('active running must fill Living');
  if (live.desk.continueCard) throw new Error('running same-session must not duplicate Continue');
  if (!live.desk.recent || live.desk.recent.length < 2) {
    throw new Error('ledger must list living session plus other recent');
  }
  if (!live.desk.recent.some((r) => r.sessionId === 'sess-old')) {
    throw new Error('ledger must include older sessions');
  }
  if (!live.desk.recent.some((r) => r.sessionId === 'sess-run')) {
    throw new Error('ledger must keep active session visible');
  }
}

// Inventory × attention → agent queue (not session-only ledger)
{
  let invVm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  invVm = HFAdapter.enrichFromInventory(
    invVm,
    {
      agents: [
        { kind: 'workbuddy', presence: 'desktop', confidence: 'high', running: true },
        { kind: 'minimax', presence: 'desktop', confidence: 'high', running: true },
        { kind: 'claude', presence: 'cli', confidence: 'high', running: false },
        { kind: 'cursor', presence: 'desktop', confidence: 'low', running: false },
        { kind: 'qoder', presence: 'none', confidence: 'low', running: false },
        { kind: 'codex', presence: 'desktop', confidence: 'high', running: false }
      ]
    },
    {
      rows: [
        {
          agent: 'workbuddy',
          state: 'working',
          cause: 'lifecycle',
          waitingEligible: false,
          observedAtMs: Date.now() - 60000
        },
        {
          agent: 'claude',
          state: 'needsInput',
          cause: 'permission',
          waitingEligible: true,
          observedAtMs: Date.now() - 120000
        }
      ]
    }
  );
  if (!invVm.desk.ledgerAgents || invVm.desk.ledgerAgents.length < 4) {
    throw new Error('inventory must project multiple agent rows, got ' +
      ((invVm.desk.ledgerAgents && invVm.desk.ledgerAgents.length) || 0));
  }
  // qoder presence none + low conf skipped
  if (invVm.desk.ledgerAgents.some((r) => /qoder/i.test(r.title || ''))) {
    throw new Error('none+low agents must be skipped');
  }
  const needs = invVm.desk.ledgerAgents.filter((r) => r.agentKind === 'needsYou');
  const living = invVm.desk.ledgerAgents.filter((r) => r.agentKind === 'living');
  if (!needs.some((r) => r.title === 'Claude')) throw new Error('Claude needsYou from attention');
  if (!living.some((r) => r.title === 'WorkBuddy')) throw new Error('WorkBuddy living from attention');
  if (!living.some((r) => r.title === 'MiniMax')) throw new Error('MiniMax living from running');
  const invHtml = HFView.renderFocus(invVm, {});
  if (!invHtml.includes('Agent 台账')) throw new Error('inventory ledger must render');
  if (!invHtml.includes('在跑') || !invHtml.includes('需要你')) {
    throw new Error('ledger groups 在跑/需要你 must render');
  }
  if (!invHtml.includes('WorkBuddy') || !invHtml.includes('MiniMax') || !invHtml.includes('Claude')) {
    throw new Error('inventory agents must appear in HTML');
  }
  // Fake freshness forbidden: missing timestamp must not become 刚刚
  const idleCodex = invVm.desk.ledgerAgents.find((r) => r.title === 'Codex');
  if (idleCodex && /刚刚/.test(idleCodex.detail || '')) {
    throw new Error('idle agent without timestamp must not claim 刚刚: ' + idleCodex.detail);
  }
  if (idleCodex && (/ · $/.test(idleCodex.detail || '') || / · · /.test(idleCodex.detail || ''))) {
    throw new Error('empty when must not leave double separators: ' + idleCodex.detail);
  }
  // Shared 高置信 moves to group header (hn-ledger-group-badge), not every row
  if (!invHtml.includes('hn-ledger-group-badge')) {
    throw new Error('同组统一置信度 must render on group header');
  }
  // Agent with no presence/running/when → explicit 时间未知
  invVm = HFAdapter.enrichFromInventory(
    HFAdapter.toViewModel({
      foreground: { appName: 'Cursor' },
      project: { id: 'p1', name: 'x', root: 'E:/x', match: 'exact', confirmed: true },
      provider: { id: 'cursor', status: 'ready' },
      work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
      nextAction: { title: '', kind: 'none', executable: false },
      source: { freshness: 'live', reason: 't' }
    }),
    {
      agents: [{ kind: 'gemini', presence: 'none', confidence: 'high', running: false }]
    },
    { rows: [] }
  );
  const gem = invVm.desk.ledgerAgents && invVm.desk.ledgerAgents[0];
  if (!gem || !/时间未知/.test(gem.detail || '')) {
    throw new Error('no-timestamp agent must say 时间未知, got ' + (gem && gem.detail));
  }
}

// relativeWhen honesty: ≥24h is days, never "今天"
{
  const A = HFAdapter;
  // Reach relativeWhen via a recent session row
  let ageVm = A.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  ageVm = A.enrichFromHomeSnapshot(ageVm, {
    recentSessions: [
      {
        sessionId: 'old-3d',
        provider: 'claude',
        title: 'old work',
        updatedAt: Date.now() - 3 * 86400000,
        matchConfidence: 0.9
      },
      {
        sessionId: 'old-10d',
        provider: 'codex',
        title: 'older',
        updatedAt: Date.now() - 10 * 86400000,
        matchConfidence: 0.5
      }
    ]
  });
  const d3 = ageVm.desk.recent.find((r) => r.sessionId === 'old-3d');
  const d10 = ageVm.desk.recent.find((r) => r.sessionId === 'old-10d');
  if (!d3 || !/天前/.test(d3.detail || '')) {
    throw new Error('3-day age must say N 天前, got ' + (d3 && d3.detail));
  }
  if (/今天/.test((d3 && d3.detail) || '') || /今天/.test((d10 && d10.detail) || '')) {
    throw new Error('relativeWhen must never claim 今天 for ≥24h ages');
  }
  if (!d10 || !/更早/.test(d10.detail || '')) {
    throw new Error('≥7 day age must say 更早, got ' + (d10 && d10.detail));
  }
}

{
  // Empty home → no invented Continue/Recent
  let empty = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '', kind: 'none', executable: false },
    source: { freshness: 'live', reason: 't' }
  });
  empty = HFAdapter.enrichFromHomeSnapshot(empty, { recentSessions: [] });
  if (empty.desk && empty.desk.continueCard) throw new Error('empty home must not invent Continue');
  if (empty.desk && empty.desk.recent) throw new Error('empty home must not invent Recent');
}

assertFocus(
  {
    foreground: { appName: 'Cursor' },
    project: { id: 'unknown-project', name: '未知项目', match: 'unknown', confirmed: false },
    provider: { id: 'cursor', status: 'ready' },
    work: {
      status: 'idle',
      title: '',
      description: '',
      updatedAt: 1
    },
    nextAction: { title: '开始一个新任务', kind: 'start_task', executable: true },
    source: { freshness: 'cached', reason: 't' }
  },
  'quiet'
);

assertFocus(
  {
    foreground: { appName: 'Cursor' },
    project: { id: 'unknown-project', name: '未知项目', match: 'unknown', confirmed: false },
    provider: { id: 'cursor', status: 'unavailable' },
    work: {
      status: 'error',
      title: '暂时无法读取 Cursor 的当前工作',
      description: '失败',
      updatedAt: 1
    },
    nextAction: { title: '重试', kind: 'retry', executable: true },
    source: { freshness: 'stale', reason: 'hard_error' }
  },
  'degraded',
  'retry'
);

// Quiet exact project: presence, no CTA, concrete assist
{
  const { html, vm } = assertFocus(
    {
      foreground: { appName: 'Cursor' },
      project: {
        id: 'p',
        name: 'voice-pilot',
        root: 'E:/x',
        match: 'exact',
        confirmed: true
      },
      provider: { id: 'cursor', status: 'ready' },
      work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
      nextAction: { title: '开始一个新任务', kind: 'start_task', executable: true },
      source: { freshness: 'live', reason: 't' }
    },
    'quiet',
    null
  );
  if (!html.includes('voice-pilot')) throw new Error('quiet should name project');
  if (!html.includes('需要你时再提醒') && !vm.assistance.includes('需要你时再提醒')) {
    throw new Error('quiet assist should stay quiet');
  }
  if (html.includes('hf-say')) throw new Error('quiet must not include say card');
}

const live = fx.cloneState('s1');
const snap = m.projectNowHome(live);
if (!snap.active || snap.active.id !== 'create') throw new Error('expected create active');
if (!snap.habits.some((h) => h.id === 'meet' && h.maybe)) throw new Error('expected meet suggested');
if (snap.active.description !== '正在电脑前工作') throw new Error('create description');
if (!snap.active.helping.includes('减少消息打扰')) throw new Error('helping result copy');

const next = m.activateHabit(live, 'away');
const away = m.projectNowHome(next);
if (!away.active || away.active.id !== 'away') throw new Error('activate away failed');

// Legacy UI still available for demo / ?legacyNow=1
const html = ui.renderNowView({
  snapshot: away,
  facts: { app: 'Cursor', project: 'voice-pilot', projectInferred: false },
  agentHome: AH.buildHomeView(AH.cloneFixture(4))
});
if (!html.includes('当前前台')) throw new Error('missing 当前前台 bar');
if (!html.includes('更多信息')) throw new Error('missing 更多信息 fold');
if (!html.includes('切换情景')) throw new Error('missing 切换情景 fold');
if (!html.includes('data-now-scenes')) throw new Error('missing 情景管理');
if (!html.includes('离开电脑')) throw new Error('away name missing');
if (!html.includes('查看上下文')) {
  throw new Error('可以 zone missing 查看上下文');
}
if (html.includes('交给 Agent') && html.includes('入口尚未接通')) {
  throw new Error('disabled 交给 Agent stub must be gone');
}

// ForegroundContext snapshot wiring (Step 2): dedicated IPC, not Agent home blob.
const nowHomeSrc = fs.readFileSync(path.join(dir, 'now-home.js'), 'utf8');
if (!nowHomeSrc.includes("cmd_foreground_context_snapshot")) {
  throw new Error('now-home must call cmd_foreground_context_snapshot');
}
if (!nowHomeSrc.includes('fgContextCache')) {
  throw new Error('now-home must cache ForegroundContext separately');
}
if (!nowHomeSrc.includes('cmd_home_focus_snapshot') && !nowHomeSrc.includes('OneToneHomeFocusStore')) {
  throw new Error('now-home must wire HomeFocusStore');
}
const homeStoreSrc = fs.readFileSync(path.join(dir, 'home-focus-store.js'), 'utf8');
if (!/cmd_home_confirm_project[\s\S]{0,120}args:\s*\{/.test(homeStoreSrc)) {
  throw new Error('confirmProject must pass Tauri { args: { projectRoot, projectId } }');
}
if (!/cmd_home_list_known_projects[\s\S]{0,80}args:\s*\{/.test(homeStoreSrc)) {
  throw new Error('listProjects must pass Tauri { args: { limit } }');
}
if (!/never pass display-name|Prefer Home Focus confirmed|Do not pass title-derived/i.test(nowHomeSrc)) {
  throw new Error('now-home must document cut of title PathBuf hint');
}
const fetchFn = nowHomeSrc.match(/function fetchAgentHomeSnapshot\([\s\S]*?\n  \}/);
if (!fetchFn) throw new Error('fetchAgentHomeSnapshot missing');
if (/dto\s*&&\s*dto\.asOf|asOf\s*:/.test(fetchFn[0])) {
  throw new Error('agent home change key must not use asOf (flicker)');
}
// Filesystem root from Home Focus is OK; bare display-name tokens are not.
if (!/projectHintForHome/.test(nowHomeSrc)) {
  throw new Error('fetchAgentHomeSnapshot must use projectHintForHome for real roots');
}
if (!/indexOf\('\/'\)|indexOf\('\\\\'\)|indexOf\(':'\)/.test(nowHomeSrc)) {
  throw new Error('projectHintForHome must reject non-path display names');
}
if (!/Do NOT key on asOf/.test(fetchFn[0])) {
  throw new Error('fetchAgentHomeSnapshot should document asOf flicker guard');
}
const rtCtrl = fs.readFileSync(
  path.join(root, 'src/js/features/scene/runtime-habit-control.js'),
  'utf8'
);
if (!/isSelfOrTrayNoise/.test(rtCtrl) || !/Keep last real external app/.test(rtCtrl)) {
  throw new Error('runtime must ignore self/tray FG notes to prevent homepage flicker');
}
const fgHtml = ui.renderNowView({
  snapshot: away,
  facts: {
    app: 'Cursor',
    project: 'voice-pilot',
    projectInferred: true,
    habitName: 'Cursor 项目习惯',
    match: 'exact',
    matchLabel: '已匹配',
    processName: 'Cursor.exe'
  },
  agentHome: AH.buildHomeView(AH.cloneFixture(4))
});
if (!fgHtml.includes('Cursor 项目习惯')) throw new Error('FG habitName missing');
if (!fgHtml.includes('已匹配')) throw new Error('FG matchLabel missing');
if (!fgHtml.includes('推断')) throw new Error('FG inferred project mark missing');
const selfHtml = ui.renderNowView({
  snapshot: away,
  facts: {
    app: 'OneTone',
    project: '未发现',
    habitName: 'Cursor 项目习惯',
    match: 'exact',
    matchLabel: '已匹配',
    selfForeground: true,
    processName: 'onetone.exe'
  },
  agentHome: AH.buildHomeView(AH.cloneFixture(4))
});
if (!selfHtml.includes('正在查看 OneTone')) {
  throw new Error('self foreground must keep habit and explain no switch');
}

const ocTask = AH.cloneFixture(0);
const ocView = AH.buildHomeView(ocTask);
if (!ocView.progress || !String(ocView.progress.text).includes('/')) {
  throw new Error('OpenCode fixture should show progress');
}
if (!ocView.actions.some((a) => a.id === 'pause' && a.kind === 'ghost')) {
  throw new Error('OpenCode should offer monitor pause as ghost');
}
const crView = AH.buildHomeView(AH.cloneFixture(1));
if (crView.progress !== null) throw new Error('Cursor must not fake progress');
if (crView.stepText !== '正在工作') throw new Error('Cursor inferred step');
const ccView = AH.buildHomeView(AH.cloneFixture(2));
if (!ccView.actions.some((a) => a.id === 'approve')) throw new Error('Claude approve missing');
if (ccView.actions.some((a) => a.id === 'pause' || a.id === 'pause-task')) {
  throw new Error('Claude must not show pause');
}
const idleView = AH.buildHomeView(AH.cloneFixture(4));
if (!idleView.actions.some((a) => a.id === 'hand')) throw new Error('idle hand missing');

if (typeof AH.taskFromHomeSnapshot !== 'function') {
  throw new Error('taskFromHomeSnapshot missing');
}
const homeTask = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sid1',
      externalSessionId: 'composer-1',
      title: 'Plan A session',
      projectMatch: 'exact',
      isActive: true,
      status: 'discovered'
    },
    recentSessions: [],
    recentEvents: [
      {
        eventId: 'e1',
        eventType: 'session_discovered',
        eventClass: 'provider_observed',
        summary: '发现 Cursor session'
      }
    ],
    probeStatus: 'ok',
    syncStatus: 'fresh',
    staleAgeMs: 0
  },
  { demo: false }
);
if (homeTask.snapshot.status !== 'idle') {
  throw new Error('observed home snapshot must stay idle (no fake running)');
}
if (homeTask.snapshot.title !== 'Plan A session') {
  throw new Error('home snapshot title missing');
}
if (!homeTask.events.length) throw new Error('home snapshot events missing');
const homeView = AH.buildHomeView(homeTask);
if (homeView.status !== 'idle') throw new Error('home view must not invent running');

// Plan B: observed-only must not invent running (status stays discovered → idle).
const obsOnly = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sid-obs',
      externalSessionId: 'composer-obs',
      title: 'Observed only',
      projectMatch: 'exact',
      isActive: true,
      status: 'discovered'
    },
    recentSessions: [],
    recentEvents: [
      {
        eventId: 'e2',
        eventType: 'user_turn_observed',
        eventClass: 'provider_observed',
        summary: 'User turn observed'
      }
    ],
    latestEvent: {
      eventId: 'e2',
      eventType: 'user_turn_observed',
      eventClass: 'provider_observed',
      summary: 'User turn observed'
    },
    probeStatus: 'ready',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (obsOnly.snapshot.status !== 'idle') {
  throw new Error('observed-only must stay idle');
}
if (
  !obsOnly.snapshot.latestEvent ||
  obsOnly.snapshot.latestEvent.type !== 'user_turn_observed'
) {
  throw new Error('user_turn_observed should stay visible in timeline');
}
if (!/你刚发了一条消息/.test(String(obsOnly.snapshot.latestEvent.summary || ''))) {
  throw new Error('user_turn_observed should use action-oriented summary');
}
if (obsOnly.snapshot.checkpointId) {
  throw new Error('observed-only must not invent checkpoint id');
}
if (obsOnly.memories && obsOnly.memories.length) {
  throw new Error('observed-only must not invent memories');
}

// Plan C: checkpoint + memories project into homepage task
const planC = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sid-c',
      externalSessionId: 'composer-c',
      title: 'Plan C paused',
      projectMatch: 'exact',
      isActive: true,
      status: 'paused'
    },
    recentSessions: [],
    recentEvents: [
      {
        eventId: 'e-c',
        eventType: 'task_paused',
        eventClass: 'onetone_lifecycle',
        summary: '已暂停'
      }
    ],
    latestEvent: {
      eventId: 'e-c',
      eventType: 'task_paused',
      eventClass: 'onetone_lifecycle',
      summary: '已暂停'
    },
    checkpoint: {
      checkpointId: 'ckpt_c1',
      sessionId: 'sid-c',
      nextAction: '继续改 smoke 文案',
      currentTask: 'Plan C paused',
      changedFiles: ['src/js/features/now/now-home.js'],
      pendingQuestions: []
    },
    memories: [
      {
        memoryId: 'm1',
        memoryType: 'observation',
        content: '短停顿会被误判为结束'
      }
    ],
    probeStatus: 'ready',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (planC.snapshot.status !== 'paused') {
  throw new Error('Plan C paused status missing');
}
if (planC.snapshot.checkpointId !== 'ckpt_c1') {
  throw new Error('Plan C checkpointId missing');
}
if (!planC.snapshot.resumable) {
  throw new Error('Plan C checkpoint should be resumable');
}
if (!planC.memories || !planC.memories.length) {
  throw new Error('Plan C memories missing');
}
const planCView = AH.buildHomeView(planC);
if (!planCView.refs || !String(planCView.refs.statsLine).includes('下一步')) {
  throw new Error('Plan C nextAction should appear in more-info context');
}
if (String(planCView.refs.statsLine).includes('没有可继续的任务')) {
  throw new Error('Plan C with checkpoint must not show empty checkpoint in more-info');
}

// Plan C empty states: no checkpoint / no memory (folded into 更多信息)
const planCEmpty = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot', projectId: 'unknown-project' },
    activeSession: {
      sessionId: 'sid-empty',
      externalSessionId: 'composer-empty',
      title: 'Empty C',
      projectMatch: 'unknown',
      isActive: true,
      status: 'discovered'
    },
    recentSessions: [],
    recentEvents: [],
    latestEvent: null,
    checkpoint: null,
    memories: [],
    probeStatus: 'ready',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (!planCEmpty.context || planCEmpty.context.length !== 0) {
  throw new Error('first screen context should be empty; details live in refs');
}
if (planCEmpty.snapshot.checkpointId) {
  throw new Error('empty snapshot must not invent checkpointId');
}
if (planCEmpty.memories && planCEmpty.memories.length) {
  throw new Error('empty snapshot must not invent memories');
}

const emptyVm = AH.buildHomeView(planCEmpty);
if (
  !emptyVm.refs ||
  !emptyVm.refs.memLines ||
  !emptyVm.refs.memLines.some((m) => m.title === '还没有项目相关记忆')
) {
  throw new Error('homeViewModel must surface empty memory line in more-info');
}
if (!emptyVm.refs.statsLine || !/没有可继续的任务/.test(emptyVm.refs.statsLine)) {
  throw new Error('homeViewModel must surface empty checkpoint in more-info');
}
if (!String(emptyVm.title).includes('现在没有正在处理的事')) {
  throw new Error('idle card should use action-oriented title');
}

// Plan C homepage: resume path is brief-only IPC (no shell/exec in resumeCheckpoint).
const homeSrc = fs.readFileSync(path.join(dir, 'now-home.js'), 'utf8');
const resumeFn = homeSrc.match(/function resumeCheckpoint\([\s\S]*?\n  \}/);
if (!resumeFn) throw new Error('resumeCheckpoint missing');
if (!resumeFn[0].includes("cmd_agent_checkpoint_resume")) {
  throw new Error('resumeCheckpoint must call cmd_agent_checkpoint_resume');
}
if (/cmd_shell|spawnSync|execSync|child_process|fetch\(/.test(resumeFn[0])) {
  throw new Error('resumeCheckpoint must not execute side-effect commands');
}

// Unknown project must not invent foreign memories from dto.
const unkTask = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'unknown', projectId: 'unknown-project' },
    activeSession: null,
    recentSessions: [],
    recentEvents: [],
    checkpoint: null,
    memories: [],
    probeStatus: 'empty_valid',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (unkTask.memories && unkTask.memories.length) {
  throw new Error('unknown project must not show memories');
}
if (unkTask.snapshot.checkpointId) {
  throw new Error('unknown project must not invent checkpoint');
}
const unkVm = AH.buildHomeView(unkTask);
if (!String(unkVm.refs.statsLine).includes('没有可继续的任务')) {
  throw new Error('unknown project empty checkpoint in more-info');
}

// Plan B: lifecycle event + status → running; latest/recent 同源
const lifeTask = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sid2',
      externalSessionId: 'composer-2',
      title: 'Plan B running',
      projectMatch: 'exact',
      isActive: true,
      status: 'running'
    },
    recentSessions: [],
    recentEvents: [
      {
        eventId: 'e-life',
        eventType: 'task_resumed',
        eventClass: 'onetone_lifecycle',
        summary: '已继续'
      },
      {
        eventId: 'e2',
        eventType: 'user_turn_observed',
        eventClass: 'provider_observed',
        summary: 'User turn observed'
      }
    ],
    latestEvent: {
      eventId: 'e-life',
      eventType: 'task_resumed',
      eventClass: 'onetone_lifecycle',
      summary: '已继续'
    },
    probeStatus: 'ready',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (lifeTask.snapshot.status !== 'running') {
  throw new Error('Plan B lifecycle status running must surface');
}
if (!lifeTask.snapshot.latestEvent || lifeTask.snapshot.latestEvent.type !== 'task_resumed') {
  throw new Error('latestEvent must match lifecycle');
}
if (!lifeTask.events.length || lifeTask.events[0].id !== 'e-life') {
  throw new Error('recentEvents[0] must match latestEvent');
}
if (lifeTask.events[0].tier !== 'runner') {
  throw new Error('lifecycle events must use runner tier');
}
const lifeView = AH.buildHomeView(lifeTask);
if (lifeView.status !== 'running') throw new Error('Plan B home view running');

// empty history copy
const emptyHist = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: {
      sessionId: 'sid-empty',
      externalSessionId: 'c-empty',
      title: 'No events',
      projectMatch: 'exact',
      status: 'discovered'
    },
    recentSessions: [],
    recentEvents: [],
    latestEvent: null,
    probeStatus: 'ready',
    syncStatus: 'ready',
    staleAgeMs: 0
  },
  { demo: false }
);
if (!emptyHist.contextDetail.some(function (c) { return /还没有可显示的活动/.test(c.label); })) {
  throw new Error('empty history must show human empty-activity copy');
}

const consentTask = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: null,
    recentSessions: [
      {
        sessionId: 'sid-c',
        externalSessionId: 'composer-c',
        title: 'cached',
        projectMatch: 'probable',
        status: 'discovered'
      }
    ],
    recentEvents: [],
    probeStatus: 'consent_off',
    syncStatus: 'consent_off',
    staleAgeMs: 0
  },
  { demo: false }
);
if (!/活动统计未启用/.test(String(consentTask.waitReason || ''))) {
  throw new Error('consent_off must explain activity stats gated');
}
if (!/已缓存的对话/.test(String(consentTask.waitReason || ''))) {
  throw new Error('consent_off copy should avoid raw session jargon');
}
if (!consentTask.contextDetail.some(function (c) { return /可能属于当前项目/.test(c.label); })) {
  throw new Error('probable match must stay action-oriented');
}
if (!consentTask.contextDetail.some(function (c) { return /最近处理过：cached/.test(c.label); })) {
  throw new Error('recent sessions should use 最近处理过 copy');
}
const lockedTask = AH.taskFromHomeSnapshot(
  {
    project: { displayName: 'voice-pilot' },
    activeSession: null,
    recentSessions: [
      {
        sessionId: 'sid-l',
        externalSessionId: 'composer-l',
        title: 'stale cache',
        projectMatch: 'unknown',
        status: 'discovered'
      }
    ],
    recentEvents: [],
    probeStatus: 'read_locked',
    syncStatus: 'stale',
    staleAgeMs: 180000
  },
  { demo: false }
);
if (!/缓存/.test(String(lockedTask.waitReason || ''))) {
  throw new Error('read_locked/stale must keep cache messaging');
}
if (!lockedTask.contextDetail.some(function (c) { return /分钟前/.test(c.label); })) {
  throw new Error('stale age should surface on home context');
}
if (!lockedTask.contextDetail.some(function (c) { return /还不能确定属于哪个项目/.test(c.label); })) {
  throw new Error('unknown projectMatch must be humanized');
}
if (lockedTask.contextDetail.some(function (c) { return /归属 |同步 /.test(c.label); })) {
  throw new Error('must not leak raw match/sync tokens into context');
}

const liveRun = AH.taskFromAttention(
  { waitingKinds: [], rows: [{ agent: 'cursor', state: 'working' }] },
  [{ id: 'view_progress', title: '查看进度', detail: 'AI 正在处理' }],
  { demo: false }
);
const liveRunView = AH.buildHomeView(liveRun);
if (liveRunView.status !== 'running') throw new Error('working attention → running');
if (liveRunView.progress !== null) throw new Error('live running must not invent progress');
if (!liveRunView.actions.some((a) => a.id === 'detail')) throw new Error('live running needs detail');

const liveWait = AH.taskFromAttention(
  { waitingKinds: ['waitingApproval'], rows: [{ agent: 'claude', state: 'needsInput' }] },
  [{ id: 'approve_rm', title: '批准 Claude 的操作？', detail: 'Claude 在等你决定' }],
  { demo: false }
);
const liveWaitView = AH.buildHomeView(liveWait);
if (liveWaitView.status !== 'waiting_approval') throw new Error('needsInput → waiting');
if (!liveWaitView.actions.some((a) => a.id === 'approve')) throw new Error('claude live approve');

const agentHtml = ui.renderNowView({
  snapshot: away,
  agentHome: ocView,
  facts: { app: 'Cursor', project: 'voice-pilot', presence: '不知道', agentLine: ocView.contextLine }
});
if (!agentHtml.includes('data-now-agent-home')) throw new Error('agent home zone missing');
if (!agentHtml.includes('data-now-agent-act')) throw new Error('agent actions missing');
if (!agentHtml.includes('已完成')) throw new Error('OpenCode progress text missing in UI');
if (agentHtml.includes('>Agent</') || agentHtml.includes('now-fact-k">Agent')) {
  throw new Error('facts must not duplicate Agent row');
}
if (html.includes('主动帮你处理了事情') || html.includes('减少打断')) {
  throw new Error('value KPI buckets must not render');
}
if (html.includes('OneTone 正在帮你')) {
  throw new Error('helping promises must not render on home');
}
if (html.includes('data-now-adjust')) {
  throw new Error('home must not show adjust; use 情景管理');
}

const wait = fx.cloneState('sWait');
const waitSnap = m.projectNowHome(wait);
const waitHtml = ui.renderNowView({
  snapshot: waitSnap,
  criticalNeed: waitSnap.needsYou.find((n) => n.primary) || waitSnap.needsYou[0]
});
if (!waitHtml.includes('data-now-open-need')) throw new Error('critical need CTA missing');

const scenes = ui.renderScenesView({ snapshot: away });
if (!scenes.includes('结果开关') || !scenes.includes('何时进入')) throw new Error('scenes view missing');
if (!scenes.includes('data-now-op=')) throw new Error('scenes need assist toggles');

const emptyRt = m.projectFromRuntime({ hasHabits: false, current: {}, source: {}, control: {} }, []);
if (!emptyRt.empty) throw new Error('expected empty runtime projection');
const emptyHtml = ui.renderNowView({ snapshot: emptyRt });
if (!emptyHtml.includes('还没有情景')) throw new Error('empty state missing');

ctx.OneToneState = {
  state: {
    config: {
      mappings: [
        { id: 'habit-a', group: '工作', assists: [] },
        { id: 'habit-b', group: '专注', assists: [] }
      ]
    }
  }
};

const rtPayload = {
  hasHabits: true,
  current: {
    id: 'habit-a',
    name: '工作',
    mode: 'manual',
    badge: '',
    tooltip: '手动切换中',
    canClearPin: false,
    canClearOverride: false
  },
  source: { pin: false, override: false, foreground: false, manual: true },
  control: { canClearPin: false, canClearOverride: false, staleOverride: false }
};
const mappings = ctx.OneToneState.state.config.mappings;

const rtSnap = m.projectFromRuntime(rtPayload, mappings);
if (!rtSnap.active || rtSnap.active.id !== 'habit-a') throw new Error('runtime active');
if (rtSnap.habits.length !== 2) throw new Error('runtime habits count');
if (!rtSnap.active.actions || rtSnap.active.actions.length < 1) {
  throw new Error('runtime should project assists');
}
if (!rtSnap.active.helping.includes('保持专注')) throw new Error('helping from assists');
const rtHtml = ui.renderNowView({ snapshot: rtSnap });
if (!rtHtml.includes('工作')) throw new Error('runtime name missing');
if (!rtHtml.includes('情景管理')) throw new Error('runtime should show 情景管理');

const toggled = m.toggleHabitAssist('habit-a', 'focus');
if (!toggled.ok || toggled.enabled !== false) throw new Error('toggle assist off');
if (!Array.isArray(mappings[0].assists) || mappings[0].assists.includes('focus')) {
  throw new Error('mapping.assists must drop focus id');
}
if (mappings[0].assists.some((x) => /[\u4e00-\u9fff]/.test(x))) {
  throw new Error('assists must store ids not Chinese labels');
}
const after = m.projectFromRuntime(rtPayload, mappings);
if (after.active.helping.includes('保持专注')) throw new Error('helping should drop toggled assist');
if (after.active.actions.find((a) => a.id === 'focus').enabled) {
  throw new Error('focus assist should be off');
}

mappings[0].assists = ['保持专注', 'quiet'];
const migrated = m.resolveActionsForHabit('habit-a');
if (!mappings[0].assists.includes('focus') || mappings[0].assists.includes('保持专注')) {
  throw new Error('legacy label should migrate to focus id');
}
if (!migrated.find((a) => a.id === 'focus').enabled) throw new Error('migrated focus on');

const scenesRt = ui.renderScenesView({ snapshot: after, runtimeMode: true });
if (scenesRt.includes('data-now-add') || scenesRt.includes('data-now-remove')) {
  throw new Error('runtime scenes must not fake add/remove');
}
if (!scenesRt.includes('data-now-op=')) throw new Error('runtime scenes need assist toggles');

const withCtx = m.projectFromRuntime(rtPayload, mappings, {
  attention: { waitingKinds: ['codex'], rows: [{ state: 'needsInput', agent: 'codex' }] },
  identity: { exeName: 'Zoom.exe', fullPath: 'C:\\Zoom\\Zoom.exe' }
});
if (!withCtx.needsYou.some((n) => n.id === 'view_reply')) {
  throw new Error('waiting should project needsYou');
}
const meetMap = mappings.find((x) => x.id === 'habit-b');
meetMap.group = '会议中';
const sug = m.projectFromRuntime(rtPayload, mappings, {
  attention: {},
  identity: { exeName: 'Teams.exe' }
});
if (!sug.habits.some((h) => h.id === 'habit-b' && h.maybe)) {
  throw new Error('meeting FG should suggest meet-like habit');
}

const gateHtml = ui.renderNowView({
  snapshot: rtSnap,
  pending: {
    kind: 'choice',
    targetId: 'habit-b',
    targetName: '专注'
  }
});
if (!gateHtml.includes('正在跟随前台') || !gateHtml.includes('data-now-gate-choice')) {
  throw new Error('choice gate missing');
}

if (!emptyHtml.includes('data-now-bootstrap="recommended"')) {
  throw new Error('empty state missing recommended bootstrap CTA');
}
if (!emptyHtml.includes('用推荐情景开始')) {
  throw new Error('empty state missing recommended CTA copy');
}
if (!emptyHtml.includes('data-now-scenes="new"') || !emptyHtml.includes('自己建')) {
  throw new Error('empty state missing self-build CTA');
}

vm.runInNewContext(
  fs.readFileSync(path.join(root, 'src/js/features/agent/agent-actions.js'), 'utf8'),
  ctx
);
ctx.OneToneState = { state: { config: { mappings: [] } } };
let saved = false;
ctx.OneToneConfigPersist = {
  saveAsync() {
    saved = true;
  }
};
let switchedTo = '';
ctx.OneToneHabitRuntime = {
  switch(id) {
    switchedTo = String(id || '');
    return { ok: true };
  }
};
const boot = m.bootstrapRecommendedHabit();
if (!boot.ok || !boot.created) throw new Error('bootstrap should create');
const bootMaps = ctx.OneToneState.state.config.mappings;
if (bootMaps.length !== 1) throw new Error('bootstrap should yield 1 mapping');
const bm = bootMaps[0];
if (bm.group !== '创作中' || bm.label !== '创作中') {
  throw new Error('bootstrap mapping label/group');
}
if (bm.appTargetId !== '') throw new Error('bootstrap must stay universal (empty appTargetId)');
if (!Array.isArray(bm.assists) || bm.assists.join(',') !== 'focus,quiet,protect') {
  throw new Error('bootstrap assists must be focus/quiet/protect ids');
}
const slots = (bm.agentBindings || []).map((b) => b.slotId);
if (
  !slots.includes('summonCodex') &&
  !slots.includes('pushToTalk') &&
  !slots.includes('cancel')
) {
  throw new Error('bootstrap agentBindings missing essentials slots');
}
if (!saved) throw new Error('bootstrap should persist');
if (switchedTo !== bm.id) throw new Error('bootstrap should switch to new habit');
const bootAgain = m.bootstrapRecommendedHabit();
if (!bootAgain.ok || bootAgain.created) {
  throw new Error('second bootstrap should no-op when library exists');
}
if (ctx.OneToneState.state.config.mappings.length !== 1) {
  throw new Error('second bootstrap must not duplicate');
}

if (!todayApi || !todayApi.loadToday || !todayApi.sanitizeSummary) {
  throw new Error('OneToneNowToday missing');
}
if (todayApi.sanitizeSummary('SoftPad · NP_ENTER') !== '软垫 · 回车') {
  throw new Error(
    'NP_ENTER sanitize, got: ' + todayApi.sanitizeSummary('SoftPad · NP_ENTER')
  );
}
if (todayApi.sanitizeSummary('语音 · AutoTrigger → RAlt · 开始听写').includes('RAlt')) {
  throw new Error('RAlt must be stripped');
}
if (todayApi.sanitizeSummary('SoftPad · NP5') !== '软垫 · 数字 5') {
  throw new Error('NP5 sanitize, got: ' + todayApi.sanitizeSummary('SoftPad · NP5'));
}

ctx.OneToneIpc = {
  invoke(cmd) {
    if (cmd !== 'cmd_action_history_list') return Promise.resolve(null);
    return Promise.resolve({
      entries: [
        {
          id: 1,
          tsMs: Date.UTC(2026, 9, 1, 8, 15),
          channel: 'key',
          actionId: 'agent.interrupt',
          status: 'executed',
          summary: '按键 · 创作中 · 打断'
        },
        {
          id: 2,
          tsMs: Date.UTC(2026, 9, 1, 9, 0),
          channel: 'softPad',
          actionId: 'input.start',
          status: 'executed',
          summary: 'SoftPad · NP_ENTER'
        },
        {
          id: 3,
          tsMs: Date.UTC(2026, 9, 1, 10, 0),
          channel: 'voice',
          actionId: 'onetone.resume',
          status: 'executed',
          summary: '语音 · AutoTrigger → RAlt · 开始听写'
        },
        {
          id: 4,
          tsMs: Date.UTC(2026, 9, 1, 11, 0),
          channel: 'system',
          status: 'failed',
          summary: '系统 · 应被过滤'
        },
        {
          id: 5,
          tsMs: Date.UTC(2026, 9, 1, 12, 0),
          channel: 'key',
          actionId: 'status.read',
          status: 'pendingConfirmation',
          summary: '按键 · 状态提醒'
        }
      ],
      hasMore: false
    });
  }
};

const todayRows = await todayApi.loadToday(14);
if (todayRows.length !== 4) throw new Error('today should keep executed+pending only');
if (todayRows.some((r) => /应被过滤|NP_ENTER|RAlt|AutoTrigger/.test(r.text))) {
  throw new Error('tech / failed must not appear: ' + todayRows.map((r) => r.text).join('|'));
}
if (!todayRows.some((r) => r.text.includes('回车'))) throw new Error('NP_ENTER → 回车 missing');
if (!todayRows.some((r) => r.src === '⌨️') || !todayRows.some((r) => r.src === '●')) {
  throw new Error('channel icons should map onto rows');
}

const emptyToday = ui.renderNowView({
  snapshot: Object.assign({}, away, { today: [] })
});
if (!emptyToday.includes('今天还没有记录')) throw new Error('empty today copy missing');

const withToday = ui.renderNowView({
  snapshot: Object.assign({}, away, { today: todayRows }),
  facts: {
    hero: 'Cursor',
    app: 'Cursor',
    project: 'voice-pilot',
    projectInferred: true,
    presence: '不知道',
    agent: '空闲'
  },
  criticalNeed: { id: 'approve_rm', title: 'Codex 在等你批准', detail: '不可逆' }
});
if (!withToday.includes('今天你用了什么')) throw new Error('today section missing');
if (!withToday.includes('按键 · 创作中 · 打断')) throw new Error('today must show cleaned summary');
if (!withToday.includes('软垫 · 回车')) throw new Error('sanitized softpad row missing');
if (!withToday.includes('推断') || !withToday.includes('voice-pilot')) {
  throw new Error('project inferred fact missing');
}
if (!withToday.includes('data-now-open-need') || !withToday.includes('查看并决定')) {
  throw new Error('critical need missing in can zone');
}
if (withToday.includes('减少打断') || withToday.includes('主动帮你')) {
  throw new Error('KPI must stay gone');
}

const approveSnap = m.projectFromRuntime(rtPayload, mappings, {
  attention: {
    waitingKinds: ['waitingApproval'],
    rows: [
      {
        state: 'needsInput',
        cause: 'permission',
        agent: 'codex',
        observedAtMs: Date.now() - 5 * 60000
      }
    ]
  }
});
if (!approveSnap.needsYou.some((n) => n.id === 'approve_rm')) {
  throw new Error('permission cause should project approve_rm');
}
const approveHtml = ui.renderNowView({
  snapshot: approveSnap,
  criticalNeed: approveSnap.needsYou.find((n) => n.id === 'approve_rm')
});
if (!approveHtml.includes('查看并决定')) {
  throw new Error('approve_rm CTA should be 查看并决定');
}
if (!approveHtml.includes('data-now-voice-strip')) {
  throw new Error('voice strip slot missing from now view');
}
if (!approveHtml.includes('data-now-voice-stop')) {
  throw new Error('voice strip stop control missing');
}
const listenHtml = ui.renderNowView({
  snapshot: approveSnap,
  voice: { listening: true }
});
if (!listenHtml.includes('倾听中')) {
  throw new Error('dock should show 倾听中 when listening');
}
if (!/class="now-dock-voice is-on"/.test(listenHtml)) {
  throw new Error('dock should have is-on while listening');
}

ctx.OneToneIpc = {
  invoke() {
    return Promise.resolve({ entries: [], hasMore: false });
  }
};
const cleared = await todayApi.loadToday(14);
if (cleared.length !== 0) throw new Error('empty history should yield empty today');

console.log('smoke-now-home: ok');
