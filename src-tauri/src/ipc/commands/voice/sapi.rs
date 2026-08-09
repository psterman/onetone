use std::sync::Arc;

use tauri::Manager;

use crate::AppState;

pub(super) fn app_resource_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().resource_dir().ok()
}

#[tauri::command]
pub async fn cmd_voice_sapi_status(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let state = Arc::clone(state.inner());
    let join = tauri::async_runtime::spawn_blocking(move || {
        crate::ui_heartbeat::note_ipc_enter("voice_sapi_status");
        let v = crate::voice_sapi_runtime::voice_sapi_status(&state);
        crate::ui_heartbeat::note_ipc_exit("voice_sapi_status");
        v
    });
    match tokio::time::timeout(std::time::Duration::from_millis(1500), join).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(format!("sapi status task failed: {e}")),
        Err(_) => Err("sapi status timeout".into()),
    }
}

#[tauri::command]
pub fn cmd_voice_sapi_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    crate::voice_sapi_runtime::voice_sapi_set_enabled(state.inner(), &window, enabled)
}

#[tauri::command]
pub fn cmd_voice_sapi_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    crate::voice_sapi_runtime::voice_sapi_set_phrases(&state, &app, phrases)
}

#[tauri::command]
pub fn cmd_voice_sapi_set_min_confidence(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    #[allow(non_snake_case)] minConfidence: Option<f32>,
    min_confidence: Option<f32>,
) -> Result<serde_json::Value, String> {
    let value = min_confidence
        .or(minConfidence)
        .ok_or_else(|| "missing min confidence".to_string())?;
    crate::voice_sapi_runtime::voice_sapi_set_min_confidence(&state, &app, value)
}

#[tauri::command]
pub fn cmd_voice_sapi_test_send(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_sapi_runtime::voice_sapi_test_send(&state, &window)
}

#[tauri::command]
pub fn cmd_open_windows_speech_setup() -> Result<(), String> {
    #[cfg(windows)]
    {
        let targets = ["ms-settings:speech", "ms-settings:regionlanguage"];
        let mut last_err = String::new();
        for target in targets {
            match std::process::Command::new("cmd")
                .args(["/C", "start", "", target])
                .spawn()
            {
                Ok(_) => return Ok(()),
                Err(err) => last_err = err.to_string(),
            }
        }
        Err(if last_err.is_empty() {
            "无法打开 Windows 语音设置页".into()
        } else {
            format!("无法打开 Windows 语音设置页: {last_err}")
        })
    }
    #[cfg(not(windows))]
    {
        Err("当前平台不支持打开 Windows 语音设置页".into())
    }
}

#[tauri::command]
pub fn cmd_process_usage(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::resource_monitor::process_usage_status(&state)
}
