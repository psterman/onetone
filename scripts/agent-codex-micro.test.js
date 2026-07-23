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

// scenarioAllKeys: all catalog slots on for keys; voice essentials only
var allKeys = A.buildCodexMicro13Bindings({ enableProfile: 'scenarioAllKeys' });
var keyBindings = allKeys.filter(function (b) { return b.triggerType === 'key'; });
assert.equal(keyBindings.length, 17);
assert.ok(keyBindings.some(function (b) { return b.slotId === 'claudeModel'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'switchModel'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'undo'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'quickSearch'; }));
assert.equal(A.insertTextForSlot('switchModel'), '/model');
assert.equal(A.insertTextForSlot('claudeModel'), '/model');
assert.equal(A.defaultKeyForSlot('undo'), 'Ctrl+Z');
assert.equal(A.defaultKeyForSlot('quickSearch'), 'Ctrl+F');
keyBindings.forEach(function (b) {
  if (b.slotId === 'summonCodex' || b.slotId === 'claudeModel') {
    assert.equal(b.triggerBinding, '', b.slotId + ' uses focus workflow, no chord');
    return;
  }
  assert.ok(b.triggerBinding, 'key binding recommended for ' + b.slotId);
  assert.equal(b.triggerBinding, A.defaultKeyForSlot(b.slotId));
  assert.equal(b.enabled, true, 'key enabled for ' + b.slotId);
});
assert.equal(A.defaultKeyForSlot('summonCodex'), '');
assert.equal(A.defaultKeyForSlot('claudeModel'), '');
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
  if (x.slotId === 'summonCodex' || x.slotId === 'claudeModel') {
    assert.equal(x.triggerBinding, '', x.slotId + ' seeded empty (focus workflow)');
    return;
  }
  assert.ok(x.triggerBinding, 'seeded key for ' + x.slotId);
  assert.equal(x.enabled, true, 'all keys enabled for ' + x.slotId);
});
var emptyVoiceOn = empty.agentBindings.filter(function (x) {
  return x.triggerType === 'voice' && x.enabled;
});
assert.equal(emptyVoiceOn.length, A.essentialSlots().length);

// summonCodex empty chord is intentional — fillEmptyKeyDefaults must not invent Ctrl+Shift+P
var legacy = {
  id: 'm-legacy',
  appTargetId: 'codex-chat',
  agentTemplateId: A.TEMPLATE_ID,
  agentBindings: [
    { slotId: 'summonCodex', actionId: 'openAgent', triggerType: 'key', triggerBinding: '', enabled: true }
  ]
};
assert.equal(T.fillEmptyKeyDefaults(legacy), false);
assert.equal(legacy.agentBindings[0].triggerBinding, '');

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
var ag00 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG00'; });
var ag01 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG01'; });
var ag02 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG02'; });
var ag04 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG04'; });
assert.equal(ag00.slotId, 'switchAgent');
assert.equal(ag01.slotId, 'claudeModel');
assert.equal(ag02.slotId, 'switchModel');
assert.equal(ag04.slotId, 'status');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG00'; }).uiLabelZh, 'Agent');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG01'; }).uiLabelZh, 'Claude');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG02'; }).uiLabelZh, 'Codex');
var ag03 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG03'; });
var ag05 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG05'; });
assert.equal(ag03.slotId, 'permissions');
assert.equal(ag05.slotId, 'appsOrPlugins');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG03'; }).uiLabelZh, '权限');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG04'; }).uiLabelZh, '常用');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG05'; }).uiLabelZh, '应用');

var physical = Pad.LAYOUT.defaultRoutes.filter(function (r) {
  return Number(r.sourceScan) > 0;
});
assert.equal(physical.length, 16, '16 physical numpad routes (incl. UNDO/SEARCH/PLUS/DOT; ENC screen-only)');

var undoDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'UNDO'; });
var searchDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'SEARCH'; });
var act12Def = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'ACT12'; });
assert.equal(undoDef.slotId, 'undo');
assert.equal(Number(undoDef.sourceScan), 0x50);
assert.equal(searchDef.slotId, 'quickSearch');
assert.equal(Number(searchDef.sourceScan), 0x51);
assert.equal(act12Def.slotId, 'stopOrSend');
assert.equal(Number(act12Def.sourceScan), 0x1C);
assert.equal(!!act12Def.sourceExtended, true);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).uiLabelZh, '上下文');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).gridRow, 4);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).gridCol, 2);
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_UP'; }));
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_LEFT'; }));
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_DOWN'; }));
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_RIGHT'; }));
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_UP'; }).gridRow, 2);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'NAV_UP'; }).gridCol, 1);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ENC'; }).gridCol, 2);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'PLUS'; }).gridCol, 5);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT12'; }).gridRowSpan, 2);
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'UNDO' }));
assert.ok(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'DOT' }));
assert.ok(!Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'JOY'; }));
assert.ok(Pad.cellByMicroId('NAV_UP'));
assert.equal(Pad.DEFAULT_ICON_BY_MICRO.NAV_UP, 'navUp');
assert.equal(layout.cells.find(function (c) { return c.microKeyId === 'NAV_UP'; }).gridCol, 1);
assert.equal(layout.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).gridCol, 2);
assert.ok(!layout.cells.find(function (c) { return c.microKeyId === 'JOY'; }));

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
assert.ok(padSrc.indexOf('navUp') >= 0);
assert.ok(padSrc.indexOf('micro-hw-nav-rail') < 0, 'settings pad must not render JOY side rail');
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
assert.ok(overlayHtml.indexOf('data-status-source') >= 0);
assert.ok(overlayHtml.indexOf('statusSource') >= 0);
assert.ok(overlayHtml.indexOf('statusSourceLabel') >= 0);
assert.ok(overlayHtml.indexOf('Codex Hook') >= 0);
assert.ok(overlayHtml.indexOf('Claude Hook') >= 0);
assert.ok(overlayHtml.indexOf('Native Micro') >= 0);
assert.ok(overlayHtml.indexOf('data-ag=') >= 0);
assert.ok(overlayHtml.indexOf('overlayAppMeta') >= 0);
assert.ok(overlayHtml.indexOf('appLastSource') >= 0);
assert.ok(overlayHtml.indexOf('appLastEvent') >= 0);
assert.ok(overlayHtml.indexOf('appStateEnabled') >= 0);
assert.ok(overlayHtml.indexOf('applyAppMetaChip') >= 0);
var overlayCmd = fs.readFileSync(path.join(__dirname, '../src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'), 'utf8');
assert.ok(overlayCmd.indexOf('cmd_codex_micro_protocol_inject') >= 0);
assert.ok(overlayCmd.indexOf('cmd_codex_micro_protocol_server_start') >= 0);
assert.ok(overlayCmd.indexOf('cmd_codex_micro_protocol_server_stop') >= 0);
assert.ok(overlayCmd.indexOf('cmd_codex_micro_protocol_server_status') >= 0);
assert.ok(overlayCmd.indexOf('apply_rpc_json') >= 0);
assert.ok(overlayCmd.indexOf('rpc_too_large') >= 0);
var libRs = fs.readFileSync(path.join(__dirname, '../src-tauri/src/lib.rs'), 'utf8');
assert.ok(libRs.indexOf('cmd_codex_micro_protocol_inject') >= 0);
assert.ok(libRs.indexOf('cmd_codex_micro_protocol_server_start') >= 0);
assert.ok(libRs.indexOf('mod codex_micro_protocol_server') >= 0);
assert.ok(libRs.indexOf('mod codex_app_state') >= 0);
assert.ok(libRs.indexOf('env_requests_autostart') >= 0);
var buildRs = fs.readFileSync(path.join(__dirname, '../src-tauri/build.rs'), 'utf8');
assert.ok(buildRs.indexOf('cmd_codex_micro_protocol_server_start') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_micro_protocol_server_stop') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_micro_protocol_server_status') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_status_lights_set') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_hook_setup_status') >= 0);
assert.ok(buildRs.indexOf('cmd_pad_status_diagnose') >= 0);
assert.ok(libRs.indexOf('cmd_codex_status_lights_set') >= 0);
assert.ok(libRs.indexOf('cmd_codex_hook_setup_status') >= 0);
assert.ok(libRs.indexOf('cmd_pad_status_diagnose') >= 0);

