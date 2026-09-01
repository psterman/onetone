//! Tray menu V5 state model — segment types, assemble, segment patch IPC.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use onetone_logic::runtime_event::{kind, RuntimeEvent};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_identity::{self, AppIdentity};
use crate::config::{mapping_is_complete, preset_app_display_name, TriggerMode, VoiceConfig};
use crate::runtime_event;
use crate::AppState;

const TRAY_MENU_LABEL: &str = "tray_menu";
/// Channel row meta when the feature is off in settings — not an external "plug-in" status.
const TRAY_CH_OFF_META: &str = "未启用";

fn segment_subs() -> &'static Mutex<HashMap<String, HashSet<String>>> {
    static SUBS: std::sync::OnceLock<Mutex<HashMap<String, HashSet<String>>>> =
        std::sync::OnceLock::new();
    SUBS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Cached mic row — filled by tray poll / mute IPC; never probe WASAPI on menu_ready (假死 UI).
static TRAY_MIC_CACHE: Mutex<Option<MicState>> = Mutex::new(None);

pub fn update_tray_mic_cache(st: &crate::audio_win::MicMuteState) {
    let mic = MicState {
        available: st.available,
        muted: st.muted,
        device: if st.available { "默认".into() } else { "—".into() },
        level: None,
    };
    if let Ok(mut g) = TRAY_MIC_CACHE.lock() {
        *g = Some(mic);
    }
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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub schemes: Vec<SchemeItem>,
}

/// Listening / paused / error + habit context for tray hero.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalState {
    /// `"listening"` | `"paused"` | `"error"` | `"silenced"`
    pub mode: String,
    pub active_channel_ids: Vec<String>,
    /// User-configured app scenario label — not OS foreground process name.
    pub user_label: String,
    pub active_habit_id: String,
    pub active_habit_label: String,
    pub next_habit_id: Option<String>,
    pub next_habit_label: Option<String>,
    pub today_total_count: u64,
    pub today_habit_count: u64,
    /// Last 7 calendar days usage (oldest → newest).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub week_trend: Vec<u64>,
    /// Per-channel action counts in the last 24h (active habit scope when set).
    #[serde(default, skip_serializing_if = "TodayByChannel::is_empty")]
    pub today_by_channel: TodayByChannel,
    /// OS foreground process — debug/diagnose only; omitted from tray HTML by default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreground_os_debug: Option<String>,
    /// Live foreground app label captured when the tray menu opens (before menu steals focus).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreground_label: Option<String>,
    /// Remaining silence ms when mode is `silenced`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub silence_remaining_ms: Option<u64>,
}

/// Per-channel 24h usage for tray habit panel.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TodayByChannel {
    #[serde(default)]
    pub voice: u64,
    #[serde(default)]
    pub keys: u64,
    #[serde(default)]
    pub soft_pad: u64,
    #[serde(default)]
    pub camera: u64,
}

impl TodayByChannel {
    fn is_empty(&self) -> bool {
        self.voice == 0 && self.keys == 0 && self.soft_pad == 0 && self.camera == 0
    }
}

/// One habit row for tray scheme picker (P1 segment).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemeItem {
    pub id: String,
    pub label: String,
    pub is_active: bool,
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
    /// Single-line meta, e.g. `"Vosk · 已就绪 · 唤醒词…"` or `"未启用"`.
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
    assemble_tray_state_inner(state, None)
}

pub fn assemble_tray_menu_state(state: &AppState, open_fg: Option<&AppIdentity>) -> TrayState {
    assemble_tray_state_inner(state, open_fg)
}

fn assemble_tray_state_inner(state: &AppState, open_fg: Option<&AppIdentity>) -> TrayState {
    let channels = assemble_channels(state);
    TrayState {
        global: assemble_global_with_fg(state, open_fg, &channels),
        mic: assemble_mic(state),
        channels,
        event: assemble_event(state),
        deep_links: assemble_deep_links(),
        schemes: assemble_schemes(state),
    }
}

pub fn assemble_global(state: &AppState) -> GlobalState {
    let channels = assemble_channels(state);
    assemble_global_with_fg(state, None, &channels)
}

