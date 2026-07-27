use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::config::{self, CameraPrefs};
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

    // Camera / window-layout-only saves must not restart voice or push mvp_init —
    // that path raced MediaPipe + drawer re-render and 假死'd the UI (weak refit).
    if config::is_watcher_noise_only_change(&existing, &cfg) {
        crate::config::save_config(&cfg);
        *state.cfg.lock() = cfg;
        crate::app_log::log_line(
            &state,
            "config",
            "cmd_save layout/camera only, skip mvp_init/voice",
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
            "cmd_save codex_micro_pad only, skip mvp_init/voice",
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
            "cmd_save gesture/timing only, skip mvp_init/voice",
        );
        let ack = serde_json::json!({"type":"mvp_saved","ok":true,"quiet":true});
        window.emit("to_js", &ack).ok();
        return Ok(());
    }

    crate::config::save_config(&cfg);
    *state.cfg.lock() = cfg.clone();
    crate::config::apply_config(&state, &cfg);
    // Defer voice stop/start off the IPC thread. Sync Vosk join + main-thread emit used to
    // 假死 while JS awaited this invoke (especially after keys/cancel timing saves).
    let app = window.app_handle().clone();
    let state_bg = Arc::clone(state.inner());
    let old_bg = existing.clone();
    let new_bg = cfg.clone();
    let _ = std::thread::Builder::new()
        .name("voice-save-activate".into())
        .spawn(move || {
            crate::voice_bootstrap::apply_voice_config_change(&app, &state_bg, &old_bg, &new_bg);
            crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state_bg));
            crate::coach_hud::push_state(&app, &state_bg);
            crate::codex_micro_overlay::push_state(&app, &state_bg);
        });
    sync_config_ui(&state, &window, "unchanged");
    state.machine_pool.lock().reset_all();
    push_runtime(&state, &window, "saved", "");
    let ack = serde_json::json!({"type":"mvp_saved","ok":true});
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
        eprintln!("cmd_save_camera_prefs: parse failed: {e}");
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
        eprintln!("cmd_save_camera_prefs: prefs parse failed: {e}");
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
        "cmd_save_camera_prefs quiet (skip mvp_init/voice)",
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
