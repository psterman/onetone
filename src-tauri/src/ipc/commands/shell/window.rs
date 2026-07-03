#[tauri::command]
pub fn cmd_window_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn cmd_window_close(window: tauri::WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
pub fn cmd_sync_theme_backdrop(window: tauri::WebviewWindow, theme: String) {
    crate::backdrop::sync_backdrop_theme(&window, &theme);
}

#[tauri::command]
pub fn cmd_reload_latest(app: tauri::AppHandle) {
    let exe = std::env::current_exe().ok();
    std::thread::spawn(move || {
        if let Some(exe) = exe {
            let _ = std::process::Command::new(exe).spawn();
        }
        crate::graceful_exit(&app);
    });
}
