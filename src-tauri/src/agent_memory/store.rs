//! SQLite open, WAL, migrations, single-connection write gate helpers.

use crate::agent_memory::paths::agent_memory_db_path;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

static WRITE_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

const MIGRATION_V1: &str = r#"
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  git_root TEXT,
  workspace_path TEXT,
  display_name TEXT NOT NULL,
  detected_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  project_id TEXT NOT NULL,
  external_session_id TEXT NOT NULL,
  title TEXT,
  started_at_ms INTEGER,
  updated_at_ms INTEGER,
  last_seen_at_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'discovered',
  project_match TEXT NOT NULL DEFAULT 'unknown',
  match_reason TEXT NOT NULL DEFAULT '',
  match_confidence REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  activity_source TEXT NOT NULL DEFAULT 'observed',
  active_confidence REAL NOT NULL DEFAULT 0,
  workspace_evidence_json TEXT,
  UNIQUE(provider, project_id, external_session_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_provider_ext
  ON agent_sessions(provider, external_session_id);

CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  event_class TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  summary TEXT NOT NULL,
  detail_json TEXT,
  UNIQUE(provider, source_ref, event_type)
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts
  ON agent_events(session_id, timestamp_ms DESC);

CREATE TABLE IF NOT EXISTS provider_cursors (
  provider TEXT NOT NULL,
  database_path TEXT NOT NULL,
  last_scan_at_ms INTEGER,
  last_file_size INTEGER,
  last_db_mtime_ms INTEGER,
  last_wal_size INTEGER,
  last_wal_mtime_ms INTEGER,
  last_shm_size INTEGER,
  last_shm_mtime_ms INTEGER,
  schema_hash TEXT,
  last_successful_probe_at_ms INTEGER,
  cursor_json TEXT,
  probe_status TEXT,
  PRIMARY KEY (provider, database_path)
);
"#;

pub fn with_write<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let mutex = WRITE_CONN.get_or_init(|| {
        let path = agent_memory_db_path();
        let conn = open_rw(&path).expect("open agent-memory.sqlite3");
        migrate(&conn).expect("migrate agent-memory");
        Mutex::new(conn)
    });
    let conn = mutex
        .lock()
        .map_err(|_| "agent_memory write lock poisoned".to_string())?;
    f(&conn)
}

pub fn with_read_path<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    // ponytail: same write mutex for reads in v1 — upgrade to separate RO pool if contention shows
    with_write(f)
}

fn open_rw(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
    )
    .map_err(|e| format!("open agent-memory: {e}"))?;
    let _ = conn.busy_timeout(Duration::from_millis(5000));
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    Ok(conn)
}

pub(crate) fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(MIGRATION_V1)
        .map_err(|e| format!("migrate v1: {e}"))?;
    let applied_v1: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v1 == 0 {
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (1, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v1: {e}"))?;
    }

    let applied_v2: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 2",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v2 == 0 {
        conn.execute_batch(MIGRATION_V2)
            .map_err(|e| format!("migrate v2: {e}"))?;
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (2, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v2: {e}"))?;
    }

    let applied_v3: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 3",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v3 == 0 {
        conn.execute_batch(MIGRATION_V3)
            .map_err(|e| format!("migrate v3: {e}"))?;
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (3, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v3: {e}"))?;
    }

    let applied_v4: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 4",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v4 == 0 {
        // Additive: project user confirmation for Home Focus.
        // Prefer idempotent column ensure over batch ALTER — partial prior runs
        // may already have columns (duplicate column must not be swallowed silently
        // for unrelated failures; ensure_* propagates real errors).
        ensure_projects_confirm_columns(conn)?;
        let _ = MIGRATION_V4; // documented SQL; applied via ensure_projects_confirm_columns
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (4, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v4: {e}"))?;
    } else {
        ensure_projects_confirm_columns(conn)?;
    }

    let applied_v5: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 5",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v5 == 0 {
        conn.execute_batch(MIGRATION_V5)
            .map_err(|e| format!("migrate v5: {e}"))?;
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (5, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v5: {e}"))?;
    }
    Ok(())
}

fn ensure_projects_confirm_columns(conn: &Connection) -> Result<(), String> {
    let cols = table_columns(conn, "projects")?;
    if !cols.iter().any(|c| c == "user_confirmed") {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN user_confirmed INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| format!("add user_confirmed: {e}"))?;
    }
    if !cols.iter().any(|c| c == "confirmed_at_ms") {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN confirmed_at_ms INTEGER",
            [],
        )
        .map_err(|e| format!("add confirmed_at_ms: {e}"))?;
    }
    Ok(())
}

