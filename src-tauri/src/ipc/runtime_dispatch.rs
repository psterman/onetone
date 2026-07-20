use std::sync::Arc;

use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

use crate::app_chat_workflow::{self, CODEX_APP_TARGET_ID};
use crate::app_identity;
use crate::config::{effective_mapping_for_trigger, is_app_scenario_mapping};
use crate::key_chord::{build_pressed_chord, chord_parts, is_modifier_name, is_modifier_only_chord};
use crate::press_gesture::parse_physical_event;
use crate::runtime_event;
use crate::AgentModifierTapState;
use crate::AppState;

use super::trigger_dispatch::dispatch_trigger_action;

fn should_publish_input_obs(state: &AppState, kind: &str) -> bool {
    *state.recording.lock() || kind == runtime_event::kind::INPUT_PARSE_MISS
}

/// Publish low-frequency input observability events to the runtime ring.
pub fn handle_input_obs_event(
    state: &Arc<AppState>,
    app: &AppHandle,
    obs: crate::input_obs::InputObsEvent,
) {
    if !should_publish_input_obs(state, obs.kind) {
        return;
    }
    let message = match obs.kind {
        runtime_event::kind::INPUT_PARSE_MISS => "HID parse miss".into(),
        runtime_event::kind::INPUT_IGNORED => format!("Input ignored: {}", obs.reason),
        runtime_event::kind::INPUT_CAPTURED => format!("Input captured: {}", obs.key),
        other => other.to_string(),
    };
    let payload = serde_json::json!({
        "key": obs.key,
        "device": obs.device,
        "reportHex": obs.report_hex,
        "reason": obs.reason,
        "source": obs.source,
    });
    runtime_event::publish_runtime_event(
        Some(app),
        state,
        "input_ext",
        obs.kind,
        &message,
        Some(payload),
    );
}

fn track_agent_modifier_keydown(state: &Arc<AppState>, event: &crate::press_gesture::PhysicalKeyEvent) {
    if event.is_keyup {
        return;
    }
    let chord = build_pressed_chord(&event.key);
    if is_modifier_name(&event.key) {
        let should_track = {
            let cfg = state.cfg.lock();
            cfg.find_agent_modifier_tap_dispatch(&chord).is_some()
        };
        if should_track {
            *state.agent_modifier_tap.lock() = Some(AgentModifierTapState {
                key: event.key.clone(),
                combo_broken: false,
            });
        }
        return;
    }
    if let Some(pending) = state.agent_modifier_tap.lock().as_mut() {
        pending.combo_broken = true;
    }
}

fn clear_agent_modifier_tap(state: &Arc<AppState>, key: &str) {
    let mut pending = state.agent_modifier_tap.lock();
    if pending
        .as_ref()
        .is_some_and(|p| p.key == key)
    {
        *pending = None;
    }
}

fn execute_agent_binding(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    provider_id: &str,
    action_id: &str,
    slot_id: &str,
    execution_mode: Option<String>,
    activation_scope: Option<String>,
) {
    let _ = crate::agent::execute_agent_action(
        state,
        window,
        crate::agent::AgentExecuteRequest {
            provider_id: provider_id.to_string(),
            action_id: action_id.to_string(),
            mapping_id: Some(mapping_id.to_string()),
            slot_id: if slot_id.is_empty() {
                None
            } else {
                Some(slot_id.to_string())
            },
            execution_mode,
            activation_scope,
        },
    );
}

fn try_end_codex_numpad_hold(state: &Arc<AppState>, app: &AppHandle, source_id: &str) -> bool {
    let held = state.codex_numpad_hold_source.lock().clone();
    let Some(held_id) = held else {
        return false;
    };
    if held_id != source_id {
        return false;
    }
    *state.codex_numpad_hold_source.lock() = None;
    crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
    true
}

