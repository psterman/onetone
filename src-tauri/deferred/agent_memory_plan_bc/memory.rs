//! Plan C: project-scoped memory + FTS5 query (local; no remote sync).

use crate::agent_memory::model::MemoryRecordDto;
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use rusqlite::params;
use sha2::{Digest, Sha256};

const MAX_CONTENT: usize = 2000;

fn clip_content(s: &str) -> String {
    let t = s.trim();
    if t.chars().count() <= MAX_CONTENT {
        return t.to_string();
    }
    t.chars().take(MAX_CONTENT).collect::<String>() + "…"
}

fn valid_type(t: &str) -> bool {
    matches!(
        t,
        "observation" | "decision" | "gotcha" | "task" | "reasoning" | "summary" | "context"
    )
}

/// Upsert memory in project scope. Never cross-project.
pub fn upsert_memory(
    project_id: &str,
    session_id: Option<&str>,
    memory_type: &str,
    content: &str,
    source_event_id: Option<&str>,
    confidence: Option<f32>,
    supersedes_id: Option<&str>,
) -> Result<MemoryRecordDto, String> {
    if project_id.trim().is_empty() {
        return Err("project_id required".into());
    }
    if !valid_type(memory_type) {
        return Err(format!("invalid memory_type: {memory_type}"));
    }
    let body = clip_content(content);
    if body.is_empty() {
        return Err("content empty".into());
    }
    let conf = confidence.unwrap_or(0.5).clamp(0.0, 1.0);
    let now = now_ms();
    let memory_id = format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{project_id}|{memory_type}|{}|{}",
                source_event_id.unwrap_or(""),
                body
            )
            .as_bytes()
        )
    );

    with_write(|conn| {
        conn.execute(
            "INSERT INTO memory_records(
               memory_id, project_id, session_id, memory_type, content,
               source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,?9)
             ON CONFLICT(memory_id) DO UPDATE SET
               content = excluded.content,
               confidence = excluded.confidence,
               updated_at_ms = excluded.updated_at_ms,
               session_id = COALESCE(excluded.session_id, memory_records.session_id),
               source_event_id = COALESCE(excluded.source_event_id, memory_records.source_event_id),
               supersedes_id = COALESCE(excluded.supersedes_id, memory_records.supersedes_id)",
            params![
                memory_id,
                project_id,
                session_id,
                memory_type,
                body,
                source_event_id,
                conf,
                now as i64,
                supersedes_id
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
            source_event_id: source_event_id.map(|s| s.to_string()),
            confidence: conf,
            created_at: now,
            updated_at: now,
            supersedes_id: supersedes_id.map(|s| s.to_string()),
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

    // Escape FTS5 special chars lightly — treat as phrase search.
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
    let match_q = format!("\"{}\"", safe.replace('"', ""));

    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT m.memory_id, m.project_id, m.session_id, m.memory_type, m.content,
                        m.source_event_id, m.confidence, m.created_at_ms, m.updated_at_ms, m.supersedes_id
                 FROM memory_fts f
                 JOIN memory_records m ON m.memory_id = f.memory_id
                 WHERE f.project_id = ?1 AND f MATCH ?2
                 ORDER BY m.updated_at_ms DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        // FTS5 table name in MATCH: use column table alias carefully —
        // `memory_fts MATCH` requires the fts table in FROM.
        let mapped = stmt
            .query_map(params![project_id, match_q, lim as i64], |r| {
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
                })
            })
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
                        source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id
                 FROM memory_records
                 WHERE project_id = ?1
                 ORDER BY updated_at_ms DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id, lim as i64], |r| {
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
                })
            })
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
    let memories = query
        .filter(|q| !q.trim().is_empty())
        .and_then(|q| query_memory(project_id, q, limit).ok())
        .or_else(|| list_recent_memory(project_id, limit).ok())
        .unwrap_or_default();
    let checkpoint = crate::agent_memory::checkpoint::latest_checkpoint_for_project(project_id);
    serde_json::json!({
        "projectId": project_id,
        "memories": memories,
        "checkpoint": checkpoint,
        "scope": "project",
        "source": "agent_memory_local"
    })
}
