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
assert.equal(keyBindings.length, 27);
assert.ok(keyBindings.some(function (b) { return b.slotId === 'claudeModel'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'switchModel'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'undo'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'quickSearch'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'openTerminal'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'openReviewTab'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'toggleSidebar'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'openSettings'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'navBack'; }));
assert.ok(keyBindings.some(function (b) { return b.slotId === 'navForward'; }));
assert.equal(A.insertTextForSlot('switchModel'), '/model');
assert.equal(A.insertTextForSlot('claudeModel'), '/model');
assert.equal(A.defaultKeyForSlot('undo'), 'Ctrl+Z');
assert.equal(A.defaultKeyForSlot('quickSearch'), 'Ctrl+F');
assert.equal(A.defaultKeyForSlot('openTerminal'), 'Ctrl+`');
assert.equal(A.defaultKeyForSlot('openReviewTab'), 'Ctrl+Shift+G');
assert.equal(A.defaultKeyForSlot('toggleReviewPanel'), 'Ctrl+Alt+B');
assert.equal(A.defaultKeyForSlot('toggleSidebar'), 'Ctrl+B');
assert.equal(A.defaultKeyForSlot('openSettings'), 'Ctrl+,');
assert.equal(A.defaultKeyForSlot('navBack'), 'Ctrl+[');
assert.equal(A.defaultKeyForSlot('navForward'), 'Ctrl+]');
assert.equal(A.defaultKeyForSlot('toggleBrowserPanel'), 'Ctrl+Shift+B');
assert.equal(A.defaultKeyForSlot('newBrowserTab'), 'Ctrl+T');
assert.equal(A.defaultKeyForSlot('focusBrowserAddressBar'), 'Ctrl+L');
assert.equal(A.insertTextForSlot('openReviewTab'), '');
assert.equal(A.insertTextForSlot('review'), '/review');
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

// Single-scenario: createNew reuses existing Codex scenario
var createdList = [];
global.OneToneHabitHub = {
  findAppScenarioByAppId: function () {
    return createdList[0] || null;
  },
  createAppScenario: function (appId) {
    if (createdList.length) return createdList[0];
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
assert.strictEqual(a.mapping.id, b.mapping.id, 'createNew reuses existing Codex scenario');
assert.strictEqual(a.created, true, 'first createNew creates');
assert.strictEqual(b.created, false, 'second createNew reuses');
assert.strictEqual(createdList.length, 1, 'only one Codex mapping');

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
assert.ok(hubSrc.indexOf('pickCanonicalAppScenario') >= 0);
assert.ok(hubSrc.indexOf("appId!=='custom'") >= 0);
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
assert.equal(ag00.slotId, 'commandPalette');
assert.equal(ag01.slotId, 'newThread');
assert.equal(ag02.slotId, 'quickChat');
assert.equal(ag04.slotId, 'stopOrSend');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG00'; }).uiLabelZh, '命令菜单');
assert.ok(typeof Pad.resolveStatusLightMicroKeyId === 'function');
assert.equal(
  Pad.resolveStatusLightMicroKeyId({ keys: Pad.LAYOUT.defaultRoutes }),
  'AG00',
  'no status route → status light falls back to AG00'
);
assert.ok(
  Pad.LAYOUT.defaultRoutes.every(function (r) { return r.slotId !== 'status'; }),
  'stock Soft Pad has no status slot'
);
assert.equal(
  Pad.resolveStatusLightMicroKeyId({
    keys: [{ microKeyId: 'AG05', slotId: 'status', enabled: true }]
  }),
  'AG05'
);
assert.equal(
  Pad.resolveStatusLightMicroKeyId({
    keys: [{ microKeyId: 'ACT09', slotId: 'status', enabled: true }]
  }),
  'ACT09'
);
assert.equal(
  Pad.resolveStatusLightMicroKeyId({ keys: [] }),
  'AG00',
  'no status route falls back to AG00'
);
assert.equal(
  Pad.resolveStatusLightMicroKeyId({
    keys: [{ microKeyId: 'GHOST99', slotId: 'status', enabled: true }]
  }),
  '',
  'status on invisible key → empty host'
);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG01'; }).uiLabelZh, '新建');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG02'; }).uiLabelZh, '快速聊天');
var ag03 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG03'; });
var ag05 = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'AG05'; });
assert.equal(ag03.slotId, 'quickSearch');
assert.equal(ag05.slotId, 'cancel');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG03'; }).uiLabelZh, '搜索');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG04'; }).uiLabelZh, '发送');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'AG05'; }).uiLabelZh, '取消');

var physical = Pad.LAYOUT.defaultRoutes.filter(function (r) {
  return Number(r.sourceScan) > 0;
});
assert.equal(physical.length, 16, '16 physical numpad routes (incl. UNDO/SEARCH/PLUS/DOT; ENC screen-only)');

var undoDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'UNDO'; });
var searchDef = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'SEARCH'; });
var act12Def = Pad.LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === 'ACT12'; });
assert.equal(undoDef.slotId, '', 'UNDO stock unbound — not in Codex Soft Pad picker');
assert.equal(Number(undoDef.sourceScan), 0x50);
assert.equal(searchDef.slotId, 'quickSearch');
assert.equal(Number(searchDef.sourceScan), 0x51);
assert.equal(act12Def.slotId, 'stopOrSend');
assert.equal(Number(act12Def.sourceScan), 0x1C);
assert.equal(!!act12Def.sourceExtended, true);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).uiLabelZh, '新建');
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).gridRow, 4);
assert.equal(Pad.LAYOUT.cells.find(function (c) { return c.microKeyId === 'ACT09'; }).gridCol, 2);

