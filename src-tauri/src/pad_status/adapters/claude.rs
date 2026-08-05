//! Claude Code / Claude Desktop → PadStatusCandidate + Claude multi-lights.
//!
//! SubagentStart/Stop update `claude_lights` only — never primary PadStatus.
//! Does not forge HID / thstatus.

use crate::pad_status::arbiter::DONE_SETTLE_MS;
use crate::pad_status::claude_lights::{self, affects_primary_pad_status};
use crate::pad_status::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};
use crate::pad_status::store;

/// Map Claude Code hook lifecycle event → core UI state for primary PadStatus.
/// Subagent* never maps here (handled only by claude_lights).
pub fn map_claude_event_to_state(event: &str) -> Option<&'static str> {
    match event.trim() {
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch" => Some("running"),
        "PermissionRequest" | "Elicitation" => Some("needs_input"),
        "Stop" | "TaskCompleted" => Some("done"),
        "StopFailure" | "PostToolUseFailure" => Some("error"),
        // Session* never touch primary PadStatus (near-window bump only for SessionStart).
        "SessionStart" | "SessionEnd" | "SubagentStart" | "SubagentStop" => None,
        _ => None,
    }
}

/// Safe ingest fields from Hook POST / probe (mirrors Codex payload shape).
#[derive(Debug, Clone, Default)]
pub struct ClaudeHookPayload {
    pub event: String,
    pub session_id: String,
    pub turn_id: String,
    pub agent_id: String,
    pub agent_type: String,
    pub cwd: String,
    pub ts: u64,
    /// claude_hook | claude_app
    pub source: String,
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
        let source = get(&["source"]);
        Self {
            event: get(&["event", "hook_event_name", "hookEventName"]),
            session_id: get(&["sessionId", "session_id"]),
            turn_id: get(&["turnId", "turn_id", "task_id", "taskId"]),
            agent_id: get(&["agentId", "agent_id"]),
            agent_type: get(&["agentType", "agent_type"]),
            cwd: get(&["cwd"]),
            ts,
            source: if source.is_empty() {
                "claude_hook".into()
            } else {
                source
            },
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
    let src_label = if payload.source.trim() == "claude_app" {
        "claude_app"
    } else {
        "claude_hook"
    };

    let at = if payload.ts > 0 { payload.ts } else { now };

    // Lane lifecycle must run before the primary-light early returns below.
    // Hook cwd is session-scoped; a high-confidence foreground latch supplies
    // HWND/PID only for live events and is cleared by SessionEnd in LaneStore.
    {
        use crate::agent_lane::store::{ingest_lane_event, LaneIngest};
        use crate::soft_pad_runtime::AgentKind;
        let sub = if payload.agent_id.trim().is_empty() {
            None
        } else {
            Some(payload.agent_id.clone())
        };
        let is_end = matches!(event, "SessionEnd" | "sessionEnd");
        let is_session_start = matches!(event, "SessionStart" | "sessionStart");
        // SessionStart floods at CLI boot — skip process-tree latch (hwnd/pid optional).
        let (host_pid, terminal_hwnd, latch_cwd) = if is_end || is_session_start {
            (0u32, 0u64, String::new())
        } else {
            let latch = crate::claude_cli_session::claude_cli_session_latch();
            if latch.confidence == "high"
                && (latch.session_id.is_empty() || latch.session_id == payload.session_id)
            {
                (latch.terminal_pid, latch.hwnd as u64, latch.cwd)
            } else {
                (0u32, 0u64, String::new())
            }
        };
        let cwd = if payload.cwd.trim().is_empty() {
            latch_cwd
        } else {
            payload.cwd.clone()
        };
        let _ = ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: cwd.clone(),
            session_id: payload.session_id.clone(),
            subagent_id: sub,
            title: if payload.agent_type.is_empty() {
                None
            } else {
                Some(payload.agent_type.clone())
            },
            event: event.into(),
            source: src_label.into(),
            cwd,
            host_pid,
            terminal_hwnd,
            sequence: None,
            at: Some(at),
        });
    }

    // SessionStart: Soft Pad near-window only — no light, no primary.
    if claude_lights::is_session_start(event) {
        claude_lights::bump_activity(src_label, at);
        return store::snapshot_at(now);
    }
    if claude_lights::is_session_lifecycle(event) {
        return store::snapshot_at(now);
    }

    // Always feed multi-light store (Subagent* included). Never skip this for Subagent.
    claude_lights::apply_claude_light(
        event,
        &payload.agent_id,
        &payload.agent_type,
        src_label,
        &payload.session_id,
        &payload.turn_id,
        payload.ts,
        now,
    );
    // Durable Soft Pad near-window stamp (even when light map skips unknown events).
    claude_lights::bump_activity(src_label, at);

    // Subagent* must not touch primary PadStatus.
    if !affects_primary_pad_status(event) {
        return store::snapshot_at(now);
    }

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
    if sticky && foreign && matches!(event, "Stop") {
        return cur;
    }

    let Some(state_str) = map_claude_event_to_state(event) else {
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
    let winner = store::apply_candidate_at(cand, now).winner;
    // Dual-write AttentionStore (Arbiter waiting); PadStatus sticky stays overlay-only.
    crate::agent_attention::ingest_claude_hook_event(
        event,
        incoming_session,
        payload.turn_id.trim(),
        src_label,
    );
    if matches!(event, "PermissionRequest" | "Elicitation") {
        crate::claude_cli_session::note_permission_request(
            incoming_session,
            payload.turn_id.trim(),
        );
    }
    winner
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::claude_lights;
    use crate::pad_status::store::{reset_for_test, test_lock};

    #[test]
    fn maps_core_claude_events() {
        assert_eq!(map_claude_event_to_state("UserPromptSubmit"), Some("running"));
        assert_eq!(map_claude_event_to_state("PermissionRequest"), Some("needs_input"));
        assert_eq!(map_claude_event_to_state("Stop"), Some("done"));
        assert_eq!(map_claude_event_to_state("StopFailure"), Some("error"));
        assert_eq!(map_claude_event_to_state("SubagentStart"), None);
        assert_eq!(map_claude_event_to_state("SessionStart"), None);
        assert_eq!(map_claude_event_to_state("SessionEnd"), None);
    }

    #[test]
    fn session_start_bumps_activity_without_light_or_primary() {
        let _g = test_lock();
        reset_for_test();
        claude_lights::reset_for_test();
        let before = store::snapshot_at(10);
        assert_eq!(before.state, "idle");
        let after = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "SessionStart".into(),
                session_id: "s-sess".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 100,
                source: "claude_hook".into(),
            },
            100,
        );
        assert_eq!(after.state, "idle");
        assert!(claude_lights::snapshot_active(100).is_empty());
        assert_eq!(claude_lights::last_activity_age_ms(150), Some(50));
        assert!(crate::codex_micro_overlay::claude_activity_hold_at(150));
    }

    #[test]
    fn ingest_sets_agent_claude_and_running() {
        let _g = test_lock();
        reset_for_test();
        claude_lights::reset_for_test();
        let pad = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "UserPromptSubmit".into(),
                session_id: "s1".into(),
                turn_id: "t1".into(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 100,
                source: "claude_hook".into(),
            },
            100,
        );
        assert_eq!(pad.state, "running");
        assert_eq!(pad.agent.as_deref(), Some("claude"));
        assert_eq!(pad.display_source_label(), "claude_hook");
        assert_eq!(pad.last_event.as_deref(), Some("UserPromptSubmit"));
    }

    #[test]
    fn subagent_does_not_mutate_primary_pad() {
        let _g = test_lock();
        reset_for_test();
        claude_lights::reset_for_test();
        // Seed Codex-like primary idle
        let before = store::snapshot_at(1);
        assert_eq!(before.state, "idle");
        let after = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "SubagentStart".into(),
                session_id: "s".into(),
                turn_id: String::new(),
                agent_id: "agent-a".into(),
                agent_type: "code-reviewer".into(),
                cwd: String::new(),
                ts: 50,
                source: "claude_hook".into(),
            },
            50,
        );
        assert_eq!(after.state, "idle");
        assert!(after.agent.is_none() || after.agent.as_deref() != Some("claude") || after.last_event.as_deref() != Some("SubagentStart"));
        let lights = claude_lights::snapshot_active(50);
        assert_eq!(lights.len(), 1);
        assert_eq!(lights[0].agent_id, "agent-a");
        assert_eq!(lights[0].state, "running");
    }

    #[test]
    fn permission_then_stop() {
        let _g = test_lock();
        reset_for_test();
        claude_lights::reset_for_test();
        let _ = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "PermissionRequest".into(),
                session_id: "s".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 1,
                source: "claude_hook".into(),
            },
            1,
        );
        let done = ingest_claude_payload_at(
            &ClaudeHookPayload {
                event: "Stop".into(),
                session_id: "s".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 2,
                source: "claude_hook".into(),
            },
            2,
        );
        assert_eq!(done.state, "done");
        assert_eq!(done.agent.as_deref(), Some("claude"));
    }
}
