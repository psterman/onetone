import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const context = {
  console,
  document: {documentElement: {lang: 'zh-CN'}},
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v))
  },
  OneToneI18n: {getLang: () => 'zh', t: (k, fb) => fb || k},
  OneToneState: {
    state: {
      config: {
        activeSceneId: 'base',
        followForegroundAppScenario: true,
        runtimeHabitControl: {softOverride: null, pin: null},
        mappings: [
          {id: 'base', group: '通用设置', appTargetId: '', enabled: true, triggerKey: 'F8', targetKey: 'RAlt'},
          {id: 'app-cursor', group: 'Cursor', appTargetId: 'cursor-chat', enabled: true, triggerKey: 'F9', targetKey: 'Enter'}
        ]
      },
      selectedMappingId: 'base'
    },
    ui: {}
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
  OneToneHabitProfile: {habitDisplayName: (m) => m.group || m.id},
  OneToneAppBehaviorRules: {appDisplayName: (id) => (id === 'cursor-chat' ? 'Cursor' : id)},
  OneToneConfigPersist: {save() {}, saveAsync: async () => {}},
  OneToneAppToast: {show() {}},
  OneToneHabitHub: {
    findAppScenarioForIdentity(identity) {
      const app = String(identity.matchedPresetAppId || '').trim();
      if (app === 'cursor-chat') return {id: 'app-cursor'};
      return null;
    },
    scheduleHubPaint() {}
  }
};
context.globalThis = context;
vm.createContext(context);

for (const file of [
  'src/js/features/scene/runtime-habit-control.js',
  'src/js/features/mapping/habit-shared.js'
]) {
  vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context, {filename: file});
}

const RT = context.OneToneRuntimeHabitControl;
const Shared = context.OneToneHabitShared;

const fgA = {fullPath: 'C:\\Apps\\Cursor.exe', windowClass: 'Chrome_WidgetWin_1', matchedPresetAppId: 'cursor-chat'};
const fgB = {fullPath: 'C:\\Apps\\Other.exe', windowClass: 'OtherClass', matchedPresetAppId: ''};

assert.equal(RT.fgSignatureFromIdentity(fgA), 'c:\\apps\\cursor.exe\0Chrome_WidgetWin_1');

RT.setSoftOverride('app-cursor', fgA, {skipPersist: true});
assert.equal(RT.resolveActiveSceneId(fgA, {skipPersist: true}), 'app-cursor');
assert.equal(RT.resolveRuntimeHabitDisplay(fgA).mode, 'softOverride');

assert.notEqual(RT.resolveActiveSceneId(fgB, {skipPersist: true}), 'app-cursor');
assert.equal(RT.resolveRuntimeHabitDisplay(fgB).mode, 'auto');

RT.setPinHabit('base', {skipPersist: true});
assert.equal(RT.resolveActiveSceneId(fgA, {skipPersist: true}), 'base');
assert.equal(RT.resolveRuntimeHabitDisplay(fgA).mode, 'pinHabit');

RT.clearPin({skipPersist: true});
RT.setPinAppHabit('cursor-chat', 'app-cursor', {skipPersist: true});
assert.equal(RT.resolveActiveSceneId(fgA, {skipPersist: true}), 'app-cursor');

let deleted = false;
const orig = context.OneToneConfigPersist.save;
context.OneToneConfigPersist.save = () => { deleted = true; };
Shared.deleteMapping('base');
assert.equal(deleted, false, 'baseline delete blocked');

Shared.resetBaselineMapping();
const base = context.OneToneMappingCore.byId('base');
assert.equal(base.triggerKey, '');
assert.equal(base.voiceOverride, null);

console.log('[runtime-habit-control] assertions passed');
