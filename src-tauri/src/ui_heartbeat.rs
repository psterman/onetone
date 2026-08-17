//! Lightweight UI heartbeat: FE pings Atomic only; Rust watchdog logs stalls.
//! cmd_ui_heartbeat must never take cfg/log_ring locks, write disk, or emit.
//! Stall persistence (last-ui-stall.json) is written only from the watchdog thread.

use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

static LAST_PING_MS: AtomicU64 = AtomicU64::new(0);
static LAST_SEQ: AtomicU64 = AtomicU64::new(0);
static LAST_FE_TIME: AtomicU64 = AtomicU64::new(0);
static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);
static PROCESS_START_SECS: AtomicU64 = AtomicU64::new(0);
static ACTIVITY_TAG: Mutex<String> = Mutex::new(String::new());
/// Last sync IPC command name still running (status / layout save). Watchdog includes this on stall.
static IPC_INFLIGHT: Mutex<String> = Mutex::new(String::new());
static IPC_INFLIGHT_MS: AtomicU64 = AtomicU64::new(0);
static IPC_INFLIGHT_DEPTH: AtomicU64 = AtomicU64::new(0);

/// Mark a sync IPC / blocking path so UI_HB_STALL can name the blocker.
pub fn note_ipc_enter(name: &str) {
    let depth = IPC_INFLIGHT_DEPTH.fetch_add(1, Ordering::SeqCst) + 1;
    if depth == 1 {
        IPC_INFLIGHT_MS.store(now_ms(), Ordering::Release);
    }
    if let Ok(mut g) = IPC_INFLIGHT.lock() {
        if g.is_empty() {
            *g = name.to_string();
        } else if !g.split('+').any(|p| p == name) {
            g.push('+');
            g.push_str(name);
        }
    }
}

/// Drop-safe pair for `note_ipc_enter` — timeout/panic must still clear inflight.
pub struct IpcInflightGuard {
    name: &'static str,
}

impl IpcInflightGuard {
    pub fn enter(name: &'static str) -> Self {
        note_ipc_enter(name);
        Self { name }
    }
}

impl Drop for IpcInflightGuard {
    fn drop(&mut self) {
        note_ipc_exit(self.name);
    }
}

pub fn note_ipc_exit(name: &str) {
    let prev = IPC_INFLIGHT_DEPTH.fetch_sub(1, Ordering::SeqCst);
    if prev <= 1 {
        IPC_INFLIGHT_DEPTH.store(0, Ordering::SeqCst);
        if let Ok(mut g) = IPC_INFLIGHT.lock() {
            g.clear();
        }
        IPC_INFLIGHT_MS.store(0, Ordering::Release);
        return;
    }
    if let Ok(mut g) = IPC_INFLIGHT.lock() {
        let next = g
            .split('+')
            .filter(|p| *p != name && !p.is_empty())
            .collect::<Vec<_>>()
            .join("+");
        *g = next;
    }
}

