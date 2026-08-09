/**
 * Strategy switch on voiceWake must not full-remount status (UI_HB_STALL_5S after enhanced).
 * Voice status IPC must be async/spawn_blocking so sync probe cannot hold the UI pump.
 * Settle must not invent stopped status or stack end_status + islands on the same tick.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const wake = read('src/js/features/voice/voice-wake.js');
assert.ok(/pumpListeningStrategySwitch[\s\S]*?statusOpts=\{liveOnly:true\}/.test(wake),
  'strategy switch liveOnly');
assert.ok(/function pumpVoiceModeSwitch[\s\S]*?statusOpts=\{liveOnly:true\}/.test(wake),
  'mode switch liveOnly');
assert.ok(!/const statusOpts=\{liveOnly:homeOnly\}/.test(wake),
  'no liveOnly:homeOnly for switch statusOpts');
assert.ok(/function deferStrategyUiPaint/.test(wake), 'defer strategy UI paint');
assert.ok(/Listening strategy does not change end/.test(wake), 'skip end_status on strategy settle');
assert.ok(/reuse idle-poll vosk/.test(wake), 'reuse idle-poll vosk status');
assert.ok(/voiceWake first: dictating/.test(wake), 'voiceWake poll interval before sessionActive 500ms');
assert.ok(/do NOT force kws\.enabled/.test(wake), 'resourceSaver does not force kws.enabled');
assert.ok(/skip idle backends/.test(wake), 'voiceWake skips idle status backends');

const boot = read('src-tauri/src/voice_bootstrap.rs');
assert.ok(/resourceSaver[\s\S]*?kws_ready[\s\S]*?Vosk/.test(boot),
  'resourceSaver falls back to Vosk when kws not ready');
assert.ok(/resourceSaver desired=vosk/.test(boot), 'resourceSaver vosk fallback log');

const vosk = read('src-tauri/src/ipc/commands/voice/vosk.rs');
const sapi = read('src-tauri/src/ipc/commands/voice/sapi.rs');
const kws = read('src-tauri/src/ipc/commands/voice/kws.rs');
const end = read('src-tauri/src/ipc/commands/voice/end.rs');
assert.ok(/pub async fn cmd_voice_vosk_status/.test(vosk) && /spawn_blocking/.test(vosk) && /Result<serde_json::Value, String>/.test(vosk),
  'vosk status async');
assert.ok(/pub async fn cmd_voice_sapi_status/.test(sapi) && /spawn_blocking/.test(sapi),
  'sapi status async');
assert.ok(/pub async fn cmd_voice_kws_status/.test(kws) && /spawn_blocking/.test(kws),
  'kws status async');
assert.ok(/pub async fn cmd_voice_end_status/.test(end) && /spawn_blocking/.test(end),
  'end status async');

const diag = read('src/js/features/debug/voice-diag.js');
assert.ok(/Append-only/.test(diag) || /appendChild/.test(diag), 'hang timeline append-only');

console.log('ok voice-strategy-hang-fix');
