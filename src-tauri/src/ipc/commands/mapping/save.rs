use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::config::{self, CameraPrefs};
use crate::AppState;

fn save_source_label(value: &serde_json::Value) -> &'static str {
    if let Some(source) = value.get("saveSource").and_then(|v| v.as_str()) {
        match source.trim() {
            "quickStart" => return "quickStart",
            "camera" => return "camera",
            "layout" => return "layout",
            "mapping" => return "mapping",
            "voice" => return "voice",
            "voiceDraft" => return "voice",
            "unknown" => return "unknown",
            _ => {}
        }
    }
    if value.get("quickStart").and_then(|v| v.as_bool()).unwrap_or(false) {
        return "quickStart";
    }
    if value.get("cameraPrefs").is_some() || value.get("camera_prefs").is_some() {
        return "camera";
    }
    if value.get("windowLayout").is_some()
        || value.get("window_layout").is_some()
        || value.get("cameraWindow").is_some()
        || value.get("camera_window").is_some()
    {
        return "layout";
    }
    if value.get("mappings").is_some()
        || value.get("trash").is_some()
        || value.get("activeSceneId").is_some()
        || value.get("active_scene_id").is_some()
    {
        return "mapping";
    }
    "unknown"
}

#[tauri::command]
pub fn cmd_save(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    json: String,
) -> Result<(), String> {
    let source = serde_json::from_str::<serde_json::Value>(&json)
        .ok()
        .map(|value| save_source_label(&value))
        .unwrap_or("unknown");
    let existing = state.cfg.lock().clone();
    let mut cfg = crate::config::merge_save_payload(&existing, &json).ok_or_else(|| {
        crate::app_log::sync_emergency_line(
            "cmd_save",
            &format!(
                "cmd_save: merge_save_payload failed (json_len={})",
                json.len()
            ),
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

    // Camera / window-layout-only saves must not restart voice or push mvp_init —
    // that path raced MediaPipe + drawer re-render and 假死'd the UI (weak refit).
    if config::is_watcher_noise_only_change(&existing, &cfg) {
        crate::config::save_config(&cfg);
        *state.cfg.lock() = cfg;
        crate::app_log::log_line(
            &state,
            "config",
            &format!("cmd_save source={source} layout/camera only, skip mvp_init/voice"),
        );
        let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
        window.emit("to_js", &ack).ok();
        return Ok(());
    }

    // Micro pad toggle / key remap only — sync hook cache + overlay; skip mvp_init/voice.
    // Full AgentCapabilityUi.refresh + camera remount used to 假死 on「启用 Micro 小键盘层」.
    if config::is_codex_micro_pad_only_change(&existing, &cfg) {
        crate::config::save_config(&cfg);
        *state.cfg.lock() = cfg.clone();
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        let app = window.app_handle().clone();
        let state_bg = Arc::clone(state.inner());
        let _ = std::thread::Builder::new()
            .name("codex-micro-pad-quiet".into())
            .spawn(move || {
                crate::codex_micro_overlay::push_state(&app, &state_bg);
            });
        crate::app_log::log_line(
            &state,
            "config",
            &format!("cmd_save source={source} codex_micro_pad only, skip mvp_init/voice"),
        );
        let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
        window.emit("to_js", &ack).ok();
        return Ok(());
    }

    // Trigger mode / finish timing only — reset press machines; skip mvp_init/voice/camera.
    if config::is_mapping_gesture_only_change(&existing, &cfg) {
        crate::config::save_config(&cfg);
        *state.cfg.lock() = cfg.clone();
        state.machine_pool.lock().reset_all();
        crate::app_log::log_line(
            &state,
            "config",
            &format!("cmd_save source={source} gesture/timing only, skip mvp_init/voice"),
        );
        let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
        window.emit("to_js", &ack).ok();
        return Ok(());
    }

    // Voice panel persistence (phrase/sensitivity/strategy) is typically already applied by
    // dedicated voice IPC commands. Saving here should persist to disk only; avoid full mvp_init
    // and voice restart chain, which can freeze UI during drawer open/new-habit flows.
    if source == "voice" {
        crate::config::save_config(&cfg);
        *state.cfg.lock() = cfg;
        crate::app_log::log_line(
            &state,
            "config",
            "cmd_save source=voice persist only, skip mvp_init/voice",
        );
        let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
        window.emit("to_js", &ack).ok();
        return Ok(());
    }

    crate::config::save_config(&cfg);
    *state.cfg.lock() = cfg.clone();
    crate::config::apply_config(&state, &cfg);
    state.machine_pool.lock().reset_all();
    // FE already holds this config — never echo mvp_init/runtime after cmd_save.
    // Pushing mvp_init used to remount the drawer (假死). Voice restart stays off the
    // IPC thread; coach/overlay refresh is fire-and-forget on a worker.
    let app = window.app_handle().clone();
    let state_bg = Arc::clone(state.inner());
    let old_bg = existing.clone();
    let new_bg = cfg.clone();
    let source_owned = source.to_string();
    let _ = std::thread::Builder::new()
        .name("voice-save-activate".into())
        .spawn(move || {
            crate::voice_bootstrap::apply_voice_config_change(&app, &state_bg, &old_bg, &new_bg);
            crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state_bg));
            crate::coach_hud::push_state(&app, &state_bg);
            crate::codex_micro_overlay::push_state(&app, &state_bg);
            crate::app_log::log_line(
                &state_bg,
                "config",
                &format!("cmd_save source={source_owned} full (no mvp_init echo)"),
            );
        });
    let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
    window.emit("to_js", &ack).ok();
    Ok(())
}

/// Patch `cameraPrefs` only — no mapping merge, no voice restart, no `mvp_init`.
#[tauri::command]
pub fn cmd_save_camera_prefs(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    json: String,
) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(&json).map_err(|e| {
        crate::app_log::sync_emergency_line(
            "cmd_save",
            &format!("cmd_save_camera_prefs: parse failed: {e}"),
        );
        "camera_prefs_invalid".to_string()
    })?;
    let clear_gaze = value
        .get("clearGazeCalibration")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let clear_smart_pointer = value
        .get("clearSmartPointer")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let has_video_enhancement = value.get("videoEnhancement").is_some();
    let has_selected_frame_rate = value.get("selectedFrameRate").is_some();
    let incoming: CameraPrefs = serde_json::from_value(value).map_err(|e| {
        crate::app_log::sync_emergency_line(
            "cmd_save",
            &format!("cmd_save_camera_prefs: prefs parse failed: {e}"),
        );
        "camera_prefs_invalid".to_string()
    })?;
    {
        let mut cfg = state.cfg.lock();
        cfg.camera_prefs = config::merge_camera_prefs_quiet(
            &cfg.camera_prefs,
            incoming,
            clear_gaze,
            has_video_enhancement,
            has_selected_frame_rate,
            clear_smart_pointer,
        );
        crate::config::save_config(&cfg);
    }
    crate::app_log::log_line(
        &state,
        "config",
        "cmd_save_camera_prefs source=camera quiet (skip mvp_init/voice)",
    );
    let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
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
