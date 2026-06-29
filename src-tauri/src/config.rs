use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::ipc;
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TriggerMode {
    #[default]
    Tap,
    Hold,
    LongPress,
    Double,
    Toggle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappingEntry {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(rename = "triggerKey", default)]
    pub trigger_key: String,
    #[serde(rename = "targetKey", default)]
    pub target_key: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub order: u32,
    #[serde(rename = "triggerMode", default)]
    pub trigger_mode: TriggerMode,
    #[serde(rename = "triggerSource", default)]
    pub trigger_source: Option<TriggerSource>,
    #[serde(rename = "sourceKey", default)]
    pub source_key: String,
    #[serde(rename = "sourceTime", default)]
    pub source_time: String,
    #[serde(rename = "intervalMs", default)]
    pub interval_ms: u32,
    #[serde(rename = "enterDelayMs", default)]
    pub enter_delay_ms: u32,
    #[serde(rename = "cancelEnabled", default = "default_true")]
    pub cancel_enabled: bool,
    #[serde(rename = "autoEnterEnabled", default = "default_true")]
    pub auto_enter_enabled: bool,
    /// 按下这些组合键时直接切换到此方案（可多个）。
    #[serde(rename = "switchKeys", default)]
    pub switch_keys: Vec<String>,
    /// 为 true 时不拦截物理启动键，恢复系统原生功能。
    #[serde(rename = "nativeKeyRestore", default)]
    pub native_key_restore: bool,
    /// 录制时绑定的输入设备（Raw Input 路径）；空表示任意设备。
    #[serde(rename = "triggerDevice", default)]
    pub trigger_device: String,
    #[serde(rename = "longPressMs", default = "default_long_press_ms")]
    pub long_press_ms: u32,
    #[serde(rename = "doubleClickMs", default = "default_double_click_ms")]
    pub double_click_ms: u32,
}

fn default_long_press_ms() -> u32 {
    500
}

fn default_double_click_ms() -> u32 {
    400
}

pub const SCHEME_CYCLE_MARKER: &str = "__scheme_cycle__";
pub const SCHEME_SELECT_PREFIX: &str = "__scheme_select__:";

fn default_group() -> String {
    "  ".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RawEvent {
    #[serde(default)]
    pub device: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub location: u32,
    #[serde(default, rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub button: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TriggerSource {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub grouping: String,
    #[serde(default, rename = "rawEvents")]
    pub raw_events: Vec<RawEvent>,
}

/// Legacy migrate-only; not used at runtime.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActionConfig {
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub cancel: String,
    #[serde(default)]
    pub send: String,
}

/// Legacy / reserved; not used at runtime.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SceneConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, rename = "overrideMode")]
    pub override_mode: String,
    #[serde(default, rename = "cancelWindowMs")]
    pub cancel_window_ms: u32,
    #[serde(default, rename = "sendDelayMs")]
    pub send_delay_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub mappings: Vec<MappingEntry>,
    ///                 
    #[serde(default)]
    pub trash: Vec<MappingEntry>,
    #[serde(default = "default_interval_ms")]
    #[serde(rename = "intervalMs")]
    pub interval_ms: u32,
    #[serde(default = "default_enter_delay_ms")]
    #[serde(rename = "enterDelayMs")]
    pub enter_delay_ms: u32,
    #[serde(default = "default_true")]
    #[serde(rename = "cancelEnabled")]
    pub cancel_enabled: bool,
    #[serde(default = "default_true")]
    #[serde(rename = "autoEnterEnabled")]
    pub auto_enter_enabled: bool,
    #[serde(default = "default_debounce_ms")]
    #[serde(rename = "debounceMs")]
    pub debounce_ms: u32,
    #[serde(default = "default_key_press_duration_ms")]
    #[serde(rename = "keyPressDurationMs")]
    pub key_press_duration_ms: u32,
    #[serde(default, rename = "voiceSapi")]
    pub voice_sapi: VoiceSapiConfig,
    #[serde(default, rename = "voiceVosk")]
    pub voice_vosk: VoiceVoskConfig,
    #[serde(default, rename = "voiceEnd")]
    pub voice_end: VoiceEndConfig,
    #[serde(default, skip_serializing)]
    pub scenes: Option<Vec<SceneConfig>>,
    #[serde(rename = "schemeSwitchKey", default = "default_scheme_switch_key")]
    pub scheme_switch_key: String,
    #[serde(default, rename = "keyWakeSoundEnabled")]
    pub key_wake_sound_enabled: bool,
    #[serde(default, rename = "sounds")]
    pub sounds: SoundsConfig,
    // --- migrate-only (read, never serialize) ---
    #[serde(default, rename = "recordKey", skip_serializing)]
    pub record_key: String,
    #[serde(default, rename = "targetKey", skip_serializing)]
    pub target_key: String,
    #[serde(default, rename = "triggerSource", skip_serializing)]
    pub trigger_source: Option<TriggerSource>,
    #[serde(default, skip_serializing)]
    pub actions: Option<ActionConfig>,
}

fn default_version() -> u32 {
    5
}
fn default_scheme_switch_key() -> String {
    String::new()
}
fn default_interval_ms() -> u32 {
    1200
}
fn default_enter_delay_ms() -> u32 {
    5000
}
fn default_true() -> bool {
    true
}
fn default_debounce_ms() -> u32 {
    80
}
fn default_key_press_duration_ms() -> u32 {
    250
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSapiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_sapi_phrases")]
    pub phrases: Vec<String>,
    #[serde(default = "default_voice_sapi_target_key")]
    pub target_key: String,
    #[serde(default = "default_voice_sapi_cooldown_ms")]
    pub cooldown_ms: u32,
    #[serde(default = "default_voice_sapi_min_confidence")]
    pub min_confidence: f32,
}

fn default_voice_sapi_phrases() -> Vec<String> {
    vec![
        "开始输入".into(),
        "开始听写".into(),
        "开启输入".into(),
        "开始说话".into(),
    ]
}

fn default_voice_sapi_target_key() -> String {
    "RAlt".into()
}

fn default_voice_sapi_cooldown_ms() -> u32 {
    2000
}

fn default_voice_sapi_min_confidence() -> f32 {
    0.35
}

