//! Tray menu V5 state model — segment types, assemble, segment patch IPC.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use onetone_logic::runtime_event::{kind, RuntimeEvent};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::{mapping_is_complete, TriggerMode, VoiceConfig};
use crate::runtime_event;
use crate::AppState;

const TRAY_MENU_LABEL: &str = "tray_menu";

fn segment_subs() -> &'static Mutex<HashMap<String, HashSet<String>>> {
    static SUBS: std::sync::OnceLock<Mutex<HashMap<String, HashSet<String>>>> =
        std::sync::OnceLock::new();
    SUBS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Top-level tray snapshot (global / mic / channels / event / deep_links).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    pub global: GlobalState,
    pub mic: MicState,
    pub channels: Vec<Channel>,
    pub event: Option<LastEvent>,
    pub deep_links: Vec<DeepLink>,
}

/// Listening / paused / error + which channels are active in the hero chips.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalState {
    /// `"listening"` | `"paused"` | `"error"`
    pub mode: String,
    pub active_channel_ids: Vec<String>,
}

/// Mic privacy row — independent of channel toggles.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicState {
    pub available: bool,
    pub muted: bool,
    pub device: String,
    /// Optional level; tray does not poll high-frequency samples.
    pub level: Option<f32>,
}

/// One of the four first-class channels (voice / keys / softPad / camera).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStat {
    pub label: String,
    pub value: String,
}

/// One of the four first-class channels (voice / keys / softPad / camera).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    /// `"voice"` | `"keys"` | `"softPad"` | `"camera"`
    pub id: String,
    pub name: String,
    pub enabled: bool,
    /// `"listening"` | `"standby"` | `"off"` | `"error"`
    pub state: String,
    /// Single-line meta, e.g. `"Vosk · 已就绪 · 唤醒词…"` or `"(未接入)"`.
    pub meta: String,
    /// e.g. `"main:voice"` — open main window deep link.
    pub deep_link: Option<String>,
    /// Inspector 2×2 stat cells (customizer only; tray row keeps `meta`).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stats: Vec<ChannelStat>,
}

/// Last runtime event card — aligned to [`RuntimeEvent`] fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastEvent {
    /// ← `RuntimeEvent.ts_ms`
    pub t: u64,
    /// `"voice"` | `"keys"` | `"softPad"` | `"camera"` when mapped.
    pub channel_id: Option<String>,
    /// ← `RuntimeEvent.message`
    pub text: String,
    /// `"sent"` | `"unsent"` | `"failed"` when mapped.
    pub outcome: Option<String>,
    /// Wire `kind` retained for debugging.
    pub kind: String,
    /// ← `RuntimeEvent.source`
    pub source: String,
}

/// Footer deep link into the main app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLink {
    pub id: String,
    pub label: String,
    /// e.g. `"main:home"` | `"main:settings"` | `"main:diagnose"`
    pub href: String,
}

pub fn assemble_tray_state(state: &AppState) -> TrayState {
    TrayState {
        global: assemble_global(state),
        mic: assemble_mic(state),
        channels: assemble_channels(state),
        event: assemble_event(state),
        deep_links: assemble_deep_links(),
    }
}

pub fn assemble_global(state: &AppState) -> GlobalState {
    let paused = *state.paused.lock();
    let engine = tray_voice_engine(&state.cfg.lock());
    let (_, voice_error) = tray_voice_state_and_error(state, engine);

    let mode = if paused {
        "paused".into()
    } else if !voice_error.trim().is_empty() {
        "error".into()
    } else {
        "listening".into()
    };

    let channels = assemble_channels(state);
    let active_channel_ids = channels
        .iter()
        .filter(|c| c.enabled && c.state != "off")
        .map(|c| c.id.clone())
        .collect();

    GlobalState {
        mode,
        active_channel_ids,
    }
}

