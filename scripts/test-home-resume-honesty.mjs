'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var adapterSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-focus-adapter.js'),
  'utf8'
);
var viewSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-focus-view.js'),
  'utf8'
);
var css = fs.readFileSync(path.join(root, 'src/css/now-home.css'), 'utf8');
var rust = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_memory/home_focus.rs'),
  'utf8'
);

assert.ok(adapterSrc.includes('RESUME_MAX_AGE_MS'), 'FE age gate');
assert.ok(adapterSrc.includes('isResumeCtaLabel'), 'FE CTA filter');
assert.ok(adapterSrc.includes('usableResumeStep'), 'FE usable step');
assert.ok(adapterSrc.includes('resumeAssistance'), 'FE precise resume stats');
assert.ok(adapterSrc.includes('再做一件相关的事'), 'filters known false step');
assert.ok(adapterSrc.includes('继续[：:]'), 'FE unwraps 继续：「…」 resume shell');
assert.ok(rust.includes('RESUME_MAX_AGE_MS'), 'Rust age gate');
assert.ok(rust.includes('is_resume_cta_label'), 'Rust CTA filter');
assert.ok(
  rust.includes('latest_non_atr_checkpoint_for_project') &&
    rust.includes('cursor_checkpoint'),
  'Rust keeps ATR checkpoint off Cursor resume path'
);
assert.ok(
  rust.includes('read_best_cursor_session') &&
    /WHERE project_id = \?1 AND provider = \?2/.test(rust),
  'Cursor lane must not pick ATR as best session'
);
assert.ok(adapterSrc.includes("'当前工作'"), 'FE filters 当前工作 placeholder');
assert.ok(viewSrc.includes('hn-intent') || viewSrc.includes('set_intent'), 'chrome has intent switch');
assert.ok(viewSrc.includes('onetone_atr') && viewSrc.includes('本机工作'), 'ATR card must not show as Cursor');
assert.ok(!/var where = project \? '现在 · ' \+ project/.test(viewSrc), 'no 现在 · prefix');
assert.ok(css.includes('hn-chrome--proto') || css.includes('hn-intent'), 'proto chrome styles');

var sandbox = { window: {}, console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(adapterSrc, sandbox);
vm.runInNewContext(viewSrc, sandbox);
var A = sandbox.OneToneHomeFocusAdapter;
var HFView = sandbox.OneToneHomeFocusView;
assert.ok(A && A.toViewModel && A.enrichFromHomeSnapshot, 'adapter exports');
assert.ok(HFView && HFView.taskCardHtml, 'view exports taskCardHtml');

var now = Date.now();
var base = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: { status: 'idle', title: '', description: '', updatedAt: now },
  provider: { id: 'codex', status: 'idle' },
  source: { freshness: 'cached', reason: 'test' }
});
assert.strictEqual(base.mode, 'quiet', 'idle → quiet');

var ctaHome = {
  checkpoint: {
    sessionId: 's1',
    currentTask: '再做一件相关的事',
    nextAction: '从上次进度继续',
    updatedAt: now - 60_000
  },
  recentSessions: [{ sessionId: 's1', provider: 'codex', updatedAt: now - 60_000 }]
};
var ctaVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  ctaHome
);
assert.notStrictEqual(ctaVm.mode, 'return', 'CTA-only checkpoint must not force return');
assert.ok(
  !String(ctaVm.headline || '').includes('再做一件相关的事'),
  'headline must not quote CTA label'
);

var realHome = {
  checkpoint: {
    sessionId: 's2',
    currentTask: '修首页顶栏截断',
    nextAction: '继续：「修首页顶栏截断」',
    updatedAt: now - 3_600_000
  },
  recentSessions: [
    {
      sessionId: 's2',
      provider: 'codex',
      updatedAt: now - 3_600_000,
      matchConfidence: 0.92
    }
  ]
};
var realVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  realHome
);
assert.strictEqual(realVm.mode, 'return', 'fresh real step → return');
assert.ok(
  String(realVm.headline).includes('修首页顶栏截断'),
  'headline uses real step'
);
assert.ok(
  /有进度|可恢复进度/.test(String(realVm.assistance)),
  'assistance has human age fact'
);
assert.ok(
  String(realVm.assistance).includes('继续'),
  'assistance invites continue'
);
assert.ok(
  !/\bcheckpoint\b|probe\s*=/i.test(String(realVm.assistance)),
  'card assistance must not show checkpoint/probe jargon'
);

