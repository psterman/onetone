// Typed IPC layer for OneTone React islands.
//
// Design rules (see docs/migration-react-islands.md P2):
//  - No raw `invoke('cmd_x', {...})` string commands inside React components.
//    Import the typed functions from this module instead.
//  - We reuse the legacy `window.OneToneIpc.invoke` when present so we inherit its
//    camelCase <-> snake_case dual-key compatibility (src/js/core/ipc.js:tauriArgs).
//    Fallback: raw Tauri invoke (Tauri v2 converts camelCase args to snake_case).
//  - snake/camel compatibility is preserved at the boundary; island code uses
//    camelCase only.
//  - Return shapes marked [BEST-EFFORT]/[UNVERIFIED] in types.ts are loose on
//    purpose; tighten them once the Rust side is confirmed.

import type {
  MicMuteState,
  MicDeviceInfo,
  MicLevelSnapshot,
  AppIdentity,
  ConflictReport,
  CmdAck,
  RuntimeSnapshot,
  AppConfigPatch,
  VoiceEngineStatus,
  DesiredEngineBundle,
  TriggerProbeResult,
} from './types';

type IpcArgs = Record<string, unknown> | undefined;

interface LegacyIpc {
  invoke(cmd: string, args?: IpcArgs): Promise<unknown>;
}

function getLegacyIpc(): LegacyIpc | null {
  const w = window as unknown as { OneToneIpc?: LegacyIpc };
  if (w.OneToneIpc && typeof w.OneToneIpc.invoke === 'function') return w.OneToneIpc;
  return null;
}

async function rawTauriInvoke(cmd: string, args?: IpcArgs): Promise<unknown> {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: (c: string, a?: IpcArgs) => Promise<unknown> } };
  const internals = w.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function') return internals.invoke(cmd, args);
  throw new Error('tauri invoke unavailable');
}

/**
 * Core typed invoke. Reuses legacy `OneToneIpc.invoke` (dual-key compat) when
 * present, otherwise falls back to a raw Tauri invoke.
 */
export async function invoke<T = unknown>(cmd: string, args?: IpcArgs): Promise<T> {
  const legacy = getLegacyIpc();
  const fn = legacy ? legacy.invoke.bind(legacy) : rawTauriInvoke;
  return (await fn(cmd, args)) as T;
}

// ---------------------------------------------------------------------------
// Config / Runtime
// ---------------------------------------------------------------------------

export async function requestRuntime(): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>('cmd_request_runtime', {});
}

export async function ready(backdropMode?: string): Promise<RuntimeSnapshot> {
  return invoke<RuntimeSnapshot>(
    'cmd_ready',
    backdropMode !== undefined ? { backdropMode } : {},
  );
}

/** cmd_save takes a JSON *string* ({ json: "..." }); accepts object or string. */
export async function saveConfig(payload: object | string): Promise<void> {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await invoke<void>('cmd_save', { json });
}

/**
 * [UNVERIFIED] theme/language/font keys are NOT confirmed against the Rust
 * config struct. This helper just forwards a partial config patch to cmd_save.
 * Verify field names before relying on them.
 */
export async function saveAppPrefs(patch: AppConfigPatch): Promise<void> {
  await saveConfig(patch);
}

/** cmd_save_camera_prefs takes a JSON *string* ({ json: "..." }). */
export async function saveCameraPrefs(payload: object | string): Promise<void> {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  await invoke<void>('cmd_save_camera_prefs', { json });
}

export async function pause(): Promise<void> {
  await invoke<void>('cmd_pause', {});
}

export async function resume(): Promise<void> {
  await invoke<void>('cmd_resume', {});
}

// ---------------------------------------------------------------------------
// App prefs / Basic settings panel
// 这些命令在 P2 阶段未被覆盖，P5 基础设置岛需要它们。
// 签名已从 src/js/core/app-autostart.js / app-coach-hud.js 核实。
// ---------------------------------------------------------------------------

/** 读取开机自启动状态（Rust 端布尔）。[VERIFIED] */
export async function autostartGet(): Promise<boolean> {
  return invoke<boolean>('cmd_autostart_get', {});
}

/** 设置开机自启动（Rust 端布尔）。[VERIFIED] */
export async function autostartSet(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_autostart_set', { enabled });
}

/** 设置按键提示条（Coach HUD）开关。[VERIFIED by src/js/core/app-coach-hud.js] */
export async function coachHudSetEnabled(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_coach_hud_set_enabled', { enabled });
}

