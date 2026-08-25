//! Codex Desktop session scan → PadStatus + AgentLane via `source=codex_app`.
//!
//! Reads `~/.codex/session_index.jsonl` + `sessions/**/rollout-*.jsonl`.
//! Never writes thstatus / native. Does not forge OfficialHook NeedsInput.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use crate::codex_app_state::CodexAppStatePayload;
use crate::pad_status::adapters::codex::ingest_codex_app_payload;

const POLL_SECS: u64 = 2;
const MAX_SESSIONS: usize = 6;
const TAIL_READ_MAX: u64 = 256 * 1024;
/// Incomplete rollouts (`task_started` without `task_complete`) stay `running` forever.
/// Settle when the file itself has gone quiet. Live turns keep writing (token_count etc.).
/// ponytail: mtime only, not process watch — raise if silent streams exceed 3 min.
const RUNNING_STALE_MS: u64 = 3 * 60 * 1000;

/// 0=fresh path ok, 1=stale unused, 2=corrupt parse seen this process.
static SCAN_HEALTH: AtomicU8 = AtomicU8::new(0);
static STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct ScanState {
    index_mtime_ms: u64,
    /// session_id → (rollout_path, file_offset, last_status)
    sessions: std::collections::HashMap<String, SessionCursor>,
    last_emitted: Option<&'static str>,
}

#[derive(Clone, Default)]
struct SessionCursor {
    rollout: Option<PathBuf>,
    offset: u64,
    status: &'static str,
    mtime_ms: u64,
}

fn scan_state() -> &'static Mutex<ScanState> {
    static S: OnceLock<Mutex<ScanState>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(ScanState::default()))
}

/// Overlay signalHealth: corrupt when index/rollout JSON repeatedly fails.
pub fn session_scan_corrupt() -> bool {
    SCAN_HEALTH.load(Ordering::Relaxed) >= 2
}

pub fn mark_session_scan_corrupt() {
    SCAN_HEALTH.store(2, Ordering::Relaxed);
}

fn codex_home() -> PathBuf {
    if let Ok(h) = std::env::var("CODEX_HOME") {
        let t = h.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    dirs_next_home()
        .map(|h| h.join(".codex"))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Clone)]
struct IndexEntry {
    id: String,
    title: String,
    updated_at: String,
}

/// Pure: rollout `payload.type` → pad/attention event name (hook-shaped for Pad map).
pub fn map_rollout_payload_type(payload_type: &str) -> Option<&'static str> {
    match payload_type.trim() {
        "task_started" | "reasoning" | "function_call" | "custom_tool_call"
        | "function_call_output" => Some("UserPromptSubmit"),
        "task_complete" | "final_answer" | "turn_aborted" => Some("Stop"),
        "stream_error" | "error" => Some("StopFailure"),
        _ => None,
    }
}

/// Aggregate slot statuses → primary pad event.
pub fn aggregate_pad_event(statuses: &[&str]) -> &'static str {
    if statuses.iter().any(|s| *s == "running") {
        "UserPromptSubmit"
    } else if statuses.iter().any(|s| *s == "failed") {
        "StopFailure"
    } else if statuses.iter().any(|s| *s == "done") {
        "Stop"
    } else {
        "SessionEnd"
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Drop latched `running` when the rollout has not been written recently.
fn settle_stale_running(status: &str, mtime_ms: u64, now: u64) -> &'static str {
    if status == "running" && (mtime_ms == 0 || now.saturating_sub(mtime_ms) > RUNNING_STALE_MS) {
        return "done";
    }
    match status {
        "running" => "running",
        "failed" => "failed",
        "done" => "done",
        _ => "idle",
    }
}

fn status_from_event(event: &str) -> &'static str {
    match event {
        "UserPromptSubmit" => "running",
        "Stop" => "done",
        "StopFailure" => "failed",
        _ => "idle",
    }
}

