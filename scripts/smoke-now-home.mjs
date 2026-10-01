/**
 * Smoke: Now home — 当前情景驾驶舱（fixtures only）。
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
  location: { search: '' }
};
ctx.globalThis = ctx;
ctx.window = ctx;

for (const f of ['fixtures.js', 'now-model.js', 'now-today.js', 'now-home-ui.js', 'now-home.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx);
}

const m = ctx.OneToneNowModel;
const fx = ctx.OneToneNowFixtures;
const ui = ctx.OneToneNowHomeUi;

const live = fx.cloneState('s1');
const snap = m.projectNowHome(live);
if (!snap.active || snap.active.id !== 'create') throw new Error('expected create active');
if (!snap.habits.some((h) => h.id === 'meet' && h.maybe)) throw new Error('expected meet suggested');
if (snap.active.description !== '正在电脑前工作') throw new Error('create description');
if (!snap.active.helping.includes('减少消息打扰')) throw new Error('helping result copy');

const next = m.activateHabit(live, 'away');
const away = m.projectNowHome(next);
if (!away.active || away.active.id !== 'away') throw new Error('activate away failed');

const html = ui.renderNowView({ snapshot: away, needsExpanded: false, adjustOpen: false });
if (!html.includes('当前情景')) throw new Error('missing 当前情景');
if (!html.includes('我的情景')) throw new Error('missing 我的情景');
if (!html.includes('data-now-adjust')) throw new Error('missing adjust control');
if (!html.includes('离开电脑') || !html.includes('需要决定')) throw new Error('now view missing');

const adjusted = ui.renderNowView({ snapshot: away, needsExpanded: false, adjustOpen: true });
if (!adjusted.includes('data-now-adjust-done')) throw new Error('missing adjust done');
if (!adjusted.includes('微调这个情景')) throw new Error('missing adjust mode');
if (!adjusted.includes('data-now-op=')) throw new Error('missing action toggles');

const wait = fx.cloneState('sWait');
const waitSnap = m.projectNowHome(wait);
const capped = ui.renderNowView({ snapshot: waitSnap, needsExpanded: false });
if (!capped.includes('查看全部')) throw new Error('needsYou cap missing');

const scenes = ui.renderScenesView({ snapshot: away });
if (!scenes.includes('结果开关') || !scenes.includes('何时进入')) throw new Error('scenes view missing');

// Phase 2: projectFromRuntime empty + active + assists
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
if (!rtHtml.includes('data-now-adjust')) throw new Error('runtime should show adjust with assists');

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

// legacy Chinese labels migrate to ids on read
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

// suggested + needsYou from attention / meeting FG
const withCtx = m.projectFromRuntime(rtPayload, mappings, {
  attention: { waitingKinds: ['codex'], rows: [{ state: 'needsInput', agent: 'codex' }] },
  identity: { exeName: 'Zoom.exe', fullPath: 'C:\\Zoom\\Zoom.exe' }
});
if (!withCtx.needsYou.some((n) => n.id === 'view_reply')) {
  throw new Error('waiting should project needsYou');
}
const meetMap = mappings.find((x) => x.id === 'habit-b');
meetMap.group = '会议中';
const sug = m.projectFromRuntime(
  rtPayload,
  mappings,
  { attention: {}, identity: { exeName: 'Teams.exe' } }
);
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

// Empty CTA: recommended bootstrap + self-build
if (!emptyHtml.includes('data-now-bootstrap="recommended"')) {
  throw new Error('empty state missing recommended bootstrap CTA');
}
if (!emptyHtml.includes('用推荐情景开始')) {
  throw new Error('empty state missing recommended CTA copy');
}
if (!emptyHtml.includes('data-now-scenes="new"') || !emptyHtml.includes('自己建')) {
  throw new Error('empty state missing self-build CTA');
}

// bootstrapRecommendedHabit: universal「创作中」+ assists IDs + essentials
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
if (
  !Array.isArray(bm.assists) ||
  bm.assists.join(',') !== 'focus,quiet,protect'
) {
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

// Today timeline from action history (evidence, not promises)
const todayApi = ctx.OneToneNowToday;
if (!todayApi || !todayApi.loadToday) throw new Error('OneToneNowToday missing');
if (todayApi.CHANNEL_ICON.camera !== '👁' || todayApi.CHANNEL_ICON.voice !== '🎤') {
  throw new Error('channel icons missing');
}

ctx.OneToneIpc = {
  invoke(cmd, args) {
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
          channel: 'camera',
          actionId: 'privacy.screen',
          status: 'executed',
          summary: '摄像头 · 保护隐私 · 关闭遮罩'
        },
        {
          id: 3,
          tsMs: Date.UTC(2026, 9, 1, 10, 0),
          channel: 'voice',
          actionId: 'onetone.resume',
          status: 'executed',
          summary: '语音 · 恢复工作现场'
        },
        {
          id: 4,
          tsMs: Date.UTC(2026, 9, 1, 11, 0),
          channel: 'softPad',
          actionId: 'input.start',
          status: 'executed',
          summary: 'SoftPad · 开始说话'
        },
        {
          id: 5,
          tsMs: Date.UTC(2026, 9, 1, 12, 0),
          channel: 'system',
          status: 'failed',
          summary: '系统 · 应被过滤'
        },
        {
          id: 6,
          tsMs: Date.UTC(2026, 9, 1, 13, 0),
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
if (todayRows.length !== 5) throw new Error('today should keep executed+pending only');
if (todayRows.some((r) => r.text === '系统 · 应被过滤')) {
  throw new Error('failed entries must not appear');
}
if (!todayRows.some((r) => r.src === '⌨️') || !todayRows.some((r) => r.src === '👁')) {
  throw new Error('channel icons should map onto rows');
}
const buckets = todayApi.summarizeBuckets(todayRows);
if (buckets.total !== todayRows.length) throw new Error('bucket total mismatch');
if (
  buckets.interrupt + buckets.restore + buckets.privacy + buckets.status !==
  buckets.total
) {
  throw new Error('four buckets must sum to total');
}
if (buckets.interrupt < 1 || buckets.privacy < 1 || buckets.restore < 1) {
  throw new Error('expected interrupt/privacy/restore from mock action ids');
}

const emptyToday = ui.renderNowView({
  snapshot: Object.assign({}, away, { today: [] }),
  needsExpanded: false
});
if (!emptyToday.includes('今天还没有记录')) throw new Error('empty today copy missing');
if (!emptyToday.includes('OneTone 正在帮你')) {
  throw new Error('empty today should fall back to helping promises');
}

const withToday = ui.renderNowView({
  snapshot: Object.assign({}, away, { today: todayRows }),
  needsExpanded: false
});
if (!withToday.includes('它今天为你做了什么')) throw new Error('today section missing');
if (!withToday.includes('按键 · 创作中 · 打断')) {
  throw new Error('today must show IPC summary verbatim');
}
if (withToday.includes('OneTone 正在帮你')) {
  throw new Error('helping promises must hide when today has evidence');
}
if (!withToday.includes('减少打断') || !withToday.includes('保护隐私')) {
  throw new Error('today KPIs missing');
}

// Permission cause → approve_rm CTA
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
const approveHtml = ui.renderNowView({ snapshot: approveSnap });
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
if (cleared.length !== 0) throw new Error('cleared history must yield empty today');

console.log('smoke-now-home: ok');
