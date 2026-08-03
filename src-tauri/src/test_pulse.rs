//! Ephemeral test-pulse results — never updates formal CapabilityHealth.lastSuccessAt.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPulseResult {
    pub nonce: String,
    pub probe_ok: bool,
    pub listener_ok: bool,
    pub auth_ok: bool,
    pub snapshot_ok: bool,
    pub completed_at: u64,
    pub message: String,
}

fn store() -> &'static Mutex<HashMap<String, TestPulseResult>> {
    static STORE: OnceLock<Mutex<HashMap<String, TestPulseResult>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Record an authenticated test pulse. Must not touch AttentionStore or CapabilityHealth.
pub fn record(
    nonce: &str,
    probe_ok: bool,
    listener_ok: bool,
    auth_ok: bool,
    snapshot_ok: bool,
    message: &str,
) -> TestPulseResult {
    let result = TestPulseResult {
        nonce: nonce.trim().to_string(),
        probe_ok,
        listener_ok,
        auth_ok,
        snapshot_ok,
        completed_at: now_ms(),
        message: message.to_string(),
    };
    if !result.nonce.is_empty() {
        store()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(result.nonce.clone(), result.clone());
    }
    result
}

pub fn get(nonce: &str) -> Option<TestPulseResult> {
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(nonce.trim())
        .cloned()
}

#[cfg(test)]
pub fn reset_for_test() {
    store().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connector_health::{self, CapabilityKind, HealthState, ValueState};
    use crate::soft_pad_runtime::AgentKind;

    #[test]
    fn test_pulse_does_not_touch_formal_health_success() {
        reset_for_test();
        connector_health::reset_for_test();
        connector_health::upsert(
            AgentKind::Cursor,
            CapabilityKind::Lifecycle,
            HealthState::ConfiguredWaiting,
            ValueState::Absent,
            "waiting_first_event",
            "",
            "cursor_hook",
            10,
            false,
        );
        let before = connector_health::get(AgentKind::Cursor, CapabilityKind::Lifecycle);
        assert_eq!(before.last_success_at, 0);

        let pulse = record("nonce-1", true, true, true, true, "ok");
        assert!(pulse.auth_ok);
        assert_eq!(get("nonce-1").map(|p| p.nonce), Some("nonce-1".into()));

        let after = connector_health::get(AgentKind::Cursor, CapabilityKind::Lifecycle);
        assert_eq!(after.last_success_at, 0);
        assert_eq!(after.state, "configured_waiting");
    }
}