fn try_dispatch_codex_numpad(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    raw: &str,
) -> bool {
    let Some((source, key_down)) = crate::codex_numpad_layer::parse_event(raw) else {
        return false;
    };
    let source_id = source.id();
    let _ = window.emit(
        "to_js",
        &serde_json::json!({
            "type": "codex_micro_pad_key",
            "sourceId": source_id,
            "microKeyId": crate::codex_numpad_layer::lookup_route(&source)
                .map(|r| r.micro_key_id)
                .unwrap_or_default(),
            "phase": if key_down { "down" } else { "up" },
        }),
    );
    if let Some(route) = crate::codex_numpad_layer::lookup_route(&source) {
        crate::codex_micro_overlay::note_micro_key(&route.micro_key_id, key_down);
        crate::codex_micro_overlay::push_state(&window.app_handle(), state.as_ref());
    }

    let Some(route) = crate::codex_numpad_layer::lookup_route(&source) else {
        return true;
    };

    if route.is_hold {
        let app = window.app_handle();
        if !key_down {
            try_end_codex_numpad_hold(state, &app, &source_id);
            return true;
        }
        if state.codex_numpad_hold_source.lock().is_some() {
            return true;
        }
        let Some(profile) = app_chat_workflow::profile_for(CODEX_APP_TARGET_ID) else {
            return true;
        };
        *state.codex_numpad_hold_source.lock() = Some(source_id);
        let _ = app_chat_workflow::run_hold_voice_foreground(
            state,
            window,
            &route.mapping_id,
            &route.trigger_binding,
            profile,
        );
        return true;
    }

    if !key_down {
        return true;
    }
    execute_agent_binding(
        state,
        window,
        &route.mapping_id,
        &route.provider_id,
        &route.action_id,
        &route.slot_id,
        None,
        Some("foregroundApp".into()),
    );
    true
}

fn try_dispatch_codex_micro_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    raw: &str,
) -> bool {
    let Some((micro_key_id, key_down)) = crate::codex_numpad_layer::parse_micro_key_event(raw) else {
        return false;
    };
    let _ = fire_codex_micro_pad_key(state, window, &micro_key_id, key_down, true);
    true
}

/// Screen / overlay fire path for Micro keycaps (M2 run mode).
/// `emit_pad_event`: when true, notify main UI + overlay highlight (hardware path).
pub fn fire_codex_micro_pad_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    micro_key_id: &str,
    key_down: bool,
    emit_pad_event: bool,
) -> serde_json::Value {
    let micro_key_id = micro_key_id.trim();
    if micro_key_id.is_empty() {
        return serde_json::json!({ "ok": false, "reason": "invalid_key" });
    }
    if !crate::codex_numpad_layer::codex_foreground_for_micro() {
        return serde_json::json!({ "ok": false, "reason": "not_foreground" });
    }

    let app = window.app_handle();
    // Overlay invokes this command on its own webview; execute/hold need the main window.
    let exec_window = app
        .get_webview_window("main")
        .unwrap_or_else(|| window.clone());

    crate::codex_micro_overlay::note_micro_key(micro_key_id, key_down);
    crate::codex_micro_overlay::push_state(&app, state.as_ref());
    if emit_pad_event {
        let payload = serde_json::json!({
            "type": "codex_micro_pad_key",
            "microKeyId": micro_key_id,
            "phase": if key_down { "down" } else { "up" },
        });
        let _ = exec_window.emit("to_js", &payload);
    }

    let Some(route) = crate::codex_numpad_layer::lookup_route_by_micro_key(micro_key_id) else {
        return serde_json::json!({ "ok": false, "reason": "unbound" });
    };

    if route.is_hold {
        if !key_down {
            let held = state.codex_numpad_hold_source.lock().clone();
            if held.as_deref() == Some(micro_key_id) {
                *state.codex_numpad_hold_source.lock() = None;
                crate::voice_end_runtime::stop_dictation_after_trigger_key(state, &app);
            }
            return serde_json::json!({ "ok": true, "reason": "hold_up", "slotId": route.slot_id });
        }
        if state.codex_numpad_hold_source.lock().is_some() {
            return serde_json::json!({ "ok": true, "reason": "hold_busy", "slotId": route.slot_id });
        }
        let Some(profile) = app_chat_workflow::profile_for(CODEX_APP_TARGET_ID) else {
            return serde_json::json!({ "ok": false, "reason": "no_profile" });
        };
        *state.codex_numpad_hold_source.lock() = Some(micro_key_id.to_string());
        let _ = app_chat_workflow::run_hold_voice_foreground(
            state,
            &exec_window,
            &route.mapping_id,
            &route.trigger_binding,
            profile,
        );
        return serde_json::json!({ "ok": true, "reason": "hold_down", "slotId": route.slot_id });
    }

    if !key_down {
        return serde_json::json!({ "ok": true, "reason": "tap_up_ignored", "slotId": route.slot_id });
    }
    execute_agent_binding(
        state,
        &exec_window,
        &route.mapping_id,
        &route.provider_id,
        &route.action_id,
        &route.slot_id,
        None,
        Some("foregroundApp".into()),
    );
    serde_json::json!({
        "ok": true,
        "reason": "fired",
        "slotId": route.slot_id,
        "actionId": route.action_id,
    })
}