// ---------------------------------------------------------------------------
// App / Runtime environment
// ---------------------------------------------------------------------------

export async function getForegroundApp(): Promise<AppIdentity> {
  return invoke<AppIdentity>('cmd_foreground_app', {});
}

export async function getAppIcon(fullPath: string): Promise<{ iconDataUrl: string | null }> {
  return invoke<{ iconDataUrl: string | null }>('cmd_app_icon', { fullPath });
}

export async function getRunningApps(): Promise<{ apps: AppIdentity[] }> {
  return invoke<{ apps: AppIdentity[] }>('cmd_running_apps', {});
}

export async function setSetupInteractionActive(active: boolean): Promise<void> {
  await invoke<void>('cmd_set_setup_interaction_active', { active });
}

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------

export async function getMicMute(): Promise<MicMuteState> {
  return invoke<MicMuteState>('cmd_mic_get_mute', {});
}

export async function setMicMute(muted: boolean): Promise<MicMuteState> {
  return invoke<MicMuteState>('cmd_mic_set_mute', { muted });
}

export async function listMicDevices(force?: boolean): Promise<MicDeviceInfo[]> {
  return invoke<MicDeviceInfo[]>('cmd_mic_list', force !== undefined ? { force } : {});
}

/** Rust accepts deviceId OR device_id; we send camelCase. */
export async function setDefaultMic(deviceId: string, force?: boolean): Promise<void> {
  const args: Record<string, unknown> = { deviceId };
  if (force !== undefined) args.force = force;
  await invoke<void>('cmd_mic_set_default', args);
}

export async function startMicMonitor(deviceId?: string, force?: boolean): Promise<void> {
  const args: Record<string, unknown> = {};
  if (deviceId !== undefined) args.deviceId = deviceId;
  if (force !== undefined) args.force = force;
  await invoke<void>('cmd_mic_monitor_start', args);
}

export async function getMicLevel(): Promise<MicLevelSnapshot> {
  return invoke<MicLevelSnapshot>('cmd_mic_get_level', {});
}

export async function stopMicMonitor(): Promise<void> {
  await invoke<void>('cmd_mic_monitor_stop', {});
}

// ---------------------------------------------------------------------------
// Voice — Vosk
// ---------------------------------------------------------------------------

export async function getVoiceVoskStatus(): Promise<VoiceEngineStatus> {
  return invoke<VoiceEngineStatus>('cmd_voice_vosk_status', {});
}
export async function setVoiceVoskEnabled(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_voice_vosk_set_enabled', { enabled });
}
export async function setVoiceVoskPhrases(phrases: string[]): Promise<void> {
  await invoke<void>('cmd_voice_vosk_set_phrases', { phrases });
}
export async function setVoiceVoskModelPreset(preset: string): Promise<void> {
  await invoke<void>('cmd_voice_vosk_set_model_preset', { preset });
}
export async function setVoiceVoskModelPath(path: string): Promise<void> {
  await invoke<void>('cmd_voice_vosk_set_model_path', { path });
}
export async function testSendVoiceVosk(): Promise<unknown> {
  return invoke('cmd_voice_vosk_test_send', {});
}
export async function retryVoiceVoskStart(): Promise<unknown> {
  return invoke('cmd_voice_vosk_retry_start', {});
}
export async function openVoskResourcesDir(): Promise<void> {
  await invoke<void>('cmd_open_vosk_resources_dir', {});
}
export async function downloadVoskModel(preset: string): Promise<unknown> {
  return invoke('cmd_vosk_download_model', { preset });
}

// ---------------------------------------------------------------------------
// Voice — SAPI
// ---------------------------------------------------------------------------

export async function getVoiceSapiStatus(): Promise<VoiceEngineStatus> {
  return invoke<VoiceEngineStatus>('cmd_voice_sapi_status', {});
}
export async function setVoiceSapiEnabled(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_voice_sapi_set_enabled', { enabled });
}
export async function setVoiceSapiPhrases(phrases: string[]): Promise<void> {
  await invoke<void>('cmd_voice_sapi_set_phrases', { phrases });
}
export async function setVoiceSapiMinConfidence(minConfidence: number): Promise<void> {
  await invoke<void>('cmd_voice_sapi_set_min_confidence', { minConfidence });
}
export async function testSendVoiceSapi(): Promise<unknown> {
  return invoke('cmd_voice_sapi_test_send', {});
}
export async function openWindowsSpeechSetup(): Promise<void> {
  await invoke<void>('cmd_open_windows_speech_setup', {});
}

