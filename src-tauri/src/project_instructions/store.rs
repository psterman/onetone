//! instruction_candidates 表读写（Project Instructions Batch A）

use crate::agent_memory::{now_ms, with_read_path, with_write};
use rusqlite::{params, Row};
use sha2::{Digest, Sha256};

use super::model::{Candidate, STATUS_ACCEPTED, STATUS_PENDING, STATUS_REJECTED, STATUS_STALE};

fn map_row(r: &Row<'_>) -> rusqlite::Result<Candidate> {
    Ok(Candidate {
        candidate_id: r.get(0)?,
        project_id: r.get(1)?,
        kind: r.get(2)?,
        section: r.get(3)?,
        proposed_content: r.get(4)?,
        evidence_json: r.get(5)?,
        confidence: r.get(6)?,
        status: r.get(7)?,
        accepted_memory_id: r.get(8)?,
        created_at_ms: r.get::<_, i64>(9)? as u64,
        updated_at_ms: r.get::<_, i64>(10)? as u64,
    })
}

const SELECT_COLS: &str = "candidate_id, project_id, kind, section, proposed_content, \
     evidence_json, confidence, status, accepted_memory_id, created_at_ms, updated_at_ms";

/// Deterministic id — same (project, kind, section, content) always maps to the same row.
pub fn candidate_id_for(project_id: &str, kind: &str, section: &str, content: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{project_id}|{kind}|{section}|{content}").as_bytes())
    )
}

/// Insert or refresh a candidate. `status` is NOT reset on conflict:
/// a rejected candidate must not come back to life on the next derive.
pub fn upsert_candidate(c: &Candidate) -> Result<(), String> {
    with_write(|conn| {
        conn.execute(
            "INSERT INTO instruction_candidates(
               candidate_id, project_id, kind, section, proposed_content,
               evidence_json, confidence, status, accepted_memory_id,
               created_at_ms, updated_at_ms
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
             ON CONFLICT(project_id, kind, section, proposed_content) DO UPDATE SET
               evidence_json = excluded.evidence_json,
               confidence    = excluded.confidence,
               updated_at_ms = excluded.updated_at_ms",
            params![
                c.candidate_id,
                c.project_id,
                c.kind,
                c.section,
                c.proposed_content,
                c.evidence_json,
                c.confidence,
                c.status,
                c.accepted_memory_id,
                c.created_at_ms as i64,
            ],
        )
        .map_err(|e| format!("upsert candidate: {e}"))?;
        Ok(())
    })
}

pub fn list_candidates(project_id: &str, status: Option<&str>) -> Result<Vec<Candidate>, String> {
    with_read_path(|conn| {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM instruction_candidates
             WHERE project_id = ?1 AND (?2 IS NULL OR status = ?2)
             ORDER BY status ASC, section ASC, updated_at_ms DESC"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![project_id, status], map_row)
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

pub fn candidate_by_id(candidate_id: &str) -> Result<Option<Candidate>, String> {
    with_read_path(|conn| {
        let sql = format!("SELECT {SELECT_COLS} FROM instruction_candidates WHERE candidate_id = ?1");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![candidate_id], map_row).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    })
}

pub fn set_candidate_status(
    candidate_id: &str,
    status: &str,
    accepted_memory_id: Option<&str>,
) -> Result<(), String> {
    if !matches!(status, STATUS_PENDING | STATUS_ACCEPTED | STATUS_REJECTED | STATUS_STALE) {
        return Err(format!("invalid candidate status: {status}"));
    }
    with_write(|conn| {
        conn.execute(
            "UPDATE instruction_candidates
                SET status = ?2,
                    accepted_memory_id = COALESCE(?3, accepted_memory_id),
                    updated_at_ms = ?4
              WHERE candidate_id = ?1",
            params![candidate_id, status, accepted_memory_id, now_ms() as i64],
        )
        .map_err(|e| format!("set candidate status: {e}"))?;
        Ok(())
    })
}
