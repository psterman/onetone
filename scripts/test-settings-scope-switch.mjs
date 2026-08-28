import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const context = {
  console,
  document: {
    documentElement: {lang: 'zh-CN'},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  },
  OneToneI18n: {getLang: () => 'zh', t: (k, fb) => fb || k},
  OneToneDom: {esc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')},
  OneToneState: {
    state: {
      config: {
        activeSceneId: 'base',
        mappings: [
          {id: 'base', group: '通用设置', appTargetId: '', enabled: true},
          {id: 'app-cursor', group: 'Cursor', appTargetId: 'cursor-chat', enabled: true, triggerKey: 'F13'},
          {id: 'app-codex', group: 'Codex 场景', appTargetId: 'codex-chat', enabled: true}
        ]
      },
      selectedMappingId: 'app-cursor'
    },
    ui: {
      settingsPanel: 'keys',
      habitScenarioReturnId: 'app-cursor',
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
    isAppScenarioMapping(m) {
      return !!(m && String(m.appTargetId || '').trim());
    },
    findGlobalBaselineMapping(cfg) {
      return cfg.mappings.find((m) => m.id === 'base') || null;
    }
  },
  OneToneHabitHub: {habitName: (m) => m.group || m.id},
  OneToneHabitChannelEditBanner: {
    resolveEditMapping() {
      return context.OneToneMappingCore.byId(context.OneToneState.ui.habitScenarioReturnId);
    },
    syncPanelContext() {},
    renderAll() {}
  },
  OneToneKeysPanelUi: {render() {}},
  OneToneSoftPadHub: {
    isAgentInstalledForAppId(appId) {
      return appId === 'cursor-chat';
    },
    iconHtmlForKind() {
      return '<img class="settings-scope-switch__icon-img" />';
    },
    kindForAppId(id) {
      if (id === 'cursor-chat') return 'cursor';
      if (id === 'codex-chat') return 'codex';
      return '';
    }
  }
};
context.globalThis = context;
vm.createContext(context);

vm.runInContext(
  readFileSync(new URL('../src/js/features/settings/settings-scope-switch.js', import.meta.url), 'utf8'),
  context,
  {filename: 'settings-scope-switch.js'}
);

const Scope = context.OneToneSettingsScopeSwitch;
assert.ok(Scope);

const scopes = Scope.listHabitScopes('keys');
assert.ok(scopes.some((s) => s.id === 'base'));
assert.ok(scopes.some((s) => s.id === 'app-cursor'));
assert.equal(scopes.some((s) => s.id === 'app-codex'), false, 'uninstalled unconfigured codex hidden');

assert.equal(Scope.currentScopeId('keys'), 'app-cursor');

assert.equal(Scope.selectHabitScope('base', 'keys'), true);
assert.equal(context.OneToneState.ui.habitScenarioReturnId, null);
assert.equal(context.OneToneState.ui.voiceEditSchemeId, '__global__');
assert.equal(context.OneToneState.state.selectedMappingId, 'base');

const menu = Scope.renderHabitScopeMenu('keys', 'app-cursor');
assert.match(menu, /data-settings-scope-add-custom/);
assert.match(Scope.renderHabitScopeMenu('softPad', 'cursor'), /data-settings-scope-add-custom/);
assert.ok(typeof Scope.openCustomAppForPanel === 'function');
assert.match(menu, /settings-scope-switch__row/);
assert.match(menu, /settings-scope-switch__icon-img/);
assert.match(Scope.renderScopeSwitchMount('keys', 'app-cursor'), /data-settings-scope-switch/);

const row = Scope.renderScopeMenuRow({
  id: 'test',
  panel: 'keys',
  name: 'Cursor',
  active: true,
  iconHtml: '<img class="settings-scope-switch__icon-img" />'
});
assert.match(row, /settings-scope-switch__row/);

context.OneToneSoftPadHub = {
  getSelectedScopeId: () => 'cursor',
  getSoftPadFace: () => 'pad',
  appTitleFor: (id) => (id === 'cursor' ? 'Cursor' : id),
  softPadScopeSwitchLabel: () => '切换 · Cursor',
  buildBindAppProps: () => ({
    scopes: [{id: 'cursor', title: 'Cursor', active: true}, {id: 'codex', title: 'Codex', active: false}]
  }),
  renderSoftPadScopeMenuItems: (id) => '<button data-settings-scope-id="' + id + '">x</button>',
  selectScope(id, opts) { this.lastScope = id; this.lastOpts = opts; },
  isAgentInstalledForAppId(appId) { return appId === 'cursor-chat'; },
  iconHtmlForKind() { return '<img class="settings-scope-switch__icon-img" />'; },
  kindForAppId(id) { return id === 'cursor-chat' ? 'cursor' : id === 'codex-chat' ? 'codex' : ''; }
};
let hubSelectCalls = 0;
const origSelect = context.OneToneSoftPadHub.selectScope;
context.OneToneSoftPadHub.selectScope = function (id, opts) {
  hubSelectCalls++;
  return origSelect.call(this, id, opts);
};
assert.equal(Scope.selectHabitScope('base', 'keys'), true);
assert.ok(hubSelectCalls >= 1, 'habit scope switch syncs soft pad scope');
assert.equal(Scope.currentScopeId('softPad'), 'cursor');
assert.equal(Scope.selectHabitScope('codex', 'softPad'), true);
assert.equal(context.OneToneSoftPadHub.lastScope, 'codex');

// document delegation survives repeated renderAll (no per-root scopeBound)
const docListeners = [];
context.document.addEventListener = function (type, fn) {
  if (type === 'click') docListeners.push(fn);
};
Scope.bindOnce();
assert.equal(docListeners.length, 1, 'bindOnce registers one document click handler');

const scopeMenu = { hidden: true, innerHTML: '' };
const menuItem = {
  getAttribute(k) {
    if (k === 'data-settings-scope-id') return 'base';
    if (k === 'data-settings-scope-panel') return 'keys';
    return null;
  },
  closest(sel) {
    if (sel === '[data-settings-scope-id]') return menuItem;
    if (sel === '.settings-scope-switch') return switchRoot;
    return null;
  }
};
const switchRoot = {
  className: '',
  classList: { _c: new Set(), toggle(c, on) { if (on) this._c.add(c); else this._c.delete(c); } },
  getAttribute(k) { return k === 'data-settings-scope-panel' ? 'keys' : null; },
  contains(node) { return node === toggleBtn || node === menuItem; },
  querySelector(sel) {
    if (sel === '.settings-scope-switch__menu') return scopeMenu;
    return null;
  }
};
const toggleBtn = {
  getAttribute(k) { return k === 'aria-expanded' ? 'false' : null; },
  setAttribute() {},
  closest(sel) {
    if (sel === '[data-settings-scope-toggle]') return toggleBtn;
    if (sel === '.settings-scope-switch') return switchRoot;
    return null;
  }
};
const clickEvt = {
  target: toggleBtn,
  preventDefault() {},
  stopPropagation() {}
};
docListeners[0](clickEvt);
assert.equal(scopeMenu.hidden, false, 'toggle opens scope menu after bindOnce');

console.log('[settings-scope-switch] all checks passed');
