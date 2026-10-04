const fs = require('fs');
const path = 'e:/voice-pilot/prototypes/agent-home-workbench/index.html';
const html = fs.readFileSync(path, 'utf8');
const i = html.indexOf('<script>');
const j = html.lastIndexOf('</script>');
const code = html.slice(i + 8, j);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  new Function(code);
  console.log('syntax ok');
} catch (e) {
  console.error('SYNTAX', e.message);
  process.exit(1);
}

const store = {};
function elStub(id) {
  if (!store[id]) {
    store[id] = {
      hidden: false,
      textContent: '',
      innerHTML: '',
      style: {},
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      setAttribute: function () {},
      getAttribute: function () { return null; },
      addEventListener: function () {},
      appendChild: function () {},
      querySelectorAll: function () { return []; },
      closest: function () { return null; }
    };
  }
  return store[id];
}

const document = {
  getElementById: elStub,
  querySelectorAll: function () { return []; },
  querySelector: function () { return null; },
  addEventListener: function () {},
  body: { appendChild: function () {} }
};
const window = {
  matchMedia: function () { return { matches: false, addEventListener: function () {} }; }
};

// Capture API by rewriting the IIFE to return keys, or assign to globalThis.
let body = code.trim();
let wrapped;
if (/^\(function\b/.test(body)) {
  wrapped =
    'var __API = {};\n' +
    body.replace(
      /^\(function\s*\(\s*\)\s*\{/,
      '(function(){ '
    ).replace(
      /\}\)\(\);\s*$/,
      ' __API = { TASKS: TASKS, PROFILES: PROFILES, buildHomeView: buildHomeView, canShowEvent: canShowEvent, profileOf: profileOf }; })(); return __API;'
    );
} else {
  wrapped =
    body +
    '\n; return { TASKS: TASKS, PROFILES: PROFILES, buildHomeView: buildHomeView, canShowEvent: canShowEvent, profileOf: profileOf };';
}

let api;
try {
  api = new Function('document', 'window', wrapped)(document, window);
} catch (e) {
  console.error('EVAL', e.message);
  // Fallback: extract pure functions without listeners
  const start = code.indexOf('  var WORKSPACE');
  const stateAt = code.indexOf('  var state = { taskIndex');
  const syncAt = code.indexOf('  function syncSnapshotFromEvents');
  const renderAt = code.indexOf('  function renderSwitch');
  assert(start > 0 && stateAt > start && syncAt > stateAt && renderAt > syncAt, 'markers');
  const pure =
    'function esc(s){return String(s==null?"":s);}\n' +
    'var STATUS_UI={idle:{label:"待命"},running:{label:"进行中"},planning:{label:"规划中"},paused:{label:"已暂停"},waiting_approval:{label:"需要你确认"},completed:{label:"已完成"},failed:{label:"失败"},cancelled:{label:"已取消"}};\n' +
    code.slice(start, stateAt) +
    code.slice(syncAt, renderAt) +
    '; return { TASKS: TASKS, buildHomeView: buildHomeView, canShowEvent: canShowEvent };';
  try {
    api = new Function(pure)();
  } catch (e2) {
    console.error('FALLBACK', e2.message);
    const lines = pure.split('\n');
    const m = String(e2.stack).match(/<anonymous>:(\d+)/);
    if (m) {
      const n = +m[1];
      console.log(lines.slice(Math.max(0, n - 3), n + 2).map((l, idx) => (n - 3 + idx + 1) + ': ' + l).join('\n'));
    }
    process.exit(1);
  }
}

const { TASKS, buildHomeView, canShowEvent } = api;

function acts(view) {
  return view.actions.map(function (a) { return a.id + ':' + a.kind; });
}

const oc = TASKS.find(function (t) { return t.profileId === 'opencode' && t.snapshot.status === 'running'; });
const cr = TASKS.find(function (t) { return t.profileId === 'cursor' && t.snapshot.status === 'running'; });
const cc = TASKS.find(function (t) { return t.profileId === 'claude-code'; });
const done = TASKS.find(function (t) { return t.snapshot.status === 'completed'; });
const idle = TASKS.find(function (t) { return t.snapshot.status === 'idle'; });

assert(oc && cr && cc && done && idle, 'fixtures present');

const voc = buildHomeView(oc);
const vcr = buildHomeView(cr);
const vcc = buildHomeView(cc);
const vdone = buildHomeView(done);
const vidle = buildHomeView(idle);

console.log('OpenCode', { progress: voc.progress && voc.progress.text, step: voc.stepText, acts: acts(voc) });
console.log('Cursor', { progress: vcr.progress, step: vcr.stepText, acts: acts(vcr) });
console.log('Claude', { progress: vcc.progress, step: vcc.stepText, acts: acts(vcc) });
console.log('Done/Idle', acts(vdone), acts(vidle));

assert(voc.progress && /\/\s*6/.test(voc.progress.text) && Number(voc.progress.pct) > 0, 'OpenCode progress: ' + (voc.progress && voc.progress.text));
assert(acts(voc).indexOf('abort:default') >= 0, 'OpenCode abort');
assert(acts(voc).indexOf('pause:ghost') >= 0, 'OpenCode monitor pause');
assert(acts(voc).indexOf('pause-task:default') < 0, 'OpenCode no provider pause');

assert(vcr.progress === null, 'Cursor no fake progress');
assert(vcr.stepText === '正在工作', 'Cursor inferred step');
assert(acts(vcr).indexOf('abort:default') >= 0, 'Cursor abort');
assert(acts(vcr).indexOf('pause:ghost') >= 0, 'Cursor monitor pause');
assert(!acts(vcr).some(function (a) { return a.indexOf('pause-task') === 0; }), 'Cursor no pause-task');
assert(vcr.activity.some(function (a) { return /改|文件|查看/.test(a.text); }), 'Cursor activity');

assert(vcc.progress === null, 'Claude no progress');
assert(acts(vcc).indexOf('approve:primary') >= 0, 'Claude approve');
assert(!acts(vcc).some(function (a) { return a.indexOf('pause') === 0; }), 'Claude no pause');
assert(vcc.activity.some(function (a) { return /子 Agent|确认|命令/.test(a.text); }), 'Claude activity');

assert(acts(vdone).indexOf('continue-last:primary') >= 0, 'completed');
assert(!acts(vdone).some(function (a) { return a.indexOf('abort') === 0 || a.indexOf('pause') === 0; }), 'completed clean');

assert(acts(vidle).indexOf('hand:primary') >= 0, 'idle hand');
assert(vidle.progress === null && vidle.stepText === null, 'idle bare');

assert(canShowEvent({ type: 'subagent_started' }, cc.profile), 'claude subagent');
assert(!canShowEvent({ type: 'checkpoint_created' }, cr.profile), 'cursor hide ckpt event');
assert(canShowEvent({ type: 'file_changed' }, cr.profile), 'cursor file');
assert(!canShowEvent({ type: 'file_changed' }, cc.profile), 'claude hide file');

assert(html.indexOf('演示数据 · 尚未连接 Provider') >= 0, 'demo note');
assert(html.indexOf('btn--ghost') >= 0, 'ghost');
assert(html.indexOf('function buildHomeView') >= 0, 'buildHomeView');

console.log('ACCEPTANCE PASS');
