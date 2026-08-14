use std::sync::Arc;

use tauri::Emitter;

use crate::AppState;

#[tauri::command]
pub fn cmd_tray_menu_ready(state: tauri::State<Arc<AppState>>) -> String {
    crate::tray::tray_menu_state_json(state.inner())
}

#[tauri::command]
pub fn cmd_tray_subscribe_segment(window: tauri::WebviewWindow, segment: String) -> Result<(), String> {
    crate::tray_state::subscribe_segment(window.label().to_string(), segment);
    Ok(())
}

#[tauri::command]
pub fn cmd_tray_action(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    action: String,
    payload: Option<serde_json::Value>,
) {
    crate::tray::handle_tray_action(&app, state.inner(), &action, payload);
}

#[tauri::command]
pub fn cmd_tray_menu_present(
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
    cursor_x: i32,
    cursor_y: i32,
) -> Result<(), String> {
    crate::tray::present_tray_menu(&window, width, height, cursor_x, cursor_y)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_tray_sync_mic(app: tauri::AppHandle) {
    crate::tray::refresh_tray_visual_forced(&app);
}

/// Home workbench publishes unified runtime status for tray / HUD.
#[tauri::command]
pub fn cmd_runtime_status_protocol(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    payload: serde_json::Value,
) {
    *state.runtime_status_protocol.lock() = Some(payload.clone());
    crate::tray::refresh_menu_data(&app);
    crate::coach_hud::push_state(&app, state.inner());
    let _ = app.emit("runtime_status_protocol", payload);
}
