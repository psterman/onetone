use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::AppState;

use super::core::push_runtime;

pub fn pause_listen(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    state.machine_pool.lock().reset_all();
    state.gesture.lock().reset();
    state.record_gesture.lock().reset();
    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    *state.paused.lock() = true;
    let ack = serde_json::json!({"type":"mvp_paused","ok":true});
    window.emit("to_js", &ack).ok();
    push_runtime(state.as_ref(), window, "paused", "");
    crate::tray::refresh_menu(window.app_handle());
}

pub fn resume_listen(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    *state.paused.lock() = false;
    let ack = serde_json::json!({"type":"mvp_resumed","ok":true});
    window.emit("to_js", &ack).ok();
    push_runtime(state.as_ref(), window, "resumed", "");
    crate::tray::refresh_menu(window.app_handle());
}