impl Default for VoiceSapiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases: default_voice_sapi_phrases(),
            target_key: default_voice_sapi_target_key(),
            cooldown_ms: default_voice_sapi_cooldown_ms(),
            min_confidence: default_voice_sapi_min_confidence(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceEndConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_end_phrases_zh")]
    pub phrases_zh: Vec<String>,
    #[serde(default = "default_voice_end_phrases_en")]
    pub phrases_en: Vec<String>,
    #[serde(default = "default_voice_end_commit_delay_ms")]
    pub commit_delay_ms: u32,
    #[serde(default = "default_voice_end_commit_key")]
    pub commit_key: String,
    #[serde(default = "default_voice_end_dictation_timeout_ms")]
    pub dictation_timeout_ms: u32,
    #[serde(default = "default_false")]
    pub auto_send_enabled: bool,
    #[serde(default = "default_voice_end_target_key")]
    pub target_key: String,
}

fn default_false() -> bool {
    false
}

pub fn default_voice_end_phrases_zh() -> Vec<String> {
    vec!["结束输入".into(), "发出去".into()]
}

pub fn default_voice_end_phrases_en() -> Vec<String> {
    vec!["end dictation".into(), "send it".into()]
}

fn default_voice_end_commit_delay_ms() -> u32 {
    4000
}

fn default_voice_end_commit_key() -> String {
    "Enter".into()
}

fn default_voice_end_dictation_timeout_ms() -> u32 {
    60000
}

fn default_voice_end_target_key() -> String {
    "RAlt".into()
}

impl Default for VoiceEndConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases_zh: default_voice_end_phrases_zh(),
            phrases_en: default_voice_end_phrases_en(),
            commit_delay_ms: default_voice_end_commit_delay_ms(),
            commit_key: default_voice_end_commit_key(),
            dictation_timeout_ms: default_voice_end_dictation_timeout_ms(),
            auto_send_enabled: false,
            target_key: default_voice_end_target_key(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundSlot {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub id: String,
}

fn default_sound_id_record() -> String {
    "tiny-tick".into()
}
fn default_sound_id_voice_wake() -> String {
    "voice-open-signal".into()
}
fn default_sound_id_key_wake() -> String {
    "input-ready-soft".into()
}
fn default_sound_id_send_success() -> String {
    "send-confirm-click".into()
}
fn default_sound_id_send_fail() -> String {
    "error-subtle".into()
}

impl Default for SoundSlot {
    fn default() -> Self {
        Self {
            enabled: false,
            id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundsConfig {
    #[serde(default = "default_true", rename = "masterEnabled")]
    pub master_enabled: bool,
    #[serde(default = "default_sound_slot_record")]
    pub record: SoundSlot,
    #[serde(default = "default_sound_slot_voice_wake", rename = "voiceWake")]
    pub voice_wake: SoundSlot,
    #[serde(default = "default_sound_slot_key_wake", rename = "keyWake")]
    pub key_wake: SoundSlot,
    #[serde(default = "default_sound_slot_send_success", rename = "sendSuccess")]
    pub send_success: SoundSlot,
    #[serde(default = "default_sound_slot_send_fail", rename = "sendFail")]
    pub send_fail: SoundSlot,
}

fn default_sound_slot_record() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_record(),
    }
}
fn default_sound_slot_voice_wake() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_voice_wake(),
    }
}
fn default_sound_slot_key_wake() -> SoundSlot {
    SoundSlot {
        enabled: false,
        id: default_sound_id_key_wake(),
    }
}
fn default_sound_slot_send_success() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_send_success(),
    }
}
fn default_sound_slot_send_fail() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_send_fail(),
    }
}

impl Default for SoundsConfig {
    fn default() -> Self {
        Self {
            master_enabled: true,
            record: default_sound_slot_record(),
            voice_wake: default_sound_slot_voice_wake(),
            key_wake: default_sound_slot_key_wake(),
            send_success: default_sound_slot_send_success(),
            send_fail: default_sound_slot_send_fail(),
        }
    }
}

impl SoundsConfig {
    pub fn normalize(&mut self) {
        if self.record.id.trim().is_empty() {
            self.record.id = default_sound_id_record();
        }
        if self.voice_wake.id.trim().is_empty() {
            self.voice_wake.id = default_sound_id_voice_wake();
        }
        if self.key_wake.id.trim().is_empty() {
            self.key_wake.id = default_sound_id_key_wake();
        }
        if self.send_success.id.trim().is_empty() {
            self.send_success.id = default_sound_id_send_success();
        }
        if self.send_fail.id.trim().is_empty() {
            self.send_fail.id = default_sound_id_send_fail();
        }
    }

    pub fn cue_enabled(&self, cue: &str) -> bool {
        if !self.master_enabled {
            return false;
        }
        match cue {
            "record" => self.record.enabled,
            "voice_wake" => self.voice_wake.enabled,
            "key_wake" => self.key_wake.enabled,
            "send_success" => self.send_success.enabled,
            "send_fail" => self.send_fail.enabled,
            _ => false,
        }
    }
}

pub fn runtime_sound_cue(cfg: &VoiceConfig, cue: &str) -> Option<String> {
    if cfg.sounds.cue_enabled(cue) {
        Some(cue.to_string())
    } else {
        None
    }
}

/// Start + end phrases merged for Vosk grammar (deduplicated).
pub fn vosk_grammar_phrases(cfg: &VoiceConfig) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut push = |p: &str| {
        let t = p.trim();
        if t.is_empty() {
            return;
        }
        if seen.insert(t.to_string()) {
            out.push(t.to_string());
        }
    };
    for p in &cfg.voice_vosk.phrases {
        push(p);
    }
    if cfg.voice_end.enabled {
        for p in &cfg.voice_end.phrases_zh {
            push(p);
        }
        for p in &cfg.voice_end.phrases_en {
            push(p);
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceVoskConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_vosk_phrases")]
    pub phrases: Vec<String>,
    #[serde(default = "default_voice_vosk_target_key")]
    pub target_key: String,
    #[serde(default = "default_voice_vosk_cooldown_ms")]
    pub cooldown_ms: u32,
    #[serde(default = "default_voice_vosk_model_path")]
    pub model_path: String,
    #[serde(default = "default_voice_vosk_model_preset")]
    pub model_preset: String,
}

fn default_voice_vosk_phrases() -> Vec<String> {
    default_voice_vosk_phrases_cn()
}

fn default_voice_vosk_phrases_cn() -> Vec<String> {
    vec![
        "开始输入".into(),
        "开始听写".into(),
        "打开听写".into(),
        "语音输入".into(),
        "开启输入".into(),
    ]
}

fn default_voice_vosk_phrases_en() -> Vec<String> {
    vec![
        "start dictation".into(),
        "start input".into(),
        "begin dictation".into(),
        "voice input".into(),
        "start typing".into(),
    ]
}

fn default_voice_vosk_target_key() -> String {
    "RAlt".into()
}

fn default_voice_vosk_cooldown_ms() -> u32 {
    2000
}

fn default_voice_vosk_model_path() -> String {
    "resources/vosk/vosk-model-small-cn-0.22".into()
}

fn default_voice_vosk_model_preset() -> String {
    "cn-light".into()
}

/// Relative paths for built-in Vosk light models.
pub const VOSK_CN_LIGHT_REL: &str = "resources/vosk/vosk-model-small-cn-0.22";
pub const VOSK_EN_LIGHT_REL: &str = "resources/vosk/vosk-model-small-en-us-0.15";

impl Default for VoiceVoskConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases: default_voice_vosk_phrases(),
            target_key: default_voice_vosk_target_key(),
            cooldown_ms: default_voice_vosk_cooldown_ms(),
            model_path: default_voice_vosk_model_path(),
            model_preset: default_voice_vosk_model_preset(),
        }
    }
}

