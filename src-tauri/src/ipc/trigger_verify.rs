//! Habit / Quick Start binding verify: listen for the trigger key without enabling
//! the mapping or calling SendInput. Uses verify-overlay bindings (no BindAll) so
//! re-verify does not reinstall hooks / freeze WebView2.

use tauri::{Emitter, WebviewWindow};

use crate::config::hotkey_registration_bindings;
use crate::press_gesture::{parse_physical_event, trigger_compat_event_matches};
use crate::AppState;

#[derive(Debug, Clone)]
pub struct TriggerVerifyListenSession {
    pub mapping_id: String,
    pub bindings: Vec<String>,
    pub trigger_key: String,
    pub target_key: String,
}

fn emit_trigger_test_fired(
    window: &WebviewWindow,
    mapping_id: &str,
    trigger_key: &str,
    target_key: &str,
    source_key: &str,
) {
    let payload = serde_json::json!({
        "type": "mvp_trigger_test_fired",
        "mappingId": mapping_id,
        "triggerKey": trigger_key,
        "targetKey": target_key,
        "sourceKey": source_key,
        "ok": true,
        "reason": "verify_listen",
    });
    window.emit("to_js", &payload).ok();
}

fn apply_verify_overlay(state: &AppState, bindings: &[String]) {
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.set_verify_overlay_bindings(bindings.to_vec());
    }
}

pub fn start_trigger_verify_listen(state: &AppState, mapping_id: &str) -> bool {
    let (bindings, trigger_key, target_key) = {
        let cfg = state.cfg.lock();
        let Some(m) = cfg.find_mapping_by_id(mapping_id) else {
            return false;
        };
        (
            hotkey_registration_bindings(m),
            m.trigger_key.clone(),
            m.target_key.clone(),
        )
    };
    if bindings.is_empty() {
        crate::app_log::log_line(
            state,
            "verify",
            &format!("start verify failed mapping={} reason=empty_bindings", mapping_id),
        );
        return false;
    }
    // Re-verify while already listening: same mapping/bindings → no hook churn.
    if let Some(session) = state.trigger_verify_listen.lock().as_ref() {
        if session.mapping_id == mapping_id && session.bindings == bindings {
            crate::app_log::log_line(
                state,
                "verify",
                &format!("start verify noop mapping={} reason=same_session", mapping_id),
            );
            return true;
        }
    }
    crate::app_log::log_line(
        state,
        "verify",
        &format!("start verify mapping={} bindings={}", mapping_id, bindings.join(",")),
    );
    state.trigger_verify_listen.lock().take();
    state.gesture.lock().reset();
    apply_verify_overlay(state, &bindings);
    *state.trigger_verify_listen.lock() = Some(TriggerVerifyListenSession {
        mapping_id: mapping_id.to_string(),
        bindings,
        trigger_key,
        target_key,
    });
    true
}

pub fn stop_trigger_verify_listen(state: &AppState) {
    if state.trigger_verify_listen.lock().take().is_some() {
        crate::app_log::log_line(state, "verify", "stop verify active=1");
        apply_verify_overlay(state, &[]);
    } else {
        crate::app_log::log_line(state, "verify", "stop verify active=0");
    }
}

pub fn trigger_verify_listen_active(state: &AppState) -> bool {
    state.trigger_verify_listen.lock().is_some()
}

/// Returns true when verify-listen is active (caller must not normal-dispatch).
pub fn handle_trigger_verify_listen(state: &AppState, window: &WebviewWindow, raw: &str) -> bool {
    let event = parse_physical_event(raw);
    if event.is_keyup {
        return true;
    }
    let matched = {
        let probe = state.trigger_verify_listen.lock();
        let Some(session) = probe.as_ref() else {
            return false;
        };
        trigger_compat_event_matches(&session.bindings, &event)
    };
    if !matched {
        return true;
    }
    let session = state.trigger_verify_listen.lock().take();
    let Some(session) = session else {
        return true;
    };
    crate::app_log::log_line(
        state,
        "verify",
        &format!(
            "verify matched mapping={} source={} target={}",
            session.mapping_id, event.key, session.target_key
        ),
    );
    apply_verify_overlay(state, &[]);
    emit_trigger_test_fired(
        window,
        &session.mapping_id,
        &session.trigger_key,
        &session.target_key,
        &event.key,
    );
    true
}
