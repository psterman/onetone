import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const savedPanels = [];
const context = {
  console,
  document: {
    documentElement: {lang: 'zh-CN'},
    getElementById(id) {
      return context.__els[id] || null;
    },
    createElement(tag) {
      return {
        type: tag,
        className: '',
        textContent: '',
        setAttribute() {},
        insertBefore() {},
        firstChild: null
      };
    },
    addEventListener() {}
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  },
  OneToneI18n: {getLang: () => 'zh', t: (k, fb) => fb || k},
  OneToneDom: {
    esc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    $: (id) => context.__els[id] || null
  },
  OneToneState: {
    state: {
      config: {
        activeSceneId: 'base',
        followForegroundAppScenario: true,
        runtimeHabitControl: {softOverride: null, pin: null},
        mappings: [
          {id: 'base', group: '通用设置', appTargetId: '', enabled: true},
          {id: 'app-cursor', group: 'Cursor', appTargetId: 'cursor-chat', enabled: true}
        ]
      },
      selectedMappingId: 'app-cursor'
    },
    ui: {
      settingsPanel: 'keys',
      habitScenarioReturnId: 'app-cursor',
      habitScenarioReturnPanel: 'keys',
      voiceEditSchemeId: 'app-cursor',
      cameraEditMode: 'appScenario'
    }
  },
  OneToneMappingCore: {
    sorted() {
      return context.OneToneState.state.config.mappings.slice();
    },
    byId(id) {
      return context.OneToneState.state.config.mappings.find((m) => m.id === id) || null;
    },
    editorTrigger(m) { return m && m.triggerKey ? m.triggerKey : ''; }
  },
  OneToneHabitOverrideDiff: {
    isGlobalBaselineMapping(m) {
      return m && m.id === 'base';
    },
    findGlobalBaselineMapping(cfg) {
      return cfg.mappings.find((m) => m.id === 'base') || null;
    },
    isAppScenarioMapping(m) {
      return !!(m && String(m.appTargetId || '').trim());
    }
  },
  OneToneHabitHub: {habitName: (m) => m.group || m.id},
  OneToneRuntimeHabitControl: {
    foregroundIdentity: () => ({matchedPresetAppId: 'cursor-chat'}),
    resolveActiveSceneId: () => 'app-cursor'
  },
  OneToneSettingsDrawer: {
    setPanel(panel) {
      savedPanels.push(panel);
    }
  },
  OneToneHabitScenarioContextBanner: {
    shouldShowWizardForPanel(panel) {
      return panel === 'keys' && context.OneToneState.ui.habitScenarioReturnPanel === 'keys';
    }
  },
  OneToneHabitHubShow: [],
  __els: {}
};
context.globalThis = context;
vm.createContext(context);

function makeEl(id) {
  return {
    id,
    hidden: true,
    className: '',
    innerHTML: '',
    classList: {
      _c: new Set(),
      add(c) { this._c.add(c); },
      remove(c) { this._c.delete(c); },
      toggle(c, on) { if (on) this._c.add(c); else this._c.delete(c); }
    },
    querySelector() { return null; },
    insertBefore() {}
  };
}

['habitScenarioContextBannerKeys', 'settingsPanelKeys', 'keysWorkflowTabsBar', 'settingsNavKeysLabel', 'keysScopeSwitch', 'softPadStatusBar', 'settingsPanelSoftPad', 'settingsNavSoftPadLabel'].forEach((id) => {
  context.__els[id] = makeEl(id);
});
context.__els.softPadStatusBar.insertBefore = function (node) {
  this._chrome = node;
  this.innerHTML = node.innerHTML || '';
};
context.__els.softPadStatusBar.querySelector = function (sel) {
  if (sel === '.settings-context-chrome') return null;
  return null;
};
context.__els.keysScopeSwitch.querySelector = function (sel) {
  if (sel === '.settings-scope-switch') {
    return context.__scopeSwitchEl || (context.__scopeSwitchEl = {
      addEventListener() {},
      querySelector(s) {
        if (s === '[data-settings-scope-toggle]') return {textContent: ''};
        if (s === '.settings-scope-switch__menu') return {innerHTML: ''};
        return null;
      }
    });
  }
  return null;
};
context.__els.keysWorkflowTabsBar.querySelector = function (sel) {
  if (sel === ':scope > .settings-context-chrome') return this._chrome || null;
  if (sel === '.page-status-bar-actions') {
    return {
      insertBefore(node) { this._hub = node; },
      firstChild: null,
      _hub: null
    };
  }
  if (sel === '.page-status-bar-main') {
    return {
      insertBefore(node) { this._chrome = node; },
      firstChild: null,
      _chrome: null
    };
  }
  return null;
};
context.__els.keysWorkflowTabsBar.insertBefore = function (node) {
  this._chrome = node;
  this.innerHTML = node.innerHTML || '';
};