fn assemble_global_with_fg(
    state: &AppState,
    open_fg: Option<&AppIdentity>,
    channels: &[Channel],
) -> GlobalState {
    let paused = *state.paused.lock();
    let silence_until = *state.listen_silence_until_ms.lock();
    let now_ms = crate::runtime_event::now_ms();
    let silenced = silence_until.is_some_and(|until| until > now_ms);
    let silence_remaining_ms = silence_until.and_then(|until| {
        if until > now_ms {
            Some(until - now_ms)
        } else {
            None
        }
    });

    let engine = tray_voice_engine(&state.cfg.lock());
    let (_, voice_error) = tray_voice_state_and_error(state, engine);

    let mode = if silenced {
        "silenced".into()
    } else if paused {
        "paused".into()
    } else if !voice_error.trim().is_empty() {
        "error".into()
    } else {
        "listening".into()
    };

    let (
        user_label,
        active_habit_id,
        active_habit_label,
        next_habit_id,
        next_habit_label,
        today_total_count,
        today_habit_count,
        today_by_channel,
    ) = {
        let cfg = state.cfg.lock();
        let active = tray_active_mapping(&cfg);
        let active_habit_id = active.map(|m| m.id.clone()).unwrap_or_default();
        let active_habit_label = active
            .map(|m| m.display_label())
            .unwrap_or_else(|| "—".into());
        let user_label = tray_user_label(active);
        let (next_habit_id, next_habit_label) = match cfg.peek_next_scheme_same_trigger() {
            Some((_, to_id)) => {
                let label = cfg
                    .find_mapping_by_id(&to_id)
                    .map(|m| m.display_label())
                    .unwrap_or_else(|| to_id.clone());
                (Some(to_id), Some(label))
            }
            None => (None, None),
        };
        let (today_total_count, today_habit_count, today_by_channel) =
            tray_today_stats(&active_habit_id);
        (
            user_label,
            active_habit_id,
            active_habit_label,
            next_habit_id,
            next_habit_label,
            today_total_count,
            today_habit_count,
            today_by_channel,
        )
    };

    let week_trend = crate::action_history::usage_counts_last_days(7);
    let active_channel_ids = channels
        .iter()
        .filter(|c| c.enabled && c.state != "off")
        .map(|c| c.id.clone())
        .collect();

    #[cfg(debug_assertions)]
    let foreground_os_debug = Some(tray_foreground_label());
    #[cfg(not(debug_assertions))]
    let foreground_os_debug: Option<String> = None;

    let foreground_label = open_fg.map(app_identity::identity_display_name);

    GlobalState {
        mode,
        active_channel_ids,
        user_label,
        active_habit_id,
        active_habit_label,
        next_habit_id,
        next_habit_label,
        today_total_count,
        today_habit_count,
        week_trend,
        today_by_channel,
        foreground_os_debug,
        foreground_label,
        silence_remaining_ms,
    }
}

pub fn assemble_mic(state: &AppState) -> MicState {
    let _ = state;
    if let Ok(g) = TRAY_MIC_CACHE.lock() {
        if let Some(ref m) = *g {
            return m.clone();
        }
    }
    // ponytail: WASAPI on menu_ready blocked the UI thread — poll/mute IPC fills cache.
    MicState {
        available: true,
        muted: false,
        device: "默认".into(),
        level: None,
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
            id: "habits".into(),
            label: "我的习惯".into(),
            href: "main:habits".into(),
        },
        DeepLink {
            id: "settings".into(),
            label: "设置".into(),
            href: "main:settings".into(),
        },
    ]
}

pub fn assemble_schemes(state: &AppState) -> Vec<SchemeItem> {
    let cfg = state.cfg.lock();
    let active_id = cfg.active_scene_id.clone();
    let mut items: Vec<SchemeItem> = cfg
        .mappings
        .iter()
        .filter(|m| mapping_is_complete(m))
        .map(|m| SchemeItem {
            id: m.id.clone(),
            label: m.display_label(),
            is_active: m.id == active_id,
        })
        .collect();
    items.sort_by(|a, b| a.label.cmp(&b.label));
    items
}

pub fn subscribe_segment(window_label: String, segment: String) {
    let mut subs = segment_subs().lock().expect("tray segment subs");
    subs.entry(window_label).or_default().insert(segment);
}

pub fn emit_segment_patch(app: &AppHandle, segment: &str, payload: serde_json::Value) {
    let labels: Vec<String> = {
        let subs = segment_subs().lock().expect("tray segment subs");
        subs.iter()
            .filter(|(_, set)| set.contains(segment))
            .map(|(label, _)| label.clone())
            .collect()
    };
    let body = serde_json::json!({ "segment": segment, "payload": payload });
    for label in labels {
        let Some(win) = app.get_webview_window(&label) else {
            continue;
        };
        if label == TRAY_MENU_LABEL && !win.is_visible().unwrap_or(false) {
            continue;
        }
        let _ = win.emit("tray://patch", body.clone());
    }
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
    let payload = serde_json::to_value(cfg).unwrap_or_else(|_| serde_json::json!({}));
    for label in [TRAY_MENU_LABEL, "main"] {
        let Some(win) = app.get_webview_window(label) else {
            continue;
        };
        if label == TRAY_MENU_LABEL && !win.is_visible().unwrap_or(false) {
            continue;
        }
        let _ = win.emit("tray://layout", payload.clone());
    }
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
        emit_tray_segments(app, state, &["global", "channels", "schemes"]);
    }
}

