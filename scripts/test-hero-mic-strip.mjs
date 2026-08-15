/**
 * Hero mic strip: status visual owns readiness (no device / auto-mute chips).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const micJs = readFileSync(join(root, 'src/js/core/app-mic.js'), 'utf8');
const wbJs = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(!/id="globalMicHub"/.test(html), 'sidebar globalMicHub removed');
assert.ok(!/globalMicHubToggle|globalMicHubPick|globalMicHubAutoMute/.test(html), 'sidebar mic action buttons removed');
assert.ok(/id="wbHeroMic"/.test(html), 'hero mic strip present');
assert.ok(/id="wbHeroMicToggle"[^>]*data-mic-ui-action="toggle"/.test(html), 'hero status toggles mute');
assert.ok(/id="wbHeroMicEngine"/.test(html) && /id="wbBtnListenToggle"/.test(html),
  'engine + listen live inside mic card');
assert.ok(!/id="wbHeroMicDevice"/.test(html), 'device pill removed — status visual owns readiness');
assert.ok(!/id="wbHeroMicAutoMute"/.test(html), 'auto-mute chip removed from home hero');
assert.ok(/function syncHeroMicCard/.test(wbJs), 'workbench syncs engine/listen into mic card');
assert.ok(/pill\.action==='listen-toggle'\) return/.test(wbJs) || /listen-toggle'\) return/.test(wbJs),
  'voice/keys pills skip listen — card owns it');
assert.ok(/function renderHeroMicStrip/.test(micJs), 'app-mic renders hero strip');
assert.ok(/\$\('wbHeroMic'\)/.test(micJs), 'app-mic targets wbHeroMic');
assert.ok(!/\$\('globalMicHub'\)/.test(micJs), 'app-mic no longer targets globalMicHub');
assert.ok(/e\.altKey\|\|e\.shiftKey/.test(micJs) && /openMicPicker\(\)/.test(micJs),
  'Alt/Shift on status opens mic picker');
assert.ok(/micUiStatusTip/.test(micJs) && /micUiStatusTip/.test(i18n), 'status tip mentions Alt to pick');
assert.ok(/\.wb-hero-mic\s*\{/.test(css), 'hero mic styles present');
assert.ok(/micUiTapToUnmute/.test(i18n), 'tap-to-unmute guide i18n present');

const autoMuteJs = readFileSync(join(root, 'src/js/features/camera/camera-auto-mute.js'), 'utf8');
assert.ok(/ensureAutoMuteCameraGate/.test(autoMuteJs), 'camera gate for auto-mute present');
assert.ok(/isCameraLiveForAutoMute/.test(autoMuteJs), 'live-camera check present');
assert.ok(/next&&!isCameraLiveForAutoMute/.test(autoMuteJs), 'enable toggle blocked without camera');
assert.ok(/\.wb-hero-mic\s*\{[\s\S]*?border-radius:\s*16px/.test(css), 'hero mic is one card surface');

console.log('ok: hero mic strip');
