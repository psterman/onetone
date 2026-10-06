//! append_event core — observed must NOT mutate lifecycle session.status (Plan A C1).

use crate::agent_memory::lifecycle::transition_allowed;
use crate::agent_memory::model::{
    ProjectMatch, SessionCandidate, EVENT_CLASS_LIFECYCLE, EVENT_CLASS_OBSERVED, PROVIDER_CURSOR,
    UNKNOWN_PROJECT_ID,
};
use crate::agent_memory::store::{now_ms, with_write};
use rusqlite::params;
use sha2::{Digest, Sha256};

pub fn source_ref_for_turn(
    composer_id: &str,
    bubble_id: Option<&str>,
    ts: Option<u64>,
    kind: &str,
) -> String {
    if let Some(b) = bubble_id.filter(|s| !s.is_empty()) {
        return format!("{composer_id}:{b}");
    }
    let ts_n = ts.unwrap_or(0);
    let raw = format!("{PROVIDER_CURSOR}|{composer_id}|{ts_n}|{kind}");
    let hash = Sha256::digest(raw.as_bytes());
    format!("{:x}", hash)
}

/// Plan A entry — never updates session.status lifecycle fields.
pub fn append_observed_event(
    session_id: &str,
    provider: &str,
    event_type: &str,
    source_ref: &str,
    timestamp_ms: u64,
    summary: &str,
) -> Result<bool, String> {
    append_event(
        EVENT_CLASS_OBSERVED,
        session_id,
        provider,
        event_type,
        source_ref,
        timestamp_ms,
        summary,
        None,
    )
}

/// Same as [`append_observed_event`] but persists `detail_json` (no schema migration).
pub fn append_observed_event_with_detail(
    session_id: &str,
    provider: &str,
    event_type: &str,
    source_ref: &str,
    timestamp_ms: u64,
    summary: &str,
    detail_json: Option<&str>,
) -> Result<bool, String> {
    append_event(
        EVENT_CLASS_OBSERVED,
        session_id,
        provider,
        event_type,
        source_ref,
        timestamp_ms,
        summary,
        detail_json,
    )
}

/// Plan B — validates state machine, updates session.status.
/// Plan C: auto-checkpoint after writer lock is released.
pub fn append_lifecycle_event(
    session_id: &str,
    provider: &str,
    event_type: &str,
    source_ref: &str,
    timestamp_ms: u64,
    summary: &str,
) -> Result<bool, String> {
    let inserted = append_event(
        EVENT_CLASS_LIFECYCLE,
        session_id,
        provider,
        event_type,
        source_ref,
        timestamp_ms,
        summary,
        None,
    )?;
    if inserted {
        crate::agent_memory::checkpoint::maybe_auto_checkpoint(
            session_id,
            event_type,
            timestamp_ms,
        );
    }
    Ok(inserted)
}

