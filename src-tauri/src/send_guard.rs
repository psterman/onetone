use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static SEND_GUARD: AtomicBool = AtomicBool::new(false);
static SEND_GUARD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_active() -> bool {
    if !SEND_GUARD.load(Ordering::SeqCst) {
        return false;
    }
    let until = SEND_GUARD_UNTIL_MS.load(Ordering::SeqCst);
    if until != 0 && now_ms() > until {
        SEND_GUARD.store(false, Ordering::SeqCst);
        SEND_GUARD_UNTIL_MS.store(0, Ordering::SeqCst);
        return false;
    }
    true
}

pub fn wait_until_inactive(timeout_ms: u64) -> bool {
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    while is_active() {
        if started.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    true
}

pub fn run_guarded<F: FnOnce()>(guard_ms: u64, f: F) {
    let _ = guard_ms;
    SEND_GUARD.store(true, Ordering::SeqCst);
    f();
    SEND_GUARD.store(false, Ordering::SeqCst);
    SEND_GUARD_UNTIL_MS.store(0, Ordering::SeqCst);
}
