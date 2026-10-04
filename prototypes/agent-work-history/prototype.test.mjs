/**
 * Acceptance: four peer tabs + left preview / right panel.
 * Run: node --test prototypes/agent-work-history/prototype.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const pulseSrc = path.join(dir, '../../src/js/features/agent/agent-home-pulse.js');

function load() {
  const ctx = { window: {}, globalThis: null };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(pulseSrc, 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'shared.js'), 'utf8'), ctx);
  return {
    R: ctx.OneToneAgentWorkHistory,
    Pulse: ctx.OneToneAgentHomePulse
  };
}

test('four peer tabs: work float mini softPad', () => {
  const { R } = load();
  assert.equal(R.surfaces.join(','), 'work,float,mini,softPad');
  const html = R.renderPage({ variant: 'timeline', mode: 'quiet', surface: 'work' });
  assert.ok(html.includes('surface-tabs--4') || html.includes('四个标签') || html.includes('data-surface="float"'));
  for (const id of R.surfaces) {
    assert.ok(html.includes('data-surface="' + id + '"'), id + ' tab');
  }
  assert.ok(html.includes('工作记录'));
  assert.ok(html.includes('浮窗'));
  assert.ok(html.includes('迷你栏'));
  assert.ok(html.includes('Soft Pad'));
  assert.ok(!html.includes('三叶配置'));
});

test('every surface uses left preview + right panel', () => {
  const { R } = load();
  for (const surface of R.surfaces) {
    const html = R.renderPage({ variant: 'timeline', mode: 'quiet', surface });
    assert.ok(html.includes('leaf-workspace'), surface);
    if (surface === 'work') {
      assert.ok(html.includes('leaf-workspace--practical'), 'work practical');
      assert.ok(html.includes('awh-next'), 'work next-do');
      assert.ok(html.includes('最近帮过'), 'work timeline');
    } else {
      assert.ok(html.includes('leaf-preview'), surface + ' preview');
      assert.ok(html.includes('leaf-panel') || html.includes('work-panel'), surface + ' panel');
    }
  }
});

test('work preview mounts Soft Pad glance for intuitive data', () => {
  const { R } = load();
  const html = R.renderPage({ variant: 'timeline', mode: 'quiet', surface: 'work' });
  assert.ok(html.includes('data-softpad-glance') || html.includes('帮手键盘'));
  assert.ok(html.includes('data-awh-pad-paint') || html.includes('data-soft-pad-preview-paint'));
  assert.ok(html.includes('你现在可以') || html.includes('最近帮过'));
  assert.ok(html.includes('awh-next-cta'));
  assert.ok(html.includes('示意数据'));
});

test('selecting timeline event syncs left now-line', () => {
  const { R } = load();
  const a = R.renderPage({
    surface: 'work',
    mode: 'quiet',
    selectedEventId: 'e2'
  });
  assert.ok(a.includes('data-selected="e2"'));
  assert.ok(a.includes('is-selected'));
  assert.ok(a.includes('拍板') || a.includes('等你'));
  assert.ok(!a.includes('User turn observed'));
});

test('soft-pad-glance-bridge speaks production preview protocol', () => {
  const src = fs.readFileSync(path.join(dir, 'soft-pad-glance-bridge.js'), 'utf8');
  assert.ok(src.includes('ot-agent-preview'));
  assert.ok(src.includes('ot-agent-preview-cmd'));
  assert.ok(src.includes('OneToneAwhSoftPadGlanceBridge'));
  assert.ok(src.includes('renderHardwarePad'));
  assert.ok(src.includes('livePad'));
  const ctx = { window: {}, globalThis: null, document: { querySelector() { return null; }, createElement() { return {}; }, head: { appendChild() {} } }, location: { search: '' } };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  const B = ctx.OneToneAwhSoftPadGlanceBridge;
  assert.ok(B);
  assert.equal(B.MSG_TYPE, 'ot-agent-preview');
  const demo = B.demoMapping();
  assert.ok(demo.codexMicroPad);
  const empty = B.applyPayload({ empty: true, message: 'x' });
  assert.equal(empty, false); // no paint host in vm
});

test('Agent shell chrome still present', () => {
  const { R } = load();
  const html = R.renderPage({ variant: 'timeline', mode: 'quiet' });
  assert.ok(html.includes('ot-sidebar'));
  assert.ok(html.includes('app-snap'));
  assert.ok(html.includes('查看数据') || html.includes('详细用量') || html.includes('规划与明细'));
  assert.ok(html.includes('app-pick'));
});

test('float mini softPad keep config copy', () => {
  const { R } = load();
  assert.ok(R.renderPage({ surface: 'float' }).includes('何时出现'));
  assert.ok(R.renderPage({ surface: 'mini' }).includes('迷你栏'));
  assert.ok(R.renderPage({ surface: 'softPad' }).includes('顶栏'));
});

test('quiet / listening / empty / resume still work on work tab', () => {
  const { R } = load();
  const quiet = R.renderPage({ surface: 'work', mode: 'quiet' });
  assert.ok(!quiet.includes('正在倾听'));
  assert.ok(quiet.includes('你现在可以') || quiet.includes('最近帮过'));
  assert.ok(quiet.includes('awh-next'));
  assert.ok(quiet.includes('接着排工作记录') || quiet.includes('正在帮你'));
  assert.ok(quiet.includes('你随时可以开口') || quiet.includes('开口'));
  assert.ok(!quiet.includes('额度余 62%'));
  assert.ok(!quiet.includes('首页梳理 3/5'));
  assert.ok(!quiet.includes('效率 <em>58.6</em>'));
  assert.ok(!quiet.includes('User turn observed'));
  assert.ok(quiet.includes('这段时间有') || quiet.includes('最近帮过'));
  const on = R.renderPage({ surface: 'work', mode: 'quiet', listening: true });
  assert.ok(on.includes('正在倾听'));
  const empty = R.renderPage({ surface: 'work', empty: true });
  assert.ok(empty.includes('还没有帮过你的记录') || empty.includes('还没有'));
  const ret = R.renderPage({ surface: 'work', variant: 'resume', mode: 'return' });
  assert.ok(ret.includes('接着帮我') || ret.includes('继续这项工作'));
  assert.ok(ret.includes('awh-next--go') || ret.includes('可以接着帮你'));
});

test('work home answers pulse signals, not code evidence', () => {
  const { R } = load();
  const quiet = R.renderPage({ surface: 'work', mode: 'quiet' });
  assert.ok(quiet.includes('pulse-row') || quiet.includes('awh-next'));
  assert.ok(!quiet.includes('决定本次输入发送到 Cursor'));
  const degraded = R.renderPage({ surface: 'work', mode: 'degraded' });
  assert.ok(
    degraded.includes('暂时连不上') ||
      degraded.includes('还没认准') ||
      degraded.includes('认一下项目') ||
      degraded.includes('确认项目')
  );
});

test('liveSnap fromHomeSnapshot renders as live', () => {
  const { R, Pulse } = load();
  assert.ok(Pulse.fromHomeSnapshot);
  const liveSnap = Pulse.fromHomeSnapshot({
    syncStatus: 'ready',
    probeStatus: 'ready',
    project: { displayName: 'voice-pilot', matchKind: 'exact' },
    activeSession: {
      sessionId: 's1',
      provider: 'cursor',
      status: 'running',
      title: '首页'
    },
    checkpoint: { nextAction: '继续排呈现' },
    recentEvents: [
      {
        eventId: 'e9',
        eventType: 'task_resumed',
        eventClass: 'onetone_lifecycle',
        summary: 'Agent 正在处理',
        timestamp: Date.UTC(2026, 9, 3, 8, 0, 0)
      }
    ]
  });
  const html = R.renderPage({
    surface: 'work',
    variant: 'timeline',
    liveSnap: liveSnap
  });
  assert.ok(html.includes('data-live="1"'));
  assert.ok(html.includes('实况数据') || html.includes('实况 · AgentHomeSnapshot'));
  assert.ok(html.includes('继续排呈现') || html.includes('正在帮你') || html.includes('进行中'));
  assert.ok(!html.includes('示意数据 · 未接会话库'));
});

test('shell CSS and app wiring', () => {
  const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
  assert.ok(css.includes('leaf-workspace'));
  assert.ok(css.includes('surface-tabs--4'));
  assert.ok(!css.includes('.trifolium-surface'));
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  assert.ok(app.includes('R.surfaces'));
  assert.ok(app.includes('cmd_agent_home_snapshot'));
  assert.ok(app.includes('liveSnap'));
});