fn append_event(
    event_class: &str,
    session_id: &str,
    provider: &str,
    event_type: &str,
    source_ref: &str,
    timestamp_ms: u64,
    summary: &str,
    detail_json: Option<&str>,
) -> Result<bool, String> {
    with_write(|conn| {
        let lifecycle_target = if event_class == EVENT_CLASS_LIFECYCLE {
            let status: String = conn
                .query_row(
                    "SELECT status FROM agent_sessions WHERE session_id = ?1",
                    params![session_id],
                    |r| r.get(0),
                )
                .map_err(|_| format!("session_not_found: {session_id}"))?;
            Some(transition_allowed(&status, event_type)?)
        } else {
            None
        };

        let event_id = format!(
            "{:x}",
            Sha256::digest(format!("{provider}|{source_ref}|{event_type}").as_bytes())
        );
        let inserted = conn
            .execute(
                "INSERT OR IGNORE INTO agent_events(
                   event_id, session_id, provider, event_class, event_type,
                   source_ref, timestamp_ms, summary, detail_json
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    event_id,
                    session_id,
                    provider,
                    event_class,
                    event_type,
                    source_ref,
                    timestamp_ms as i64,
                    summary,
                    detail_json
                ],
            )
            .map_err(|e| format!("insert event: {e}"))?;

        // Observed: bump last_seen / updated_at only. Never touch status (Plan A C1).
        if event_class == EVENT_CLASS_OBSERVED {
            let _ = conn.execute(
                "UPDATE agent_sessions
                 SET last_seen_at_ms = MAX(COALESCE(last_seen_at_ms, 0), ?1),
                     updated_at_ms = CASE
                       WHEN updated_at_ms IS NULL OR updated_at_ms < ?1 THEN ?1
                       ELSE updated_at_ms END
                 WHERE session_id = ?2",
                params![timestamp_ms as i64, session_id],
            );
        } else if event_class == EVENT_CLASS_LIFECYCLE && inserted > 0 {
            if let Some(status) = lifecycle_target {
                conn.execute(
                    "UPDATE agent_sessions
                     SET status = ?1,
                         last_seen_at_ms = MAX(COALESCE(last_seen_at_ms, 0), ?2),
                         updated_at_ms = CASE
                           WHEN updated_at_ms IS NULL OR updated_at_ms < ?2 THEN ?2
                           ELSE updated_at_ms END
                     WHERE session_id = ?3",
                    params![status, timestamp_ms as i64, session_id],
                )
                .map_err(|e| format!("update lifecycle status: {e}"))?;
            }
        }

        Ok(inserted > 0)
    })
}

/// Canonical `agent_sessions.session_id` — shared by upsert + PromptJournal.
pub fn agent_session_id(provider: &str, project_id: &str, external_id: &str) -> String {
    let raw = format!(
        "{}|{}|{}",
        provider.trim(),
        project_id.trim(),
        external_id.trim()
    );
    format!("{:x}", Sha256::digest(raw.as_bytes()))
}

