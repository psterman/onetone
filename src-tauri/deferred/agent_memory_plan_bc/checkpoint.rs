//! Plan C: session checkpoints + continuation brief (not Time Machine git).

use crate::agent_memory::events::append_lifecycle_event;
use crate::agent_memory::model::{
    CheckpointDto, ContinuationBrief, EVENT_CLASS_LIFECYCLE,
};
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

const MAX_SUMMARY: usize = 240;

fn clip(s: &str, n: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= n {
        return t.to_string();
    }
    t.chars().take(n).collect::<String>() + "…"
}

fn parse_json_list(raw: Option<&str>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
        .unwrap_or_default()
}

fn insert_checkpoint_row(
    conn: &Connection,
    session_id: &str,
    next_action: Option<&str>,
    pending_questions: Option<&[String]>,
    changed_files: Option<&[String]>,
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

    let now = now_ms();
    let checkpoint_id = format!(
        "{:x}",
        Sha256::digest(format!("{session_id}|{now}|ckpt").as_bytes())
    );
    let current_task = title.map(|t| clip(&t, MAX_SUMMARY));
    let next = next_action
        .map(|s| clip(s, MAX_SUMMARY))
        .or_else(|| {
            current_task
                .as_ref()
                .map(|t| format!("继续：「{t}」"))
        })
        .unwrap_or_else(|| "从上次进度继续".into());
    let pending_json = pending_questions.map(|q| serde_json::to_string(q).unwrap_or_else(|_| "[]".into()));
    let files_json = changed_files.map(|f| serde_json::to_string(f).unwrap_or_else(|_| "[]".into()));

    conn.execute(
        "INSERT INTO agent_checkpoints(
           checkpoint_id, session_id, project_id, status, current_task,
           changed_files_json, pending_questions_json, next_action,
           last_event_id, created_at_ms
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
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
        insert_checkpoint_row(conn, session_id, next_action, pending_questions, changed_files)
    })
}

pub fn latest_checkpoint_for_session(session_id: &str) -> Option<CheckpointDto> {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT checkpoint_id, session_id, project_id, status, current_task,
                    changed_files_json, pending_questions_json, next_action,
                    last_event_id, created_at_ms
             FROM agent_checkpoints
             WHERE session_id = ?1
             ORDER BY created_at_ms DESC LIMIT 1",
            params![session_id],
            |r| {
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
                    created_at: r.get::<_, i64>(9)? as u64,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
    .ok()
}

pub fn latest_checkpoint_for_project(project_id: &str) -> Option<CheckpointDto> {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT checkpoint_id, session_id, project_id, status, current_task,
                    changed_files_json, pending_questions_json, next_action,
                    last_event_id, created_at_ms
             FROM agent_checkpoints
             WHERE project_id = ?1
             ORDER BY created_at_ms DESC LIMIT 1",
            params![project_id],
            |r| {
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
                    created_at: r.get::<_, i64>(9)? as u64,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
    .ok()
}

/// Resume surface: continuation brief + mark session resumed.
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
        ckpt.next_action
            .as_deref()
            .unwrap_or("从上次进度继续"),
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

/// Auto-checkpoint on pause / waiting / completed / failed (best-effort).
/// Must run **outside** an open with_write (append_lifecycle_event) to avoid lock re-entry.
pub fn maybe_auto_checkpoint(session_id: &str, event_type: &str) {
    match event_type {
        "task_paused" | "waiting_approval" | "task_completed" | "task_failed" => {
            let next = match event_type {
                "task_paused" => Some("继续处理（状态更新曾暂停）"),
                "waiting_approval" => Some("确认后继续"),
                "task_completed" => Some("再做一件相关的事"),
                "task_failed" => Some("从上次进度继续排查"),
                _ => None,
            };
            let _ = create_checkpoint(session_id, next, None, None);
        }
        _ => {}
    }
}
