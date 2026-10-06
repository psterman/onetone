//! Homepage projection — read-only committed SQLite state (+ sync/stale metadata).

use crate::agent_memory::checkpoint::{
    latest_checkpoint_for_project, latest_checkpoint_for_session,
};
use crate::agent_memory::memory::{context_for_provider, list_recent_memory};
use crate::agent_memory::model::{
    CheckpointDto, HomeEventDto, HomeSessionDto, MemoryRecordDto, ProbeStatus, ProjectIdentity,
    PROVIDER_CURSOR, UNKNOWN_PROJECT_ID,
};
use crate::agent_memory::project::resolve_project;
use crate::agent_memory::store::{now_ms, with_read_path};
use rusqlite::params;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHomeSnapshot {
    pub project: ProjectIdentity,
    pub active_session: Option<HomeSessionDto>,
    pub recent_sessions: Vec<HomeSessionDto>,
    pub recent_events: Vec<HomeEventDto>,
    pub latest_event: Option<HomeEventDto>,
    pub checkpoint: Option<CheckpointDto>,
    pub memories: Vec<MemoryRecordDto>,
    pub context: Option<serde_json::Value>,
    pub as_of: u64,
    pub sync_status: String,
    pub stale_age_ms: u64,
    pub probe_status: String,
    pub diagnostics: Vec<String>,
    pub consent_activity_enabled: bool,
}

pub fn build_agent_home_snapshot(project_hint: Option<&Path>) -> AgentHomeSnapshot {
    let (project, match_kind, match_reason, _) = resolve_project(project_hint, None);
    let consent = crate::cursor_local_activity::consent_enabled();
    let mut diagnostics = Vec::new();
    diagnostics.push(format!(
        "project_match_hint={} reason={}",
        match_kind.as_str(),
        match_reason
    ));

    let (probe_status, last_probe_ms) = read_probe();
    let as_of = now_ms();
    let stale_age_ms = as_of.saturating_sub(last_probe_ms.unwrap_or(0));
    let sync_status = match probe_status.as_str() {
        "ready" if stale_age_ms < 120_000 => "ready".into(),
        "ready" => "stale".into(),
        "consent_off" => {
            diagnostics.push("Cursor 已发现或可探测 · 本地活动统计未启用".into());
            "consent_off".into()
        }
        other => other.to_string(),
    };

    let project_id = project.project_id.clone();
    let mut recent_sessions = read_sessions(&project_id, 12);
    if recent_sessions.is_empty() && project_id != UNKNOWN_PROJECT_ID {
        // Fall back to any unknown-project sessions for visibility.
        recent_sessions = read_sessions(UNKNOWN_PROJECT_ID, 12);
        if !recent_sessions.is_empty() {
            diagnostics.push("showing_unknown_project_sessions".into());
        }
    }
    // Unknown / still empty: do not hide Cursor-discovered rows for the real project.
    if recent_sessions.is_empty() {
        recent_sessions = read_recent_sessions_any(12);
        if !recent_sessions.is_empty() {
            diagnostics.push("showing_cross_project_recent_fallback".into());
        }
    }

    let active_session = recent_sessions
        .iter()
        .find(|s| s.is_active)
        .cloned()
        .or(None);

    let recent_events = active_session
        .as_ref()
        .map(|s| read_events(&s.session_id, 20))
        .unwrap_or_else(|| {
            recent_sessions
                .first()
                .map(|s| read_events(&s.session_id, 20))
                .unwrap_or_default()
        });
    let latest_event = recent_events.first().cloned();

    let mut checkpoint = active_session
        .as_ref()
        .and_then(|s| latest_checkpoint_for_session(&s.session_id));
    if checkpoint.is_none() && project_id != UNKNOWN_PROJECT_ID {
        checkpoint = latest_checkpoint_for_project(&project_id);
    }
    if checkpoint.is_none() {
        checkpoint = recent_sessions
            .iter()
            .find_map(|s| latest_checkpoint_for_session(&s.session_id));
    }
    let memories = if project_id != UNKNOWN_PROJECT_ID {
        list_recent_memory(&project_id, 6).unwrap_or_else(|e| {
            diagnostics.push(format!("memory_read_failed:{e}"));
            Vec::new()
        })
    } else {
        Vec::new()
    };
    let context = if project_id != UNKNOWN_PROJECT_ID {
        Some(context_for_provider(&project_id, None, 6))
    } else {
        None
    };

    if !consent {
        diagnostics.push("activity_metrics_gated_by_consent".into());
    }

    AgentHomeSnapshot {
        project,
        active_session,
        recent_sessions,
        recent_events,
        latest_event,
        checkpoint,
        memories,
        context,
        as_of,
        sync_status,
        stale_age_ms,
        probe_status,
        diagnostics,
        consent_activity_enabled: consent,
    }
}

