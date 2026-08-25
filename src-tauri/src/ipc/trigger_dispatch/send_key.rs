use std::sync::Arc;

use tauri::{Emitter, Manager};

use crate::app_chat_workflow;
use crate::app_identity;
use crate::config::{
    agent_key_binding_for_slot, find_app_scenario_for_dispatch,
    find_preferred_workflow_scenario_for_dispatch, is_app_scenario_mapping,
    resolve_foreground_workflow_target,
};
use crate::ipc::core::push_runtime_with_cue;
use crate::AppState;

fn push_soft_pad_success(app: &tauri::AppHandle, state: &AppState, mapping_id: &str, app_target: &str) {
    let Some(kind) = crate::soft_pad_runtime::AgentKind::from_app_target(app_target) else {
        return;
    };
    let mid = mapping_id.trim();
    if mid.is_empty() {
        crate::codex_micro_overlay::note_soft_pad_surface_for_agent(kind);
    } else {
        crate::codex_micro_overlay::note_soft_pad_surface_for_mapping(mid, kind);
    }
    crate::codex_micro_overlay::push_state(app, state);
}

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

fn emit_trigger_test_fired(
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    trigger_key: &str,
    target_key: &str,
    source_key: &str,
    ok: bool,
    reason: &str,
) {
    let payload = serde_json::json!({
        "type": "mvp_trigger_test_fired",
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
    emit_trigger_test_fired(
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
    let entry = crate::action_history::record_send_key(
        state.as_ref(),
        mapping_id,
        target_key,
        ok,
    );
    crate::action_history::emit_record_with_app(state.as_ref(), &window.app_handle(), entry);
}

fn try_dispatch_app_scenario_agent(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    app_mapping_id: &str,
) -> Option<bool> {
    let plan = {
        let cfg = state.cfg.lock();
        let m = cfg.find_mapping_by_id(app_mapping_id)?;
        let binding = agent_key_binding_for_slot(m, "pushToTalk")?;
        let action_id = binding.action_id.trim().to_string();
        if action_id.is_empty() {
            return None;
        }
        let provider_id = if m.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            m.agent_provider_id.clone()
        };
        Some((
            provider_id,
            action_id,
            binding.slot_id.clone(),
            binding.execution_mode.clone(),
            if binding.activation_scope.trim().is_empty() {
                None
            } else {
                Some(binding.activation_scope.clone())
            },
        ))
    };
    let (provider_id, action_id, slot_id, execution_mode, activation_scope) = plan?;
    let _ = (execution_mode, activation_scope, provider_id);
    // Build a minimal binding view for unified router ingress.
    let binding = crate::config::AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
        slot_id: slot_id.clone(),
        action_id: action_id.clone(),
        trigger_type: "key".into(),
        trigger_binding: String::new(),
        enabled: true,
        execution_mode: None,
        activation_scope: String::new(),
    };
    let result = crate::agent::dispatch::dispatch_semantic_binding(
        state,
        window,
        app_mapping_id,
        &binding,
        crate::agent::ActionChannel::Key,
    );
    Some(result.ok.unwrap_or(result.status == "executed"))
}

fn dispatch_app_workflow(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    workflow_mapping_id: &str,
    workflow_target: &str,
    log_mapping_id: &str,
    trigger_key: &str,
    target_key: &str,
    source_key: &str,
    duration_ms: u32,
) {
    let state2 = Arc::clone(state);
    let window2 = window.clone();
    let workflow_mapping_id = workflow_mapping_id.to_string();
    let workflow_target = workflow_target.to_string();
    let log_mapping_id = log_mapping_id.to_string();
    let trigger_key = trigger_key.to_string();
    let target_key = target_key.to_string();
    let source_key = source_key.to_string();
    crate::voice_end_runtime::arm_external_voice_send_suppression(state.as_ref(), 3500);
    let _ = std::thread::Builder::new()
        .name("app-workflow".into())
        .spawn(move || {
            match app_chat_workflow::run_for_target_id(
                &state2,
                &window2,
                &workflow_mapping_id,
                &workflow_target,
                duration_ms,
            ) {
                Ok(label) => {
                    push_soft_pad_success(
                        &window2.app_handle(),
                        state2.as_ref(),
                        &workflow_mapping_id,
                        &workflow_target,
                    );
                    finish_send_key_dispatch(
                        &state2,
                        &window2,
                        &log_mapping_id,
                        &trigger_key,
                        &target_key,
                        &source_key,
                        true,
                        "sent",
                        &label,
                    )
                }
                Err((prefix, err)) => {
                    let reason = err.reason(&prefix);
                    finish_send_key_dispatch(
                        &state2,
                        &window2,
                        &log_mapping_id,
                        &trigger_key,
                        &target_key,
                        &source_key,
                        false,
                        &reason,
                        &reason,
                    );
                }
            }
        });
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

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        let app = window.app_handle();
        let action =
            crate::voice_end_runtime::handle_trigger_press_while_dictating(state, &app, mapping_id);
        let (ok, reason, label) = match action {
            crate::voice_end_runtime::TriggerWhileDictatingAction::Cancelled => {
                (true, "cancelled", "esc")
            }
            crate::voice_end_runtime::TriggerWhileDictatingAction::Stopped => {
                (true, "stopped", "stop")
            }
        };
        finish_send_key_dispatch(
            state,
            window,
            mapping_id,
            &trigger_key,
            &target_key,
            source_key,
            ok,
            reason,
            label,
        );
        return;
    }

    // Foreground-aware routing: app scenario (Codex pack) vs global default.
    if let Some(fg) = app_identity::foreground_app_identity() {
        let (app_scenario_id, workflow_target) = {
            let cfg = state.cfg.lock();
            let app_id = find_app_scenario_for_dispatch(&cfg, &fg).map(|m| m.id.clone());
            let workflow = cfg
                .find_mapping_by_id(mapping_id)
                .and_then(|tm| resolve_foreground_workflow_target(tm, &fg));
            (app_id, workflow)
        };

        if let Some(ref app_id) = app_scenario_id {
            if let Some(true) = try_dispatch_app_scenario_agent(state, window, app_id) {
                let display_key = {
                    let cfg = state.cfg.lock();
                    let m = cfg.find_mapping_by_id(app_id);
                    crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, m)
                        .unwrap_or_else(|| key.to_string())
                };
                let app_target = {
                    let cfg = state.cfg.lock();
                    cfg.find_mapping_by_id(app_id)
                        .map(|m| m.app_target_id.clone())
                        .unwrap_or_default()
                };
                push_soft_pad_success(&window.app_handle(), state.as_ref(), app_id, &app_target);
                finish_send_key_dispatch(
                    state,
                    window,
                    mapping_id,
                    &trigger_key,
                    &display_key,
                    source_key,
                    true,
                    "sent",
                    "agent_action",
                );
                return;
            }
            // Only fall through to Composer workflow when the trigger mapping has no
            // native target_key.  When it does (e.g. XButton2 → RAlt for OneTone voice),
            // the native key should be sent instead.
            let app_workflow_target = if target_key.trim().is_empty() {
                let cfg = state.cfg.lock();
                cfg.find_mapping_by_id(app_id)
                    .map(|m| m.app_target_id.clone())
                    .filter(|t| app_chat_workflow::profile_for(t).is_some())
            } else {
                None
            };
            if let Some(target) = app_workflow_target {
                dispatch_app_workflow(
                    state,
                    window,
                    app_id,
                    &target,
                    mapping_id,
                    &trigger_key,
                    &target_key,
                    source_key,
                    duration_ms,
                );
                return;
            }
        }

        if let Some(workflow_target) = workflow_target {
            let workflow_mapping_id = app_scenario_id.unwrap_or_else(|| mapping_id.to_string());
            dispatch_app_workflow(
                state,
                window,
                &workflow_mapping_id,
                &workflow_target,
                mapping_id,
                &trigger_key,
                &target_key,
                source_key,
                duration_ms,
            );
            return;
        }
    }

    // Global trigger with no native target key: summon the configured workflow scene (e.g. Cursor).
    // If the mapping has a real target_key (e.g. RAlt for system IME), fall through to send it.
    let try_fallback_workflow = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(mapping_id)
            .map(|m| !is_app_scenario_mapping(m) && m.target_key.trim().is_empty())
            .unwrap_or(false)
    };
    if try_fallback_workflow {
        let fallback = {
            let cfg = state.cfg.lock();
            find_preferred_workflow_scenario_for_dispatch(&cfg).map(|m| {
                (m.id.clone(), m.app_target_id.trim().to_string())
            })
        };
        if let Some((scenario_id, target)) = fallback {
            if app_chat_workflow::profile_for(&target).is_some() {
                dispatch_app_workflow(
                    state,
                    window,
                    &scenario_id,
                    &target,
                    mapping_id,
                    &trigger_key,
                    &target_key,
                    source_key,
                    duration_ms,
                );
                return;
            }
        }
    }

    if app_chat_workflow::profile_for(&app_target_id).is_some() {
        match app_chat_workflow::run_for_target_id(
            state,
            window,
            mapping_id,
            &app_target_id,
            duration_ms,
        ) {
            Ok(label) => {
                push_soft_pad_success(&window.app_handle(), state.as_ref(), mapping_id, &app_target_id);
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
