//! Structured runtime event ring for UI/tray sync.
//! Key state changes only — not for high-frequency sampling (mic level, partial text, cooldown ticks).

use tauri::AppHandle;

use crate::ipc::emit_to_main_if_available;
use crate::AppState;

pub use onetone_logic::runtime_event::{kind, now_ms, RuntimeEvent};

pub fn publish_runtime_event(
    app: Option<&AppHandle>,
    state: &AppState,
    source: &str,
    kind: &str,
    message: &str,
    payload: Option<serde_json::Value>,
) {
    publish_runtime_event_with_log(app, state, source, kind, message, payload, false);
}

pub fn publish_runtime_event_with_log(
    app: Option<&AppHandle>,
    state: &AppState,
    source: &str,
    kind: &str,
    message: &str,
    payload: Option<serde_json::Value>,
    also_log: bool,
) {
    let event = onetone_logic::runtime_event::publish(
        &state.runtime_events,
        source,
        kind,
        message,
        payload,
    );

    if also_log {
        crate::app_log::log_line(state, source, message);
    }

    if let Some(app) = app {
        let emit_payload = serde_json::json!({
            "type": "mvp_runtime_event",
            "event": event,
        });
        let _ = emit_to_main_if_available(app, Some(state), emit_payload);
        crate::tray_state::on_runtime_event_published(app, state, kind);
    }
}

pub fn recent_runtime_events(state: &AppState, limit: usize) -> Vec<RuntimeEvent> {
    onetone_logic::runtime_event::recent(&state.runtime_events, limit)
}
