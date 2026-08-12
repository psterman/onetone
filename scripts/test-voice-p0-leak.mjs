/**
 * P0 voice page leak guards (tightened): no wake action bar / send leak;
 * send still three cards; active-hint host present.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const html = read('src/index.html');
const i18n = read('src/js/core/i18n.js');
const header = read('src/js/features/voice/voice-page-header-render.js');
const send = read('src/js/features/voice/voice-step-send-render.js');
const wake = read('src/js/features/voice/voice-step-wake-render.js');

assert.equal((html.match(/voiceWakeActionNoSend/g) || []).length, 0, 'no voiceWakeActionNoSend in index.html');
assert.equal((html.match(/voiceWakeActionBar/g) || []).length, 0, 'no voiceWakeActionBar in index.html');
assert.ok(!/voiceWakeAction(App|Dictate|NoSend|BarLbl)/.test(i18n), 'i18n dropped voiceWakeAction* keys');
assert.ok(!wake.includes('voiceWakeActionBar'), 'wake render does not reference action bar');
assert.ok(html.includes('id="voiceActiveHint"'), 'voiceActiveHint host present');
assert.ok(header.includes('voiceActiveHint') && header.includes('activeHintHidden'), 'chrome lights voiceActiveHint');
assert.ok(/data-voice-output-mode="confirm"/.test(html), 'send card confirm');
assert.ok(/data-voice-output-mode="phrase"/.test(html), 'send card phrase');
assert.ok(/data-voice-output-mode="auto"/.test(html), 'send card auto');
assert.ok(send.includes('confirm') && send.includes('phrase') && send.includes('auto'), 'send-render keeps three modes');

console.log('ok voice-p0-leak');
