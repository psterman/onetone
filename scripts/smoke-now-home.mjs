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
  },
  sessionStorage: {
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
  },
  navigator: {
    clipboard: {
      _text: '',
      writeText(t) {
        this._text = String(t || '');
        return Promise.resolve();
      },
      readText() {
        return Promise.resolve(this._text || '');
      }
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
  'home-agent-status-strip.js',
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
const HFStrip = ctx.OneToneHomeAgentStatusStrip;
if (!AH || !AH.buildHomeView) throw new Error('OneToneNowAgentHome missing');
if (!HFAdapter || !HFAdapter.toViewModel) throw new Error('HomeFocusAdapter missing');
if (!HFView || !HFView.renderFocus) throw new Error('HomeFocusView missing');
if (!HFStrip || !HFStrip._shouldSuppress) throw new Error('HomeAgentStatusStrip test surface missing');

HFStrip._setHero({ heroMode: 'running', provider: 'codex', projectId: 'voice-pilot' });
if (!HFStrip._shouldSuppress({ kind: 'working', target: { provider: 'codex', projectId: 'voice-pilot' } })) {
  throw new Error('running Hero must suppress the same Agent working strip');
}
if (HFStrip._shouldSuppress({ kind: 'working', target: { provider: 'claude', projectId: 'docs' } })) {
  throw new Error('running Hero must allow a different Agent working strip');
}

const HFPolicy = ctx.OneToneHomeActionPolicy;
if (!HFPolicy || !HFPolicy.resolveQuickHandoffTarget) {
  throw new Error('HomeActionPolicy quick handoff helpers missing');
}

// —— Home Focus four modes (v1 situational canvas) ——
function assertFocus(dto, expectMode, expectPrimaryId) {
  const vm = HFAdapter.toViewModel(dto);
  if (vm.mode !== expectMode) {
    throw new Error(`focus mode want ${expectMode} got ${vm.mode}`);
  }
  const showComposer =
    (expectMode === 'quiet' && !expectPrimaryId) || expectMode === 'return';
  const smokeProbeTargets = [
    { kind: 'cursor', label: 'Cursor', installed: true },
    { kind: 'claude', label: 'Claude', channel: 'cli', installed: true },
    { kind: 'chatgpt', label: 'ChatGPT' },
    { kind: 'minimax', label: 'MiniMax' },
    { kind: 'workbuddy', label: 'WorkBuddy' },
    { kind: 'trae', label: 'Trae Work' },
    { kind: 'traeCode', label: 'Trae Code' },
    { kind: 'qoder', label: 'Qoder' }
  ];
  const html = HFView.renderFocus(vm, {
    draftText: showComposer ? '' : undefined,
    handoffDisabled: true,
    probeTargets: showComposer ? smokeProbeTargets : undefined
  });
  if (!html.includes('hn-canvas')) throw new Error('focus missing hn-canvas');
  if (!html.includes('homePromptPrepHost')) throw new Error('focus missing prompt prep host');
  if (!html.includes('homeAgentStatusHost')) throw new Error('focus missing agent status host');
  if (html.includes('homeAgentRoster')) throw new Error('focus must not mount full Agent roster');
  if (html.includes('hn-context-card')) {
    throw new Error('focus must not show Agent context cards');
  }
  if (showComposer) {
    if (!html.includes('data-hn-quiet-composer')) {
      throw new Error(`${expectMode} must render quiet composer`);
    }
    if (expectMode === 'quiet' && !html.includes('今天想推进什么')) {
      throw new Error('quiet composer missing opening headline');
    }
    if (html.includes('暂时无需处理') || html.includes('需要你时再提醒')) {
      throw new Error('quiet composer must not use long quiet narrative');
    }
    if (/quiet\s*·|轻量开场/.test(html) && html.includes('quiet-tag')) {
      throw new Error('production quiet must not show internal quiet-tag copy');
    }
    if (!html.includes('data-hn-agent-grid') || !html.includes('data-hf-act="quick_handoff"')) {
      throw new Error('quiet composer must expose agent icon grid handoff');
    }
    if (html.includes('复制并打开 Agent') || html.includes('跳转 ')) {
      throw new Error('quiet composer must not use text handoff / 跳转 labels');
    }
    if (!html.includes('disabled')) {
      throw new Error('empty quiet composer handoff must be disabled');
    }
    if (!html.includes('data-hf-act="open_prep"')) {
      throw new Error('quiet composer must expose open_prep');
    }
    if (!html.includes('加入内容')) {
      throw new Error('quiet composer must label material chips');
    }
    for (const kind of ['paste', 'attach', 'url', 'folder', 'capture']) {
      if (!html.includes(`data-hf-collect="${kind}"`)) {
        throw new Error(`quiet composer missing collect chip ${kind}`);
      }
    }
    if (html.includes('data-hf-collect="image"') || html.includes('data-hf-collect="file"')) {
      throw new Error('quiet must use unified 附件 chip, not fixed 图片/文件');
    }
    if (html.includes('data-hf-act="quiet_paste_text"')) {
      throw new Error('quiet must use quiet_collect chips, not draft-only paste act');
    }
    if (html.includes('hn-prep-launch')) {
      throw new Error('quiet must not also show legacy prepLaunch card');
    }
    if (expectMode === 'return' && html.includes('hn-hero')) {
      throw new Error('return mode mounts composer, not separate Hero gate');
    }
  } else {
    if (!html.includes('hn-hero')) throw new Error('focus missing situational hn-hero');
    if (html.includes('data-hn-quiet-composer')) {
      throw new Error(`${expectMode} must not render quiet composer`);
    }
    if (html.includes('hn-prep-launch')) {
      throw new Error(`${expectMode} must not show legacy prepLaunch card`);
    }
  }
  if (!html.includes('data-hf-view="focus"')) throw new Error('focus missing 现在 nav');
  if (!html.includes('我的习惯')) throw new Error('focus missing 我的习惯 nav');
  // Settings lives in the workbench sidebar — home top nav must not duplicate it.
  if (/data-hf-view="settings"/.test(html)) {
    throw new Error('focus must not expose 设置 top-nav (use workbench drawer)');
  }
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
    'Probable match',
    'ProbeStatus',
    'Soft Pad'
  ]) {
    if (html.includes(bad)) throw new Error(`focus must not show jargon: ${bad}`);
  }
  // Hero / return resume owns at most one primary CTA; quiet handoff is icon tiles.
  const ctas = (html.match(/class="hn-cta[^"]*"/g) || []).length;
  if (ctas > 1) throw new Error('focus must have at most one primary CTA');
  if (expectMode === 'quiet' && !expectPrimaryId) {
    if (vm.primary) throw new Error('quiet must have null primary');
    if (ctas !== 0) throw new Error('quiet composer must use agent icons, not a handoff CTA');
  }
  if (expectMode === 'return' && expectPrimaryId === 'resume') {
    if (ctas !== 1) throw new Error('return composer must keep one resume CTA');
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
    'quiet',
    'confirm_project'
  );
  if (r.vm.desk && r.vm.desk.projectGate) {
    throw new Error('unconfirmed project CTA must live on Hero, not desk.projectGate');
  }
  if (r.vm.mode === 'degraded') {
    throw new Error('unconfirmed project must not become degraded');
  }
  if (/暂时无法确认你正在处理的项目/.test(r.vm.headline || '')) {
    throw new Error('project uncertainty must not hijack H1 with old copy');
  }
  if (r.html.includes('hn-desk-zone--gate')) {
    throw new Error('project gate zone must not compete with Hero CTA');
  }
  if (!r.html.includes('data-hf-act="confirm_project"')) {
    throw new Error('Hero must expose confirm_project');
  }
  if (!/确认/.test(r.vm.primary.label || '')) {
    throw new Error('confirm primary label must mention 确认');
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
  if (r.html.includes('homeAgentRoster')) {
    throw new Error('return mode must not remount Agent roster on home');
  }
  if (!r.html.includes('data-hf-act="resume"')) {
    throw new Error('return mode must expose resume CTA on composer');
  }
  if (!r.vm.secondary || r.vm.secondary.id !== 'start_new_task') {
    throw new Error('return mode must expose start_new_task as the secondary action');
  }
  if (!r.html.includes('data-hf-act="start_new_task"')) {
    throw new Error('return mode must still offer 开始新任务 dismiss');
  }
  if (!r.html.includes('开始新任务')) {
    throw new Error('return mode must label secondary 开始新任务');
  }
  if (!r.html.includes('data-hf-collect="capture"')) {
    throw new Error('return mode must allow immediate capture collect');
  }
  if (!r.html.includes('homePromptPrepHost')) {
    throw new Error('return mode home still needs prep host');
  }
  if (r.html.includes('hn-prep-launch')) {
    throw new Error('return mode must not duplicate prepLaunch under secondary start_new_task');
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
  if (r.html.includes('homeAgentRoster')) {
    throw new Error('attention must not remount Agent roster on home');
  }
  if (!r.html.includes('data-hf-act="view_progress"')) {
    throw new Error('attention Hero must expose view_progress CTA');
  }
  if (!r.html.includes('homePromptPrepHost') || !r.html.includes('homeAgentStatusHost')) {
    throw new Error('attention home must keep prep + status hosts');
  }
  if (r.vm.desk.living) throw new Error('Needs You must not also invent Living');
  if (!/需要你确认|等待你确认/.test(r.vm.headline || '')) {
    throw new Error('attention headline must use generic confirmation language');
  }
  if (/文件修改|等待批准/.test((r.vm.headline || '') + (r.vm.assistance || ''))) {
    throw new Error('attention must not infer a structured reason without a cause payload');
  }
}

// Running is a coarse-fact Hero: title + freshness + Agent CTA, never fake progress.
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
    'running',
    'view_progress'
  );
  if (!r.vm.desk || !r.vm.desk.living) {
    throw new Error('running quiet must project Living desk zone');
  }
  // Living / Agent roster UI moved to Agent → 总览; home only keeps prep + status strip.
  if (r.html.includes('homeAgentRoster') || r.html.includes('Living Now')) {
    throw new Error('home must not render full Living/Agent roster');
  }
  if (r.vm.desk.needsYou) throw new Error('Living must not mix waiting');
  if (!/首页结构/.test(r.vm.headline || '')) {
    throw new Error('running Hero must include the reported work title');
  }
  if (!r.vm.primary || r.vm.primary.label !== '查看 Agent') {
    throw new Error('running Hero primary must be 查看 Agent');
  }
  if (/\d+\s*\/\s*\d+|预计|%/.test((r.vm.assistance || '') + JSON.stringify(r.vm.progress || {}))) {
    throw new Error('running coarse facts must not invent progress or ETA');
  }
  if (!r.html.includes('运行中')) throw new Error('running Hero must render a running fact chip');
  if (/class="hn-cta[^\"]*hn-cta--attention/.test(r.html)) {
    throw new Error('running Agent CTA must not use the attention warning tone');
  }
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
  // attention must also lift an active running Hero (arbitration: attention > running)
  let runVm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'voice-pilot', root: 'E:/x', match: 'exact', confirmed: true },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'running', title: '首页结构', description: '处理中', updatedAt: Date.now() },
    nextAction: { title: '查看 Agent', kind: 'view_progress', executable: true },
    source: { freshness: 'live', reason: 't' }
  });
  if (runVm.mode !== 'running') throw new Error('fixture should start running');
  runVm = HFAdapter.enrichFromAttention(runVm, {
    rows: [
      {
        agent: 'codex',
        state: 'needsInput',
        cause: 'permission',
        waitingEligible: true,
        observedAtMs: Date.now()
      }
    ]
  });
  if (runVm.mode !== 'attention') {
    throw new Error('Soft Pad waiting must upgrade running → attention');
  }
  if (!runVm.primary || runVm.primary.label !== '查看并决定') {
    throw new Error('lifted attention must own 查看并决定 CTA');
  }
  if (!vm.desk.needsYouRows || vm.desk.needsYouRows.length < 1) {
    throw new Error('Needs You must project rows[] not only scalar');
  }
  if (!/Codex/.test(vm.desk.needsYou.title) && !/Codex/.test(vm.headline)) {
    throw new Error('Needs You should name Codex');
  }
  const html = HFView.renderFocus(vm, {});
  if (html.includes('homeAgentRoster')) {
    throw new Error('enriched attention must not remount Agent roster on home');
  }
  if (!html.includes('hn-hero') || !html.includes('data-hf-act="view_progress"')) {
    throw new Error('enriched attention must paint Hero with view_progress');
  }
  if (!html.includes('homeAgentStatusHost')) {
    throw new Error('enriched attention home must expose status strip host');
  }
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
  // Agent living/needs badges no longer mount on home canvas (Agent → 总览 owns them).
  if (multiHtml.includes('homeAgentRoster')) {
    throw new Error('multi attention must not remount home roster');
  }
  if (!multiHtml.includes('homePromptPrepHost')) {
    throw new Error('multi attention home still needs prep host');
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
  // Probe foot / Agent desk moved to Agent → 总览; home keeps prep + status hosts.
  if (probeHtml.includes('hn-desk-probe') || probeHtml.includes('homeAgentRoster')) {
    throw new Error('home must not render probe foot / Agent roster');
  }
  if (!probeHtml.includes('homePromptPrepHost') || !probeHtml.includes('homeAgentStatusHost')) {
    throw new Error('probe-enriched home must keep prep + status hosts');
  }
  // Unconfirmed project: Hero owns pick/confirm; Soft Pad waiting upgrades to attention
  let deg = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: { id: 'p1', name: 'x', root: '', match: 'unknown', confirmed: false },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: Date.now() },
    nextAction: { title: '选择当前项目', kind: 'pick_project', executable: true },
    source: { freshness: 'stale', reason: 't' }
  });
  if (deg.mode !== 'quiet') throw new Error('unconfirmed project alone must stay quiet, not degraded');
  if (!deg.primary || deg.primary.id !== 'pick_project') {
    throw new Error('unconfirmed project must put pick_project on Hero primary');
  }
  if (deg.desk && deg.desk.projectGate) {
    throw new Error('Hero owns confirm/pick — desk.projectGate must be cleared');
  }
  deg = HFAdapter.enrichFromAttention(deg, {
    rows: [{ agent: 'codex', state: 'needsInput', cause: 'permission', waitingEligible: true }]
  });
  if (deg.mode !== 'attention') throw new Error('Soft Pad waiting must upgrade quiet→attention');
  if (!deg.desk || !deg.desk.needsYou) {
    throw new Error('attention must still show Soft Pad Needs You on desk');
  }
  if (deg.primary.id !== 'view_progress') {
    throw new Error('attention primary must be view_progress, not project gate');
  }
  const degHtml = HFView.renderFocus(deg, {});
  if (!degHtml.includes('homeAgentStatusHost') || !degHtml.includes('homePromptPrepHost')) {
    throw new Error('desk must keep status + prep hosts when Soft Pad waits');
  }
  if (!degHtml.includes('data-hf-act="view_progress"')) {
    throw new Error('attention Hero must expose view_progress');
  }
  if (degHtml.includes('hn-desk-zone--gate')) {
    throw new Error('project gate must not compete with attention Hero CTA');
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
  if (!vm.secondary || vm.secondary.id !== 'start_new_task') {
    throw new Error('checkpoint→return must expose start_new_task secondary');
  }
  if (!/停在\s+Cursor/.test(vm.headline || '')) {
    throw new Error('return H1 must use provider with spacing, got: ' + vm.headline);
  }
  const homeHtml = HFView.renderFocus(vm, {
    draftText: '',
    handoffDisabled: true,
    probeTargets: [
      { kind: 'cursor', label: 'Cursor', installed: true },
      { kind: 'chatgpt', label: 'ChatGPT' }
    ]
  });
  if (!homeHtml.includes('data-hf-act="start_new_task"') || !homeHtml.includes('开始新任务')) {
    throw new Error('checkpoint→return must still render 开始新任务');
  }
  if (!homeHtml.includes('hn-quiet-composer') || !homeHtml.includes('data-hf-collect="capture"')) {
    throw new Error('return mode must mount Quiet Composer for immediate work');
  }
  if (!homeHtml.includes('data-hn-agent-grid') || !homeHtml.includes('data-hf-handoff-kind="cursor"')) {
    throw new Error('return mode must show agent icon grid');
  }
  if (homeHtml.includes('今天想推进什么')) {
    throw new Error('return composer should keep return headline, not quiet opening copy');
  }
  // After dismiss, Quiet Composer must mount (homepage agent jump).
  const quietAfter = Object.assign({}, vm, {
    mode: 'quiet',
    primary: null,
    secondary: null,
    continuation: null,
    _returnDismissed: true
  });
  if (quietAfter.desk) quietAfter.desk = Object.assign({}, quietAfter.desk, { continueCard: null });
  const afterDismiss = HFView.renderFocus(quietAfter, {
    draftText: '',
    handoffDisabled: true,
    resumeAvailable: true,
    probeTargets: [
      { kind: 'minimax', label: 'MiniMax' },
      { kind: 'workbuddy', label: 'WorkBuddy' },
      { kind: 'cursor', label: 'Cursor' },
      { kind: 'trae', label: 'Trae Work' },
      { kind: 'traeCode', label: 'Trae Code' },
      { kind: 'qoder', label: 'Qoder' },
      { kind: 'chatgpt', label: 'ChatGPT' }
    ]
  });
  if (!afterDismiss.includes('今天想推进什么')) {
    throw new Error('start_new_task dismiss must surface Quiet Composer');
  }
  if (!afterDismiss.includes('data-hf-act="restore_return"')) {
    throw new Error('dismissed return must keep restore_return link');
  }
  if (!afterDismiss.includes('data-hn-agent-grid')) {
    throw new Error('dismissed quiet must expose agent icon grid');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="minimax"')) {
    throw new Error('dismissed quiet must expose MiniMax agent tile');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="workbuddy"')) {
    throw new Error('dismissed quiet must expose WorkBuddy agent tile');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="trae"')) {
    throw new Error('dismissed quiet must expose Trae Work agent tile');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="traeCode"')) {
    throw new Error('dismissed quiet must expose Trae Code agent tile');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="qoder"')) {
    throw new Error('dismissed quiet must expose Qoder agent tile');
  }
  if (!afterDismiss.includes('data-hf-handoff-kind="chatgpt"')) {
    throw new Error('dismissed quiet must expose ChatGPT agent tile');
  }
  // Continue / ledger UI lives on Agent → 总览; home Hero owns resume CTA.
  if (homeHtml.includes('Continue') || homeHtml.includes('Agent 台账') || homeHtml.includes('homeAgentRoster')) {
    throw new Error('home must not render Continue/ledger/Agent roster zones');
  }
  if (!homeHtml.includes('data-hf-act="resume"')) {
    throw new Error('return-mode composer must expose resume');
  }
  if (!homeHtml.includes('homePromptPrepHost') || !homeHtml.includes('homeAgentStatusHost')) {
    throw new Error('return-mode home must keep prep + status hosts');
  }
  if (/\bcheckpoint\b/i.test(vm.desk.continueCard.detail || '')) {
    throw new Error('Continue detail must not repeat the word checkpoint');
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
  if (unk.desk.projectGate) {
    throw new Error('unconfirmed+checkpoint must clear desk gate — Hero owns confirm/pick');
  }
  if (!unk.primary || (unk.primary.id !== 'confirm_project' && unk.primary.id !== 'pick_project')) {
    throw new Error('unconfirmed+checkpoint primary must be confirm/pick, got ' + (unk.primary && unk.primary.id));
  }
  if (!/确认项目以继续|选择项目以继续/.test(unk.primary.label || '')) {
    throw new Error('unconfirmed resume path label must say 以继续, got ' + unk.primary.label);
  }
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
  // Inventory ledger HTML is owned by Agent → 总览; VM projection still required.
  if (invHtml.includes('Agent 台账') || invHtml.includes('hn-ledger-group-badge') || invHtml.includes('homeAgentRoster')) {
    throw new Error('home must not render inventory ledger / Agent roster');
  }
  if (!invHtml.includes('homePromptPrepHost') || !invHtml.includes('homeAgentStatusHost')) {
    throw new Error('inventory-enriched home must keep prep + status hosts');
  }
  // Fake freshness forbidden: missing timestamp must not become 刚刚
  const idleCodex = invVm.desk.ledgerAgents.find((r) => r.title === 'Codex');
  if (idleCodex && /刚刚/.test(idleCodex.detail || '')) {
    throw new Error('idle agent without timestamp must not claim 刚刚: ' + idleCodex.detail);
  }
  if (idleCodex && (/ · $/.test(idleCodex.detail || '') || / · · /.test(idleCodex.detail || ''))) {
    throw new Error('empty when must not leave double separators: ' + idleCodex.detail);
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
  'quiet',
  'pick_project'
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

// Quiet exact project: composer opening (not long narrative hero)
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
  if (html.includes('hf-say')) throw new Error('quiet must not include say card');
  if (!html.includes('homePromptPrepHost')) throw new Error('quiet home must keep prep host');
  if (!html.includes('voice-pilot')) {
    throw new Error('quiet composer should name current project');
  }
  // filled draft enables agent tiles
  const filled = HFView.renderFocus(vm, {
    draftText: '改一下首页',
    probeTargets: [{ kind: 'cursor', label: 'Cursor', installed: true }]
  });
  if (/data-hf-act="quick_handoff"[^>]*disabled/.test(filled)) {
    throw new Error('non-empty quiet draft must enable agent tiles');
  }
  if (!filled.includes('hn-agent-tile') || filled.includes('复制并打开')) {
    throw new Error('quiet handoff must be agent tiles, not copy-open CTA');
  }
  const withMats = HFView.renderFocus(vm, {
    draftText: 'x',
    handoffAct: 'quick_handoff',
    handoffLabel: '复制并打开 Agent',
    materialSummary: {
      count: 3,
      byKind: { image: 1, file: 2 },
      manualUploadCount: 1,
      refs: [
        { id: 'm1', kind: 'image', name: 'shot.png' },
        { id: 'm2', kind: 'file', name: 'a.md' },
        { id: 'm3', kind: 'file', name: 'b.md' }
      ]
    }
  });
  if (!withMats.includes('已加入 3 项') || !withMats.includes('图片 1') || !withMats.includes('文件 2')) {
    throw new Error('quiet must render shallow material summary');
  }
  if (!withMats.includes('详情在悬浮栏')) {
    throw new Error('quiet material summary must point to Soft Pad tray');
  }
  if (withMats.includes('hn-mat-chip') || withMats.includes('shot.png')) {
    throw new Error('quiet must not duplicate tray chips on home');
  }
  if (!withMats.includes('整理') || !withMats.includes('本地图片不上传图床')) {
    throw new Error('quiet material summary must offer Prep + no-image-host hint');
  }
}

// Quiet Composer wires Prep public material API (no _model)
{
  const nowSrc = fs.readFileSync(path.join(root, 'src/js/features/now/now-home.js'), 'utf8');
  const prepCss = fs.readFileSync(path.join(root, 'src/css/now-home.css'), 'utf8');
  if (!prepCss.includes("data-hpp-surface='sheet'") && !prepCss.includes('data-hpp-surface="sheet"')) {
    throw new Error('prep sheet surface CSS missing — open_prep must float above quiet home');
  }
  if (!prepCss.includes('hpp-sheet-scrim')) {
    throw new Error('prep sheet scrim CSS missing');
  }
  const prepJs = fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8');
  if (!prepJs.includes("data-hpp-surface") || !prepJs.includes('hppSheetScrim')) {
    throw new Error('prep expand must set sheet surface + scrim');
  }
  if (!nowSrc.includes('beginMaterialCollection')) {
    throw new Error('now-home must beginMaterialCollection before quiet collect');
  }
  if (!nowSrc.includes('resetIfHandedOff')) {
    throw new Error('quiet collect must reset handed-off collections');
  }
  if (!nowSrc.includes('subscribeMaterials')) {
    throw new Error('now-home must subscribeMaterials for quiet summary');
  }
  if (nowSrc.includes('Prep._model') || nowSrc.includes('HomePromptPrep._model')) {
    throw new Error('now-home must not read Prep._model');
  }
}

// Quiet + project gate: no submit composer; keep draft summary
{
  const vm = HFAdapter.toViewModel({
    foreground: { appName: 'Cursor' },
    project: {
      id: 'p1',
      name: 'voice-pilot',
      root: 'E:/voice-pilot',
      match: 'probable',
      confirmed: false
    },
    provider: { id: 'cursor', status: 'ready' },
    work: { status: 'idle', title: '', description: '', updatedAt: 1 },
    nextAction: { title: '确认项目', kind: 'confirm_project', executable: true },
    source: { freshness: 'live', reason: 't' }
  });
  if (vm.mode !== 'quiet') throw new Error('gate fixture should stay quiet mode');
  if (!vm.primary || vm.primary.id !== 'confirm_project') {
    throw new Error('unconfirmed quiet must own project gate primary');
  }
  const html = HFView.renderFocus(vm, {
    draftPreview: '已经写好的草稿内容'
  });
  if (html.includes('data-hn-quiet-composer')) {
    throw new Error('gated quiet must not show submit composer');
  }
  if (!html.includes('data-hf-act="confirm_project"')) {
    throw new Error('gated quiet must show confirm project');
  }
  if (!html.includes('已保留你的输入')) {
    throw new Error('gated quiet must keep draft summary');
  }
}

// quick_handoff capability + clipboard_ready contract
{
  const capNone = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: 'codex' } } },
    { agents: [] }
  );
  if (capNone.kind !== 'unavailable') {
    throw new Error('no agents must resolve unavailable');
  }
  const capChoose = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: '' } } },
    {
      agents: [
        { agentId: 'kind:codex', runtimeKind: 'codex' },
        { agentId: 'kind:claude', runtimeKind: 'claude' }
      ]
    }
  );
  if (capChoose.kind !== 'choose_agent') {
    throw new Error('ambiguous/no provider must choose_agent');
  }
  const capOk = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: 'codex' } } },
    { agents: [{ agentId: 'kind:codex', runtimeKind: 'codex' }] }
  );
  if (capOk.kind !== 'clipboard_focus' || capOk.agentId !== 'kind:codex') {
    throw new Error('unique runtimeKind match must yield clipboard_focus agentId');
  }

  // Probe preferKind: MiniMax / WorkBuddy / Cursor (homepage jump)
  const capMm = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: 'cursor' } }, handoffPreferKind: 'minimax' },
    {
      agents: [
        { agentId: 'kind:cursor', runtimeKind: 'cursor' },
        { agentId: 'kind:minimax', runtimeKind: 'minimax' }
      ]
    }
  );
  if (capMm.kind !== 'clipboard_focus' || capMm.agentId !== 'kind:minimax') {
    throw new Error('handoffPreferKind minimax must win over provider cursor');
  }
  const capWb = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: 'cursor' } }, handoffPreferKind: 'workbuddy' },
    {
      agents: [
        { agentId: 'kind:cursor', runtimeKind: 'cursor' },
        { agentId: 'kind:workbuddy', runtimeKind: 'workbuddy' }
      ]
    }
  );
  if (capWb.kind !== 'clipboard_focus' || capWb.agentId !== 'kind:workbuddy') {
    throw new Error('handoffPreferKind workbuddy must resolve kind:workbuddy');
  }
  const capWbSynthetic = HFPolicy.resolveQuickHandoffTarget(
    { handoffPreferKind: 'workbuddy' },
    { agents: [] }
  );
  if (
    capWbSynthetic.kind !== 'clipboard_focus' ||
    capWbSynthetic.agentId !== 'kind:workbuddy'
  ) {
    throw new Error('probe workbuddy must synthesize kind:workbuddy when absent from snapshot');
  }
  const capCursorAlias = HFPolicy.resolveQuickHandoffTarget(
    { dto: { provider: { id: 'cursor-chat' } } },
    { agents: [{ agentId: 'kind:cursor', runtimeKind: 'cursor' }] }
  );
  if (capCursorAlias.kind !== 'clipboard_focus' || capCursorAlias.agentId !== 'kind:cursor') {
    throw new Error('cursor-chat alias must resolve to kind:cursor');
  }
  if (HFPolicy.handoffLabelForCap(capMm) !== '复制并打开 MiniMax') {
    throw new Error('MiniMax handoff label must name MiniMax');
  }
  if (HFPolicy.handoffLabelForCap(capWb) !== '复制并打开 WorkBuddy') {
    throw new Error('WorkBuddy handoff label must name WorkBuddy');
  }

  const probeHtml = HFView.renderFocus(
    HFAdapter.toViewModel({
      work: { status: 'idle' },
      project: { confirmed: true, name: 'voice-pilot' },
      provider: { id: 'cursor' }
    }),
    {
      draftText: '改首页',
      probeTargets: [
        { kind: 'minimax', label: 'MiniMax', icon: 'icons/app-target/minimaxcode.png' },
        { kind: 'workbuddy', label: 'WorkBuddy' },
        { kind: 'cursor', label: 'Cursor', installed: true },
        { kind: 'claude', label: 'Claude', channel: 'cli', installed: true },
        { kind: 'trae', label: 'Trae Work' },
        { kind: 'traeCode', label: 'Trae Code' },
        { kind: 'qoder', label: 'Qoder' },
        { kind: 'chatgpt', label: 'ChatGPT' }
      ]
    }
  );
  if (!probeHtml.includes('data-hn-agent-grid')) {
    throw new Error('quiet composer must expose agent icon grid');
  }
  if (!probeHtml.includes('悬浮栏') || !probeHtml.includes('粘贴')) {
    throw new Error('agent grid must explain tray paste into input');
  }
  for (const kind of [
    'cursor',
    'claude',
    'minimax',
    'workbuddy',
    'trae',
    'traeCode',
    'qoder',
    'chatgpt'
  ]) {
    if (!probeHtml.includes('data-hf-handoff-kind="' + kind + '"')) {
      throw new Error('quiet composer must expose ' + kind + ' agent tile');
    }
  }
  if (!probeHtml.includes('hn-agent-tile__tag') || !probeHtml.includes('CLI')) {
    throw new Error('CLI agents must show CLI tag on tiles');
  }
  if (probeHtml.includes('跳转 ') || probeHtml.includes('复制并打开 Cursor')) {
    throw new Error('agent tiles replace text handoff / 跳转 labels');
  }
  const probeCtas = (probeHtml.match(/class="hn-cta[^"]*"/g) || []).length;
  if (probeCtas !== 0) {
    throw new Error('quiet agent tiles replace the primary handoff CTA');
  }

  let focused = false;
  let focusedId = '';
  let lastPasteClipboard = null;
  function centerArgs(payload) {
    return (payload && payload.args) || payload || {};
  }
  ctx.OneToneIpc = {
    invoke(cmd, payload) {
      const args = centerArgs(payload);
      if (cmd === 'cmd_agent_center_action' && args.actionId === 'agent.focus') {
        if (!payload || !payload.args) {
          throw new Error('cmd_agent_center_action must nest { args: { actionId, agentId } }');
        }
        // Non-Cursor probes: open-only (pasteClipboard false/absent). Cursor keeps true.
        lastPasteClipboard = !!args.pasteClipboard;
        focused = true;
        focusedId = String(args.agentId || '');
        return Promise.resolve({
          ok: true,
          outcome: 'verified',
          detail: lastPasteClipboard ? 'composer_pasted:cursor-chat' : 'window_focused'
        });
      }
      if (cmd === 'cmd_tray_snapshot_publish' || cmd === 'cmd_tray_carry_dismiss') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    }
  };
  const handoffVm = {
    mode: 'quiet',
    dto: { provider: { id: 'codex' }, work: { status: 'idle' } }
  };
  const handoffToasts = [];
  const result = await HFPolicy.execute('quick_handoff', handoffVm, {
    getDraftText: () => '改首页',
    getAgentSnapshot: () => ({
      agents: [{ agentId: 'kind:codex', runtimeKind: 'codex' }]
    }),
    toast(msg) {
      handoffToasts.push(String(msg || ''));
    }
  });
  if (result.outcome !== 'clipboard_ready') {
    throw new Error('quick_handoff must return clipboard_ready');
  }
  if (!focused) throw new Error('quick_handoff must attempt agent.focus');
  if (lastPasteClipboard) {
    throw new Error('non-Cursor probe must be open-only (no pasteClipboard)');
  }
  if (!/下方「粘贴」|粘贴/.test(String(result.message || ''))) {
    throw new Error('open-only handoff toast must mention paste assist');
  }
  if (!handoffToasts.some((t) => /已就绪|正在打开|已打开/.test(t) && /粘贴|下方/.test(t))) {
    throw new Error('open-only handoff must toast paste hint before/after focus');
  }
  if (result.lifecycleCreated) {
    throw new Error('clipboard_ready must not claim lifecycleCreated');
  }
  if (handoffVm.dto.work.status !== 'idle') {
    throw new Error('quick_handoff must not mutate work.status');
  }

  focused = false;
  focusedId = '';
  lastPasteClipboard = null;
  const mmResult = await HFPolicy.execute(
    'quick_handoff',
    {
      mode: 'quiet',
      dto: { provider: { id: 'cursor' }, work: { status: 'idle' } },
      handoffPreferKind: 'minimax'
    },
    {
      preferKind: 'minimax',
      getDraftText: () => '试 MiniMax',
      getAgentSnapshot: () => ({
        agents: [
          { agentId: 'kind:cursor', runtimeKind: 'cursor' },
          { agentId: 'kind:minimax', runtimeKind: 'minimax' }
        ]
      }),
      toast() {}
    }
  );
  if (mmResult.outcome !== 'clipboard_ready' || focusedId !== 'kind:minimax') {
    throw new Error('preferKind minimax must focus kind:minimax');
  }
  if (lastPasteClipboard) {
    throw new Error('MiniMax must be open-only');
  }
  if (!String(mmResult.message || '').includes('MiniMax')) {
    throw new Error('MiniMax handoff toast must name MiniMax');
  }

  focused = false;
  focusedId = '';
  lastPasteClipboard = null;
  const wbResult = await HFPolicy.execute(
    'quick_handoff',
    {
      mode: 'quiet',
      dto: { provider: { id: 'cursor' }, work: { status: 'idle' } },
      handoffPreferKind: 'workbuddy'
    },
    {
      preferKind: 'workbuddy',
      getDraftText: () => '试 WorkBuddy',
      getAgentSnapshot: () => ({ agents: [] }),
      toast() {}
    }
  );
  if (wbResult.outcome !== 'clipboard_ready' || focusedId !== 'kind:workbuddy') {
    throw new Error('preferKind workbuddy must focus kind:workbuddy (synthetic)');
  }
  if (lastPasteClipboard) {
    throw new Error('WorkBuddy must be open-only');
  }
  if (!String(wbResult.message || '').includes('WorkBuddy')) {
    throw new Error('WorkBuddy handoff toast must name WorkBuddy');
  }

  // Cursor keeps pasteClipboard; composer UIA miss still counts as opened.
  focused = false;
  focusedId = '';
  lastPasteClipboard = null;
  ctx.OneToneIpc = {
    invoke(cmd, payload) {
      const args = centerArgs(payload);
      if (cmd === 'cmd_agent_center_action' && args.actionId === 'agent.focus') {
        if (!payload || !payload.args || !args.pasteClipboard) {
          throw new Error('Cursor handoff must nest args with pasteClipboard:true');
        }
        lastPasteClipboard = true;
        focusedId = String(args.agentId || '');
        focused = true;
        return Promise.resolve({
          ok: true,
          outcome: 'attemptedUnverified',
          detail: 'composer_focus_failed:cursor-chat:handoff_input_not_found:paste=false'
        });
      }
      if (cmd === 'cmd_tray_snapshot_publish' || cmd === 'cmd_tray_carry_dismiss') {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: true });
    }
  };
  const miss = await HFPolicy.execute(
    'quick_handoff',
    { mode: 'quiet', dto: { provider: { id: 'cursor' }, work: { status: 'idle' } } },
    {
      getDraftText: () => '试 Cursor',
      getAgentSnapshot: () => ({
        agents: [{ agentId: 'kind:cursor', runtimeKind: 'cursor' }]
      }),
      toast() {}
    }
  );
  if (miss.outcome !== 'clipboard_ready' || !miss.focused) {
    throw new Error('composer miss attempted must still report focused');
  }
  if (!/输入框|下方「粘贴」|Ctrl\+V/.test(String(miss.message || ''))) {
    throw new Error('composer miss toast must ask user to click input and paste');
  }
  if (focusedId !== 'kind:cursor') {
    throw new Error('composer miss path must still target kind:cursor');
  }
  if (!lastPasteClipboard) {
    throw new Error('Cursor regression must keep pasteClipboard');
  }

  // force clipboard failure
  const prevWrite = ctx.navigator.clipboard.writeText;
  ctx.navigator.clipboard.writeText = () => Promise.reject(new Error('clipboard_failed'));
  const failed = await HFPolicy.execute('quick_handoff', handoffVm, {
    getDraftText: () => 'x',
    getAgentSnapshot: () => ({
      agents: [{ agentId: 'kind:codex', runtimeKind: 'codex' }]
    }),
    toast() {}
  });
  ctx.navigator.clipboard.writeText = prevWrite;
  if (failed.outcome !== 'failed') {
    throw new Error('clipboard write failure must return failed');
  }
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
const openProgressHook = homeSrc.match(/openProgress:\s*function\s*\(\)\s*\{[\s\S]*?\n\s*\},/);
if (!openProgressHook || !openProgressHook[0].includes('OneToneAgentNavTarget')) {
  throw new Error('view_progress must route the coarse Hero CTA to Agent overview');
}
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
