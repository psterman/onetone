'use strict';

/**
 * Preset app single-scenario: canonical selector, reconcile, enable mutual exclusion.
 * Run: node scripts/habit-hub-preset-scenario.test.js
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadScript(rel, sandbox) {
  vm.runInNewContext(read(rel), sandbox, { filename: rel });
}

var hubSrc = read('src/js/features/mapping/habit-hub.js');
assert.ok(hubSrc.includes('function listAppScenarios'));
assert.ok(hubSrc.includes('function pickCanonicalAppScenario'));
assert.ok(hubSrc.includes('function reconcileDuplicatePresetScenarios'));
assert.ok(hubSrc.includes('function disableSiblingPresetScenarios'));
assert.ok(hubSrc.indexOf('except Codex, which allows multiple') < 0);

// Mirror scenarioBetter for rank regression
function scenarioBetter(a, b) {
  if (!b) return true;
  if (!a) return false;
  var aEn = a.enabled !== false ? 1 : 0;
  var bEn = b.enabled !== false ? 1 : 0;
  if (aEn !== bEn) return aEn > bEn;
  var aPad = a.codexMicroPad && a.codexMicroPad.enabled ? 1 : 0;
  var bPad = b.codexMicroPad && b.codexMicroPad.enabled ? 1 : 0;
  if (aPad !== bPad) return aPad > bPad;
  var aOv = a.codexMicroPad && a.codexMicroPad.overlayEnabled ? 1 : 0;
  var bOv = b.codexMicroPad && b.codexMicroPad.overlayEnabled ? 1 : 0;
  if (aOv !== bOv) return aOv > bOv;
  var aOrd = Number(a.order) || 0;
  var bOrd = Number(b.order) || 0;
  if (aOrd !== bOrd) return aOrd < bOrd;
  return String(a.id || '') < String(b.id || '');
}

function pickCanonical(candidates) {
  if (!candidates || !candidates.length) return null;
  var best = candidates[0];
  for (var i = 1; i < candidates.length; i++) {
    if (scenarioBetter(candidates[i], best)) best = candidates[i];
  }
  return best;
}

var disabledPadOn = {
  id: 'm-a',
  enabled: false,
  codexMicroPad: { enabled: true, overlayEnabled: true },
  order: 0
};
var enabledPadOff = {
  id: 'm-b',
  enabled: true,
  codexMicroPad: { enabled: false },
  order: 99
};
assert.strictEqual(
  pickCanonical([disabledPadOn, enabledPadOff]).id,
  'm-b',
  'canonical prefers enabled over pad.on when first in array is loser'
);

var saveCalls = 0;
var toastMsgs = [];
var mappings = [
  {
    id: 'm-codex-loser',
    appTargetId: 'codex-chat',
    enabled: true,
    codexMicroPad: { enabled: false },
    order: 0
  },
  {
    id: 'm-codex-winner',
    appTargetId: 'codex-chat',
    enabled: true,
    codexMicroPad: { enabled: true },
    order: 1
  },
  {
    id: 'm-custom-a',
    appTargetId: 'custom',
    enabled: true,
    order: 2
  },
  {
    id: 'm-custom-b',
    appTargetId: 'custom',
    enabled: true,
    order: 3
  }
];

var st = {
  selectedMappingId: 'm-codex-loser',
  config: {
    mappings: mappings,
    activeSceneId: 'm-codex-loser'
  }
};

var sb = {
  window: {},
  console: console,
  global: {},
  document: {
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; }
  }
};
sb.window = sb.global;
sb.global.document = sb.document;
sb.global.OneToneDom = { $: function () { return null; } };
sb.global.OneToneState = {
  state: st,
  ui: { habitHubCreating: false }
};
sb.global.OneToneMappingCore = {
  ensureConfig: function () {},
  byId: function (id) {
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i].id === id) return mappings[i];
    }
    return null;
  },
  newMappingId: function () {
    return 'm-new-' + mappings.length;
  },
  ensureMappingExtras: function () {}
};
sb.global.OneToneHabitOverrideDiff = {
  isAppScenarioMapping: function (m) {
    return !!(m && m.appTargetId);
  },
  findGlobalBaselineMapping: function () {
    return null;
  }
};
sb.global.OneToneAppTargetPresets = {
  presets: [{ id: 'codex-chat' }, { id: 'cursor-chat' }],
  presetById: function (id) {
    return id === 'codex-chat' ? { id: 'codex-chat', nameKey: 'appTargetCodex' } : null;
  }
};
sb.global.OneToneI18n = {
  t: function (k, fb) {
    return fb || k;
  }
};
sb.global.OneToneConfigPersist = {
  save: function () {
    saveCalls++;
  }
};
sb.global.OneToneAppToast = {
  show: function (msg) {
    toastMsgs.push(msg);
  }
};

loadScript('src/js/features/mapping/habit-hub.js', sb);
var H = sb.global.OneToneHabitHub;
assert.ok(H);

assert.strictEqual(
  H.findAppScenarioByAppId('codex-chat').id,
  'm-codex-winner',
  'findAppScenarioByAppId uses canonical not array order'
);

var r1 = H.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.ok(r1.changed, 'reconcile changes duplicate preset scenarios');
assert.strictEqual(mappings[0].enabled, false, 'loser disabled');
assert.strictEqual(st.selectedMappingId, 'm-codex-winner', 'selectedMappingId redirected');
assert.strictEqual(st.config.activeSceneId, 'm-codex-winner', 'activeSceneId redirected');
assert.strictEqual(saveCalls, 1, 'reconcile persists once');

saveCalls = 0;
var r2 = H.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.strictEqual(r2.changed, false, 'reconcile idempotent second run');
assert.strictEqual(saveCalls, 0, 'no second persist');

mappings[0].enabled = true;
var created = H.createAppScenario('codex-chat');
assert.strictEqual(created.id, 'm-codex-winner', 'second create returns existing');
assert.strictEqual(mappings.filter(function (m) {
  return m.appTargetId === 'codex-chat';
}).length, 2, 'no third codex mapping added');

assert.strictEqual(H.listAppScenarios('custom').length, 0, 'custom excluded from preset list helper');
assert.strictEqual(
  mappings.filter(function (m) {
    return m && m.appTargetId === 'custom';
  }).length,
  2,
  'custom multi-scenario data unchanged'
);

console.log('habit-hub-preset-scenario.test.js: ok');