pub fn assemble_mic(state: &AppState) -> MicState {
    let _ = state;
    #[cfg(windows)]
    {
        match crate::audio_win::get_default_capture_mute() {
            Ok(st) if st.available => MicState {
                available: true,
                muted: st.muted,
                device: "默认".into(),
                level: None,
            },
            Ok(_) | Err(_) => MicState {
                available: false,
                muted: false,
                device: "—".into(),
                level: None,
            },
        }
    }
    #[cfg(not(windows))]
    {
        MicState {
            available: false,
            muted: false,
            device: "—".into(),
            level: None,
        }
    }
}

pub fn assemble_channels(state: &AppState) -> Vec<Channel> {
    vec![
        assemble_voice_channel(state),
        assemble_keys_channel(state),
        assemble_soft_pad_channel(state),
        assemble_camera_channel(state),
    ]
}

pub fn assemble_event(state: &AppState) -> Option<LastEvent> {
    runtime_event::recent_runtime_events(state, 1)
        .first()
        .map(last_event_from_runtime)
}

pub fn assemble_deep_links() -> Vec<DeepLink> {
    vec![
        DeepLink {
            id: "main".into(),
            label: "主窗口".into(),
            href: "main:home".into(),
        },
        DeepLink {
            id: "settings".into(),
            label: "设置".into(),
            href: "main:settings".into(),
        },
        DeepLink {
            id: "diagnose".into(),
            label: "诊断".into(),
            href: "main:diagnose".into(),
        },
    ]
}

pub fn subscribe_segment(window_label: String, segment: String) {
    let mut subs = segment_subs().lock().expect("tray segment subs");
    subs.entry(window_label).or_default().insert(segment);
}

pub fn emit_segment_patch(app: &AppHandle, segment: &str, payload: serde_json::Value) {
    let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return;
    };
    if !menu_win.is_visible().unwrap_or(false) {
        return;
    }
    let label = menu_win.label().to_string();
    let subscribed = segment_subs()
        .lock()
        .expect("tray segment subs")
        .get(&label)
        .is_some_and(|set| set.contains(segment));
    if !subscribed {
        return;
    }
    let _ = menu_win.emit(
        "tray://patch",
        serde_json::json!({ "segment": segment, "payload": payload }),
    );
}

pub fn emit_tray_segment(app: &AppHandle, state: &AppState, segment: &str) {
    let payload = match segment_payload(state, segment) {
        Some(v) => v,
        None => return,
    };
    emit_segment_patch(app, segment, payload);
}

pub fn emit_tray_segments(app: &AppHandle, state: &AppState, segments: &[&str]) {
    for seg in segments {
        emit_tray_segment(app, state, seg);
    }
}

/// Push saved layout prefs to an open tray menu window (preview-only segment).
pub fn emit_tray_layout(app: &AppHandle, cfg: &crate::tray_customization::TrayCustomization) {
    let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return;
    };
    if !menu_win.is_visible().unwrap_or(false) {
        return;
    }
    let payload = serde_json::to_value(cfg).unwrap_or_else(|_| serde_json::json!({}));
    let _ = menu_win.emit("tray://layout", payload);
}

pub fn on_runtime_event_published(app: &AppHandle, state: &AppState, kind_str: &str) {
    emit_tray_segment(app, state, "event");
    if matches!(
        kind_str,
        kind::LISTEN_PAUSED
            | kind::LISTEN_RESUMED
            | kind::VOICE_STATE_CHANGED
            | kind::VOICE_ERROR
            | kind::VOICE_BOOTSTRAP
            | kind::VOICE_RESTART
            | kind::SCHEME_SWITCHED
            | kind::CONFIG_CHANGED
    ) {
        emit_tray_segments(app, state, &["global", "channels"]);
    }
}

pub fn segment_payload(state: &AppState, segment: &str) -> Option<serde_json::Value> {
    let value = match segment {
        "global" => serde_json::to_value(assemble_global(state)).ok()?,
        "mic" => serde_json::to_value(assemble_mic(state)).ok()?,
        "channels" => serde_json::to_value(assemble_channels(state)).ok()?,
        "event" => assemble_event(state).and_then(|e| serde_json::to_value(e).ok())?,
        _ => return None,
    };
    Some(value)
}

