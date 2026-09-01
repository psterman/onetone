use crate::tray_runtime::{self, TrayRuntime, TrayScenePreset};

#[tauri::command]
pub fn cmd_tray_runtime_get() -> TrayRuntime {
    tray_runtime::load()
}

#[tauri::command]
pub fn cmd_tray_runtime_save(
    tray_scene_preset: Option<TrayScenePreset>,
    custom_switch_snapshot: Option<std::collections::HashMap<String, bool>>,
    persona_preset: Option<String>,
) -> Result<(), String> {
    let rt = TrayRuntime {
        tray_scene_preset: tray_scene_preset.unwrap_or(TrayScenePreset::AllOn),
        custom_switch_snapshot: custom_switch_snapshot.unwrap_or_default(),
        persona_preset: persona_preset.unwrap_or_else(|| "vibe".into()),
    };
    tray_runtime::save(&rt)
}
