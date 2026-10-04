//! Plan B: OneTone lifecycle events — only path that mutates session.status.

use crate::agent_memory::events::{append_lifecycle_event, upsert_session_candidate};
use crate::agent_memory::model::{ProjectMatch, SessionCandidate, UNKNOWN_PROJECT_ID};
use crate::agent_memory::store::{now_ms, with_read_path};
use crate::soft_pad_runtime::AgentKind;
use rusqlite::params;

/// Map lifecycle event_type → session.status.
pub fn status_for_lifecycle_event(event_type: &str) -> Option<&'static str> {
    match event_type {
        "task_started" | "task_resumed" => Some("running"),
        "waiting_approval" => Some("waiting_approval"),
        "task_paused" => Some("paused"),
        "task_completed" => Some("completed"),
        "task_failed" => Some("failed"),
        "session_aborted" | "task_cancelled" => Some("cancelled"),
        _ => None,
    }
}

fn provider_for_agent(agent: AgentKind) -> String {
    // Normalize Soft Pad camelCase ids to store keys (cursor, copilotcli, …).
    agent.as_str().to_ascii_lowercase()
}

fn find_session_id(provider: &str, external: Option<&str>) -> Option<String> {
    with_read_path(|conn| {
        if let Some(ext) = external.filter(|s| !s.is_empty()) {
            let sid: Result<String, _> = conn.query_row(
                "SELECT session_id FROM agent_sessions
                 WHERE provider = ?1 AND external_session_id = ?2
                 ORDER BY CASE project_match
                   WHEN 'exact' THEN 0 WHEN 'probable' THEN 1 ELSE 2 END,
                   COALESCE(updated_at_ms, 0) DESC
                 LIMIT 1",
                params![provider, ext],
                |r| r.get(0),
            );
            if let Ok(s) = sid {
                return Ok(Some(s));
            }
        }
        let sid: Result<String, _> = conn.query_row(
            "SELECT session_id FROM agent_sessions
             WHERE provider = ?1
             ORDER BY is_active DESC, COALESCE(updated_at_ms, 0) DESC
             LIMIT 1",
            params![provider],
            |r| r.get(0),
        );
        Ok(sid.ok())
    })
    .ok()
    .flatten()
}

fn ensure_session(provider: &str, external: &str) -> Result<String, String> {
    if let Some(sid) = find_session_id(provider, Some(external)) {
        return Ok(sid);
    }
    let c = SessionCandidate {
        provider: provider.into(),
        external_session_id: external.into(),
        project_id: UNKNOWN_PROJECT_ID.into(),
        project_match: ProjectMatch::Unknown,
        match_reason: "lifecycle_bootstrap".into(),
        match_confidence: 0.2,
        started_at: Some(now_ms()),
        updated_at: Some(now_ms()),
        title: Some(format!("{provider} session")),
        is_active: false,
        activity_source: "explicit".into(),
        active_confidence: 0.0,
        workspace_evidence: None,
    };
    upsert_session_candidate(&c)
}

/// Record attention → lifecycle (best-effort; never fail attention path).
pub fn note_attention(
    agent: AgentKind,
    external_session_id: Option<&str>,
    attention_state: &str,
    sequence: u64,
) {
    let (event_type, summary) = match attention_state {
        "working" => ("task_resumed", "Agent 正在处理"),
        "needsInput" => ("waiting_approval", "Agent 在等你确认"),
        "complete" => ("task_completed", "Agent 已完成"),
        "error" => ("task_failed", "Agent 碰到问题"),
        _ => return, // idle: clear attention only
    };
    let provider = provider_for_agent(agent);
    let ext = external_session_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("local");
    let sid = match ensure_session(&provider, ext) {
        Ok(s) => s,
        Err(_) => return,
    };
    let ts = now_ms();
    let source_ref = format!(
        "lifecycle|{}|{}|{}|{}|{}",
        provider, sid, event_type, sequence, ts
    );
    let _ = append_lifecycle_event(&sid, &provider, event_type, &source_ref, ts, summary);
}

/// UI / IPC: pause, resume, cancel monitor status for a known session.
pub fn append_ui_lifecycle(
    session_id: &str,
    provider: &str,
    event_type: &str,
    summary: &str,
) -> Result<bool, String> {
    if status_for_lifecycle_event(event_type).is_none() {
        return Err(format!("unknown lifecycle event_type: {event_type}"));
    }
    let ts = now_ms();
    let source_ref = format!("ui|{provider}|{session_id}|{event_type}|{ts}");
    append_lifecycle_event(session_id, provider, event_type, &source_ref, ts, summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_map_covers_plan_b() {
        assert_eq!(status_for_lifecycle_event("task_resumed"), Some("running"));
        assert_eq!(
            status_for_lifecycle_event("waiting_approval"),
            Some("waiting_approval")
        );
        assert_eq!(status_for_lifecycle_event("task_paused"), Some("paused"));
        assert_eq!(status_for_lifecycle_event("user_turn_observed"), None);
    }

    #[test]
    fn provider_cursor_label() {
        assert_eq!(provider_for_agent(AgentKind::Cursor), "cursor");
    }
}