pub(crate) fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| format!("pragma table_info: {e}"))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| format!("table_info rows: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("col: {e}"))?);
    }
    Ok(out)
}

const MIGRATION_V2: &str = r#"
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_task TEXT,
  changed_files_json TEXT,
  pending_questions_json TEXT,
  next_action TEXT,
  last_event_id TEXT,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ckpt_session_created
  ON agent_checkpoints(session_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_ckpt_project_created
  ON agent_checkpoints(project_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS memory_records (
  memory_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source_event_id TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  supersedes_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_mem_project_updated
  ON memory_records(project_id, updated_at_ms DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  memory_id UNINDEXED,
  project_id UNINDEXED,
  memory_type UNINDEXED,
  content,
  tokenize = 'unicode61'
);
"#;

/// Plan C acceptance close: checkpoint updated_at + memory user_authored.
const MIGRATION_V3: &str = r#"
ALTER TABLE agent_checkpoints ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE agent_checkpoints SET updated_at_ms = created_at_ms WHERE updated_at_ms = 0 OR updated_at_ms IS NULL;
ALTER TABLE memory_records ADD COLUMN user_authored INTEGER NOT NULL DEFAULT 0;
"#;

/// Home Focus: user-confirmed project identity (additive).
const MIGRATION_V4: &str = r#"
ALTER TABLE projects ADD COLUMN user_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN confirmed_at_ms INTEGER;
"#;

/// Agent Center: durable per-agent probe facts (not Soft Pad capability catalog).
const MIGRATION_V5: &str = r#"
CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id TEXT PRIMARY KEY,
  runtime_kind TEXT NULL,
  display_name TEXT NOT NULL,
  form_factor TEXT NOT NULL DEFAULT 'unknown',
  presence_state TEXT NOT NULL DEFAULT 'not_found',
  version TEXT NULL,
  data_path TEXT NULL,
  adapter_state TEXT NOT NULL DEFAULT 'unknown',
  limitation_reason TEXT NULL,
  capability_evidence_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  last_probe_at_ms INTEGER NULL,
  last_successful_probe_at_ms INTEGER NULL,
  last_sync_at_ms INTEGER NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_registry_runtime_kind
  ON agent_registry(runtime_kind);
CREATE INDEX IF NOT EXISTS idx_agent_registry_presence
  ON agent_registry(presence_state);
"#;

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn migration_creates_tables() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='agent_sessions'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn migration_v4_adds_project_confirm_columns() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let cols = table_columns(&conn, "projects").unwrap();
        assert!(cols.iter().any(|c| c == "user_confirmed"));
        assert!(cols.iter().any(|c| c == "confirmed_at_ms"));
        // Idempotent second migrate.
        migrate(&conn).unwrap();
        let cols2 = table_columns(&conn, "projects").unwrap();
        assert_eq!(cols2.iter().filter(|c| *c == "user_confirmed").count(), 1);
    }

    #[test]
    fn migration_v5_creates_agent_registry() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='agent_registry'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        let cols = table_columns(&conn, "agent_registry").unwrap();
        for required in [
            "agent_id",
            "runtime_kind",
            "display_name",
            "form_factor",
            "presence_state",
            "version",
            "data_path",
            "adapter_state",
            "limitation_reason",
            "capability_evidence_json",
            "evidence_json",
            "last_probe_at_ms",
            "last_successful_probe_at_ms",
            "last_sync_at_ms",
            "created_at_ms",
            "updated_at_ms",
        ] {
            assert!(
                cols.iter().any(|c| c == required),
                "missing column {required}"
            );
        }
        let v5: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM schema_migrations WHERE version = 5",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(v5, 1);
        migrate(&conn).unwrap();
    }

    #[test]
    fn migration_v4_to_v5_upgrade() {
        let conn = Connection::open_in_memory().unwrap();
        // Apply through v4 only by running migrate then deleting v5 marker + table
        // isn't needed — fresh migrate is v1–v5. Simulate prior v4 DB:
        conn.execute_batch(MIGRATION_V1).unwrap();
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (1, ?1)",
            [now],
        )
        .unwrap();
        conn.execute_batch(MIGRATION_V2).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (2, ?1)",
            [now],
        )
        .unwrap();
        conn.execute_batch(MIGRATION_V3).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (3, ?1)",
            [now],
        )
        .unwrap();
        ensure_projects_confirm_columns(&conn).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (4, ?1)",
            [now],
        )
        .unwrap();
        let before: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='agent_registry'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(before, 0);
        migrate(&conn).unwrap();
        let after: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='agent_registry'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(after, 1);
    }
}
