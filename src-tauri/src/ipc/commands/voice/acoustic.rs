use std::sync::Arc;

use crate::config::AcousticVoiceCommandSample;
use crate::voice_acoustic_runtime::{
    acoustic_set_suspend, acoustic_status, build_command_json, preflight_record, record_once,
    record_session_cancel, record_session_start, record_session_stop, test_once,
};
use crate::AppState;

#[tauri::command]
pub fn cmd_acoustic_voice_command_status(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    acoustic_status(state.inner())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_preflight(
    state: tauri::State<Arc<AppState>>,
) -> serde_json::Value {
    preflight_record(state.inner())
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
    session_id: Option<String>,
) -> serde_json::Value {
    record_once(state.inner(), Some(&app), session_id.as_deref())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_test_once(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    scenario_id: String,
) -> serde_json::Value {
    test_once(state.inner(), &app, &scenario_id)
}

#[tauri::command]
pub fn cmd_app_launch_capability(app_target_id: String) -> serde_json::Value {
    let cap = crate::app_chat_workflow::app_launch_capability(&app_target_id);
    serde_json::json!({
        "ok": true,
        "appTargetId": app_target_id,
        "capability": cap.as_str(),
    })
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_record_start(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    session_id: Option<String>,
) -> serde_json::Value {
    record_session_start(state.inner(), Some(&app), session_id.as_deref())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_record_stop(
    state: tauri::State<Arc<AppState>>,
    session_id: Option<String>,
) -> serde_json::Value {
    record_session_stop(state.inner(), session_id.as_deref())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_record_cancel(
    state: tauri::State<Arc<AppState>>,
    session_id: Option<String>,
) -> serde_json::Value {
    record_session_cancel(state.inner(), session_id.as_deref())
}

#[tauri::command]
pub fn cmd_acoustic_voice_command_build_from_samples(
    samples: Vec<AcousticVoiceCommandSample>,
    scenario_id: String,
    activation_scope: Option<String>,
    app_boost: Option<bool>,
    display_text: Option<String>,
    current_command_id: Option<String>,
    kind: Option<String>,
) -> serde_json::Value {
    build_command_json(
        samples,
        &scenario_id,
        activation_scope.as_deref().unwrap_or("global"),
        app_boost.unwrap_or(true),
        display_text.as_deref().unwrap_or(""),
        current_command_id.as_deref(),
        kind.as_deref(),
    )
}
