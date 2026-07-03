use std::sync::Arc;

use crate::ipc::core::{build_runtime_snapshot, emit_to_js_main, mvp_init_payload, push_runtime};
use crate::AppState;

#[tauri::command]
pub fn cmd_ready(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    backdrop_mode: Option<String>,
) -> serde_json::Value {
    crate::app_log::log_line(&state, "ipc", "cmd_ready begin");
    let mode = backdrop_mode.unwrap_or_else(|| "unchanged".into());
    let payload = mvp_init_payload(&state, &mode);
    emit_to_js_main(&window, payload.clone());
    push_runtime(&state, &window, "config_push", "");
    crate::app_log::log_line(&state, "ipc", "cmd_ready complete");
    payload
}

#[tauri::command]
pub fn cmd_request_runtime(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    let snapshot = build_runtime_snapshot(&app, &state);
    push_runtime(&state, &window, "runtime_refresh", "");
    snapshot
}
