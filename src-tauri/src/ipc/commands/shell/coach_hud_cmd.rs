use std::sync::Arc;

use tauri::AppHandle;

use crate::coach_hud::{self, CoachHudSnapshot};
use crate::config;
use crate::AppState;

#[tauri::command]
pub fn cmd_coach_hud_get_state(state: tauri::State<Arc<AppState>>) -> CoachHudSnapshot {
    coach_hud::build_snapshot(state.inner())
}

#[tauri::command]
pub fn cmd_coach_hud_dismiss(
    state: tauri::State<Arc<AppState>>,
    app: AppHandle,
) -> serde_json::Value {
    coach_hud::dismiss_session(state.inner());
    coach_hud::push_state(&app, state.inner());
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_coach_hud_set_enabled(
    state: tauri::State<Arc<AppState>>,
    app: AppHandle,
    enabled: bool,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.coach_hud_enabled = enabled;
        config::save_config(&cfg);
    }
    if enabled {
        coach_hud::reset_session_dismissed(state.inner());
    }
    coach_hud::push_state(&app, state.inner());
    serde_json::json!({ "ok": true, "enabled": enabled })
}

#[tauri::command]
pub fn cmd_coach_hud_flash_success(state: tauri::State<Arc<AppState>>, app: AppHandle) {
    coach_hud::flash_success(&app, state.inner());
}