vm.runInContext(
  readFileSync(new URL('../src/js/features/settings/settings-scope-switch.js', import.meta.url), 'utf8'),
  context,
  {filename: 'settings-scope-switch.js'}
);

vm.runInContext(
  readFileSync(new URL('../src/js/features/mapping/habit-channel-edit-banner.js', import.meta.url), 'utf8'),
  context,
  {filename: 'habit-channel-edit-banner.js'}
);

const Banner = context.OneToneHabitChannelEditBanner;
assert.ok(Banner);

const edit = Banner.resolveEditMapping();
assert.equal(edit.id, 'app-cursor');

const vs = Banner.resolveEditVsRuntime();
assert.equal(vs.aligned, true);

Banner.syncPanelContext('voiceWake');
assert.equal(context.OneToneState.ui.voiceEditSchemeId, 'app-cursor');

context.OneToneState.ui.settingsPanel = 'keys';
context.OneToneState.ui.habitScenarioReturnPanel = null;
Banner.renderAll();
const panel = context.__els.settingsPanelKeys;
assert.ok(panel.classList._c.has('has-settings-context-bar'));
assert.match(String(context.__els.keysWorkflowTabsBar._chrome?.innerHTML || ''), /settings-context-chrome__left/);
assert.match(String(context.__els.keysWorkflowTabsBar._chrome?.innerHTML || ''), /settings-context-chrome__actions/);

Banner.renderAll();
assert.match(String(context.__els.keysWorkflowTabsBar._chrome?.innerHTML || ''), /settings-context-chrome__left/, 'second renderAll keeps L1 chrome');

context.OneToneState.ui.habitScenarioReturnPanel = 'keys';
Banner.renderAll();
const banner = context.__els.habitScenarioContextBannerKeys;
assert.equal(banner.hidden, true, 'legacy banner hidden when unified L1 renders');
assert.ok(context.__els.settingsPanelKeys.classList._c.has('has-settings-context-bar'));
assert.match(String(context.__els.keysWorkflowTabsBar._chrome?.innerHTML || ''), /settings-scope-switch|keysScopeSwitch/);

context.OneToneRuntimeHabitControl.resolveActiveSceneId = () => 'base';
Banner.syncEditToRuntime();
assert.equal(context.OneToneState.ui.habitScenarioReturnId, null);
assert.equal(context.OneToneState.ui.voiceEditSchemeId, '__global__');

context.OneToneState.ui.settingsPanel = 'softPad';
context.OneToneSoftPadHub = {
  getSelectedScopeId: () => 'cursor',
  appTitleFor: () => 'Cursor',
  softPadScopeSwitchLabel: () => '切换 · Cursor',
  buildBindAppProps: () => ({scopes: [{id: 'cursor', title: 'Cursor', active: true}]}),
  renderSoftPadScopeMenuItems: () => '<button data-settings-scope-id="cursor">Cursor</button>'
};
Banner.renderAll();
assert.ok(context.__els.softPadStatusBar._chrome, 'softPad renders settings-context-chrome');
assert.match(String(context.__els.softPadStatusBar._chrome.innerHTML || ''), /softPadScopeSwitch|settings-scope-switch/);
assert.ok(context.__els.settingsPanelSoftPad.classList._c.has('has-settings-context-bar'), 'softPad panel flagged');

console.log('[habit-channel-edit-banner] all checks passed');
