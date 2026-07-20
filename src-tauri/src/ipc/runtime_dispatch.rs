use std::sync::Arc;

use tauri::AppHandle;
use tauri::Manager;

use crate::app_chat_workflow;
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
