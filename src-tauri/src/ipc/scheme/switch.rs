use std::sync::Arc;
use std::time::Instant;

use tauri::AppHandle;

use crate::coach_hud;
use crate::config;
use crate::ipc::core::{emit_to_main_if_available, get_main_window, push_runtime_via_app};
use crate::AppState;

pub fn handle_scheme_cycle(state: &Arc<AppState>, app: &AppHandle) {
    if *state.recording.lock() {
        return;
    }
    let old_cfg = state.cfg.lock().clone();
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.cycle_scheme_same_trigger()
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime_via_app(app, state.as_ref(), "scheme_cycle_skip", "", None);
        return;
    };
    finish_scheme_switch(state, app, &from_id, &to_id, "scheme_cycle", &old_cfg);
}

pub fn handle_scheme_select(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    if *state.recording.lock() {
        let payload = serde_json::json!({
            "type": "mvp_scheme_select_blocked",
            "reason": "recording",
            "mappingId": mapping_id,
        });
        emit_to_main_if_available(app, Some(state), payload);
        return;
    }
    let old_cfg = state.cfg.lock().clone();
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.select_scheme(mapping_id)
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime_via_app(app, state.as_ref(), "scheme_select_skip", "", None);
        return;
    };
    finish_scheme_switch(state, app, &from_id, &to_id, "scheme_select", &old_cfg);
}

fn finish_scheme_switch(
    state: &Arc<AppState>,
    app: &AppHandle,
    from_id: &str,
    to_id: &str,
    action: &str,
    old_cfg: &config::VoiceConfig,
) {
    let t0 = Instant::now();
    state.machine_pool.lock().reset_all();
    let (label, cfg_snapshot) = {
        let cfg = state.cfg.lock();
        config::apply_config(state, &cfg);
        let label = cfg
            .find_mapping_by_id(to_id)
            .map(|m| m.display_label())
            .unwrap_or_default();
        (label, cfg.clone())
    };
    crate::voice_bootstrap::apply_voice_config_change(app, state, old_cfg, &cfg_snapshot);
    // Never pretty-print settings.json on the scheme-select IPC thread — that
    // held cfg.lock and 假死'd homepage chip clicks.
    let _ = std::thread::Builder::new()
        .name("scheme-save".into())
        .spawn(move || {
            config::save_config(&cfg_snapshot);
        });
    push_runtime_via_app(app, state.as_ref(), action, to_id, None);
    if let Some(window) = get_main_window(app) {
        if !window.is_focused().unwrap_or(false) {
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
    // FE already has mappings; full config in this event made the webview parse
    // the whole settings blob on every chip click.
    let payload = serde_json::json!({
        "type": "mvp_scheme_switched",
        "fromId": from_id,
        "toId": to_id,
        "label": label,
    });
    emit_to_main_if_available(app, Some(state), payload);
    crate::app_log::log_line(
        state.as_ref(),
        "scheme",
        &format!(
            "scheme switched {from_id} -> {to_id} action={action} apply_ms={}",
            t0.elapsed().as_millis()
        ),
    );
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "scheme",
        crate::runtime_event::kind::SCHEME_SWITCHED,
        &format!("scheme switched: {from_id} -> {to_id}"),
        Some(serde_json::json!({ "fromId": from_id, "toId": to_id, "action": action })),
    );
    crate::tray::refresh_menu(app);
    coach_hud::reset_session_dismissed(state.as_ref());
    coach_hud::push_state(app, state.as_ref());
}
