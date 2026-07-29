// Shared types for the OneTone typed IPC layer.
//
// Verification legend (search these tokens in code review):
//   [VERIFIED]    derived directly from a Rust #[tauri::command] signature in
//                 src-tauri/src/ipc/commands/** (arg names, optionality, return kind).
//   [BEST-EFFORT] inferred from JS call sites or a `serde_json::Value` return.
//                 shape may differ from reality — verify before relying on fields.
//   [UNVERIFIED]  guessed / not yet confirmed against the Rust config struct.
//                 MUST be confirmed before production use.

export interface MicMuteState {
  muted: boolean;
  // [BEST-EFFORT] engine may also report device-level detail.
  [key: string]: unknown;
}

export interface MicDeviceInfo {
  deviceId?: string;
  id?: string;
  name?: string;
  isDefault?: boolean;
  [key: string]: unknown;
}

export interface MicLevelSnapshot {
  level?: number;
  rms?: number;
  peak?: number;
  [key: string]: unknown;
}

export interface AppIdentity {
  appId: string | null;
  pid?: number;
  exeName?: string;
  fullPath?: string | null;
  windowTitle?: string;
  displayName?: string;
  matchedPresetAppId?: string | null;
  iconDataUrl?: string | null;
}

export interface ConflictReport {
  mappingId?: string;
  id?: string;
  field?: string;
  kind?: string;
  message?: string;
  [key: string]: unknown;
}

export interface CmdAck {
  type?: string;
  ok: boolean;
  reason?: string;
  id?: string;
  // [BEST-EFFORT] some acks carry extra keys (autoDisabled, etc.)
  [key: string]: unknown;
}

// [BEST-EFFORT] result of cmd_ready / cmd_request_runtime. The real payload is a
// large serde_json::Value; only a few structurally-known fields are pinned here.
// Treat as a partial view and read extra fields via index access.
export interface RuntimeSnapshot {
  config?: AppConfigPatch;
  mappings?: MappingEntryLite[];
  [key: string]: unknown;
}

export interface MappingEntryLite {
  id: string;
  label?: string;
  group?: string;
  enabled?: boolean;
  triggerKey?: string;
  targetKey?: string;
  sourceKey?: string;
  order?: number;
  [key: string]: unknown;
}

// [UNVERIFIED] App config field names (theme/language/font/etc.) are NOT yet
// confirmed against the Rust config struct. Only list fields the islands will
// read/write. Confirm keys before relying on them — they may be snake_case.
export interface AppConfigPatch {
  theme?: string;
  language?: string;
  font?: string;
  fontFamily?: string;
  fontSize?: number;
  uiScale?: number;
  darkMode?: boolean;
  activeSceneId?: string;
  mappings?: MappingEntryLite[];
  [key: string]: unknown;
}

export type VoiceEngineId = 'vosk' | 'sapi' | 'kws' | 'none' | (string & {});

// [BEST-EFFORT] voice engine status shapes differ per engine; keep permissive.
export type VoiceEngineStatus = Record<string, unknown>;
export type DesiredEngineBundle = Record<string, unknown>;

export interface TriggerProbeResult {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}
