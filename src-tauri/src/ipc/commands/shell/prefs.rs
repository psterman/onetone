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
    Ok(serde_json::json!({
        "ok": true,
        "path": crate::app_log::sanitize_path(&path),
    }))
}

#[tauri::command]
pub fn cmd_app_log(state: tauri::State<Arc<AppState>>, line: String) {
    crate::app_log::log_line(state.inner(), "frontend", &line);
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
pub fn cmd_probe_camera_capabilities() -> serde_json::Value {
    crate::camera_capability_probe::probe_camera_capabilities()
}

#[tauri::command]
pub fn cmd_windows_hello_confirm(reason: Option<String>) -> serde_json::Value {
    crate::camera_capability_probe::windows_hello_confirm(reason.as_deref().unwrap_or(""))
}