// Codex Soft Pad openEditKeycap whitelist (one-press only; mapping-scoped)
assert.ok(typeof Pad.allSlotOptions === 'function');
assert.ok(Pad.CODEX_SOFT_PAD_SLOT_IDS);
(function () {
  var codexM = { appTargetId: 'codex-chat' };
  var claudeM = { appTargetId: 'claude-code' };
  var codexOpts = Pad.allSlotOptions(codexM);
  var claudeOpts = Pad.allSlotOptions(claudeM);
  var codexIds = codexOpts.map(function (o) { return o.id; });
  var claudeIds = claudeOpts.map(function (o) { return o.id; });
  var banned = [
    'status', 'plan', 'review',
    'permissions', 'switchAgent', 'switchModel', 'appsOrPlugins'
  ];
  banned.forEach(function (id) {
    assert.ok(codexIds.indexOf(id) < 0, 'Codex Soft Pad picker excludes ' + id);
    assert.ok(claudeIds.indexOf(id) < 0, 'Claude Soft Pad also excludes insertOnly ' + id);
  });
  assert.ok(codexIds.indexOf('claudeModel') < 0, 'Codex Soft Pad excludes claudeModel');
  assert.ok(claudeIds.indexOf('claudeModel') >= 0, 'Claude Soft Pad still offers claudeModel');
  assert.ok(claudeIds.length > 0, 'Claude Soft Pad has execute slots');
  var claudeTips = claudeOpts.map(function (o) { return o.tip || ''; }).join('\n');
  assert.ok(claudeTips.indexOf('向对话插入') < 0, 'Claude Soft Pad must not advertise slash insert');
  assert.ok(claudeTips.indexOf('插入 /') < 0);
  var whitelist = Object.keys(Pad.CODEX_SOFT_PAD_SLOT_IDS);
  assert.ok(whitelist.indexOf('undo') >= 0, 'undo is Soft Pad open-entry');
  assert.ok(whitelist.indexOf('openTerminal') >= 0);
  assert.ok(whitelist.indexOf('toggleSidebar') >= 0);
  assert.ok(whitelist.indexOf('openSettings') >= 0);
  assert.ok(whitelist.indexOf('navBack') >= 0);
  assert.ok(whitelist.indexOf('navForward') >= 0);
  whitelist.forEach(function (id) {
    assert.ok(codexIds.indexOf(id) >= 0, 'Codex Soft Pad includes ' + id);
  });
  var tips = whitelist.map(function (id) {
    return Pad.slotEffectTip(id, null, codexM) || '';
  }).join('\n');
  assert.ok(tips.indexOf('插入 /') < 0, 'Codex whitelist tips must not say 插入 /');
  assert.ok(tips.indexOf('Insert /') < 0, 'Codex whitelist tips must not say Insert /');
  assert.ok(tips.indexOf('inserts /') < 0, 'Codex whitelist tips must not say inserts /');

  // Beginner capability cards + appearance-only icon tips
  assert.ok(typeof Pad.capabilityCardCopy === 'function');
  assert.ok(typeof Pad.iconEffectTip === 'function');
  var nt = Pad.capabilityCardCopy('newThread');
  assert.equal(nt.title, '新建对话');
  assert.ok(nt.result.indexOf('Ctrl+N') >= 0);
  assert.ok(nt.source.indexOf('桌面快捷键') >= 0 || nt.source.indexOf('desktop') >= 0);
  assert.ok(Pad.capabilityCardCopy('commandPalette').result.indexOf('Ctrl+K') >= 0);
  assert.ok(Pad.capabilityCardCopy('quickSearch').result.indexOf('Ctrl+F') >= 0);
  var qc = Pad.capabilityCardCopy('quickChat');
  assert.ok(qc.result.indexOf('Ctrl+Alt+N') >= 0);
  assert.ok(qc.source.indexOf('桌面快捷键') >= 0 || qc.source.indexOf('desktop') >= 0);
  assert.ok(qc.result.indexOf('官方') < 0);
  assert.ok(qc.result.indexOf('Micro') < 0);
  var sos = Pad.capabilityCardCopy('stopOrSend');
  assert.ok(
    sos.result.indexOf('审批焦点时') >= 0 || sos.result.indexOf('when focused') >= 0,
    'stopOrSend must include conditional approve semantics'
  );
  assert.ok(sos.result.indexOf('批准请求') < 0 || sos.result.indexOf('审批焦点时') >= 0);
  assert.ok(sos.result.indexOf('空') >= 0 || sos.result.indexOf('empty') >= 0 || sos.result.indexOf('invent') >= 0);
  var cancelCopy = Pad.capabilityCardCopy('cancel');
  assert.ok(
    cancelCopy.result.indexOf('审批焦点时') >= 0 || cancelCopy.result.indexOf('when focused') >= 0,
    'cancel must include conditional decline semantics'
  );
  var openReview = Pad.capabilityCardCopy('openReviewTab');
  var toggleReview = Pad.capabilityCardCopy('toggleReviewPanel');
  assert.equal(openReview.title, '打开审查选项卡');
  assert.equal(toggleReview.title, '显示/隐藏当前聊天审阅面板');
  assert.ok(openReview.result.indexOf('Ctrl+Shift+G') >= 0);
  assert.ok(toggleReview.result.indexOf('Ctrl+Alt+B') >= 0);
  assert.ok(Pad.capabilityCardCopy('toggleSidebar').result.indexOf('Ctrl+B') >= 0);
  assert.ok(Pad.capabilityCardCopy('openSettings').result.indexOf('Ctrl+,') >= 0);
  assert.ok(Pad.capabilityCardCopy('navBack').result.indexOf('Ctrl+[') >= 0);
  assert.ok(Pad.capabilityCardCopy('navForward').result.indexOf('Ctrl+]') >= 0);
  var ptt = Pad.capabilityCardCopy('pushToTalk');
  assert.ok(ptt.result.indexOf('Ctrl+Shift+D') >= 0, 'pushToTalk must use Codex native Start dictation');
  assert.ok(ptt.result.indexOf('按住') >= 0 || ptt.result.toLowerCase().indexOf('hold') >= 0,
    'pushToTalk Soft Pad must advertise hold-to-talk (press_chord until release)');
  assert.ok(ptt.result.indexOf('OneTone') < 0 && String(ptt.source || '').indexOf('OneTone') < 0,
    'pushToTalk must not advertise OneTone voice workflow');
  var pttHoldMap = {
    agentBindings: [{ slotId: 'pushToTalk', triggerType: 'key', triggerBinding: 'Ctrl+Shift+D', enabled: true }],
    codexMicroPad: { keys: [{ microKeyId: 'ACT10', slotId: 'pushToTalk', enabled: true }] }
  };
  assert.equal(Pad.isHoldMicroKey(pttHoldMap, 'ACT10'), true,
    'default Ctrl+Shift+D mic must use Soft Pad hold pointer path');
  assert.ok(openReview.result.indexOf('/review') < 0);
  assert.ok(toggleReview.result.indexOf('/review') < 0);
  var term = Pad.capabilityCardCopy('openTerminal');
  assert.ok(term.result.indexOf('Ctrl+`') >= 0, 'openTerminal tip must keep backtick');
  assert.equal(A.defaultKeyForSlot('openTerminal'), 'Ctrl+`');
  assert.ok(Pad.capabilityCardCopy('toggleBrowserPanel').result.indexOf('Ctrl+Shift+B') >= 0);
  assert.ok(Pad.capabilityCardCopy('newBrowserTab').result.indexOf('Ctrl+T') >= 0);
  assert.ok(Pad.capabilityCardCopy('focusBrowserAddressBar').result.indexOf('Ctrl+L') >= 0);
  assert.ok(Pad.capabilityCardCopy('undo').result.indexOf('Ctrl+Z') >= 0);
  var iconTips = ['status', 'claude', 'send', 'fork', 'focus', 'browser', 'browserPlus'].map(function (id) {
    return Pad.iconEffectTip({ id: id, label: id.toUpperCase() });
  }).join('\n');
  assert.ok(iconTips.indexOf('/status') < 0);
  assert.ok(iconTips.indexOf('/model') < 0);
  assert.ok(iconTips.indexOf('插入') < 0);
  assert.ok(iconTips.indexOf('Insert') < 0);
  assert.ok(iconTips.indexOf('外观：') >= 0 || iconTips.indexOf('Appearance:') >= 0);
  assert.equal(Pad.SLOT_DEFAULT_ICON.newThread, 'fork');
  assert.equal(Pad.SLOT_DEFAULT_ICON.commandPalette, 'palette');
  assert.equal(Pad.SLOT_DEFAULT_ICON.summonCodex, 'focus');
  assert.equal(Pad.SLOT_DEFAULT_ICON.quickChat, 'fast');
  assert.equal(Pad.SLOT_DEFAULT_ICON.toggleBrowserPanel, 'browser');
  assert.equal(Pad.SLOT_DEFAULT_ICON.newBrowserTab, 'browserPlus');
  assert.equal(Pad.SLOT_DEFAULT_ICON.openTerminal, 'terminal');
  assert.equal(Pad.SLOT_DEFAULT_ICON.undo, 'undo');
  assert.ok(codexIds.indexOf('review') < 0, 'slash review stays out of Soft Pad');
  assert.ok(codexIds.indexOf('openReviewTab') >= 0);
  assert.ok(codexIds.indexOf('undo') >= 0);
})();

