use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::press_gesture::short_device_label;
use crate::AppState;

pub(crate) fn record_guard_active(state: &AppState) -> bool {
    state
        .record_guard_until
        .lock()
        .as_ref()
        .map(|t| t.elapsed() < Duration::from_millis(450))
        .unwrap_or(false)
}

pub(crate) fn arm_record_guard(state: &AppState) {
    *state.record_guard_until.lock() = Some(Instant::now());
}

pub(crate) fn clear_record_guard(state: &AppState) {
    *state.record_guard_until.lock() = None;
}

pub(crate) fn emit_record_seen(window: &tauri::WebviewWindow, key: &str, device: Option<&str>) {
    let payload = serde_json::json!({
        "type": "mvp_record_seen",
        "key": key,
        "device": device.unwrap_or(""),
        "deviceLabel": device.map(short_device_label).unwrap_or_default(),
    });
    window.emit("to_js", &payload).ok();
}
