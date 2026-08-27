/**
 * Soft Pad uncommon voice pending: closed-set instant vs defer + overlay confirm bar.
 * Run: node scripts/soft-pad-voice-pending.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var pendingRs = fs.readFileSync(
  path.join(root, 'src-tauri/src/soft_pad_voice_pending.rs'),
  'utf8'
);
var overlayHtml = fs.readFileSync(
  path.join(root, 'src/codex-micro-overlay.html'),
  'utf8'
);
var overlayCss = fs.readFileSync(
  path.join(root, 'src/css/codex-micro-overlay.css'),
  'utf8'
);
var voiceRs = fs.readFileSync(
  path.join(root, 'src-tauri/src/voice_end_runtime.rs'),
  'utf8'
);
var beginnerRs = fs.readFileSync(
  path.join(root, 'src-tauri/src/cursor_beginner.rs'),
  'utf8'
);

assert.ok(pendingRs.includes('CONFIRM_MS: u64 = 3000'), '3s confirm budget');
assert.ok(pendingRs.includes('fn is_instant_voice_slot'), 'instant whitelist');
assert.ok(pendingRs.includes('fn should_defer_voice'), 'defer helper');

var instant = [
  'pushToTalk',
  'stopOrSend',
  'continue',
  'newThread',
  'cancel',
  'cancelListen'
];
instant.forEach(function (id) {
  assert.ok(
    pendingRs.includes('"' + id + '"'),
    'instant whitelist includes ' + id
  );
});

assert.ok(
  pendingRs.includes('assert!(!should_defer_voice("newThread"'),
  'test: closed-set does not defer'
);
assert.ok(
  pendingRs.includes('assert!(should_defer_voice("plan"'),
  'test: uncommon defers'
);
assert.ok(
  pendingRs.includes('assert!(should_defer_voice("pasteAndSend"'),
  'test: pasteAndSend defers on voice'
);

assert.ok(
  voiceRs.includes('soft_pad_voice_pending::should_defer_voice'),
  'voice path defers uncommon Soft Pad'
);
assert.ok(
  voiceRs.includes('soft_pad_voice_pending::insert_pending'),
  'voice path inserts pending'
);
assert.ok(
  beginnerRs.includes('soft_pad_voice_pending::cancel_pending'),
  'cancel clears pending'
);
assert.ok(
  beginnerRs.includes('soft_pad_voice_pending::confirm_and_run'),
  'send confirms pending'
);

assert.ok(
  overlayHtml.includes('data-soft-pad-confirm'),
  'overlay confirm bar markup'
);
assert.ok(
  overlayHtml.includes('applySoftPadConfirmBar'),
  'overlay applies confirm bar'
);
assert.ok(
  overlayHtml.includes('即将：') && overlayHtml.includes('说取消可中止'),
  'confirm copy matches plan'
);
assert.ok(
  overlayCss.includes('.soft-pad-confirm-bar'),
  'confirm bar styles'
);

console.log('soft-pad-voice-pending.test.js: ok');