// ---------------------------------------------------------------------------
// Voice — KWS
// ---------------------------------------------------------------------------

export async function getVoiceKwsStatus(): Promise<VoiceEngineStatus> {
  return invoke<VoiceEngineStatus>('cmd_voice_kws_status', {});
}
export async function setVoiceKwsEnabled(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_voice_kws_set_enabled', { enabled });
}
export async function setVoiceKwsPhrases(phrases: string[]): Promise<void> {
  await invoke<void>('cmd_voice_kws_set_phrases', { phrases });
}
export async function testDetectVoiceKws(phrase: string): Promise<unknown> {
  return invoke('cmd_voice_kws_test_detect', { phrase });
}
export async function testSendVoiceKws(): Promise<unknown> {
  return invoke('cmd_voice_kws_test_send', {});
}
export async function retryVoiceKwsStart(): Promise<unknown> {
  return invoke('cmd_voice_kws_retry_start', {});
}
export async function downloadKwsModel(preset: string): Promise<unknown> {
  return invoke('cmd_kws_download_model', { preset });
}

// ---------------------------------------------------------------------------
// Voice — End-of-utterance
// ---------------------------------------------------------------------------

export async function getVoiceEndStatus(): Promise<VoiceEngineStatus> {
  return invoke<VoiceEngineStatus>('cmd_voice_end_status', {});
}
export async function setVoiceEndEnabled(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_voice_end_set_enabled', { enabled });
}
export async function setVoiceEndAutoSend(enabled: boolean): Promise<void> {
  await invoke<void>('cmd_voice_end_set_auto_send', { enabled });
}
export async function setVoiceEndSendMode(sendMode: string): Promise<void> {
  await invoke<void>('cmd_voice_end_set_send_mode', { sendMode });
}
export async function setVoiceEndCommitDelay(commitDelayMs: number): Promise<void> {
  await invoke<void>('cmd_voice_end_set_commit_delay', { commitDelayMs });
}
export async function setVoiceEndCommitKey(commitKey: string): Promise<void> {
  await invoke<void>('cmd_voice_end_set_commit_key', { commitKey });
}

export interface DataRootStatus {
  effectiveRoot: string;
  defaultRoot: string;
  isCustom: boolean;
  pointerPath: string;
  configPath: string;
  logsDir: string;
  restartRequired: boolean;
}

export async function dataRootStatus(): Promise<DataRootStatus> {
  return invoke<DataRootStatus>('cmd_data_root_status', {});
}
export async function dataRootPick(): Promise<DataRootStatus> {
  return invoke<DataRootStatus>('cmd_data_root_pick', {});
}
export async function dataRootOpen(): Promise<void> {
  await invoke<void>('cmd_data_root_open', {});
}
export async function dataRootReset(): Promise<DataRootStatus> {
  return invoke<DataRootStatus>('cmd_data_root_reset', {});
}
export async function openPath(path: string): Promise<void> {
  await invoke<void>('cmd_open_path', { path });
}
export async function exportLogs(frontendLines?: string[]): Promise<{
  ok: boolean;
  path?: string;
  dir?: string;
}> {
  return invoke('cmd_export_logs', {
    frontendLines: frontendLines ?? [],
  });
}
export async function updateCheck(): Promise<unknown> {
  return invoke('cmd_update_check', {});
}
export async function updateInstall(): Promise<unknown> {
  return invoke('cmd_update_install', {});
}
/**
 * Set the END (confirm/commit) phrases. [VERIFIED vs legacy voice-end.js:804]
 * Legacy sends `{ phrasesZh, phrasesEn }` to `cmd_voice_end_set_phrases`.
 */
export async function setVoiceEndPhrases(phrasesZh: string[], phrasesEn: string[]): Promise<void> {
  await invoke<void>('cmd_voice_end_set_phrases', { phrasesZh, phrasesEn });
}
/**
 * Set the SEND (auto-send-on-phrase) phrases. [VERIFIED vs legacy voice-end.js:1043]
 * Legacy sends `{ phrasesZh, phrasesEn }` to `cmd_voice_end_set_send_phrases`.
 */
export async function setVoiceEndSendPhrases(phrasesZh: string[], phrasesEn: string[]): Promise<void> {
  await invoke<void>('cmd_voice_end_set_send_phrases', { phrasesZh, phrasesEn });
}
/**
 * Set the CANCEL phrases. [VERIFIED vs legacy voice-end.js:1026]
 * Legacy sends `{ phrasesZh, phrasesEn }` to `cmd_voice_end_set_cancel_phrases`.
 * NOTE: earlier this was wrongly typed as a single `{ phrases }` array and would
 * have dropped the language dimension — fixed in P6.
 */