var staleHome = {
  checkpoint: {
    sessionId: 's3',
    currentTask: '很久以前的任务',
    updatedAt: now - 8 * 24 * 60 * 60 * 1000
  },
  recentSessions: [{ sessionId: 's3', provider: 'codex', updatedAt: now - 8 * 24 * 60 * 60 * 1000 }]
};
var staleVm = A.enrichFromHomeSnapshot(
  JSON.parse(JSON.stringify(base)),
  staleHome
);
assert.notStrictEqual(staleVm.mode, 'return', 'stale checkpoint must not force return');
assert.ok(!staleVm.desk || !staleVm.desk.continueCard, 'stale checkpoint skips continue card');

// ATR checkpoint must not be labeled as Cursor (FG Soft Pad).
var atrDto = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: '最近修改了什么代码？',
    description: '可以继续或放弃。',
    updatedAt: now - 120_000
  },
  provider: { id: 'onetone_atr', status: 'ready' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: { freshness: 'live', reason: 'probe=ready;atr_checkpoint;interrupted' }
});
assert.strictEqual(atrDto.mode, 'return', 'ATR resumable → return');
assert.ok(
  String(atrDto.headline).includes('最近修改了什么代码？'),
  'ATR headline keeps goal'
);
assert.ok(
  !/Cursor/.test(String(atrDto.headline)),
  'ATR headline must not say Cursor, got: ' + atrDto.headline
);
assert.ok(
  rust.includes('PROVIDER_ONETONE_ATR') && rust.includes('atr_owns'),
  'Rust sets ATR provider when atr owns work'
);

var atrMislabel = A.enrichFromHomeSnapshot(
  A.toViewModel({
    foreground: { appName: 'Cursor', appId: 'cursor' },
    project: {
      id: 'p1',
      name: 'voice-pilot',
      root: 'E:\\\\voice-pilot',
      match: 'exact',
      confirmed: true
    },
    work: { status: 'idle', title: '', description: '', updatedAt: now },
    provider: { id: 'cursor', status: 'ready' },
    source: { freshness: 'cached', reason: 'probe=ready;atr_checkpoint;interrupted' }
  }),
  {
    checkpoint: {
      sessionId: 'atr-sess',
      provider: 'onetone_atr',
      currentTask: '今天改动了什么文件？',
      updatedAt: now - 60_000
    },
    recentSessions: [
      { sessionId: 'atr-sess', provider: 'onetone_atr', updatedAt: now - 60_000 }
    ],
    provider: { id: 'cursor' },
    source: { reason: 'probe=ready;atr_checkpoint;interrupted' }
  }
);
assert.strictEqual(atrMislabel.mode, 'return', 'ATR enrich → return');
assert.ok(
  !/Cursor/.test(String(atrMislabel.headline)),
  'enriched ATR must not say Cursor, got: ' + atrMislabel.headline
);
assert.ok(
  atrMislabel.desk &&
    atrMislabel.desk.continueCard &&
    atrMislabel.desk.continueCard.badge !== 'Cursor',
  'continue badge must not be Cursor'
);

// Placeholder「当前工作」is nonsense — no return Hero.
var emptyShell = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: '当前工作',
    description: '已保存上次进度。',
    updatedAt: now - 8 * 60_000
  },
  provider: { id: 'cursor', status: 'ready' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: { freshness: 'live', reason: 'probe=ready;resumable' }
});
assert.notStrictEqual(emptyShell.mode, 'return', '当前工作 must not force return');
assert.ok(
  !String(emptyShell.headline || '').includes('当前工作'),
  'headline must not quote 当前工作'
);

