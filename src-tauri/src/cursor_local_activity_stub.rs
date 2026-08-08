//! Non-Windows stub — Cursor Activity Provider is Windows-first (local AppData vscdb).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

pub const SRC_CURSOR_LOCAL: &str = "cursor_local_activity";
pub const CURSOR_USAGE_CONSOLE: &str = "https://cursor.com/settings";

fn consent_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

pub fn set_consent_enabled(enabled: bool) {
    consent_flag().store(enabled, Ordering::SeqCst);
}

pub fn consent_enabled() -> bool {
    consent_flag().load(Ordering::SeqCst)
}

pub fn refresh_once() {}

pub fn start_cursor_activity_poll(
    _app: tauri::AppHandle,
    _state: std::sync::Arc<crate::AppState>,
) {
}
