/**
 * Soft Pad 开启口令 click must bind pushToTalk + phrase onto the focused Soft Pad key.
 * Run: node scripts/soft-pad-voice-wake-bind.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);

assert.ok(src.indexOf('function bindVoiceOralToPadKey') >= 0, 'bindVoiceOralToPadKey present');
assert.ok(src.indexOf('data-layout-voice-oral') >= 0, 'oral click attr present');
assert.ok(
  /editDraft\.phrases\s*=\s*say/.test(src),
  'wake phrase written onto Soft Pad key draft'
);
assert.ok(
  /applyLayoutKeyBindings\s*\(\s*m\s*,\s*slotId\s*,\s*editDraft\s*\)/.test(src),
  'voice binding persisted via applyLayoutKeyBindings'
);
assert.ok(
  /findMicroKeyForSlot\s*\(\s*m\s*,\s*slotId\s*\)[\s\S]*upsertRoute\s*\(\s*m\s*,\s*pad\s*,\s*prevKey/.test(
    src
  ),
  'unbind previous Soft Pad key before binding oral onto focused key'
);
assert.ok(
  /id === 'pushToTalk'[\s\S]*triggerBinding[\s\S]*chord = '「' \+ say/.test(src) ||
    /pushToTalk[\s\S]*voiceB[\s\S]*say[\s\S]*chord = '「'/.test(src),
  'Soft Pad caption shows wake phrase on pushToTalk'
);
assert.ok(
  src.indexOf("channel: 'voice'") >= 0 && src.indexOf("kind: ch === 'voice' ? 'bind' : 'action'") >= 0,
  'voice channel stamps Soft Pad scene hero'
);

console.log('soft-pad-voice-wake-bind.test.js: ok');