/// Built-in Vosk model preset → relative path under project/resources.
pub fn vosk_preset_model_path(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some(VOSK_CN_LIGHT_REL),
        "en-light" => Some(VOSK_EN_LIGHT_REL),
        _ => None,
    }
}

pub fn vosk_preset_is_dual(preset: &str) -> bool {
    preset.trim() == "auto"
}

/// Default wake phrases when switching model preset.
pub fn vosk_preset_default_phrases(preset: &str) -> Option<Vec<String>> {
    match preset.trim() {
        "cn-light" => Some(default_voice_vosk_phrases_cn()),
        "en-light" => Some(default_voice_vosk_phrases_en()),
        _ => None,
    }
}
pub fn resolve_vosk_model_path(cfg: &VoiceVoskConfig) -> String {
    if cfg.model_preset.trim() == "custom" || cfg.model_preset.trim().is_empty() {
        if cfg.model_path.trim().is_empty() {
            return default_voice_vosk_model_path();
        }
        return cfg.model_path.trim().to_string();
    }
    if let Some(path) = vosk_preset_model_path(&cfg.model_preset) {
        return path.to_string();
    }
    if cfg.model_path.trim().is_empty() {
        default_voice_vosk_model_path()
    } else {
        cfg.model_path.trim().to_string()
    }
}

pub fn now_source_time() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

pub fn new_mapping_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("m-{ms}")
}

pub fn canonical_trigger(key: &str) -> String {
    match key.trim() {
        "AltRight" | "RMenu" => "RAlt".into(),
        "ControlRight" | "RControl" => "RCtrl".into(),
        "AudioVolumeUp" | "VolumeUp" | "Volume_Up" | "Audio_Volume_Up" => "Volume_Up".into(),
        "AudioVolumeDown" | "VolumeDown" | "Volume_Down" | "Audio_Volume_Down" => {
            "Volume_Down".into()
        }
        "AudioVolumeMute" | "VolumeMute" | "Volume_Mute" | "Audio_Volume_Mute" => {
            "Volume_Mute".into()
        }
        other => other.to_string(),
    }
}

pub fn is_allowed_trigger(key: &str) -> bool {
    !canonical_trigger(key).trim().is_empty()
}

pub fn physical_bindings(trigger_key: &str) -> Vec<String> {
    let c = canonical_trigger(trigger_key);
    if c.is_empty() {
        vec![]
    } else {
        vec![c]
    }
}

pub fn is_volume_hotkey(key: &str) -> bool {
    matches!(
        canonical_trigger(key).as_str(),
        "Volume_Up" | "Volume_Down" | "Volume_Mute"
    )
}

fn volume_raw_event_with_device(hotkey: &str, label: &str, device: &str) -> RawEvent {
    let (key, code) = match hotkey {
        "Volume_Down" => ("AudioVolumeDown", "AudioVolumeDown"),
        "Volume_Up" => ("AudioVolumeUp", "AudioVolumeUp"),
        "Volume_Mute" => ("AudioVolumeMute", "AudioVolumeMute"),
        other => (other, other),
    };
    RawEvent {
        device: if device.trim().is_empty() {
            "keyboard".into()
        } else {
            device.into()
        },
        key: key.into(),
        code: code.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: label.into(),
        button: None,
    }
}

fn volume_raw_event(hotkey: &str, label: &str) -> RawEvent {
    volume_raw_event_with_device(hotkey, label, "")
}

///     /        ?
pub fn is_peripheral_trigger_key(key: &str) -> bool {
    let c = canonical_trigger(key);
    if c.starts_with("VK_") && c.len() >= 4 {
        return true;
    }
    matches!(
        c.as_str(),
        "Media_Next"
            | "Media_Prev"
            | "Media_Play_Pause"
            | "Media_Stop"
            | "Browser_Back"
            | "Browser_Forward"
            | "Browser_Refresh"
            | "Launch_Mail"
            | "Launch_App1"
            | "Launch_App2"
            | "AppsKey"
    ) || c.starts_with('F') && c[1..].chars().all(|ch| ch.is_ascii_digit())
}

fn peripheral_raw_event_with_device(hotkey: &str, device: &str) -> RawEvent {
    if is_volume_hotkey(hotkey) {
        let hk = canonical_trigger(hotkey);
        let label = match hk.as_str() {
            "Volume_Down" => "Volume Down",
            "Volume_Up" => "Volume Up",
            "Volume_Mute" => "Volume Mute",
            _ => hotkey,
        };
        return volume_raw_event_with_device(&hk, label, device);
    }
    RawEvent {
        device: if device.trim().is_empty() {
            "keyboard".into()
        } else {
            device.into()
        },
        key: hotkey.into(),
        code: hotkey.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: hotkey.into(),
        button: None,
    }
}

fn peripheral_raw_event(hotkey: &str) -> RawEvent {
    peripheral_raw_event_with_device(hotkey, "")
}

///                + F1 ?
pub fn default_peripheral_hotkeys() -> Vec<String> {
    vec![]
}

