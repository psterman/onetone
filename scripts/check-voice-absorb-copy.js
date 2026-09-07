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
assert(html.includes('voice-wake-pool-card') || html.includes('voice-phrase-hero') || html.includes('id="voiceWakeHeroCard"'), 'wake hero missing');
assert(html.includes('id="btnVoiceWakePoolAdd"') || html.includes('id="btnVoiceWakePhraseCap"'), 'pool add or phrase-cap');
assert(html.includes('id="voiceWakePhraseOverlay"'), 'phrase popover missing');
assert(!html.includes('id="btnVoiceSandboxOpen"'), 'sandbox open button should be removed');
assert(!html.includes('voice-sandbox.js'), 'sandbox script should not load');
assert(html.includes('voice-output-mode-cards') || html.includes('id="voiceFinishOutcomes"'), 'send mode cards or finish outcomes');
assert(html.includes('data-voice-output-mode="confirm"') || html.includes('data-voice-outcome="keep"'), 'confirm/keep mode');
assert(html.includes('data-voice-output-mode="phrase"') || html.includes('data-voice-outcome="send"'), 'phrase/send mode');
assert(html.includes('data-voice-output-mode="auto"') || html.includes('id="voiceFinishAutoToggle"'), 'auto mode');
assert(i18n.includes("voiceSubtabWakeLbl:'怎么开启打字？'"), 'zh wake step copy missing');
assert(i18n.includes("voiceWakeHeroAction:"), 'hero action key missing');
assert(i18n.includes("voiceWakeSectionUnified:"), 'unified section key missing');
assert(i18n.includes("voiceOutputModeConfirmTag:"), 'send card tag key missing');
assert(bindings.includes('btnVoiceWakePoolAdd'), 'bindings open popover from pool add');
assert(bindings.includes('voiceWakePhraseOverlay'), 'bindings wire phrase popover');
assert(bindings.includes('btnVoiceLandingKeysTarget') || bindings.includes("mode:'voiceOpenApp'"), 'bindings wire landing or legacy open-app');
assert(html.includes('id="voiceLandingStrip"') || html.includes('id="btnVoiceOpenAppAdd"'), 'landing strip or legacy open-app add');

console.log('ok: voice absorb copy/cards/pool popover wired');