fn try_end_hold_voice_on_keyup(
    state: &Arc<AppState>,
    app: &AppHandle,
    event: &crate::press_gesture::PhysicalKeyEvent,
) -> bool {
    let Some(held) = crate::voice_end_runtime::held_voice_chord(state.as_ref()) else {
        return false;
    };
    let key = event.key.trim();
    let ends_hold = chord_parts(&held).iter().any(|part| {
        key.eq_ignore_ascii_case(part)
            || crate::key_chord::chord_token_matches(part, key)
    });
    if !ends_hold {
        return false;
    }
    crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
    true
}

fn try_dispatch_agent_modifier_keyup(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    event: &crate::press_gesture::PhysicalKeyEvent,
) -> bool {
    let pending = state.agent_modifier_tap.lock().take();
    let Some(pending) = pending else {
        return false;
    };
    if pending.combo_broken || pending.key != event.key {
        return false;
    }
    let chord = build_pressed_chord(&event.key);
    let (mapping_id, action_id, slot_id, provider_id, execution_mode, activation_scope) = {
        let cfg = state.cfg.lock();
        let Some((mapping, b)) = cfg.find_agent_modifier_tap_dispatch(&chord) else {
            return false;
        };
        let provider = if mapping.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            mapping.agent_provider_id.clone()
        };
        (
            mapping.id.clone(),
            b.action_id.clone(),
            b.slot_id.clone(),
            provider,
            b.execution_mode.clone(),
            if b.activation_scope.trim().is_empty() {
                None
            } else {
                Some(b.activation_scope.clone())
            },
        )
    };
    execute_agent_binding(
        state,
        window,
        &mapping_id,
        &provider_id,
        &action_id,
        &slot_id,
        execution_mode,
        activation_scope,
    );
    true
}

/// 解析物理按键事件，处理长按/双击手势后触发语音。
pub fn dispatch_physical_event(state: &Arc<AppState>, window: &tauri::WebviewWindow, raw: &str) {
    if raw.starts_with("codexNumpad:") {
        try_dispatch_codex_numpad(state, window, raw);
        return;
    }
    if raw.starts_with("codexMicroKey:") {
        try_dispatch_codex_micro_key(state, window, raw);
        return;
    }
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(raw);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    if event.is_keyup {
        if try_dispatch_agent_modifier_keyup(state, window, &event) {
            return;
        }
        clear_agent_modifier_tap(state, &event.key);
        let app = window.app_handle();
        if try_end_hold_voice_on_keyup(state, &app, &event) {
            return;
        }
        let maybe_dispatch = state.gesture.lock().on_keyup(&event);
        if let Some(dispatch_key) = maybe_dispatch {
            // For hold-to-talk (LongPress mode): key release should end the current dictation
            // session (if any) and run finish/send, instead of re-sending the wake key.
            crate::voice_end_runtime::stop_dictation_after_trigger_key(state, &app);
            let _ = dispatch_key;
        }
        return;
    }

    track_agent_modifier_keydown(state, &event);

    // Modifier-only agent bindings fire on keyup after a clean tap — never on keydown.
    let chord = build_pressed_chord(&event.key);
    if is_modifier_only_chord(&chord) {
        return;
    }

    // Agent chords registered via WM_HOTKEY (e.g. Codex pushToTalk Ctrl+Shift+D).
    if try_dispatch_agent_key(state, window, &event.key) {
        return;
    }

    let now = std::time::Instant::now();
    let fire_key = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mut gesture = state.gesture.lock();
        gesture.on_keydown(&event, mapping, now)
    };
    if let Some(key) = fire_key {
        handle_physical_key(state, window, &key);
    }
}

