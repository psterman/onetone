//! Structured runtime event ring — pure logic, no UI/native deps.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::Mutex;

pub const RUNTIME_EVENT_RING_CAPACITY: usize = 300;

/// Structured runtime event `kind` values (wire protocol strings).
pub mod kind {
    pub const CONFIG_CHANGED: &str = "config_changed";
    pub const VOICE_BOOTSTRAP: &str = "voice_bootstrap";
    pub const VOICE_RESTART: &str = "voice_restart";
    pub const VOICE_NO_CHANGE: &str = "voice_no_change";
    pub const LISTEN_PAUSED: &str = "listen_paused";
    pub const LISTEN_RESUMED: &str = "listen_resumed";
    pub const SCHEME_SWITCHED: &str = "scheme_switched";
    pub const STARTUP_POLICY: &str = "startup_policy";
    pub const VOICE_STATE_CHANGED: &str = "voice_state_changed";
    pub const VOICE_ERROR: &str = "voice_error";
    pub const VOICE_WAKE_TRIGGERED: &str = "voice_wake_triggered";
    pub const VOICE_SEND_FAILED: &str = "voice_send_failed";
    pub const SESSION_STARTED: &str = "session_started";
    pub const SESSION_ENDED: &str = "session_ended";
    pub const END_PHRASE_MATCHED: &str = "end_phrase_matched";
    pub const SEND_PHRASE_MATCHED: &str = "send_phrase_matched";
    pub const CANCEL_PHRASE_MATCHED: &str = "cancel_phrase_matched";
    pub const INPUT_CAPTURED: &str = "input_captured";
    pub const INPUT_IGNORED: &str = "input_ignored";
    pub const INPUT_PARSE_MISS: &str = "input_parse_miss";
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    pub seq: u64,
    pub ts_ms: u64,
    pub source: String,
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
}

pub struct RuntimeEventRing {
    pub seq: AtomicU64,
    pub ring: Mutex<VecDeque<RuntimeEvent>>,
}

impl RuntimeEventRing {
    pub fn new() -> Self {
        Self {
            seq: AtomicU64::new(0),
            ring: Mutex::new(VecDeque::new()),
        }
    }
}

impl Default for RuntimeEventRing {
    fn default() -> Self {
        Self::new()
    }
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl RuntimeEvent {
    pub fn new(
        seq: u64,
        source: &str,
        kind: &str,
        message: &str,
        payload: Option<serde_json::Value>,
    ) -> Self {
        Self {
            seq,
            ts_ms: now_ms(),
            source: source.into(),
            kind: kind.into(),
            message: message.into(),
            payload,
        }
    }
}

pub fn publish(
    store: &RuntimeEventRing,
    source: &str,
    kind: &str,
    message: &str,
    payload: Option<serde_json::Value>,
) -> RuntimeEvent {
    let seq = store.seq.fetch_add(1, Ordering::Relaxed) + 1;
    let event = RuntimeEvent::new(seq, source, kind, message, payload);
    let mut ring = store.ring.lock();
    if ring.len() >= RUNTIME_EVENT_RING_CAPACITY {
        ring.pop_front();
    }
    ring.push_back(event.clone());
    event
}

pub fn recent(store: &RuntimeEventRing, limit: usize) -> Vec<RuntimeEvent> {
    let ring = store.ring.lock();
    let start = ring.len().saturating_sub(limit);
    ring.iter().skip(start).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publish_writes_to_ring() {
        let store = RuntimeEventRing::new();
        publish(&store, "test", "test_kind", "hello", None);
        let events = recent(&store, 10);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].seq, 1);
        assert_eq!(events[0].kind, "test_kind");
        assert_eq!(events[0].message, "hello");
    }

    #[test]
    fn ring_evicts_oldest_when_over_capacity() {
        let store = RuntimeEventRing::new();
        for i in 0..RUNTIME_EVENT_RING_CAPACITY + 5 {
            publish(&store, "test", "tick", &format!("msg-{i}"), None);
        }
        let ring = store.ring.lock();
        assert_eq!(ring.len(), RUNTIME_EVENT_RING_CAPACITY);
        assert_eq!(ring.front().map(|e| e.message.as_str()), Some("msg-5"));
        let expected_last = format!("msg-{}", RUNTIME_EVENT_RING_CAPACITY + 4);
        assert_eq!(
            ring.back().map(|e| e.message.as_str()),
            Some(expected_last.as_str())
        );
    }

    #[test]
    fn recent_returns_tail_limit() {
        let store = RuntimeEventRing::new();
        for i in 0..20 {
            publish(&store, "test", "tick", &format!("msg-{i}"), None);
        }
        let recent_events = recent(&store, 5);
        assert_eq!(recent_events.len(), 5);
        assert_eq!(recent_events[0].message, "msg-15");
        assert_eq!(recent_events[4].message, "msg-19");
    }
}
