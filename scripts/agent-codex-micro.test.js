#!/usr/bin/env node
'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');

global.window = global;
global.OneToneI18n = { lang: function () { return 'zh-CN'; }, t: function (k, f) { return f || k; } };
require(path.join(__dirname, '../src/js/features/agent/agent-actions.js'));
require(path.join(__dirname, '../src/js/features/agent/agent-scenario-template.js'));

var A = global.OneToneAgentActions;
var T = global.OneToneAgentScenarioTemplate;
assert.ok(A && T);

// scenarioAllKeys: 13 keys on, voice essentials only
var allKeys = A.buildCodexMicro13Bindings({ enableProfile: 'scenarioAllKeys' });
var keyBindings = allKeys.filter(function (b) { return b.triggerType === 'key'; });
assert.equal(keyBindings.length, 13);
keyBindings.forEach(function (b) {
  assert.ok(b.triggerBinding, 'key binding recommended for ' + b.slotId);
  assert.equal(b.triggerBinding, A.defaultKeyForSlot(b.slotId));
  assert.equal(b.enabled, true, 'key enabled for ' + b.slotId);
});
assert.equal(A.defaultKeyForSlot('summonCodex'), 'Ctrl+Shift+P');
assert.equal(A.defaultKeyForSlot('commandPalette'), 'Ctrl+K');

var voiceOn = allKeys.filter(function (b) { return b.triggerType === 'voice' && b.enabled; });
assert.equal(voiceOn.length, A.essentialSlots().length);
voiceOn.forEach(function (b) {
  assert.ok(A.isEssentialSlot(b.slotId), 'voice only essentials: ' + b.slotId);
  assert.ok(b.triggerBinding, 'voice phrase for ' + b.slotId);
});
assert.ok(!allKeys.some(function (b) {
  return b.triggerType === 'voice' && b.slotId === 'permissions' && b.enabled;
}), 'permissions voice stays off');

// scenarioEssentials still 5 for both channels
var scen = A.buildCodexMicro13Bindings({ enableProfile: 'scenarioEssentials' });
var scenKeyOn = scen.filter(function (b) { return b.triggerType === 'key' && b.enabled; });
var scenVoiceOn = scen.filter(function (b) { return b.triggerType === 'voice' && b.enabled; });
assert.equal(scenKeyOn.length, 5);
assert.equal(scenVoiceOn.length, 5);

// globalSafe still 3
var safe = A.buildCodexMicro13Bindings({ enableProfile: 'globalSafe' });
var safeOn = safe.filter(function (b) { return b.enabled; });
assert.equal(safeOn.length, 6); // 3 key + 3 voice
safeOn.forEach(function (b) {
  assert.ok(A.isGlobalSafeSlot(b.slotId));
});

// Slash display helpers (do not change chord semantics)
assert.equal(A.insertTextForSlot('plan'), '/plan');
assert.equal(A.slotSubForDisplay('plan', 'Ctrl+Alt+P'), '插入 /plan');
assert.equal(A.displayActionForSlot('plan', 'Ctrl+Alt+P'), '插入 /plan');
assert.equal(A.slotSubForDisplay('commandPalette', 'Ctrl+K'), 'Ctrl+K');
assert.equal(A.insertTextForSlot('status'), '/status');

// Multi-scenario: createNew always creates; openExisting reuses
var createdList = [];
global.OneToneHabitHub = {
  findAppScenarioByAppId: function () {
    return createdList[0] || null;
  },
  createAppScenario: function (appId) {
    var m = {
      id: 'm-' + createdList.length,
      appTargetId: appId,
      agentBindings: [],
      voiceCommands: [],
      cameraOverride: null,
      triggerKey: 'F8',
      targetKey: 'Ctrl+I'
    };
    createdList.push(m);
    return m;
  }
};
global.OneToneAppBehaviorRules = { ensureRules: function () {}, ensurePrimaryAppRule: function () {} };
global.OneToneConfigPersist = { saveAsync: function () {} };
global.OneToneUiFeedback = { toast: function () {} };

var a = T.createNewCodexScenario();
var b = T.createNewCodexScenario();
assert.ok(a && b);
assert.notEqual(a.mapping.id, b.mapping.id, 'two Codex workflows');
assert.equal(createdList.length, 2);

var opened = T.findOrCreateCodexScenario();
assert.equal(opened.mapping.id, createdList[0].id, 'recommend reuses first');
assert.equal(opened.created, false);

// ensurePackForMapping seeds with scenarioAllKeys
var empty = {
  id: 'm-empty',
  appTargetId: 'codex-chat',
  agentBindings: [],
  triggerKey: 'VolUp',
  targetKey: 'Ctrl+Win'
};
T.ensurePackForMapping(empty, { persist: false });
assert.ok(T.hasCodexPack(empty));
assert.equal(empty.triggerKey, 'VolUp');
assert.equal(empty.targetKey, 'Ctrl+Win');
empty.agentBindings.filter(function (x) { return x.triggerType === 'key'; }).forEach(function (x) {
  assert.ok(x.triggerBinding, 'seeded key for ' + x.slotId);
  assert.equal(x.enabled, true, 'all keys enabled for ' + x.slotId);
});
var emptyVoiceOn = empty.agentBindings.filter(function (x) {
  return x.triggerType === 'voice' && x.enabled;
});
assert.equal(emptyVoiceOn.length, A.essentialSlots().length);

