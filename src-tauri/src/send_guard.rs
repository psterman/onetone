use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static SEND_GUARD: AtomicBool = AtomicBool::new(false);
static SEND_GUARD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static GUARDED_KEYS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
static BLOCKED_COUNT: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn blocked_count() -> u64 {
    BLOCKED_COUNT.load(Ordering::Relaxed)
}

pub fn note_blocked() {
    BLOCKED_COUNT.fetch_add(1, Ordering::Relaxed);
}

pub fn arm_keys(keys: &[String]) {
    let mut set = GUARDED_KEYS.lock().unwrap_or_else(|e| e.into_inner());
    set.clear();
    for key in keys {
        for alias in expand_guard_aliases(key) {
            set.insert(alias);
        }
    }
}

pub fn guard_keys_from_combo(combo: &str) -> Vec<String> {
    combo
        .split('+')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .flat_map(|part| expand_guard_aliases(part))
        .collect()
}

fn expand_guard_aliases(key: &str) -> Vec<String> {
    let mut out = HashSet::new();
    out.insert(key.to_string());
    match key.to_ascii_uppercase().as_str() {
        "CTRL" | "CONTROL" => {
            out.extend(
                ["Ctrl", "Control", "LCtrl", "RCtrl", "LControl", "RControl"]
                    .map(String::from),
            );
        }
        "ALT" => {
            out.extend(["Alt", "LAlt", "RAlt"].map(String::from));
        }
        "SHIFT" => {
            out.extend(["Shift", "LShift", "RShift"].map(String::from));
        }
        "WIN" => {
            out.extend(["Win", "LWin", "RWin"].map(String::from));
        }
        "RALT" => {
            out.extend(["RAlt", "Alt"].map(String::from));
        }
        "LALT" => {
            out.extend(["LAlt", "Alt"].map(String::from));
        }
        _ => {}
    }
    out.into_iter().collect()
}

fn clear_armed_keys() {
    if let Ok(mut set) = GUARDED_KEYS.lock() {
        set.clear();
    }
}

fn keys_match(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

pub fn blocks_key(key: &str) -> bool {
    if !is_active() {
        return false;
    }
    let key = key.trim();
    let guarded = GUARDED_KEYS.lock().unwrap_or_else(|e| e.into_inner());
    if guarded.is_empty() {
        return true;
    }
    guarded.iter().any(|g| keys_match(g, key))
}

pub fn is_active() -> bool {
    if !SEND_GUARD.load(Ordering::SeqCst) {
        return false;
    }
    let until = SEND_GUARD_UNTIL_MS.load(Ordering::SeqCst);
    if until != 0 && now_ms() > until {
        release_guard();
        return false;
    }
    true
}

fn release_guard() {
    SEND_GUARD.store(false, Ordering::SeqCst);
    SEND_GUARD_UNTIL_MS.store(0, Ordering::SeqCst);
    clear_armed_keys();
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

/// Run `f` while the send guard is active until `guard_ms` elapses (auto-release).
pub fn run_guarded<F: FnOnce()>(guard_ms: u64, f: F) {
    if guard_ms == 0 {
        f();
        return;
    }
    let until = now_ms().saturating_add(guard_ms);
    SEND_GUARD_UNTIL_MS.store(until, Ordering::SeqCst);
    SEND_GUARD.store(true, Ordering::SeqCst);
    f();
    // Keep guard active until `until`; `is_active()` releases on timeout.
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration as StdDuration;

    fn reset() {
        release_guard();
        BLOCKED_COUNT.store(0, Ordering::Relaxed);
    }

    #[test]
    fn guard_expires_after_timeout() {
        reset();
        arm_keys(&["RAlt".into()]);
        run_guarded(40, || {});
        assert!(is_active());
        thread::sleep(StdDuration::from_millis(55));
        assert!(!is_active());
        reset();
    }

    #[test]
    fn blocks_only_armed_keys() {
        reset();
        arm_keys(&["RAlt".into(), "Alt".into()]);
        SEND_GUARD_UNTIL_MS.store(now_ms().saturating_add(500), Ordering::SeqCst);
        SEND_GUARD.store(true, Ordering::SeqCst);
        assert!(blocks_key("RAlt"));
        assert!(blocks_key("alt"));
        assert!(!blocks_key("F13"));
        reset();
    }

    #[test]
    fn guard_keys_from_combo_expands_modifiers() {
        let keys = guard_keys_from_combo("Ctrl+L");
        assert!(keys.iter().any(|k| k.eq_ignore_ascii_case("Ctrl")));
        assert!(keys.iter().any(|k| k.eq_ignore_ascii_case("L")));
    }
}
