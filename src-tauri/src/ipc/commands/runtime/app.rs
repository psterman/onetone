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
        // Opening settings: soft-dismiss float so always-on-top pad cannot cover the drawer
        // (gate alone races one tick behind FG host — feels like 假死 / 未响应).
        if open {
            let _ = crate::codex_micro_overlay::dismiss_overlay(&window.app_handle(), state.inner());
        } else {
            crate::codex_micro_overlay::push_state(&window.app_handle(), state.inner());
        }
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