pub fn make_combo_trigger_source(combo: &str) -> TriggerSource {
    let parts: Vec<String> = combo
        .split('+')
        .map(|s| canonical_trigger(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    TriggerSource {
        id: "source_combo".into(),
        label: "组合启动键".into(),
        mode: "chord".into(),
        grouping: "exact".into(),
        raw_events: parts.iter().map(|k| peripheral_raw_event(k)).collect(),
    }
}

pub fn make_peripheral_mixed_source(extra: &[String]) -> TriggerSource {
    make_peripheral_mixed_source_with_device(extra, "")
}

pub fn make_peripheral_mixed_source_with_device(extra: &[String], device: &str) -> TriggerSource {
    let mut keys = default_peripheral_hotkeys();
    for k in extra {
        let c = canonical_trigger(k);
        if matches!(c.as_str(), "Volume_Up" | "Volume_Down") {
            for volume_key in ["Volume_Down", "Volume_Up"] {
                if !keys.iter().any(|x| x == volume_key) {
                    keys.push(volume_key.to_string());
                }
            }
            continue;
        }
        let hotkey = if c == "AutoTrigger" { k.to_string() } else { c };
        if !hotkey.is_empty() && !keys.iter().any(|x| x == &hotkey) {
            keys.push(hotkey);
        }
    }
    TriggerSource {
        id: "source_peripheral_mixed".into(),
        label: "      ".into(),
        mode: "single_press".into(),
        grouping: "same_source_group".into(),
        raw_events: keys
            .iter()
            .map(|k| peripheral_raw_event_with_device(k, device))
            .collect(),
    }
}

///                            ?
#[allow(dead_code)]
pub fn make_volume_mixed_source() -> TriggerSource {
    make_peripheral_mixed_source(&[])
}

pub fn hotkey_from_raw_event(r: &RawEvent) -> Option<String> {
    if !r.hotkey.is_empty() && r.hotkey != "AutoTrigger" {
        return Some(canonical_trigger(&r.hotkey));
    }
    match r.key.as_str() {
        "AudioVolumeUp" | "Volume_Up" => Some("Volume_Up".into()),
        "AudioVolumeDown" | "Volume_Down" => Some("Volume_Down".into()),
        "AudioVolumeMute" | "Volume_Mute" => Some("Volume_Mute".into()),
        k if !k.is_empty() && k != "AutoTrigger" => Some(k.to_string()),
        _ => None,
    }
}

fn mapping_matches_device(m: &MappingEntry, event_device: Option<&str>) -> bool {
    let filter = m.trigger_device.trim();
    if filter.is_empty() {
        return true;
    }
    let incoming = event_device.unwrap_or("").trim();
    if incoming.is_empty() {
        return false;
    }
    crate::press_gesture::devices_match(filter, incoming)
}

pub fn effective_physical_bindings(m: &MappingEntry) -> Vec<String> {
    if m.native_key_restore {
        return vec![];
    }
    mapping_physical_bindings(m)
}

pub fn mapping_physical_bindings(m: &MappingEntry) -> Vec<String> {
    let tk = canonical_trigger(&m.trigger_key);
    if tk.contains('+') {
        return vec![tk];
    }
    if let Some(src) = &m.trigger_source {
        let from_raw: Vec<String> = src
            .raw_events
            .iter()
            .filter_map(hotkey_from_raw_event)
            .collect();
        if !from_raw.is_empty() {
            let mut out = Vec::new();
            for k in from_raw {
                if !out.contains(&k) {
                    out.push(k);
                }
            }
            return out;
        }
    }
    if canonical_trigger(&m.trigger_key) == "AutoTrigger" {
        return vec!["Volume_Down".into(), "Volume_Up".into()];
    }
    physical_bindings(&m.trigger_key)
}

fn needs_autotrigger_default_source(m: &MappingEntry) -> bool {
    if canonical_trigger(&m.trigger_key) != "AutoTrigger" {
        return false;
    }
    m.trigger_source
        .as_ref()
        .map(|s| s.raw_events.is_empty())
        .unwrap_or(true)
}

pub fn ensure_autotrigger_bindings(m: &mut MappingEntry) {
    if !needs_autotrigger_default_source(m) {
        return;
    }
    let hint = if is_volume_hotkey(&m.source_key) {
        canonical_trigger(&m.source_key)
    } else if is_peripheral_trigger_key(&m.source_key) {
        canonical_trigger(&m.source_key)
    } else {
        "Volume_Down".into()
    };
    apply_peripheral_autotrigger(m, &hint);
}

pub fn apply_autotrigger_source(m: &mut MappingEntry) {
    if canonical_trigger(&m.trigger_key) != "AutoTrigger" {
        return;
    }
    m.trigger_key = "AutoTrigger".into();
    if let Some(src) = &mut m.trigger_source {
        src.raw_events.retain(|r| !r.hotkey.trim().is_empty());
    }
}

pub fn apply_peripheral_autotrigger(m: &mut MappingEntry, captured: &str) {
    apply_peripheral_autotrigger_with_device(m, captured, "");
}

pub fn apply_peripheral_autotrigger_with_device(
    m: &mut MappingEntry,
    captured: &str,
    device: &str,
) {
    m.trigger_key = "AutoTrigger".into();
    let extra = if captured.trim().is_empty() || canonical_trigger(captured) == "AutoTrigger" {
        vec![]
    } else {
        vec![captured.to_string()]
    };
    if !device.trim().is_empty() {
        m.trigger_device = device.trim().to_string();
    }
    if m.source_key.trim().is_empty() {
        m.source_key = if extra.is_empty() {
            "AutoTrigger".into()
        } else {
            canonical_trigger(&extra[0])
        };
    }
    m.trigger_source = Some(make_peripheral_mixed_source_with_device(&extra, device));
}

impl Default for VoiceConfig {
    fn default() -> Self {
        let id = new_mapping_id();
        Self {
            version: 5,
            mappings: vec![MappingEntry {
                id,
                label: "AutoTrigger  ?RAlt".into(),
                group: default_group(),
                trigger_key: "AutoTrigger".into(),
                target_key: "RAlt".into(),
                enabled: true,
                order: 0,
                trigger_mode: TriggerMode::Tap,
                trigger_source: None,
                source_key: String::new(),
                source_time: String::new(),
                interval_ms: default_interval_ms(),
                enter_delay_ms: default_enter_delay_ms(),
                cancel_enabled: true,
                auto_enter_enabled: true,
                switch_keys: vec![],
                native_key_restore: false,
                trigger_device: String::new(),
                long_press_ms: default_long_press_ms(),
                double_click_ms: default_double_click_ms(),
            }],
            trash: vec![],
            interval_ms: default_interval_ms(),
            enter_delay_ms: default_enter_delay_ms(),
            cancel_enabled: true,
            auto_enter_enabled: true,
            debounce_ms: default_debounce_ms(),
            key_press_duration_ms: default_key_press_duration_ms(),
            voice_sapi: VoiceSapiConfig::default(),
            voice_vosk: VoiceVoskConfig::default(),
            voice_end: VoiceEndConfig::default(),
            scenes: None,
            scheme_switch_key: String::new(),
            key_wake_sound_enabled: false,
            sounds: SoundsConfig::default(),
            record_key: String::new(),
            target_key: String::new(),
            trigger_source: None,
            actions: None,
        }
    }
}

impl MappingEntry {
    pub fn display_label(&self) -> String {
        if !self.label.is_empty() {
            return self.label.clone();
        }
        format!("{}  ?{}", self.trigger_key, self.target_key)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConflictKind {
    CanonicalTrigger,
    PhysicalKey,
}

#[derive(Debug, Clone)]
pub struct Conflict {
    pub kind: ConflictKind,
    pub other_id: String,
    pub detail: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
    pub mapping_id: String,
    pub other_id: String,
    pub kind: String,
    pub detail: String,
}

impl ConflictKind {
    fn as_str(&self) -> &'static str {
        match self {
            ConflictKind::CanonicalTrigger => "canonical",
            ConflictKind::PhysicalKey => "physical",
        }
    }
}

fn is_mapping_complete(m: &MappingEntry) -> bool {
    !m.trigger_key.trim().is_empty() && !m.target_key.trim().is_empty()
}

pub fn mapping_is_complete(m: &MappingEntry) -> bool {
    is_mapping_complete(m)
}

pub fn mapping_timing(m: &MappingEntry, cfg: &VoiceConfig) -> (u32, u32, bool, bool) {
    let interval = if m.interval_ms >= 200 {
        m.interval_ms
    } else {
        cfg.interval_ms
    };
    let enter_delay = if m.enter_delay_ms >= 1000 {
        m.enter_delay_ms
    } else {
        cfg.enter_delay_ms
    };
    (
        interval,
        enter_delay,
        m.cancel_enabled,
        m.auto_enter_enabled,
    )
}

impl VoiceConfig {
    pub fn migrate(&mut self) {
        if self.version >= 5 && !self.mappings.is_empty() {
            self.normalize();
            return;
        }

        if self.version >= 4 && !self.mappings.is_empty() {
            for m in &mut self.mappings {
                if m.switch_keys.is_empty() {
                    m.switch_keys = vec![];
                }
            }
            for m in &mut self.trash {
                if m.switch_keys.is_empty() {
                    m.switch_keys = vec![];
                }
            }
            self.version = 5;
            self.normalize();
            return;
        }

        if self.version >= 3 && !self.mappings.is_empty() {
            let g_interval = self.interval_ms;
            let g_enter = self.enter_delay_ms;
            let g_cancel = self.cancel_enabled;
            let g_auto = self.auto_enter_enabled;
            for m in &mut self.mappings {
                if m.interval_ms < 200 {
                    m.interval_ms = g_interval;
                }
                if m.enter_delay_ms < 1000 {
                    m.enter_delay_ms = g_enter;
                }
            }
            for m in &mut self.trash {
                if m.interval_ms < 200 {
                    m.interval_ms = g_interval;
                }
                if m.enter_delay_ms < 1000 {
                    m.enter_delay_ms = g_enter;
                }
                m.cancel_enabled = g_cancel;
                m.auto_enter_enabled = g_auto;
            }
            self.version = 5;
            self.normalize();
            return;
        }

        if self.mappings.is_empty() {
            let trigger = if self.record_key.is_empty() {
                "AutoTrigger".into()
            } else {
                canonical_trigger(&self.record_key)
            };
            let target = if self.target_key.is_empty() {
                "RAlt".into()
            } else {
                self.target_key.clone()
            };
            self.mappings.push(MappingEntry {
                id: new_mapping_id(),
                label: format!("{trigger}  ?{target}"),
                group: default_group(),
                trigger_key: trigger,
                target_key: target,
                enabled: true,
                order: 0,
                trigger_mode: TriggerMode::Tap,
                trigger_source: self.trigger_source.clone(),
                source_key: String::new(),
                source_time: String::new(),
                interval_ms: self.interval_ms,
                enter_delay_ms: self.enter_delay_ms,
                cancel_enabled: self.cancel_enabled,
                auto_enter_enabled: self.auto_enter_enabled,
                switch_keys: vec![],
                native_key_restore: false,
                trigger_device: String::new(),
                long_press_ms: default_long_press_ms(),
                double_click_ms: default_double_click_ms(),
            });
        }

        self.version = 5;
        self.record_key.clear();
        self.target_key.clear();
        self.trigger_source = None;
        self.actions = None;
        self.normalize();
    }

    pub fn normalize(&mut self) {
        if self.interval_ms < 200 {
            self.interval_ms = 200;
        }
        if self.enter_delay_ms < 1000 {
            self.enter_delay_ms = 1000;
        }
        if self.mappings.is_empty() {
            *self = VoiceConfig::default();
        }
        if self.voice_sapi.phrases.iter().all(|p| p.trim().is_empty()) {
            self.voice_sapi.phrases = default_voice_sapi_phrases();
        }
        if self.voice_sapi.target_key.trim().is_empty() {
            self.voice_sapi.target_key = default_voice_sapi_target_key();
        }
        if self.voice_sapi.cooldown_ms < 200 {
            self.voice_sapi.cooldown_ms = default_voice_sapi_cooldown_ms();
        }
        if self.voice_sapi.min_confidence <= 0.0
            || (self.voice_sapi.min_confidence - 0.55).abs() < f32::EPSILON
        {
            self.voice_sapi.min_confidence = default_voice_sapi_min_confidence();
        }
        if self.voice_vosk.phrases.iter().all(|p| p.trim().is_empty()) {
            self.voice_vosk.phrases = default_voice_vosk_phrases();
        }
        if self.voice_vosk.target_key.trim().is_empty() {
            self.voice_vosk.target_key = default_voice_vosk_target_key();
        }
        if self.voice_vosk.cooldown_ms < 200 {
            self.voice_vosk.cooldown_ms = default_voice_vosk_cooldown_ms();
        }
        if self.voice_vosk.model_preset == "auto" {
            self.voice_vosk.model_preset = "cn-light".to_string();
        }
        if self.voice_vosk.model_preset.trim().is_empty()
            || (self.voice_vosk.model_preset != "custom"
                && vosk_preset_model_path(&self.voice_vosk.model_preset).is_none())
        {
            self.voice_vosk.model_preset = default_voice_vosk_model_preset();
            self.voice_vosk.phrases = default_voice_vosk_phrases_cn();
        }
        if self.voice_vosk.model_preset != "custom" {
            if let Some(path) = vosk_preset_model_path(&self.voice_vosk.model_preset) {
                self.voice_vosk.model_path = path.to_string();
            }
        } else if self.voice_vosk.model_path.trim().is_empty() {
            self.voice_vosk.model_path = default_voice_vosk_model_path();
        }
        if self
            .voice_end
            .phrases_zh
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.phrases_zh = default_voice_end_phrases_zh();
        }
        if self
            .voice_end
            .phrases_en
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.phrases_en = default_voice_end_phrases_en();
        }
        if self.voice_end.commit_key.trim().is_empty() {
            self.voice_end.commit_key = default_voice_end_commit_key();
        }
        if self.voice_end.target_key.trim().is_empty() {
            self.voice_end.target_key = default_voice_end_target_key();
        }
        if self.voice_end.commit_delay_ms < 1000 {
            self.voice_end.commit_delay_ms = default_voice_end_commit_delay_ms();
        } else if self.voice_end.commit_delay_ms > 10000 {
            self.voice_end.commit_delay_ms = 10000;
        }
        if self.voice_end.dictation_timeout_ms < 10000 {
            self.voice_end.dictation_timeout_ms = default_voice_end_dictation_timeout_ms();
        }
        if self.key_wake_sound_enabled && !self.sounds.key_wake.enabled {
            self.sounds.key_wake.enabled = true;
        }
        self.sounds.normalize();
        for (i, m) in self.mappings.iter_mut().enumerate() {
            if m.id.is_empty() {
                m.id = new_mapping_id();
            }
            m.trigger_key = canonical_trigger(&m.trigger_key);
            apply_autotrigger_source(m);
            ensure_autotrigger_bindings(m);
            if m.source_key.trim().is_empty() {
                m.source_key = m
                    .trigger_source
                    .as_ref()
                    .and_then(|s| s.raw_events.first())
                    .map(|r| canonical_trigger(&r.hotkey))
                    .unwrap_or_else(|| m.trigger_key.clone());
            }
            if m.source_time.trim().is_empty() {
                m.source_time = String::new();
            }
            if m.group.is_empty() {
                m.group = default_group();
            }
            m.order = i as u32;
            if m.target_key.is_empty() {
                m.target_key = "RAlt".into();
            }
            if m.interval_ms < 200 {
                m.interval_ms = self.interval_ms;
            }
            if m.enter_delay_ms < 1000 {
                m.enter_delay_ms = self.enter_delay_ms;
            }
            if m.trigger_mode == TriggerMode::Toggle {
                m.trigger_mode = TriggerMode::Tap;
            }
        }
        self.mappings.sort_by_key(|m| m.order);
    }

    /// 在同一 canonical trigger 的已完成方案间轮换 enabled；返回 (from_id, to_id)。
    pub fn cycle_scheme_same_trigger(&mut self) -> Option<(String, String)> {
        let active = self
            .mappings
            .iter()
            .find(|m| m.enabled && is_mapping_complete(m))?;
        let trigger = canonical_trigger(&active.trigger_key);
        let mut siblings: Vec<&MappingEntry> = self
            .mappings
            .iter()
            .filter(|m| is_mapping_complete(m) && canonical_trigger(&m.trigger_key) == trigger)
            .collect();
        if siblings.len() < 2 {
            return None;
        }
        siblings.sort_by_key(|m| m.order);
        let from_id = active.id.clone();
        let pos = siblings.iter().position(|m| m.id == from_id)?;
        let next = siblings[(pos + 1) % siblings.len()];
        let to_id = next.id.clone();
        self.select_scheme(&to_id)
    }

    /// 直接切换到指定方案；返回 (from_id, to_id)。
    pub fn select_scheme(&mut self, target_id: &str) -> Option<(String, String)> {
        let target = self.find_mapping_by_id(target_id)?;
        if !is_mapping_complete(target) {
            return None;
        }
        let from_id = self
            .mappings
            .iter()
            .find(|m| m.enabled && is_mapping_complete(m))
            .map(|m| m.id.clone())
            .unwrap_or_default();
        if from_id == target_id {
            return None;
        }
        let trigger = canonical_trigger(&target.trigger_key);
        for m in &mut self.mappings {
            if m.id != target_id && canonical_trigger(&m.trigger_key) == trigger {
                m.enabled = false;
            }
        }
        self.enable_mapping(target_id);
        Some((from_id, target_id.to_string()))
    }

    /// 所有方案的切换快捷键 (combo, mapping_id)。
    pub fn switch_bindings(&self) -> Vec<(String, String)> {
        let mut out = Vec::new();
        for m in &self.mappings {
            if !is_mapping_complete(m) {
                continue;
            }
            for key in &m.switch_keys {
                let k = key.trim();
                if !k.is_empty() {
                    out.push((k.to_string(), m.id.clone()));
                }
            }
        }
        out
    }

    pub fn mapping_ids(&self) -> HashSet<String> {
        self.mappings.iter().map(|m| m.id.clone()).collect()
    }

    pub fn active_mappings(&self) -> Vec<&MappingEntry> {
        let mut out: Vec<_> = self.mappings.iter().filter(|m| m.enabled).collect();
        out.sort_by_key(|m| m.order);
        out
    }

    pub fn find_mapping_by_id(&self, id: &str) -> Option<&MappingEntry> {
        self.mappings.iter().find(|m| m.id == id)
    }

    pub fn find_mapping_by_physical(&self, physical_key: &str) -> Option<&MappingEntry> {
        self.find_mapping_for_event(&crate::press_gesture::PhysicalKeyEvent {
            is_keyup: false,
            device: None,
            key: physical_key.to_string(),
        })
    }

    pub fn find_mapping_for_event(
        &self,
        event: &crate::press_gesture::PhysicalKeyEvent,
    ) -> Option<&MappingEntry> {
        let canonical = canonical_trigger(&event.key);
        for m in self.active_mappings() {
            if !mapping_matches_device(m, event.device.as_deref()) {
                continue;
            }
            if canonical_trigger(&m.trigger_key) == canonical {
                return Some(m);
            }
            for pb in mapping_physical_bindings(m) {
                if pb == event.key || pb == canonical {
                    return Some(m);
                }
            }
        }
        None
    }

    pub fn bindings(&self) -> Vec<String> {
        let mut out = Vec::new();
        for m in self.active_mappings() {
            for pb in effective_physical_bindings(m) {
                if !out.contains(&pb) {
                    out.push(pb);
                }
            }
        }
        out
    }

    pub fn conflicts_on_enable(&self, id: &str) -> Vec<Conflict> {
        let Some(entry) = self.find_mapping_by_id(id) else {
            return vec![];
        };
        let canonical = canonical_trigger(&entry.trigger_key);
        let physical: HashSet<String> = mapping_physical_bindings(entry).into_iter().collect();
        let mut conflicts = Vec::new();

        for other in self.mappings.iter().filter(|m| m.enabled && m.id != id) {
            let other_canonical = canonical_trigger(&other.trigger_key);
            if other_canonical == canonical {
                conflicts.push(Conflict {
                    kind: ConflictKind::CanonicalTrigger,
                    other_id: other.id.clone(),
                    detail: format!(
                        "{other_canonical} is already used by {}",
                        other.display_label()
                    ),
                });
            }
            for pb in mapping_physical_bindings(other) {
                if physical.contains(&pb) {
                    conflicts.push(Conflict {
                        kind: ConflictKind::PhysicalKey,
                        other_id: other.id.clone(),
                        detail: format!(
                            "physical key {pb} is already used by {}",
                            other.display_label()
                        ),
                    });
                    break;
                }
            }
        }
        conflicts
    }

    ///                    ?mapping id    ?
    pub fn enable_mapping(&mut self, id: &str) -> Vec<String> {
        let conflicts = self.conflicts_on_enable(id);
        let mut disabled = Vec::new();
        for c in conflicts {
            if let Some(other) = self.mappings.iter_mut().find(|m| m.id == c.other_id) {
                if other.enabled {
                    other.enabled = false;
                    disabled.push(other.id.clone());
                }
            }
        }
        if let Some(entry) = self.mappings.iter_mut().find(|m| m.id == id) {
            entry.enabled = true;
        }
        disabled
    }

    pub fn disable_mapping(&mut self, id: &str) {
        if let Some(entry) = self.mappings.iter_mut().find(|m| m.id == id) {
            entry.enabled = false;
        }
    }

    ///                   ?`conflicts_on_enable`        ?
    pub fn conflict_report(&self) -> Vec<ConflictReport> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for m in &self.mappings {
            for c in self.conflicts_on_enable(&m.id) {
                let (a, b) = if m.id < c.other_id {
                    (m.id.as_str(), c.other_id.as_str())
                } else {
                    (c.other_id.as_str(), m.id.as_str())
                };
                let key = format!("{a}|{b}|{}", c.kind.as_str());
                if seen.insert(key) {
                    out.push(ConflictReport {
                        mapping_id: m.id.clone(),
                        other_id: c.other_id.clone(),
                        kind: c.kind.as_str().into(),
                        detail: c.detail.clone(),
                    });
                }
            }
        }
        out
    }

    pub fn conflicts_for_mapping(&self, id: &str) -> Vec<ConflictReport> {
        self.conflicts_on_enable(id)
            .into_iter()
            .map(|c| ConflictReport {
                mapping_id: id.to_string(),
                other_id: c.other_id,
                kind: c.kind.as_str().into(),
                detail: c.detail,
            })
            .collect()
    }
}

