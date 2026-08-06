//! WorkBuddy / Trae / Qoder shell hooks → primary PadStatus + attention.
//! Reuses Claude event→state map; no multi-lights, lanes, or approval decide.

use crate::pad_status::adapters::claude::{map_claude_event_to_state, ClaudeHookPayload};
use crate::pad_status::arbiter::DONE_SETTLE_MS;
use crate::pad_status::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};
use crate::pad_status::store;
use crate::soft_pad_runtime::AgentKind;

pub fn agent_kind_from_hook_source(source: &str) -> Option<AgentKind> {
    match source.trim() {
        "workbuddy_hook" => Some(AgentKind::WorkBuddy),
        "trae_hook" => Some(AgentKind::Trae),
        "qoder_hook" => Some(AgentKind::Qoder),
        _ => None,
    }
}

pub fn ingest_shell_agent_payload(payload: &ClaudeHookPayload) -> PadStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    ingest_shell_agent_payload_at(payload, now)
}

pub fn ingest_shell_agent_payload_at(payload: &ClaudeHookPayload, now: u64) -> PadStatus {
    let Some(agent) = agent_kind_from_hook_source(&payload.source) else {
        return store::snapshot_at(now);
    };
    let event = payload.event.trim();
    let incoming_session = payload.session_id.trim();
    let src_label = payload.source.trim();

    // SessionStart/End: no primary light (same as Claude).
    if matches!(event, "SessionStart" | "SessionEnd" | "sessionStart" | "sessionEnd") {
        return store::snapshot_at(now);
    }
    // Subagent*: catalog can_multi_agent_lights=false — ignore for primary.
    if matches!(event, "SubagentStart" | "SubagentStop") {
        return store::snapshot_at(now);
    }

    let Some(state_str) = map_claude_event_to_state(event) else {
        return store::snapshot_at(now);
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
        store::snapshot_at(now).session_id.clone()
    };

    let cand = PadStatusCandidate {
        raw_tag: format!("{}:{}", agent.as_str(), event),
        status: PadStatus {
            state: state.as_str().into(),
            phase: None,
            source: PadSource::Hook.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: if payload.ts > 0 { payload.ts } else { now },
            agent: Some(agent.as_str().into()),
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
    crate::agent_attention::ingest_lifecycle_hook_event(
        agent,
        event,
        incoming_session,
        payload.turn_id.trim(),
        src_label,
    );
    winner
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::store::{reset_for_test, test_lock};

    #[test]
    fn workbuddy_prompt_sets_running() {
        let _g = test_lock();
        reset_for_test();
        let pad = ingest_shell_agent_payload_at(
            &ClaudeHookPayload {
                event: "UserPromptSubmit".into(),
                session_id: "wb-1".into(),
                turn_id: "t1".into(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 1000,
                source: "workbuddy_hook".into(),
            },
            1000,
        );
        assert_eq!(pad.state, "running");
        assert_eq!(pad.agent.as_deref(), Some("workbuddy"));
    }

    #[test]
    fn trae_permission_sets_needs_input() {
        let _g = test_lock();
        reset_for_test();
        let pad = ingest_shell_agent_payload_at(
            &ClaudeHookPayload {
                event: "PermissionRequest".into(),
                session_id: "tr-1".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 2000,
                source: "trae_hook".into(),
            },
            2000,
        );
        assert_eq!(pad.state, "needs_input");
        assert_eq!(pad.agent.as_deref(), Some("trae"));
    }

    #[test]
    fn qoder_stop_sets_done() {
        let _g = test_lock();
        reset_for_test();
        let _ = ingest_shell_agent_payload_at(
            &ClaudeHookPayload {
                event: "UserPromptSubmit".into(),
                session_id: "qd-1".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 3000,
                source: "qoder_hook".into(),
            },
            3000,
        );
        let pad = ingest_shell_agent_payload_at(
            &ClaudeHookPayload {
                event: "Stop".into(),
                session_id: "qd-1".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: String::new(),
                ts: 3100,
                source: "qoder_hook".into(),
            },
            3100,
        );
        assert_eq!(pad.state, "done");
        assert_eq!(pad.agent.as_deref(), Some("qoder"));
    }
}