pub fn handle_physical_key(state: &Arc<AppState>, window: &tauri::WebviewWindow, key_name: &str) {
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(key_name);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    // Agent capability keys (Codex Micro pack) take priority over classic SendKey.
    if try_dispatch_agent_key(state, window, &event.key) {
        return;
    }
    let now = std::time::Instant::now();
    let (mapping_id, duration_ms, actions) = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mapping_id = mapping.id.clone();
        let duration_ms = cfg.key_press_duration_ms;

        // App-scenario long-press with Codex hold-to-talk: skip empty targetKey SendKey path.
        if mapping.trigger_mode == crate::config::TriggerMode::LongPress
            && is_app_scenario_mapping(mapping)
        {
            let app_target = mapping.app_target_id.trim().to_string();
            if let Some(voice_key) =
                crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, Some(mapping))
            {
                if crate::voice_end_runtime::is_hold_to_talk_voice_key(&voice_key) {
                    if let Some(profile) = app_chat_workflow::profile_for(&app_target) {
                        drop(cfg);
                        let ok = app_chat_workflow::run_hold_voice_foreground(
                            state,
                            window,
                            &mapping_id,
                            &voice_key,
                            profile,
                        )
                        .is_ok();
                        let cue = crate::config::runtime_sound_cue(
                            &state.cfg.lock(),
                            if ok { "key_wake" } else { "send_fail" },
                        );
                        crate::ipc::core::push_runtime_with_cue(
                            state.as_ref(),
                            window,
                            if ok { "codex_hold_start" } else { "codex_hold_failed" },
                            &mapping_id,
                            cue.as_deref(),
                        );
                        if ok {
                            crate::coach_hud::flash_success(&window.app_handle(), state.as_ref());
                        } else {
                            crate::coach_hud::push_state(&window.app_handle(), state.as_ref());
                        }
                        return;
                    }
                }
            }
        }

        let foreground = app_identity::foreground_app_identity();
        let effective = effective_mapping_for_trigger(mapping, foreground.as_ref());
        let actions = {
            let mut pool = state.machine_pool.lock();
            pool.get_or_create(&mapping_id)
                .trigger(&cfg, &effective, &event.key, now)
        };
        (mapping_id, duration_ms, actions)
    };
    let source_key = event.key.clone();
    for action in actions {
        dispatch_trigger_action(state, window, &mapping_id, duration_ms, &source_key, action);
    }
}

fn try_dispatch_agent_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    physical_key: &str,
) -> bool {
    let chord = if physical_key.contains('+') {
        crate::config::canonical_trigger(physical_key)
    } else {
        build_pressed_chord(physical_key)
    };
    if is_modifier_only_chord(&chord) {
        return false;
    }
    // WM_HOTKEY delivers the full chord string; only filter terminal-key events for
    // per-key hook delivery (e.g. keydown "D" while modifiers are held).
    if !physical_key.contains('+') {
        let parts = chord_parts(&chord);
        if parts.len() > 1 {
            let terminal = parts.last().map(String::as_str).unwrap_or("");
            if !physical_key.trim().eq_ignore_ascii_case(terminal)
                && !crate::key_chord::chord_token_matches(terminal, physical_key)
            {
                return false;
            }
        }
    }
    let (mapping_id, action_id, slot_id, provider_id, execution_mode, activation_scope) = {
        let cfg = state.cfg.lock();
        let Some((mapping, b)) = cfg.find_agent_key_dispatch(&chord) else {
            return false;
        };
        // Physical Ctrl+Shift+D must reach Codex as a native hold; only PageDown synthesizes it.
        if b.action_id == "startDictation" && crate::key_chord::is_hold_to_talk_chord(&chord) {
            return false;
        }
        if b.action_id == "startDictation"
            && crate::voice_end_runtime::session_state(state.as_ref()) == "dictating"
            && crate::voice_end_runtime::held_voice_chord(state.as_ref()).is_some()
        {
            return true;
        }
        let provider = if mapping.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            mapping.agent_provider_id.clone()
        };
        (
            mapping.id.clone(),
            b.action_id.clone(),
            b.slot_id.clone(),
            provider,
            b.execution_mode.clone(),
            if b.activation_scope.trim().is_empty() {
                None
            } else {
                Some(b.activation_scope.clone())
            },
        )
    };
    execute_agent_binding(
        state,
        window,
        &mapping_id,
        &provider_id,
        &action_id,
        &slot_id,
        execution_mode,
        activation_scope,
    );
    true
}
