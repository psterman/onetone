use std::sync::Arc;

use tauri::{Manager, WebviewWindow};

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

/// Voice settings: temporarily unpark wake + allow mic while user speaks the wake phrase.
#[tauri::command]
pub fn cmd_voice_wake_phrase_test_begin(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    state.settings_asr_quiet.store(false, Ordering::SeqCst);
    state.voice_practice_hold_fg.store(true, Ordering::SeqCst);
    crate::app_log::log_line(state.as_ref(), "voice", "wake_phrase_test begin");
    crate::voice_bootstrap::activate_desired_engine(
        &app,
        state.inner(),
        "force:wake_phrase_test",
    );
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_voice_wake_phrase_test_end(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    park_voice: Option<bool>,
    #[allow(non_snake_case)]
    parkVoice: Option<bool>,
) -> serde_json::Value {
    use std::sync::atomic::Ordering;
    state.voice_practice_hold_fg.store(false, Ordering::SeqCst);
    let want_park = park_voice.or(parkVoice).unwrap_or(false);
    crate::app_log::log_line(
        state.as_ref(),
        "voice",
        &format!("wake_phrase_test end park={want_park}"),
    );
    if want_park {
        state.settings_asr_quiet.store(true, Ordering::SeqCst);
        crate::voice_bootstrap::schedule_park_wake_for_settings(state.inner());
    }
    let _ = app;
    serde_json::json!({ "ok": true })
}

#[tauri::command]
pub fn cmd_set_settings_drawer_open(
    state: tauri::State<Arc<AppState>>,
    window: WebviewWindow,
    open: bool,
    park_voice: Option<bool>,
    #[allow(non_snake_case)]
    parkVoice: Option<bool>,
) {
    use std::sync::atomic::Ordering;
    let want_park = open && park_voice.or(parkVoice).unwrap_or(false);
    let open_changed = {
        let mut gate = state.settings_drawer_open.lock();
        if *gate == open {
            false
        } else {
            *gate = open;
            true
        }
    };
    let was_parked = state.settings_asr_quiet.swap(want_park, Ordering::SeqCst);
    let park_changed = was_parked != want_park;
    if open_changed {
        crate::app_log::log_line(
            &state,
            "workflow",
            &format!("settings drawer open={open} park={want_park}"),
        );
        if open {
            let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
        } else {
            crate::codex_micro_overlay::clear_overlay_session_dismissed();
            crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
        }
        let app2 = window.app_handle().clone();
        let state2 = Arc::clone(state.inner());
        let _ = std::thread::Builder::new()
            .name("settings-acoustic-sync".into())
            .spawn(move || {
                crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(&app2), &state2);
            });
    } else if open {
        let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
    }
    if park_changed {
        crate::app_log::log_line(
            &state,
            "voice",
            &format!("settings voice park={want_park} open={open}"),
        );
        if want_park {
            crate::voice_bootstrap::schedule_park_wake_for_settings(state.inner());
        } else {
            crate::voice_bootstrap::schedule_unpark_wake_for_settings(
                &window.app_handle(),
                state.inner(),
            );
        }
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
