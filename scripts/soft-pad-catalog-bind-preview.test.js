/**
 * Soft Pad mid catalogs (口头指令 / 软件自带 / …) must land on the focused Soft Pad key.
 * Run: node scripts/soft-pad-catalog-bind-preview.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);

assert.ok(src.indexOf('function ensureLayoutEditDraft') >= 0, 'ensureLayoutEditDraft present');
assert.ok(
  /function ensureLayoutEditDraft[\s\S]*Do not fall back to AG00/.test(src),
  'ensureLayoutEditDraft must not invent AG00 / 数字 7'
);
assert.ok(
  /function ensureLayoutEditDraft[\s\S]{0,400}pickDefaultLayoutKey/.test(src) === false,
  'ensureLayoutEditDraft must not call pickDefaultLayoutKey'
);
assert.ok(
  /function onLayoutActionPick[\s\S]*findMicroKeyForSlot\([\s\S]*upsertRoute\([\s\S]*slotId: ''/.test(
    src
  ),
  'onLayoutActionPick clears previous Soft Pad key owning the slot'
);
assert.ok(
  /function ensureLayoutEditDraft[\s\S]*focusedSoftPadKeyId/.test(src),
  'ensureLayoutEditDraft resolves focus via focusedSoftPadKeyId (DOM fallback)'
);
assert.ok(src.indexOf('function pickSlotOntoFocusedKey') >= 0, 'pickSlotOntoFocusedKey present');
assert.ok(
  /pickSlotOntoFocusedKey[\s\S]*applySoftPadCapabilityPick/.test(src),
  'channel pick falls back to applySoftPadCapabilityPick when draft cleared'
);
assert.ok(
  /buildLabeledStripHtml\(\{[\s\S]*disabled:\s*!canBind/.test(src) ||
    /disabled:\s*!softPadCanBindIme|disabled:\s*!canBind/.test(src),
  'IME strip enables when Soft Pad key focused (not only editDraft)'
);
assert.ok(
  src.indexOf('data-soft-pad-finish-mode') >= 0 && src.indexOf('softPadImeFinishHtml') >= 0,
  'Soft Pad IME channel shows 说完后 finish modes'
);
assert.ok(src.indexOf('function applySoftPadFinishMode') >= 0, 'applySoftPadFinishMode present');
assert.ok(
  src.indexOf('data-soft-pad-enter-delay') >= 0 && src.indexOf('applySoftPadEnterDelay') >= 0,
  'confirm finish mode exposes send-wait chips'
);
assert.ok(
  /is-key-focused[\s\S]*soft-pad-flat-bind-dock|flat-bind-dock[\s\S]*is-key-focused/.test(src),
  'focused Soft Pad key hides flat-bind idle hint'
);
assert.ok(
  /renderLayoutVoiceChannelList[\s\S]*soft-pad-action-item__icon/.test(src) &&
    /renderLayoutCameraChannelList[\s\S]*soft-pad-action-item__icon/.test(src),
  'voice + camera channel rows paint icons'
);
assert.ok(
  /focusKeyId[\s\S]*markSoftPadPreviewFocus|opts\.focusKeyId/.test(src),
  'channel workbench restores Soft Pad key focus after remount'
);
assert.ok(
  /bindVoiceOralToPadKey[\s\S]*pickSlotOntoFocusedKey|bindVoiceOralToPadKey[\s\S]*ensureLayoutEditDraft/.test(
    src
  ) &&
    /bindCursorShortcutToPadKey[\s\S]*pickSlotOntoFocusedKey/.test(src),
  'voice + cursor catalog binds onto focused Soft Pad key'
);
assert.ok(
  /soft-pad-layout-cursor-row__icon[\s\S]*iconSvg\(iconId\)/.test(src) ||
    /iconIdForCapabilitySlot\(slotId\)[\s\S]*soft-pad-layout-cursor-row__icon/.test(src),
  '软件自带 cursor rows paint capability icons'
);
assert.ok(
  src.indexOf("kind !== 'bind' && kind !== 'custom' && kind !== 'acoustic'") >= 0,
  'oral rows not hard-disabled when Soft Pad slot resolves at click time'
);

console.log('soft-pad-catalog-bind-preview.test.js: ok');
