/**
 * Hero mic strip replaced sidebar global-mic-hub (mute / pick / automute).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const micJs = readFileSync(join(root, 'src/js/core/app-mic.js'), 'utf8');
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(!/id="globalMicHub"/.test(html), 'sidebar globalMicHub removed');
assert.ok(!/globalMicHubToggle|globalMicHubPick|globalMicHubAutoMute/.test(html), 'sidebar mic action buttons removed');
assert.ok(/id="wbHeroMic"/.test(html), 'hero mic strip present');
assert.ok(/id="wbHeroMicToggle"[^>]*data-mic-ui-action="toggle"/.test(html), 'hero status toggles mute');
assert.ok(/id="wbHeroMicDevice"[^>]*data-mic-ui-action="pick"/.test(html), 'device chip opens picker');
assert.ok(/id="wbHeroMicAutoMute"[^>]*data-mic-ui-action="automute"/.test(html), 'auto-mute chip present');
assert.ok(/function renderHeroMicStrip/.test(micJs), 'app-mic renders hero strip');
assert.ok(/\$\('wbHeroMic'\)/.test(micJs), 'app-mic targets wbHeroMic');
assert.ok(!/\$\('globalMicHub'\)/.test(micJs), 'app-mic no longer targets globalMicHub');
assert.ok(/\.wb-hero-mic\s*\{/.test(css), 'hero mic styles present');
assert.ok(/micUiTapToUnmute/.test(i18n), 'tap-to-unmute guide i18n present');

const autoMuteJs = readFileSync(join(root, 'src/js/features/camera/camera-auto-mute.js'), 'utf8');
assert.ok(/ensureAutoMuteCameraGate/.test(autoMuteJs), 'camera gate for auto-mute present');
assert.ok(/isCameraLiveForAutoMute/.test(autoMuteJs), 'live-camera check present');
assert.ok(/next&&!isCameraLiveForAutoMute/.test(autoMuteJs), 'enable toggle blocked without camera');
assert.ok(/toggleAutoMuteFromHero/.test(micJs), 'home auto-mute toggles in place');
assert.ok(/micUiAutoMuteTip/.test(i18n), 'auto-mute tip i18n present');
assert.ok(/\.wb-hero-mic\s*\{[\s\S]*?border-radius:\s*16px/.test(css), 'hero mic is one card surface');

console.log('ok: hero mic strip');
