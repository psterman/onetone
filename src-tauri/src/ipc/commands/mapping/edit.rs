use std::sync::Arc;

use tauri::Emitter;

use crate::config::ConflictReport;
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
