/**
 * Soft Pad pasteAndSend: visible icon + leftover heal + Cursor seed.
 * Run: node scripts/soft-pad-paste-send-icon.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var pad = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var overlay = fs.readFileSync(
  path.join(__dirname, '../src/codex-micro-overlay.html'),
  'utf8'
);
var css = fs.readFileSync(path.join(__dirname, '../src/css/soft-pad-hub.css'), 'utf8');

assert.ok(pad.indexOf("slotId: 'pasteAndSend', uiIconId: 'clipboardPaste'") >= 0, 'UNDO seeds pasteAndSend');
assert.ok(pad.indexOf("UNDO: 'clipboardPaste'") >= 0, 'DEFAULT_ICON_BY_MICRO UNDO is clipboardPaste');

var layer = fs.readFileSync(
  path.join(__dirname, '../src-tauri/src/codex_numpad_layer.rs'),
  'utf8'
);
assert.ok(
  /route\("UNDO", 0x50, false, "pasteAndSend"\)/.test(layer),
  'Rust default routes seed UNDO → pasteAndSend Soft Pad preset'
);
assert.ok(
  /"UNDO" => "clipboardPaste"/.test(layer),
  'Rust UNDO stock icon is clipboardPaste'
);
assert.ok(
  /function resolveIconId[\s\S]*isSoftPadLeftoverIcon\(cur, microKeyId, slotId\)/.test(pad),
  'resolveIconId heals leftover icons for slot defaults'
);
assert.ok(
  /SLOT_DEFAULT_ICON\[slotId\][\s\S]*isSoftPadLeftoverIcon\(saveIcon/.test(pad) ||
    /isSoftPadLeftoverIcon\(saveIcon, keyId, slotId\)/.test(pad),
  'commit heals leftover for any slot default icon'
);
assert.ok(
  /applySoftPadCapabilityPick[\s\S]*clipboardPaste|clear leftover/.test(pad) ||
    pad.indexOf('editDraft.uiIconId = SLOT_DEFAULT_ICON[id]') >= 0,
  'capability pick forces slot default icon when leftover'
);
assert.ok(pad.indexOf("slotId) === 'pasteAndSend'") >= 0, 'pasteAndSend effect tip');
assert.ok(overlay.indexOf("pasteAndSend:'clipboardPaste'") >= 0, 'overlay wantSlotIcon pasteAndSend');
assert.ok(
  /clipboardPaste:'<svg[^']*M16 4h2a2 2 0 012 2v14/.test(overlay) ||
    overlay.indexOf('clipboardPaste:') >= 0,
  'overlay clipboardPaste svg present'
);
assert.ok(
  css.indexOf('.soft-pad-fn-card .micro-hw-modal__cap-icon svg') >= 0 &&
    css.indexOf('fill: none') >= 0,
  'fn-card icons use stroke (clipboardPaste visible)'
);

console.log('soft-pad-paste-send-icon.test.js: ok');