static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn config_candidate_paths() -> Vec<PathBuf> {
    [
        directories::ProjectDirs::from("com", "onetone", "app")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("com", "onetone", "onetone")
            .map(|d| d.config_dir().join("settings.json")),
        // Legacy oneTone branding (pre-com.onetone.* layout)
        directories::ProjectDirs::from("", "oneTone", "app")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("", "oneTone", "oneTone")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("com", "oneTone", "oneTone")
            .map(|d| d.config_dir().join("settings.json")),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn canonical_config_path() -> PathBuf {
    config_candidate_paths()
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("settings.json"))
}

fn resolve_config_path() -> PathBuf {
    let canonical = canonical_config_path();
    let mut best: Option<(PathBuf, VoiceConfig, usize)> = None;

    let mut consider = |path: PathBuf, cfg: VoiceConfig| {
        let score = cfg.mappings.len()
            + if cfg.voice_vosk.enabled { 4 } else { 0 }
            + if cfg.voice_sapi.enabled { 4 } else { 0 }
            + if cfg.voice_end.enabled { 4 } else { 0 };
        if best
            .as_ref()
            .is_none_or(|(_, _, prev_score)| score > *prev_score)
        {
            best = Some((path, cfg, score));
        }
    };

    for path in config_candidate_paths() {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(path, cfg);
            }
        }
    }

    if let Some(voice_pilot_dirs) =
        directories::ProjectDirs::from("com", "VoicePilot", "Voice Pilot")
    {
        let legacy_vp = voice_pilot_dirs.config_dir().join("settings.json");
        if legacy_vp.exists() {
            if let Ok(raw) = fs::read_to_string(&legacy_vp) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(legacy_vp, cfg);
            }
        }
    }

    for path in legacy_config_candidates() {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(path, cfg);
            }
        }
    }

    if let Some((source, cfg, _)) = best {
        if source != canonical {
            if let Some(parent) = canonical.parent() {
                fs::create_dir_all(parent).ok();
            }
            let json = serde_json::to_string_pretty(&cfg).unwrap();
            if fs::write(&canonical, json).is_ok() {
                return canonical;
            }
        }
        return source;
    }

    canonical
}

