/**
 * Wake page IA: three peer tabs (text/sound/app), legacy owns text phrases,
 * no dictation-fill / preset pool, syncPhraseKindTabs whitelist, no P6 TextPane hide.
 * Run: node scripts/test-voice-wake-ia.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('src/index.html');
assert.ok(!html.includes('btnVoiceWakeCustomListen'), 'no btnVoiceWakeCustomListen');
assert.ok(/data-phrase-kind="app"/.test(html), 'has data-phrase-kind=app');
assert.ok(/data-phrase-kind-pane="app"/.test(html), 'has data-phrase-kind-pane=app');
assert.ok(!html.includes('voiceWakePhraseSuggestions'), 'no voiceWakePhraseSuggestions');
assert.ok(!html.includes('voiceWakePresetSection'), 'no voiceWakePresetSection');
assert.ok(html.includes('voiceWakeKindAppPane'), 'has voiceWakeKindAppPane');
assert.ok(
  /voiceWakeKindAppPane[\s\S]*?voiceOutputSummonBlock/.test(html),
  'summon lives inside app pane'
);

const wake = read('src/js/features/voice/voice-wake.js');
assert.ok(
  !/renderPhraseTags\(\s*['"]voiceWakePhraseSuggestions['"]/.test(wake),
  'voice-wake does not render suggestions'
);

const bindings = read('src/js/features/voice/voice-ui-bindings.js');
assert.ok(
  !/bindPhraseTags\(\s*['"]voiceWakePhraseSuggestions['"]/.test(bindings),
  'bindings do not bind suggestions'
);
assert.ok(
  !/bindPhraseListen\(\s*['"]btnVoiceWakeCustomListen['"]/.test(bindings),
  'bindings do not bind wake listen'
);

const send = read('src/js/features/voice/voice-step-send-render.js');
assert.ok(
  !/kind\s*=\s*kind\s*===\s*['"]sound['"]\s*\?\s*['"]sound['"]\s*:\s*['"]text['"]/.test(send),
  'syncPhraseKindTabs is not binary sound/text coerce'
);
assert.ok(
  /function syncPhraseKindTabs[\s\S]*?allowed\[/.test(send),
  'syncPhraseKindTabs uses tablist whitelist'
);

const wakeRender = read('src/js/features/voice/voice-step-wake-render.js');
assert.ok(
  !/isMounted\(\s*['"]voiceConfig['"]\s*\)[\s\S]{0,200}voiceWakeKindTextPane/.test(wakeRender),
  'no P6 hide of voiceWakeKindTextPane when island mounted'
);

const island = read('src-islands/islands/voice-config-island.tsx');
assert.ok(!/TabsTrigger\s+value=["']wake["']/.test(island), 'island has no wake TabsTrigger');
assert.ok(
  !/TabsContent\s+value=["']wake["']/.test(island),
  'island has no wake TabsContent'
);
assert.ok(!/getWakePhrases/.test(island), 'island does not use wake PhraseManager path');

console.log('PASS voice-wake-ia');
