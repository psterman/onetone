use std::sync::Arc;

use tauri::State;

use crate::ipc::{start_trigger_compat_probe, stop_trigger_compat_probe};
use crate::AppState;

#[tauri::command]
pub fn cmd_start_trigger_compat_probe(
    state: State<Arc<AppState>>,
    mapping_id: String,
) -> serde_json::Value {
    let id = mapping_id.trim();
    let reason = {
        let cfg = state.cfg.lock();
        if cfg.find_mapping_by_id(id).is_none() {
            "mapping_not_found"
        } else {
            let mapping = cfg.find_mapping_by_id(id).unwrap();
            let bindings = crate::config::hotkey_registration_bindings(mapping);
            if bindings.is_empty() {
                "empty_bindings"
            } else {
                ""
            }
        }
    };
    if !reason.is_empty() {
        return serde_json::json!({ "ok": false, "reason": reason });
    }
    let ok = start_trigger_compat_probe(state.inner(), id);
    serde_json::json!({ "ok": ok, "reason": if ok { "" } else { "start_failed" } })
}

#[tauri::command]
pub fn cmd_stop_trigger_compat_probe(state: State<Arc<AppState>>) {
    stop_trigger_compat_probe(state.inner());
}
