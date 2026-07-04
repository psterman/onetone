use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::config;
use crate::AppState;

use super::init::push_mvp_init_via_app;
use super::runtime::push_runtime_via_app;

pub(crate) fn persist_and_rebind(
    state: &AppState,
    window: &tauri::WebviewWindow,
    last_action: &str,
) {
    persist_and_rebind_via_app(state, window.app_handle(), last_action);
}

pub(crate) fn persist_and_rebind_via_app(state: &AppState, app: &AppHandle, last_action: &str) {
    let cfg = state.cfg.lock().clone();
    config::save_config(&cfg);
    config::apply_config(state, &cfg);
    if let Some(state_arc) = app.try_state::<Arc<AppState>>() {
        crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state_arc.inner()));
    }
    push_mvp_init_via_app(state, app, "unchanged");
    push_runtime_via_app(app, state, last_action, "", None);
    crate::tray::refresh_menu(app);
}