pub fn ipc_inflight_snapshot() -> (String, u64) {
    let name = IPC_INFLIGHT
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let since = IPC_INFLIGHT_MS.load(Ordering::Acquire);
    let held = if since == 0 || name.is_empty() {
        0
    } else {
        now_ms().saturating_sub(since)
    };
    (name, held)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Snapshot of the last serious UI stall / unclean exit — shown once on next boot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastUiStall {
    pub code: String,
    pub reason: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub gap_ms: u64,
    #[serde(default)]
    pub seq: u64,
    pub ts: u64,
}

fn stall_path() -> PathBuf {
    crate::data_root::effective_logs_dir().join("last-ui-stall.json")
}

fn session_path() -> PathBuf {
    crate::data_root::effective_logs_dir().join("session-running.json")
}

fn write_stall(stall: &LastUiStall) {
    let dir = crate::data_root::effective_logs_dir();
    let _ = fs::create_dir_all(&dir);
    let Ok(body) = serde_json::to_vec_pretty(stall) else {
        return;
    };
    let path = stall_path();
    if let Ok(mut file) = File::create(&path) {
        let _ = file.write_all(&body);
    }
}

fn read_stall_file() -> Option<LastUiStall> {
    let raw = fs::read_to_string(stall_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn clear_stall_file() {
    let _ = fs::remove_file(stall_path());
}

/// Clear only if the stall was recorded in *this* process (keep prior-boot banner).
fn clear_stall_file_if_current_session() {
    let start = PROCESS_START_SECS.load(Ordering::Acquire);
    if let Some(prev) = read_stall_file() {
        if start > 0 && prev.ts >= start {
            clear_stall_file();
        }
    }
}

/// Persist a stall marker (watchdog only). Upgrades 2s → 5s; never downgrades.
fn persist_stall_emergency(level: &str, gap_ms: u64, tag: &str, seq: u64) {
    let code = if level == "5s" {
        "UI_HB_STALL_5S"
    } else {
        "UI_HB_STALL_2S"
    };
    if let Some(prev) = read_stall_file() {
        if prev.code == "UI_HB_STALL_5S" && code == "UI_HB_STALL_2S" {
            return;
        }
    }
    let tag = tag.trim();
    let reason = if tag.is_empty() {
        format!("界面卡顿超过{level}（gap={gap_ms}ms）")
    } else {
        format!("界面卡顿超过{level}（gap={gap_ms}ms，活动={tag}）")
    };
    write_stall(&LastUiStall {
        code: code.into(),
        reason,
        tag: tag.chars().take(64).collect(),
        gap_ms,
        seq,
        ts: now_secs(),
    });
}

/// Call once at process start: detect unclean previous exit, then mark this session alive.
pub fn on_process_start() {
    let start = now_secs();
    PROCESS_START_SECS.store(start, Ordering::Release);
    let session = session_path();
    let unclean = session.is_file();
    if unclean && read_stall_file().is_none() {
        write_stall(&LastUiStall {
            code: "UNCLEAN_EXIT".into(),
            reason: "上次未正常退出（可能未响应后被结束）".into(),
            tag: String::new(),
            gap_ms: 0,
            seq: 0,
            // Stamp before PROCESS_START so recover in this session won't wipe it.
            ts: start.saturating_sub(1),
        });
    }
    let dir = crate::data_root::effective_logs_dir();
    let _ = fs::create_dir_all(&dir);
    let body = format!(
        "{{\n  \"pid\": {},\n  \"ts\": {}\n}}\n",
        std::process::id(),
        start
    );
    if let Ok(mut file) = File::create(&session) {
        let _ = file.write_all(body.as_bytes());
    }
}

/// Graceful exit: drop session lock only. Stall banner stays until FE dismisses.
pub fn on_graceful_exit() {
    let _ = fs::remove_file(session_path());
}

/// FE: peek last stall (does not clear).
pub fn take_last_stall_for_ui() -> Option<LastUiStall> {
    read_stall_file()
}

/// FE: user dismissed the banner.
pub fn clear_last_stall_for_ui() {
    clear_stall_file();
}

/// Update atomics only — no disk, no business locks, no emit.
pub fn note_ping(seq: u64, activity_tag: &str, frontend_time: u64) {
    LAST_SEQ.store(seq, Ordering::Relaxed);
    LAST_FE_TIME.store(frontend_time, Ordering::Relaxed);
    LAST_PING_MS.store(now_ms(), Ordering::Release);
    if let Ok(mut tag) = ACTIVITY_TAG.lock() {
        tag.clear();
        let t = activity_tag.trim();
        if !t.is_empty() {
            // Cap tag length to keep panic-free / allocation-light.
            let end: usize = t.chars().take(64).map(|c| c.len_utf8()).sum();
            tag.push_str(&t[..end.min(t.len())]);
        }
    }
}

pub fn last_ping_age_ms() -> u64 {
    let last = LAST_PING_MS.load(Ordering::Acquire);
    if last == 0 {
        return u64::MAX;
    }
    now_ms().saturating_sub(last)
}

pub fn activity_tag_snapshot() -> String {
    ACTIVITY_TAG
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

pub fn last_seq() -> u64 {
    LAST_SEQ.load(Ordering::Relaxed)
}

/// Live read-only snapshot for Debug → Repair hang viz. No disk / cfg / emit.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiHbSnapshot {
    pub ping_age_ms: u64,
    pub seq: u64,
    pub activity_tag: String,
    pub ipc: String,
    pub ipc_held_ms: u64,
}

pub fn live_snapshot() -> UiHbSnapshot {
    let age = last_ping_age_ms();
    let (ipc, ipc_held_ms) = ipc_inflight_snapshot();
    UiHbSnapshot {
        ping_age_ms: if age == u64::MAX { 0 } else { age },
        seq: last_seq(),
        activity_tag: activity_tag_snapshot(),
        ipc,
        ipc_held_ms,
    }
}

/// Read-only diag for voice bootstrap phase logs — Atomic + short Mutex, no disk.
pub fn ui_hb_diag() -> String {
    let age = last_ping_age_ms();
    let gap = if age == u64::MAX {
        "n/a".to_string()
    } else {
        format!("{age}ms")
    };
    let tag = activity_tag_snapshot();
    let tag_part = if tag.is_empty() {
        String::new()
    } else {
        format!(" tag={tag}")
    };
    format!("ui_hb gap={gap}{tag_part} seq={}", last_seq())
}

/// Start once from app setup. Watchdog reads atomics and logs via emergency path.
pub fn start_watchdog() {
    if WATCHDOG_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    // Seed so boot before first FE ping is not treated as a multi-hour stall.
    LAST_PING_MS.store(now_ms(), Ordering::Release);
    let _ = thread::Builder::new()
        .name("ui-heartbeat-watchdog".into())
        .spawn(move || {
            let mut warn_500 = false;
            let mut emerg_2s = false;
            let mut emerg_5s = false;
            let mut stall_since: Option<Instant> = None;
            loop {
                thread::sleep(Duration::from_millis(200));
                let age = last_ping_age_ms();
                if age == u64::MAX {
                    continue;
                }
                let tag = activity_tag_snapshot();
                let tag_part = if tag.is_empty() {
                    String::new()
                } else {
                    format!(" tag={tag}")
                };
                if age > 500 {
                    if stall_since.is_none() {
                        stall_since = Some(Instant::now());
                    }
                    if age > 5000 {
                        if !emerg_5s {
                            emerg_5s = true;
                            emerg_2s = true;
                            warn_500 = true;
                            let seq = LAST_SEQ.load(Ordering::Relaxed);
                            let (ipc_name, ipc_held) = ipc_inflight_snapshot();
                            let ipc_part = if ipc_name.is_empty() {
                                String::new()
                            } else {
                                format!(" ipc={ipc_name} held={ipc_held}ms")
                            };
                            crate::app_log::sync_emergency_line(
                                "ui_hb",
                                &format!("emergency gap>{age}ms (5s){tag_part}{ipc_part} seq={seq}"),
                            );
                            // #region agent log
                            crate::app_log::append_debug_session_ndjson(&format!(
                                "{{\"sessionId\":\"b5f349\",\"runId\":\"post-fix\",\"hypothesisId\":\"L\",\"location\":\"ui_heartbeat.rs:stall5s\",\"message\":\"UI_HB_STALL_5S\",\"data\":{{\"gapMs\":{age},\"seq\":{seq},\"tag\":\"{}\",\"ipc\":\"{}\",\"ipcHeldMs\":{}}},\"timestamp\":{}}}",
                                tag.replace('\\', "\\\\").replace('"', "\\\""),
                                ipc_name.replace('\\', "\\\\").replace('"', "\\\""),
                                ipc_held,
                                now_ms()
                            ));
                            // #endregion
                            persist_stall_emergency("5s", age, &tag, seq);
                        }
                    } else if age > 2000 {
                        if !emerg_2s {
                            emerg_2s = true;
                            warn_500 = true;
                            let seq = LAST_SEQ.load(Ordering::Relaxed);
                            crate::app_log::sync_emergency_line(
                                "ui_hb",
                                &format!("emergency gap>{age}ms (2s){tag_part} seq={seq}"),
                            );
                            persist_stall_emergency("2s", age, &tag, seq);
                        }
                    } else if !warn_500 {
                        warn_500 = true;
                        crate::app_log::sync_emergency_line(
                            "ui_hb",
                            &format!(
                                "warning gap>{age}ms (500ms){tag_part} seq={}",
                                LAST_SEQ.load(Ordering::Relaxed)
                            ),
                        );
                    }
                } else if let Some(since) = stall_since.take() {
                    let blocked_ms = since.elapsed().as_millis();
                    crate::app_log::sync_emergency_line(
                        "ui_hb",
                        &format!(
                            "recovered blocked_ms={blocked_ms}{tag_part} seq={}",
                            LAST_SEQ.load(Ordering::Relaxed)
                        ),
                    );
                    // Same-session recovery — keep prior-boot banner if still unread.
                    clear_stall_file_if_current_session();
                    warn_500 = false;
                    emerg_2s = false;
                    emerg_5s = false;
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stall_json_roundtrip() {
        let s = LastUiStall {
            code: "UI_HB_STALL_2S".into(),
            reason: "界面卡顿超过2s".into(),
            tag: "test".into(),
            gap_ms: 2100,
            seq: 3,
            ts: 1,
        };
        let raw = serde_json::to_string(&s).unwrap();
        let back: LastUiStall = serde_json::from_str(&raw).unwrap();
        assert_eq!(back.code, "UI_HB_STALL_2S");
        assert_eq!(back.gap_ms, 2100);
        assert_eq!(back.tag, "test");
    }

    #[test]
    fn live_snapshot_is_atomics_only_shape() {
        note_ping(42, "hangViz", 1000);
        let snap = live_snapshot();
        assert_eq!(snap.seq, 42);
        assert_eq!(snap.activity_tag, "hangViz");
        let raw = serde_json::to_value(&snap).unwrap();
        assert!(raw.get("pingAgeMs").is_some());
        assert!(raw.get("ipcHeldMs").is_some());
    }
}
