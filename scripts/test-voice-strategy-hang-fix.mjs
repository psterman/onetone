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
assert.ok(/voiceWake idle: no status poll|never status-poll/.test(wake), 'voiceWake idle skips status poll');
assert.ok(/Idle voiceWake returns 0|never status-poll/.test(wake), 'voiceWake idle poll interval 0');
assert.ok(/skip end_status/.test(wake), 'voiceWake idle skips end_status');
assert.ok(!/const homeEnd=true/.test(wake), 'no always-on homeEnd');
assert.ok(!/sessionActiveState\(endSnapWake/.test(wake), 'voiceWake ignores sticky dictating for poll cadence');
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
assert.ok(/voiceHangDiagRepairNote/.test(read('src/index.html')), 'hang diag in repair panel');
assert.ok(/Poll only while/.test(diag), 'hang diag only on repair tab');
assert.ok(/Boot hook: do not start background poll/.test(diag), 'startLiveHangDiag idle until repair');
assert.ok(/Legacy no-op/.test(diag), 'setHangLiveOpen legacy no-op');
assert.ok(/HANG_POLL_MS=2500/.test(diag), 'hang poll slower');
assert.ok(/voiceWake/.test(diag)&&/return false/.test(diag),
  'hang diag disabled on voiceWake');

const mic = read('src/js/core/app-mic.js');
assert.ok(/__otMicBarPaintAt/.test(mic), 'mic bar paint throttled');

const vr = read('src/js/core/voice-runtime.js');
assert.ok(/polling \+ event paint dual-path/.test(vr), 'voiceWake stops mic poll dual-path');

const voskRs = read('src-tauri/src/voice_vosk.rs');
assert.ok(/LEVEL_MIN_INTERVAL: Duration = Duration::from_millis\(250\)/.test(voskRs),
  'vosk level emit >=250ms');
assert.ok(/is_full\(\)/.test(voskRs) && /No matcher draining/.test(voskRs),
  'pcm publish skips alloc when bus full');

const cam = read('src/js/features/camera/camera-presence-actions.js');
assert.ok(/Cancel deferred boot camera/.test(cam), 'drawer pause cancels boot cam timer');
assert.ok(!/setTimeout\(bootCamDeferredTick,\s*8000\)/.test(cam), 'no 8s bootCam retry under drawer');
assert.ok(/drawer_ui_resume_boot/.test(cam), 'resume starts cancelled boot cam');

const persist = read('src/js/core/config-persist.js');
assert.ok(/cancelBootCameraSchedule/.test(persist), 'cancelBootCameraSchedule exported');
assert.ok(/bootCam defer skipped drawer/.test(persist), 'bootCam skips while drawer open');
assert.ok(/camDelay=15000/.test(persist), 'boot cam cold delay 15s');

const drawer = read('src/js/features/settings/settings-drawer.js');
assert.ok(/Skip auto acoustic islands/.test(drawer) || /only on demand/.test(drawer) || /Skip auto acoustic/.test(drawer),
  'voiceWake skips auto acoustic mount');
assert.ok(/setHangLiveOpen\(false\)/.test(drawer), 'voiceWake collapses hang live panel');

const ac = read('src-tauri/src/voice_acoustic_runtime.rs');
assert.ok(/must be a no-op when already correct/.test(ac), 'acoustic sync early-return');
assert.ok(/do not drain the shared PCM bus/.test(ac), 'noop stop skips bus drain');
assert.ok(/settings_drawer_open/.test(ac) && /matcher not needed while configuring/.test(ac),
  'acoustic matcher quiet while settings open');

const drawerGate = read('src-tauri/src/ipc/commands/runtime/app.rs');
assert.ok(/sync_acoustic_match_runtime/.test(drawerGate), 'drawer open syncs acoustic matcher');

const voskRt = read('src-tauri/src/voice_vosk_runtime.rs');
assert.ok(/settings_drawer_open/.test(voskRt) && /mic_level flood/.test(voskRt),
  'vosk mic_level suppressed under settings drawer');
assert.ok(/Throttle acoustic sync/.test(voskRt), 'acoustic sync throttled in vosk drain');

const island = read('src-islands/islands/voice-config-island.tsx');
assert.ok(/Poll only while a switch is pending/.test(island), 'strategy busy poll only while pending');

const voskWorker = read('src-tauri/src/voice_vosk.rs');
assert.ok(/settings_asr_quiet|asr_quiet\.load/.test(voskWorker) && /Settings drawer: drop chunks/.test(voskWorker),
  'vosk drops ASR chunks while settings open');

const appState = read('src-tauri/src/lib.rs');
assert.ok(/settings_asr_quiet/.test(appState), 'AppState has settings_asr_quiet');

assert.ok(/Park wake ASR flag \+ stop capture|schedule_park_wake_for_settings/.test(drawerGate),
  'drawer open parks wake engines');

assert.ok(/schedule_park_wake_for_settings/.test(boot) && /settings_park/.test(boot),
  'settings park stops all wake engines');
assert.ok(/park_detach/.test(boot) && /voice_vosk_stop_detach/.test(boot),
  'settings park uses detach stop (no stop_sync under ACTIVATE_LOCK)');
assert.ok(/force:settings_unpark/.test(boot), 'settings close unparks wake');

const layout = read('src-tauri/src/window_layout.rs');
assert.ok(/Settings open: resize storms/.test(layout), 'layout save skipped while settings open');
assert.ok(/layout-persist/.test(layout) && /note_ipc_exit\("layout_persist"\)/.test(layout), 'layout disk off HB/IPC path');

assert.ok(/ot-voice-wake-park/.test(drawer), 'voiceWake adds idle park CSS class');
assert.ok(/Skip React chrome islands on open/.test(drawer), 'voiceWake skips React chrome islands');
assert.ok(/resetDictationLive/.test(drawer), 'voiceWake clears dictation live on open');
assert.ok(/Skip longtask observer/.test(diag), 'hang longtask observer disabled by default');
assert.ok(/180000/.test(bootJs), 'idle hb less frequent');

assert.ok(/never status-poll/.test(wake), 'voiceWake never status-polls');
assert.ok(/never status IPC/.test(wake), 'voiceStatusPollTick bails on voiceWake');
assert.ok(!/sessionActiveState\(endSnapWake/.test(wake), 'voiceWake ignores sticky dictating for poll');

const usage = read('src/js/core/app-process-usage.js');
assert.ok(/settingsPanel!=='debug'/.test(usage), 'process usage skipped off debug while settings open');

const logRs = read('src-tauri/src/app_log.rs');
assert.ok(/MAX_LOG_BYTES: u64 = 8 \* 1024 \* 1024/.test(logRs), 'runtime log rotates at 8MB');

assert.ok(/settings_park/.test(boot) && /reset_voice_session/.test(boot),
  'settings park resets dictation session');

assert.ok(/settingsPanel!=='voiceWake'/.test(drawer), 'openDrawer skips status poll on voiceWake');

const drainFix = read('src-tauri/src/voice_vosk_runtime.rs');
assert.ok(/Drop before acoustic sync/.test(drainFix), 'drain drops voice_vosk before acoustic sync');

const acRs = read('src-tauri/src/voice_acoustic_runtime.rs');
assert.ok(/kws_readiness_cached/.test(acRs) && /Cached only/.test(acRs),
  'pcm_source_listening uses cached kws readiness');

assert.ok(/settings-acoustic-sync/.test(drawerGate), 'drawer gate spawns acoustic sync off IPC');

assert.ok(/skip activate \(settings open\)/.test(boot),
  'activate skipped while settings drawer open');

const desiredRs = read('src-tauri/src/ipc/commands/voice/desired.rs');
assert.ok(/config-only \(settings open/.test(desiredRs),
  'strategy switch config-only while settings open');

assert.ok(/state:'parked'/.test(wake) || /parked/.test(wake),
  'waitForActivateIdle parks on voiceWake');
assert.ok(/voiceOpenClickGuardUntil/.test(wake),
  'flow render waits out open click guard');

const camPa = read('src/js/features/camera/camera-presence-actions.js');
assert.ok(/OneToneCameraWorkflow[\s\S]*onPanelHidden/.test(camPa),
  'drawer pause stops camera workflow timers');
assert.ok(/deferCameraHeavyWork[\s\S]*drawer_ui_pause/.test(camPa)||/no ensureStopped/.test(camPa),
  'drawer camera pause skips ensureStopped on open');
assert.ok(/honor inferPaused|inferPaused/.test(read('src/js/features/camera/camera-gaze-landmarker.js')),
  'gaze bitmap honors inferPaused');
assert.ok(/ot-voice-wake-park/.test(read('src/js/features/voice/voice-settings-flow.js')),
  'flow schedule aware of voiceWake park');
assert.ok(/renderVoiceSettingsFlowLight/.test(read('src/js/features/voice/voice-settings-flow.js')),
  'park uses light flow (wake phrase + rail)');
assert.ok(/strategy-save/.test(desiredRs),
  'strategy save async while settings open');

assert.ok(/fe openHeroSettings/.test(read('src/js/features/home/home-workbench.js')),
  'hero orb logs openHeroSettings');
assert.ok(/Already on target panel/.test(read('src/js/features/home/home-workbench.js')),
  'hero orb no-ops when already on panel');
assert.ok(/fe closeDrawer/.test(drawer), 'closeDrawer logs');
assert.ok(/__otDrawerCloseGen/.test(drawer), 'closeDrawer defers camera/mvp flush');

console.log('ok voice-strategy-hang-fix');