fn read_session_index(path: &Path) -> Vec<IndexEntry> {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            mark_session_scan_corrupt();
            continue;
        };
        let id = v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() {
            continue;
        }
        let title = v
            .get("thread_name")
            .or_else(|| v.get("title"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let updated_at = v
            .get("updated_at")
            .or_else(|| v.get("updatedAt"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        items.push(IndexEntry {
            id,
            title,
            updated_at,
        });
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    items.truncate(MAX_SESSIONS);
    items
}

fn find_rollout_path(sessions_dir: &Path, thread_id: &str) -> Option<PathBuf> {
    if !sessions_dir.is_dir() {
        return None;
    }
    let needle = thread_id.to_ascii_lowercase();
    let mut best: Option<(PathBuf, u64)> = None;
    let mut stack = vec![sessions_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let path = ent.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let name = ent.file_name().to_string_lossy().to_string();
            if !name.starts_with("rollout-") || !name.ends_with(".jsonl") {
                continue;
            }
            if !name.to_ascii_lowercase().contains(&needle) {
                continue;
            }
            let mt = mtime_ms(&path);
            match &best {
                None => best = Some((path, mt)),
                Some((_, bmt)) if mt > *bmt => best = Some((path, mt)),
                _ => {}
            }
        }
    }
    best.map(|(p, _)| p)
}

fn advance_rollout(path: &Path, cursor: &mut SessionCursor) -> &'static str {
    let mt = mtime_ms(path);
    let Ok(meta) = std::fs::metadata(path) else {
        return cursor.status;
    };
    let size = meta.len();
    if size < cursor.offset {
        cursor.offset = 0;
        cursor.status = "idle";
    }
    if size == cursor.offset
        && cursor.rollout.as_deref() == Some(path)
        && mt == cursor.mtime_ms
    {
        return cursor.status;
    }
    cursor.mtime_ms = mt;
    cursor.rollout = Some(path.to_path_buf());

    let start = if size > TAIL_READ_MAX && cursor.offset == 0 {
        size.saturating_sub(TAIL_READ_MAX)
    } else {
        cursor.offset
    };
    let Ok(mut f) = File::open(path) else {
        return cursor.status;
    };
    if f.seek(SeekFrom::Start(start)).is_err() {
        return cursor.status;
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return cursor.status;
    }
    cursor.offset = start + buf.len() as u64;
    let text = String::from_utf8_lossy(&buf);
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if !(line.contains("task_started")
            || line.contains("task_complete")
            || line.contains("turn_aborted")
            || line.contains("stream_error")
            || line.contains("reasoning")
            || line.contains("function_call")
            || line.contains("final_answer")
            || line.contains("\"type\":\"error\""))
        {
            continue;
        }
        let Ok(ev) = serde_json::from_str::<serde_json::Value>(line) else {
            mark_session_scan_corrupt();
            continue;
        };
        if ev.get("type").and_then(|t| t.as_str()) != Some("event_msg") {
            continue;
        }
        let Some(payload_type) = ev
            .pointer("/payload/type")
            .and_then(|t| t.as_str())
        else {
            continue;
        };
        if let Some(event) = map_rollout_payload_type(payload_type) {
            cursor.status = status_from_event(event);
        }
    }
    cursor.status
}

fn tick_once() {
    let home = codex_home();
    let index = home.join("session_index.jsonl");
    let sessions_dir = home.join("sessions");
    if !index.is_file() {
        return;
    }
    let now = now_ms();
    let idx_mt = mtime_ms(&index);
    let mut g = match scan_state().lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    let entries = read_session_index(&index);
    g.index_mtime_ms = idx_mt;

    let mut statuses: Vec<&'static str> = Vec::new();
    let mut primary_session = String::new();
    let mut primary_title = String::new();

    for ent in &entries {
        let rollout = find_rollout_path(&sessions_dir, &ent.id);
        let cur = g.sessions.entry(ent.id.clone()).or_default();
        let status = match &rollout {
            Some(p) => advance_rollout(p, cur),
            None => {
                if cur.status == "idle" {
                    "idle"
                } else {
                    cur.status
                }
            }
        };
        // PoC: idle+rollout → treat as done once we have a file
        let status = if status == "idle" && rollout.is_some() && cur.offset > 0 {
            "done"
        } else {
            status
        };
        let status = settle_stale_running(status, cur.mtime_ms, now);
        cur.status = status;
        statuses.push(status);
        if primary_session.is_empty() {
            primary_session = ent.id.clone();
            primary_title = ent.title.clone();
        }
    }

    let event = aggregate_pad_event(&statuses);
    let changed = g.last_emitted != Some(event);
    if !changed {
        return;
    }
    g.last_emitted = Some(event);
    drop(g);

    let _ = ingest_codex_app_payload(&CodexAppStatePayload {
        source: "codex_app".into(),
        event: event.into(),
        session_id: primary_session.clone(),
        turn_id: String::new(),
        cwd: String::new(),
        model: String::new(),
        permission_mode: String::new(),
        tool_name: String::new(),
        agent_id: String::new(),
        agent_type: primary_title,
        ts: now,
    });
}

pub fn start_codex_session_scan_poll() {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::Builder::new()
        .name("codex-session-scan".into())
        .spawn(|| loop {
            tick_once();
            std::thread::sleep(Duration::from_secs(POLL_SECS));
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_rollout_payload_types() {
        assert_eq!(map_rollout_payload_type("task_started"), Some("UserPromptSubmit"));
        assert_eq!(map_rollout_payload_type("function_call"), Some("UserPromptSubmit"));
        assert_eq!(map_rollout_payload_type("task_complete"), Some("Stop"));
        assert_eq!(map_rollout_payload_type("stream_error"), Some("StopFailure"));
        assert_eq!(map_rollout_payload_type("other"), None);
    }

    #[test]
    fn aggregate_prefers_running_then_failed_then_done() {
        assert_eq!(aggregate_pad_event(&["done", "running"]), "UserPromptSubmit");
        assert_eq!(aggregate_pad_event(&["done", "failed"]), "StopFailure");
        assert_eq!(aggregate_pad_event(&["done", "idle"]), "Stop");
        assert_eq!(aggregate_pad_event(&["idle"]), "SessionEnd");
    }

    #[test]
    fn stale_task_started_without_complete_settles() {
        let now = 10 * 60 * 1000;
        assert_eq!(settle_stale_running("running", now - 60_000, now), "running");
        assert_eq!(
            settle_stale_running("running", now - RUNNING_STALE_MS - 1, now),
            "done"
        );
        assert_eq!(settle_stale_running("running", 0, now), "done");
        assert_eq!(settle_stale_running("done", 0, now), "done");
        assert_eq!(
            aggregate_pad_event(&["done", settle_stale_running("running", 1, now)]),
            "Stop"
        );
    }
}
