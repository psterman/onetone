/**
 * ponytail: one assert-based check that sandbox + send card selectors stay wired.
 * Run: node scripts/check-voice-absorb-copy.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');
const sandbox = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-sandbox.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(html.includes('id="voiceWakePrimaryFastBadge"'), 'hero fast badge missing');
assert(html.includes('id="btnVoiceSandboxOpen"'), 'sandbox open button missing');
assert(html.includes('id="voiceSandboxOverlay"'), 'sandbox overlay missing');
assert(html.includes('voice-output-mode-cards'), 'send mode cards missing');
assert(html.includes('data-voice-output-mode="confirm"'), 'confirm mode card missing');
assert(html.includes('data-voice-output-mode="phrase"'), 'phrase mode card missing');
assert(html.includes('data-voice-output-mode="auto"'), 'auto mode card missing');
assert(html.includes('voice-sandbox.js'), 'sandbox script not loaded');
assert(i18n.includes("voiceSubtabWakeLbl:'怎么开启打字？'"), 'zh wake step copy missing');
assert(i18n.includes("voiceWakeHeroNarrative:"), 'hero narrative key missing');
assert(i18n.includes("voiceOutputModeConfirmTag:"), 'send card tag key missing');
assert(sandbox.includes('testVoskSend'), 'sandbox must reuse existing simulate');
assert(sandbox.includes('OneToneVoiceSandbox'), 'sandbox export missing');

console.log('ok: voice absorb copy/cards/sandbox wired');
