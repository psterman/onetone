/**
 * Preset app + universal = one scenario: trigger retarget stays in place; reconcile folds forks.
 * Only appTargetId=custom may still use forkMappingForTrigger.
 * Run: node scripts/test-trigger-habit-fork.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const recSrc = read('src/js/features/mapping/mapping-recording.js');
assert.ok(
  recSrc.includes("mayFork=appId==='custom'") ||
    recSrc.includes('mayFork = appId === \'custom\''),
  'recording only forks custom appTargetId'
);
assert.ok(recSrc.includes('retarget') || recSrc.includes('stay one row'));

const mappings = [
  {
    id: 'm1',
    appTargetId: 'cursor-chat',
    triggerKey: 'XButton1',
    targetKey: 'RAlt',
    group: 'Cursor · XButton1',
    agentBindings: [{ slotId: 'a', actionId: 'input.start', triggerType: 'key', triggerBinding: 'F8' }],
    enabled: true,
    order: 0
  }
];
const state = {
  selectedMappingId: 'm1',
  config: { mappings, activeSceneId: 'm1', intervalMs: 1200, enterDelayMs: 5000 }
};

const sandbox = {
  console,
  document: {
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  },
  OneToneDom: { $: function () { return null; } },
  OneToneI18n: { t: function (k, fb) { return fb || k; } },
  OneToneState: { state, ui: { habitHubCreating: false } },
  OneToneAppKeyUtils: {
    // Mirror production: empty / Volume_* → AutoTrigger (the false-conflict source).
    normalizeTriggerKey: function (k) {
      if (!k) return 'AutoTrigger';
      var v = String(k).trim();
      if (/^Volume_/i.test(v) || /^AudioVolume/i.test(v)) return 'AutoTrigger';
      return v;
    },
    friendlyKeyName: function (k) {
      return k;
    }
  },
  OneToneAppTargetPresets: {
    displayName: function (id) {
      return id === 'cursor-chat' ? 'Cursor' : id;
    },
    presets: [{ id: 'cursor-chat', name: 'Cursor' }, { id: 'codex-chat', name: 'Codex' }]
  },
  __vp_mapping_core_hooks__: {
    ensureConfig: function () {},
    friendlyKeyName: function (k) { return k; },
    flushAllEditorToMappings: function () {},
    syncEditorFromSelection: function () {},
    render: function () {}
  }
};
sandbox.global = sandbox;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(read('src/js/features/mapping/mapping-core.js'), sandbox, {
  filename: 'mapping-core.js'
});
const Core = sandbox.OneToneMappingCore;
assert.ok(Core.findMappingByAppAndTrigger);
assert.ok(Core.forkMappingForTrigger);

assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'XButton1', 'other').id,
  'm1',
  'find existing by app+trigger'
);

// Empty trigger peers must not own AutoTrigger / Volume_Up.
mappings.push({
  id: 'empty-peer',
  appTargetId: 'cursor-chat',
  triggerKey: '',
  targetKey: '',
  targetActions: [],
  captureHeroRef: { kind: 'customKey' },
  enabled: false,
  order: 1
});
assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'Volume_Up', 'm-recording'),
  null,
  'unset trigger peers must not conflict with Volume_/AutoTrigger'
);
assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'AutoTrigger', 'm-recording'),
  null,
  'unset trigger peers must not conflict with AutoTrigger token'
);
mappings.push({
  id: 'real-auto',
  appTargetId: 'cursor-chat',
  triggerKey: 'AutoTrigger',
  sourceKey: 'Volume_Up',
  targetKey: 'RAlt',
  enabled: true,
  order: 2
});
assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'Volume_Up', 'm-recording').id,
  'real-auto',
  'explicit AutoTrigger still conflicts with Volume_Up'
);
// Drop extras so later reconcile assertions stay on m1 alone.
mappings.length = 1;

// API still forks when called directly (custom path); reconcile will fold presets.
const before = mappings.length;
const forked = Core.forkMappingForTrigger(mappings[0], 'XButton2');
assert.ok(forked);
assert.equal(mappings.length, before + 1, 'fork API still pushes');
assert.equal(forked.triggerKey, 'XButton2');

sandbox.OneToneHabitOverrideDiff = {
  findGlobalBaselineMapping: function () {
    return null;
  },
  isGlobalBaselineMapping: function () {
    return false;
  },
  isAppScenarioMapping: function (m) {
    return !!(m && m.appTargetId);
  }
};
sandbox.OneToneConfigPersist = {
  save: function () {},
  forgetAppScenarioIds: function () {}
};
sandbox.OneToneAppToast = { show: function () {} };
vm.runInNewContext(read('src/js/features/mapping/habit-hub.js'), sandbox, {
  filename: 'habit-hub.js'
});
const Hub = sandbox.OneToneHabitHub;

// Selected m1 wins; XButton2 fork folds away; trigger stays on selected row.
const r = Hub.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.ok(r.changed, 'different hardware triggers merge into one');
assert.equal(
  mappings.filter(function (m) {
    return m.appTargetId === 'cursor-chat';
  }).length,
  1,
  'one Cursor row after reconcile'
);
assert.equal(mappings[0].id, 'm1', 'selected row kept');
assert.equal(mappings[0].triggerKey, 'XButton1', 'selected trigger preferred');

// Push a second hardware Cursor + AutoTrigger — still one after reconcile
mappings.push({
  id: 'm-vk',
  appTargetId: 'cursor-chat',
  triggerKey: 'VK_11',
  targetKey: 'RAlt',
  enabled: true,
  order: 5,
  captureHeroRef: { channel: 'voice', bindingRef: 'cancel', actionId: 'input.cancel', kind: 'action' }
});
mappings.push({
  id: 'm-auto',
  appTargetId: 'cursor-chat',
  triggerKey: 'AutoTrigger',
  targetKey: 'RAlt',
  enabled: true,
  order: 20
});
state.selectedMappingId = 'm-vk';
state.config.activeSceneId = 'm-vk';
const r2 = Hub.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.ok(r2.changed, 'multi-trigger Cursor fold');
assert.equal(
  mappings.filter(function (m) {
    return m.appTargetId === 'cursor-chat';
  }).length,
  1,
  'still one Cursor'
);
assert.equal(mappings.find(function (m) { return m.appTargetId === 'cursor-chat'; }).id, 'm-vk');
assert.equal(
  mappings[0].triggerKey,
  'VK_11',
  'in-use trigger adopted'
);
assert.ok(mappings[0].captureHeroRef, 'captureHeroRef folded onto winner');

console.log('test-trigger-habit-fork: ok');
