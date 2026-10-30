//! Append-only event store + task projection. Events are never updated or deleted.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use sha2::{Digest, Sha256};

use super::contracts::{TaskDto, TaskEventDto, TaskStatus};

static WRITE_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();
// Thread-local so parallel #[test]s don't stomp each other's ATR DB path.
thread_local! {
    static TEST_DB_PATH: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS atr_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tasks (
  task_id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  workspace_root TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  waiting_reason TEXT,
  current_turn INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  changed_files_json TEXT NOT NULL DEFAULT '[]',
  baseline_dirty_json TEXT NOT NULL DEFAULT '[]',
  pending_approval_token TEXT,
  pending_patch_json TEXT,
  fingerprints_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_id TEXT,
  last_error TEXT,
  repair_count INTEGER NOT NULL DEFAULT 0,
  format_retry_count INTEGER NOT NULL DEFAULT 0,
  applied_tokens_json TEXT NOT NULL DEFAULT '[]',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_task_events (
  event_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  turn INTEGER NOT NULL DEFAULT 0,
  tool_name TEXT,
  payload_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(task_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_atr_events_task_seq ON agent_task_events(task_id, seq);
"#;

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn set_test_db_path(path: Option<PathBuf>) {
    TEST_DB_PATH.with(|c| *c.borrow_mut() = path);
}

fn default_db_path() -> PathBuf {
    if let Some(p) = TEST_DB_PATH.with(|c| c.borrow().clone()) {
        return p;
    }
    crate::data_root::effective_data_root().join("agent-task-runtime.sqlite3")
}

fn open_rw(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
            | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
            | rusqlite::OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )
    .map_err(|e| format!("open agent-task db: {e}"))?;
    let _ = conn.busy_timeout(Duration::from_millis(5000));
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA)
        .map_err(|e| format!("atr schema: {e}"))?;
    let applied: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM atr_schema_migrations WHERE version = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied == 0 {
        conn.execute(
            "INSERT INTO atr_schema_migrations(version, applied_at_ms) VALUES (1, ?1)",
            [now_ms() as i64],
        )
        .map_err(|e| format!("atr migrate record: {e}"))?;
    }
    Ok(())
}

/// Open a fresh connection for tests (avoids OnceLock stickiness across paths).
pub fn with_conn_at<F, T>(path: &Path, f: F) -> Result<T, String>
where
    F: FnOnce(&mut Connection) -> Result<T, String>,
{
    let mut conn = open_rw(path)?;
    f(&mut conn)
}

pub fn with_write<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&mut Connection) -> Result<T, String>,
{
    if let Some(p) = TEST_DB_PATH.with(|c| c.borrow().clone()) {
        return with_conn_at(&p, f);
    }
    let mutex = WRITE_CONN.get_or_init(|| {
        let path = default_db_path();
        let conn = open_rw(&path).expect("open agent-task-runtime.sqlite3");
        Mutex::new(conn)
    });
    let mut conn = mutex
        .lock()
        .map_err(|_| "agent_task_runtime write lock poisoned".to_string())?;
    f(&mut conn)
}

pub fn new_task_id() -> String {
    let ms = now_ms();
    let salt = format!("{:x}", Sha256::digest(format!("{ms}-{}", std::process::id()).as_bytes()));
    format!("atr_{ms}_{}", &salt[..12])
}

pub fn new_event_id(task_id: &str, seq: u64) -> String {
    let digest = Sha256::digest(format!("{task_id}|{seq}|{}", now_ms()).as_bytes());
    format!("{:x}", digest)
}

#[derive(Debug, Clone)]
pub struct TaskRow {
    pub task_id: String,
    pub goal: String,
    pub workspace_root: String,
    pub permission_mode: String,
    pub status: String,
    pub waiting_reason: Option<String>,
    pub current_turn: u32,
    pub tool_call_count: u32,
    pub changed_files_json: String,
    pub baseline_dirty_json: String,
    pub pending_approval_token: Option<String>,
    pub pending_patch_json: Option<String>,
    pub fingerprints_json: String,
    pub checkpoint_id: Option<String>,
    pub last_error: Option<String>,
    pub repair_count: u32,
    pub format_retry_count: u32,
    pub applied_tokens_json: String,
    pub created_at: u64,
    pub updated_at: u64,
}

impl TaskRow {
    pub fn to_dto(&self) -> TaskDto {
        TaskDto {
            task_id: self.task_id.clone(),
            goal: self.goal.clone(),
            workspace_root: self.workspace_root.clone(),
            permission_mode: self.permission_mode.clone(),
            status: self.status.clone(),
            waiting_reason: self.waiting_reason.clone(),
            current_turn: self.current_turn,
            tool_call_count: self.tool_call_count,
            changed_files: parse_string_list(&self.changed_files_json),
            pending_approval_token: self.pending_approval_token.clone(),
            checkpoint_id: self.checkpoint_id.clone(),
            last_error: self.last_error.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

pub fn parse_string_list(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn map_task(r: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRow> {
    Ok(TaskRow {
        task_id: r.get(0)?,
        goal: r.get(1)?,
        workspace_root: r.get(2)?,
        permission_mode: r.get(3)?,
        status: r.get(4)?,
        waiting_reason: r.get(5)?,
        current_turn: r.get::<_, i64>(6)? as u32,
        tool_call_count: r.get::<_, i64>(7)? as u32,
        changed_files_json: r.get(8)?,
        baseline_dirty_json: r.get(9)?,
        pending_approval_token: r.get(10)?,
        pending_patch_json: r.get(11)?,
        fingerprints_json: r.get(12)?,
        checkpoint_id: r.get(13)?,
        last_error: r.get(14)?,
        repair_count: r.get::<_, i64>(15)? as u32,
        format_retry_count: r.get::<_, i64>(16)? as u32,
        applied_tokens_json: r.get(17)?,
        created_at: r.get::<_, i64>(18)? as u64,
        updated_at: r.get::<_, i64>(19)? as u64,
    })
}

const TASK_SELECT: &str = "SELECT task_id, goal, workspace_root, permission_mode, status,
  waiting_reason, current_turn, tool_call_count, changed_files_json, baseline_dirty_json,
  pending_approval_token, pending_patch_json, fingerprints_json, checkpoint_id, last_error,
  repair_count, format_retry_count, applied_tokens_json, created_at_ms, updated_at_ms
  FROM agent_tasks";

pub fn get_task(conn: &Connection, task_id: &str) -> Result<Option<TaskRow>, String> {
    conn.query_row(
        &format!("{TASK_SELECT} WHERE task_id = ?1"),
        params![task_id],
        map_task,
    )
    .optional()
    .map_err(|e| format!("get task: {e}"))
}

pub fn list_events(conn: &Connection, task_id: &str) -> Result<Vec<TaskEventDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT event_id, task_id, seq, kind, turn, tool_name, payload_json, created_at_ms
             FROM agent_task_events WHERE task_id = ?1 ORDER BY seq ASC",
        )
        .map_err(|e| format!("prep events: {e}"))?;
    let rows = stmt
        .query_map(params![task_id], |r| {
            let payload_raw: String = r.get(6)?;
            let payload: Value =
                serde_json::from_str(&payload_raw).unwrap_or(Value::Object(Default::default()));
            Ok(TaskEventDto {
                event_id: r.get(0)?,
                task_id: r.get(1)?,
                seq: r.get::<_, i64>(2)? as u64,
                kind: r.get(3)?,
                turn: r.get::<_, i64>(4)? as u32,
                tool_name: r.get(5)?,
                payload,
                created_at: r.get::<_, i64>(7)? as u64,
            })
        })
        .map_err(|e| format!("query events: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("event row: {e}"))?);
    }
    Ok(out)
}

pub fn next_seq(conn: &Connection, task_id: &str) -> Result<u64, String> {
    let max: Option<i64> = conn
        .query_row(
            "SELECT MAX(seq) FROM agent_task_events WHERE task_id = ?1",
            params![task_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("max seq: {e}"))?
        .flatten();
    Ok(max.unwrap_or(0) as u64 + 1)
}

/// Append event + update task projection in the caller's transaction.
/// Never UPDATEs or DELETEs agent_task_events rows.
pub fn append_event_and_update_task(
    conn: &Connection,
    task: &TaskRow,
    kind: &str,
    tool_name: Option<&str>,
    payload: Value,
) -> Result<TaskEventDto, String> {
    let seq = next_seq(conn, &task.task_id)?;
    let event_id = new_event_id(&task.task_id, seq);
    let created = now_ms();
    let payload_json =
        serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into());
    conn.execute(
        "INSERT INTO agent_task_events(event_id, task_id, seq, kind, turn, tool_name, payload_json, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            event_id,
            task.task_id,
            seq as i64,
            kind,
            task.current_turn as i64,
            tool_name,
            payload_json,
            created as i64
        ],
    )
    .map_err(|e| format!("append event (append-only): {e}"))?;

    // Preserve Memory-bound checkpoint_id; never invent a local hash placeholder.
    conn.execute(
        "UPDATE agent_tasks SET
          status=?1, waiting_reason=?2, current_turn=?3, tool_call_count=?4,
          changed_files_json=?5, baseline_dirty_json=?6, pending_approval_token=?7,
          pending_patch_json=?8, fingerprints_json=?9, checkpoint_id=?10, last_error=?11,
          repair_count=?12, format_retry_count=?13, applied_tokens_json=?14,
          permission_mode=?15, updated_at_ms=?16
         WHERE task_id=?17",
        params![
            task.status,
            task.waiting_reason,
            task.current_turn as i64,
            task.tool_call_count as i64,
            task.changed_files_json,
            task.baseline_dirty_json,
            task.pending_approval_token,
            task.pending_patch_json,
            task.fingerprints_json,
            task.checkpoint_id,
            task.last_error,
            task.repair_count as i64,
            task.format_retry_count as i64,
            task.applied_tokens_json,
            task.permission_mode,
            created as i64,
            task.task_id
        ],
    )
    .map_err(|e| format!("update task projection: {e}"))?;

    Ok(TaskEventDto {
        event_id,
        task_id: task.task_id.clone(),
        seq,
        kind: kind.into(),
        turn: task.current_turn,
        tool_name: tool_name.map(|s| s.to_string()),
        payload,
        created_at: created,
    })
}

pub fn insert_task(conn: &Connection, task: &TaskRow) -> Result<(), String> {
    conn.execute(
        "INSERT INTO agent_tasks(
          task_id, goal, workspace_root, permission_mode, status, waiting_reason,
          current_turn, tool_call_count, changed_files_json, baseline_dirty_json,
          pending_approval_token, pending_patch_json, fingerprints_json, checkpoint_id,
          last_error, repair_count, format_retry_count, applied_tokens_json,
          created_at_ms, updated_at_ms
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
        params![
            task.task_id,
            task.goal,
            task.workspace_root,
            task.permission_mode,
            task.status,
            task.waiting_reason,
            task.current_turn as i64,
            task.tool_call_count as i64,
            task.changed_files_json,
            task.baseline_dirty_json,
            task.pending_approval_token,
            task.pending_patch_json,
            task.fingerprints_json,
            task.checkpoint_id,
            task.last_error,
            task.repair_count as i64,
            task.format_retry_count as i64,
            task.applied_tokens_json,
            task.created_at as i64,
            task.updated_at as i64
        ],
    )
    .map_err(|e| format!("insert task: {e}"))?;
    Ok(())
}

/// Mark active-exec tasks interrupted on process boot. Append-only event per task.
pub fn interrupt_active_tasks(conn: &mut Connection) -> Result<usize, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("tx: {e}"))?;
    let mut ids = Vec::new();
    {
        let mut stmt = tx
            .prepare("SELECT task_id FROM agent_tasks WHERE status IN ('running','verifying','repair')")
            .map_err(|e| format!("prep interrupt: {e}"))?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| format!("q interrupt: {e}"))?;
        for row in rows {
            ids.push(row.map_err(|e| format!("row: {e}"))?);
        }
    }
    let n = ids.len();
    let mut synced = Vec::new();
    for id in ids {
        let mut task = get_task(&tx, &id)?.ok_or_else(|| "missing task".to_string())?;
        task.status = TaskStatus::Interrupted.as_str().into();
        task.waiting_reason = Some("process_restart".into());
        let ev = append_event_and_update_task(
            &tx,
            &task,
            "interrupted",
            None,
            serde_json::json!({"reason": "process_restart"}),
        )?;
        if let Ok(Some(t)) = get_task(&tx, &id) {
            synced.push((t, ev.event_id));
        }
    }
    tx.commit().map_err(|e| format!("commit interrupt: {e}"))?;
    for (t, eid) in synced {
        super::engine::sync_memory_checkpoint(&t, Some(&eid));
    }
    Ok(n)
}

/// Replay events to rebuild a minimal status projection (for recovery tests).
pub fn replay_status(conn: &Connection, task_id: &str) -> Result<String, String> {
    let events = list_events(conn, task_id)?;
    let mut status = TaskStatus::Intake.as_str().to_string();
    for ev in events {
        match ev.kind.as_str() {
            "started" => status = TaskStatus::Running.as_str().into(),
            "waiting_approval" | "waiting_user" => status = TaskStatus::Waiting.as_str().into(),
            "patch_applied" => status = TaskStatus::Verifying.as_str().into(),
            "check_ok" | "done" => status = TaskStatus::Done.as_str().into(),
            "failed" | "model_error" | "format_error" | "rate_limited" | "budget_exhausted" => {
                status = TaskStatus::Failed.as_str().into()
            }
            "cancelled" => status = TaskStatus::Cancelled.as_str().into(),
            "interrupted" => status = TaskStatus::Interrupted.as_str().into(),
            "tool_result" if ev.tool_name.as_deref() == Some("run_check") => {
                if ev.payload.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                    status = TaskStatus::Review.as_str().into();
                } else {
                    status = TaskStatus::Repair.as_str().into();
                }
            }
            _ => {}
        }
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn events_are_append_only_insert() {
        let path = std::env::temp_dir().join(format!(
            "atr_store_test_{}.sqlite3",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);
        with_conn_at(&path, |conn| {
            let now = now_ms();
            let task = TaskRow {
                task_id: "t1".into(),
                goal: "g".into(),
                workspace_root: "/tmp".into(),
                permission_mode: "write_with_approval".into(),
                status: "running".into(),
                waiting_reason: None,
                current_turn: 0,
                tool_call_count: 0,
                changed_files_json: "[]".into(),
                baseline_dirty_json: "[]".into(),
                pending_approval_token: None,
                pending_patch_json: None,
                fingerprints_json: "{}".into(),
                checkpoint_id: None,
                last_error: None,
                repair_count: 0,
                format_retry_count: 0,
                applied_tokens_json: "[]".into(),
                created_at: now,
                updated_at: now,
            };
            insert_task(conn, &task)?;
            append_event_and_update_task(
                conn,
                &task,
                "started",
                None,
                serde_json::json!({}),
            )?;
            // No public update/delete API; raw UPDATE should not be used by runtime.
            let n: i64 = conn
                .query_row("SELECT COUNT(1) FROM agent_task_events", [], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 1);
            Ok(())
        })
        .unwrap();
    }
}
