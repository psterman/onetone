use std::path::PathBuf;
use std::sync::Arc;

use crate::AppState;

#[tauri::command]
pub fn cmd_autostart_get(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_autostart_set(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn cmd_export_logs(
    state: tauri::State<Arc<AppState>>,
    frontend_lines: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let lines = frontend_lines.unwrap_or_default();
    let path = crate::app_log::export_diagnostic_zip(state.inner(), &lines)?;
    let dir = path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| path.clone());
    Ok(serde_json::json!({
        "ok": true,
        "path": crate::app_log::sanitize_path(&path),
        "dir": dir.to_string_lossy(),
    }))
}

#[tauri::command]
pub async fn cmd_app_log(
    state: tauri::State<'_, Arc<AppState>>,
    line: String,
) -> Result<(), String> {
    // Disk I/O off the UI thread — sync cmd_app_log flooded main and marked the window 未响应.
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        crate::app_log::log_line(&state, "frontend", &line);
    })
    .await
    .map_err(|e| format!("log task failed: {e}"))
}

/// Atomic-only UI heartbeat. No disk, no cfg/log_ring, no emit.
#[tauri::command]
pub fn cmd_ui_heartbeat(seq: u64, activity_tag: Option<String>, frontend_time: Option<u64>) {
    crate::ui_heartbeat::note_ping(
        seq,
        activity_tag.as_deref().unwrap_or(""),
        frontend_time.unwrap_or(0),
    );
}

#[tauri::command]
pub fn cmd_open_url(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("open url is only supported on Windows".into())
    }
}

#[tauri::command]
pub fn cmd_open_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(path.trim());
    if p.as_os_str().is_empty() {
        return Err("empty path".into());
    }
    crate::data_root::open_path(&p)
}

#[tauri::command]
pub fn cmd_data_root_status() -> crate::data_root::DataRootStatus {
    crate::data_root::status()
}

#[tauri::command]
pub async fn cmd_data_root_pick() -> Result<crate::data_root::DataRootStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(folder) = crate::data_root::pick_folder_dialog()? else {
            return Ok(crate::data_root::status());
        };
        crate::data_root::set_custom_root(folder)
    })
    .await
    .map_err(|e| format!("data_root_pick task failed: {e}"))?
}

#[tauri::command]
pub fn cmd_data_root_open() -> Result<(), String> {
    let root = crate::data_root::effective_data_root();
    crate::data_root::open_path(&root)
}

#[tauri::command]
pub fn cmd_data_root_reset() -> Result<crate::data_root::DataRootStatus, String> {
    crate::data_root::reset_to_default()
}

#[tauri::command]
pub fn cmd_probe_camera_capabilities() -> serde_json::Value {
    crate::camera_capability_probe::probe_camera_capabilities()
}

#[tauri::command]
pub fn cmd_windows_hello_confirm(reason: Option<String>) -> serde_json::Value {
    crate::camera_capability_probe::windows_hello_confirm(reason.as_deref().unwrap_or(""))
}
