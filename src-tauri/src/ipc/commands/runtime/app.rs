use crate::app_identity::{self, AppIdentity};

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
