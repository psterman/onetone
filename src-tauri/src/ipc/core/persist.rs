use tauri::Manager;

use crate::config;
use crate::AppState;

use super::init::sync_config_ui;
use super::runtime::push_runtime;

pub(crate) fn persist_and_rebind(state: &AppState, window: &tauri::WebviewWindow, last_action: &str) {
    let cfg = state.cfg.lock().clone();
    config::save_config(&cfg);
    config::apply_config(state, &cfg);
    sync_config_ui(state, window, "unchanged");
    push_runtime(state, window, last_action, "");
    crate::tray::refresh_menu(window.app_handle());
}
