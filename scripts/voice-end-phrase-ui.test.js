'use strict';

/**
 * End-step cancel/end phrase UI must stay in legacy step 02 (not hidden by P6 island guard).
 * Run: node scripts/voice-end-phrase-ui.test.js
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var recognizeSrc = read('src/js/features/voice/voice-step-recognize-render.js');
var islandSrc = read('src-islands/islands/voice-config-island.tsx');
var indexHtml = read('src/index.html');

assert.ok(
  recognizeSrc.indexOf('voiceCancelKindTextPane') < 0 ||
  !/voiceCancelKindTextPane[\s\S]{0,80}\.hidden\s*=\s*true/.test(recognizeSrc),
  'recognize render must not P6-hide legacy cancel/end text panes'
);
assert.ok(
  recognizeSrc.indexOf('renderEndPhraseTags') >= 0,
  'renderRecognizePage should refresh end phrase tags'
);
assert.ok(
  recognizeSrc.indexOf('renderCancelPhraseTags') >= 0,
  'renderRecognizePage should refresh cancel phrase tags'
);

assert.ok(islandSrc.indexOf('PhraseManager') < 0, 'voice config island is strategy-only');
assert.ok(islandSrc.indexOf('getCancelPhraseList') < 0, 'island must not edit cancel phrases');
assert.ok(islandSrc.indexOf('StrategySelector') >= 0, 'island keeps strategy selector');

assert.ok(indexHtml.indexOf('id="voiceCancelPhraseTags"') >= 0, 'cancel phrase tags in HTML');
assert.ok(indexHtml.indexOf('id="voiceEndPhraseTags"') >= 0, 'end phrase tags in HTML');
assert.ok(indexHtml.indexOf('id="voiceEndCustomInput"') >= 0, 'end custom input in HTML');
assert.ok(indexHtml.indexOf('voice-end-alias-card') >= 0, 'end step uses alias-card layout');
assert.ok(indexHtml.indexOf('voice-wake-alias-list') >= 0 && indexHtml.indexOf('voiceEndPhraseTags') >= 0, 'end phrase tags use alias list');

console.log('voice-end-phrase-ui.test.js: ok');
