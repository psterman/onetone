//! Plan C: session checkpoints + continuation brief (not Time Machine git).

use crate::agent_memory::events::append_lifecycle_event;
use crate::agent_memory::model::{CheckpointDto, ContinuationBrief, EVENT_CLASS_LIFECYCLE};
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

const MAX_SUMMARY: usize = 240;
const MAX_LIST_ITEMS: usize = 40;
const MAX_ITEM_CHARS: usize = 200;

fn clip(s: &str, n: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= n {
        return t.to_string();
    }
    t.chars().take(n).collect::<String>() + "…"
}

fn clip_list(items: Option<&[String]>) -> Result<Option<Vec<String>>, String> {
    let Some(items) = items else {
        return Ok(None);
    };
    if items.len() > MAX_LIST_ITEMS {
        return Err(format!("list too long (max {MAX_LIST_ITEMS})"));
    }
    Ok(Some(
        items.iter().map(|s| clip(s, MAX_ITEM_CHARS)).collect(),
    ))
}

fn parse_json_list(raw: Option<&str>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default()
}

fn map_checkpoint_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<CheckpointDto> {
    let created = r.get::<_, i64>(9)? as u64;
    let updated = r
        .get::<_, Option<i64>>(10)?
        .map(|x| x as u64)
        .unwrap_or(created);
    Ok(CheckpointDto {
        checkpoint_id: r.get(0)?,
        session_id: r.get(1)?,
        project_id: r.get(2)?,
        status: r.get(3)?,
        current_task: r.get(4)?,
        changed_files: parse_json_list(r.get::<_, Option<String>>(5)?.as_deref()),
        pending_questions: parse_json_list(r.get::<_, Option<String>>(6)?.as_deref()),
        next_action: r.get(7)?,
        last_event_id: r.get(8)?,
        created_at: created,
        updated_at: updated,
    })
}

const CKPT_SELECT: &str = "SELECT checkpoint_id, session_id, project_id, status, current_task,
                    changed_files_json, pending_questions_json, next_action,
                    last_event_id, created_at_ms, updated_at_ms
             FROM agent_checkpoints";

fn load_checkpoint(conn: &Connection, checkpoint_id: &str) -> Result<CheckpointDto, String> {
    conn.query_row(
        &format!("{CKPT_SELECT} WHERE checkpoint_id = ?1"),
        params![checkpoint_id],
        map_checkpoint_row,
    )
    .map_err(|e| format!("load checkpoint: {e}"))
}

fn insert_checkpoint_row(
    conn: &Connection,
    session_id: &str,
    next_action: Option<&str>,
    pending_questions: Option<&[String]>,
    changed_files: Option<&[String]>,
    at_ms: Option<u64>,
    auto_key: Option<&str>,
) -> Result<CheckpointDto, String> {
    let row: Option<(String, String, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT project_id, status, title, (
               SELECT event_id FROM agent_events e
               WHERE e.session_id = agent_sessions.session_id
               ORDER BY timestamp_ms DESC LIMIT 1
             )
             FROM agent_sessions WHERE session_id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok();
    let Some((project_id, status, title, last_event_id)) = row else {
        return Err(format!("session not found: {session_id}"));
    };

    let now = at_ms.unwrap_or_else(now_ms);
    let checkpoint_id = if let Some(key) = auto_key {
        format!(
            "{:x}",
            Sha256::digest(format!("{session_id}|auto|{key}").as_bytes())
        )
    } else {
        format!(
            "{:x}",
            Sha256::digest(format!("{session_id}|{now}|ckpt").as_bytes())
        )
    };
    let current_task = title.map(|t| clip(&t, MAX_SUMMARY));
    let next = next_action
        .map(|s| clip(s, MAX_SUMMARY))
        .or_else(|| current_task.as_ref().map(|t| format!("继续：「{t}」")))
        .unwrap_or_else(|| "从上次进度继续".into());
    let pending = clip_list(pending_questions)?;
    let files = clip_list(changed_files)?;
    let pending_json = pending
        .as_ref()
        .map(|q| serde_json::to_string(q).unwrap_or_else(|_| "[]".into()));
    let files_json = files
        .as_ref()
        .map(|f| serde_json::to_string(f).unwrap_or_else(|_| "[]".into()));

    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO agent_checkpoints(
           checkpoint_id, session_id, project_id, status, current_task,
           changed_files_json, pending_questions_json, next_action,
           last_event_id, created_at_ms, updated_at_ms
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
            params![
                checkpoint_id,
                session_id,
                project_id,
                status,
                current_task,
                files_json,
                pending_json,
                next,
                last_event_id,
                now as i64
            ],
        )
        .map_err(|e| format!("insert checkpoint: {e}"))?;

    if inserted == 0 {
        // Auto idempotent hit — return existing row; do not emit another event.
        return load_checkpoint(conn, &checkpoint_id);
    }

    // Same writer transaction — do not nest with_write via append_lifecycle_event.
    let event_type = "checkpoint_created";
    let source_ref = format!("ckpt|{checkpoint_id}");
    let event_id = format!(
        "{:x}",
        Sha256::digest(format!("onetone|{source_ref}|{event_type}").as_bytes())
    );
    let _ = conn.execute(
        "INSERT OR IGNORE INTO agent_events(
           event_id, session_id, provider, event_class, event_type,
           source_ref, timestamp_ms, summary, detail_json
         ) VALUES (?1,?2,'onetone',?3,?4,?5,?6,?7,NULL)",
        params![
            event_id,
            session_id,
            EVENT_CLASS_LIFECYCLE,
            event_type,
            source_ref,
            now as i64,
            "记下可继续位置"
        ],
    );

    Ok(CheckpointDto {
        checkpoint_id,
        session_id: session_id.into(),
        project_id,
        status,
        current_task,
        changed_files: parse_json_list(files_json.as_deref()),
        pending_questions: parse_json_list(pending_json.as_deref()),
        next_action: Some(next),
        last_event_id,
        created_at: now,
        updated_at: now,
    })
}

