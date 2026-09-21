/**
 * Soft Pad AG01 newThread must not dead-end on hold_required.
 * Symptom: key 7 (send) works, key 8 (Ctrl+N / new chat) never fires.
 * Run: node scripts/soft-pad-new-thread-hold.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var dispatch = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/runtime_dispatch.rs'),
  'utf8'
);
var beginner = fs.readFileSync(
  path.join(root, 'src-tauri/src/cursor_beginner.rs'),
  'utf8'
);

assert.ok(
  beginner.includes('NEW_THREAD_HOLD_MS'),
  'mini-bar / run_slot still documents newThread hold'
);

var gate = dispatch.indexOf('is_beginner_slot(&route.slot_id)');
assert.ok(gate >= 0, 'cursor beginner Soft Pad gate');
var chunk = dispatch.slice(gate, gate + 900);
assert.ok(
  !chunk.includes('hold_required'),
  'Soft Pad beginner fire must not dead-end newThread on hold_required'
);
assert.ok(
  chunk.includes('spawn_cursor_beginner_tap'),
  'Soft Pad beginner fire must spawn beginner tap with hold confirmed'
);
assert.ok(
  dispatch.includes(
    'fire_codex_micro_pad_key(state, window, &route.micro_key_id, key_down, false)'
  ),
  'physical numpad must share Soft Pad fire path (Cursor provider rejects newThread)'
);

var nt = beginner.indexOf('if def.slot_id == "newThread"');
assert.ok(nt >= 0, 'dedicated newThread branch');
var ntChunk = beginner.slice(nt, nt + 700);
assert.ok(
  ntChunk.includes('focus_composer_for_send'),
  'newThread must punch Agent composer before Ctrl+N (else New File)'
);
assert.ok(
  ntChunk.includes('SoftPadSendPassGuard'),
  'newThread must Soft Pad click-through like send'
);

console.log('soft-pad-new-thread-hold.test.js: ok');
