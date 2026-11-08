//! Debounced Home Focus status push — pad_status / attention / discover → `to_js`.
//!
//! FE pulls snapshots on `home_status_changed`; slow poll remains a safety net only.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use tauri::AppHandle;

const DEBOUNCE_MS: u64 = 80;

static APP: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();
static PENDING_REASON: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static ARMED: AtomicBool = AtomicBool::new(false);

fn app_slot() -> &'static Mutex<Option<AppHandle>> {
    APP.get_or_init(|| Mutex::new(None))
}

fn pending_slot() -> &'static Mutex<Option<String>> {
    PENDING_REASON.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    crate::runtime_event::now_ms()
}

/// Call once from app setup so notify sites without an AppHandle can emit.
pub fn bind_app(app: AppHandle) {
    if let Ok(mut g) = app_slot().lock() {
        *g = Some(app);
    }
}

/// Coalesce bursts (hooks / mtime) into one `to_js` push ~80ms later.
pub fn schedule(reason: &str) {
    let reason = reason.trim();
    let reason = if reason.is_empty() {
        "changed"
    } else {
        reason
    };
    if let Ok(mut g) = pending_slot().lock() {
        *g = Some(reason.to_string());
    }
    if ARMED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app_slot()
        .lock()
        .ok()
        .and_then(|g| g.as_ref().cloned());
    let Some(app) = app else {
        ARMED.store(false, Ordering::SeqCst);
        return;
    };
    let _ = thread::Builder::new()
        .name("home-status-notify".into())
        .spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(DEBOUNCE_MS));
                let reason = pending_slot()
                    .lock()
                    .ok()
                    .and_then(|mut g| g.take())
                    .unwrap_or_else(|| "changed".into());
                ARMED.store(false, Ordering::SeqCst);
                let payload = serde_json::json!({
                    "type": "home_status_changed",
                    "reason": reason,
                    "at": now_ms(),
                });
                crate::ipc::emit_to_main_if_available(&app, None, payload);
                // Late arrivals during emit — re-arm once.
                let has_more = pending_slot()
                    .lock()
                    .ok()
                    .map(|g| g.is_some())
                    .unwrap_or(false);
                if has_more && !ARMED.swap(true, Ordering::SeqCst) {
                    continue;
                }
                break;
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn schedule_without_app_is_noop() {
        // Must not panic when bind_app was never called.
        super::schedule("test");
        // Clear armed if schedule short-circuited with no app.
        super::ARMED.store(false, std::sync::atomic::Ordering::SeqCst);
        if let Ok(mut g) = super::pending_slot().lock() {
            *g = None;
        }
    }
}