// Unwrap next_action shell + trailing colon — do not quote「继续：『…』」as the step.
var shellDto = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: '继续：「修首页顶栏截断」',
    description: '最近修改了什么代码？：',
    updatedAt: now - 120_000
  },
  provider: { id: 'cursor', status: 'ready' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: { freshness: 'live', reason: 'probe=ready;resumable' }
});
assert.strictEqual(shellDto.mode, 'return', 'wrapped title still resumable');
assert.ok(
  String(shellDto.headline).includes('修首页顶栏截断'),
  'headline unwraps 继续 shell, got: ' + shellDto.headline
);
assert.ok(
  !/继续/.test(String(shellDto.headline)),
  'headline must not keep 继续 wrapper, got: ' + shellDto.headline
);

// Running with placeholder title — quote project, never「当前工作」.
var runShell = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'running',
    title: '当前工作',
    description: '正在处理中。',
    updatedAt: now - 5_000
  },
  provider: { id: 'cursor', status: 'ready' },
  source: { freshness: 'live', reason: 'probe=ready;running' }
});
assert.strictEqual(runShell.mode, 'running', 'running stays running');
assert.ok(
  !String(runShell.headline || '').includes('当前工作'),
  'running headline must not quote 当前工作, got: ' + runShell.headline
);
assert.ok(
  String(runShell.headline).includes('voice-pilot') ||
    String(runShell.headline).includes('正在处理中'),
  'running uses project or plain 正在处理中, got: ' + runShell.headline
);

// Resumable with project-name-as-title is nonsense — never「停在 voice-pilot」.
var projAsStep = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: 'voice-pilot',
    description: '开启 Cursor 活动后，可读到具体停在哪一步。',
    updatedAt: now - 47 * 60_000
  },
  provider: { id: 'cursor', status: 'ready' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: {
    freshness: 'live',
    reason: 'probe=ready;resumable_no_step;consent=off'
  }
});
assert.notStrictEqual(projAsStep.mode, 'return', 'project-name step must not be return');
assert.ok(
  !/停在「?voice-pilot」?/.test(String(projAsStep.headline || '')),
  'must not say 停在 voice-pilot, got: ' + projAsStep.headline
);
assert.ok(
  projAsStep.primary && projAsStep.primary.id === 'enable_cursor_activity',
  'consent-off empty step → enable Cursor activity CTA'
);
assert.ok(rust.includes('resumable_no_step'), 'Rust honest empty step path');
var cursorAdapter = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_memory/cursor_adapter.rs'),
  'utf8'
);
assert.ok(
  cursorAdapter.includes('bubble_text_snippet') &&
    cursorAdapter.includes('improve_session_step_title'),
  'discover lifts user bubble into session title'
);
assert.ok(
  fs
    .readFileSync(path.join(root, 'src/js/features/now/now-home.js'), 'utf8')
    .includes("kind === 'enable_cursor_activity'"),
  'home handles enable_cursor_activity'
);

