//! Plan B: OneTone lifecycle events — only path that mutates session.status.

use crate::agent_memory::events::{append_lifecycle_event, upsert_session_candidate};
use crate::agent_memory::model::{ProjectMatch, SessionCandidate, UNKNOWN_PROJECT_ID};
use crate::agent_memory::store::{now_ms, with_read_path};
use crate::soft_pad_runtime::AgentKind;
use rusqlite::params;

pub const LIFECYCLE_SUMMARY_MAX: usize = 240;

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

/// Normalize created → discovered (DB default).
fn normalize_status(status: &str) -> &str {
    if status == "created" {
        "discovered"
    } else {
        status
    }
}

/// Validate lifecycle edge. Returns target status or `illegal_transition:from->to`.
pub fn transition_allowed(from_status: &str, event_type: &str) -> Result<&'static str, String> {
    let to = status_for_lifecycle_event(event_type)
        .ok_or_else(|| format!("unknown lifecycle event_type: {event_type}"))?;
    let from = normalize_status(from_status);
    let ok = match from {
        "discovered" => matches!(event_type, "task_started" | "task_resumed"),
        "running" => matches!(
            event_type,
            "waiting_approval"
                | "task_paused"
                | "task_completed"
                | "task_failed"
                | "session_aborted"
                | "task_cancelled"
        ),
        "waiting_approval" => matches!(
            event_type,
            "task_resumed" | "task_failed" | "session_aborted" | "task_cancelled"
        ),
        "paused" => matches!(
            event_type,
            "task_resumed" | "task_failed" | "session_aborted" | "task_cancelled"
        ),
        // Plan C: resume from checkpoint after completed/failed
        "completed" | "failed" => matches!(event_type, "task_resumed"),
        _ => false,
    };
    if ok {
        Ok(to)
    } else {
        Err(format!("illegal_transition:{from}->{to}"))
    }
}

fn truncate_summary(summary: &str) -> String {
    let mut out = String::new();
    for (i, ch) in summary.chars().enumerate() {
        if i >= LIFECYCLE_SUMMARY_MAX {
            break;
        }
        out.push(ch);
    }
    out
}

fn session_exists(session_id: &str) -> Result<bool, String> {
    with_read_path(|conn| {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE session_id = ?1",
                params![session_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
}

fn provider_for_agent(agent: AgentKind) -> String {
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

fn session_status(session_id: &str) -> Option<String> {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT status FROM agent_sessions WHERE session_id = ?1",
            params![session_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
    .ok()
}

/// Record attention → lifecycle (best-effort; never fail attention path).
pub fn note_attention(
    agent: AgentKind,
    external_session_id: Option<&str>,
    attention_state: &str,
    sequence: u64,
) {
    let provider = provider_for_agent(agent);
    let ext = external_session_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("local");
    let sid = match ensure_session(&provider, ext) {
        Ok(s) => s,
        Err(_) => return,
    };
    let status = session_status(&sid).unwrap_or_else(|| "discovered".into());
    let from = normalize_status(&status);
    let (event_type, summary) = match attention_state {
        "working" => {
            if from == "discovered" {
                ("task_started", "Agent 开始处理")
            } else {
                ("task_resumed", "Agent 正在处理")
            }
        }
        "needsInput" => ("waiting_approval", "Agent 在等你确认"),
        "complete" => ("task_completed", "Agent 已完成"),
        "error" => ("task_failed", "Agent 碰到问题"),
        _ => return,
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
    let sid = session_id.trim();
    if sid.is_empty() {
        return Err("session_id required".into());
    }
    if !session_exists(sid)? {
        return Err(format!("session_not_found: {sid}"));
    }
    if status_for_lifecycle_event(event_type).is_none() {
        return Err(format!("unknown lifecycle event_type: {event_type}"));
    }
    let summary = truncate_summary(summary);
    let ts = now_ms();
    let source_ref = format!("ui|{provider}|{sid}|{event_type}|{ts}");
    append_lifecycle_event(sid, provider, event_type, &source_ref, ts, &summary)
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
    fn transition_discovered_to_running() {
        assert_eq!(
            transition_allowed("discovered", "task_started").unwrap(),
            "running"
        );
        assert_eq!(
            transition_allowed("created", "task_resumed").unwrap(),
            "running"
        );
    }

    #[test]
    fn transition_rejects_terminal_pause() {
        let err = transition_allowed("completed", "task_paused").unwrap_err();
        assert!(err.contains("illegal_transition:completed->paused"));
    }

    #[test]
    fn provider_cursor_label() {
        assert_eq!(provider_for_agent(AgentKind::Cursor), "cursor");
    }

    #[test]
    fn summary_truncates() {
        let long: String = (0..300).map(|_| 'x').collect();
        assert_eq!(
            truncate_summary(&long).chars().count(),
            LIFECYCLE_SUMMARY_MAX
        );
    }
}
