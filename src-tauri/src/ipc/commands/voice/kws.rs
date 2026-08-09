use std::sync::Arc;

use tauri::Manager;

use crate::AppState;

#[tauri::command]
pub async fn cmd_voice_kws_status(
    state: tauri::State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let state = Arc::clone(state.inner());
    let resource_dir = app.path().resource_dir().ok();
    let join = tauri::async_runtime::spawn_blocking(move || {
        crate::ui_heartbeat::note_ipc_enter("voice_kws_status");
        let v = crate::voice_kws_runtime::voice_kws_status(&state, resource_dir);
        crate::ui_heartbeat::note_ipc_exit("voice_kws_status");
        v
    });
    match tokio::time::timeout(std::time::Duration::from_millis(1500), join).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(format!("kws status task failed: {e}")),
        Err(_) => Err("kws status timeout".into()),
    }
}

#[tauri::command]
pub fn cmd_voice_kws_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let resource_dir = app.path().resource_dir().ok();
    crate::voice_kws_runtime::voice_kws_set_enabled(state.inner(), &window, enabled, resource_dir)
}

#[tauri::command]
pub fn cmd_voice_kws_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    let resource_dir = app.path().resource_dir().ok();
    crate::voice_kws_runtime::voice_kws_set_phrases(&state, &app, phrases, resource_dir)
}

#[tauri::command]
pub fn cmd_voice_kws_test_detect(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    phrase: String,
) -> Result<serde_json::Value, String> {
    crate::voice_kws_runtime::voice_kws_inject_test_detect(state.inner(), &app, phrase)
}

#[tauri::command]
pub fn cmd_voice_kws_test_send(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_kws_runtime::voice_kws_test_send(&state, &window)
}

#[tauri::command]
pub fn cmd_voice_kws_retry_start(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    let resource_dir = app.path().resource_dir().ok();
    crate::voice_kws_runtime::voice_kws_retry_start(&app, state.inner(), resource_dir)
}

#[tauri::command]
pub fn cmd_kws_download_model(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    preset: Option<String>,
) -> Result<serde_json::Value, String> {
    let cfg = state.cfg.lock();
    let p = preset
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| cfg.voice_kws.model_preset.clone());
    drop(cfg);
    crate::kws_model_download::start_kws_model_download(
        app.clone(),
        Arc::clone(state.inner()),
        p,
        app.path().resource_dir().ok(),
    )
}
