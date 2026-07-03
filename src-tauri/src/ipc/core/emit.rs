use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::app_log;
use crate::AppState;

const EMIT_SKIP_LOG_INTERVAL_MS: u64 = 5000;

static EMIT_SKIP_LAST_LOG_MS: AtomicU64 = AtomicU64::new(0);

/// Emit to the webview on the main thread (safe from hotkey/voice/watcher threads).
pub fn emit_to_js_main(window: &WebviewWindow, payload: serde_json::Value) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}

pub fn emit_to_js_main_t<T: serde::Serialize + Send + 'static>(window: &WebviewWindow, payload: T) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}

pub fn get_main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn emit_to_main_if_available(
    app: &AppHandle,
    state: Option<&AppState>,
    payload: serde_json::Value,
) -> bool {
    let Some(window) = get_main_window(app) else {
        log_emit_skip_throttled(state, "emit skipped because main unavailable");
        return false;
    };
    let win = window.clone();
    let emit_result = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
    match emit_result {
        Ok(()) => true,
        Err(e) => {
            log_emit_skip_throttled(state, &format!("emit failed: {e}"));
            false
        }
    }
}

fn log_emit_skip_throttled(state: Option<&AppState>, message: &str) {
    let now = crate::runtime_event::now_ms();
    let last = EMIT_SKIP_LAST_LOG_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < EMIT_SKIP_LOG_INTERVAL_MS {
        return;
    }
    if EMIT_SKIP_LAST_LOG_MS
        .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_err()
    {
        return;
    }
    if let Some(state) = state {
        app_log::log_line(state, "emit", message);
    } else {
        app_log::early_line("emit", message);
    }
}
