//! Cursor hook → PadStatusCandidate (State Core for status host + ambient).

use crate::codex_app_state::CodexAppStatePayload;
use crate::pad_status::arbiter::DONE_SETTLE_MS;
use crate::pad_status::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};
use crate::pad_status::store;

/// Map Cursor lifecycle hook event → core state string.
pub fn map_cursor_event_to_state(event: &str) -> Option<&'static str> {
    let ev = event.trim();
    let lower = ev.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "agent_needs_input" | "permission_prompt" | "elicitation_dialog"
    ) {
        return Some("needs_input");
    }
    if matches!(
        lower.as_str(),
        "beforesubmitprompt"
            | "beforeshellexecution"
            | "beforemcpexecution"
            | "pretooluse"
            | "agentstart"
            | "subagentstart"
            | "sessionstart"
    ) || matches!(
        ev,
        "beforeSubmitPrompt"
            | "beforeShellExecution"
            | "beforeMcpExecution"
            | "preToolUse"
            | "agentStart"
            | "subagentStart"
            | "sessionStart"
    ) {
        return Some("running");
    }
    if matches!(
        lower.as_str(),
        "afteragentresponse" | "agentresponse" | "stop" | "sessionend" | "agentstop"
    ) || matches!(ev, "afterAgentResponse" | "stop" | "sessionEnd")
    {
        return Some("done");
    }
    if matches!(lower.as_str(), "idle" | "agentidle") {
        return Some("idle");
    }
    None
}

pub fn ingest_cursor_payload(payload: &CodexAppStatePayload) -> PadStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    ingest_cursor_payload_at(payload, now)
}

pub fn ingest_cursor_payload_at(payload: &CodexAppStatePayload, now: u64) -> PadStatus {
    let source = PadSource::from_legacy(payload.source.trim());
    let event = payload.event.trim();
    let incoming_session = payload.session_id.trim();

    crate::agent_attention::ingest_cursor_hook_event(event, incoming_session);

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
    if sticky && foreign && matches!(event, "stop" | "sessionEnd" | "Stop" | "sessionStart") {
        return cur;
    }

    let Some(state_str) = map_cursor_event_to_state(event) else {
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
        cur.session_id.clone()
    };

    let turn = payload.turn_id.trim();
    let cand = PadStatusCandidate {
        raw_tag: format!("{}:{}", source.as_str(), event),
        status: PadStatus {
            state: state.as_str().into(),
            phase: None,
            source: source.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: if payload.ts > 0 { payload.ts } else { now },
            agent: Some("cursor".into()),
            task_id: if turn.is_empty() {
                None
            } else {
                Some(turn.to_string())
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
    fn cursor_submit_then_stop() {
        let _g = test_lock();
        reset_for_test();
        let p = CodexAppStatePayload {
            source: "cursor_hook".into(),
            event: "beforeSubmitPrompt".into(),
            session_id: "c1".into(),
            turn_id: "g1".into(),
            cwd: String::new(),
            model: String::new(),
            permission_mode: String::new(),
            tool_name: String::new(),
            agent_id: String::new(),
            agent_type: String::new(),
            ts: 0,
        };
        let st = ingest_cursor_payload(&p);
        assert_eq!(st.state, "running");
        assert_eq!(st.agent.as_deref(), Some("cursor"));
        let p2 = CodexAppStatePayload {
            source: "cursor_hook".into(),
            event: "stop".into(),
            session_id: "c1".into(),
            turn_id: String::new(),
            cwd: String::new(),
            model: String::new(),
            permission_mode: String::new(),
            tool_name: String::new(),
            agent_id: String::new(),
            agent_type: String::new(),
            ts: 0,
        };
        let st2 = ingest_cursor_payload(&p2);
        assert_eq!(st2.state, "done");
    }
}
