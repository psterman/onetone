/**
 * Soft Pad must not invent Codex / key 7 when the user already has Cursor + a focused key.
 * Run: node scripts/soft-pad-scope-focus-default.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var hub = fs.readFileSync(
  path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'),
  'utf8'
);
var pad = fs.readFileSync(
  path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);

assert.ok(hub.includes('scopePickedByUser'), 'track whether Hub scope was user-picked');
assert.ok(
  /function resolveSoftPadEntry[\s\S]*!scopePickedByUser[\s\S]*getFreshForegroundAppId/.test(hub),
  'resolveSoftPadEntry prefers live FG when scope was not user-picked'
);
assert.ok(
  /function pickHubDefaultScopeId[\s\S]*getFreshForegroundAppId[\s\S]*padEnabled/.test(hub),
  'Hub default scope prefers FG over hard-coded Codex'
);
assert.ok(
  /function selectScope[\s\S]*scopePickedByUser = true/.test(hub),
  'selectScope marks scope as user-picked'
);

assert.ok(
  /function ensureLayoutEditDraft[\s\S]*Do not fall back to AG00/.test(pad),
  'catalog bind must refuse when no Soft Pad key is focused'
);
assert.ok(
  !/function ensureLayoutEditDraft[\s\S]{0,500}pickDefaultLayoutKey/.test(pad),
  'ensureLayoutEditDraft must not snap to 数字 7 via pickDefaultLayoutKey'
);
assert.ok(
  /function closeEditKeycap[\s\S]*mode === 'inline' && m && keyId/.test(pad),
  'closing inline editor must not reopen AG00'
);

assert.ok(
  /function softPadPreviewEditKey[\s\S]*onLayout[\s\S]*isLandLocked[\s\S]*if \(onLayout\)/.test(pad),
  'key tap on layout must open editor even during land lock (no empty mid/right)'
);

assert.ok(
  /getSelectedScopeId:\s*function\s*\(\)\s*\{[\s\S]*resolveSoftPadEntry/.test(hub),
  'getSelectedScopeId must follow live Soft Pad entry (not sticky module default Codex)'
);
assert.ok(
  /function adoptSoftPadSelection[\s\S]*HabitChannelEditBanner[\s\S]*renderAll/.test(hub),
  'adopting Soft Pad entry must refresh 正在编辑 chrome'
);

console.log('soft-pad-scope-focus-default.test.js: ok');
