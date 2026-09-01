use std::sync::Arc;

use tauri::Emitter;

use crate::AppState;

#[tauri::command]
pub fn cmd_tray_menu_ready(state: tauri::State<Arc<AppState>>) -> String {
    crate::tray::tray_menu_state_json(state.inner())
}

/// Lightweight config + voice-end snapshot for the OS tray menu (no mvp_init / runtime push).
#[tauri::command]
pub fn cmd_tray_os_context(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    let cfg = state.cfg.lock().clone();
    let voice_end = crate::voice_end_runtime::voice_end_status(state.inner());
    serde_json::json!({
        "config": cfg,
        "voiceEnd": voice_end,
    })
}

/// Single bootstrap bundle for tray menu / editor (slim display + config slice).
#[tauri::command]
pub fn cmd_tray_bootstrap(
    state: tauri::State<Arc<AppState>>,
    surface: Option<String>,
) -> serde_json::Value {
    let surface = surface.as_deref().unwrap_or("os");
    serde_json::to_value(crate::tray_state::assemble_tray_bootstrap(
        state.inner(),
        surface,
    ))
    .unwrap_or_else(|_| serde_json::json!({}))
}

/// Today + week usage for habit hub value card — avoids full TrayState assembly.
#[tauri::command]
pub fn cmd_tray_usage_summary(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    serde_json::to_value(crate::tray_state::assemble_usage_summary(state.inner()))
        .unwrap_or_else(|_| serde_json::json!({}))
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

/// Show tray menu after JS has measured final size (avoids position jump on open).
#[tauri::command]
pub fn cmd_tray_menu_reveal(window: tauri::WebviewWindow) -> Result<(), String> {
    crate::tray::reveal_tray_menu(&window).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_tray_menu_set_size(
    window: tauri::WebviewWindow,
    height: f64,
    width: Option<f64>,
) -> Result<(), String> {
    crate::tray::resize_tray_menu(&window, height, width).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_tray_sync_mic(app: tauri::AppHandle) {
    crate::tray::refresh_tray_visual_forced(&app);
}

/// Push tray segment patches without closing the menu (voice toggle / scene apply).
#[tauri::command]
pub fn cmd_tray_refresh_segments(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    segments: Option<Vec<String>>,
) {
    let segs: Vec<&str> = segments
        .as_ref()
        .map(|v| v.iter().map(|s| s.as_str()).collect())
        .unwrap_or_else(|| vec!["channels", "global"]);
    crate::tray_state::emit_tray_segments(&app, state.inner(), &segs);
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
