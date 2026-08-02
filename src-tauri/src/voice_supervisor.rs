//! Single-worker voice activate supervisor: capacity-1 latest-desired queue.
//! Replaces "spawn a thread per IPC" which stacked stop/start under ACTIVATE_LOCK.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;

use tauri::AppHandle;

use crate::AppState;

#[derive(Clone)]
struct DesiredJob {
    app: AppHandle,
    state: Arc<AppState>,
    reason: String,
    generation: u64,
}

struct Slot {
    latest: Option<DesiredJob>,
    running: bool,
}

static GEN: AtomicU64 = AtomicU64::new(1);
static STARTED: AtomicBool = AtomicBool::new(false);
static WAKE: OnceLock<(Mutex<Slot>, Condvar)> = OnceLock::new();

fn wake() -> &'static (Mutex<Slot>, Condvar) {
    WAKE.get_or_init(|| {
        (
            Mutex::new(Slot {
                latest: None,
                running: false,
            }),
            Condvar::new(),
        )
    })
}

fn ensure_started() {
    if STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let _ = thread::Builder::new()
        .name("voice-supervisor".into())
        .spawn(move || worker_loop());
}

fn worker_loop() {
    let (lock, cv) = wake();
    loop {
        let job = {
            let mut slot = lock.lock().unwrap_or_else(|e| e.into_inner());
            while slot.latest.is_none() {
                slot = cv.wait(slot).unwrap_or_else(|e| e.into_inner());
            }
            slot.running = true;
            slot.latest.take()
        };
        let Some(job) = job else {
            continue;
        };
        // Drop stale: if a newer generation was queued while we took this one,
        // activate_desired_engine still runs once then loop picks newest.
        crate::voice_bootstrap::activate_desired_engine(&job.app, &job.state, &job.reason);
        {
            let mut slot = lock.lock().unwrap_or_else(|e| e.into_inner());
            // If nothing newer arrived, clear running; else keep looping via latest.
            if slot.latest.is_none() {
                slot.running = false;
            }
            // If latest exists, loop continues without waiting.
            if slot.latest.is_some() {
                drop(slot);
                continue;
            }
        }
    }
}

/// Enqueue activate: capacity 1 — new request overwrites not-yet-started job.
pub fn enqueue_activate(app: AppHandle, state: Arc<AppState>, reason: impl Into<String>) -> u64 {
    ensure_started();
    let generation = GEN.fetch_add(1, Ordering::SeqCst);
    let job = DesiredJob {
        app,
        state,
        reason: reason.into(),
        generation,
    };
    let (lock, cv) = wake();
    {
        let mut slot = lock.lock().unwrap_or_else(|e| e.into_inner());
        slot.latest = Some(job);
        cv.notify_one();
    }
    generation
}

pub fn activate_busy() -> bool {
    let (lock, _) = wake();
    match lock.lock() {
        Ok(slot) => slot.running || slot.latest.is_some(),
        Err(poisoned) => {
            let slot = poisoned.into_inner();
            slot.running || slot.latest.is_some()
        }
    }
}

pub fn current_generation() -> u64 {
    GEN.load(Ordering::SeqCst)
}
