use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::ipc::core::{push_runtime, sync_config_ui};
use crate::AppState;

#[tauri::command]
pub fn cmd_save(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    json: String,
) -> Result<(), String> {
    let existing = state.cfg.lock().clone();
    let mut cfg = crate::config::merge_save_payload(&existing, &json).ok_or_else(|| {
        eprintln!(
            "cmd_save: merge_save_payload failed (json_len={})",
            json.len()
        );
        "save_payload_invalid".to_string()
    })?;
    for m in &mut cfg.mappings {
        m.acoustic_voice_commands = crate::config::normalize_acoustic_voice_commands(
            std::mem::take(&mut m.acoustic_voice_commands),
            &m.id,
        );
    }
    for m in &mut cfg.trash {
        m.acoustic_voice_commands = crate::config::normalize_acoustic_voice_commands(
            std::mem::take(&mut m.acoustic_voice_commands),
            &m.id,
        );
    }
    cfg.migrate();
    cfg.normalize();
    crate::config::save_config(&cfg);
    *state.cfg.lock() = cfg.clone();
    crate::config::apply_config(&state, &cfg);
    crate::voice_bootstrap::apply_voice_config_change(
        window.app_handle(),
        state.inner(),
        &existing,
        &cfg,
    );
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state.inner()));
    sync_config_ui(&state, &window, "unchanged");
    state.machine_pool.lock().reset_all();
    push_runtime(&state, &window, "saved", "");
    crate::coach_hud::push_state(window.app_handle(), state.inner());
    let ack = serde_json::json!({"type":"mvp_saved","ok":true});
    window.emit("to_js", &ack).ok();
    Ok(())
}

#[tauri::command]
pub fn cmd_pause(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    crate::ipc::pause_listen(&state, window.app_handle());
}

#[tauri::command]
pub fn cmd_resume(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    crate::ipc::resume_listen(&state, window.app_handle());
}
