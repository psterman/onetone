/**
 * Cursor Soft Pad: slot → icon coverage + grouped menu + overlay ICON sync.
 * Run: node scripts/cursor-soft-pad-icons.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
global.window = global;
global.OneToneI18n = {
  t: function (_k, fallback) { return fallback || _k; },
  lang: function () { return 'zh-CN'; }
};
require(path.join(root, 'src/js/features/agent/agent-actions.js'));
require(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'));

var Pad = global.OneToneCodexMicroPadUi;
assert.ok(Pad, 'pad UI module loaded');
assert.ok(Pad.CURSOR_SOFT_PAD_SLOT_IDS, 'CURSOR_SOFT_PAD_SLOT_IDS');
assert.ok(Pad.SLOT_DEFAULT_ICON, 'SLOT_DEFAULT_ICON');
assert.ok(Pad.ICON_SVG, 'ICON_SVG');
assert.ok(Pad.CURSOR_SLOT_GROUPS, 'CURSOR_SLOT_GROUPS');

var padSrc = fs.readFileSync(
  path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var overlaySrc = fs.readFileSync(
  path.join(root, 'src/codex-micro-overlay.html'),
  'utf8'
);

var slotIds = Object.keys(Pad.CURSOR_SOFT_PAD_SLOT_IDS).filter(function (k) {
  return Pad.CURSOR_SOFT_PAD_SLOT_IDS[k];
});

slotIds.forEach(function (sid) {
  var iconId = Pad.SLOT_DEFAULT_ICON[sid];
  assert.ok(iconId, 'SLOT_DEFAULT_ICON missing for ' + sid);
  assert.ok(Pad.ICON_SVG[iconId], 'ICON_SVG missing id ' + iconId + ' for slot ' + sid);
  var re = new RegExp('\\b' + iconId + '\\s*:');
  assert.ok(re.test(overlaySrc), 'overlay ICON missing id ' + iconId + ' for slot ' + sid);
});

assert.equal(Pad.SLOT_DEFAULT_ICON.commandPalette, 'command');
assert.equal(Pad.SLOT_DEFAULT_ICON.quickChat, 'sparkles');
assert.equal(Pad.SLOT_DEFAULT_ICON.newThread, 'messagePlus');
assert.equal(Pad.SLOT_DEFAULT_ICON.toggleSidebar, 'panelLeft');
assert.equal(Pad.SLOT_DEFAULT_ICON.openSettings, 'settings');
assert.equal(Pad.SLOT_DEFAULT_ICON.pasteAndSend, 'clipboardPaste');
assert.ok(Pad.CURSOR_SOFT_PAD_SLOT_IDS.pasteAndSend, 'pasteAndSend in allowlist');
assert.ok(Pad.ICON_SVG.clipboardPaste, 'clipboardPaste SVG');

var seen = {};
var groupSlots = [];
Pad.CURSOR_SLOT_GROUPS.forEach(function (g) {
  assert.ok(g.id && (g.labelZh || g.labelEn), 'group needs id+label');
  assert.ok(g.descZh || g.descEn, 'scene needs desc: ' + g.id);
  (g.slots || []).forEach(function (sid) {
    assert.ok(Pad.CURSOR_SOFT_PAD_SLOT_IDS[sid], 'group slot not in allowlist: ' + sid);
    assert.ok(!seen[sid], 'duplicate group slot: ' + sid);
    seen[sid] = 1;
    groupSlots.push(sid);
  });
});

slotIds.forEach(function (sid) {
  assert.ok(seen[sid], 'allowlist slot missing from CURSOR_SLOT_GROUPS: ' + sid);
});

assert.ok(Pad.CURSOR_COMMON_DEFAULT_SLOTS, 'CURSOR_COMMON_DEFAULT_SLOTS');
Pad.CURSOR_COMMON_DEFAULT_SLOTS.forEach(function (sid) {
  assert.ok(Pad.CURSOR_SOFT_PAD_SLOT_IDS[sid], 'common default not in allowlist: ' + sid);
});
assert.ok(padSrc.indexOf('soft-pad-action-library--channels') >= 0, 'channel command library');
assert.ok(padSrc.indexOf('data-layout-layer="common"') < 0, 'common top tab retired');
assert.ok(padSrc.indexOf('data-layout-layer="scenes"') < 0, 'scenes top tab retired');
assert.ok(padSrc.indexOf('soft-pad-action-scene-rail__btn--common') < 0, 'commons rail removed from 屏幕按钮');
assert.ok(padSrc.indexOf('function layoutSceneIdForSlot') >= 0, 'slot → scene helper');
assert.ok(padSrc.indexOf('function buildCursorLayoutSceneGroups') >= 0, 'scene groups builder');
assert.ok(padSrc.indexOf('getCustomShortcuts') < 0 ||
  !/function buildCursorLayoutSceneGroups[\s\S]*?getCustomShortcuts/.test(padSrc),
  'screen-button scenes do not dump customShortcuts');
assert.ok(padSrc.indexOf('function revealCommonsLayoutForKey') >= 0, 'key pick reveals matching scene');
assert.ok(padSrc.indexOf('scrollLayoutEditorIntoView') >= 0, 'inline form auto-scroll');
assert.ok(padSrc.indexOf('id="softPadSettingsPreviewBanner"') < 0 ||
  !require('fs').readFileSync(require('path').join(__dirname, '../src/index.html'), 'utf8').includes('id="softPadSettingsPreviewBanner"'),
  'settings preview banner removed from index');
assert.ok(padSrc.indexOf('iconIdForCapabilitySlot') >= 0 && padSrc.indexOf('iconSvg(iconId)') >= 0, 'list uses Lucide iconSvg');
assert.ok(padSrc.indexOf('soft-pad-action-item__icon micro-hw__icon') >= 0, 'list icon uses micro-hw__icon');
assert.ok(padSrc.indexOf('soft-pad-action-scene-split') >= 0, 'Directory D scene split');
assert.ok(padSrc.indexOf('soft-pad-action-scene-rail') >= 0, 'Directory D scene rail');
assert.ok(padSrc.indexOf('cursorSlotGroupRailLabel') >= 0, 'rail short labels');
assert.ok(padSrc.indexOf('data-layout-scene-back') < 0, 'no drill-back (D is always split)');
assert.ok(Pad.CURSOR_SLOT_GROUPS.some(function (g) {
  return g.id === 'session' && (g.slots || []).indexOf('runTargetSequence') >= 0;
}), 'runTargetSequence lives in session vibe job');
assert.ok(Pad.CURSOR_SLOT_GROUPS.length === 4, 'vibe four jobs');
assert.ok(Pad.CURSOR_SLOT_GROUPS.every(function (g) {
  return ['talk', 'steer', 'jump', 'session'].indexOf(g.id) >= 0;
}), 'vibe job ids');
assert.ok(padSrc.indexOf('normalizeLayoutActionSceneId') >= 0, 'legacy scene → vibe job');
assert.ok(padSrc.indexOf('softPadFnQuery') >= 0, 'fn search query state');
assert.ok(padSrc.indexOf('说给 AI') >= 0, 'plain talk job label');
assert.ok(padSrc.indexOf('语义目录') < 0 || padSrc.indexOf("softPadFnSapPeer") < 0, 'no 语义目录 mid-path');
assert.ok(Pad.isCursorCustomSlotId('custom_abc'), 'custom_ id helper');
assert.ok(!Pad.isCursorCustomSlotId('pushToTalk'), 'builtin not custom');
assert.ok(padSrc.indexOf('function createCustomShortcut') >= 0, 'create custom shortcut');
assert.ok(padSrc.indexOf('data-layout-custom-record') >= 0, 'custom record CTA');
assert.ok(padSrc.indexOf('maybeAutoStartCustomRecord') < 0, 'no auto overwrite record');

assert.ok(padSrc.indexOf('optgroup') >= 0, 'fillLayoutKeySlotSelect uses optgroup');
assert.ok(padSrc.indexOf('micro-hw-modal__cap-group') >= 0, 'capability list has group headers');
assert.ok(padSrc.indexOf('SLOT_WEAK_LEGACY_ICON') >= 0, 'weak legacy migrate map');

console.log(
  '[cursor-soft-pad-icons] ok —',
  slotIds.length,
  'slots,',
  groupSlots.length,
  'grouped,',
  Pad.CURSOR_COMMON_DEFAULT_SLOTS.length,
  'commons,',
  'icons synced with overlay'
);
