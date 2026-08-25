//! User action history — cross-channel record, persist, analyze.

pub mod analyze;
pub mod log;
pub mod model;
mod summary;

pub use analyze::{analyze_chat, analyze_optimization, analyze_summary, AnalyzeResult};
pub use log::{
    clear, log_path, recent_ring, record, stats_by_mapping, tail, ActionHistoryListResult,
    ActionHistoryStatsResult, MappingActionStats,
};
pub use model::ActionHistoryEntry;
pub use summary::{
    from_lane_nav, from_runtime_kind, from_semantic_route, from_send_key, mapping_label,
};

use tauri::AppHandle;

use crate::agent::route::SemanticRouteResult;
use crate::ipc::emit_to_main_if_available;
use crate::AppState;
use crate::runtime_event;
pub fn should_record_runtime_kind(kind: &str) -> bool {
    // Habit "usage" only — scheme switches are navigation noise, not using the habit.
    matches!(
        kind,
        runtime_event::kind::SESSION_STARTED
            | runtime_event::kind::SESSION_ENDED
            | runtime_event::kind::END_PHRASE_MATCHED
            | runtime_event::kind::SEND_PHRASE_MATCHED
            | runtime_event::kind::CANCEL_PHRASE_MATCHED
            | runtime_event::kind::VOICE_WAKE_TRIGGERED
            | "acoustic_voice_matched"
    )
}

pub fn record_semantic_route(
    state: &AppState,
    r: &SemanticRouteResult,
    slot_id: Option<&str>,
) -> ActionHistoryEntry {
    let entry = from_semantic_route(
        state,
        &r.action_id,
        &r.source_channel,
        r.mapping_id.as_deref(),
        r.provider_id.as_deref(),
        slot_id,
        r.status,
        r.detail.clone(),
    );
    record(entry)
}

pub fn record_send_key(state: &AppState, mapping_id: &str, target_key: &str, ok: bool) -> ActionHistoryEntry {
    let entry = from_send_key(state, mapping_id, target_key, ok);
    record(entry)
}

pub fn record_lane_nav(
    state: &AppState,
    mapping_id: &str,
    micro_key_id: &str,
    action: &str,
    ok: bool,
    detail: &str,
) -> ActionHistoryEntry {
    let entry = from_lane_nav(state, mapping_id, micro_key_id, action, ok, detail);
    record(entry)
}

pub fn record_runtime_mirror(
    state: &AppState,
    source: &str,
    kind: &str,
    message: &str,
) -> Option<ActionHistoryEntry> {
    if !should_record_runtime_kind(kind) {
        return None;
    }
    let mapping_id = {
        let cfg = state.cfg.lock();
        let id = cfg.active_scene_id.trim();
        if id.is_empty() {
            None
        } else {
            Some(id.to_string())
        }
    };
    let entry = from_runtime_kind(source, kind, message, mapping_id.as_deref())?;
    Some(record(entry))
}

pub fn emit_record(state: &AppState, app: Option<&AppHandle>, entry: ActionHistoryEntry) {
    if let Some(app) = app {
        let payload = serde_json::json!({
            "type": "mvp_action_history_event",
            "entry": entry,
        });
        let _ = emit_to_main_if_available(app, Some(state), payload);
    }
}

pub fn emit_record_with_app(state: &AppState, app: &AppHandle, entry: ActionHistoryEntry) {
    emit_record(state, Some(app), entry);
}
