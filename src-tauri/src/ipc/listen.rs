use std::sync::Arc;

use tauri::AppHandle;

use crate::AppState;

use super::core::{emit_to_main_if_available, push_runtime_via_app};

pub fn pause_listen(state: &Arc<AppState>, app: &AppHandle) {
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
    emit_to_main_if_available(app, Some(state), ack);
    push_runtime_via_app(app, state.as_ref(), "paused", "", None);
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "listen",
        crate::runtime_event::kind::LISTEN_PAUSED,
        "listen paused",
        None,
    );
    crate::tray::refresh_menu(app);
}

pub fn resume_listen(state: &Arc<AppState>, app: &AppHandle) {
    *state.paused.lock() = false;
    let ack = serde_json::json!({"type":"mvp_resumed","ok":true});
    emit_to_main_if_available(app, Some(state), ack);
    push_runtime_via_app(app, state.as_ref(), "resumed", "", None);
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "listen",
        crate::runtime_event::kind::LISTEN_RESUMED,
        "listen resumed",
        None,
    );
    crate::tray::refresh_menu(app);
}