var acceptanceHtml = fs.readFileSync(
  path.join(__dirname, '../design-mock/codex-onetone-linkage-acceptance.html'),
  'utf8'
);
assert.ok(acceptanceHtml.indexOf('场景模拟') >= 0);
assert.ok(acceptanceHtml.indexOf('注入验证') >= 0);
assert.ok(acceptanceHtml.indexOf('真桥验证') >= 0);
assert.ok(acceptanceHtml.indexOf('Hook 真桥') >= 0 || acceptanceHtml.indexOf('一键 Hook 验收') >= 0);
assert.ok(acceptanceHtml.indexOf('8796') >= 0);
assert.ok(acceptanceHtml.indexOf('/api/codex-app/state') >= 0);
assert.ok(acceptanceHtml.indexOf('codex_hook') >= 0);
assert.ok(acceptanceHtml.indexOf('不等于 Micro HID thstatus') >= 0 || acceptanceHtml.indexOf('≠ Micro HID thstatus') >= 0);
assert.ok(acceptanceHtml.indexOf('btnHookRunAll') >= 0);
assert.ok(acceptanceHtml.indexOf('runHookAcceptancePipeline') >= 0);
assert.ok(acceptanceHtml.indexOf('btnCopyHooksJson') >= 0);
assert.ok(acceptanceHtml.indexOf('/_onetone/hook-log') >= 0);
assert.ok(acceptanceHtml.indexOf('Codex Hook 状态灯') >= 0);
assert.ok(acceptanceHtml.indexOf('Micro 协议注入') >= 0);
assert.ok(acceptanceHtml.indexOf('hookZonePills') >= 0);
assert.ok(acceptanceHtml.indexOf('microZonePills') >= 0);
assert.ok(acceptanceHtml.indexOf('native AG ·') < 0, 'top status must not use native AG to imply Hook');
assert.ok(acceptanceHtml.indexOf('statusSourceLabel(c.statusSource)') >= 0);
assert.ok(acceptanceHtml.indexOf('Codex 接入检测') >= 0);
assert.ok(acceptanceHtml.indexOf('btnProbe') >= 0);
assert.ok(acceptanceHtml.indexOf('btnHookProbe') >= 0);
assert.ok(acceptanceHtml.indexOf('connBanner') >= 0);
assert.ok(acceptanceHtml.indexOf('btnRunAll') >= 0);
assert.ok(acceptanceHtml.indexOf('pipelineList') >= 0);
assert.ok(acceptanceHtml.indexOf('一键验收') >= 0);
assert.ok(acceptanceHtml.indexOf('markPass') >= 0);
assert.ok(acceptanceHtml.indexOf("mark('stale', true)") >= 0);
var protocolServer = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/codex_micro_protocol_server.rs'),
  'utf8'
);
assert.ok(protocolServer.indexOf('Access-Control-Allow-Origin') >= 0);
assert.ok(protocolServer.indexOf('APP_STATE_PATH') >= 0);
assert.ok(protocolServer.indexOf('appStateEnabled') >= 0);
assert.ok(protocolServer.indexOf('disabled') >= 0);

var statusLightsCmd = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/ipc/commands/shell/codex_status_lights_cmd.rs'),
  'utf8'
);
assert.ok(statusLightsCmd.indexOf('cmd_codex_status_lights_set') >= 0);
assert.ok(statusLightsCmd.indexOf('cmd_codex_hook_setup_status') >= 0);
assert.ok(statusLightsCmd.indexOf('server_stop') < 0, 'disable must not stop listener');
assert.ok(statusLightsCmd.indexOf('not_configured') >= 0);
assert.ok(statusLightsCmd.indexOf('configured_waiting') >= 0);
assert.ok(statusLightsCmd.indexOf('connected') >= 0);

var configRs = fs.readFileSync(path.join(__dirname, '../src-tauri/src/config.rs'), 'utf8');
assert.ok(configRs.indexOf('codex_status_lights_enabled') >= 0);