// Backfill empty keys on older packs
var legacy = {
  id: 'm-legacy',
  appTargetId: 'codex-chat',
  agentTemplateId: A.TEMPLATE_ID,
  agentBindings: [
    { slotId: 'summonCodex', actionId: 'openAgent', triggerType: 'key', triggerBinding: '', enabled: true }
  ]
};
assert.ok(T.fillEmptyKeyDefaults(legacy));
assert.equal(legacy.agentBindings[0].triggerBinding, 'Ctrl+Shift+P');

// ACT07 face copy = 命令菜单
var layout = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../src/data/codex-micro-pad-layout.json'), 'utf8'));
var act07 = layout.cells.find(function (c) { return c.microKeyId === 'ACT07'; });
assert.ok(act07);
assert.equal(act07.uiLabelZh, '命令菜单');
assert.equal(act07.uiLabelEn, 'Command palette');
assert.equal(act07.defaultSlotId, 'commandPalette');

var padSrc = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert.ok(padSrc.indexOf("uiLabelZh: '命令菜单'") >= 0);
assert.ok(padSrc.indexOf('function slotSubForDisplay') >= 0);
assert.ok(padSrc.indexOf('function chordForSlot') >= 0);
assert.ok(padSrc.indexOf("uiLabelZh: '批准'") < 0);

// Capability UI: load recommended keys, no recording main path
var capSrc = fs.readFileSync(path.join(__dirname, '../src/js/features/agent/agent-capability-ui.js'), 'utf8');
assert.ok(capSrc.indexOf("TARGET_SLOT_IDS = ['summonCodex'") >= 0);
assert.ok(capSrc.indexOf("'cancel'") >= 0 && capSrc.indexOf('FINISH_SLOT_IDS') >= 0);
assert.ok(capSrc.indexOf('codex-cap-item') >= 0);
assert.ok(capSrc.indexOf('selectCapabilityForKeycap') >= 0);
assert.ok(capSrc.indexOf('applyRecognitionOverlay') >= 0);
assert.ok(capSrc.indexOf('findChordConflict') >= 0);
assert.ok(capSrc.indexOf('startAgentBinding') >= 0);
assert.ok(capSrc.indexOf('function startRecord') >= 0);
assert.ok(capSrc.indexOf('套用 Codex 推荐') < 0);
assert.ok(capSrc.indexOf('slotSubForDisplay') >= 0);

// Conflict helper: duplicate chords rejected
var conflictMap = {
  id: 'm-conflict',
  appTargetId: 'codex-chat',
  triggerKey: 'F8',
  targetKey: 'RAlt',
  agentBindings: [
    { slotId: 'summonCodex', actionId: 'openAgent', triggerType: 'key', triggerBinding: 'Ctrl+Shift+P', enabled: true },
    { slotId: 'status', actionId: 'status', triggerType: 'key', triggerBinding: 'Ctrl+Alt+S', enabled: true }
  ]
};
// Load capability UI after stubbing DOM-light globals
require(path.join(__dirname, '../src/js/features/agent/agent-capability-ui.js'));
var Cap = global.OneToneAgentCapabilityUi;
assert.ok(Cap && Cap.findChordConflict);
var c1 = Cap.findChordConflict(conflictMap, 'Ctrl+Shift+P', 'status');
assert.ok(c1 && c1.slotId === 'summonCodex');
var c2 = Cap.findChordConflict(conflictMap, 'RAlt', 'summonCodex');
assert.ok(c2 && c2.kind === 'ime');
var c3 = Cap.findChordConflict(conflictMap, 'Ctrl+Alt+P', 'plan');
assert.equal(c3, null);

// Hub: no main-row apply CTA; has more-menu reset; t fallback; scenarioAllKeys
var hubSrc = fs.readFileSync(path.join(__dirname, '../src/js/features/mapping/habit-hub.js'), 'utf8');
assert.ok(hubSrc.indexOf('data-habit-codex-apply-card') < 0);
assert.ok(hubSrc.indexOf('habit-hub-more-menu') >= 0);
assert.ok(hubSrc.indexOf('function(key, fb)') >= 0 || hubSrc.indexOf('function(key,fb)') >= 0);
assert.ok(hubSrc.indexOf("appId!=='codex-chat'") >= 0);
assert.ok(hubSrc.indexOf("enableProfile:'scenarioAllKeys'") >= 0);

// Keys page remounts on step change
var keysState = fs.readFileSync(path.join(__dirname, '../src/js/features/mapping/keys-page-state.js'), 'utf8');
assert.ok(keysState.indexOf('mountKeys') >= 0);

// i18n keys present
var i18n = fs.readFileSync(path.join(__dirname, '../src/js/core/i18n.js'), 'utf8');
assert.ok(i18n.indexOf('habitCodexDetectTitle:') >= 0);
assert.ok(i18n.indexOf('codexCapReadyHint:') >= 0);
assert.ok(i18n.indexOf('已加载推荐快捷键') >= 0);

console.log('agent-codex-micro.test.js ok');