export async function setVoiceEndCancelPhrases(phrasesZh: string[], phrasesEn: string[]): Promise<void> {
  await invoke<void>('cmd_voice_end_set_cancel_phrases', { phrasesZh, phrasesEn });
}
export async function testStopVoiceEnd(): Promise<unknown> {
  return invoke('cmd_voice_end_test_stop', {});
}
export async function testCommitVoiceEnd(): Promise<unknown> {
  return invoke('cmd_voice_end_test_commit', {});
}
export async function voiceEndUiEnd(): Promise<void> {
  await invoke<void>('cmd_voice_end_ui_end', {});
}
export async function voiceEndUiCancel(): Promise<void> {
  await invoke<void>('cmd_voice_end_ui_cancel', {});
}

// ---------------------------------------------------------------------------
// Voice — desired engine / listening strategy / acoustic
// ---------------------------------------------------------------------------

export async function setDesiredVoiceEngine(engine: string): Promise<DesiredEngineBundle> {
  return invoke<DesiredEngineBundle>('cmd_voice_set_desired_engine', { engine });
}
export async function setListeningStrategy(strategy: string): Promise<DesiredEngineBundle> {
  return invoke<DesiredEngineBundle>('cmd_voice_set_listening_strategy', { strategy });
}
export async function getAcousticVoiceCommandStatus(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_status', {});
}
export async function setAcousticVoiceCommandSuspend(suspended: boolean): Promise<void> {
  await invoke<void>('cmd_acoustic_voice_command_set_suspend', { suspended });
}
export async function acousticVoiceCommandPreflight(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_preflight', {});
}
export async function acousticVoiceCommandRecordOnce(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_record_once', {});
}
export async function acousticVoiceCommandRecordStart(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_record_start', {});
}
export async function acousticVoiceCommandRecordStop(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_record_stop', {});
}
export async function acousticVoiceCommandRecordCancel(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_record_cancel', {});
}
export async function acousticVoiceCommandBuildFromSamples(): Promise<unknown> {
  return invoke('cmd_acoustic_voice_command_build_from_samples', {});
}

// ---------------------------------------------------------------------------
// Mapping CRUD / conflicts / edit
// ---------------------------------------------------------------------------

export async function mappingToggle(id: string, enabled: boolean): Promise<CmdAck> {
  return invoke<CmdAck>('cmd_mapping_toggle', { id, enabled });
}
export async function mappingDelete(id: string): Promise<CmdAck> {
  return invoke<CmdAck>('cmd_mapping_delete', { id });
}
export async function mappingDuplicate(id: string): Promise<CmdAck & { id: string }> {
  return invoke<CmdAck & { id: string }>('cmd_mapping_duplicate', { id });
}
export async function mappingReorder(orderedIds: string[]): Promise<void> {
  await invoke<void>('cmd_mapping_reorder', { orderedIds });
}
export async function mappingSetGroup(id: string, group: string): Promise<void> {
  await invoke<void>('cmd_mapping_set_group', { id, group });
}
export async function mappingSetSourceKey(id: string, sourceKey: string): Promise<CmdAck> {
  return invoke<CmdAck>('cmd_mapping_set_source_key', { id, sourceKey });
}
export async function mappingConflicts(mappingId?: string): Promise<ConflictReport[]> {
  return invoke<ConflictReport[]>(
    'cmd_mapping_conflicts',
    mappingId !== undefined ? { mappingId } : {},
  );
}

// ---------------------------------------------------------------------------
// Trigger compatibility probe / verify-listen
// ---------------------------------------------------------------------------

export async function startTriggerCompatProbe(mappingId: string): Promise<TriggerProbeResult> {
  return invoke<TriggerProbeResult>('cmd_start_trigger_compat_probe', { mappingId });
}
export async function startTriggerVerifyListen(mappingId: string): Promise<TriggerProbeResult> {
  return invoke<TriggerProbeResult>('cmd_start_trigger_verify_listen', { mappingId });
}
export async function stopTriggerCompatProbe(): Promise<void> {
  await invoke<void>('cmd_stop_trigger_compat_probe', {});
}
export async function stopTriggerVerifyListen(): Promise<void> {
  await invoke<void>('cmd_stop_trigger_verify_listen', {});
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export async function appLog(line: string): Promise<void> {
  await invoke<void>('cmd_app_log', { line });
}