pub fn config_path() -> PathBuf {
    CONFIG_PATH.get_or_init(resolve_config_path).clone()
}

/// Apply a frontend mapping save. Voice sections always stay from `existing` because
/// toggles are persisted only via voice IPC commands (`cmd_voice_vosk_set_enabled`, etc.).
pub fn merge_save_payload(existing: &VoiceConfig, json: &str) -> Option<VoiceConfig> {
    let mut cfg: VoiceConfig = serde_json::from_str(json).ok()?;
    cfg.voice_vosk = existing.voice_vosk.clone();
    cfg.voice_sapi = existing.voice_sapi.clone();
    cfg.voice_end = existing.voice_end.clone();
    Some(cfg)
}

fn legacy_config_candidates() -> Vec<PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    vec![
        exe_dir.join("voice_input_settings.json"),
        exe_dir.join("settings.json"),
        PathBuf::from("voice_input_settings.json"),
        PathBuf::from("settings.json"),
        PathBuf::from("../voice_input_settings.json"),
    ]
}

pub fn load_config() -> VoiceConfig {
    let path = config_path();
    let mut cfg = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default(),
        Err(_) => VoiceConfig::default(),
    };
    cfg.migrate();
    cfg
}

pub fn save_config(cfg: &VoiceConfig) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(cfg).unwrap();
    fs::write(&path, json).ok();
}

