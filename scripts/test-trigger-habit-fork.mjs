/**
 * Trigger-key habit fork: new trigger forks a mapping; same trigger reuses.
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
    normalizeTriggerKey: function (k) { return String(k || '').trim(); },
    friendlyKeyName: function (k) { return k; }
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
assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'XButton1', 'm1'),
  null,
  'except self'
);
assert.equal(
  Core.findMappingByAppAndTrigger('cursor-chat', 'XButton2'),
  null,
  'missing trigger returns null'
);

const before = mappings.length;
const forked = Core.forkMappingForTrigger(mappings[0], 'XButton2');
assert.ok(forked);
assert.equal(mappings.length, before + 1, 'fork pushes new mapping');
assert.equal(mappings[0].triggerKey, 'XButton1', 'old trigger preserved');
assert.equal(forked.triggerKey, 'XButton2');
assert.equal(forked.appTargetId, 'cursor-chat');
assert.ok(String(forked.group).includes('XButton2'), 'fork named with trigger');
assert.equal(forked.agentBindings.length, 1, 'bindings copied');
assert.notEqual(forked.id, 'm1');

const hit = Core.findMappingByAppAndTrigger('cursor-chat', 'XButton2');
assert.equal(hit.id, forked.id, 'new fork found by app+trigger');

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
sandbox.OneToneAppTargetPresets = {
  displayName: function (id) {
    return id === 'cursor-chat' ? 'Cursor' : id;
  },
  presets: [{ id: 'cursor-chat', name: 'Cursor' }, { id: 'codex-chat', name: 'Codex' }]
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
const r = Hub.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.equal(r.changed, false, 'different triggers not merged');
assert.equal(
  mappings.filter(function (m) {
    return m.appTargetId === 'cursor-chat';
  }).length,
  2,
  'both trigger schemes remain'
);

// Same trigger duplicates still merge
mappings.push({
  id: 'm-dup',
  appTargetId: 'cursor-chat',
  triggerKey: 'XButton2',
  targetKey: 'RAlt',
  enabled: false,
  order: 9
});
const r2 = Hub.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.ok(r2.changed, 'same-trigger duplicate merges');
assert.equal(
  mappings.filter(function (m) {
    return m.appTargetId === 'cursor-chat' && m.triggerKey === 'XButton2';
  }).length,
  1,
  'one row per app+trigger'
);

console.log('test-trigger-habit-fork: ok');
