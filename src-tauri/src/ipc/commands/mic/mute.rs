use crate::audio_win::{self, MicMuteState};

#[tauri::command]
pub fn cmd_mic_get_mute(_app: tauri::AppHandle) -> Result<MicMuteState, String> {
    // Read-only: tray poll + explicit mute/set hooks refresh the icon; syncing here blocked JS on run_on_main_thread.
    audio_win::get_default_capture_mute()
}

#[tauri::command]
pub fn cmd_mic_set_mute(app: tauri::AppHandle, muted: bool) -> Result<MicMuteState, String> {
    let st = audio_win::set_default_capture_mute(muted)?;
    crate::tray::after_mic_state_changed(&app, &st);
    Ok(st)
}