/// Create a continuation checkpoint from current session projection.
pub fn create_checkpoint(
    session_id: &str,
    next_action: Option<&str>,
    pending_questions: Option<&[String]>,
    changed_files: Option<&[String]>,
) -> Result<CheckpointDto, String> {
    with_write(|conn| {
        insert_checkpoint_row(
            conn,
            session_id,
            next_action,
            pending_questions,
            changed_files,
            None,
            None,
        )
    })
}

/// Auto-checkpoint on pause / waiting / completed / failed (best-effort).
/// Stable id: `session|auto|{event_type}|{last_event_id}` — duplicate triggers do not add rows.
/// Uses the lifecycle event timestamp so wall-clock ckpt events cannot leapfrog
/// later synthetic test / replay timestamps.
/// Must run **outside** an open with_write (append_lifecycle_event) to avoid lock re-entry.
pub fn maybe_auto_checkpoint(session_id: &str, event_type: &str, timestamp_ms: u64) {
    match event_type {
        "task_paused" | "waiting_approval" | "task_completed" | "task_failed" => {
            let next = match event_type {
                "task_paused" => Some("继续处理（状态更新曾暂停）"),
                "waiting_approval" => Some("确认后继续"),
                "task_completed" => Some("再做一件相关的事"),
                "task_failed" => Some("从上次进度继续排查"),
                _ => None,
            };
            let _ = with_write(|conn| {
                let last_event_id: Option<String> = conn
                    .query_row(
                        "SELECT event_id FROM agent_events
                         WHERE session_id = ?1
                         ORDER BY timestamp_ms DESC LIMIT 1",
                        params![session_id],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?;
                let key = format!(
                    "{event_type}|{}",
                    last_event_id.as_deref().unwrap_or("none")
                );
                insert_checkpoint_row(
                    conn,
                    session_id,
                    next,
                    None,
                    None,
                    Some(timestamp_ms),
                    Some(&key),
                )
            });
        }
        _ => {}
    }
}

pub fn latest_checkpoint_for_session(session_id: &str) -> Option<CheckpointDto> {
    with_read_path(|conn| {
        conn.query_row(
            &format!(
                "{CKPT_SELECT}
             WHERE session_id = ?1
             ORDER BY created_at_ms DESC, updated_at_ms DESC LIMIT 1"
            ),
            params![session_id],
            map_checkpoint_row,
        )
        .map_err(|e| e.to_string())
    })
    .ok()
}

pub fn latest_checkpoint_for_project(project_id: &str) -> Option<CheckpointDto> {
    with_read_path(|conn| {
        conn.query_row(
            &format!(
                "{CKPT_SELECT}
             WHERE project_id = ?1
             ORDER BY created_at_ms DESC, updated_at_ms DESC LIMIT 1"
            ),
            params![project_id],
            map_checkpoint_row,
        )
        .map_err(|e| e.to_string())
    })
    .ok()
}

/// Resume surface: continuation brief + mark session resumed.
/// Does not execute shell/git, write files, call agents, or open network.
pub fn resume_checkpoint(session_id: &str) -> Result<ContinuationBrief, String> {
    let ckpt = latest_checkpoint_for_session(session_id)
        .ok_or_else(|| format!("no checkpoint for session: {session_id}"))?;
    let provider: String = with_read_path(|conn| {
        conn.query_row(
            "SELECT provider FROM agent_sessions WHERE session_id = ?1",
            params![session_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })?;

    let ts = now_ms();
    let source_ref = format!("resume|{}|{}", ckpt.checkpoint_id, ts);
    let _ = append_lifecycle_event(
        session_id,
        &provider,
        "task_resumed",
        &source_ref,
        ts,
        ckpt.next_action.as_deref().unwrap_or("从上次进度继续"),
    );

    Ok(ContinuationBrief {
        checkpoint: ckpt.clone(),
        brief: format_brief(&ckpt),
        resumable: true,
    })
}

fn format_brief(c: &CheckpointDto) -> String {
    let mut parts = Vec::new();
    if let Some(t) = c.current_task.as_ref().filter(|s| !s.is_empty()) {
        parts.push(format!("任务：{t}"));
    }
    if let Some(n) = c.next_action.as_ref().filter(|s| !s.is_empty()) {
        parts.push(format!("下一步：{n}"));
    }
    if !c.pending_questions.is_empty() {
        parts.push(format!("待确认：{}", c.pending_questions.join("；")));
    }
    if !c.changed_files.is_empty() {
        let n = c.changed_files.len().min(5);
        parts.push(format!("相关文件：{}", c.changed_files[..n].join(", ")));
    }
    if parts.is_empty() {
        "可以从上次进度继续。".into()
    } else {
        parts.join(" · ")
    }
}