// Cursor task card fuses one local-activity line; under-compose stays all-agent status.
assert.ok(
  typeof A.cursorLocalFromUsage === 'function' && typeof A.enrichWithCursorLocal === 'function',
  'adapter exports Cursor local helpers'
);
var localReady = A.cursorLocalFromUsage({
  status: 'ready',
  source: 'cursor_local_activity',
  confidence: 'local_only',
  localTodayRequests: 12,
  localTodaySessions: 3,
  localTodayActiveMs: 90 * 60_000,
  localYesterdayRequests: 10
});
assert.ok(localReady && localReady.ready, 'ready usage → ready strip');
assert.ok(/今日 12 次/.test(localReady.line) && /3 会话/.test(localReady.line), localReady.line);
var localOff = A.cursorLocalFromUsage({
  status: 'consent_off',
  message: '未启用 · 不会读取本机 Cursor 使用记录'
});
assert.ok(localOff && localOff.enableCta && !localOff.ready, 'consent_off → enable CTA');
var localBusy = A.cursorLocalFromUsage({
  status: 'unavailable',
  source: 'cursor_local_activity',
  message: 'Cursor 本地统计暂时读不到（库正忙），稍后自动重试'
});
assert.ok(
  localBusy && !localBusy.enableCta && localBusy.state === 'busy',
  '库正忙 must not show dead 开启 CTA'
);
var localBusySt = A.cursorLocalFromUsage({
  status: 'busy',
  message: 'Cursor 本地统计暂时读不到（库正忙），稍后自动重试'
});
assert.ok(localBusySt && !localBusySt.enableCta, 'status=busy → no enable CTA');
var localBusyTotals = A.cursorLocalFromUsage({
  status: 'busy',
  source: 'cursor_local_activity',
  localTodayRequests: 12,
  localTodaySessions: 3,
  message: '今日 12 次 · 刷新暂缓（库忙）'
});
assert.ok(
  localBusyTotals &&
    localBusyTotals.state === 'busy' &&
    !localBusyTotals.enableCta &&
    /今日 12 次/.test(localBusyTotals.line) &&
    /刷新暂缓/.test(localBusyTotals.line),
  'busy with prior totals keeps strip KPIs'
);
var localSchema = A.cursorLocalFromUsage({
  status: 'schema_unknown',
  message: 'Cursor 本地库结构暂时无法识别，稍后重试'
});
assert.ok(
  localSchema && localSchema.state === 'schema_unknown' && !localSchema.enableCta,
  'schema_unknown ≠ busy and no enable CTA'
);
var localVm = A.enrichWithCursorLocal(
  {
    mode: 'return',
    appName: 'Cursor',
    dto: { provider: { id: 'cursor' } },
    assistance: '可以从停下的地方继续。',
    headline: '上次停在「修状态卡假执行中」。'
  },
  {
    status: 'ready',
    source: 'cursor_local_activity',
    confidence: 'local_only',
    localTodayRequests: 4,
    localTodaySessions: 1,
    localTodayActiveMs: 0
  }
);
assert.ok(localVm.cursorLocal && localVm.cursorLocal.ready, 'enrich attaches cursorLocal');
var localCard = HFView.taskCardHtml(localVm);
assert.ok(
  localCard.includes('data-hn-cursor-local="ready"') && localCard.includes('今日 4 次'),
  'Cursor task card shows fused local strip'
);
assert.ok(
  /agent === 'Cursor' \? cursorLocalHtml\(vm\)/.test(viewSrc),
  'local strip only on Cursor task card'
);
assert.ok(
  !/idleInviteHtml\([^\)]*cursorLocal/.test(viewSrc),
  'invite call site must not pass cursorLocal'
);
assert.ok(
  fs
    .readFileSync(path.join(root, 'src/js/features/now/now-home.js'), 'utf8')
    .includes('scheduleCursorLocalUsageRefresh'),
  'home fetches Cursor local usage for the strip'
);
assert.ok(css.includes('hn-task-card__local'), 'CSS styles local strip');

var stripSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-agent-status-strip.js'),
  'utf8'
);
assert.ok(!/当前无需操作/.test(stripSrc), 'strip drops 当前无需操作 fluff');
assert.ok(!/\|\| '当前项目'/.test(stripSrc), 'strip must not fall back to 当前项目');
assert.ok(
  rust.includes('Never invent') || !/unwrap_or_else\(\|\| "当前工作"\.into\(\)\)/.test(rust),
  'Rust must not invent 当前工作 title_default'
);

// Probe unavailable must not clobber a real running Hero into「失败」.
var runUnavailable = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'running',
    title: '',
    description: '正在处理中。',
    updatedAt: now - 5_000
  },
  provider: { id: 'cursor', status: 'unavailable' },
  source: { freshness: 'stale', reason: 'probe=read_error;running' }
});
assert.strictEqual(
  runUnavailable.mode,
  'running',
  'running + provider unavailable stays running, got: ' + runUnavailable.mode
);
assert.ok(
  runUnavailable.presence &&
    /探针|连不上|未开启/.test(String(runUnavailable.presence.note || '')),
  'unavailable becomes presence footnote, got: ' +
    (runUnavailable.presence && runUnavailable.presence.note)
);

