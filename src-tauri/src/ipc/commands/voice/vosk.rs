use std::sync::Arc;

use crate::AppState;

use super::sapi::app_resource_dir;

#[tauri::command]
pub async fn cmd_voice_vosk_status(
    state: tauri::State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let state = Arc::clone(state.inner());
    let resource_dir = app_resource_dir(&app);
    // Off UI thread + hard timeout — stuck FS/probe used to hold ipc ~60s (未响应).
    let join = tauri::async_runtime::spawn_blocking(move || {
        crate::ui_heartbeat::note_ipc_enter("voice_vosk_status");
        let v = crate::voice_vosk_runtime::voice_vosk_status(&state, resource_dir);
        crate::ui_heartbeat::note_ipc_exit("voice_vosk_status");
        v
    });
    match tokio::time::timeout(std::time::Duration::from_millis(1500), join).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(format!("vosk status task failed: {e}")),
        // Leave note_ipc to the still-running worker; hang panel shows truth until exit.
        Err(_) => Err("vosk status timeout".into()),
    }
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
    crate::voice_vosk_runtime::voice_vosk_set_phrases(&state, &app, phrases, app_resource_dir(&app))
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
    crate::voice_vosk_runtime::voice_vosk_set_model_path(&state, &app, path, app_resource_dir(&app))
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
