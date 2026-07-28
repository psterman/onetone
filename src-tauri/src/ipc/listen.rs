use std::sync::Arc;

use tauri::AppHandle;

use crate::ipc::{stop_trigger_compat_probe, stop_trigger_verify_listen};
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
    stop_trigger_compat_probe(state);
    stop_trigger_verify_listen(state);
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    *state.paused.lock() = true;
    crate::voice_bootstrap::pause_voice_engines(state);
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
    crate::tray::refresh_tray_tooltip(app, state.as_ref());
    crate::tray::refresh_tray_visual_forced(app);
    crate::coach_hud::push_state(app, state.as_ref());
}

pub fn resume_listen(state: &Arc<AppState>, app: &AppHandle) {
    *state.paused.lock() = false;
    crate::voice_bootstrap::resume_voice_engines(app, state);
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
    crate::tray::refresh_tray_tooltip(app, state.as_ref());
    crate::tray::refresh_tray_visual_forced(app);
    crate::coach_hud::push_state(app, state.as_ref());
}
