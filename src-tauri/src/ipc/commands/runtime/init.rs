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

/// Full voice* status snapshot — must not run on the UI/IPC pump (sync build 假死'd
/// idle enhanced / voiceWake ~5s via deferredVoiceBoot + focus refresh).
#[tauri::command]
pub async fn cmd_request_runtime(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    let state_arc = Arc::clone(state.inner());
    let app_clone = app.clone();
    let join = tauri::async_runtime::spawn_blocking(move || {
        crate::ui_heartbeat::note_ipc_enter("request_runtime");
        let snapshot = build_runtime_snapshot(&app_clone, &state_arc);
        crate::ui_heartbeat::note_ipc_exit("request_runtime");
        snapshot
    });
    let snapshot = match tokio::time::timeout(std::time::Duration::from_millis(2000), join).await {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => return Err(format!("request_runtime join: {e}")),
        Err(_) => return Err("request_runtime timeout".into()),
    };
    // Light runtime push only — snapshot return is enough for callers that need voice*.
    push_runtime(state.inner(), &window, "runtime_refresh", "");
    Ok(snapshot)
}
