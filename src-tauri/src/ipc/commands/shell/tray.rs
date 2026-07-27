use std::sync::Arc;

use crate::AppState;

#[tauri::command]
pub fn cmd_tray_menu_ready(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    let json = crate::tray::tray_menu_init_json(state.inner());
    window.eval(&format!("window.__tray_init__({json})")).ok();
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
