/**
 * Home Agent Roster fusion + DOM interaction contract tests.
 * Asserts: inventory chain, mountHome, expand/toast/refresh, no prod fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const indexHtml = read('src/index.html');
const acJs = read('src/js/features/agent/agent-center.js');
const acceptanceJs = read('src/js/features/agent/agent-control-acceptance.js');
const hfView = read('src/js/features/now/home-focus-view.js');
const nowHome = read('src/js/features/now/now-home.js');
const rosterCss = read('src/css/home-agent-roster.css');
const page = read('src/agent-proto/agent-page.html');
const ipcRs = read('src-tauri/src/ipc/commands/shell/agent_center_cmd.rs');
const centerRs = read('src-tauri/src/agent_memory/agent_center.rs');

assert.match(indexHtml, /agent-control-acceptance\.js/);
assert.match(rosterCss, /repeat\(4,\s*minmax/);
assert.match(rosterCss, /\.har-overview-summary/);
assert.match(acJs, /function projectAgentControl/);
assert.doesNotMatch(acJs, /real-provider\/NOT_EXECUTED/);
assert.match(hfView, /homeAgentRoster/);
assert.match(hfView, /开始听写/);
assert.doesNotMatch(hfView, /Living Now/);
assert.doesNotMatch(hfView, /computeHomeOverview|classifyInterrupt|har-badge/);
assert.doesNotMatch(hfView, /har-overview|har-filter/);
assert.match(nowHome, /ensureHomeMounted/);
assert.match(acJs, /function mountHome\(/);
assert.match(acJs, /__test/);
assert.match(acJs, /cmd_agent_center_action/);
assert.match(acJs, /resolveActionOutcome/);
assert.doesNotMatch(acJs, /res\.outcome \|\| \(res\.ok === false \? 'failed' : 'verified'\)/);
assert.match(centerRs, /"agent\.interrupt"/);
assert.match(ipcRs, /cmd_agent_center_action/);
assert.match(rosterCss, /@media \(max-width:\s*680px\)/);
assert.match(rosterCss, /prefers-reduced-motion:\s*reduce/);
assert.match(rosterCss, /\.har-overview/);
assert.match(rosterCss, /\.har-filter/);
assert.match(rosterCss, /\.har-badge/);
assert.match(rosterCss, /\.har-evidence/);
assert.match(rosterCss, /\.har-row-main/);
assert.match(rosterCss, /\.har-row-actions/);
assert.match(rosterCss, /flex:\s*0\s+0\s+auto/);
assert.match(rosterCss, /overflow-y:\s*visible/);
assert.match(acJs, /detailWhere|当前所在项目/);
assert.match(acJs, /actionAttemptedUnverified.*请自行确认|请自行确认/);

// --- MiniDOM (jsdom-free) ---
function matches(el, sel) {
  if (!el || !sel) return false;
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const body = sel.slice(1, -1);
    const eq = body.indexOf('=');
    if (eq < 0) return el.getAttribute(body) != null;
    const k = body.slice(0, eq);
    let v = body.slice(eq + 1).replace(/^["']|["']$/g, '');
    return el.getAttribute(k) === v;
  }
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return String(el.className || '')
      .split(/\s+/)
      .includes(cls);
  }
  if (sel.startsWith('#')) return el.getAttribute('id') === sel.slice(1);
  return (el.tagName || '').toLowerCase() === sel.toLowerCase();
}

function walk(el, fn) {
  fn(el);
  (el._children || []).forEach((c) => walk(c, fn));
}

function queryAll(rootEl, sel) {
  const out = [];
  walk(rootEl, (n) => {
    if (n !== rootEl && matches(n, sel)) out.push(n);
  });
  // also allow matching root
  if (matches(rootEl, sel)) out.unshift(rootEl);
  return out;
}

function queryOne(rootEl, sel) {
  const all = queryAll(rootEl, sel);
  return all[0] || null;
}

function textOf(el) {
  if (!el) return '';
  let out = String(el.textContent || '');
  (el._children || []).forEach((c) => {
    out += textOf(c);
  });
  return out;
}

function parseFragment(html, parent) {
  const children = [];
  const re =
    /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\s*\/>/g;
  let m;
  const src = String(html || '');
  while ((m = re.exec(src))) {
    const tag = m[1] || m[4];
    const attrStr = m[2] || m[5] || '';
    const inner = m[1] ? m[3] : '';
    const el = makeEl(tag, parent);
    const attrRe = /([:@]?[a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let am;
    while ((am = attrRe.exec(attrStr))) {
      const name = am[1];
      const val = am[2] != null ? am[2] : '';
      if (name === 'class') el.className = val;
      else el.setAttribute(name, val);
    }
    if (inner && /</.test(inner)) {
      el._children = parseFragment(inner, el);
      el._html = inner;
    } else {
      el._html = inner;
      el.textContent = inner.replace(/<[^>]+>/g, '');
    }
    children.push(el);
  }
  return children;
}

function makeEl(tag, parent) {
  const el = {
    tagName: String(tag).toUpperCase(),
    parent: parent || null,
    _attrs: {},
    _children: [],
    _listeners: {},
    _html: '',
    textContent: '',
    className: '',
    isConnected: true,
    get innerHTML() {
      return this._html;
    },
    set innerHTML(html) {
      this._html = String(html || '');
      this._children = parseFragment(this._html, this);
    },
    querySelector(sel) {
      return queryOne(this, sel);
    },
    querySelectorAll(sel) {
      return queryAll(this, sel);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k)
        ? this._attrs[k]
        : null;
    },
    setAttribute(k, v) {
      this._attrs[k] = String(v);
    },
    removeAttribute(k) {
      delete this._attrs[k];
    },
    get value() {
      return this._attrs.value != null ? this._attrs.value : '';
    },
    set value(v) {
      this._attrs.value = String(v);
    },
    get options() {
      return (this._children || []).filter((c) => (c.tagName || '').toUpperCase() === 'OPTION');
    },
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    dispatchEvent(ev) {
      const e = ev || {};
      e.target = e.target || this;
      e.currentTarget = this;
      (this._listeners[e.type] || []).forEach((fn) => fn(e));
      if (this.parent && !e._stopped) this.parent.dispatchEvent(e);
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (matches(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    click() {
      this.dispatchEvent({ type: 'click', target: this });
    }
  };
  return el;
}

const invokeLog = [];
let nextActionResult = null;
let toastLog = [];

const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  Promise,
  sessionStorage: {
    _m: {},
    setItem(k, v) {
      this._m[k] = String(v);
    },
    getItem(k) {
      return this._m[k] || null;
    }
  },
  location: { search: '' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox._host = makeEl('div', null);
sandbox._host.setAttribute('id', 'homeAgentRoster');
sandbox.document = {
  documentElement: { lang: 'zh' },
  getElementById: (id) => (id === 'homeAgentRoster' ? sandbox._host : null),
  querySelector: (sel) => sandbox._host.querySelector(sel),
  body: { appendChild() {} }
};
sandbox.OneToneIpc = {
  invoke(cmd, payload) {
    invokeLog.push({ cmd, payload });
    if (cmd === 'cmd_agent_center_action') {
      return Promise.resolve(nextActionResult);
    }
    if (cmd === 'cmd_agent_registry_refresh' || cmd === 'cmd_agent_center_snapshot') {
      return Promise.resolve(sandbox._lastSnap || null);
    }
    return Promise.reject(new Error('unexpected_cmd:' + cmd));
  }
};
sandbox.parent = {
  OneToneToast: {
    show(msg) {
      toastLog.push(String(msg || ''));
    }
  }
};

vm.runInNewContext(acceptanceJs, sandbox);
vm.runInNewContext(acJs, sandbox);
const AC = sandbox.OneToneAgentCenter;
assert.ok(AC.__test);

AC.__test.mountHome(sandbox._host);
assert.equal(sandbox._host.getAttribute('data-ac-home-mounted'), '1');
assert.ok(sandbox._host.querySelector('[data-har-list]'));
assert.ok(sandbox._host.querySelector('[data-har-overview]'));

const asOf = Date.now();
const snap = {
  attentionState: 'ready',
  asOf,
  groups: {
    needsAttention: [],
    connected: ['kind:codex'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [
    {
      agentId: 'kind:codex',
      displayName: 'Codex',
      presenceState: 'connected',
      status: 'working',
      observedStatus: {
        value: 'working',
        source: 'probe',
        observedAt: asOf - 1000,
        freshUntil: asOf + 60_000,
        confidence: 'high'
      },
      metrics: {
        todaySessions: { value: 1, basis: 'local' },
        todayCostUsd: { value: null, basis: 'unavailable', unavailableReason: 'x' },
        successRate: { value: null, basis: 'unavailable', unavailableReason: 'x' },
        averageDurationMs: { value: null, basis: 'unavailable', unavailableReason: 'x' }
      },
      actions: [
        {
          id: 'agent.interrupt',
          label: 'Interrupt',
          support: 'hotkey',
          supported: true,
          enabled: true,
          state: 'available',
          source: 'codexProbe',
          confidence: 'high',
          observedAt: asOf - 1000,
          freshUntil: asOf + 60_000
        },
        {
          id: 'agent.focus',
          label: 'View',
          support: 'workflow',
          supported: true,
          enabled: true,
          state: 'available'
        }
      ],
      recentWork: [],
      currentWork: { projectName: 'voice-pilot' },
      limitations: [],
      presence: {},
      resolvedCapabilities: {}
    }
  ]
};
sandbox._lastSnap = snap;
AC.__test.applySnap(snap);

const toggle = sandbox._host.querySelector('[data-expand-agent]');
assert.ok(toggle, 'expand toggle rendered');
assert.equal(toggle.getAttribute('aria-expanded'), 'false');
assert.equal(sandbox._host.querySelectorAll('.har-detail').length, 0);
assert.ok(sandbox._host.querySelector('.har-row-main'), 'row-main chrome');
assert.ok(sandbox._host.querySelector('.har-row-actions'), 'row actions visible');
assert.ok(
  sandbox._host.querySelector('[data-action="agent.interrupt"]'),
  'stop on row'
);

toggle.click();
const toggleOpen = sandbox._host.querySelector('[data-expand-agent]');
assert.ok(toggleOpen);
assert.equal(toggleOpen.getAttribute('aria-expanded'), 'true');
assert.equal(sandbox._host.querySelectorAll('.har-detail').length, 1);
assert.ok(sandbox._host.querySelector('.har-badges'));
assert.ok(sandbox._host.querySelector('.har-evidence'));
const evidenceText = textOf(sandbox._host.querySelector('.har-evidence'));
assert.match(evidenceText, /信息是否新鲜|Is this info fresh|仍然新鲜|Still fresh|证据已过期|Evidence expired/);
assert.match(textOf(sandbox._host.querySelector('.har-project')), /voice-pilot/);
const metrics = queryAll(sandbox._host, '.har-metric');
assert.ok(metrics.length >= 1, 'detail metric cards');
assert.doesNotMatch(evidenceText, /\bobservedAt\b|\bfreshUntil\b|\bconfidence\b|\bsessionId\b/);
assert.doesNotMatch(evidenceText, /AttemptedUnverified|ProbeNotImplemented|Verified/);

// six filters present
const filter = sandbox._host.querySelector('[data-har-filter]');
assert.ok(filter);
['all', 'working', 'confirmable', 'bestEffort', 'notWired', 'unsupported', 'stale'].forEach((v) => {
  assert.ok(
    [...filter.options].some((o) => o.value === v),
    'filter option ' + v
  );
});
filter.value = 'bestEffort';
filter.dispatchEvent({ type: 'change', bubbles: true });
assert.ok(sandbox._host.querySelector('[data-agent-row="kind:codex"]'));
filter.value = 'all';
filter.dispatchEvent({ type: 'change', bubbles: true });

async function drain() {
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 20));
  await Promise.resolve();
}

// verified → toast + force refresh
invokeLog.length = 0;
toastLog.length = 0;
nextActionResult = {
  outcome: 'verified',
  ok: true,
  verified: true,
  attemptId: 'attempt-dom-verified'
};
AC.__test.dispatchAction('agent.interrupt', 'kind:codex');
await drain();

const actionCalls = invokeLog.filter((x) => x.cmd === 'cmd_agent_center_action');
assert.ok(actionCalls.length >= 1);
const args = actionCalls[0].payload && actionCalls[0].payload.args;
assert.ok(args && args.attemptId, 'attemptId in payload');
assert.ok(
  toastLog.some((m) => /已确认 Agent 停止|Agent stop confirmed/i.test(m)),
  'verified toast: ' + toastLog.join('|')
);
assert.ok(
  invokeLog.some((x) => x.cmd === 'cmd_agent_registry_refresh'),
  'verified triggers force refresh'
);

// attemptedUnverified
invokeLog.length = 0;
toastLog.length = 0;
nextActionResult = {
  outcome: 'attemptedUnverified',
  ok: true,
  verified: false,
  attemptId: 'attempt-dom-attempted'
};
AC.__test.dispatchAction('agent.interrupt', 'kind:codex');
await drain();
assert.ok(
  toastLog.some((m) => /请自行确认|confirm yourself|尚未确认|not confirmed|Attempted/i.test(m)),
  'attempted toast: ' + toastLog.join('|')
);
assert.doesNotMatch(toastLog.join('|'), /已确认 Agent 停止/);

// Cursor must never surface Verified copy for best-effort interrupt badge
const cursorSnap = {
  asOf,
  project: { id: 'p1', name: 'voice-pilot', path: 'E:/voice-pilot' },
  groups: {
    needsAttention: [],
    connected: ['kind:cursor'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [
    {
      agentId: 'kind:cursor',
      displayName: 'Cursor',
      runtimeKind: 'cursor',
      status: 'idle',
      actions: [
        {
          id: 'agent.interrupt',
          label: 'Stop',
          support: 'hotkey',
          supported: true,
          enabled: true,
          state: 'available',
          observedAt: asOf - 1000,
          freshUntil: asOf + 60_000
        }
      ],
      recentWork: [],
      currentWork: { projectName: 'voice-pilot' },
      limitations: [],
      presence: {},
      resolvedCapabilities: {}
    }
  ]
};
AC.__test.applySnap(cursorSnap);
sandbox._host.querySelector('[data-expand-agent]').click();
assert.ok(sandbox._host.querySelector('.har-badges'));
const cursorBadgeText = textOf(sandbox._host.querySelector('.har-badges'));
assert.match(cursorBadgeText, /尽力停止|Best-effort/);
assert.doesNotMatch(cursorBadgeText, /已确认 Agent 停止|Verified/);
assert.doesNotMatch(cursorBadgeText, /ProbeNotImplemented/);
assert.equal(AC._classifyInterrupt(AC._findInterruptAction(cursorSnap.agents[0])), 'bestEffort');

// ProbeNotImplemented vs provider_unsupported copy
assert.equal(AC._humanReason('ProbeNotImplemented'), AC.t('probeNotImplemented'));
assert.equal(AC._humanReason('provider_unsupported'), AC.t('providerUnsupportedInterrupt'));
assert.notEqual(AC.t('probeNotImplemented'), AC.t('providerUnsupportedInterrupt'));
assert.match(AC.t('probeNotImplemented'), /尚未接入|not wired/i);
assert.equal(AC.t('providerUnsupportedInterrupt'), '不支持');

// failed must not show verified copy
AC.__test.applySnap(snap);
invokeLog.length = 0;
toastLog.length = 0;
nextActionResult = {
  outcome: 'failed',
  ok: false,
  verified: false,
  error: 'execute_failed',
  attemptId: 'attempt-dom-failed'
};
AC.__test.dispatchAction('agent.interrupt', 'kind:codex');
await drain();
assert.ok(toastLog.some((m) => /失败|Failed|fail/i.test(m)));
assert.doesNotMatch(toastLog.join('|'), /已确认 Agent 停止/);

// missing outcome fail-closed
assert.equal(AC.__test.resolveActionOutcome({ ok: true }), 'failed');
assert.equal(AC.__test.resolveActionOutcome({ ok: false, verified: true }), 'failed');

const fix = AC._fixture();
assert.ok(fix.groups.connected.length >= 1);
const ov = AC._computeHomeOverview(fix);
assert.ok(ov.discovered >= 1);

console.log('test-home-agent-roster: ok');
