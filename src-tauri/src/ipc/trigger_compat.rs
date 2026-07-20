use std::time::Instant;

use tauri::{Emitter, WebviewWindow};

use crate::config::hotkey_registration_bindings;
use crate::input_obs::InputObsEvent;
use crate::press_gesture::{
    parse_physical_event, short_device_label, trigger_compat_event_matches,
    TriggerCompatClassifier, TriggerCompatResult,
};
use crate::runtime_event;
use crate::AppState;

#[derive(Debug)]
pub struct TriggerCompatProbeSession {
    mapping_id: String,
    bindings: Vec<String>,
    classifier: TriggerCompatClassifier,
}

fn emit_trigger_compat_seen(window: &WebviewWindow, mapping_id: &str, key: &str, is_keyup: bool) {
    let phase = if is_keyup { "keyup" } else { "keydown" };
    let payload = serde_json::json!({
        "type": "mvp_trigger_compat_seen",
        "mappingId": mapping_id,
        "key": key,
        "phase": phase,
    });
    window.emit("to_js", &payload).ok();
}

fn emit_trigger_compat_result(
    window: &WebviewWindow,
    mapping_id: &str,
    result: &TriggerCompatResult,
) {
    let device_label = result
        .device
        .as_deref()
        .map(short_device_label)
        .unwrap_or_default();
    let viable_modes: Vec<&str> = result.verdict.viable_modes().to_vec();
    let payload = serde_json::json!({
        "type": "mvp_trigger_compat_result",
        "mappingId": mapping_id,
        "verdict": result.verdict.as_str(),
        "recommendedMode": result.verdict.recommended_mode(),
        "viableModes": viable_modes,
        "risk": result.risk.as_str(),
        "key": result.key,
        "device": result.device.clone().unwrap_or_default(),
        "deviceLabel": device_label,
        "sawKeydown": result.saw_keydown,
        "sawKeyup": result.saw_keyup,
    });
    window.emit("to_js", &payload).ok();
}

fn finish_probe_session(
    state: &AppState,
    window: &WebviewWindow,
    session: TriggerCompatProbeSession,
    result: TriggerCompatResult,
) {
    emit_trigger_compat_result(window, &session.mapping_id, &result);
    drop(session);
    *state.trigger_compat_probe.lock() = None;
}

pub fn start_trigger_compat_probe(state: &AppState, mapping_id: &str) -> bool {
    let bindings = {
        let mut cfg = state.cfg.lock();
        if cfg.find_mapping_by_id(mapping_id).is_none() {
            return false;
        }
        cfg.enable_mapping(mapping_id);
        let mapping = cfg.find_mapping_by_id(mapping_id).unwrap();
        hotkey_registration_bindings(mapping)
    };
    if bindings.is_empty() {
        return false;
    }
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        let cfg = state.cfg.lock();
        mgr.bind_all(&cfg.bindings());
        mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
    }
    state.gesture.lock().reset();
    let now = Instant::now();
    *state.trigger_compat_probe.lock() = Some(TriggerCompatProbeSession {
        mapping_id: mapping_id.to_string(),
        bindings,
        classifier: TriggerCompatClassifier::new(now),
    });
    true
}

pub fn stop_trigger_compat_probe(state: &AppState) {
    *state.trigger_compat_probe.lock() = None;
}

pub fn trigger_compat_probe_active(state: &AppState) -> bool {
    state.trigger_compat_probe.lock().is_some()
}

pub fn note_trigger_compat_obs(state: &AppState, obs: &InputObsEvent) -> bool {
    if obs.kind != runtime_event::kind::INPUT_PARSE_MISS {
        return false;
    }
    let mut probe = state.trigger_compat_probe.lock();
    let Some(session) = probe.as_mut() else {
        return false;
    };
    session.classifier.note_vendor_macro_risk();
    true
}

pub fn poll_trigger_compat_probe(state: &AppState, window: &WebviewWindow) {
    let maybe_result = {
        let mut probe = state.trigger_compat_probe.lock();
        let Some(session) = probe.as_mut() else {
            return;
        };
        session.classifier.poll(Instant::now())
    };
    if let Some(result) = maybe_result {
        let session = state.trigger_compat_probe.lock().take();
        if let Some(session) = session {
            finish_probe_session(state, window, session, result);
        }
    }
}

/// Returns true when probe is active and the physical event should not reach normal dispatch.
pub fn handle_trigger_compat_probe(state: &AppState, window: &WebviewWindow, raw: &str) -> bool {
    let event = parse_physical_event(raw);
    let (maybe_result, mapping_id, bindings, matched) = {
        let mut probe = state.trigger_compat_probe.lock();
        let Some(session) = probe.as_mut() else {
            return false;
        };
        let matched = trigger_compat_event_matches(&session.bindings, &event);
        let result = session
            .classifier
            .on_event(&event, &session.bindings, Instant::now());
        (
            result,
            session.mapping_id.clone(),
            session.bindings.clone(),
            matched,
        )
    };
    if matched {
        emit_trigger_compat_seen(window, &mapping_id, &event.key, event.is_keyup);
    }
    if let Some(result) = maybe_result {
        let session = state.trigger_compat_probe.lock().take();
        if let Some(session) = session {
            finish_probe_session(state, window, session, result);
        }
        return true;
    }
    let _ = bindings;
    true
}
