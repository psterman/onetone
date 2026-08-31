use crate::tray_runtime::{self, TrayRuntime};

#[tauri::command]
pub fn cmd_tray_runtime_get() -> TrayRuntime {
    tray_runtime::load()
}

#[tauri::command]
pub fn cmd_tray_runtime_save(rt: TrayRuntime) -> Result<(), String> {
    tray_runtime::save(&rt)
}