// Edit modal: capability-first + optional icon/hw details + dual tip hosts
assert.ok(padSrc.indexOf('microHwCapList') >= 0);
assert.ok(padSrc.indexOf('data-capability-slot') >= 0);
assert.ok(padSrc.indexOf('maybeAutoSuggestIcon') >= 0);
assert.ok(padSrc.indexOf('id="microHwIconDetails"') >= 0, 'icon appearance details restored');
assert.ok(padSrc.indexOf('id="microHwEffectSection"') >= 0);
assert.ok(padSrc.indexOf('id="microHwIconPreviewTip"') >= 0);
assert.ok(padSrc.indexOf('bindIconToCapabilitySlot') < 0, 'must not force-bind icon on every slot pick');
(function () {
  var buildAt = padSrc.indexOf('function buildEditKeycapInnerHtml');
  assert.ok(buildAt >= 0, 'buildEditKeycapInnerHtml present');
  var ensureSlice = padSrc.slice(buildAt, buildAt + 4200);
  assert.ok(ensureSlice.indexOf('id="microHwCapList"') >= 0);
  assert.ok(ensureSlice.indexOf('id="microHwEditIcons"') >= 0, 'icon grid in edit modal');
  assert.ok(ensureSlice.indexOf('id="microHwIconDetails"') >= 0);
  assert.ok(ensureSlice.indexOf('id="microHwEffectSection"') >= 0);
  assert.ok(ensureSlice.indexOf('id="microHwIconPreviewTip"') >= 0);
  assert.ok(ensureSlice.indexOf('id="microHwHwDetails"') >= 0);
  var renderCapAt = padSrc.indexOf('function renderCapabilityList');
  assert.ok(renderCapAt > 0);
  var renderCapSlice = padSrc.slice(renderCapAt, renderCapAt + 6000);
  assert.ok(renderCapSlice.indexOf('cap-result') < 0, 'cap list must not embed explanation copy');
  assert.ok(renderCapSlice.indexOf('cap-trigger') < 0, 'cap list must not embed source tag');
  assert.ok(
    renderCapSlice.indexOf("allSlotOptions(m).concat([{ id: '', label: '' }])") >= 0
      || /allSlotOptions\(m\)\.concat\(\[\{\s*id:\s*''/.test(renderCapSlice),
    'unbound option must be appended last'
  );
  var saveAt = padSrc.indexOf('function commitEditKeycapDraft');
  assert.ok(saveAt > 0, 'commitEditKeycapDraft present');
  var saveSlice = padSrc.slice(saveAt, saveAt + 2000);
  assert.ok(saveSlice.indexOf('editDraft.slotId') >= 0, 'save reads editDraft.slotId');
  assert.ok(saveSlice.indexOf('microHwEditSlot.value') < 0, 'save must not read DOM select');
  assert.ok(padSrc.indexOf("setAttribute('data-icon-id'") >= 0 || padSrc.indexOf('data-icon-id') >= 0);

  // Icon hover must not write into Zone 2 effect tip
  var renderIconAt = padSrc.indexOf('function renderIconGrid');
  var renderIconEnd = padSrc.indexOf('function showEditEffectTip', renderIconAt);
  var renderIconSlice = padSrc.slice(renderIconAt, renderIconEnd > 0 ? renderIconEnd : renderIconAt + 1800);
  assert.ok(renderIconSlice.indexOf('showIconPreviewTip') >= 0);
  assert.ok(renderIconSlice.indexOf('showEditEffectTip') < 0, 'icon hover must not pollute effect tip');

  // Status note uses dynamic host resolver, not hardcoded commandPalette
  var statusNoteAt = padSrc.indexOf('function updateStatusLightNote');
  assert.ok(statusNoteAt > 0);
  var statusNoteSlice = padSrc.slice(statusNoteAt, statusNoteAt + 700);
  assert.ok(statusNoteSlice.indexOf('resolveStatusLightMicroKeyId') >= 0);
  assert.ok(statusNoteSlice.indexOf('commandPalette') < 0);
  assert.ok(statusNoteSlice.indexOf('仍会打开命令菜单') < 0);

  // Saved icon + reopen iconTouched inference
  assert.ok(typeof Pad.resolveOpenEditIconState === 'function');
  var custom = Pad.resolveOpenEditIconState(
    { uiIconId: 'cloud', slotId: 'newThread' },
    'newThread',
    { uiIconId: 'fork' }
  );
  assert.equal(custom.uiIconId, 'cloud', 'prefer route.uiIconId');
  assert.equal(custom.iconTouched, true, 'custom icon survives reopen as touched');
  var stock = Pad.resolveOpenEditIconState(
    { uiIconId: 'fork', slotId: 'newThread' },
    'newThread',
    { uiIconId: 'fork' }
  );
  assert.equal(stock.iconTouched, false, 'stock default icon is untouched');
  var missing = Pad.resolveOpenEditIconState({}, 'commandPalette', null);
  assert.equal(missing.uiIconId, 'palette');
  assert.equal(missing.iconTouched, false);

  // iconTouched blocks auto-suggest overwrite
  var draftTouched = { slotId: 'newThread', uiIconId: 'cloud', iconTouched: true };
  assert.equal(Pad.maybeAutoSuggestIcon(draftTouched), false);
  assert.equal(draftTouched.uiIconId, 'cloud');
  var draftFresh = { slotId: 'commandPalette', uiIconId: 'fork', iconTouched: false };
  assert.equal(Pad.maybeAutoSuggestIcon(draftFresh), true);
  assert.equal(draftFresh.uiIconId, 'palette');

  assert.equal(Pad.humanMicroKeyLabel('AG00'), '\u6570\u5b57 7');
  assert.equal(Pad.humanMicroKeyLabel('AG01'), '\u6570\u5b57 8');
})();
// JSON layout mirrors JS AG stock
assert.equal(layout.cells.find(function (c) { return c.microKeyId === 'AG00'; }).defaultSlotId, 'commandPalette');
assert.equal(layout.cells.find(function (c) { return c.microKeyId === 'AG01'; }).defaultSlotId, 'newThread');
assert.equal(layout.defaultRoutes.find(function (r) { return r.microKeyId === 'UNDO'; }).slotId, '');
assert.ok(layout.defaultRoutes.every(function (r) { return r.slotId !== 'status'; }));

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
assert.equal(mapping.codexMicroPad.layoutProfile, 'custom');
assert.equal(!!mapping.codexMicroPad.softwareEnhanceEnabled, true);
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

// Step1: recognition page slim — keys host is jump-only (no inline pad chrome)
assert.ok(Pad.openPadManager && Pad.closePadManager);
var renderTargetFn = padSrc.slice(
  padSrc.indexOf('function renderTarget'),
  padSrc.indexOf('function ensureEditModal')
);
assert.ok(renderTargetFn.indexOf('renderKeysSoftPadJump') >= 0, 'keys host delegates to Soft Pad jump');
assert.ok(renderTargetFn.indexOf('renderProfileSeg') < 0, 'inline renderTarget must not use layout segments');
assert.ok(renderTargetFn.indexOf('renderModeSeg') < 0, 'inline renderTarget must not use mode segments');
assert.ok(renderTargetFn.indexOf('data-act="numlock"') < 0);
assert.ok(renderTargetFn.indexOf('data-act="enhance"') < 0);
assert.ok(renderTargetFn.indexOf('codex-micro-pad__toolbar') < 0);
var keysJumpFn = padSrc.slice(
  padSrc.indexOf('function renderKeysSoftPadJump'),
  padSrc.indexOf('global.OneToneCodexMicroPadUi')
);
assert.ok(keysJumpFn.indexOf('data-act="manage"') >= 0);
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
assert.ok(
  /sync_minimized_for_mapping|resolve_minimized_on_mapping_change|expand_sticky_across_same_mapping/.test(
    fs.readFileSync(path.join(__dirname, '../src-tauri/src/codex_micro_overlay.rs'), 'utf8')
  ),
  'mini expand sticky across snapshots'
);
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
assert.ok(padUiSrc.indexOf('cmd_codex_micro_pad_set_layout') >= 0, 'layout profile uses quiet IPC');
assert.ok(padUiSrc.indexOf('function persistLayout') >= 0);
assert.ok(padUiSrc.indexOf('remountLayout: false') >= 0, 'profile switch must not remount layout panel');
assert.ok(padUiSrc.indexOf('data-pad-enhance-wrap') >= 0);
assert.ok(padUiSrc.indexOf('patchSoftPadLayoutProfileUi') >= 0);
assert.ok(libRs.indexOf('cmd_codex_micro_pad_set_layout') >= 0);
var flagsCmdRs = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/ipc/commands/shell/codex_micro_pad_flags_cmd.rs'),
  'utf8'
);
assert.ok(flagsCmdRs.indexOf('cmd_codex_micro_pad_set_layout') >= 0);
assert.ok(flagsCmdRs.indexOf('skip mvp_init/voice') >= 0);
var applyLayoutFn = (function () {
  var start = padUiSrc.indexOf('function applyLayoutProfile');
  var end = padUiSrc.indexOf('function exportLayoutJson');
  return padUiSrc.slice(start, end);
})();
assert.ok(applyLayoutFn.indexOf('persistLayout(m)') >= 0, 'applyLayoutProfile quiet-saves layout');
assert.ok(applyLayoutFn.indexOf('persist();') < 0, 'applyLayoutProfile must not full cmd_save');
var persistSrc = fs.readFileSync(path.join(__dirname, '../src/js/core/config-persist.js'), 'utf8');
assert.ok(
  persistSrc.indexOf("settingsPanel==='softPad'") >= 0 ||
    persistSrc.indexOf("p==='softPad'") >= 0,
  'pullBackendConfig skips Soft Pad'
);
assert.ok(padUiSrc.indexOf('Native Micro') >= 0);
assert.ok(padUiSrc.indexOf('Codex Hook') >= 0);
assert.ok(padUiSrc.indexOf('Claude Hook') >= 0 || padUiSrc.indexOf('claude_hook') >= 0);
assert.ok(padUiSrc.indexOf('renderHookStatusCard') >= 0);
assert.ok(
  padUiSrc.indexOf('cmd_soft_pad_agent_lights_set') >= 0 ||
    padUiSrc.indexOf('cmd_codex_status_lights_set') >= 0,
  'status lights IPC wired in pad UI'
);
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
(function () {
  var probe = require('./claude-hook-probe.js');
  assert.equal(probe.approvalUrlFromStateUrl('http://127.0.0.1:8796/api/codex-app/state'), 'http://127.0.0.1:8796/api/claude-approval');
  var out = probe.permissionDecisionStdout('allow');
  assert.ok(out.indexOf('PermissionRequest') >= 0);
  assert.ok(out.indexOf('"behavior":"allow"') >= 0 || out.indexOf('"behavior": "allow"') >= 0);
  assert.ok(probe.DEFAULT_APPROVAL_URL.indexOf('/api/claude-approval') >= 0);
})();
assert.ok(fs.readFileSync(path.join(__dirname, '../src-tauri/src/codex_micro_protocol_server.rs'), 'utf8').indexOf('CLAUDE_APPROVAL_PATH') >= 0);
assert.ok(typeof Pad.assignClaudeAgentLightHosts === 'function');
assert.equal(Pad.resolveClaudeMainLightMicroKeyId({ keys: Pad.LAYOUT.defaultRoutes }), 'AG01');
(function () {
  var sticky = {};
  var r1 = Pad.assignClaudeAgentLightHosts(
    { keys: Pad.LAYOUT.defaultRoutes },
    [
      { agentKey: 'claude/main', state: 'running', firstSeenAt: 1 },
      { agentKey: 'a1', agentId: 'a1', agentType: 'rev', state: 'running', firstSeenAt: 2 },
      { agentKey: 'a2', agentId: 'a2', agentType: 'test', state: 'running', firstSeenAt: 3 }
    ],
    sticky
  );
  assert.ok(r1.assigned.length >= 2);
  var hosts = r1.assigned.map(function (x) { return x.microKeyId; });
  assert.ok(hosts.indexOf('AG00') < 0, 'Claude must not steal Codex status host AG00');
  assert.equal(sticky['a1'], r1.assigned.find(function (x) { return x.light.agentKey === 'a1'; }).microKeyId);
  var r2 = Pad.assignClaudeAgentLightHosts(
    { keys: Pad.LAYOUT.defaultRoutes },
    [{ agentKey: 'a1', agentId: 'a1', state: 'running', firstSeenAt: 99 }],
    sticky
  );
  assert.equal(r2.assigned[0].microKeyId, sticky.a1, 'sticky reuse same host');
})();
assert.ok(padUiSrc.indexOf('assignClaudeAgentLightHosts') >= 0);
assert.ok(padUiSrc.indexOf('官方多灯') < 0);
assert.ok(padUiSrc.indexOf('官方硬件多灯') < 0);
var docsPad = fs.readFileSync(path.join(__dirname, '../docs/pad-status-core.md'), 'utf8');
var docsHook = fs.readFileSync(path.join(__dirname, '../docs/codex-hook-onetone-setup.md'), 'utf8');
assert.ok(docsPad.indexOf('Claude Agent Activity Pad') >= 0 || docsPad.indexOf('自建聚合') >= 0);
assert.ok(docsPad.indexOf('v.oai.thstatus') >= 0);
assert.ok(
  docsPad.indexOf('不等同于官方 Codex Micro 原生硬件协议') >= 0,
  'docs must state Soft Pad ≠ official Micro hardware protocol'
);
assert.ok(docsHook.indexOf('自建') >= 0);
assert.ok(docsHook.indexOf('非官方硬件多灯协议') >= 0);
// Soft RGB must not read Claude multi-lights
var overlayRs = fs.readFileSync(path.join(__dirname, '../src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var rgbFn = overlayRs.match(/fn resolve_overlay_rgb\([\s\S]*?\n\}/);
assert.ok(rgbFn, 'resolve_overlay_rgb present');
assert.ok(rgbFn[0].indexOf('claude') < 0, 'Soft RGB must not read Claude lights');
assert.ok(rgbFn[0].indexOf('agent_lights') < 0);
assert.ok(overlayRs.indexOf('effective_act_context') >= 0);
assert.ok(fs.readFileSync(path.join(__dirname, '../src-tauri/src/pad_status/claude_lights.rs'), 'utf8').indexOf('FAILED_SETTLE_MS') >= 0);
(function () {
  var sticky = {};
  var lights = [];
  for (var i = 0; i < 8; i++) {
    lights.push({ agentKey: 'x' + i, agentId: 'x' + i, agentType: 't', state: 'running', firstSeenAt: i });
  }
  var full = Pad.assignClaudeAgentLightHosts({ keys: Pad.LAYOUT.defaultRoutes }, lights, sticky);
  assert.ok(full.assigned.length >= 1);
  assert.ok(full.assigned.every(function (x) {
    return x.microKeyId.indexOf('ACT') !== 0 && x.microKeyId.indexOf('NAV') !== 0 && x.microKeyId !== 'ENC';
  }), 'Claude hosts must not occupy ACT/NAV/ENC');
  assert.ok(full.overflow && full.overflow.length > 0, 'overflow when AG pool exhausted');
})();
assert.ok(typeof Pad.shortAgentType === 'function');
assert.equal(Pad.shortAgentType('code-reviewer'), 'reviewer');
assert.equal(Pad.shortAgentType('test-runner'), 'tests');
assert.equal(Pad.shortAgentType('debugger'), 'debug');
assert.equal(Pad.shortAgentType(''), 'Claude');
assert.equal(Pad.shortAgentType('team/explorer'), 'explorer');
assert.ok(padUiSrc.indexOf('shortAgentType') >= 0);
assert.ok(padUiSrc.indexOf('Claude 活动灯') >= 0);
assert.ok(padUiSrc.indexOf('renderClaudeActivityPadCard') >= 0);
assert.ok(padUiSrc.indexOf('codexClaudeActivityPad') >= 0);
assert.ok(padUiSrc.indexOf('patchClaudeActPadFromOverlayCells') >= 0);
assert.ok(padUiSrc.indexOf('cmd_claude_activity_inject') >= 0);
assert.ok(padUiSrc.indexOf('cmd_claude_activity_clear') >= 0);
assert.ok(padUiSrc.indexOf('清空测试活动灯') >= 0);
assert.ok(padUiSrc.indexOf('等待事件') >= 0 || padUiSrc.indexOf('脚本存在，等待 Claude 事件') >= 0);
assert.ok(padUiSrc.indexOf('Claude Activity 接入') >= 0);
assert.ok(padUiSrc.indexOf('确认安装') >= 0);
assert.ok(padUiSrc.indexOf('确认撤回') >= 0);
assert.ok(padUiSrc.indexOf('允许高置信时启用') >= 0);
assert.ok(padUiSrc.indexOf('已启用 Claude 操作') < 0);
assert.ok(padUiSrc.indexOf('cmd_claude_hook_install_confirm') >= 0);
assert.ok(padUiSrc.indexOf('cmd_claude_hook_uninstall_onetone') >= 0);
assert.ok(padUiSrc.indexOf('cmd_claude_cli_inject_pref_set') >= 0);
assert.ok(padUiSrc.indexOf('官方多灯') < 0);
assert.ok(padUiSrc.indexOf('官方硬件多灯') < 0);
assert.ok(padUiSrc.indexOf('cmd_codex_micro_overlay_get_state') >= 0);
assert.ok(padUiSrc.indexOf('Claude native thstatus') < 0);
assert.ok(docsPad.indexOf('Claude Soft Pad 先可见') >= 0);
assert.ok(docsPad.indexOf('SessionStart') >= 0);
assert.ok(docsPad.indexOf('Terminal/PowerShell') >= 0);
assert.ok(docsPad.indexOf('visibleReason') >= 0);
assert.ok(overlayRs.indexOf('CLAUDE_ACTIVITY_SHOW_MS') >= 0);
assert.ok(overlayRs.indexOf('claude_activity_hold') >= 0);
assert.ok(overlayRs.indexOf('overlay_should_be_visible_host') >= 0);
assert.ok(overlayRs.indexOf('visible_reason') >= 0);
assert.ok(overlayRs.indexOf('WindowsTerminal') < 0);
assert.ok(overlayRs.indexOf('powershell.exe') < 0);
assert.ok(padUiSrc.indexOf('cmd_claude_hook_setup_status') >= 0);
assert.ok(padUiSrc.indexOf('复制配置') >= 0);
assert.ok(padUiSrc.indexOf('session_start') >= 0);
assert.ok(padUiSrc.indexOf('允许高置信时启用') >= 0 || padUiSrc.indexOf('CLI 映射') >= 0);
assert.ok(padUiSrc.indexOf('Terminal→Claude') >= 0);
assert.ok(padUiSrc.indexOf('Claude Activity 接入') >= 0);
assert.ok(padUiSrc.indexOf('官方硬件多灯协议') < 0);
var hooksEx = fs.readFileSync(path.join(__dirname, '../scripts/claude-hooks.example.json'), 'utf8');
assert.ok(hooksEx.indexOf('SessionStart') >= 0);
assert.ok(hooksEx.indexOf('SubagentStart') >= 0);
assert.ok(hooksEx.indexOf('claude-activity-v1') >= 0);
assert.ok(hooksEx.indexOf('"timeout": 60') >= 0 || hooksEx.indexOf('"timeout":60') >= 0);
assert.ok(libRs.indexOf('cmd_claude_cli_inject') >= 0);
assert.ok(libRs.indexOf('cmd_claude_cli_decide') >= 0);
assert.ok(libRs.indexOf('cmd_claude_hook_install_confirm') >= 0);
assert.ok(libRs.indexOf('cmd_claude_hook_uninstall_onetone') >= 0);
assert.ok(buildRs.indexOf('cmd_claude_hook_setup_status') >= 0);
assert.ok(buildRs.indexOf('cmd_claude_hook_install_confirm') >= 0);
var claudeSess = fs.readFileSync(path.join(__dirname, '../src-tauri/src/claude_cli_session.rs'), 'utf8');
assert.ok(claudeSess.indexOf('try_softpad_fire') >= 0);
assert.ok(claudeSess.indexOf('cli_inject_pref_enabled') >= 0 || claudeSess.indexOf('cli_inject_pref_disabled') >= 0);
assert.ok(claudeSess.indexOf('overlay_host_allows_show') < 0);
assert.ok(claudeSess.indexOf('note_permission_request') >= 0);
var appIpc = fs.readFileSync(path.join(__dirname, '../src-tauri/permissions/app-ipc.toml'), 'utf8');
assert.ok(appIpc.indexOf('allow-cmd-claude-activity-inject') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-activity-clear') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-hook-setup-status') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-hook-install-confirm') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-hook-uninstall-onetone') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-cli-inject-pref-set') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-cli-inject') >= 0);
assert.ok(appIpc.indexOf('allow-cmd-claude-cli-decide') >= 0);
assert.ok(fs.existsSync(path.join(__dirname, '../src-tauri/permissions/autogenerated/cmd_claude_activity_inject.toml')));
assert.ok(fs.existsSync(path.join(__dirname, '../src-tauri/permissions/autogenerated/cmd_claude_activity_clear.toml')));
assert.ok(buildRs.indexOf('cmd_claude_activity_inject') >= 0);
assert.ok(buildRs.indexOf('cmd_claude_activity_clear') >= 0);
assert.ok(libRs.indexOf('cmd_claude_activity_inject') >= 0);
assert.ok(libRs.indexOf('cmd_claude_activity_clear') >= 0);
var overlayHtml = fs.readFileSync(path.join(__dirname, '../src/codex-micro-overlay.html'), 'utf8');
assert.ok(overlayHtml.indexOf('claudeWaitingHint') >= 0);
assert.ok(overlayHtml.indexOf('waitingHint') >= 0);
assert.ok(
  /light===['"]idle['"]\s*&&\s*waitingHint/.test(overlayHtml.replace(/\s+/g, '')) ||
    overlayHtml.indexOf('light===\'idle\' && waitingHint') >= 0 ||
    overlayHtml.indexOf('light==="idle" && waitingHint') >= 0 ||
    overlayHtml.indexOf("light==='idle' && waitingHint") >= 0,
  'idle + waitingHint meta branch'
);
assert.ok(fullOverflowHasShortLabel(), 'overflow items carry shortLabel');
function fullOverflowHasShortLabel() {
  var sticky = {};
  var lights = [];
  for (var i = 0; i < 8; i++) {
    lights.push({
      agentKey: 'y' + i,
      agentId: 'y' + i,
      agentType: 'code-reviewer',
      state: 'running',
      firstSeenAt: i
    });
  }
  var full = Pad.assignClaudeAgentLightHosts({ keys: Pad.LAYOUT.defaultRoutes }, lights, sticky);
  return full.overflow.some(function (o) {
    return o && o.shortLabel === 'reviewer';
  });
}
assert.ok(typeof Pad.statusSourceLabelFor === 'function');
assert.equal(Pad.statusSourceLabelFor('hook', 'claude'), 'Claude Hook');
assert.equal(Pad.statusSourceLabelFor('hook', 'codex'), 'Codex Hook');
assert.equal(Pad.statusSourceLabelFor('claude_hook', ''), 'Claude Hook');
assert.equal(Pad.statusSourceLabelFor('codex_hook', ''), 'Codex Hook');
assert.equal(Pad.statusSourceLabel('hook'), 'hook', 'raw hook must not assume Codex');
assert.equal(Pad.agentDisplayLabel('claude'), 'Claude');
assert.equal(Pad.agentDisplayLabel('codex'), 'Codex');
assert.ok(padUiSrc.indexOf('statusSourceLabelFor') >= 0);
assert.ok(padUiSrc.indexOf('resolveStatusLightMicroKeyId') >= 0);
assert.ok(padUiSrc.indexOf('codexStatusLightsEnabled') >= 0);
assert.ok(
  padUiSrc.indexOf('querySelector(\'[data-micro-key="AG00"]\')') < 0,
  'applyHookLight must not hardcode AG00 host'
);
assert.ok(i18n.indexOf('Hook → status 绑定键') >= 0 || i18n.indexOf('status-bound key') >= 0);
assert.ok(i18n.indexOf('Hook → AG00') < 0);
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
mapping.codexMicroPad.softwareEnhanceEnabled = false;
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
// New id bypasses session heal cache so ensurePad re-runs protectPrimaryLayout.
mapping.id = 'm-m1-test-restore';
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

// Soft Pad hub: light switch / cancellable paint / no auto-create on scope tab
var softPadHubSrc = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/soft-pad-hub-ui.js'),
  'utf8'
);
function softPadFnSlice(src, name, nextName) {
  var start = src.indexOf('function ' + name);
  assert.ok(start >= 0, 'missing function ' + name);
  var end = nextName ? src.indexOf('function ' + nextName, start + 1) : src.length;
  assert.ok(end > start, 'missing end for ' + name);
  return src.slice(start, end);
}
var selectScopeFn = softPadFnSlice(softPadHubSrc, 'selectScope', 'renderSchemeRow');
assert.ok(selectScopeFn.indexOf('ensureAppSoftPad(') < 0, 'selectScope must not auto-create mapping');
assert.ok(selectScopeFn.indexOf('showPrepareMain') >= 0, 'selectScope shows prepare CTA when missing mapping');
var prepareAppFn = softPadFnSlice(softPadHubSrc, 'prepareAppFromUi', 'applyEnabledUi');
assert.ok(prepareAppFn.indexOf('ensureAppSoftPad(') >= 0, 'prepareAppFromUi creates mapping');
var ensureCodexFn = softPadFnSlice(softPadHubSrc, 'ensureCodex', 'prepareAppFromUi');
assert.ok(ensureCodexFn.indexOf('prepareAppFromUi') >= 0, 'ensureCodex goes through prepare path');
assert.ok(ensureCodexFn.indexOf('selectScope') < 0, 'ensureCodex must not re-enter selectScope');

var toggleSelectedFn = softPadFnSlice(softPadHubSrc, 'toggleSelectedEnable', 'toggleRowEnable');
var toggleRowFn = softPadFnSlice(softPadHubSrc, 'toggleRowEnable', 'isAgentPanelCurrent');
assert.ok(toggleSelectedFn.indexOf('forceRemount: true') < 0, 'toggleSelectedEnable no forceRemount');
assert.ok(toggleRowFn.indexOf('forceRemount: true') < 0, 'toggleRowEnable no forceRemount');
assert.ok(toggleSelectedFn.indexOf('applyEnabledUi') >= 0, 'toggleSelectedEnable light UI path');

var schedulePaintFn = softPadFnSlice(softPadHubSrc, 'schedulePaint', 'selectScheme');
assert.ok(softPadHubSrc.indexOf('pendingPaintEntry') >= 0, 'pendingPaint queue exists');
assert.ok(schedulePaintFn.indexOf('pendingPaintEntry') >= 0, 'schedulePaint records pending when busy');
assert.ok(schedulePaintFn.indexOf('if (paintBusy) return;') < 0, 'schedulePaint must not bare-return on busy');

var openSubpageFn = softPadFnSlice(softPadHubSrc, 'openSubpage', 'closeSubpage');
var closeSubpageFn = softPadFnSlice(softPadHubSrc, 'closeSubpage', 'markActiveRow');
// openSubpage must not bump selectToken (cancels deferred preview → blank/假死).
assert.ok(openSubpageFn.indexOf('++selectToken') < 0 && openSubpageFn.indexOf('selectToken++') < 0);
assert.ok(openSubpageFn.indexOf('setSoftPadFace') >= 0, 'openSubpage routes through setSoftPadFace');
assert.ok(openSubpageFn.indexOf('paintSubpage(') < 0, 'openSubpage must not paint directly');
assert.ok(openSubpageFn.indexOf('schedulePreviewPaint') < 0, 'openSubpage must not schedule preview');
assert.ok(openSubpageFn.indexOf('paintPreview') < 0, 'openSubpage must not paintPreview');
assert.ok(closeSubpageFn.indexOf('fe softPad.closeSubpage') >= 0);
assert.ok(
  closeSubpageFn.indexOf('setSoftPadFace') >= 0 || closeSubpageFn.indexOf('setSoftPadPadMode') >= 0,
  'closeSubpage returns via face/mode setter'
);
assert.ok(softPadHubSrc.indexOf('++subpageToken') >= 0 || softPadHubSrc.indexOf('subpageToken++') >= 0);
assert.ok(softPadHubSrc.indexOf('isAgentPanelCurrent') >= 0);
assert.ok(softPadHubSrc.indexOf('onSoftPadPanelChanged') >= 0);
assert.ok(softPadHubSrc.indexOf('var selectToken') >= 0, 'selectToken kept for scope/scheme');
assert.ok(softPadHubSrc.indexOf('var previewEpoch') >= 0, 'previewEpoch owns preview queue');
assert.ok(softPadHubSrc.indexOf('function schedulePreviewPaint') >= 0, 'schedulePreviewPaint exists');
var softPadOnChangedFn = softPadFnSlice(softPadHubSrc, 'onSoftPadPanelChanged', 'paintSubpage');
assert.ok(softPadOnChangedFn.indexOf('remountLayout') >= 0, 'hub honors remountLayout=false');
var onChangedRuntimeIdx = softPadOnChangedFn.indexOf("panel === 'runtime'");
assert.ok(onChangedRuntimeIdx >= 0, 'onSoftPadPanelChanged has runtime branch');
var onChangedRuntimeSlice = softPadOnChangedFn.slice(
  onChangedRuntimeIdx,
  softPadOnChangedFn.indexOf("panel === 'agent'", onChangedRuntimeIdx)
);
assert.ok(onChangedRuntimeSlice.indexOf('paintPreview') < 0, 'runtime branch must not paintPreview');
assert.ok(onChangedRuntimeSlice.indexOf('schedulePreviewPaint') < 0, 'runtime branch must not schedule preview');

var selectScopeNoDiag = selectScopeFn;
var selectSchemeFn = softPadFnSlice(softPadHubSrc, 'selectScheme', 'selectScope');
assert.ok(selectScopeNoDiag.indexOf('refreshHookSetupStatus') < 0);
assert.ok(selectScopeNoDiag.indexOf('refreshClaudeActivityPad') < 0);
assert.ok(selectScopeNoDiag.indexOf('cmd_pad_status_diagnose') < 0);
assert.ok(selectSchemeFn.indexOf('refreshHookSetupStatus') < 0);
assert.ok(selectSchemeFn.indexOf('cmd_pad_status_diagnose') < 0);

var padUiAgentSrc = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var fillLazyFn = softPadFnSlice(padUiAgentSrc, 'fillLazyAgentConnect', 'findMappingById');
assert.ok(
  fillLazyFn.indexOf('refreshHookSetupStatus') >= 0 ||
    fillLazyFn.indexOf('refreshAgentLightsPickerState') >= 0,
  'lazy agent connect refreshes hook/lights state'
);
assert.ok(
  fillLazyFn.indexOf('refreshClaudeActivityPad') >= 0 ||
    fillLazyFn.indexOf('refreshAgentLightsPickerState') >= 0,
  'lazy agent connect refreshes claude/lights state'
);
assert.ok(fillLazyFn.indexOf('requireSoftPad && token == null') >= 0 ||
  fillLazyFn.indexOf('requireSoftPad === true && token == null') >= 0 ||
  /requireSoftPad[\s\S]*?token\s*==\s*null[\s\S]*?return/.test(fillLazyFn),
  'fillLazyAgentConnect requireSoftPad without token must return');
assert.ok(padUiAgentSrc.indexOf('agentRefreshStillCurrent') >= 0);
assert.ok(padUiAgentSrc.indexOf('isAgentPanelCurrent') >= 0);
assert.ok(padUiAgentSrc.indexOf('setSoftPadControlsBusy') >= 0);
assert.ok(padUiAgentSrc.indexOf('controlBusyUntil') >= 0);

function softPadPanelRenderSlice(src, name, nextName) {
  return softPadFnSlice(src, name, nextName);
}
var presentationPanelFn = softPadPanelRenderSlice(padUiAgentSrc, 'renderSoftPadPresentationPanel', 'renderSoftPadRuntimePanel');
var runtimePanelFn = softPadPanelRenderSlice(padUiAgentSrc, 'renderSoftPadRuntimePanel', 'renderSoftPadPurposePanel');
var purposePanelFn = softPadPanelRenderSlice(padUiAgentSrc, 'renderSoftPadPurposePanel', 'renderSoftPadAgentPanel');
var agentPanelFn = softPadPanelRenderSlice(padUiAgentSrc, 'renderSoftPadAgentPanel', 'setSoftPadControlsBusy');
['renderSoftPadPreview', 'paintPreview', 'remountSoftPadPreviewShell'].forEach(function (banned) {
  assert.ok(presentationPanelFn.indexOf(banned) < 0, 'presentation panel bans ' + banned);
  assert.ok(runtimePanelFn.indexOf(banned) < 0, 'runtime panel bans ' + banned);
  assert.ok(purposePanelFn.indexOf(banned) < 0, 'purpose panel bans ' + banned);
  assert.ok(agentPanelFn.indexOf(banned) < 0, 'agent panel bans ' + banned);
});
assert.ok(runtimePanelFn.indexOf('renderNumpadMapHtml') < 0, 'runtime panel no feature demos');
assert.ok(purposePanelFn.indexOf('renderNumpadMapHtml') >= 0, 'purpose panel hosts feature demos');
assert.ok(softPadHubSrc.indexOf('renderSoftPadPurposePanel') >= 0, 'hub routes purpose to Pad panel');
assert.ok(softPadHubSrc.indexOf("softPadPadMode !== 'purpose'") >= 0 ||
  softPadHubSrc.indexOf("softPadPadMode === 'purpose'") >= 0,
  'purpose syncs feature checkboxes');

var remountPreviewFn = softPadFnSlice(padUiAgentSrc, 'remountSoftPadPreviewShell', 'renderSoftPadPreview');
assert.ok(remountPreviewFn.indexOf('bindPadClicks') < 0, 'remountSoftPadPreviewShell must not rebindPadClicks');
assert.ok(padUiAgentSrc.indexOf('function ensureSoftPadPreviewDelegate') >= 0, 'Soft Pad preview uses event delegation');
assert.ok(padUiAgentSrc.indexOf("data-soft-pad-preview-delegate") >= 0);

var upsertRouteFn = softPadFnSlice(padUiAgentSrc, 'upsertRoute', 'startRecordNumpad');
assert.ok(upsertRouteFn.indexOf('softPadPanelActive()') >= 0, 'upsertRoute Soft Pad quiet path');
assert.ok(upsertRouteFn.indexOf('persistLayout(m)') >= 0, 'upsertRoute Soft Pad uses persistLayout');
var saveEditFn = softPadFnSlice(padUiAgentSrc, 'saveEditKeycap', 'ensureAgentKeyBinding');
var commitEditFn = softPadFnSlice(padUiAgentSrc, 'commitEditKeycapDraft', 'saveEditKeycap');
assert.ok(saveEditFn.indexOf('forceFull: true') < 0, 'Soft Pad keycap save must not forceFull remount');
assert.ok(commitEditFn.indexOf('schedulePreviewPaint') >= 0 || commitEditFn.indexOf('notifyLinkedUi') >= 0,
  'Soft Pad keycap save refreshes via schedule/notify');

assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?cursor-chat/.test(softPadHubSrc), 'BUILTIN includes cursor');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?minimax-chat/.test(softPadHubSrc), 'BUILTIN includes minimax');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?workbuddy-chat/.test(softPadHubSrc), 'BUILTIN includes workbuddy');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?trae-chat/.test(softPadHubSrc), 'BUILTIN includes trae');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?qoder-chat/.test(softPadHubSrc), 'BUILTIN includes qoder');
assert.ok(padUiAgentSrc.indexOf("agent: 'copilotCli'") >= 0, 'topbar candidates include copilotCli');
assert.ok(padUiAgentSrc.indexOf("agent: 'gemini'") >= 0, 'topbar candidates include gemini');
assert.ok(padUiAgentSrc.indexOf('lightItems: topbarLightPickerItems') >= 0, 'picker gets lightItems not all presets');
assert.ok(padUiAgentSrc.indexOf('function topbarLightPickerItems') >= 0, 'light picker filters already-on');
assert.ok(padUiAgentSrc.indexOf("return 'icons/app-target/copilot.png'") >= 0, 'copilot light icon');
assert.ok(padUiAgentSrc.indexOf("return 'icons/app-target/gemini.png'") >= 0, 'gemini light icon');
assert.ok(padUiAgentSrc.indexOf('TOPBAR_QUOTA_CANDIDATES') >= 0, 'quota backup list');
assert.ok(padUiAgentSrc.indexOf("provider: 'openrouter'") >= 0, 'quota includes openrouter');
assert.ok(softPadHubSrc.indexOf("'copilot-cli': 'copilotCli'") >= 0, 'hub maps copilot-cli');
assert.ok(!/BUILTIN_SOFT_PAD_APPS[\s\S]{0,400}copilot-cli/.test(softPadHubSrc), 'BUILTIN omits copilot-cli');
assert.ok(softPadHubSrc.indexOf('HUB_KIND_RANK') >= 0 || softPadHubSrc.indexOf('workbuddy: 3') >= 0, 'hub kind rank');
assert.ok(softPadHubSrc.indexOf('BUILTIN_SOFT_PAD_APPS.map') >= 0, 'scopes from BUILTIN map');
assert.ok(softPadHubSrc.indexOf('data-scope') >= 0, 'switcher uses data-scope');
assert.ok(softPadHubSrc.indexOf('data-lane-pin') < 0, 'no temporary pin chips');
assert.ok(softPadHubSrc.indexOf('data-lane-follow') < 0, 'no follow chip');
assert.ok(fs.existsSync(path.join(__dirname, '../src/js/features/agent/shell-agent-hook-panel.js')),
  'shell-agent-hook-panel.js exists');
