//! Plan C: project-scoped memory + FTS5 query (local; no remote sync).

use crate::agent_memory::model::MemoryRecordDto;
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

const MAX_CONTENT: usize = 2000;

fn clip_content(s: &str) -> Result<String, String> {
    let t = s.trim();
    if t.is_empty() {
        return Err("content empty".into());
    }
    if t.chars().count() > MAX_CONTENT {
        return Err(format!("content too long (max {MAX_CONTENT})"));
    }
    // Reject obvious secrets / token-looking blobs (cheap heuristics, not a scanner).
    let lower = t.to_ascii_lowercase();
    if lower.contains("access_token")
        || lower.contains("refresh_token")
        || lower.contains("authorization: bearer")
        || lower.contains("cookie:")
        || lower.contains("set-cookie")
        || lower.contains("api_key=")
        || lower.contains("apikey=")
        || lower.contains("sk-")
    {
        return Err("sensitive content rejected".into());
    }
    Ok(t.to_string())
}

fn valid_type(t: &str) -> bool {
    matches!(
        t,
        "observation" | "decision" | "gotcha" | "task" | "reasoning" | "summary" | "context"
    )
}

fn map_memory_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryRecordDto> {
    Ok(MemoryRecordDto {
        memory_id: r.get(0)?,
        project_id: r.get(1)?,
        session_id: r.get(2)?,
        memory_type: r.get(3)?,
        content: r.get(4)?,
        source_event_id: r.get(5)?,
        confidence: r.get(6)?,
        created_at: r.get::<_, i64>(7)? as u64,
        updated_at: r.get::<_, i64>(8)? as u64,
        supersedes_id: r.get(9)?,
        user_authored: r.get::<_, i64>(10).unwrap_or(0) != 0,
    })
}

fn assert_supersedes_same_project(
    conn: &Connection,
    project_id: &str,
    supersedes_id: Option<&str>,
) -> Result<(), String> {
    let Some(sid) = supersedes_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(());
    };
    let row: Option<String> = conn
        .query_row(
            "SELECT project_id FROM memory_records WHERE memory_id = ?1",
            params![sid],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match row {
        None => Err(format!("supersedes_id not found: {sid}")),
        Some(pid) if pid == project_id => Ok(()),
        Some(_) => Err("supersedes_id cross-project rejected".into()),
    }
}

/// Upsert memory in project scope. Never cross-project.
/// `source_event_id` required unless `user_authored` is true.
pub fn upsert_memory(
    project_id: &str,
    session_id: Option<&str>,
    memory_type: &str,
    content: &str,
    source_event_id: Option<&str>,
    confidence: Option<f32>,
    supersedes_id: Option<&str>,
    user_authored: bool,
) -> Result<MemoryRecordDto, String> {
    if project_id.trim().is_empty() {
        return Err("project_id required".into());
    }
    if !valid_type(memory_type) {
        return Err(format!("invalid memory_type: {memory_type}"));
    }
    let source = source_event_id.map(str::trim).filter(|s| !s.is_empty());
    if source.is_none() && !user_authored {
        return Err("source_event_id required (or user_authored)".into());
    }
    let body = clip_content(content)?;
    let conf = confidence.unwrap_or(0.5).clamp(0.0, 1.0);
    let now = now_ms();
    let authored_i = if user_authored { 1i64 } else { 0 };

    // Idempotent key: project + type + source (or content hash for user-authored).
    let memory_id = if let Some(src) = source {
        format!(
            "{:x}",
            Sha256::digest(format!("{project_id}|{memory_type}|{src}").as_bytes())
        )
    } else {
        format!(
            "{:x}",
            Sha256::digest(format!("{project_id}|{memory_type}|user|{body}").as_bytes())
        )
    };

    with_write(|conn| {
        assert_supersedes_same_project(conn, project_id, supersedes_id)?;

        conn.execute(
            "INSERT INTO memory_records(
               memory_id, project_id, session_id, memory_type, content,
               source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id,
               user_authored
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,?9,?10)
             ON CONFLICT(memory_id) DO UPDATE SET
               content = excluded.content,
               confidence = excluded.confidence,
               updated_at_ms = excluded.updated_at_ms,
               session_id = COALESCE(excluded.session_id, memory_records.session_id),
               source_event_id = COALESCE(excluded.source_event_id, memory_records.source_event_id),
               supersedes_id = COALESCE(excluded.supersedes_id, memory_records.supersedes_id),
               user_authored = excluded.user_authored",
            params![
                memory_id,
                project_id,
                session_id,
                memory_type,
                body,
                source,
                conf,
                now as i64,
                supersedes_id,
                authored_i
            ],
        )
        .map_err(|e| format!("upsert memory: {e}"))?;

        let _ = conn.execute("DELETE FROM memory_fts WHERE memory_id = ?1", params![memory_id]);
        conn.execute(
            "INSERT INTO memory_fts(memory_id, project_id, memory_type, content)
             VALUES (?1,?2,?3,?4)",
            params![memory_id, project_id, memory_type, body],
        )
        .map_err(|e| format!("fts index: {e}"))?;

        Ok(MemoryRecordDto {
            memory_id,
            project_id: project_id.into(),
            session_id: session_id.map(|s| s.to_string()),
            memory_type: memory_type.into(),
            content: body,
            source_event_id: source.map(|s| s.to_string()),
            confidence: conf,
            created_at: now,
            updated_at: now,
            supersedes_id: supersedes_id.map(|s| s.to_string()),
            user_authored,
        })
    })
}