fn read_probe() -> (String, Option<u64>) {
    with_read_path(|conn| {
        let row = conn.query_row(
            "SELECT probe_status, last_successful_probe_at_ms
             FROM provider_cursors WHERE provider = ?1
             ORDER BY last_scan_at_ms DESC LIMIT 1",
            params![PROVIDER_CURSOR],
            |r| {
                Ok((
                    r.get::<_, String>(0)
                        .unwrap_or_else(|_| ProbeStatus::NotFound.as_str().into()),
                    r.get::<_, Option<i64>>(1)?.map(|x| x as u64),
                ))
            },
        );
        Ok(row.unwrap_or_else(|_| (ProbeStatus::NotFound.as_str().into(), None)))
    })
    .unwrap_or_else(|_| (ProbeStatus::ReadError.as_str().into(), None))
}

fn read_sessions(project_id: &str, limit: usize) -> Vec<HomeSessionDto> {
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT session_id, provider, external_session_id, title, updated_at_ms,
                        status, project_id, project_match, match_reason, match_confidence,
                        is_active, activity_source, active_confidence
                 FROM agent_sessions
                 WHERE project_id = ?1
                 ORDER BY COALESCE(updated_at_ms, 0) DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![project_id, limit as i64], map_home_session_row)
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows.flatten() {
            out.push(row);
        }
        Ok(out)
    })
    .unwrap_or_default()
}

/// Cross-project recent fallback when home snapshot has no reliable project filter.
fn read_recent_sessions_any(limit: usize) -> Vec<HomeSessionDto> {
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT session_id, provider, external_session_id, title, updated_at_ms,
                        status, project_id, project_match, match_reason, match_confidence,
                        is_active, activity_source, active_confidence
                 FROM agent_sessions
                 ORDER BY COALESCE(updated_at_ms, 0) DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit as i64], map_home_session_row)
            .map_err(|e| e.to_string())?;
        Ok(rows.flatten().collect())
    })
    .unwrap_or_default()
}

fn map_home_session_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<HomeSessionDto> {
    Ok(HomeSessionDto {
        session_id: r.get(0)?,
        provider: r.get(1)?,
        external_session_id: r.get(2)?,
        title: r.get(3)?,
        updated_at: r.get::<_, Option<i64>>(4)?.map(|x| x as u64),
        status: r
            .get::<_, Option<String>>(5)?
            .unwrap_or_else(|| "discovered".into()),
        project_id: r.get(6)?,
        project_match: r.get(7)?,
        match_reason: r.get(8)?,
        match_confidence: r.get(9)?,
        is_active: r.get::<_, i64>(10)? != 0,
        activity_source: r.get(11)?,
        active_confidence: r.get(12)?,
    })
}

fn read_events(session_id: &str, limit: usize) -> Vec<HomeEventDto> {
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT event_id, event_type, event_class, summary, timestamp_ms, session_id
                 FROM agent_events
                 WHERE session_id = ?1
                 ORDER BY timestamp_ms DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![session_id, limit as i64], |r| {
                Ok(HomeEventDto {
                    event_id: r.get(0)?,
                    event_type: r.get(1)?,
                    event_class: r.get(2)?,
                    summary: r.get(3)?,
                    timestamp: r.get::<_, i64>(4)? as u64,
                    session_id: r.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.flatten().collect())
    })
    .unwrap_or_default()
}
