//! Single-writer background queue for Cursor discover (must not block homepage).

use crate::agent_memory::cursor_adapter::discover_cursor_sessions;
use crate::agent_memory::store::with_write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;

enum Job {
    Discover { project_hint: Option<PathBuf> },
}

static TX: OnceLock<Mutex<Sender<Job>>> = OnceLock::new();
static REFRESHING: AtomicBool = AtomicBool::new(false);

pub fn ensure_started() {
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        // Ensure DB exists before workers run.
        let _ = with_write(|_| Ok(()));
        thread::Builder::new()
            .name("onetone-agent-memory".into())
            .spawn(move || {
                while let Ok(job) = rx.recv() {
                    match job {
                        Job::Discover { project_hint } => {
                            let hint = project_hint.as_deref();
                            let _ = discover_cursor_sessions(hint);
                            REFRESHING.store(false, Ordering::SeqCst);
                        }
                    }
                }
            })
            .expect("spawn agent_memory worker");
        Mutex::new(tx)
    });
}

pub fn enqueue_cursor_discover(project_hint: Option<PathBuf>) {
    ensure_started();
    if let Some(tx) = TX.get() {
        if let Ok(guard) = tx.lock() {
            let _ = guard.send(Job::Discover { project_hint });
        }
    }
}

/// Async home-focus retry: mark loading, enqueue discover, return immediately.
pub fn enqueue_home_focus_refresh() {
    ensure_started();
    REFRESHING.store(true, Ordering::SeqCst);
    enqueue_cursor_discover(None);
}

pub fn is_refreshing() -> bool {
    REFRESHING.load(Ordering::SeqCst)
}
