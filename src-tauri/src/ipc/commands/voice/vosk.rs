use std::sync::Arc;

use crate::AppState;

use super::sapi::app_resource_dir;

#[tauri::command]
pub fn cmd_voice_vosk_status(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    crate::voice_vosk_runtime::voice_vosk_status(&state, app_resource_dir(&app))
}

#[tauri::command]
pub fn cmd_voice_vosk_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_enabled(
        state.inner(),
        &window,
        enabled,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_phrases(
        &state,
        &app,
        phrases,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_set_model_preset(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    preset: String,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_model_preset(
        &state,
        &app,
        preset,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_set_model_path(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_model_path(
        &state,
        &app,
        path,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_test_send(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_vosk_runtime::voice_vosk_test_send(&state, &window)
}

#[tauri::command]
pub fn cmd_open_vosk_resources_dir(app: tauri::AppHandle) -> Result<(), String> {
    crate::voice_vosk_runtime::voice_vosk_open_resources_dir(super::sapi::app_resource_dir(&app))
}

#[tauri::command]
pub fn cmd_voice_vosk_retry_start(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    crate::voice_vosk_runtime::voice_vosk_retry_start(
        &app,
        state.inner(),
        super::sapi::app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_vosk_download_model(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    preset: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock();
    let p = preset
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| cfg.voice_vosk.model_preset.clone());
    drop(cfg);
    crate::vosk_model_download::start_vosk_model_download(
        app.clone(),
        Arc::clone(state.inner()),
        p,
        super::sapi::app_resource_dir(&app),
    )
}
