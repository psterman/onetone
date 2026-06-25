use std::sync::atomic::{AtomicBool, Ordering};

static SEND_GUARD: AtomicBool = AtomicBool::new(false);

pub fn is_active() -> bool {
    SEND_GUARD.load(Ordering::SeqCst)
}

pub fn run_guarded<F: FnOnce()>(guard_ms: u64, f: F) {
    SEND_GUARD.store(true, Ordering::SeqCst);
    f();
    std::thread::sleep(std::time::Duration::from_millis(guard_ms.max(50)));
    SEND_GUARD.store(false, Ordering::SeqCst);
}
