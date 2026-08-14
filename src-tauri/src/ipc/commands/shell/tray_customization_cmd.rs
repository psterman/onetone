use tauri::AppHandle;

use crate::tray_customization::{self, TrayCustomization};
use crate::tray_state;

#[tauri::command]
pub fn cmd_tray_customization_get() -> TrayCustomization {
    tray_customization::load()
}

#[tauri::command]
pub fn cmd_tray_customization_save(app: AppHandle, cfg: TrayCustomization) -> Result<(), String> {
    tray_customization::save(&cfg)?;
    tray_state::emit_tray_layout(&app, &cfg);
    Ok(())
}
