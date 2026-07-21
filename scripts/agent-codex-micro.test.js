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
assert.ok(i18n.indexOf('标准版：实体小键盘 12 键 + 屏幕总开关') >= 0);
assert.ok(i18n.indexOf('实体 13 键') < 0);

// M1: Codex Numpad Controller pad UI
require(path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'));
var Pad = global.OneToneCodexMicroPadUi;
assert.ok(Pad && Pad.ensurePad && Pad.applyLayoutProfile && Pad.applyNumpadControllerStandard);

var encDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'ENC'; });
var micDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'ACT10'; });
assert.ok(encDef);
assert.equal(Number(encDef.sourceScan), 0, 'ENC screen-only (no physical scan)');
assert.ok(micDef);
assert.equal(Number(micDef.sourceScan), 0x52, 'Mic on Numpad 0');

var physical = Pad.LAYOUT.defaultRoutes.filter(function (r) {
  return Number(r.sourceScan) > 0;
});
assert.equal(physical.length, 12, '12 physical numpad routes');

var mapping = {
  id: 'm-m1-test',
  appTargetId: 'codex-chat',
  agentBindings: []
};
Pad.ensurePad(mapping, { force: true, persist: false });
assert.equal(mapping.codexMicroPad.layoutProfile, 'standard');
assert.equal(!!mapping.codexMicroPad.softwareEnhanceEnabled, false);
var encRoute = mapping.codexMicroPad.keys.find(function (k) { return k.microKeyId === 'ENC'; });
assert.equal(Number(encRoute.sourceScan), 0);
assert.equal(encRoute.slotId, 'summonCodex');

Pad.applyLayoutProfile(mapping, 'beginner', { persist: false });
var enabledSlots = mapping.codexMicroPad.keys.filter(function (k) {
  return k.enabled && String(k.slotId || '').trim();
}).map(function (k) { return k.slotId; });
enabledSlots.forEach(function (slot) {
  assert.ok(A.isEssentialSlot(slot) || slot === 'summonCodex', 'beginner slot ' + slot);
});

Pad.applyLayoutProfile(mapping, 'standard', { persist: false });
var boundStd = mapping.codexMicroPad.keys.filter(function (k) {
  return k.enabled && String(k.slotId || '').trim() && k.microKeyId !== 'JOY';
});
assert.ok(boundStd.length >= 13, 'standard enables 12 + ENC');

var exported = Pad.exportLayoutJson(mapping);
assert.equal(exported.kind, 'onetone-codex-numpad-layout');
assert.ok(Array.isArray(exported.keys));