pub fn outcome_from_kind(kind_str: &str) -> Option<&'static str> {
    match kind_str {
        kind::VOICE_SEND_FAILED => Some("failed"),
        kind::INPUT_IGNORED | kind::INPUT_PARSE_MISS => Some("unsent"),
        kind::INPUT_CAPTURED
        | kind::VOICE_WAKE_TRIGGERED
        | kind::SESSION_ENDED
        | kind::END_PHRASE_MATCHED
        | kind::SEND_PHRASE_MATCHED => Some("sent"),
        _ => None,
    }
}

pub fn channel_id_from_kind(source: &str, kind_str: &str) -> Option<&'static str> {
    if source.starts_with("voice")
        || kind_str.starts_with("voice_")
        || matches!(
            kind_str,
            kind::VOICE_WAKE_TRIGGERED
                | kind::VOICE_SEND_FAILED
                | kind::VOICE_STATE_CHANGED
                | kind::VOICE_ERROR
                | kind::SESSION_STARTED
                | kind::SESSION_ENDED
                | kind::END_PHRASE_MATCHED
                | kind::SEND_PHRASE_MATCHED
                | kind::CANCEL_PHRASE_MATCHED
        )
    {
        return Some("voice");
    }
    if source == "input_ext"
        || kind_str.starts_with("input_")
        || matches!(kind_str, kind::INPUT_CAPTURED | kind::INPUT_IGNORED | kind::INPUT_PARSE_MISS)
    {
        return Some("keys");
    }
    if source == "shell_agent" || kind_str == kind::SHELL_AGENT_STATE_CHANGED {
        return Some("softPad");
    }
    None
}

pub fn last_event_from_runtime(ev: &RuntimeEvent) -> LastEvent {
    LastEvent {
        t: ev.ts_ms,
        channel_id: channel_id_from_kind(&ev.source, &ev.kind).map(str::to_string),
        text: ev.message.clone(),
        outcome: outcome_from_kind(&ev.kind).map(str::to_string),
        kind: ev.kind.clone(),
        source: ev.source.clone(),
    }
}

fn assemble_voice_channel(state: &AppState) -> Channel {
    let cfg = state.cfg.lock();
    let engine = tray_voice_engine(&cfg);
    let paused = *state.paused.lock();
    let (voice_state, voice_error) = tray_voice_state_and_error(state, engine);

    let enabled = engine != "off";
    let state_str = if !enabled {
        "off".into()
    } else if paused {
        "standby".into()
    } else if voice_state == "error" || !voice_error.trim().is_empty() {
        "error".into()
    } else if matches!(voice_state.as_str(), "listening" | "cooldown" | "triggered") {
        "listening".into()
    } else {
        "standby".into()
    };

    let meta = if !enabled {
        "(未接入)".into()
    } else {
        let engine_label = tray_engine_label(engine);
        let status = if !voice_error.trim().is_empty() {
            voice_error.trim().to_string()
        } else {
            voice_status_label(&voice_state).to_string()
        };
        format!("{engine_label} · {status}")
    };

    Channel {
        id: "voice".into(),
        name: "语音".into(),
        enabled,
        state: state_str,
        meta,
        deep_link: Some("main:voice".into()),
        stats: assemble_voice_stats(state, &cfg, engine, &voice_error),
    }
}

fn assemble_keys_channel(state: &AppState) -> Channel {
    let cfg = state.cfg.lock();
    let paused = *state.paused.lock();
    let active = tray_active_mapping(&cfg);

    let enabled = active.is_some_and(|m| !m.trigger_key.trim().is_empty());
    let state_str = if !enabled {
        "off".into()
    } else if paused {
        "standby".into()
    } else {
        "listening".into()
    };

    let meta = match active {
        Some(m) if !m.trigger_key.trim().is_empty() => {
            format!(
                "{} · {}",
                tray_friendly_key(&m.trigger_key),
                tray_mode_label(m.trigger_mode)
            )
        }
        _ => "(未接入)".into(),
    };

    Channel {
        id: "keys".into(),
        name: "按键".into(),
        enabled,
        state: state_str,
        meta,
        deep_link: Some("main:keys".into()),
        stats: assemble_keys_stats(state, active),
    }
}

