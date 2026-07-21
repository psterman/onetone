use std::sync::Arc;

use tauri::{AppHandle, State, WebviewWindow};

use crate::codex_micro_overlay::{self, CodexMicroOverlaySnapshot};
use crate::AppState;

#[tauri::command]
pub fn cmd_codex_micro_overlay_get_state(
    state: tauri::State<Arc<AppState>>,
) -> CodexMicroOverlaySnapshot {
    codex_micro_overlay::build_snapshot(state.inner())
}

/// User closed the floating pad — persist overlayEnabled=false.
#[tauri::command]
pub fn cmd_codex_micro_overlay_dismiss(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    Ok(codex_micro_overlay::dismiss_overlay(&app, state.inner()))
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_start_drag(window: WebviewWindow) -> Result<(), String> {
    codex_micro_overlay::start_overlay_drag(&window)
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_snap_position(window: WebviewWindow) {
    codex_micro_overlay::snap_overlay_position(&window);
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_set_minimized(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    minimized: bool,
) {
    codex_micro_overlay::set_overlay_minimized(minimized);
    codex_micro_overlay::push_state(&app, state.inner());
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_master(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_pad_master(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_num_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_pad_num_mode(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_pad_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    codex_micro_overlay::toggle_pad_mode(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_joy_panel(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_joy_nav_panel(&app, state.inner())
}
