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
    byId(id) {
      return context.OneToneState.state.config.mappings.find((m) => m.id === id) || null;
    }
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
  OneToneHabitHubShow: [],
  __els: {}
};
context.globalThis = context;
vm.createContext(context);

['habitScenarioContextBannerKeys', 'settingsPanelKeys'].forEach((id) => {
  context.__els[id] = {
    id,
    hidden: true,
    className: '',
    classList: {
      _c: new Set(),
      add(c) {
        this._c.add(c);
      },
      remove(c) {
        this._c.delete(c);
      },
      toggle(c, on) {
        if (on) this._c.add(c);
        else this._c.delete(c);
      }
    },
    innerHTML: ''
  };
});

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
assert.equal(context.OneToneState.state.selectedMappingId, 'app-cursor');

context.OneToneState.ui.settingsPanel = 'keys';
Banner.renderAll();
const banner = context.__els.habitScenarioContextBannerKeys;
assert.equal(banner.hidden, false);
assert.match(banner.innerHTML, /正在编辑：Cursor/);
assert.match(banner.innerHTML, /data-habit-edit-switch-hub/);
assert.match(banner.innerHTML, /data-habit-edit-follow-runtime/);

context.OneToneRuntimeHabitControl.resolveActiveSceneId = () => 'base';
Banner.syncEditToRuntime();
assert.equal(context.OneToneState.ui.habitScenarioReturnId, null);
assert.equal(context.OneToneState.ui.voiceEditSchemeId, '__global__');
assert.equal(context.OneToneState.ui.cameraEditMode, 'global');

context.OneToneState.ui.habitScenarioReturnId = null;
context.OneToneState.ui.voiceEditSchemeId = '__global__';
context.OneToneState.state.selectedMappingId = 'base';
context.OneToneRuntimeHabitControl.resolveActiveSceneId = () => 'app-cursor';
assert.equal(Banner.ensureEditContextFromRuntime(), true);
assert.equal(context.OneToneState.ui.habitScenarioReturnId, 'app-cursor');
assert.equal(context.OneToneState.ui.voiceEditSchemeId, 'app-cursor');

context.OneToneState.ui.habitScenarioReturnId = 'app-cursor';
context.OneToneRuntimeHabitControl.resolveActiveSceneId = () => 'base';
assert.equal(Banner.ensureEditContextFromRuntime(), true);
assert.equal(context.OneToneState.ui.habitScenarioReturnId, 'app-cursor');

console.log('[habit-channel-edit-banner] all checks passed');
