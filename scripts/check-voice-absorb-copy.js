/**
 * ponytail: one assert-based check that wake pool card + send mode cards stay wired.
 * Run: node scripts/check-voice-absorb-copy.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');
const bindings = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-ui-bindings.js'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(html.includes('id="voiceWakePrimaryFastBadge"'), 'hero fast badge missing');
assert(html.includes('voice-wake-pool-card'), 'pool card missing');
assert(html.includes('id="btnVoiceWakePoolAdd"'), 'pool add button missing');
assert(html.includes('id="voiceWakePhraseOverlay"'), 'phrase popover missing');
assert(!html.includes('id="btnVoiceSandboxOpen"'), 'sandbox open button should be removed');
assert(!html.includes('voice-sandbox.js'), 'sandbox script should not load');
assert(html.includes('voice-output-mode-cards'), 'send mode cards missing');
assert(html.includes('data-voice-output-mode="confirm"'), 'confirm mode card missing');
assert(html.includes('data-voice-output-mode="phrase"'), 'phrase mode card missing');
assert(html.includes('data-voice-output-mode="auto"'), 'auto mode card missing');
assert(i18n.includes("voiceSubtabWakeLbl:'怎么开启打字？'"), 'zh wake step copy missing');
assert(i18n.includes("voiceWakeHeroAction:"), 'hero action key missing');
assert(i18n.includes("voiceWakeSectionUnified:"), 'unified section key missing');
assert(i18n.includes("voiceOutputModeConfirmTag:"), 'send card tag key missing');
assert(bindings.includes('btnVoiceWakePoolAdd'), 'bindings open popover from pool add');
assert(bindings.includes('voiceWakePhraseOverlay'), 'bindings wire phrase popover');
assert(bindings.includes("mode:'voiceOpenApp'"), 'bindings wire voice open-app picker');
assert(html.includes('id="btnVoiceOpenAppAdd"'), 'open-app add button present');

console.log('ok: voice absorb copy/cards/pool popover wired');
