use std::sync::Arc;

use crate::codex_micro_overlay::{self, CodexMicroOverlaySnapshot};
use crate::AppState;

#[tauri::command]
pub fn cmd_codex_micro_overlay_get_state(
    state: tauri::State<Arc<AppState>>,
) -> CodexMicroOverlaySnapshot {
    codex_micro_overlay::build_snapshot(state.inner())
}