fn assemble_soft_pad_channel(state: &AppState) -> Channel {
    let cfg = state.cfg.lock();
    let enabled = cfg
        .mappings
        .iter()
        .any(|m| m.codex_micro_pad.as_ref().is_some_and(|p| p.enabled));

    let visible = crate::codex_micro_overlay::soft_pad_overlay_visible();
    let state_str = if !enabled {
        "off".into()
    } else if visible {
        "listening".into()
    } else {
        "standby".into()
    };

    let meta = if !enabled {
        "(未接入)".into()
    } else if visible {
        "浮层可见".into()
    } else {
        "已启用".into()
    };

    Channel {
        id: "softPad".into(),
        name: "Soft Pad".into(),
        enabled,
        state: state_str,
        meta,
        deep_link: Some("main:softPad".into()),
        stats: assemble_soft_pad_stats(&cfg, visible),
    }
}

fn assemble_camera_channel(state: &AppState) -> Channel {
    let cfg = state.cfg.lock();
    let enabled = cfg.camera_prefs.enabled || cfg.sounds.camera_action.enabled;

    Channel {
        id: "camera".into(),
        name: "摄像头".into(),
        enabled,
        state: if enabled { "standby".into() } else { "off".into() },
        meta: if enabled {
            "已启用".into()
        } else {
            "(未接入)".into()
        },
        deep_link: Some("main:camera".into()),
        stats: assemble_camera_stats(&cfg.camera_prefs, enabled),
    }
}

fn channel_stat(label: &str, value: impl Into<String>) -> ChannelStat {
    ChannelStat {
        label: label.into(),
        value: value.into(),
    }
}

fn format_ago_ms(ts_ms: u64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(ts_ms);
    if ts_ms == 0 {
        return "—".into();
    }
    let s = now.saturating_sub(ts_ms) / 1000;
    if s < 5 {
        "刚刚".into()
    } else if s < 60 {
        format!("{s}s 前")
    } else {
        format!("{}m 前", s / 60)
    }
}

fn format_channel_event_stat(ev: Option<&LastEvent>) -> String {
    let Some(ev) = ev else {
        return "—".into();
    };
    let ago = format_ago_ms(ev.t);
    let outcome = match ev.outcome.as_deref() {
        Some("sent") => "已发送",
        Some("failed") => "失败",
        Some("unsent") => "未发送",
        _ => "",
    };
    if outcome.is_empty() {
        ago
    } else {
        format!("{ago} · {outcome}")
    }
}

fn recent_event_for_channel(state: &AppState, channel_id: &str) -> Option<LastEvent> {
    runtime_event::recent_runtime_events(state, 24)
        .into_iter()
        .map(|ev| last_event_from_runtime(&ev))
        .find(|ev| ev.channel_id.as_deref() == Some(channel_id))
}

fn tray_wake_phrase(cfg: &VoiceConfig) -> String {
    if let Some(m) = tray_active_mapping(cfg) {
        let ctx = crate::scene_config::SceneResolveContext {
            active_scene_id: &m.id,
        };
        if let Some(eff) = crate::scene_config::resolve_effective_scene(cfg, &ctx) {
            if let Some(p) = eff.wake_phrases.first() {
                return p.clone();
            }
        }
    }
    cfg.voice_vosk
        .phrases
        .first()
        .cloned()
        .unwrap_or_else(|| "—".into())
}

fn tray_soft_pad_mapping<'a>(cfg: &'a VoiceConfig) -> Option<&'a crate::config::MappingEntry> {
    if let Some(m) = tray_active_mapping(cfg) {
        if m.codex_micro_pad.is_some() {
            return Some(m);
        }
    }
    cfg.mappings
        .iter()
        .find(|m| m.codex_micro_pad.is_some())
}

