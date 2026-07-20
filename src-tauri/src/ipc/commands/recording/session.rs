use std::sync::Arc;
use std::time::Instant;

use crate::ipc::recording::{RecordMode, RecordingTarget};
use crate::AppState;

#[tauri::command]
pub fn cmd_start_recording(state: tauri::State<Arc<AppState>>, mapping_id: String, mode: String) {
    state.machine_pool.lock().reset_all();
    let record_mode = match mode.as_str() {
        "target" => RecordMode::Target,
        "agentBinding" | "agent_binding" => RecordMode::AgentBinding,
        _ => RecordMode::Trigger,
    };
    *state.recording_target.lock() = Some(RecordingTarget {
        mapping_id,
        mode: record_mode,
    });
    *state.recording.lock() = true;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = Some(Instant::now());
    state.record_gesture.lock().reset();
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.start_recording();
    }
}

#[tauri::command]
pub fn cmd_stop_recording(state: tauri::State<Arc<AppState>>) {
    *state.recording.lock() = false;
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
}
