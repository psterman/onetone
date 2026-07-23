//! Append-only light event log: raw tag → normalized → accept/reject.

use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;

use super::model::PadStatus;

/// Production: on. Tests: off by default so arbiter/adapter ingest cannot dirty
/// shared `logs/pad-status.jsonl`; the log unit test re-enables with a path override.
#[cfg(not(test))]
static ENABLED: AtomicBool = AtomicBool::new(true);
#[cfg(test)]
static ENABLED: AtomicBool = AtomicBool::new(false);

/// Test-only override so unit tests never touch the product `logs/pad-status.jsonl`.
static LOG_PATH_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::Relaxed);
}

/// Override log path (tests). Pass `None` to clear and restore production path.
pub fn set_log_path_override(path: Option<PathBuf>) {
    if let Ok(mut slot) = LOG_PATH_OVERRIDE.lock() {
        *slot = path;
    }
}

pub fn log_path() -> PathBuf {
    if let Ok(slot) = LOG_PATH_OVERRIDE.lock() {
        if let Some(ref p) = *slot {
            return p.clone();
        }
    }
    default_log_path()
}

fn default_log_path() -> PathBuf {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let logs = cwd.join("logs");
    if std::fs::create_dir_all(&logs).is_ok() {
        return logs.join("pad-status.jsonl");
    }
    std::env::temp_dir().join("onetone-pad-status.jsonl")
}

pub fn append_event(
    raw_tag: &str,
    normalized: &PadStatus,
    accepted: bool,
    reject_reason: Option<&str>,
) {
    if !ENABLED.load(Ordering::Relaxed) {
        return;
    }
    let line = serde_json::json!({
        "ts": normalized.updated_at,
        "raw": raw_tag,
        "normalized": {
            "state": normalized.state,
            "phase": normalized.phase,
            "source": normalized.source,
            "confidence": normalized.confidence,
            "updatedAt": normalized.updated_at,
            "agent": normalized.agent,
            "taskId": normalized.task_id,
            "sessionId": normalized.session_id,
            "message": normalized.message,
            "stickyUntil": normalized.sticky_until,
            "lastEvent": normalized.last_event,
        },
        "accepted": accepted,
        "rejectReason": reject_reason,
    });
    let Ok(text) = serde_json::to_string(&line) else {
        return;
    };
    let path = log_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{text}");
    }
}

/// Compact row for diagnose / replay UI (last N jsonl lines, oldest → newest).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadStatusLogRow {
    pub ts: u64,
    pub raw: String,
    pub accepted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reject_reason: Option<String>,
    pub state: String,
    /// UI-facing status (error→failed, phase=hold→listening).
    pub ui_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    pub source: String,
    pub confidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn ui_status_from_norm(state: &str, phase: Option<&str>) -> String {
    let mut status = state.to_string();
    if status == "error" {
        status = "failed".into();
    }
    if phase == Some("hold") {
        status = "listening".into();
    }
    status
}

/// Read the last `limit` jsonl events (oldest → newest). Fail-open → empty vec.
pub fn tail_events(limit: usize) -> Vec<PadStatusLogRow> {
    let limit = limit.clamp(1, 200);
    let path = log_path();
    let Ok(file) = std::fs::File::open(&path) else {
        return vec![];
    };
    let reader = BufReader::new(file);
    let mut ring: Vec<PadStatusLogRow> = Vec::with_capacity(limit);
    for line in reader.lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let norm = v.get("normalized");
        let state = norm
            .and_then(|n| n.get("state"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let phase = norm
            .and_then(|n| n.get("phase"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let ui_status = ui_status_from_norm(&state, phase.as_deref());
        let row = PadStatusLogRow {
            ts: v.get("ts").and_then(|x| x.as_u64()).unwrap_or(0),
            raw: v
                .get("raw")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            accepted: v.get("accepted").and_then(|x| x.as_bool()).unwrap_or(false),
            reject_reason: v
                .get("rejectReason")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            state,
            ui_status,
            phase,
            source: norm
                .and_then(|n| n.get("source"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            confidence: norm
                .and_then(|n| n.get("confidence"))
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string(),
            last_event: norm
                .and_then(|n| n.get("lastEvent"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            message: norm
                .and_then(|n| n.get("message"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
        };
        if ring.len() >= limit {
            ring.remove(0);
        }
        ring.push(row);
    }
    ring
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::model::{Confidence, PadSource, PadState, PadStatus};
    use std::sync::Mutex as StdMutex;

    /// Serialize log-path override tests (global override is process-wide).
    static TEST_LOCK: StdMutex<()> = StdMutex::new(());

    struct LogPathGuard {
        path: PathBuf,
    }

    impl LogPathGuard {
        fn new(path: PathBuf) -> Self {
            set_log_path_override(Some(path.clone()));
            Self { path }
        }
    }

    impl Drop for LogPathGuard {
        fn drop(&mut self) {
            set_log_path_override(None);
            set_enabled(false);
            let _ = std::fs::remove_file(&self.path);
        }
    }

    fn unique_temp_log() -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("onetone-pad-status-test-{nanos}.jsonl"))
    }

    #[test]
    fn log_path_override_points_at_temp_file() {
        let _lock = TEST_LOCK.lock().unwrap();
        let tmp = unique_temp_log();
        let _guard = LogPathGuard::new(tmp.clone());
        assert_eq!(log_path(), tmp);
        assert_ne!(log_path(), default_log_path());
    }

    #[test]
    fn tail_events_reads_appended_lines() {
        let _lock = TEST_LOCK.lock().unwrap();
        let tmp = unique_temp_log();
        let _guard = LogPathGuard::new(tmp.clone());
        set_enabled(true);

        let pad = PadStatus {
            state: PadState::Running.as_str().into(),
            phase: None,
            source: PadSource::Hook.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: 42,
            agent: Some("codex".into()),
            task_id: None,
            session_id: None,
            message: Some("执行中".into()),
            sticky_until: None,
            last_event: Some("UserPromptSubmit".into()),
        };
        append_event("hook:UserPromptSubmit", &pad, true, None);
        append_event(
            "inferred:idle",
            &PadStatus {
                state: PadState::Idle.as_str().into(),
                confidence: Confidence::Low.as_str().into(),
                source: PadSource::Inferred.as_str().into(),
                updated_at: 43,
                ..PadStatus::default()
            },
            false,
            Some("low_confidence_vs_sticky"),
        );
        let rows = tail_events(10);
        assert_eq!(rows.len(), 2, "isolated temp log must contain only this test's lines");
        let last = rows.last().unwrap();
        assert!(!last.accepted);
        assert_eq!(
            last.reject_reason.as_deref(),
            Some("low_confidence_vs_sticky")
        );
        assert_eq!(last.ui_status, "idle");

        // Hold phase → listening ui_status for replay chips.
        append_event(
            "inferred:hold",
            &PadStatus {
                state: PadState::Running.as_str().into(),
                phase: Some("hold".into()),
                source: PadSource::Inferred.as_str().into(),
                confidence: Confidence::Medium.as_str().into(),
                updated_at: 44,
                message: Some("听写".into()),
                ..PadStatus::default()
            },
            true,
            None,
        );
        let rows2 = tail_events(10);
        assert_eq!(rows2.len(), 3);
        let hold = rows2.last().unwrap();
        assert_eq!(hold.ui_status, "listening");
        assert_eq!(hold.message.as_deref(), Some("听写"));
        assert!(hold.accepted);

        // Product path must not have been selected while override is active.
        assert_eq!(log_path(), tmp);
    }
}
