/**
 * Habit shell dual view: scenes | commands (auto for vibecoding apps).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const storage = new Map();
const host = {
  id: 'habitWorkspace',
  className: 'habit-workspace',
  hidden: false,
  innerHTML: '',
  __habitWorkspaceBound: false,
  setAttribute() {},
  addEventListener() {},
  querySelector() {
    return null;
  }
};
const hub = {
  querySelector(sel) {
    if (sel === '.habit-hub-toolbar' || sel === '.habit-hub-body') return { hidden: false };
    if (sel === '.habit-hub-head') return { parentNode: { insertBefore() {} } };
    return null;
  }
};
const toggleBtns = [
  { getAttribute: () => 'scenes', classList: { toggle() {} }, setAttribute() {} },
  { getAttribute: () => 'commands', classList: { toggle() {} }, setAttribute() {} }
];
const toggle = {
  __habitShellBound: false,
  querySelectorAll() {
    return toggleBtns;
  },
  addEventListener() {}
};
const panel = { classList: { toggle() {} } };

const context = {
  console,
  setTimeout: (fn) => fn(),
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  },
  document: {
    documentElement: { lang: 'zh-CN' },
    getElementById: (id) => {
      if (id === 'habitHubView') return hub;
      if (id === 'habitWorkspace') return host;
      if (id === 'habitHubList') return { hidden: false };
      if (id === 'habitShellModeToggle') return toggle;
      if (id === 'settingsPanelHabits') return panel;
      return null;
    },
    querySelector: () => null,
    addEventListener() {}
  },
  OneToneI18n: { getLang: () => 'zh', t: (k, fb) => fb || k },
  OneToneState: {
    state: {
      selectedMappingId: 'cursor1',
      config: {
        activeSceneId: 'cursor1',
        mappings: [
          {
            id: 'cursor1',
            appTargetId: 'cursor-chat',
            group: 'Cursor',
            enabled: true,
            triggerKey: 'XButton2',
            targetKey: 'RAlt',
            agentBindings: [
              { slotId: 'send', actionId: 'agent.send', triggerType: 'voice', triggerBinding: '发出去', enabled: true }
            ]
          },
          {
            id: 'baseline',
            appTargetId: '',
            group: '通用',
            enabled: true,
            triggerKey: 'F2',
            targetKey: 'RAlt',
            agentBindings: []
          }
        ]
      }
    },
    ui: {
      habitShellMode: null,
      habitExperienceMode: null,
      habitWorkspaceChannel: 'key',
      habitWorkspaceItemId: 'key-main',
      habitProgramSection: 'scope',
      habitWorkspaceAdvancedOpen: false,
      habitWorkspaceScrollTop: 0,
      habitWorkspaceManualPick: false,
      habitWorkspaceFgReady: true,
      habitOpenMatchEditor: false,
      habitMatchCommand: ''
    }
  },
  OneToneMappingCore: {
    byId(id) {
      const maps = context.OneToneState.state.config.mappings;
      return maps.find((m) => m.id === id) || null;
    }
  },
  OneToneHabitOverrideDiff: {
    isAppScenarioMapping(m) {
      return !!(m && String(m.appTargetId || '').trim());
    },
    findGlobalBaselineMapping() {
      return context.OneToneState.state.config.mappings.find((m) => !m.appTargetId) || null;
    },
    ensureGlobalBaselineMapping() {
      return { created: false };
    }
  },
  OneToneHabitCommandLink: {
    buildModel(m) {
      const n = (m && m.agentBindings && m.agentBindings.length) || 0;
      return { commands: n ? [{ label: 'send' }] : [] };
    },
    mountInto() {}
  },
  OneToneHabitShared: {},
  OneToneHabitActionStats: {},
  OneToneHabitHub: {}
};

const src = readFileSync(path.join(root, 'src/js/features/mapping/habit-workspace.js'), 'utf8');
vm.runInNewContext(src, context);

const Ws = context.OneToneHabitWorkspace;
assert.ok(Ws && typeof Ws.resolveShellMode === 'function', 'exports resolveShellMode');
assert.equal(Ws.resolveShellMode(), 'commands', 'Cursor + binds → commands (vibecoding auto)');

context.OneToneState.ui.habitShellMode = 'scenes';
assert.equal(Ws.resolveShellMode(), 'scenes', 'explicit scenes pin wins');

context.OneToneState.ui.habitShellMode = null;
context.OneToneState.state.selectedMappingId = 'baseline';
assert.equal(Ws.resolveShellMode(), 'scenes', 'baseline empty → scenes (shallow)');

context.OneToneState.ui.habitOpenMatchEditor = true;
assert.equal(Ws.resolveShellMode(), 'commands', 'deep-link openMatchEditor → commands');

Ws.setShellMode('commands', { render: false });
assert.equal(context.OneToneState.ui.habitShellMode, 'commands', 'setShellMode pins commands');

console.log('test-habit-shell-mode: ok');
