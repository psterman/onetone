use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateUiState {
    pub phase: String,
    pub available: bool,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
    #[serde(rename = "latestVersion")]
    pub latest_version: String,
    pub notes: String,
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<UpdateProgress>,
}

impl UpdateUiState {
    pub fn new() -> Self {
        Self {
            phase: "idle".into(),
            available: false,
            current_version: env!("CARGO_PKG_VERSION").into(),
            latest_version: String::new(),
            notes: String::new(),
            error: String::new(),
            progress: None,
        }
    }
}

impl Default for UpdateUiState {
    fn default() -> Self {
        Self::new()
    }
}

fn update_payload(state: &AppState) -> UpdateUiState {
    state.update.lock().clone()
}

fn emit_update_state(window: &tauri::WebviewWindow, state: &AppState) {
    let payload = serde_json::json!({
        "type": "mvp_update_state",
        "update": update_payload(state),
    });
    crate::ipc::emit_to_js_main(window, payload);
}

fn relaunch_current_exe(app: &tauri::AppHandle) {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::process::Command::new(exe).spawn();
    }
    crate::graceful_exit(app);
}

fn friendly_update_error(err: &str) -> String {
    let lower = err.to_lowercase();
    if lower.contains("valid release json") || lower.contains("404") {
        return "线上更新文件还没有发布。请先在 GitHub Releases 上传 latest.json、安装包和 .sig 签名文件。".into();
    }
    if lower.contains("timed out") || lower.contains("timeout") {
        return "检查更新超时，请稍后重试。".into();
    }
    if lower.contains("signature") || lower.contains("sig") {
        return "更新包签名校验失败，请确认发布时使用了与应用内公钥匹配的签名私钥。".into();
    }
    if lower.contains("network") || lower.contains("dns") || lower.contains("connection") {
        return "无法连接更新服务器，请检查网络后重试。".into();
    }
    err.to_string()
}

pub fn start_background_checks(app: tauri::AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(10)).await;
        let _ = check_once(app.clone(), state.clone(), true).await;

        let mut interval = tokio::time::interval(Duration::from_secs(30 * 60));
        loop {
            interval.tick().await;
            let _ = check_once(app.clone(), state.clone(), true).await;
        }
    });
}

pub fn snapshot(state: &AppState) -> UpdateUiState {
    update_payload(state)
}

pub async fn check_once(
    app: tauri::AppHandle,
    state: Arc<AppState>,
    silent: bool,
) -> Result<UpdateUiState, String> {
    {
        let installing = state.update_installing.lock();
        if *installing {
            return Ok(snapshot(&state));
        }
    }

    {
        let mut checking = state.update_checking.lock();
        if *checking {
            return Ok(snapshot(&state));
        }
        *checking = true;
    }

    if !silent {
        {
            let mut update = state.update.lock();
            update.phase = "checking".into();
            update.error.clear();
            update.progress = None;
        }

        if let Some(window) = app.get_webview_window("main") {
            emit_update_state(&window, state.as_ref());
        }
    }

    let updater = app
        .updater()
        .map_err(|e| friendly_update_error(&e.to_string()))?;
    let outcome = match tokio::time::timeout(Duration::from_secs(20), updater.check()).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(err)) => Err(friendly_update_error(&err.to_string())),
        Err(_) => Err(friendly_update_error("update check timed out")),
    };

    let next = match outcome {
        Ok(Some(found)) => {
            let mut update = state.update.lock();
            update.phase = "available".into();
            update.available = true;
            update.latest_version = found.version.to_string();
            update.notes = found.body.clone().unwrap_or_default();
            update.error.clear();
            update.progress = None;
            update.clone()
        }
        Ok(None) => {
            if silent {
                snapshot(&state)
            } else {
                let mut update = state.update.lock();
                update.phase = "idle".into();
                update.available = false;
                update.latest_version.clear();
                update.notes.clear();
                update.error.clear();
                update.progress = None;
                update.clone()
            }
        }
        Err(err) => {
            if silent {
                snapshot(&state)
            } else {
                let mut update = state.update.lock();
                update.phase = "error".into();
                update.available = false;
                update.latest_version.clear();
                update.notes.clear();
                update.progress = None;
                update.error = err.clone();
                update.clone()
            }
        }
    };

    {
        let mut checking = state.update_checking.lock();
        *checking = false;
    }

    if let Some(window) = app.get_webview_window("main") {
        emit_update_state(&window, state.as_ref());
    }

    if !silent && next.available {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }

    if !silent && next.phase == "error" {
        Err(next.error)
    } else {
        Ok(next)
    }
}

