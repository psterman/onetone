use std::sync::Arc;

use crate::config::AcousticVoiceCommandSample;
use crate::voice_acoustic_runtime::{
    acoustic_set_suspend, acoustic_status, build_command_json, record_once,
};
use crate::AppState;

#[tauri::command]
pub fn cmd_acoustic_voice_command_status(
    state: tauri::State<Arc<AppState>>,
) -> serde_json::Value {
    acoustic_status(state.inner())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_set_suspend(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    suspended: bool,
) -> serde_json::Value {
    acoustic_set_suspend(state.inner(), suspended, Some(&app));
    acoustic_status(state.inner())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_record_once(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
) -> serde_json::Value {
    record_once(state.inner(), Some(&app))
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_build_from_samples(
    samples: Vec<AcousticVoiceCommandSample>,
    scenario_id: String,
    activation_scope: Option<String>,
    app_boost: Option<bool>,
    display_text: Option<String>,
    current_command_id: Option<String>,
) -> serde_json::Value {
    build_command_json(
        samples,
        &scenario_id,
        activation_scope.as_deref().unwrap_or("global"),
        app_boost.unwrap_or(true),
        display_text.as_deref().unwrap_or(""),
        current_command_id.as_deref(),
    )
}
