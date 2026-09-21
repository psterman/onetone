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
  /bindVoiceOralToPadKey[\s\S]*ensureLayoutEditDraft/.test(src) &&
    /bindCursorShortcutToPadKey[\s\S]*ensureLayoutEditDraft/.test(src),
  'voice + cursor catalog binds ensure Soft Pad edit draft'
);
assert.ok(
  src.indexOf("kind !== 'bind' && kind !== 'custom' && kind !== 'acoustic'") >= 0,
  'oral rows not hard-disabled when Soft Pad slot resolves at click time'
);

console.log('soft-pad-catalog-bind-preview.test.js: ok');
