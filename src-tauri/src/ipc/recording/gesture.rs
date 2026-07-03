use std::time::Instant;

use tauri::Emitter;

use crate::config::{is_peripheral_trigger_key, is_volume_hotkey};
use crate::press_gesture::{RecordGestureHint, RecordedGesture};
use crate::AppState;

use super::{finish_trigger_gesture_capture, normalize_hardware_key};

pub(super) fn gesture_mode_label(gesture: RecordedGesture) -> &'static str {
    match gesture {
        RecordedGesture::Tap => "tap",
        RecordedGesture::LongPress => "longpress",
        RecordedGesture::Double => "double",
    }
}

fn emit_record_gesture_hint(window: &tauri::WebviewWindow, hint: &RecordGestureHint) {
    let (phase, key) = match hint {
        RecordGestureHint::Holding { key } => ("holding", key.as_str()),
        RecordGestureHint::WaitingDouble { key } => ("waiting_double", key.as_str()),
    };
    let payload = serde_json::json!({
        "type": "mvp_record_gesture",
        "phase": phase,
        "key": key,
    });
    window.emit("to_js", &payload).ok();
}

pub(super) fn handle_record_gesture_event(
    state: &AppState,
    window: &tauri::WebviewWindow,
    key: &str,
    device: Option<&str>,
    is_keyup: bool,
) -> bool {
    let now = Instant::now();
    let mut detector = state.record_gesture.lock();
    let result = if is_keyup {
        detector.on_keyup(key, device, now)
    } else {
        detector.on_keydown(key, device, now)
    };
    drop(detector);

    match result {
        Ok(Some(done)) => {
            finish_trigger_gesture_capture(
                state,
                window,
                &done.key,
                done.device.as_deref(),
                done.gesture,
            );
            true
        }
        Ok(None) => false,
        Err(hint) => {
            emit_record_gesture_hint(window, &hint);
            true
        }
    }
}

pub(super) fn is_modifier_token(key: &str) -> bool {
    matches!(
        key,
        "LCtrl" | "RCtrl" | "LShift" | "RShift" | "LAlt" | "RAlt" | "LWin" | "RWin"
    )
}

pub(super) fn collect_pressed_side_modifiers() -> Vec<String> {
    use winapi::um::winuser::GetAsyncKeyState;

    let mut out = Vec::new();
    let pairs: &[(i32, &str)] = &[
        (0xA2, "LCtrl"),
        (0xA3, "RCtrl"),
        (0xA0, "LShift"),
        (0xA1, "RShift"),
        (0xA4, "LAlt"),
        (0xA5, "RAlt"),
        (0x5B, "LWin"),
        (0x5C, "RWin"),
    ];
    for (vk, name) in pairs {
        if unsafe { GetAsyncKeyState(*vk) } as u16 & 0x8000 != 0 {
            out.push((*name).to_string());
        }
    }
    out
}

pub(super) fn is_spurious_trigger_capture(key: &str) -> bool {
    use std::collections::HashSet;

    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return true;
    }

    let mut seen = HashSet::new();
    for part in &parts {
        if !seen.insert(part.clone()) {
            return true;
        }
    }

    if parts.len() == 1 && (parts[0] == "RAlt" || parts[0] == "AltRight") {
        return false;
    }

    parts.iter().all(|part| is_modifier_token(part))
}

pub(super) fn sanitize_trigger_capture(key: &str) -> String {
    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    let meaningful: Vec<String> = parts
        .iter()
        .filter(|part| is_peripheral_trigger_key(part) || is_volume_hotkey(part))
        .cloned()
        .collect();
    if let Some(last) = meaningful.last() {
        return last.clone();
    }

    let non_mod: Vec<String> = parts
        .iter()
        .filter(|part| !is_modifier_token(part))
        .cloned()
        .collect();
    if !non_mod.is_empty() {
        return non_mod.join("+");
    }

    parts.join("+")
}

pub(super) fn is_spurious_target_capture(key: &str) -> bool {
    use std::collections::HashSet;

    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return true;
    }

    let mut seen = HashSet::new();
    for part in &parts {
        if !seen.insert(part.clone()) {
            return true;
        }
    }

    parts.len() > 1 && parts.iter().all(|part| is_modifier_token(part))
}

pub(super) fn is_mouse_button(key: &str) -> bool {
    matches!(
        key,
        "LButton" | "RButton" | "MButton" | "XButton1" | "XButton2"
    )
}

pub(super) fn uses_gesture_trigger_recording(state: &AppState, key: &str) -> bool {
    state.record_hw_pending.lock().is_none() && !is_modifier_token(key)
}
