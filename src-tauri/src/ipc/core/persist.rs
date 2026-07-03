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
    push_mvp_init_via_app(state, app, "unchanged");
    push_runtime_via_app(app, state, last_action, "", None);
    crate::tray::refresh_menu(app);
}
