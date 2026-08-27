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

assert.ok(padSrc.indexOf('optgroup') >= 0, 'fillLayoutKeySlotSelect uses optgroup');
assert.ok(padSrc.indexOf('micro-hw-modal__cap-group') >= 0, 'capability list has group headers');
assert.ok(padSrc.indexOf('SLOT_WEAK_LEGACY_ICON') >= 0, 'weak legacy migrate map');

console.log(
  '[cursor-soft-pad-icons] ok —',
  slotIds.length,
  'slots,',
  groupSlots.length,
  'grouped,',
  'icons synced with overlay'
);
