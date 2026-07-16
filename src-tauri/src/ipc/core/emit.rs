use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::app_log;
use crate::AppState;

const EMIT_SKIP_LOG_INTERVAL_MS: u64 = 5000;

static EMIT_SKIP_LAST_LOG_MS: AtomicU64 = AtomicU64::new(0);

/// Emit to the webview on the main thread (safe from hotkey/voice/watcher threads).
/// Prefer [`emit_app_event`] from capture/audio threads that may be joined by IPC.
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

/// Non-blocking app-wide emit. Safe from audio capture threads that IPC may `join`.
/// Do **not** use `run_on_main_thread` here — that deadlocks when JS is blocked on
/// an invoke whose handler joins the emitting thread.
pub fn emit_app_event<S: serde::Serialize + Send + Sync>(
    app: &AppHandle,
    event: &str,
    payload: &S,
) -> bool {
    match app.emit(event, payload) {
        Ok(()) => true,
        Err(e) => {
            log_emit_skip_throttled(None, &format!("emit_app_event {event} failed: {e}"));
            false
        }
    }
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
    // Non-blocking: never run_on_main_thread here. Config watcher / voice activate often
    // emit while JS is awaiting invoke; waiting for the UI thread deadlocks the window
    // (Responding=false / 假死), especially on 省电 strategy switches that stop Vosk.
    match window.emit("to_js", &payload) {
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
