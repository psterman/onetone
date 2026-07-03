use crate::AppState;

use super::emit::{emit_to_js_main, emit_to_main_if_available};

pub fn mvp_init_payload(state: &AppState, backdrop_mode: &str) -> serde_json::Value {
    let cfg = state.cfg.lock().clone();
    let conflicts = cfg.conflict_report();
    serde_json::json!({
        "type": "mvp_init",
        "config": cfg,
        "conflicts": conflicts,
        "update": crate::update::snapshot(state),
        "shell": {
            "customTitlebar": crate::backdrop::CUSTOM_TITLEBAR,
            "backdropMode": backdrop_mode,
        }
    })
}

pub fn push_mvp_init(state: &AppState, window: &tauri::WebviewWindow, backdrop_mode: &str) {
    emit_to_js_main(window, mvp_init_payload(state, backdrop_mode));
}

pub fn push_mvp_init_via_app(state: &AppState, app: &tauri::AppHandle, backdrop_mode: &str) {
    emit_to_main_if_available(app, Some(state), mvp_init_payload(state, backdrop_mode));
}

pub(crate) fn sync_config_ui(state: &AppState, window: &tauri::WebviewWindow, backdrop_mode: &str) {
    push_mvp_init(state, window, backdrop_mode);
}
