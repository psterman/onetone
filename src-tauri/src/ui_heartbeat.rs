//! Lightweight UI heartbeat: FE pings Atomic only; Rust watchdog logs stalls.
//! cmd_ui_heartbeat must never take cfg/log_ring locks, write disk, or emit.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static LAST_PING_MS: AtomicU64 = AtomicU64::new(0);
static LAST_SEQ: AtomicU64 = AtomicU64::new(0);
static LAST_FE_TIME: AtomicU64 = AtomicU64::new(0);
static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);
static ACTIVITY_TAG: Mutex<String> = Mutex::new(String::new());

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
                            crate::app_log::sync_emergency_line(
                                "ui_hb",
                                &format!("emergency gap>{age}ms (5s){tag_part} seq={}", LAST_SEQ.load(Ordering::Relaxed)),
                            );
                        }
                    } else if age > 2000 {
                        if !emerg_2s {
                            emerg_2s = true;
                            warn_500 = true;
                            crate::app_log::sync_emergency_line(
                                "ui_hb",
                                &format!("emergency gap>{age}ms (2s){tag_part} seq={}", LAST_SEQ.load(Ordering::Relaxed)),
                            );
                        }
                    } else if !warn_500 {
                        warn_500 = true;
                        crate::app_log::sync_emergency_line(
                            "ui_hb",
                            &format!("warning gap>{age}ms (500ms){tag_part} seq={}", LAST_SEQ.load(Ordering::Relaxed)),
                        );
                    }
                } else if let Some(since) = stall_since.take() {
                    let blocked_ms = since.elapsed().as_millis();
                    crate::app_log::sync_emergency_line(
                        "ui_hb",
                        &format!("recovered blocked_ms={blocked_ms}{tag_part} seq={}", LAST_SEQ.load(Ordering::Relaxed)),
                    );
                    warn_500 = false;
                    emerg_2s = false;
                    emerg_5s = false;
                }
            }
        });
}
