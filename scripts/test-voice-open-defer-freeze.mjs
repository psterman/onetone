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
const protocolServer = readFileSync(join(root, 'src-tauri/src/codex_micro_protocol_server.rs'), 'utf8');
const appIdentity = readFileSync(join(root, 'src-tauri/src/app_identity.rs'), 'utf8');

const voiceBranch = drawer.match(/\}else if\(panel==='voiceWake'\)\{[\s\S]*?\}else if\(panel==='camera'\)\{/);
assert.ok(voiceBranch, 'voiceWake panel branch present');
const body = voiceBranch[0];

assert.ok(!/\}else if\(panel==='voiceWake'\)\{[\s\S]{0,400}?hooks\(\)\.renderVoiceModeSwitch\(\)/.test(drawer),
  'renderVoiceModeSwitch must not run sync at start of voiceWake branch');
assert.ok(/requestAnimationFrame\(function\(\)\{[\s\S]*?renderVoiceModeSwitch\(\)/.test(body),
  'renderVoiceModeSwitch deferred inside rAF/setTimeout');
assert.ok(/armOpenClickGuard\(\d+\)/.test(body), 'voice open arms click guard');
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

// Native app-state polling must never hold cfg while synchronously inspecting HWNDs.
const appStateStart = protocolServer.indexOf('fn handle_app_state_get(');
const appStateEnd = protocolServer.indexOf('\nfn handle_app_state_post(', appStateStart);
assert.ok(appStateStart >= 0 && appStateEnd > appStateStart,
  'native app-state GET handler present');
const appStateGet = protocolServer.slice(appStateStart, appStateEnd);
assert.match(appStateGet, /let cfg = state\.cfg\.lock\(\)\.clone\(\);/,
  'app-state GET clones cfg before foreground/window inspection');
assert.ok(!/let cfg = state\.cfg\.lock\(\);/.test(appStateGet),
  'app-state GET does not retain a cfg guard');
assert.match(appStateGet, /active_ambient_for_soft_rgb\(&cfg\)/,
  'ambient lookup uses the unlocked config snapshot');

assert.match(appIdentity, /const WINDOW_TEXT_TIMEOUT_MS: u32 = 200;/,
  'window title lookup has a fixed 200ms budget');
assert.match(appIdentity, /SendMessageTimeoutW/,
  'window title lookup uses a bounded Windows message');
assert.match(appIdentity, /SMTO_ABORTIFHUNG \| SMTO_BLOCK/,
  'window title lookup aborts hung receivers without reentrant message processing');
assert.ok(!/use winapi::um::winuser::GetWindowTextW;/.test(appIdentity),
  'unbounded GetWindowTextW is not used by app identity');

console.log('ok voice-open-defer-freeze');