var overlayRs = fs.readFileSync(path.join(__dirname, '../src-tauri/src/codex_micro_overlay.rs'), 'utf8');
assert.ok(overlayRs.indexOf('app_state_enabled') >= 0);
assert.ok(overlayRs.indexOf('app_last_seen_at') >= 0);
assert.ok(overlayRs.indexOf('status_lights_enabled') >= 0);

// P0 Hook probe + reducer
var hookProbePath = path.join(__dirname, 'codex-hook-probe.js');
assert.ok(fs.existsSync(hookProbePath), 'codex-hook-probe.js exists');
var hookProbe = require('./codex-hook-probe');
var tmpJsonl = path.join(__dirname, '../logs/_test-codex-hook-probe.jsonl');
try { fs.unlinkSync(tmpJsonl); } catch (_) {}
var fields = hookProbe.extractSafeFields({
  hook_event_name: 'UserPromptSubmit',
  session_id: 's1',
  prompt: 'SECRET_SHOULD_NOT_LOG',
  tool_input: { cmd: 'rm -rf /' }
});
assert.equal(fields.hook_event_name, 'UserPromptSubmit');
assert.ok(!JSON.stringify(fields).includes('SECRET'));
assert.ok(!('tool_input' in fields));
hookProbe.appendJsonl(fields, tmpJsonl);
assert.ok(fs.existsSync(tmpJsonl));
var jsonlLine = fs.readFileSync(tmpJsonl, 'utf8').trim();
assert.ok(jsonlLine.indexOf('UserPromptSubmit') >= 0);
assert.ok(jsonlLine.indexOf('SECRET') < 0);
try { fs.unlinkSync(tmpJsonl); } catch (_) {}

var { spawnSync } = require('child_process');
var probeRun = spawnSync(process.execPath, [hookProbePath], {
  input: JSON.stringify({ hook_event_name: 'Stop', session_id: 't' }),
  encoding: 'utf8',
  env: Object.assign({}, process.env, { ONETONE_CODEX_APP_STATE_URL: 'http://127.0.0.1:9/nope' }),
  timeout: 5000
});
assert.equal(probeRun.status, 0, 'probe always exit 0');
assert.equal(String(probeRun.stdout || ''), '', 'probe stdout empty');

var hooksExample = JSON.parse(fs.readFileSync(path.join(__dirname, 'codex-hooks.example.json'), 'utf8'));
assert.ok(hooksExample.hooks, 'hooks.example has top-level hooks');
['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop'].forEach(function (ev) {
  assert.ok(hooksExample.hooks[ev], 'hooks.example has ' + ev);
});
assert.ok(fs.existsSync(path.join(__dirname, '../docs/codex-hook-onetone-setup.md')));

var reducer = require('./codex-hook-reducer');
var store = reducer.createStore();
store = reducer.applyEvent(store, { source: 'codex_hook', event: 'UserPromptSubmit' }, 1000);
assert.equal(store.status, 'running');
store = reducer.applyEvent(store, { source: 'codex_hook', event: 'PermissionRequest' }, 1010);
assert.equal(store.status, 'needs_input');
store = reducer.applyEvent(store, { source: 'codex_hook', event: 'Stop' }, 1020);
assert.equal(store.status, 'done');
assert.equal(store.lastEvent, 'Stop');
var afterIdle = reducer.snapshot(store, 1020 + reducer.IDLE_AFTER_DONE_MS);
assert.equal(afterIdle.status, 'idle');
assert.equal(afterIdle.lastEvent, 'Stop');
assert.equal(afterIdle.lastSource, 'codex_hook');