// Resumable no-step + consent on → Quiet (no「等你决定」废话卡), not degraded.
var noStepUnavailable = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'resumable',
    title: '',
    description: '已有进度，但还没读到具体步骤。',
    updatedAt: now - 14 * 60_000
  },
  provider: { id: 'cursor', status: 'unavailable' },
  nextAction: { title: '继续上次工作', kind: 'resume', executable: true },
  source: {
    freshness: 'stale',
    reason: 'probe=read_error;resumable_no_step;consent=on'
  }
});
assert.notStrictEqual(
  noStepUnavailable.mode,
  'degraded',
  'no-step + unavailable must not be degraded/失败'
);
assert.strictEqual(
  noStepUnavailable.mode,
  'quiet',
  'no-step + consent on collapses to quiet, got: ' + noStepUnavailable.mode
);
assert.ok(!noStepUnavailable.primary, 'quiet empty-step has no Hero CTA');
assert.ok(
  !(noStepUnavailable.assistance || '').includes('探针暂时连不上'),
  'probe note must not spam assistance copy'
);

// Soft Pad Complete must surface as completed Hero — not silent quiet.
var justDone = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: {
    status: 'completed',
    title: '',
    description: '刚刚完成。',
    updatedAt: now - 5_000
  },
  provider: { id: 'cursor', status: 'ready' },
  source: { freshness: 'live', reason: 'probe=ready;attn_complete' }
});
assert.strictEqual(
  justDone.mode,
  'completed',
  'completed work must be completed Hero, got: ' + justDone.mode
);
assert.ok(/刚刚完成/.test(String(justDone.headline || '')), 'completed headline');
assert.ok(
  viewSrc.includes("mode === 'completed'") || viewSrc.includes("'刚刚完成'"),
  'view paints completed pill'
);

// Soft Pad Working row lifts quiet Hero to running.
assert.ok(A.enrichFromAttention, 'enrichFromAttention export');
var quietVm = A.toViewModel({
  foreground: { appName: 'Cursor', appId: 'cursor' },
  project: {
    id: 'p1',
    name: 'voice-pilot',
    root: 'E:\\\\voice-pilot',
    match: 'exact',
    confirmed: true
  },
  work: { status: 'idle', title: '', description: '', updatedAt: now },
  provider: { id: 'cursor', status: 'ready' },
  source: { freshness: 'cached', reason: 'test' }
});
assert.strictEqual(quietVm.mode, 'quiet');
var lifted = A.enrichFromAttention(quietVm, {
  rows: [
    {
      agent: 'cursor',
      state: 'working',
      observedAtMs: now - 3_000,
      sessionId: 'c1'
    }
  ]
});
assert.strictEqual(
  lifted.mode,
  'running',
  'attention Working lifts quiet → running, got: ' + lifted.mode
);
assert.ok(
  lifted.primary && lifted.primary.id === 'view_progress',
  'lifted running CTA is view_progress'
);
assert.ok(
  lifted.desk && lifted.desk.living,
  'Working row still fills desk.living'
);

assert.ok(
  rust.includes('resumable_no_step_quiet') || rust.includes('resumable_no_step;consent=off'),
  'Rust suppresses empty-step Hero when consent on'
);
var nowHomeSrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/now-home.js'),
  'utf8'
);
assert.ok(
  /isReturnDismissed\(vm\)[\s\S]{0,120}mode === 'attention'/.test(nowHomeSrc),
  'start_new_task dismiss forces quiet for attention empty-step'
);
assert.ok(
  /kind === 'resume'[\s\S]{0,400}openPanel|SoftPadHub/.test(nowHomeSrc),
  'resume opens Soft Pad so Cursor continue is not a silent DB write'
);
assert.ok(
  /kind === 'resume'[\s\S]{0,500}dismissReturnFor/.test(nowHomeSrc),
  'soft resume dismisses empty-step attention Hero'
);
assert.ok(
  /checkpoint_surfaced/.test(rust) ||
    fs
      .readFileSync(path.join(root, 'src-tauri/src/agent_memory/checkpoint.rs'), 'utf8')
      .includes('checkpoint_surfaced'),
  'Cursor soft resume must not lifecycle task_resumed (fake 执行中)'
);
var policySrc = fs.readFileSync(
  path.join(root, 'src/js/features/now/home-action-policy.js'),
  'utf8'
);
assert.ok(
  policySrc.includes('continueCard') && policySrc.includes('wrapResume'),
  'resume resolves sessionId from continueCard and returns brief'
);

console.log('home-resume-honesty tests passed');
