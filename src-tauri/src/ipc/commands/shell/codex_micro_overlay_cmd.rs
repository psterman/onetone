use std::sync::Arc;

use tauri::{AppHandle, State};

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