/// Upsert session; migrate unknown-project → better match for same external id (C3).
pub fn upsert_session_candidate(c: &SessionCandidate) -> Result<String, String> {
    with_write(|conn| {
        let now = now_ms() as i64;
        // Existing row for provider+external_session_id (any project)?
        let existing: Option<(String, String, String)> = conn
            .query_row(
                "SELECT session_id, project_id, project_match
                 FROM agent_sessions
                 WHERE provider = ?1 AND external_session_id = ?2
                 ORDER BY CASE project_match
                   WHEN 'exact' THEN 0 WHEN 'probable' THEN 1 ELSE 2 END
                 LIMIT 1",
                params![c.provider, c.external_session_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();

        if let Some((sid, old_project, old_match)) = existing {
            let old_m = ProjectMatch::from_str_loose(&old_match);
            let should_migrate = old_project == UNKNOWN_PROJECT_ID
                || c.project_match.rank() > old_m.rank()
                || (c.project_match.rank() == old_m.rank()
                    && c.project_id != old_project
                    && old_project == UNKNOWN_PROJECT_ID);

            if should_migrate && c.project_id != old_project {
                // Re-key unique (provider, project_id, external) by updating project fields.
                conn.execute(
                    "UPDATE agent_sessions SET
                       project_id = ?1,
                       project_match = ?2,
                       match_reason = ?3,
                       match_confidence = ?4,
                       title = COALESCE(?5, title),
                       started_at_ms = COALESCE(?6, started_at_ms),
                       updated_at_ms = COALESCE(?7, updated_at_ms),
                       last_seen_at_ms = ?8,
                       is_active = ?9,
                       activity_source = ?10,
                       active_confidence = ?11,
                       workspace_evidence_json = ?12
                     WHERE session_id = ?13",
                    params![
                        c.project_id,
                        c.project_match.as_str(),
                        c.match_reason,
                        c.match_confidence,
                        c.title,
                        c.started_at.map(|x| x as i64),
                        c.updated_at.map(|x| x as i64),
                        now,
                        if c.is_active { 1 } else { 0 },
                        c.activity_source,
                        c.active_confidence,
                        c.workspace_evidence
                            .as_ref()
                            .and_then(|e| serde_json::to_string(e).ok()),
                        sid,
                    ],
                )
                .map_err(|e| format!("migrate session project: {e}"))?;
            } else {
                conn.execute(
                    "UPDATE agent_sessions SET
                       title = COALESCE(?1, title),
                       updated_at_ms = COALESCE(?2, updated_at_ms),
                       last_seen_at_ms = ?3,
                       is_active = ?4,
                       activity_source = ?5,
                       active_confidence = ?6,
                       match_reason = CASE WHEN ?7 > match_confidence THEN ?8 ELSE match_reason END,
                       match_confidence = MAX(match_confidence, ?7),
                       project_match = CASE WHEN ?9 > CASE project_match
                         WHEN 'exact' THEN 2 WHEN 'probable' THEN 1 ELSE 0 END
                         THEN ?10 ELSE project_match END
                     WHERE session_id = ?11",
                    params![
                        c.title,
                        c.updated_at.map(|x| x as i64),
                        now,
                        if c.is_active { 1 } else { 0 },
                        c.activity_source,
                        c.active_confidence,
                        c.match_confidence,
                        c.match_reason,
                        c.project_match.rank() as i64,
                        c.project_match.as_str(),
                        sid,
                    ],
                )
                .map_err(|e| format!("update session: {e}"))?;
            }
            return Ok(sid);
        }

        let sid = agent_session_id(&c.provider, &c.project_id, &c.external_session_id);
        conn.execute(
            "INSERT INTO agent_sessions(
               session_id, provider, project_id, external_session_id, title,
               started_at_ms, updated_at_ms, last_seen_at_ms, status,
               project_match, match_reason, match_confidence,
               is_active, activity_source, active_confidence, workspace_evidence_json
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'discovered',?9,?10,?11,?12,?13,?14,?15)",
            params![
                sid,
                c.provider,
                c.project_id,
                c.external_session_id,
                c.title,
                c.started_at.map(|x| x as i64),
                c.updated_at.map(|x| x as i64),
                now,
                c.project_match.as_str(),
                c.match_reason,
                c.match_confidence,
                if c.is_active { 1 } else { 0 },
                c.activity_source,
                c.active_confidence,
                c.workspace_evidence
                    .as_ref()
                    .and_then(|e| serde_json::to_string(e).ok()),
            ],
        )
        .map_err(|e| format!("insert session: {e}"))?;
        Ok(sid)
    })
}

pub fn upsert_project(
    project_id: &str,
    display_name: &str,
    workspace: Option<&str>,
    git_root: Option<&str>,
) -> Result<(), String> {
    with_write(|conn| {
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO projects(project_id, git_root, workspace_path, display_name, detected_at_ms)
             VALUES (?1,?2,?3,?4,?5)
             ON CONFLICT(project_id) DO UPDATE SET
               git_root = COALESCE(excluded.git_root, projects.git_root),
               workspace_path = COALESCE(excluded.workspace_path, projects.workspace_path),
               display_name = excluded.display_name,
               detected_at_ms = excluded.detected_at_ms",
            params![project_id, git_root, workspace, display_name, now],
        )
        .map_err(|e| format!("upsert project: {e}"))?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_ref_prefers_bubble() {
        let s = source_ref_for_turn("c1", Some("b9"), Some(1), "user_turn_observed");
        assert_eq!(s, "c1:b9");
    }

    #[test]
    fn source_ref_fallback_stable() {
        let a = source_ref_for_turn("c1", None, Some(42), "session_updated");
        let b = source_ref_for_turn("c1", None, Some(42), "session_updated");
        assert_eq!(a, b);
        assert_ne!(
            a,
            source_ref_for_turn("c1", None, Some(43), "session_updated")
        );
    }

    #[test]
    fn agent_session_id_stable_and_uses_provider_project() {
        let a = agent_session_id("claude", "proj-a", "ext-1");
        let b = agent_session_id("claude", "proj-a", "ext-1");
        assert_eq!(a, b);
        assert_ne!(a, agent_session_id("codex", "proj-a", "ext-1"));
        assert_ne!(a, agent_session_id("claude", "proj-b", "ext-1"));
        assert_ne!(a, "ext-1");
    }
}
