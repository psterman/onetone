use std::sync::Arc;
use std::time::Instant;

use tauri::Emitter;
use tauri::Manager;

use crate::ipc::recording::{RecordMode, RecordingTarget};
use crate::AppState;

/// Arm the capture wire + mute Soft Pad / oral / calibrate before hooks install.
/// Safe to call twice (start + FE prearm). Does not install recording hooks.
fn arm_recording_wire(
    app: &tauri::AppHandle,
    state: &Arc<AppState>,
    mapping_id: Option<&str>,
    mode: Option<&str>,
) {
    *state.recording.lock() = true;
    crate::hotkey_win::arm_recording_session();
    // Prearm with target so FE page backup (Logitech button3/4) can commit during
    // startPending — without this, handle_hardware_record_key drops no_target.
    let mid = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    if let Some(id) = mid {
        let record_mode = match mode.unwrap_or("") {
            "target" => RecordMode::Target,
            "agentBinding" | "agent_binding" => RecordMode::AgentBinding,
            "padBind" | "pad_bind" => RecordMode::PadBind,
            "oralTrigger" | "oral_trigger" | "oral" => RecordMode::OralTrigger,
            _ => RecordMode::Trigger,
        };
        *state.recording_target.lock() = Some(RecordingTarget {
            mapping_id: id.to_string(),
            mode: record_mode,
        });
    }
    // Capture channel before StartRecording cmd — closes arm→start edge loss.
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.prime_recording_sender();
    }
    // Recording owns side buttons / Soft Pad mic — clear oral listen chrome so
    // 口头收听中 cannot steal XButton while「请按下快捷键」is open.
    crate::voice_command_session::force_cancel(state, app, "record_arm");
    // Calibrate / Soft Pad can leave a fullscreen or sticky HWND on the Cursor
    // monitor that eats clicks and steals XButton pointer events from main.
    crate::input_aim_calibrate::abort_if_open(app);
    crate::codex_micro_overlay::mute_overlay_for_recording(app);
    // force_cancel push_state may still show Soft Pad briefly; re-push with
    // recording=true so overlay_runtime_gate hides 听写/口头面板.
    crate::codex_micro_overlay::push_state(app, state.as_ref());
}

/// FE awaits this before `cmd_start_recording`: closes the click→IPC race where
/// an already-bound side button arms Soft Pad oral and covers the screen.
#[tauri::command]
pub fn cmd_arm_recording_wire(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    mapping_id: Option<String>,
    mode: Option<String>,
) {
    arm_recording_wire(
        &app,
        state.inner(),
        mapping_id.as_deref(),
        mode.as_deref(),
    );
}

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
        "oralTrigger" | "oral_trigger" | "oral" => RecordMode::OralTrigger,
        _ => RecordMode::Trigger,
    };
    *state.recording_target.lock() = Some(RecordingTarget {
        mapping_id: mapping_id.clone(),
        mode: record_mode,
    });
    arm_recording_wire(&app, state.inner(), Some(mapping_id.as_str()), Some(mode.as_str()));
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
    // Drop oral / calibrate leftovers so Keys recording never leaves a click slab.
    crate::voice_command_session::force_cancel(state.inner(), &app, "record_stop");
    crate::input_aim_calibrate::abort_if_open(&app);
    crate::codex_micro_overlay::mute_overlay_for_recording(&app);
    crate::codex_micro_overlay::push_state(&app, state.as_ref());
    crate::tray::refresh_tray_visual_forced(&app);
}