pub async fn install_latest(
    app: tauri::AppHandle,
    state: Arc<AppState>,
) -> Result<UpdateUiState, String> {
    {
        let mut installing = state.update_installing.lock();
        if *installing {
            return Ok(snapshot(&state));
        }
        *installing = true;
    }

    {
        let mut update = state.update.lock();
        update.phase = "checking".into();
        update.error.clear();
        update.progress = None;
    }

    if let Some(window) = app.get_webview_window("main") {
        emit_update_state(&window, state.as_ref());
    }

    let updater = app
        .updater()
        .map_err(|e| friendly_update_error(&e.to_string()))?;
    let result = match tokio::time::timeout(Duration::from_secs(20), updater.check()).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(err)) => Err(friendly_update_error(&err.to_string())),
        Err(_) => Err(friendly_update_error("update check timed out")),
    };

    let result = match result {
        Ok(update) => update,
        Err(err) => {
            {
                let mut installing = state.update_installing.lock();
                *installing = false;
            }
            {
                let mut state_update = state.update.lock();
                state_update.phase = "error".into();
                state_update.available = false;
                state_update.latest_version.clear();
                state_update.notes.clear();
                state_update.error = err.clone();
                state_update.progress = None;
            }
            if let Some(window) = app.get_webview_window("main") {
                emit_update_state(&window, state.as_ref());
            }
            return Err(err);
        }
    };

    let Some(update) = result else {
        {
            let mut installing = state.update_installing.lock();
            *installing = false;
        }
        {
            let mut state_update = state.update.lock();
            state_update.phase = "idle".into();
            state_update.available = false;
            state_update.latest_version.clear();
            state_update.notes.clear();
            state_update.error.clear();
            state_update.progress = None;
        }
        if let Some(window) = app.get_webview_window("main") {
            emit_update_state(&window, state.as_ref());
        }
        return Ok(snapshot(&state));
    };

    {
        let mut state_update = state.update.lock();
        state_update.phase = "downloading".into();
        state_update.available = true;
        state_update.latest_version = update.version.to_string();
        state_update.notes = update.body.clone().unwrap_or_default();
        state_update.error.clear();
        state_update.progress = Some(UpdateProgress {
            downloaded: 0,
            total: 0,
            percent: 0,
        });
    }

    if let Some(window) = app.get_webview_window("main") {
        emit_update_state(&window, state.as_ref());
    }

    let window_for_progress = app.get_webview_window("main");
    let state_for_progress = state.clone();
    update
        .download_and_install(
            move |chunk_length, content_length| {
                let mut update = state_for_progress.update.lock();
                let downloaded = update
                    .progress
                    .as_ref()
                    .map(|p| p.downloaded)
                    .unwrap_or(0)
                    .saturating_add(chunk_length as u64);
                let total = content_length.unwrap_or(downloaded);
                let percent = if total > 0 {
                    ((downloaded.saturating_mul(100)) / total).min(100) as u8
                } else {
                    0
                };
                update.phase = "downloading".into();
                update.progress = Some(UpdateProgress {
                    downloaded,
                    total,
                    percent,
                });
                drop(update);
                if let Some(window) = &window_for_progress {
                    emit_update_state(window, state_for_progress.as_ref());
                }
            },
            || {},
        )
        .await
        .map_err(|e| {
            let friendly = friendly_update_error(&e.to_string());
            {
                let mut installing = state.update_installing.lock();
                *installing = false;
            }
            {
                let mut state_update = state.update.lock();
                state_update.phase = "error".into();
                state_update.available = false;
                state_update.latest_version.clear();
                state_update.notes.clear();
                state_update.error = friendly.clone();
                state_update.progress = None;
            }
            if let Some(window) = app.get_webview_window("main") {
                emit_update_state(&window, state.as_ref());
            }
            friendly
        })?;

    {
        let mut state_update = state.update.lock();
        state_update.phase = "restarting".into();
        state_update.progress = None;
    }
    if let Some(window) = app.get_webview_window("main") {
        emit_update_state(&window, state.as_ref());
    }

    tokio::time::sleep(Duration::from_millis(250)).await;
    {
        let mut installing = state.update_installing.lock();
        *installing = false;
    }
    relaunch_current_exe(&app);
    Ok(snapshot(&state))
}
