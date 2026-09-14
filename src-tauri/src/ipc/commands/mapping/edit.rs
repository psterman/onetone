use std::sync::Arc;

use serde::Deserialize;
use tauri::Emitter;

use crate::config::{Action, ConflictReport};
use crate::ipc::core::persist_and_rebind;
use crate::AppState;

#[tauri::command]
pub fn cmd_mapping_set_group(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    group: String,
) {
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.group = if group.trim().is_empty() {
                "  ".into()
            } else {
                group
            };
        }
    }
    persist_and_rebind(&state, &window, "mapping_group_set");
}

#[tauri::command]
pub fn cmd_mapping_set_source_key(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    source_key: String,
) {
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.source_key = source_key.trim().to_string();
            m.source_time = if m.source_key.is_empty() {
                String::new()
            } else {
                crate::config::now_source_time()
            };
        }
        cfg.normalize();
    }
    persist_and_rebind(&state, &window, "mapping_source_set");
    let ack = serde_json::json!({"type":"mvp_mapping_source_set","ok":true,"id":id,"sourceKey":source_key});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_conflicts(
    state: tauri::State<Arc<AppState>>,
    mapping_id: Option<String>,
) -> Vec<ConflictReport> {
    let cfg = state.cfg.lock();
    if let Some(id) = mapping_id {
        cfg.conflicts_for_mapping(&id)
    } else {
        cfg.conflict_report()
    }
}

/// Frontend payload shape: `{ type: "key", value: "Ctrl+Enter" }` /
/// `{ type: "text", value: "继续" }` / `{ type: "delay", ms: 200 }` /
/// `{ type: "open", kind: "file"|"folder"|"url", value: "…" }`.
/// Mirrors the on-disk schema exactly, so JSON roundtrip is lossless.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ActionPayload {
    Key { value: String },
    Text { value: String },
    Delay { ms: u32 },
    Open { kind: String, value: String },
}

impl From<ActionPayload> for Action {
    fn from(p: ActionPayload) -> Self {
        match p {
            ActionPayload::Key { value } => Action::Key { value },
            ActionPayload::Text { value } => Action::Text { value },
            ActionPayload::Delay { ms } => Action::Delay { ms },
            ActionPayload::Open { kind, value } => Action::Open { kind, value },
        }
    }
}

#[tauri::command]
pub fn cmd_mapping_set_target_actions(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    target_actions: Vec<ActionPayload>,
) {
    let converted: Vec<Action> = target_actions.into_iter().map(Action::from).collect();
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.target_actions = converted.clone();
            // Keep legacy `target_key` in sync with the first Key step so
            // completeness / conflict / single-key readers stay truthful.
            m.target_key = converted
                .iter()
                .find_map(|a| match a {
                    Action::Key { value } => {
                        let v = value.trim();
                        if v.is_empty() {
                            None
                        } else {
                            Some(v.to_string())
                        }
                    }
                    _ => None,
                })
                .unwrap_or_default();
        }
        cfg.normalize();
    }
    persist_and_rebind(&state, &window, "mapping_target_actions_set");
    let ack = serde_json::json!({
        "type": "mvp_mapping_target_actions_set",
        "ok": true,
        "id": id,
        "count": converted.len(),
    });
    window.emit("to_js", &ack).ok();
}