assert.ok(softPadHubSrc.indexOf('function appTitleFor(kind)') >= 0);
assert.ok(softPadHubSrc.indexOf('function isHubSoftPadKind(kind)') >= 0);
assert.ok(softPadHubSrc.indexOf("id: 'global'") < 0 || softPadHubSrc.indexOf('pickDefaultScopeId') >= 0);
assert.ok(softPadHubSrc.indexOf('pickDefaultScopeId') >= 0);
assert.ok(/function listAppScopes[\s\S]*?BUILTIN_SOFT_PAD_APPS\.map/.test(softPadHubSrc), 'scopes from builtin only');
assert.ok(softPadHubSrc.indexOf('keepPreview') >= 0 || softPadHubSrc.indexOf("softPadPadMode === 'keys'") >= 0 || softPadHubSrc.indexOf('previewHostForFace') >= 0, 'layout/keys keeps preview');
assert.ok(softPadHubSrc.indexOf('is-collapsed') >= 0, 'subpage collapses preview');
assert.ok(padUiAgentSrc.indexOf("mode === 'softPad'") >= 0);
assert.ok(padUiAgentSrc.indexOf('openEditKeycap(m, id)') >= 0);
assert.ok(padUiAgentSrc.indexOf('iconEffectTip') >= 0);
assert.ok(padUiAgentSrc.indexOf('slotEffectTip') >= 0);
assert.ok(padUiAgentSrc.indexOf('microHwEditEffectTip') >= 0);