fn tray_foreground_label() -> String {
    crate::app_identity::foreground_app_identity()
        .map(|i| {
            i.matched_preset_app_id
                .filter(|s| !s.is_empty())
                .unwrap_or(i.exe_name)
        })
        .unwrap_or_else(|| "—".into())
}

fn assemble_voice_stats(
    state: &AppState,
    cfg: &VoiceConfig,
    engine: &str,
    voice_error: &str,
) -> Vec<ChannelStat> {
    let voice_ev = recent_event_for_channel(state, "voice");
    vec![
        channel_stat("引擎", tray_engine_label(engine)),
        channel_stat("唤醒词", tray_wake_phrase(cfg)),
        channel_stat("最近事件", format_channel_event_stat(voice_ev.as_ref())),
        channel_stat(
            "错误",
            if voice_error.trim().is_empty() {
                "无".into()
            } else {
                voice_error.trim().to_string()
            },
        ),
    ]
}

fn assemble_keys_stats(
    state: &AppState,
    active: Option<&crate::config::MappingEntry>,
) -> Vec<ChannelStat> {
    let keys_ev = recent_event_for_channel(state, "keys");
    match active.filter(|m| !m.trigger_key.trim().is_empty()) {
        Some(m) => vec![
            channel_stat("触发键", tray_friendly_key(&m.trigger_key)),
            channel_stat("触发方式", tray_mode_label(m.trigger_mode)),
            channel_stat("当前习惯", m.display_label()),
            channel_stat("上次触发", format_channel_event_stat(keys_ev.as_ref())),
        ],
        None => vec![
            channel_stat("触发键", "—"),
            channel_stat("触发方式", "—"),
            channel_stat("当前习惯", "—"),
            channel_stat("上次触发", format_channel_event_stat(keys_ev.as_ref())),
        ],
    }
}

fn assemble_soft_pad_stats(cfg: &VoiceConfig, overlay_visible: bool) -> Vec<ChannelStat> {
    let m = tray_soft_pad_mapping(cfg);
    let (key_count, agent, overlay_on) = match m.and_then(|m| m.codex_micro_pad.as_ref().map(|p| (m, p))) {
        Some((mapping, pad)) => (
            pad.keys.len(),
            mapping.display_label(),
            pad.overlay_enabled,
        ),
        None => (0, "—".into(), false),
    };
    vec![
        channel_stat(
            "键位",
            if key_count > 0 {
                format!("{key_count} 个")
            } else {
                "—".into()
            },
        ),
        channel_stat("绑定 Agent", agent),
        channel_stat(
            "浮层",
            if overlay_visible {
                String::from("可见")
            } else if overlay_on {
                String::from("已启用")
            } else {
                String::from("隐藏")
            },
        ),
        channel_stat("前台", tray_foreground_label()),
    ]
}

fn assemble_camera_stats(prefs: &crate::config::CameraPrefs, enabled: bool) -> Vec<ChannelStat> {
    let device = if prefs.selected_device_id.trim().is_empty() {
        if enabled {
            "默认".into()
        } else {
            "—".into()
        }
    } else {
        prefs.selected_device_id.clone()
    };
    let presence = if prefs.presence_actions.enabled {
        String::from("开")
    } else {
        String::from("关")
    };
    let auto_mute = prefs
        .auto_mute
        .as_ref()
        .and_then(|v| v.get("enabled"))
        .and_then(|v| v.as_bool())
        .map(|on| if on { "开" } else { "关" })
        .unwrap_or("关")
        .to_string();
    vec![
        channel_stat("设备", device),
        channel_stat("Presence", presence),
        channel_stat("自动静音", auto_mute),
        channel_stat("权限", if enabled { String::from("已授权") } else { String::from("—") }),
    ]
}

fn tray_voice_engine(cfg: &VoiceConfig) -> &'static str {
    if cfg.voice_vosk.enabled {
        "vosk"
    } else if cfg.voice_sapi.enabled {
        "sapi"
    } else if cfg.voice_kws.enabled {
        "kws"
    } else {
        "off"
    }
}

