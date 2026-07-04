use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::ipc::core::{push_runtime, sync_config_ui};
use crate::AppState;

#[tauri::command]
pub fn cmd_save(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow, json: String) {
    let existing = state.cfg.lock().clone();
    let Some(mut cfg) = crate::config::merge_save_payload(&existing, &json) else {
        return;
    };
    cfg.migrate();
    cfg.normalize();
    crate::config::save_config(&cfg);
    *state.cfg.lock() = cfg.clone();
    crate::config::apply_config(&state, &cfg);
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state.inner()));
    sync_config_ui(&state, &window, "unchanged");
    state.machine_pool.lock().reset_all();
    push_runtime(&state, &window, "saved", "");
    let ack = serde_json::json!({"type":"mvp_saved","ok":true});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_pause(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    crate::ipc::pause_listen(&state, window.app_handle());
}

#[tauri::command]
pub fn cmd_resume(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    crate::ipc::resume_listen(&state, window.app_handle());
}
