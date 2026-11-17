/**
 * Boot settle+10s deferred voice remount must not thrash idle resourceSaver
 * (empty KWS → desired=none) — that path restarted mic + home live and 假死'd ~5s.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const session = readFileSync(join(root, 'src/js/core/app-session.js'), 'utf8');
const mic = readFileSync(join(root, 'src/js/core/app-mic.js'), 'utf8');

assert.match(session, /function resourceSaverStaysIdle/);
assert.match(session, /strategyEarly==='off'\|\|\(strategyEarly==='resourceSaver'&&resourceSaverStaysIdle/);
assert.match(session, /feWakeAlreadyMatchesStrategy/);
assert.match(session, /function voicePanelOpenBlocksDeferredBoot/);
assert.match(session, /p==='voiceWake'\|\|p==='voiceLab'/);

// noop / activateAsync:false must commit — else voiceWake open storms set_listening_strategy.
const committed = session.match(
  /function strategyActivateCommitted\(bundle\)\{[\s\S]*?\n  \}/
)?.[0] || '';
assert.match(committed, /bundle\.noop===true\|\|bundle\.activateAsync===false/);
assert.doesNotMatch(committed, /settingsPanel==='voiceWake'/);

const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
assert.match(
  drawer,
  /else if\(panel==='voiceWake'\)\{[\s\S]*?markVoiceEngineBootHandled/,
  'voiceWake open must cancel deferred boot before heavy paint'
);
assert.match(
  drawer,
  /else if\(panel==='voiceLab'\)\{[\s\S]*?markVoiceEngineBootHandled/,
  'voiceLab (product entry) open must cancel deferred boot before Lab paint'
);
assert.match(
  drawer,
  /settingsPanel!=='voiceWake'&&ui\.settingsPanel!=='voiceLab'/,
  'open must not stack voiceStatusPollTick on voiceLab first paint'
);

assert.match(mic, /Already on this device — stop\/start on every home paint used to 假死/);
assert.match(mic, /!opts\.force&&micMonitorDeviceId&&micMonitorDeviceId===want/);

const libRs = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
assert.match(
  libRs,
  /overlay_boot_hold_active\(\)[\s\S]{0,200}bootstrap_voice_engines/,
  'Vosk bootstrap waits for Soft Pad boot_hold before Model::new'
);
assert.match(
  libRs,
  /HCLr\.fst|Soft Pad first show/,
  'boot comment names Soft Pad vs Vosk disk storm'
);

const bootstrap = readFileSync(join(root, 'src-tauri/src/voice_bootstrap.rs'), 'utf8');
assert.match(
  bootstrap,
  /should_defer_vosk_cold_load/,
  'post-boot strategy/config must not cold-load Vosk before listen intent'
);
assert.match(
  bootstrap,
  /skip activate \(await listen\)/,
  'await-listen skip log for Soft Pad vs HCLr acceptance'
);

console.log('ok boot-voice-defer-freeze');