pub fn segment_payload(state: &AppState, segment: &str) -> Option<serde_json::Value> {
    let value = match segment {
        "global" => {
            let open_fg = crate::tray::tray_open_foreground();
            let channels = assemble_channels(state);
            serde_json::to_value(assemble_global_with_fg(state, open_fg.as_ref(), &channels)).ok()?
        }
        "mic" => serde_json::to_value(assemble_mic(state)).ok()?,
        "channels" => serde_json::to_value(assemble_channels(state)).ok()?,
        "event" => assemble_event(state).and_then(|e| serde_json::to_value(e).ok())?,
        "schemes" => serde_json::to_value(assemble_schemes(state)).ok()?,
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
        TRAY_CH_OFF_META.into()
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
        _ => TRAY_CH_OFF_META.into(),
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
        TRAY_CH_OFF_META.into()
    } else if visible {
        "浮层可见".into()
    } else {
        "已启用".into()
    };

    Channel {
        id: "softPad".into(),
        name: "小键盘".into(),
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
            TRAY_CH_OFF_META.into()
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

fn tray_user_label(mapping: Option<&crate::config::MappingEntry>) -> String {
    let Some(m) = mapping else {
        return "—".into();
    };
    let app_id = m.app_target_id.trim();
    if !app_id.is_empty() {
        if let Some(name) = preset_app_display_name(app_id) {
            return name.to_string();
        }
    }
    let group = m.group.trim();
    if !group.is_empty() {
        return group.to_string();
    }
    "—".into()
}

fn tray_today_stats(active_habit_id: &str) -> (u64, u64, TodayByChannel) {
    let stats = crate::action_history::stats_by_mapping(Some(24));
    let total: u64 = stats.rows.iter().map(|r| r.count).sum();
    let habit = if active_habit_id.trim().is_empty() {
        0
    } else {
        stats
            .rows
            .iter()
            .find(|r| r.mapping_id == active_habit_id)
            .map(|r| r.count)
            .unwrap_or(0)
    };
    let mut by_channel = TodayByChannel::default();
    let rows: Vec<_> = if active_habit_id.trim().is_empty() {
        stats.rows.iter().collect()
    } else {
        stats
            .rows
            .iter()
            .filter(|r| r.mapping_id == active_habit_id)
            .collect()
    };
    for row in rows {
        for (ch, n) in &row.by_channel {
            match ch.as_str() {
                "voice" => by_channel.voice += n,
                "key" | "keys" => by_channel.keys += n,
                "softPad" | "soft_pad" => by_channel.soft_pad += n,
                "camera" => by_channel.camera += n,
                _ => {}
            }
        }
    }
    (total, habit, by_channel)
}

/// Lightweight usage snapshot for habit hub value card (no full TrayState).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayUsageSummary {
    pub today_total_count: u64,
    pub today_habit_count: u64,
    pub active_habit_id: String,
    pub active_habit_label: String,
    pub week_trend: Vec<u64>,
}

pub fn assemble_usage_summary(state: &AppState) -> TrayUsageSummary {
    let cfg = state.cfg.lock();
    let active = tray_active_mapping(&cfg);
    let active_habit_id = active.map(|m| m.id.clone()).unwrap_or_default();
    let active_habit_label = active
        .map(|m| m.display_label())
        .unwrap_or_else(|| "—".into());
    let (today_total_count, today_habit_count, _) = tray_today_stats(&active_habit_id);
    let week_trend = crate::action_history::usage_counts_last_days(7);
    TrayUsageSummary {
        today_total_count,
        today_habit_count,
        active_habit_id,
        active_habit_label,
        week_trend,
    }
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
    use crate::config::VoiceConfig;
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

    #[test]
    fn tray_user_label_prefers_preset_app_display_name() {
        let mut m = VoiceConfig::default().mappings.remove(0);
        m.app_target_id = "cursor-chat".into();
        assert_eq!(tray_user_label(Some(&m)), "Cursor");
    }

    #[test]
    fn tray_user_label_falls_back_to_group() {
        let mut m = VoiceConfig::default().mappings.remove(0);
        m.group = "我的工作流".into();
        assert_eq!(tray_user_label(Some(&m)), "我的工作流");
    }

    #[test]
    fn assemble_deep_links_has_habits_entry() {
        let links = assemble_deep_links();
        let habits = links.iter().find(|l| l.id == "habits").expect("habits link");
        assert_eq!(habits.label, "我的习惯");
        assert_eq!(habits.href, "main:habits");
        assert!(!links.iter().any(|l| l.href == "main:diagnose"));
    }
}