var padUiSrc = fs.readFileSync(path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert.ok(padUiSrc.indexOf('remountTargetPadShell') >= 0);
assert.ok(padUiSrc.indexOf('remountPadManagerShell') >= 0);
assert.ok(padUiSrc.indexOf('padFlagsPersistTimer') >= 0);
assert.ok(padUiSrc.indexOf('skipEnsure: true') >= 0);
assert.ok(padUiSrc.indexOf('cmd_codex_micro_pad_set_flags') >= 0);
assert.ok(padUiSrc.indexOf('Native Micro') >= 0);
assert.ok(padUiSrc.indexOf('Codex Hook') >= 0);
assert.ok(padUiSrc.indexOf('Claude Hook') >= 0 || padUiSrc.indexOf('claude_hook') >= 0);
assert.ok(padUiSrc.indexOf('renderHookStatusCard') >= 0);
assert.ok(padUiSrc.indexOf('cmd_codex_status_lights_set') >= 0);
assert.ok(padUiSrc.indexOf('cmd_codex_hook_setup_status') >= 0);
assert.ok(padUiSrc.indexOf('cmd_pad_status_diagnose') >= 0);
assert.ok(padUiSrc.indexOf('cmd_codex_pad_binding_diagnose') >= 0);
assert.ok(padUiSrc.indexOf('cmd_codex_pad_binding_heal') >= 0);
assert.ok(padUiSrc.indexOf('healBindingDiagnose') >= 0);
assert.ok(padUiSrc.indexOf('renderBindingValidateCard') >= 0);
assert.ok(padUiSrc.indexOf('data-bind-diag-issues') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_pad_binding_diagnose') >= 0);
assert.ok(buildRs.indexOf('cmd_codex_pad_binding_heal') >= 0);
assert.ok(libRs.indexOf('cmd_codex_pad_binding_diagnose') >= 0);
assert.ok(libRs.indexOf('cmd_codex_pad_binding_heal') >= 0);
assert.ok(padUiSrc.indexOf('data-pad-diag-replay') >= 0);
assert.ok(padUiSrc.indexOf('pad-diag-filter') >= 0);
assert.ok(padUiSrc.indexOf('renderPadDiagnoseReplay') >= 0);
assert.ok(padUiSrc.indexOf('HID 关闭') >= 0 || padUiSrc.indexOf('hid.emitEnabled') >= 0);
assert.ok(fs.readFileSync(path.join(__dirname, '../src-tauri/src/pad_status/adapters/hid.rs'), 'utf8').indexOf('hid_sink_disabled') >= 0);
assert.ok(fs.readFileSync(path.join(__dirname, '../src-tauri/src/pad_status/adapters/claude.rs'), 'utf8').indexOf('map_claude_event_to_state') >= 0);
assert.ok(fs.existsSync(path.join(__dirname, 'claude-hook-probe.js')));
assert.ok(fs.existsSync(path.join(__dirname, 'claude-hooks.example.json')));
assert.ok(fs.readFileSync(path.join(__dirname, 'claude-hook-probe.js'), 'utf8').indexOf('claude_hook') >= 0);
assert.ok(padUiSrc.indexOf('codexStatusLightsEnabled') >= 0);
assert.ok(padUiSrc.indexOf('已配置，等待 Codex 事件') >= 0);
assert.ok(padUiSrc.indexOf('已连接') >= 0);
assert.ok(padUiSrc.indexOf('未配置') >= 0);
assert.ok(i18n.indexOf('codexMicroPadStatusLightsEnable:') >= 0);
assert.ok(i18n.indexOf('codexMicroPadHookPhaseWaiting:') >= 0);

var relayEx = fs.readFileSync(
  path.join(__dirname, 'codex-micro-agentcontroller-relay.example.js'),
  'utf8'
);
assert.ok(relayEx.indexOf('codex-micro-agentcontroller-relay.js') >= 0);
var relayMain = fs.readFileSync(
  path.join(__dirname, 'codex-micro-agentcontroller-relay.js'),
  'utf8'
);
assert.ok(relayMain.indexOf('/api/codex-micro/protocol') >= 0 || relayMain.indexOf('codex-micro-relay-lib') >= 0);
var overlayCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-overlay.css'), 'utf8');
assert.ok(overlayCss.indexOf('micro-hw__brand--left') >= 0);
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
assert.equal(Pad.PRIMARY_MICRO_IDS.length, 17);
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

assert.ok(overlayHtml.indexOf('softwareEnhanceEnabled') >= 0);
assert.ok(overlayHtml.indexOf('data-status-source') >= 0);
assert.ok(overlayHtml.indexOf('ENC_CW') >= 0 || padSrc.indexOf('ENC_CW') >= 0);
assert.ok(overlayHtml.indexOf('NAV_PRESS') >= 0 || padSrc.indexOf('NAV_PRESS') >= 0);

console.log('agent-codex-micro.test.js ok');
