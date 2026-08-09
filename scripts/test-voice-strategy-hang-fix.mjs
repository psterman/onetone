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
assert.ok(/voiceWake idle: no status poll/.test(wake), 'voiceWake idle skips status poll');
assert.ok(/Idle voiceWake returns 0/.test(wake), 'voiceWake idle poll interval 0');
assert.ok(/skip end_status/.test(wake), 'voiceWake idle skips end_status');
assert.ok(!/const homeEnd=true/.test(wake), 'no always-on homeEnd');
assert.ok(/sessionActiveState\(endSnapWake/.test(wake), 'voiceWake dictating cadence separate from idle');
assert.ok(/do NOT force kws\.enabled/.test(wake), 'auto/resourceSaver does not force kws.enabled');
assert.ok(/skip idle backends/.test(wake), 'voiceWake skips idle status backends');
assert.ok(/strategySwitchLight/.test(wake), 'vosk noop strategy switch light path');
assert.ok(/Skip KWS status while supervisor is on Vosk/.test(wake), 'skip kws poll on vosk desired');
assert.ok(!/voiceStatusPollTick:enter/.test(wake), 'no poll-enter dbg IPC');

const prefs = read('src-tauri/src/ipc/commands/shell/prefs.rs');
assert.ok(/pub fn cmd_app_log\(state:/.test(prefs) && !/pub async fn cmd_app_log/.test(prefs),
  'cmd_app_log sync enqueue-only');
assert.ok(/Enqueue only — never await spawn_blocking/.test(prefs),
  'cmd_app_log must not await spawn_blocking');

const bootJs = read('src/js/core/app-boot.js');
assert.ok(/Console-only/.test(bootJs), 'agentDbg console-only');
assert.ok(/Push tag now/.test(bootJs), 'setTag pushes heartbeat immediately');

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
assert.ok(/hangLiveOpen=false/.test(diag), 'hang live panel collapsed by default');
assert.ok(/Mount collapsed only/.test(diag), 'startLiveHangDiag stays collapsed');

const cam = read('src/js/features/camera/camera-presence-actions.js');
assert.ok(/Cancel deferred boot camera/.test(cam), 'drawer pause cancels boot cam timer');
assert.ok(!/setTimeout\(bootCamDeferredTick,\s*8000\)/.test(cam), 'no 8s bootCam retry under drawer');
assert.ok(/drawer_ui_resume_boot/.test(cam), 'resume starts cancelled boot cam');

const persist = read('src/js/core/config-persist.js');
assert.ok(/cancelBootCameraSchedule/.test(persist), 'cancelBootCameraSchedule exported');
assert.ok(/bootCam defer skipped drawer/.test(persist), 'bootCam skips while drawer open');
assert.ok(/camDelay=15000/.test(persist), 'boot cam cold delay 15s');

const drawer = read('src/js/features/settings/settings-drawer.js');
assert.ok(/liveOnly:true\}\);/.test(drawer) && /liveOnly on enter/.test(drawer),
  'voiceWake enter status liveOnly');
assert.ok(/Acoustic islands: push further/.test(drawer), 'acoustic islands deferred off open');

console.log('ok voice-strategy-hang-fix');
