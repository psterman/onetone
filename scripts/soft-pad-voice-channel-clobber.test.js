/**
 * Soft Pad 口头指令 must not be wiped when openEditKeycap reveals softPad commons.
 * Run: node scripts/soft-pad-voice-channel-clobber.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);

var reveal = src.split('function revealCommonsLayoutForKey(m)')[1];
assert.ok(reveal, 'revealCommonsLayoutForKey present');
reveal = reveal.split('function filteredBrowseRows')[0];

assert.ok(
  /softPadFnMode\s*===\s*['"]channel['"]/.test(reveal),
  'skip commons reveal while left rail shows a Keys channel (口头指令/…)'
);
assert.ok(
  /return;/.test(reveal),
  'early-return so catalogVoicePromptsForMapping rows stay painted'
);

assert.ok(
  src.indexOf('catalogVoicePromptsForMapping') >= 0,
  'voice channel still loads voice-settings prompt peers'
);

console.log('soft-pad-voice-channel-clobber.test.js: ok');
