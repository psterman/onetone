use std::sync::Arc;

use tauri::{AppHandle, State, WebviewWindow};

use crate::cursor_beginner;
use crate::AppState;

#[tauri::command]
pub fn cmd_cursor_beginner_probe() -> serde_json::Value {
    serde_json::json!({
        "ok": cursor_beginner::probe_ok(),
        "processRunning": cursor_beginner::cursor_process_running(),
        "message": if cursor_beginner::probe_ok() { "" } else { cursor_beginner::PROBE_FAIL_MSG },
        "platform": "windows"
    })
}

#[tauri::command]
pub fn cmd_cursor_beginner_arm(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    expand_pad: Option<bool>,
) -> serde_json::Value {
    cursor_beginner::arm(state.inner().as_ref(), &app, expand_pad.unwrap_or(true));
    serde_json::json!({ "ok": true, "armed": cursor_beginner::is_armed() })
}

#[tauri::command]
pub fn cmd_cursor_beginner_disarm(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> serde_json::Value {
    cursor_beginner::disarm(state.inner().as_ref(), &app);
    serde_json::json!({ "ok": true, "armed": false })
}

#[tauri::command]
pub fn cmd_cursor_beginner_run_slot(
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    slot_id: String,
    hold_confirmed: Option<bool>,
    from_voice: Option<bool>,
) -> serde_json::Value {
    cursor_beginner::run_slot(
        state.inner(),
        &window,
        slot_id.trim(),
        from_voice.unwrap_or(false),
        hold_confirmed.unwrap_or(false),
    )
}
