//! Claude Code / Claude Desktop → PadStatusCandidate.
//!
//! Keyboard core only sees unified PadStatus (`agent=claude`). Does not forge HID / thstatus.

use crate::pad_status::arbiter::DONE_SETTLE_MS;
use crate::pad_status::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};
use crate::pad_status::store;

/// Map Claude Code hook lifecycle event → core UI state.
/// Subagent* / Notification / compact: record-only (None).
pub fn map_claude_event_to_state(event: &str) -> Option<&'static str> {
    match event.trim() {
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch" => Some("running"),
        "PermissionRequest" | "Elicitation" => Some("needs_input"),
        "Stop" | "TaskCompleted" => Some("done"),
        "StopFailure" | "PostToolUseFailure" => Some("error"),
        "SessionStart" | "SessionEnd" => Some("idle"),
        _ => None,
    }
}

/// Safe ingest fields from Hook POST / probe (mirrors Codex payload shape).
#[derive(Debug, Clone, Default)]
pub struct ClaudeHookPayload {
    pub event: String,
    pub session_id: String,
    pub turn_id: String,
    pub ts: u64,
}

impl ClaudeHookPayload {
    pub fn from_json(value: &serde_json::Value) -> Self {
        let obj = value.as_object();
        let get = |keys: &[&str]| -> String {
            let Some(map) = obj else {
                return String::new();
            };
            for k in keys {
                if let Some(v) = map.get(*k) {
                    if let Some(s) = v.as_str() {
                        return s.trim().to_string();
                    }
                    if let Some(n) = v.as_u64() {
                        return n.to_string();
                    }
                }
            }
            String::new()
        };
        let ts = obj
            .and_then(|m| m.get("ts"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        Self {
            event: get(&["event", "hook_event_name", "hookEventName"]),
            session_id: get(&["sessionId", "session_id"]),
            turn_id: get(&["turnId", "turn_id", "task_id", "taskId"]),
            ts,
        }
    }
}

pub fn ingest_claude_event(raw: &serde_json::Value) -> Option<PadStatus> {
    let payload = ClaudeHookPayload::from_json(raw);
    if payload.event.is_empty() {
        return None;
    }
    Some(ingest_claude_payload(&payload))
}

pub fn ingest_claude_payload(payload: &ClaudeHookPayload) -> PadStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    ingest_claude_payload_at(payload, now)
}

pub fn ingest_claude_payload_at(payload: &ClaudeHookPayload, now: u64) -> PadStatus {
    let event = payload.event.trim();
    let incoming_session = payload.session_id.trim();

    let cur = store::snapshot_at(now);
    let sticky = matches!(
        cur.state_enum(),
        PadState::NeedsInput | PadState::Running
    );
    let foreign = !incoming_session.is_empty()
        && cur
            .session_id
            .as_ref()
            .map(|s| !s.is_empty() && s != incoming_session)
            .unwrap_or(false);
    if sticky && foreign && matches!(event, "Stop" | "SessionStart" | "SessionEnd") {
        return cur;
    }

    let Some(state_str) = map_claude_event_to_state(event) else {
        // Record-only events: keep status, refresh last_event when same agent.
        return cur;
    };
    let state = PadState::parse(state_str).unwrap_or(PadState::Idle);

    let sticky_until = match state {
        PadState::NeedsInput => Some(now.saturating_add(24 * 60 * 60 * 1000)),
        PadState::Done => Some(now.saturating_add(DONE_SETTLE_MS)),
        _ => None,
    };

    let message = match state {
        PadState::NeedsInput => Some("等待确认".into()),
        PadState::Running => Some("执行中".into()),
        PadState::Done => Some("本回合完成".into()),
        PadState::Error => Some("出现失败".into()),
        _ => None,
    };

    let session_id = if !incoming_session.is_empty() {
        Some(incoming_session.to_string())
    } else {
        cur.session_id.clone()
    };

    let cand = PadStatusCandidate {
        raw_tag: format!("claude:{}", event),
        status: PadStatus {
            state: state.as_str().into(),
            phase: None,
            source: PadSource::Hook.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: if payload.ts > 0 { payload.ts } else { now },
            agent: Some("claude".into()),
            task_id: {
                let t = payload.turn_id.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            },
            session_id,
            message,
            sticky_until,
            last_event: Some(event.to_string()),
        },
    };
    store::apply_candidate_at(cand, now).winner
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::store::{reset_for_test, test_lock};

    #[test]
    fn maps_core_claude_events() {
        assert_eq!(map_claude_event_to_state("UserPromptSubmit"), Some("running"));
        assert_eq!(map_claude_event_to_state("PermissionRequest"), Some("needs_input"));
        assert_eq!(map_claude_event_to_state("Stop"), Some("done"));
        assert_eq!(map_claude_event_to_state("StopFailure"), Some("error"));
        assert_eq!(map_claude_event_to_state("SubagentStart"), None);
    }

    #[test]
    fn ingest_sets_agent_claude_and_running() {
        let _g = test_lock();
        reset_for_test();
        let pad = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "UserPromptSubmit".into(),
                session_id: "s1".into(),
                turn_id: "t1".into(),
                ts: 100,
            },
            100,
        );
        assert_eq!(pad.state, "running");
        assert_eq!(pad.agent.as_deref(), Some("claude"));
        assert_eq!(pad.display_source_label(), "claude_hook");
        assert_eq!(pad.last_event.as_deref(), Some("UserPromptSubmit"));
    }

    #[test]
    fn permission_then_stop() {
        let _g = test_lock();
        reset_for_test();
        let _ = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "PermissionRequest".into(),
                session_id: "s".into(),
                turn_id: String::new(),
                ts: 1,
            },
            1,
        );
        let done = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "Stop".into(),
                session_id: "s".into(),
                turn_id: String::new(),
                ts: 2,
            },
            2,
        );
        assert_eq!(done.state, "done");
        assert_eq!(done.agent.as_deref(), Some("claude"));
    }
}
