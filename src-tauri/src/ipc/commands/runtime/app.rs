use std::sync::Arc;

use tauri::Manager;

use crate::app_identity::{self, AppIdentity};
use crate::AppState;

#[tauri::command]
pub fn cmd_foreground_app() -> serde_json::Value {
    let Some(identity) = app_identity::foreground_app_identity() else {
        return serde_json::json!({
            "appId": serde_json::Value::Null,
        });
    };
    identity_to_json(&identity)
}

#[tauri::command]
pub fn cmd_app_icon(full_path: String) -> serde_json::Value {
    let path = full_path.trim();
    let icon = if path.is_empty() {
        None
    } else {
        app_identity::icon_data_url_for_path(Some(path))
    };
    serde_json::json!({ "iconDataUrl": icon })
}

#[tauri::command]
pub fn cmd_running_apps() -> serde_json::Value {
    let apps = app_identity::list_running_apps();
    serde_json::json!({ "apps": apps })
}

#[tauri::command]
pub fn cmd_set_setup_interaction_active(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    active: bool,
) {
    let changed = {
        let mut gate = state.setup_interaction_active.lock();
        if *gate == active {
            false
        } else {
            *gate = active;
            true
        }
    };
    if changed {
        crate::app_log::log_line(
            &state,
            "workflow",
            &format!("setup interaction active={active}"),
        );
        crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
    }
}

/// Practice stage only: block *external* wake inject (`send_wake_to_target`) while on-stage.
/// Local IME activate still goes through `cmd_voice_practice_activate_ime`.
#[tauri::command]
pub fn cmd_voice_set_practice_hold_fg(
    state: tauri::State<Arc<AppState>>,
    enabled: bool,
) {
    use std::sync::atomic::Ordering;
    let prev = state
        .voice_practice_hold_fg
        .swap(enabled, Ordering::SeqCst);
    if prev != enabled {
        crate::app_log::log_line(
            &state,
            "voice",
            &format!("practice_hold_fg={enabled}"),
        );
    }
}

/// Practice stage: focus stays on OneTone; send configured IME chord into this window.
#[tauri::command]
pub fn cmd_voice_practice_activate_ime(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    if !state.voice_practice_hold_fg.load(Ordering::SeqCst) {
        return serde_json::json!({
            "ok": false,
            "reason": "not_in_practice",
        });
    }
    let (target_key, duration_ms) = {
        let cfg = state.cfg.lock();
        // Prefer the IME / voice-engine shortcut (Win+H, RAlt, …), not app-scenario chords.
        let key = crate::voice_end_runtime::resolve_voice_input_target_key(&cfg)
            .unwrap_or_else(|| crate::voice_end_runtime::resolve_wake_target_key(&cfg, ""));
        (key, cfg.key_press_duration_ms)
    };
    let ok = crate::voice_end_runtime::send_wake_to_practice(
        Some(state.inner()),
        Some(&app),
        &target_key,
        duration_ms,
    );
    serde_json::json!({
        "ok": ok,
        "targetKey": target_key,
    })
}

#[tauri::command]
pub fn cmd_set_settings_drawer_open(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    open: bool,
) {
    let changed = {
        let mut gate = state.settings_drawer_open.lock();
        if *gate == open {
            false
        } else {
            *gate = open;
            true
        }
    };
    if changed {
        crate::app_log::log_line(
            &state,
            "workflow",
            &format!("settings drawer open={open}"),
        );
        // Park wake ASR flag + stop capture while configuring (cpal idle → UI_HB_STALL).
        state
            .settings_asr_quiet
            .store(open, std::sync::atomic::Ordering::SeqCst);
        // Opening settings: soft-dismiss float so always-on-top pad cannot cover the drawer
        // (gate alone races one tick behind FG host — feels like 假死 / 未响应).
        if open {
            let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
            crate::voice_bootstrap::schedule_park_wake_for_settings(state.inner());
        } else {
            // Symmetric with open→dismiss: closing settings must clear the session latch
            // or Soft Pad stays hidden until process restart when Cursor FG clear races fail.
            crate::codex_micro_overlay::clear_overlay_session_dismissed();
            crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
            crate::voice_bootstrap::schedule_unpark_wake_for_settings(
                &window.app_handle(),
                state.inner(),
            );
        }
        // Off IPC thread — sync command must not join acoustic stop (≤800ms) on the pump.
        let app2 = window.app_handle().clone();
        let state2 = Arc::clone(state.inner());
        let _ = std::thread::Builder::new()
            .name("settings-acoustic-sync".into())
            .spawn(move || {
                crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(&app2), &state2);
            });
    } else if open {
        // Re-entry while already open (panel hops): keep float down.
        let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
    }
}

fn identity_to_json(identity: &AppIdentity) -> serde_json::Value {
    let icon_data_url = app_identity::icon_data_url_for_path(identity.full_path.as_deref());
    let display_name = app_identity::identity_display_name(identity);
    serde_json::json!({
        "appId": identity.matched_preset_app_id.clone(),
        "pid": identity.pid,
        "exeName": identity.exe_name,
        "fullPath": identity.full_path,
        "windowTitle": identity.window_title,
        "displayName": display_name,
        "matchedPresetAppId": identity.matched_preset_app_id,
        "iconDataUrl": icon_data_url,
    })
}
