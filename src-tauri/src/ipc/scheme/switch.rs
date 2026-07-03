use std::sync::Arc;

use tauri::Manager;

use crate::config;
use crate::ipc::core::{emit_to_js_main, push_runtime};
use crate::AppState;

pub fn handle_scheme_cycle(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    if *state.recording.lock() {
        return;
    }
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.cycle_scheme_same_trigger()
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime(state.as_ref(), window, "scheme_cycle_skip", "");
        return;
    };
    finish_scheme_switch(state, window, &from_id, &to_id, "scheme_cycle");
}

pub fn handle_scheme_select(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
) {
    if *state.recording.lock() {
        return;
    }
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.select_scheme(mapping_id)
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime(state.as_ref(), window, "scheme_select_skip", "");
        return;
    };
    finish_scheme_switch(state, window, &from_id, &to_id, "scheme_select");
}

fn finish_scheme_switch(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    from_id: &str,
    to_id: &str,
    action: &str,
) {
    state.machine_pool.lock().reset_all();
    {
        let cfg = state.cfg.lock();
        config::save_config(&cfg);
        config::apply_config(state, &cfg);
    }
    let label = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(to_id)
            .map(|m| m.display_label())
            .unwrap_or_default()
    };
    let cfg_snapshot = state.cfg.lock().clone();
    push_runtime(state.as_ref(), window, action, to_id);
    if !window.is_focused().unwrap_or(false) {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
    let payload = serde_json::json!({
        "type": "mvp_scheme_switched",
        "fromId": from_id,
        "toId": to_id,
        "label": label,
        "config": cfg_snapshot,
    });
    emit_to_js_main(window, payload);
    crate::tray::refresh_menu(window.app_handle());
}
