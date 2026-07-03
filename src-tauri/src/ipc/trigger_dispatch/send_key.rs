use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::ipc::core::push_runtime_with_cue;
use crate::AppState;

fn emit_onboarding_trigger_fired(
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    trigger_key: &str,
    target_key: &str,
    source_key: &str,
    ok: bool,
    reason: &str,
) {
    let payload = serde_json::json!({
        "type": "mvp_onboarding_trigger_fired",
        "mappingId": mapping_id,
        "triggerKey": trigger_key,
        "targetKey": target_key,
        "sourceKey": source_key,
        "ok": ok,
        "reason": reason,
    });
    window.emit("to_js", &payload).ok();
}

pub(super) fn dispatch_send_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    duration_ms: u32,
    source_key: &str,
    key: &str,
) {
    let sent = crate::voice_end_runtime::send_wake_to_target(
        Some(state.as_ref()),
        Some(&window.app_handle()),
        key,
        duration_ms,
    );
    let trigger_key = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(mapping_id)
            .map(|m| m.trigger_key.clone())
            .unwrap_or_default()
    };
    if sent {
        let app = window.app_handle();
        if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
            crate::voice_end_runtime::stop_dictation_after_trigger_key(state, &app);
        } else {
            let should_enter = {
                let cfg = state.cfg.lock();
                if !crate::voice_end_runtime::can_enter_dictating(&cfg) {
                    false
                } else if let Some(m) = cfg.find_mapping_by_id(mapping_id) {
                    !m.native_key_restore && !m.target_key.trim().is_empty() && key == m.target_key
                } else {
                    false
                }
            };
            if should_enter {
                crate::voice_end_runtime::enter_dictating(
                    state,
                    Some(&app),
                    mapping_id,
                    "physical trigger",
                );
            }
        }
    }
    let reason = if sent { "sent" } else { "send_failed" };
    emit_onboarding_trigger_fired(
        window,
        mapping_id,
        &trigger_key,
        key,
        source_key,
        sent,
        reason,
    );
    let label = if sent { key } else { "send_failed" };
    let sound_cue = if sent {
        crate::config::runtime_sound_cue(&state.cfg.lock(), "key_wake")
    } else {
        crate::config::runtime_sound_cue(&state.cfg.lock(), "send_fail")
    };
    push_runtime_with_cue(
        state.as_ref(),
        window,
        label,
        mapping_id,
        sound_cue.as_deref(),
    );
}
