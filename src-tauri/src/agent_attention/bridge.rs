//! Map official Hook / App Server events → AgentAttentionStore raise/clear.

use super::model::{AttentionCause, AttentionState, SignalSource};
use super::store::{clear, raise_lifecycle, raise_needs_input};
use crate::soft_pad_runtime::AgentKind;

fn sid(s: &str) -> Option<&str> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

/// Claude Code / Desktop official waiting + clear events.
pub fn ingest_claude_hook_event(
    event: &str,
    session_id: &str,
    request_id: &str,
    _source_label: &str,
) {
    let source = SignalSource::OfficialHook;
    let session = sid(session_id);
    let request = sid(request_id);
    let ev = event.trim();
    let lower = ev.to_ascii_lowercase();

    if matches!(
        ev,
        "PermissionRequest" | "permission_prompt" | "agent_needs_input"
    ) || lower == "permission_prompt"
        || lower == "agent_needs_input"
    {
        raise_needs_input(
            AgentKind::Claude,
            session,
            request,
            AttentionCause::Permission,
            source,
        );
        return;
    }
    if matches!(ev, "Elicitation" | "elicitation_dialog") || lower == "elicitation_dialog" {
        raise_needs_input(
            AgentKind::Claude,
            session,
            request,
            AttentionCause::Elicitation,
            source,
        );
        return;
    }
    if matches!(
        ev,
        "Stop" | "TaskCompleted" | "agent_completed" | "elicitation_response" | "complete"
    ) || lower == "agent_completed"
        || lower == "elicitation_response"
        || lower == "elicitation_complete"
    {
        clear(AgentKind::Claude, session, request);
        raise_lifecycle(AgentKind::Claude, session, AttentionState::Complete, source);
        return;
    }
    if matches!(ev, "StopFailure" | "PostToolUseFailure") {
        clear(AgentKind::Claude, session, request);
        raise_lifecycle(AgentKind::Claude, session, AttentionState::Error, source);
        return;
    }
    if matches!(
        ev,
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch"
    ) {
        raise_lifecycle(AgentKind::Claude, session, AttentionState::Working, source);
    }
}

/// Codex Hook (external session).
pub fn ingest_codex_hook_event(event: &str, session_id: &str, request_id: &str) {
    let session = sid(session_id);
    let request = sid(request_id);
    let ev = event.trim();
    match ev {
        "PermissionRequest" => {
            raise_needs_input(
                AgentKind::Codex,
                session,
                request,
                AttentionCause::Permission,
                SignalSource::OfficialHook,
            );
        }
        "Elicitation" => {
            raise_needs_input(
                AgentKind::Codex,
                session,
                request,
                AttentionCause::Elicitation,
                SignalSource::OfficialHook,
            );
        }
        "Stop" | "SessionStart" | "PostToolUse" | "TaskComplete" => {
            clear(AgentKind::Codex, session, request);
            if matches!(ev, "Stop" | "TaskComplete") {
                raise_lifecycle(
                    AgentKind::Codex,
                    session,
                    AttentionState::Complete,
                    SignalSource::OfficialHook,
                );
            }
        }
        "UserPromptSubmit" | "PreToolUse" => {
            raise_lifecycle(
                AgentKind::Codex,
                session,
                AttentionState::Working,
                SignalSource::OfficialHook,
            );
        }
        _ => {}
    }
}

/// Codex app-server (self-managed).
pub fn ingest_codex_app_server_event(event: &str, session_id: &str, request_id: &str) {
    let session = sid(session_id);
    let request = sid(request_id);
    let lower = event.trim().to_ascii_lowercase().replace('-', "_");
    if lower.contains("resolved") {
        clear(AgentKind::Codex, session, request);
        return;
    }
    if lower.contains("approval")
        || lower.contains("requestuserinput")
        || lower.contains("request_user_input")
    {
        raise_needs_input(
            AgentKind::Codex,
            session,
            request,
            AttentionCause::UserInput,
            SignalSource::AppServer,
        );
    }
}

/// Cursor lifecycle only — NeedsInput only when capability gate is open.
pub fn ingest_cursor_hook_event(event: &str, session_id: &str) {
    let session = sid(session_id);
    let ev = event.trim();
    let lower = ev.to_ascii_lowercase();

    if matches!(
        lower.as_str(),
        "agent_needs_input" | "permission_prompt" | "elicitation_dialog"
    ) {
        if crate::agent_catalog::cursor_can_observe_needs_input() {
            raise_needs_input(
                AgentKind::Cursor,
                session,
                None,
                AttentionCause::Permission,
                SignalSource::OfficialHook,
            );
        }
        return;
    }

    let state = if matches!(
        lower.as_str(),
        "beforesubmitprompt"
            | "beforeshellexecution"
            | "beforemcpexecution"
            | "pretooluse"
            | "agentstart"
            | "sessionstart"
    ) || matches!(
        ev,
        "beforeSubmitPrompt" | "beforeShellExecution" | "agentStart" | "sessionStart"
    ) {
        Some(AttentionState::Working)
    } else if matches!(
        lower.as_str(),
        "afteragentresponse" | "agentresponse" | "stop" | "sessionend" | "agentstop"
    ) || matches!(ev, "afterAgentResponse" | "stop" | "sessionEnd")
    {
        Some(AttentionState::Complete)
    } else if matches!(lower.as_str(), "idle" | "agentidle") {
        Some(AttentionState::Idle)
    } else {
        None
    };

    if let Some(st) = state {
        raise_lifecycle(AgentKind::Cursor, session, st, SignalSource::OfficialHook);
    }
}

pub fn raise_onetone_ask(agent: AgentKind, session_id: &str, request_id: &str) {
    raise_needs_input(
        agent,
        sid(session_id),
        sid(request_id),
        AttentionCause::OneToneAsk,
        SignalSource::OneToneAsk,
    );
}

pub fn clear_onetone_ask(agent: AgentKind, session_id: &str, request_id: &str) {
    clear(agent, sid(session_id), sid(request_id));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_attention::store::{
        primary_state_for, project_waiting_kinds, reset_for_test, test_lock,
    };

    #[test]
    fn claude_permission_then_stop() {
        let _g = test_lock();
        reset_for_test();
        ingest_claude_hook_event("PermissionRequest", "s1", "t1", "claude_hook");
        assert_eq!(project_waiting_kinds().0, vec![AgentKind::Claude]);
        ingest_claude_hook_event("Stop", "s1", "t1", "claude_hook");
        assert!(project_waiting_kinds().0.is_empty());
    }

    #[test]
    fn codex_hook_permission() {
        let _g = test_lock();
        reset_for_test();
        ingest_codex_hook_event("PermissionRequest", "sess", "turn");
        assert_eq!(project_waiting_kinds().0, vec![AgentKind::Codex]);
        ingest_codex_hook_event("Stop", "sess", "turn");
        assert!(project_waiting_kinds().0.is_empty());
    }

    #[test]
    fn cursor_working_not_waiting() {
        let _g = test_lock();
        reset_for_test();
        crate::agent_catalog::set_cursor_can_observe_needs_input(false);
        ingest_cursor_hook_event("beforeSubmitPrompt", "c1");
        assert!(project_waiting_kinds().0.is_empty());
        assert_eq!(
            primary_state_for(AgentKind::Cursor),
            Some(AttentionState::Working)
        );
    }
}
