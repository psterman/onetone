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
  sorted: function () {
    return mappings.slice();
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
assert.strictEqual(mappings.filter(function (m) {
  return m.appTargetId === 'codex-chat';
}).length, 1, 'duplicate preset rows removed');
assert.strictEqual(mappings.find(function (m) {
  return m.appTargetId === 'codex-chat';
}).id, 'm-codex-winner', 'canonical row kept');
assert.strictEqual(st.selectedMappingId, 'm-codex-winner', 'selectedMappingId redirected');
assert.strictEqual(st.config.activeSceneId, 'm-codex-winner', 'activeSceneId redirected');
assert.strictEqual(saveCalls, 1, 'reconcile persists once');

saveCalls = 0;
var r2 = H.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.strictEqual(r2.changed, false, 'reconcile no-op when no duplicates remain');
assert.strictEqual(saveCalls, 0, 'no persist when unchanged');

mappings.push({
  id: 'm-codex-extra',
  appTargetId: 'codex-chat',
  enabled: false,
  voiceOverride: { targetKey: 'Win+H' },
  order: 9
});
saveCalls = 0;
var r3 = H.reconcileDuplicatePresetScenarios({ skipToast: true });
assert.ok(r3.changed, 'reconcile runs again after a new duplicate');
assert.strictEqual(mappings.filter(function (m) {
  return m.appTargetId === 'codex-chat';
}).length, 1, 'new duplicate folded away');
assert.strictEqual(
  mappings.find(function (m) { return m.appTargetId === 'codex-chat'; }).voiceOverride.targetKey,
  'Win+H',
  'empty winner takes loser voiceOverride'
);
assert.strictEqual(saveCalls, 1, 'reconcile persists on re-merge');

var created = H.createAppScenario('codex-chat');
assert.strictEqual(created.id, 'm-codex-winner', 'second create returns existing');
assert.strictEqual(mappings.filter(function (m) {
  return m.appTargetId === 'codex-chat';
}).length, 1, 'no extra codex mapping added');

var winnerRow = mappings.find(function (m) { return m.id === 'm-codex-winner'; });
winnerRow.enabled = false;
var revived = H.createAppScenario('codex-chat');
assert.strictEqual(revived.id, 'm-codex-winner', 'create returns disabled canonical');
assert.strictEqual(revived.enabled, true, 'create re-enables disabled preset scenario');
assert.strictEqual(mappings.filter(function (m) {
  return m.appTargetId === 'codex-chat';
}).length, 1, 'revive does not spawn a sibling');

var savedMappings = mappings.slice();
mappings.length = 0;
mappings.push(
  { id: 'm-cursor-a', appTargetId: 'cursor-chat', enabled: true, order: 0 },
  { id: 'm-cursor-b', appTargetId: 'cursor-chat', enabled: true, order: 1 }
);
assert.ok(H.disableSiblingPresetScenarios(mappings[1]), 'disableSibling disables other preset rows');
assert.strictEqual(mappings[0].enabled, false, 'sibling disabled');
assert.strictEqual(mappings[1].enabled, true, 'except mapping stays enabled');
mappings.length = 0;
savedMappings.forEach(function (m) { mappings.push(m); });

// --- manual scene pin (foreground must not override pinned 通用) ---
var pinMappings = [
  { id: 'm-base', appTargetId: 'custom', enabled: true, order: 0 },
  { id: 'm-cursor', appTargetId: 'cursor-chat', enabled: true, order: 1 }
];
var pinSt = {
  config: {
    mappings: pinMappings,
    activeSceneId: 'm-cursor',
    followForegroundAppScenario: true
  }
};
var pinSb = {
  window: {},
  console: console,
  global: {},
  document: { querySelector: function () { return null; } },
  requestAnimationFrame: function (fn) { fn(); }
};
pinSb.window = pinSb.global;
pinSb.global.OneToneState = { state: pinSt };
pinSb.global.OneToneI18n = { t: function (k) { return k; } };
pinSb.global.OneToneAppToast = { show: function () {} };
pinSb.global.OneToneMappingCore = {
  byId: function (id) {
    for (var i = 0; i < pinMappings.length; i++) {
      if (pinMappings[i].id === id) return pinMappings[i];
    }
    return null;
  },
  isSaved: function () { return true; }
};
pinSb.global.OneToneHabitProfile = { isLibraryHabit: function () { return true; } };
pinSb.global.OneToneHabitOverrideDiff = {
  isGlobalBaselineMapping: function (m) {
    return !!(m && m.id === 'm-base');
  }
};
pinSb.global.chrome = { webview: { postMessage: function () {} } };
loadScript('src/js/features/scene/scene-activate.js', pinSb);
var SA = pinSb.global.OneToneSceneActivate;
assert.ok(SA);

SA.activateScene('m-base', { source: 'manual' });
assert.strictEqual(pinSt.config.activeSceneId, 'm-base', 'manual baseline activates');
assert.ok(SA.isManualScenePinned(), 'manual baseline pins scene');

var fgBlocked = false;
try {
  SA.activateScene('m-cursor', { source: 'foreground' });
} catch (e) {
  fgBlocked = true;
}
assert.strictEqual(pinSt.config.activeSceneId, 'm-base', 'foreground blocked while baseline pinned');
assert.ok(!fgBlocked, 'foreground skip is silent');

SA.activateScene('m-cursor', { source: 'manual' });
assert.strictEqual(pinSt.config.activeSceneId, 'm-cursor', 'manual app scenario activates');
assert.ok(!SA.isManualScenePinned(), 'manual app scenario clears pin');

SA.activateScene('m-cursor', { source: 'foreground' });
assert.strictEqual(pinSt.config.activeSceneId, 'm-cursor', 'foreground noop when already on target');
pinSt.config.activeSceneId = 'm-base';
SA.activateScene('m-cursor', { source: 'foreground' });
assert.strictEqual(pinSt.config.activeSceneId, 'm-cursor', 'foreground follows after pin cleared');

assert.strictEqual(H.listAppScenarios('custom').length, 0, 'custom excluded from preset list helper');
assert.strictEqual(
  mappings.filter(function (m) {
    return m && m.appTargetId === 'custom';
  }).length,
  2,
  'custom multi-scenario data unchanged'
);

console.log('habit-hub-preset-scenario.test.js: ok');