fn tray_voice_state_and_error(state: &AppState, engine: &str) -> (String, String) {
    match engine {
        "vosk" => (
            state.voice_vosk_state.lock().clone(),
            state.voice_vosk_last_error.lock().clone(),
        ),
        "sapi" => (
            state.voice_sapi_state.lock().clone(),
            state.voice_sapi_last_error.lock().clone(),
        ),
        "kws" => (
            state.voice_kws_state.lock().clone(),
            state.voice_kws_last_error.lock().clone(),
        ),
        _ => ("off".into(), String::new()),
    }
}

fn tray_active_mapping<'a>(cfg: &'a VoiceConfig) -> Option<&'a crate::config::MappingEntry> {
    if !cfg.active_scene_id.is_empty() {
        if let Some(m) = cfg.find_mapping_by_id(&cfg.active_scene_id) {
            if mapping_is_complete(m) {
                return Some(m);
            }
        }
    }
    cfg.mappings
        .iter()
        .find(|m| m.enabled && mapping_is_complete(m))
        .or_else(|| cfg.mappings.iter().find(|m| mapping_is_complete(m)))
}

fn tray_friendly_key(key: &str) -> String {
    let k = key.trim();
    match k {
        "Volume_Down" | "VolumeDown" => "音量键".into(),
        "Volume_Up" | "VolumeUp" => "音量+".into(),
        "Volume_Mute" | "VolumeMute" => "静音键".into(),
        "AutoTrigger" => "自动".into(),
        "RAlt" | "Right Alt" | "RALT" => "右 Alt".into(),
        "LAlt" | "Left Alt" | "LALT" => "左 Alt".into(),
        "RCtrl" | "Right Ctrl" => "右 Ctrl".into(),
        "LCtrl" | "Left Ctrl" => "左 Ctrl".into(),
        "RShift" | "Right Shift" => "右 Shift".into(),
        "LShift" | "Left Shift" => "左 Shift".into(),
        _ => k.replace('_', " "),
    }
}

fn tray_mode_label(mode: TriggerMode) -> &'static str {
    match mode {
        TriggerMode::Tap => "智能连按",
        TriggerMode::PerPress => "每按即发",
        TriggerMode::LongPress => "长按",
        TriggerMode::Double => "双击",
    }
}

fn tray_engine_label(engine: &str) -> &'static str {
    match engine {
        "vosk" => "Vosk",
        "sapi" => "SAPI",
        "kws" => "KWS",
        _ => "关闭",
    }
}

fn voice_status_label(voice_state: &str) -> &'static str {
    match voice_state {
        "starting" | "stopping" => "启动中",
        "listening" | "cooldown" | "triggered" => "已就绪",
        "stopped" => "已停止",
        "error" => "出错",
        _ => "已就绪",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use onetone_logic::runtime_event::RuntimeEvent;

    #[test]
    fn last_event_from_runtime_copies_fields_and_maps_outcome() {
        let ev = RuntimeEvent {
            seq: 7,
            ts_ms: 1_700_000_000_000,
            source: "voice_vosk".into(),
            kind: kind::VOICE_SEND_FAILED.into(),
            message: "send failed".into(),
            payload: None,
        };
        let last = last_event_from_runtime(&ev);
        assert_eq!(last.t, 1_700_000_000_000);
        assert_eq!(last.text, "send failed");
        assert_eq!(last.kind, kind::VOICE_SEND_FAILED);
        assert_eq!(last.source, "voice_vosk");
        assert_eq!(last.outcome.as_deref(), Some("failed"));
        assert_eq!(last.channel_id.as_deref(), Some("voice"));
    }

    #[test]
    fn channel_id_from_kind_maps_voice_and_keys() {
        assert_eq!(
            channel_id_from_kind("voice_vosk", kind::VOICE_WAKE_TRIGGERED),
            Some("voice")
        );
        assert_eq!(
            channel_id_from_kind("input_ext", kind::INPUT_CAPTURED),
            Some("keys")
        );
        assert_eq!(channel_id_from_kind("listen", kind::LISTEN_PAUSED), None);
    }
}
