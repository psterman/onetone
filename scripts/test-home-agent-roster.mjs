/**
 * Home Agent Roster fusion contract tests.
 * Asserts: inventory chain, mountHome, no prod fixture, actions, 680 CSS, home host.
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
const hfView = read('src/js/features/now/home-focus-view.js');
const nowHome = read('src/js/features/now/now-home.js');
const rosterCss = read('src/css/home-agent-roster.css');
const page = read('src/agent-proto/agent-page.html');
const ipcRs = read('src-tauri/src/ipc/commands/shell/agent_center_cmd.rs');
const centerRs = read('src-tauri/src/agent_memory/agent_center.rs');

// Index loads agent-center + roster CSS
assert.match(indexHtml, /agent-center\.js/);
assert.match(indexHtml, /home-agent-roster\.css/);

// Home Focus hosts roster + dictate CTA
assert.match(hfView, /homeAgentRoster/);
assert.match(hfView, /开始听写/);
assert.match(hfView, /hn-cta--dictate/);
assert.match(hfView, /data-now-voice/);
assert.doesNotMatch(hfView, /Living Now/);
assert.doesNotMatch(hfView, /Agent 台账/);

// now-home remounts after paint
assert.match(nowHome, /ensureHomeMounted/);

// mountHome API
assert.match(acJs, /function mountHome\(/);
assert.match(acJs, /ensureHomeMounted/);
assert.match(acJs, /data-ac-home-mounted/);
assert.match(acJs, /data-ac-bound/);

// Actions wired via single honest IPC
['session.resume', 'agent.focus', 'agent.interrupt', 'ui.open_config', 'ui.open_data', 'export_history', 'checkpoint.preview'].forEach((id) => {
  assert.match(acJs, new RegExp(id.replace('.', '\\.')));
});
assert.match(acJs, /cmd_agent_center_action/);
assert.doesNotMatch(acJs, /cmd_soft_pad_focus_agent/);
assert.doesNotMatch(acJs, /cmd_agent_checkpoint_resume/);
assert.doesNotMatch(acJs, /cmd_agent_lifecycle_event/);
assert.doesNotMatch(acJs, /session_aborted/);
assert.match(acJs, /pendingAction/);
assert.match(centerRs, /"agent\.focus"/);
assert.match(centerRs, /"agent\.interrupt"/);
assert.match(centerRs, /"ui\.open_data"/);
assert.match(centerRs, /not_running/);
assert.match(centerRs, /provider_handler_id/);
assert.match(ipcRs, /cmd_agent_center_action/);

// Inventory chain (backend must be real — not frontend-only)
assert.match(ipcRs, /collect_inventory/);
assert.match(ipcRs, /cmd_agent_registry_refresh/);
assert.match(ipcRs, /install_rows_from_state/);
assert.doesNotMatch(centerRs, /let install: Vec<\(String, String, String\)> = Vec::new\(\)/);

// Snapshot work fields
assert.match(centerRs, /recent_work|recentWork/);
assert.match(centerRs, /current_work|currentWork/);
assert.match(centerRs, /home_session_ids|referenced_session_ids/);

// Production refresh: no fixtureSnap
const refreshFn = acJs.slice(acJs.indexOf('function refresh('), acJs.indexOf('function mount('));
const returnIdxs = [...refreshFn.matchAll(/return invoke/g)].map((m) => m.index);
assert.ok(returnIdxs.length >= 3, 'demo + production chains');
const prodRefresh = refreshFn.slice(returnIdxs[2]);
assert.ok(prodRefresh.includes('applyLoadFailure'));
assert.ok(!prodRefresh.includes('fixtureSnap'), 'production catch must not fixtureSnap');

// 680 breakpoint + no fixed 3-col page + reduced-motion + no h-scroll
assert.match(rosterCss, /@media \(max-width:\s*680px\)/);
assert.match(rosterCss, /prefers-reduced-motion:\s*reduce/);
assert.match(rosterCss, /overflow-x:\s*hidden/);
assert.match(rosterCss, /\.har-toggle/);
assert.match(rosterCss, /\.har-detail/);
assert.match(rosterCss, /flex-wrap:\s*wrap/);
assert.doesNotMatch(rosterCss, /grid-template-columns:\s*1fr\s+1fr\s+1fr/);
assert.doesNotMatch(rosterCss, /now-below/);
assert.match(rosterCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(rosterCss, /grid-column:\s*2\s*\/\s*4/); // work line wraps under name at 680


// Work tab retired as default
// Work tab removed from Agent page; deep-link remaps to softPad / home
assert.match(page, /setSub\(allowedDeep\[deepSub\]\?deepSub:'softPad'\)/);
assert.doesNotMatch(page, /data-sub="work"/);
assert.doesNotMatch(page, /data-sub="homeRoster"/);
assert.match(page, /goto-home-roster/);

// VM: mountHome idempotent + fixture only via _fixture
const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
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
sandbox.document = {
  documentElement: { lang: 'zh' },
  getElementById: (id) => (id === 'homeAgentRoster' ? sandbox._host : null),
  querySelector: () => null,
  body: { appendChild() {} }
};
sandbox._host = {
  _attrs: {},
  innerHTML: '',
  isConnected: true,
  querySelector(sel) {
    if (sel === '[data-har-list]' && this.innerHTML.indexOf('data-har-list') >= 0) {
      return { innerHTML: '' };
    }
    if (sel === '[data-har-banners]' && this.innerHTML.indexOf('data-har-banners') >= 0) {
      return { innerHTML: '' };
    }
    return null;
  },
  getAttribute(k) {
    return this._attrs[k] || null;
  },
  setAttribute(k, v) {
    this._attrs[k] = String(v);
  },
  removeAttribute(k) {
    delete this._attrs[k];
  },
  addEventListener() {}
};

vm.runInNewContext(acJs, sandbox);
const AC = sandbox.OneToneAgentCenter;
assert.ok(AC.mountHome);
AC.mountHome(sandbox._host);
assert.equal(sandbox._host.getAttribute('data-ac-home-mounted'), '1');
const html1 = sandbox._host.innerHTML;
AC.mountHome(sandbox._host);
assert.ok(sandbox._host.innerHTML.length >= html1.length * 0.5, 'idempotent remount keeps shell');

const fix = AC._fixture();
assert.ok(fix.groups.connected.length >= 1);

console.log('test-home-agent-roster: ok');
