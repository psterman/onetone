//! Action history IPC: list, record, clear, stats, AI analyze.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::action_history::{
    analyze_chat, analyze_optimization, analyze_summary, clear, record, stats_by_mapping, tail,
    ActionHistoryEntry,
};
use crate::AppState;

fn opt_str(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

#[tauri::command]
pub fn cmd_action_history_list(
    limit: Option<usize>,
    channel: Option<String>,
    mapping_id: Option<String>,
    before_ts: Option<u64>,
    hours: Option<u64>,
) -> serde_json::Value {
    let channel_ref = opt_str(channel);
    let mapping_ref = opt_str(mapping_id);
    let result = tail(
        limit.unwrap_or(50),
        channel_ref.as_deref(),
        mapping_ref.as_deref(),
        before_ts,
        hours,
    );
    serde_json::to_value(result).unwrap_or_else(|_| {
        serde_json::json!({ "entries": [], "hasMore": false, "error": "serialize failed" })
    })
}

#[tauri::command]
pub fn cmd_action_history_stats(hours: Option<u64>) -> serde_json::Value {
    serde_json::to_value(stats_by_mapping(hours)).unwrap_or_else(|_| {
        serde_json::json!({ "hours": hours.unwrap_or(168), "rows": [], "error": "serialize failed" })
    })
}

#[tauri::command]
pub fn cmd_action_history_record(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    channel: String,
    kind: String,
    status: String,
    summary: String,
    action_id: Option<String>,
    mapping_id: Option<String>,
    provider_id: Option<String>,
    slot_id: Option<String>,
    detail: Option<String>,
) -> serde_json::Value {
    let mut entry = ActionHistoryEntry::new(0, 0, channel, kind, status, summary);
    entry.action_id = action_id;
    entry.mapping_id = mapping_id;
    entry.provider_id = provider_id;
    entry.slot_id = slot_id;
    entry.detail = detail;
    let saved = record(entry);
    crate::action_history::emit_record_with_app(state.inner().as_ref(), &app, saved.clone());
    serde_json::to_value(saved).unwrap_or_else(|_| serde_json::json!({ "ok": false }))
}

#[tauri::command]
pub fn cmd_action_history_clear() -> serde_json::Value {
    clear();
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_action_history_analyze_summary(
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<String>,
) -> serde_json::Value {
    let mid = opt_str(mapping_id);
    serde_json::to_value(analyze_summary(hours, limit, mid.as_deref())).unwrap_or_else(|_| {
        serde_json::json!({ "ok": false, "reason": "serialize_failed" })
    })
}

#[tauri::command]
pub fn cmd_action_history_analyze_optimization(
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<String>,
) -> serde_json::Value {
    let mid = opt_str(mapping_id);
    serde_json::to_value(analyze_optimization(hours, limit, mid.as_deref())).unwrap_or_else(|_| {
        serde_json::json!({ "ok": false, "reason": "serialize_failed" })
    })
}

#[tauri::command]
pub fn cmd_action_history_analyze_chat(
    question: String,
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<String>,
) -> serde_json::Value {
    let mid = opt_str(mapping_id);
    serde_json::to_value(analyze_chat(&question, hours, limit, mid.as_deref())).unwrap_or_else(
        |_| serde_json::json!({ "ok": false, "reason": "serialize_failed" }),
    )
}
