use std::sync::Arc;
use std::time::Instant;

use tauri::Emitter;
use tauri::Manager;

use crate::ipc::recording::{RecordMode, RecordingTarget};
use crate::AppState;

#[tauri::command]
pub fn cmd_start_recording(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    mapping_id: String,
    mode: String,
) {
    state.machine_pool.lock().reset_all();
    let record_mode = match mode.as_str() {
        "target" => RecordMode::Target,
        "agentBinding" | "agent_binding" => RecordMode::AgentBinding,
        "padBind" | "pad_bind" => RecordMode::PadBind,
        _ => RecordMode::Trigger,
    };
    *state.recording_target.lock() = Some(RecordingTarget {
        mapping_id,
        mode: record_mode,
    });
    *state.recording.lock() = true;
    crate::hotkey_win::arm_recording_session();
    crate::voice_end_runtime::arm_external_voice_send_suppression(state.inner(), 1500);
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = Some(Instant::now());
    state.record_gesture.lock().reset();
    crate::ipc::recording::clear_record_guard(state.inner());
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.start_recording();
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.emit(
            "to_js",
            serde_json::json!({
                "type": "mvp_record_probe",
                "stage": "hello",
                "key": "",
                "note": "hook_ok",
            }),
        );
    }
    crate::tray::refresh_tray_visual_forced(&app);
}

#[tauri::command]
pub fn cmd_stop_recording(app: tauri::AppHandle, state: tauri::State<Arc<AppState>>) {
    *state.recording.lock() = false;
    crate::hotkey_win::disarm_recording_session();
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    state.record_gesture.lock().reset();
    crate::ipc::recording::clear_record_guard(state.inner());
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
        let cfg = state.cfg.lock();
        mgr.bind_all(&cfg.bindings());
        mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
    }
    crate::tray::refresh_tray_visual_forced(&app);
}
