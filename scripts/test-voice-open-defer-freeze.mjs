/**
 * Voice settings open must defer heavy paint (mode switch + flow + islands)
 * and arm an open-click guard — sync renderVoiceModeSwitch on open 假死'd WebView2.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const banner = readFileSync(join(root, 'src/js/features/mapping/habit-scenario-context-banner.js'), 'utf8');
const wake = readFileSync(join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
const island = readFileSync(join(root, 'src-islands/islands/voice-config-island.tsx'), 'utf8');

const voiceBranch = drawer.match(/\}else if\(panel==='voiceWake'\)\{[\s\S]*?\}else if\(panel==='camera'\)\{/);
assert.ok(voiceBranch, 'voiceWake panel branch present');
const body = voiceBranch[0];

assert.ok(!/\}else if\(panel==='voiceWake'\)\{[\s\S]{0,400}?hooks\(\)\.renderVoiceModeSwitch\(\)/.test(drawer),
  'renderVoiceModeSwitch must not run sync at start of voiceWake branch');
assert.ok(/requestAnimationFrame\(function\(\)\{[\s\S]*?renderVoiceModeSwitch\(\)/.test(body),
  'renderVoiceModeSwitch deferred inside rAF/setTimeout');
assert.ok(/armOpenClickGuard\(450\)/.test(body), 'voice open arms click guard');
assert.ok(/voiceDeferHeavy/.test(body) && /voiceAfterHeavy/.test(body),
  'voiceWake supports deferHeavy/afterHeavy');

assert.ok(/deferHeavy:\s*true[\s\S]{0,80}?afterHeavy:\s*finishHeavy/.test(banner) ||
  /afterHeavy:\s*finishHeavy[\s\S]{0,80}?deferHeavy:\s*true/.test(banner),
  'openScenarioVoiceEdit uses deferHeavy like keys');
assert.ok(!/ensureDrawerPanel\('voiceWake'\);\s*requestAnimationFrame\(function\(\)\{\s*setTimeout\(finishHeavy/.test(banner),
  'openScenarioVoiceEdit no longer double-schedules finishHeavy outside deferHeavy');

assert.ok(/function armOpenClickGuard\(/.test(wake), 'armOpenClickGuard defined');
assert.ok(/function isOpenClickGuarded\(/.test(wake), 'isOpenClickGuarded defined');
assert.ok(/isOpenClickGuarded\(\)&&opts\.toastKind==='lite'/.test(wake),
  'switchListeningStrategy respects open guard for lite toasts');
assert.ok(/armOpenClickGuard:armOpenClickGuard/.test(wake), 'armOpenClickGuard exported');

assert.ok(/isOpenClickGuarded\?\.\(\)/.test(island), 'voice-config island checks open guard');

// Strip render for voice moved off the sync shared block.
assert.ok(/panel==='keys'\|\|panel==='camera'\|\|panel==='softPad'/.test(drawer),
  'HabitChannelStatusStrip sync block skips voiceWake');

console.log('ok voice-open-defer-freeze');
