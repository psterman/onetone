//! Human-readable summary builders (no user dictation text).

use crate::agent::semantic::semantic_meta_by_id;
use crate::config::VoiceConfig;
use crate::AppState;

use super::model::ActionHistoryEntry;

pub fn mapping_label(cfg: &VoiceConfig, mapping_id: Option<&str>) -> String {
    let Some(id) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return String::new();
    };
    cfg.mappings
        .iter()
        .find(|m| m.id == id)
        .map(|m| {
            if !m.label.trim().is_empty() {
                m.label.trim().to_string()
            } else if !m.group.trim().is_empty() {
                m.group.trim().to_string()
            } else {
                id.to_string()
            }
        })
        .unwrap_or_else(|| id.to_string())
}

fn action_label(action_id: &str) -> String {
    semantic_meta_by_id(action_id)
        .map(|m| m.label_zh.to_string())
        .unwrap_or_else(|| action_id.to_string())
}

fn channel_label(channel: &str) -> &'static str {
    match channel {
        "key" => "按键",
        "voice" => "语音",
        "softPad" => "SoftPad",
        "camera" => "摄像头",
        "system" => "系统",
        _ => "动作",
    }
}

pub fn from_semantic_route(
    state: &AppState,
    action_id: &str,
    source_channel: &str,
    mapping_id: Option<&str>,
    provider_id: Option<&str>,
    slot_id: Option<&str>,
    status: &str,
    detail: Option<String>,
) -> ActionHistoryEntry {
    let cfg = state.cfg.lock();
    let map_label = mapping_label(&cfg, mapping_id);
    let act_label = action_label(action_id);
    let summary = if map_label.is_empty() {
        format!(
            "{} · {}",
            channel_label(source_channel),
            act_label
        )
    } else {
        format!(
            "{} · {} · {}",
            channel_label(source_channel),
            map_label,
            act_label
        )
    };
    drop(cfg);

    let mut entry = ActionHistoryEntry::new(
        0,
        crate::runtime_event::now_ms(),
        source_channel,
        "semantic_action",
        status,
        summary,
    );
    entry.action_id = Some(action_id.to_string());
    entry.mapping_id = mapping_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    entry.provider_id = provider_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    entry.slot_id = slot_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    entry.detail = detail;
    entry
}

pub fn from_send_key(
    state: &AppState,
    mapping_id: &str,
    target_key: &str,
    ok: bool,
) -> ActionHistoryEntry {
    let cfg = state.cfg.lock();
    let map_label = mapping_label(&cfg, Some(mapping_id));
    drop(cfg);
    let summary = if map_label.is_empty() {
        format!("按键 · 发送 {target_key}")
    } else {
        format!("按键 · {map_label} · 发送 {target_key}")
    };
    let mut entry = ActionHistoryEntry::new(
        0,
        crate::runtime_event::now_ms(),
        "key",
        "send_key",
        if ok { "executed" } else { "failed" },
        summary,
    );
    entry.mapping_id = Some(mapping_id.to_string());
    entry.detail = Some(target_key.to_string());
    entry
}

pub fn from_lane_nav(
    state: &AppState,
    mapping_id: &str,
    micro_key_id: &str,
    action: &str,
    ok: bool,
    detail: &str,
) -> ActionHistoryEntry {
    let cfg = state.cfg.lock();
    let map_label = mapping_label(&cfg, Some(mapping_id));
    drop(cfg);
    let summary = if map_label.is_empty() {
        format!("SoftPad · Lane {action}")
    } else {
        format!("SoftPad · {map_label} · Lane {action}")
    };
    let mut entry = ActionHistoryEntry::new(
        0,
        crate::runtime_event::now_ms(),
        "softPad",
        "lane_nav",
        if ok { "executed" } else { "failed" },
        summary,
    );
    entry.mapping_id = Some(mapping_id.to_string());
    entry.detail = Some(format!("microKey={micro_key_id};{detail}"));
    entry
}

pub fn from_runtime_kind(
    source: &str,
    kind: &str,
    message: &str,
    mapping_id: Option<&str>,
) -> Option<ActionHistoryEntry> {
    let (channel, kind_tag, status, summary) = match kind {
        runtime_event::kind::SESSION_STARTED => (
            "voice",
            "session",
            "executed",
            format!("语音 · 听写开始 · {message}"),
        ),
        runtime_event::kind::SESSION_ENDED => (
            "voice",
            "session",
            "executed",
            format!("语音 · 听写结束 · {message}"),
        ),
        runtime_event::kind::END_PHRASE_MATCHED => (
            "voice",
            "voice_phrase",
            "executed",
            format!("语音 · 结束短语「{message}」"),
        ),
        runtime_event::kind::SEND_PHRASE_MATCHED => (
            "voice",
            "voice_phrase",
            "executed",
            format!("语音 · 发送短语「{message}」"),
        ),
        runtime_event::kind::CANCEL_PHRASE_MATCHED => (
            "voice",
            "voice_phrase",
            "executed",
            format!("语音 · 取消短语「{message}」"),
        ),
        runtime_event::kind::VOICE_WAKE_TRIGGERED => (
            "voice",
            "voice_phrase",
            "executed",
            format!("语音 · 唤醒 · {message}"),
        ),
        "acoustic_voice_matched" => (
            "voice",
            "voice_phrase",
            "executed",
            format!("语音 · 声学指令 · {message}"),
        ),
        runtime_event::kind::SCHEME_SWITCHED => (
            "system",
            "scheme_switch",
            "executed",
            format!("系统 · 切换习惯 · {message}"),
        ),
        _ => return None,
    };
    let _ = source;
    let mut entry = ActionHistoryEntry::new(
        0,
        crate::runtime_event::now_ms(),
        channel,
        kind_tag,
        status,
        summary,
    );
    entry.mapping_id = mapping_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    Some(entry)
}

use crate::runtime_event;
