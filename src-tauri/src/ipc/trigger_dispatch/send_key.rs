use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::app_chat_workflow;
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

fn finish_send_key_dispatch(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    trigger_key: &str,
    target_key: &str,
    source_key: &str,
    ok: bool,
    reason: &str,
    label: &str,
) {
    emit_onboarding_trigger_fired(
        window,
        mapping_id,
        trigger_key,
        target_key,
        source_key,
        ok,
        reason,
    );
    let sound_cue = if ok {
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
    if ok {
        crate::coach_hud::flash_success(&window.app_handle(), state.as_ref());
    } else {
        crate::coach_hud::push_state(&window.app_handle(), state.as_ref());
    }
}

pub(super) fn dispatch_send_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    duration_ms: u32,
    source_key: &str,
    key: &str,
) {
    let mapping_snapshot = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(mapping_id).map(|m| {
            (
                m.trigger_key.clone(),
                m.target_key.clone(),
                m.app_target_id.clone(),
            )
        })
    };

    let Some((trigger_key, target_key, app_target_id)) = mapping_snapshot else {
        finish_send_key_dispatch(
            state,
            window,
            mapping_id,
            "",
            key,
            source_key,
            false,
            "send_failed",
            "send_failed",
        );
        return;
    };

    if app_chat_workflow::profile_for(&app_target_id).is_some() {
        match app_chat_workflow::run_for_target_id(
            state,
            window,
            mapping_id,
            &app_target_id,
            duration_ms,
        ) {
            Ok(label) => {
                finish_send_key_dispatch(
                    state,
                    window,
                    mapping_id,
                    &trigger_key,
                    &target_key,
                    source_key,
                    true,
                    "sent",
                    &label,
                );
            }
            Err((prefix, err)) => {
                let reason = err.reason(&prefix);
                finish_send_key_dispatch(
                    state,
                    window,
                    mapping_id,
                    &trigger_key,
                    &target_key,
                    source_key,
                    false,
                    &reason,
                    &reason,
                );
            }
        }
        return;
    }

    let sent = crate::voice_end_runtime::send_wake_to_target(
        Some(state.as_ref()),
        Some(&window.app_handle()),
        key,
        duration_ms,
    );
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
    let label = if sent { key } else { "send_failed" };
    finish_send_key_dispatch(
        state,
        window,
        mapping_id,
        &trigger_key,
        key,
        source_key,
        sent,
        reason,
        label,
    );
}
