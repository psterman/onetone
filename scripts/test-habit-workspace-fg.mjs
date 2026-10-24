/**
 * Habit workspace: auto-align edit selection to foreground (not activeSceneId),
 * plus manual app switch + 对准前台.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

const host = {
  id: 'habitWorkspace',
  className: 'habit-workspace',
  innerHTML: '',
  __habitWorkspaceBound: false,
  setAttribute() {},
  addEventListener(type, fn) {
    this._listeners = this._listeners || {};
    this._listeners[type] = fn;
  },
  querySelector() {
    return null;
  }
};
const hubEl = {
  querySelector() {
    return { hidden: false };
  }
};

const mappings = [
  { id: 'base', group: '通用', enabled: true },
  {
    id: 'app-cursor',
    group: 'Cursor 工作',
    appTargetId: 'cursor-chat',
    enabled: true,
    agentBindings: []
  },
  {
    id: 'app-chrome',
    group: 'Chrome 浏览',
    appTargetId: 'chrome',
    enabled: true,
    agentBindings: []
  }
];

let fgRes = {
  exeName: 'Cursor.exe',
  matchedPresetAppId: 'cursor-chat',
  displayName: 'Cursor'
};

const context = {
  console,
  Promise,
  setTimeout: (fn) => fn(),
  document: {
    documentElement: { lang: 'zh-CN' },
    getElementById: (id) =>
      id === 'habitHubView' ? hubEl : id === 'habitWorkspace' ? host : null,
    querySelector: () => null,
    addEventListener() {}
  },
  OneToneI18n: { getLang: () => 'zh', t: (k, fb) => fb || k },
  OneToneIpc: {
    invoke(cmd) {
      if (cmd === 'cmd_habit_foreground_app' || cmd === 'cmd_foreground_app') {
        return Promise.resolve(fgRes);
      }
      return Promise.resolve(null);
    }
  },
  OneToneState: {
    state: {
      selectedMappingId: 'base',
      config: { activeSceneId: 'base', mappings }
    },
    ui: {
      habitExperienceMode: null,
      habitWorkspaceChannel: 'key',
      habitWorkspaceItemId: 'key-main',
      habitProgramSection: 'scope',
      habitWorkspaceFgReady: false,
      habitWorkspaceManualPick: false
    }
  },
  OneToneMappingCore: {
    byId(id) {
      return mappings.find((m) => m.id === id) || null;
    }
  },
  OneToneHabitOverrideDiff: {
    isAppScenarioMapping(m) {
      return !!(m && m.appTargetId);
    },
    findGlobalBaselineMapping() {
      return mappings[0];
    },
    ensureGlobalBaselineMapping() {
      return { created: false };
    }
  },
  OneToneHabitHub: {
    isSelfForegroundIdentity(identity) {
      if (!identity) return true;
      return String(identity.exeName || '')
        .toLowerCase()
        .includes('onetone');
    },
    findAppScenarioForIdentity(identity) {
      const preset = String(
        (identity && (identity.matchedPresetAppId || identity.appId)) || ''
      );
      return mappings.find((m) => m.appTargetId === preset) || null;
    },
    loadHabitForeground() {
      return context.OneToneIpc.invoke('cmd_habit_foreground_app');
    }
  },
  OneToneAppBehaviorRules: {
    appDisplayName: (id) => (id === 'cursor-chat' ? 'Cursor' : id)
  },
  OneToneHabitProfile: { habitDisplayName: (m) => m.group || m.id },
  OneToneHabitActionStats: { isFresh: () => true, fetch: () => Promise.resolve() },
  OneToneAppToast: { show() {} }
};
context.globalThis = context;
context.window = context;
vm.createContext(context);

for (const file of [
  'src/js/core/habit-experience-prefs.js',
  'src/js/features/mapping/habit-shared.js',
  'src/js/features/mapping/habit-channel-snapshot.js',
  'src/js/features/mapping/habit-workspace.js'
]) {
  vm.runInContext(src(file), context, { filename: file });
}

const Workspace = context.OneToneHabitWorkspace;
const st = context.OneToneState.state;
const ui = context.OneToneState.ui;

assert.equal(typeof Workspace.alignToForeground, 'function');

await Workspace.alignToForeground({ force: true, skipStatsFetch: true });
assert.equal(st.selectedMappingId, 'app-cursor', 'force align selects FG habit');
assert.equal(st.config.activeSceneId, 'base', 'never changes 正在使用');
assert.match(host.innerHTML, /habit-ws-truth/, 'compact FG strip present');
assert.match(host.innerHTML, /habit-ws-truth is-aligned/, 'aligned = compact chip only');
assert.equal(/data-habit-align-fg/.test(host.innerHTML), false, 'aligned hides 对准前台');
assert.match(host.innerHTML, /前台 · Cursor/, 'shows FG name inline');
assert.equal(/habit-ws-truth-cell/.test(host.innerHTML), false, 'no dual-cell FG card');

st.selectedMappingId = 'app-chrome';
ui.habitWorkspaceManualPick = true;
ui.habitWorkspaceFgReady = true;
host.__habitWorkspaceBound = false;
Workspace.render({ skipFgAlign: true });
assert.equal(st.selectedMappingId, 'app-chrome', 'manual pick kept');
assert.match(host.innerHTML, /data-habit-align-fg/, 'misaligned shows 对准前台');

await Workspace.alignToForeground({ force: true, skipStatsFetch: true });
assert.equal(st.selectedMappingId, 'app-cursor', '对准前台 restores FG habit');
assert.equal(st.config.activeSceneId, 'base', '对准前台 still leaves activeScene');

ui.habitWorkspaceManualPick = false;
ui.habitWorkspaceFgReady = false;
st.selectedMappingId = 'base';
host.__habitWorkspaceBound = false;
Workspace.render();
await new Promise((r) => setTimeout(r, 0));
assert.equal(st.selectedMappingId, 'app-cursor', 'auto align on first open');

const wsSrc = src('src/js/features/mapping/habit-workspace.js');
assert.match(wsSrc, /habitWorkspaceManualPick/);
assert.match(wsSrc, /applyForegroundEditSelection/);
assert.doesNotMatch(
  wsSrc.slice(wsSrc.indexOf('applyForegroundEditSelection'), wsSrc.indexOf('alignToForeground')),
  /activeSceneId\s*=/
);

const drawer = src('src/js/features/settings/settings-drawer.js');
assert.match(drawer, /habitWorkspaceFgReady\s*=\s*false/);
assert.match(drawer, /opts\.mappingId[\s\S]*habitWorkspaceManualPick\s*=\s*true/);

const hub = src('src/js/features/mapping/habit-hub.js');
assert.match(hub, /loadHabitForeground:loadHabitForeground/);

console.log('ok habit-workspace-fg');