pub fn apply_config(state: &AppState, cfg: &VoiceConfig) {
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.bind_all(&cfg.bindings());
        mgr.bind_scheme_select(cfg.switch_bindings());
        let switch_key = cfg.scheme_switch_key.trim();
        if switch_key.is_empty() {
            mgr.bind_scheme_switch(None);
        } else {
            mgr.bind_scheme_switch(Some(switch_key.to_string()));
        }
    }
    state.machine_pool.lock().prune(&cfg.mapping_ids());
}

pub fn start_watcher(state: Arc<AppState>, window: tauri::WebviewWindow) {
    let path = config_path();
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_)) {
                    tx.send(()).ok();
                }
            }
        })
        .ok();

        if let Some(w) = &mut watcher {
            if let Some(parent) = path.parent() {
                w.watch(parent, RecursiveMode::NonRecursive).ok();
            }
            loop {
                if rx.recv_timeout(Duration::from_millis(500)).is_ok() {
                    let mut new_cfg = load_config();
                    new_cfg.migrate();
                    {
                        *state.cfg.lock() = new_cfg.clone();
                    }
                    apply_config(&state, &new_cfg);
                    let payload = ipc::mvp_init_payload(&state, "unchanged");
                    ipc::emit_to_js_main(&window, payload);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrate_v2_to_v3() {
        let mut cfg = VoiceConfig {
            version: 2,
            record_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            mappings: vec![],
            ..Default::default()
        };
        cfg.migrate();
        assert_eq!(cfg.version, 5);
        assert_eq!(cfg.mappings.len(), 1);
        assert_eq!(cfg.mappings[0].trigger_key, "AutoTrigger");
        assert_eq!(cfg.mappings[0].target_key, "F2");
    }

    #[test]
    fn physical_conflict_autotrigger_vs_volume_down() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings.push(MappingEntry {
            id: "a".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "Volume_Down".into(),
            target_key: "F2".into(),
            enabled: true,
            order: 1,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
        });
        let conflicts = cfg.conflicts_on_enable(&cfg.mappings[0].id);
        assert!(!conflicts.is_empty());
        assert!(matches!(conflicts[0].kind, ConflictKind::PhysicalKey));
    }

    #[test]
    fn enable_disables_conflicts() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
        });
        cfg.enable_mapping("b");
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn autotrigger_without_source_binds_volume_keys() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].trigger_source = None;
        cfg.mappings[0].source_key = "AutoTrigger".into();
        cfg.normalize();
        let bindings = mapping_physical_bindings(&cfg.mappings[0]);
        assert!(bindings.contains(&"Volume_Down".to_string()));
        assert!(bindings.contains(&"Volume_Up".to_string()));
        assert!(cfg.mappings[0].trigger_source.is_some());
    }

    #[test]
    fn cycle_scheme_same_trigger_rotates() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger → F2".into(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
        });
        let result = cfg.cycle_scheme_same_trigger();
        assert!(result.is_some());
        let (_, to_id) = result.unwrap();
        assert_eq!(to_id, "b");
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn mapping_bindings_follow_trigger_source() {
        let m = MappingEntry {
            id: "x".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            trigger_source: Some(TriggerSource {
                id: "source_captured".into(),
                label: "      ".into(),
                mode: "single_press".into(),
                grouping: "exact".into(),
                raw_events: vec![RawEvent {
                    device: "keyboard".into(),
                    key: "F1".into(),
                    code: "F1".into(),
                    location: 0,
                    event_type: "keydown".into(),
                    hotkey: "F1".into(),
                    label: "F1".into(),
                    button: None,
                }],
            }),
        };
        let bindings = mapping_physical_bindings(&m);
        assert_eq!(bindings, vec!["F1".to_string()]);
    }

    #[test]
    fn autotrigger_volume_capture_binds_both_directions() {
        let mut m = MappingEntry {
            id: "y6".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: String::new(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
        };
        apply_peripheral_autotrigger(&mut m, "Volume_Down");
        let bindings = mapping_physical_bindings(&m);
        assert_eq!(
            bindings,
            vec!["Volume_Down".to_string(), "Volume_Up".to_string()]
        );
    }

    #[test]
    fn select_scheme_by_id() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger → F2".into(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec!["Ctrl+Alt+1".into()],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
        });
        let result = cfg.select_scheme("b");
        assert!(result.is_some());
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn native_key_restore_skips_active_bindings() {
        let mut m = MappingEntry {
            id: "z".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: true,
        };
        apply_peripheral_autotrigger(&mut m, "Volume_Down");
        assert!(!mapping_physical_bindings(&m).is_empty());
        assert!(effective_physical_bindings(&m).is_empty());
    }

    #[test]
    fn switch_bindings_collects_per_mapping() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].switch_keys = vec!["Ctrl+Alt+1".into(), "Ctrl+Alt+2".into()];
        let bindings = cfg.switch_bindings();
        assert_eq!(bindings.len(), 2);
        assert!(bindings.iter().all(|(_, id)| id == &cfg.mappings[0].id));
    }
    #[test]
    fn merge_save_payload_preserves_voice_when_omitted() {
        let mut existing = VoiceConfig::default();
        existing.voice_vosk.enabled = true;
        existing.voice_end.enabled = true;
        let json = r#"{"version":5,"mappings":[],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.voice_vosk.enabled);
        assert!(merged.voice_end.enabled);
    }

    #[test]
    fn merge_save_payload_ignores_stale_frontend_voice_flags() {
        let mut existing = VoiceConfig::default();
        existing.voice_vosk.enabled = true;
        existing.voice_end.enabled = true;
        let json = r#"{"version":5,"mappings":[],"trash":[],"voiceVosk":{"enabled":false},"voiceEnd":{"enabled":false}}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.voice_vosk.enabled);
        assert!(merged.voice_end.enabled);
    }
}