var padSrc = fs.readFileSync(path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert.ok(padSrc.indexOf('applyNumpadControllerStandard') >= 0);
assert.ok(padSrc.indexOf('data-pad-mode="try"') >= 0 || padSrc.indexOf("id: 'try'") >= 0);
assert.ok(padSrc.indexOf('Alt+Numpad') < 0);
assert.ok(padSrc.indexOf('codexMicroPadCta') >= 0 || padSrc.indexOf('标准版：实体小键盘 12 键') >= 0);

// Step1: recognition page slim — no inline layout+mode segments in renderTarget
assert.ok(Pad.openPadManager && Pad.closePadManager);
var renderTargetFn = padSrc.slice(
  padSrc.indexOf('function renderTarget'),
  padSrc.indexOf('function ensureEditModal')
);
assert.ok(renderTargetFn.indexOf('renderProfileSeg') < 0, 'inline renderTarget must not use layout segments');
assert.ok(renderTargetFn.indexOf('renderModeSeg') < 0, 'inline renderTarget must not use mode segments');
assert.ok(renderTargetFn.indexOf('data-act="manage"') >= 0);
assert.ok(renderTargetFn.indexOf('data-act="numlock"') < 0);
assert.ok(renderTargetFn.indexOf('data-act="enhance"') < 0);
assert.ok(renderTargetFn.indexOf('codex-micro-pad__toolbar') < 0);
assert.ok(renderTargetFn.indexOf("bindPadClicks(host, m, 'config')") >= 0);
assert.ok(renderTargetFn.indexOf("padUiMode = 'config'") >= 0);
assert.ok(i18n.indexOf('codexMicroPadManage:') >= 0);
assert.ok(i18n.indexOf('开箱模拟 Codex Micro 标准版') >= 0 || i18n.indexOf('out-of-box Codex Micro standard') >= 0);
assert.ok(i18n.indexOf('实体 13 键') < 0);

// Step2: full pad manager modal (not stub toast)
assert.ok(padSrc.indexOf('function ensurePadManagerModal') >= 0);
assert.ok(padSrc.indexOf('function renderPadManager') >= 0);
assert.ok(padSrc.indexOf('codexMicroPadManager') >= 0);
assert.ok(padSrc.indexOf('codex-pad-mgr') >= 0);
assert.ok(padSrc.indexOf('小键盘管理面板即将开放') < 0);
assert.ok(padSrc.indexOf('data-act="more-toggle"') >= 0);
assert.ok(padSrc.indexOf('renderProfileSeg(pad)') >= 0);
assert.ok(padSrc.indexOf('renderModeSeg()') >= 0);
assert.ok(i18n.indexOf('codexMicroPadMore:') >= 0);
assert.ok(i18n.indexOf('codexMicroPadClearConfirm:') >= 0);
var padCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-pad.css'), 'utf8');
assert.ok(padCss.indexOf('micro-hw-modal__card--pad-manager') >= 0);
assert.ok(padCss.indexOf('min(720px, calc(100vh - 48px))') >= 0);

// M2: five-state timings + brightness helpers + toast reasons
assert.ok(Pad.setPadRunStatus && Pad.getPadRunStatus && Pad.PAD_STATUS_MS);
assert.equal(Pad.PAD_STATUS_MS.running, 800);
assert.equal(Pad.PAD_STATUS_MS.done, 600);
assert.equal(Pad.PAD_STATUS_MS.failed, 1200);
Pad.setPadRunStatus('running', 'AG01');
assert.equal(Pad.getPadRunStatus().status, 'running');
assert.equal(Pad.getPadRunStatus().microKeyId, 'AG01');
Pad.setPadRunStatus('idle', '');
assert.equal(Pad.getPadRunStatus().status, 'idle');

var primaryRoute = { sourceScan: 0x48, slotId: 'plan', advanced: false };
var screenRoute = { sourceScan: 0, slotId: 'summonCodex', advanced: false };
var advRoute = { sourceScan: 0, slotId: '', advanced: true, microKeyId: 'NAV_UP' };
assert.ok(Pad.isPrimaryMapped(primaryRoute));
assert.ok(Pad.isScreenOnly(screenRoute));
assert.ok(Pad.isAdvancedOnly(advRoute, 'NAV_UP'));
assert.ok(!Pad.isPrimaryMapped(screenRoute));

assert.ok(padSrc.indexOf('hold_busy') >= 0);
assert.ok(padSrc.indexOf('no_profile') >= 0);
assert.ok(padSrc.indexOf('setPadRunStatus') >= 0);
assert.ok(i18n.indexOf('codexMicroPadHoldBusy:') >= 0);
assert.ok(i18n.indexOf('codexMicroPadStatusListening:') >= 0);

var overlayHtml = fs.readFileSync(path.join(__dirname, '../src/codex-micro-overlay.html'), 'utf8');
assert.ok(overlayHtml.indexOf('is-chrome-open') < 0 || overlayHtml.indexOf('overlay-chrome') >= 0);
assert.ok(overlayHtml.indexOf('data-act="drag"') < 0);
assert.ok(overlayHtml.indexOf('cmd_codex_micro_overlay_start_drag') >= 0);
assert.ok(overlayHtml.indexOf('isDragBlocked') >= 0);
assert.ok(overlayHtml.indexOf('cmd_codex_micro_overlay_set_minimized') >= 0);
assert.ok(overlayHtml.indexOf('data-act="lights"') < 0);
assert.ok(overlayHtml.indexOf('info.runStatus') >= 0);
assert.ok(overlayHtml.indexOf('data-ag=') >= 0);
var overlayCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-overlay.css'), 'utf8');
assert.ok(overlayHtml.indexOf('micro-hw__brand--left') >= 0);
assert.ok(overlayHtml.indexOf('micro-hw__aux-hole') >= 0);
assert.ok(overlayCss.indexOf('--overlay-shell') >= 0);
assert.ok(overlayCss.indexOf('.overlay-body .micro-hw') >= 0);
assert.ok(overlayCss.indexOf('border-radius: 999px') >= 0);
assert.ok(overlayCss.indexOf('micro-hw__key--agent::before') >= 0);

var tokensCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-hw-tokens.css'), 'utf8');
assert.ok(tokensCss.indexOf('--micro-hw-screen-opacity') >= 0);
assert.ok(tokensCss.indexOf('--micro-hw-status-failed') >= 0);
var indexHtml = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
assert.ok(indexHtml.indexOf('codex-micro-hw-tokens.css') >= 0);

// M4: software enhance — JOY 3s dir mode, ENC wheel, primary layout guard
assert.equal(Pad.JOY_DIR_MS, 3000);
assert.ok(Array.isArray(Pad.PRIMARY_MICRO_IDS));
assert.equal(Pad.PRIMARY_MICRO_IDS.length, 13);
assert.ok(Pad.PRIMARY_MICRO_IDS.indexOf('ENC') >= 0);
assert.ok(Pad.PRIMARY_MICRO_IDS.indexOf('ACT10') >= 0);
assert.equal(!!mapping.codexMicroPad.softwareEnhanceEnabled, false);
assert.ok(Pad.enterJoyDirectionMode);
assert.ok(Pad.exitJoyDirectionMode);
assert.ok(!Pad.enterJoyDirectionMode(mapping), 'dir mode requires enhance');
mapping.codexMicroPad.softwareEnhanceEnabled = true;
// Node has no window — enter returns false without DOM window
assert.ok(typeof Pad.isJoyDirectionActive() === 'boolean');
mapping.codexMicroPad.softwareEnhanceEnabled = false;

var stripped = mapping.codexMicroPad.keys.filter(function (k) {
  return k.microKeyId !== 'AG03' && k.microKeyId !== 'ENC';
});
mapping.codexMicroPad.keys = stripped;
Pad.ensurePad(mapping, { persist: false });
var ids = mapping.codexMicroPad.keys.map(function (k) { return k.microKeyId; });
assert.ok(ids.indexOf('AG03') >= 0, 'ensurePad restores AG03');
assert.ok(ids.indexOf('ENC') >= 0, 'ensurePad restores ENC');
var encAgain = mapping.codexMicroPad.keys.find(function (k) { return k.microKeyId === 'ENC'; });
assert.equal(Number(encAgain.sourceScan), 0, 'ENC remains screen-only');

assert.ok(padSrc.indexOf('JOY_DIR_MS') >= 0);
assert.ok(padSrc.indexOf('enterJoyDirectionMode') >= 0);
assert.ok(padSrc.indexOf('ENC_CW') >= 0);
assert.ok(padSrc.indexOf('NAV_PRESS') >= 0);
assert.ok(padSrc.indexOf('Alt+Numpad') < 0);
assert.ok(padSrc.indexOf('protectPrimaryLayout') >= 0);
assert.ok(i18n.indexOf('codexMicroPadJoyDirHint:') >= 0);

assert.ok(overlayHtml.indexOf('enterJoyDir') >= 0 || overlayHtml.indexOf('JOY_DIR_MS') >= 0);
assert.ok(overlayHtml.indexOf('softwareEnhanceEnabled') >= 0);
assert.ok(overlayHtml.indexOf('ENC_CW') >= 0);
assert.ok(overlayHtml.indexOf('NAV_PRESS') >= 0);

console.log('agent-codex-micro.test.js ok');