/// FTS query scoped to project_id (hard filter — no cross-project leak).
pub fn query_memory(project_id: &str, query: &str, limit: usize) -> Result<Vec<MemoryRecordDto>, String> {
    if project_id.trim().is_empty() {
        return Err("project_id required".into());
    }
    let lim = limit.clamp(1, 50);
    let q = query.trim();
    if q.is_empty() {
        return list_recent_memory(project_id, lim);
    }

    // Escape FTS5 special chars lightly — token AND (unicode61 splits CJK per char).
    let safe: String = q
        .chars()
        .map(|c| match c {
            '"' | '*' | '(' | ')' | ':' | '^' => ' ',
            _ => c,
        })
        .collect::<String>()
        .split_whitespace()
        .take(12)
        .collect::<Vec<_>>()
        .join(" ");
    if safe.is_empty() {
        return list_recent_memory(project_id, lim);
    }

    let fts_hits: Vec<MemoryRecordDto> = with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT m.memory_id, m.project_id, m.session_id, m.memory_type, m.content,
                        m.source_event_id, m.confidence, m.created_at_ms, m.updated_at_ms, m.supersedes_id,
                        COALESCE(m.user_authored, 0)
                 FROM memory_fts
                 JOIN memory_records m ON m.memory_id = memory_fts.memory_id
                 WHERE memory_fts.project_id = ?1 AND memory_fts MATCH ?2
                 ORDER BY m.updated_at_ms DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id, safe.as_str(), lim as i64], map_memory_row)
            .map_err(|e| e.to_string())?;
        Ok(mapped.flatten().collect())
    })?;
    if !fts_hits.is_empty() {
        return Ok(fts_hits);
    }

    // Fallback: project-scoped substring (FTS tokenizers vary for CJK).
    let like = format!("%{safe}%");
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT memory_id, project_id, session_id, memory_type, content,
                        source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id,
                        COALESCE(user_authored, 0)
                 FROM memory_records
                 WHERE project_id = ?1 AND content LIKE ?2
                 ORDER BY updated_at_ms DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id, like, lim as i64], map_memory_row)
            .map_err(|e| e.to_string())?;
        Ok(mapped.flatten().collect())
    })
}

pub fn list_recent_memory(project_id: &str, limit: usize) -> Result<Vec<MemoryRecordDto>, String> {
    let lim = limit.clamp(1, 50);
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT memory_id, project_id, session_id, memory_type, content,
                        source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id,
                        COALESCE(user_authored, 0)
                 FROM memory_records
                 WHERE project_id = ?1
                 ORDER BY updated_at_ms DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id, lim as i64], map_memory_row)
            .map_err(|e| e.to_string())?;
        Ok(mapped.flatten().collect())
    })
}

/// Provider context injection pack — project memories + optional checkpoint next_action.
pub fn context_for_provider(
    project_id: &str,
    query: Option<&str>,
    limit: usize,
) -> serde_json::Value {
    if project_id.trim().is_empty() || project_id == crate::agent_memory::UNKNOWN_PROJECT_ID {
        return serde_json::json!({
            "projectId": project_id,
            "memories": [],
            "checkpoint": null,
            "scope": "project",
            "source": "agent_memory_local",
            "diagnostics": ["unknown_or_empty_project"]
        });
    }
    let lim = limit.clamp(1, 30);
    let memories = query
        .filter(|q| !q.trim().is_empty())
        .and_then(|q| query_memory(project_id, q, lim).ok())
        .or_else(|| list_recent_memory(project_id, lim).ok())
        .unwrap_or_default();
    let checkpoint = crate::agent_memory::checkpoint::latest_checkpoint_for_project(project_id);
    serde_json::json!({
        "projectId": project_id,
        "memories": memories,
        "checkpoint": checkpoint,
        "scope": "project",
        "source": "agent_memory_local",
        "diagnostics": []
    })
}

/// Rebuild FTS5 index from canonical memory_records (recovery path).
pub fn rebuild_memory_fts() -> Result<usize, String> {
    with_write(|conn| {
        conn.execute_batch("DELETE FROM memory_fts;")
            .map_err(|e| format!("clear fts: {e}"))?;
        let mut stmt = conn
            .prepare(
                "SELECT memory_id, project_id, memory_type, content FROM memory_records",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut n = 0usize;
        for row in rows.flatten() {
            conn.execute(
                "INSERT INTO memory_fts(memory_id, project_id, memory_type, content)
                 VALUES (?1,?2,?3,?4)",
                params![row.0, row.1, row.2, row.3],
            )
            .map_err(|e| format!("rebuild fts row: {e}"))?;
            n += 1;
        }
        Ok(n)
    })
}