// Soft Pad skins — visual only
assert.ok(padUiAgentSrc.indexOf("var PAD_SKINS = ['default', 'glass-light', 'hybrid-pro', 'vibe-light', 'vibe-dark']") >= 0
  || /PAD_SKINS\s*=\s*\[[^\]]*'default'[^\]]*'glass-light'[^\]]*'hybrid-pro'[^\]]*'vibe-light'[^\]]*'vibe-dark'/.test(padUiAgentSrc),
  'PAD_SKINS whitelist');
assert.ok(padUiAgentSrc.indexOf('function normalizePadSkin') >= 0);
assert.ok(padUiAgentSrc.indexOf('function persistPadSkin') >= 0);
assert.ok(padUiAgentSrc.indexOf('cmd_codex_micro_pad_set_skin') >= 0, 'quiet skin IPC');
var persistSkinFn = softPadFnSlice(padUiAgentSrc, 'persistPadSkin', 'ensurePadManagerModal');
assert.ok(persistSkinFn.indexOf("persist()") < 0 && !/\bpersist\s*\(/.test(persistSkinFn.replace(/\/\/[^\n]*/g, '')),
  'persistPadSkin must not bare persist()');
assert.ok(persistSkinFn.indexOf("'cmd_save'") < 0 && persistSkinFn.indexOf('"cmd_save"') < 0,
  'persistPadSkin must not cmd_save');
assert.ok(persistSkinFn.indexOf('patchSkinSegActive') < 0, 'persistPadSkin must not roll back UI on fail');
assert.ok(persistSkinFn.indexOf('softPadSkinSaveFail') >= 0 || persistSkinFn.indexOf('toast(') >= 0,
  'persistPadSkin toasts on fail instead of snapping to default');
assert.ok(padUiAgentSrc.indexOf('data-pad-skin') >= 0, 'render stamps data-pad-skin');
assert.ok(padUiAgentSrc.indexOf('function renderSkinSeg') >= 0);
assert.ok(padUiAgentSrc.indexOf('function patchSoftPadPreviewSkin') >= 0);
assert.ok(padUiAgentSrc.indexOf("var PAD_SKIN_CHOICES = ['default', 'glass-light', 'hybrid-pro', 'vibe-light']") >= 0
  || /PAD_SKIN_CHOICES\s*=\s*\[[^\]]*'vibe-light'/.test(padUiAgentSrc),
  'PAD_SKIN_CHOICES excludes vibe-dark');
assert.ok(padUiAgentSrc.indexOf('function canonicalizePadSkin') >= 0);
assert.ok(padUiAgentSrc.indexOf("mode !== 'softPad'") >= 0, 'softPad preview omits decorative LEDs');
var presentationPanelFnSkin = softPadFnSlice(padUiAgentSrc, 'renderSoftPadPresentationPanel', 'renderSoftPadRuntimePanel');
assert.ok(presentationPanelFnSkin.indexOf('renderSkinSeg') >= 0, 'presentation hosts skin UI');
assert.ok(presentationPanelFnSkin.indexOf('paintPreview') < 0);
assert.ok(presentationPanelFnSkin.indexOf('schedulePreviewPaint') < 0);
var lightBindFn = softPadFnSlice(padUiAgentSrc, 'bindSoftPadLightPanelEvents', 'renderCodexMicroPadManager');
var skinClickIdx = lightBindFn.indexOf('[data-pad-skin-opt]');
assert.ok(skinClickIdx >= 0, 'skin click handler');
var skinClickSlice = lightBindFn.slice(skinClickIdx, skinClickIdx + 900);
assert.ok(skinClickSlice.indexOf('persistPadSkin') >= 0);
assert.ok(skinClickSlice.indexOf('patchSoftPadPreviewSkin') >= 0);
assert.ok(skinClickSlice.indexOf('paintPreview') < 0, 'skin switch no paintPreview');
assert.ok(skinClickSlice.indexOf('schedulePreviewPaint') < 0, 'skin switch no schedulePreviewPaint');
assert.ok(skinClickSlice.indexOf("panel: 'presentation'") >= 0);
assert.ok(skinClickSlice.indexOf('persist()') < 0, 'skin switch no bare persist()');
assert.ok(skinClickSlice.indexOf('skinPersistRollback') < 0, 'no rollback snap on click');
assert.ok(skinClickSlice.indexOf('canonicalizePadSkin') >= 0);
assert.ok(padUiAgentSrc.indexOf("data-micro-key") >= 0);
assert.ok(padUiAgentSrc.indexOf('data-run-status') >= 0);
assert.ok(padUiAgentSrc.indexOf('data-status-source') >= 0);
assert.ok(softPadHubSrc.indexOf("softPadPadMode === 'look'") >= 0 || softPadHubSrc.indexOf('previewHostForFace') >= 0, 'presentation/look keeps preview');

var padCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-pad.css'), 'utf8');
var overlayCss = fs.readFileSync(path.join(__dirname, '../src/css/codex-micro-overlay.css'), 'utf8');
assert.ok(padCss.indexOf('[data-pad-skin="glass-light"]') >= 0);
assert.ok(padCss.indexOf('[data-pad-skin="hybrid-pro"]') >= 0);
assert.ok(padCss.indexOf('[data-pad-skin="vibe-light"]') >= 0);
assert.ok(padCss.indexOf('[data-pad-skin="vibe-dark"]') >= 0);
assert.ok(padCss.indexOf('font-family') >= 0 && padCss.indexOf(':hover') >= 0);
assert.ok(padCss.indexOf(':active') >= 0 || padCss.indexOf('.is-pressed') >= 0);
assert.ok(padCss.indexOf('html[data-theme="dark"]') >= 0 && padCss.indexOf('vibe-light') >= 0,
  'dark theme skin counterparts exist');
assert.ok(padCss.indexOf('.soft-pad-preview .micro-hw__leds') >= 0, 'CSS hides soft-pad LEDs');
assert.ok(overlayCss.indexOf('[data-pad-skin="vibe-light"]') >= 0);
assert.ok(overlayCss.indexOf('html[data-theme="dark"]') >= 0, 'overlay dark skin CSS');
assert.ok(!/\[data-pad-skin=[\s\S]{0,200}body\s*\{/.test(padCss), 'skin CSS must not invade body');
assert.ok(padCss.indexOf('.container {') < 0 || padCss.indexOf('[data-pad-skin') < padCss.lastIndexOf('[data-pad-skin'),
  'no prototype .container skin block');

var overlayHtml = fs.readFileSync(path.join(__dirname, '../src/codex-micro-overlay.html'), 'utf8');
assert.ok(overlayHtml.indexOf('normalizeOverlaySkin') >= 0 || overlayHtml.indexOf('data-pad-skin') >= 0);
assert.ok(overlayHtml.indexOf("setAttribute('data-pad-skin'") >= 0 || overlayHtml.indexOf('data-pad-skin') >= 0);
assert.ok(overlayHtml.indexOf('vibe-light') >= 0);
assert.ok(overlayHtml.indexOf('syncOverlayTheme') >= 0);

console.log('agent-codex-micro.test.js ok');
