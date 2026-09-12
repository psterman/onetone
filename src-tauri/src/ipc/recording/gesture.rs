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
    // Late FE IPC keydown (or bounce) after real keyup must not count as ×2.
    if !is_keyup {
        let waiting = state
            .record_gesture
            .lock()
            .is_waiting_double_for(key, device);
        if waiting && !is_key_physically_down(key) {
            emit_record_gesture_hint(
                window,
                &RecordGestureHint::WaitingDouble {
                    key: key.to_string(),
                },
            );
            return true;
        }
    }
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

fn modifier_vk(key: &str) -> Option<i32> {
    match key {
        "LCtrl" => Some(0xA2),
        "RCtrl" => Some(0xA3),
        "LShift" => Some(0xA0),
        "RShift" => Some(0xA1),
        "LAlt" => Some(0xA4),
        "RAlt" => Some(0xA5),
        "LWin" => Some(0x5B),
        "RWin" => Some(0x5C),
        _ => None,
    }
}

/// True when the OS still reports the key down. Used to reject stale
/// keydown echoes that arrive after the user already released.
pub(super) fn is_key_physically_down(key: &str) -> bool {
    use winapi::um::winuser::GetAsyncKeyState;

    let vk = if let Some(v) = modifier_vk(key) {
        v
    } else if key.len() == 1 {
        let c = key.chars().next().unwrap().to_ascii_uppercase();
        if c.is_ascii_alphanumeric() {
            c as i32
        } else {
            return true;
        }
    } else {
        // Unknown token — do not block a real double.
        return true;
    };
    unsafe { GetAsyncKeyState(vk) as u16 & 0x8000 != 0 }
}

pub(super) fn collect_pressed_side_modifiers() -> Vec<String> {
    let mut out = Vec::new();
    for name in [
        "LCtrl", "RCtrl", "LShift", "RShift", "LAlt", "RAlt", "LWin", "RWin",
    ] {
        if is_key_physically_down(name) {
            out.push(name.to_string());
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

fn is_ghost_media_modifier(part: &str) -> bool {
    is_modifier_token(part)
        || matches!(
            part,
            "Ctrl" | "Control" | "Shift" | "Alt" | "Win" | "Meta"
        )
}

pub(super) fn recognition_key_echo(target_key: &str, key: &str) -> bool {
    let tgt = crate::config::canonical_trigger(target_key.trim());
    let k = crate::config::canonical_trigger(key);
    !tgt.is_empty() && k == tgt
}

pub(super) fn is_recognition_key_echo(state: &AppState, mapping_id: &str, key: &str) -> bool {
    let cfg = state.cfg.lock();
    let Some(m) = cfg.find_mapping_by_id(mapping_id) else {
        return false;
    };
    recognition_key_echo(&m.target_key, key)
}

/// Some media dongles emit modifier+Space ghosts alongside consumer volume usages.
pub(super) fn is_ghost_media_keyboard_combo(key: &str) -> bool {
    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() < 3 {
        return false;
    }
    let non_mod: Vec<String> = parts
        .iter()
        .filter(|part| !is_ghost_media_modifier(part))
        .cloned()
        .collect();
    non_mod.len() == 1 && non_mod[0] == "Space"
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

/// Clicks that start recording (UI button) — suppress to avoid capturing the click itself.
pub(super) fn is_record_start_suppressed_mouse(key: &str) -> bool {
    matches!(key, "LButton" | "RButton" | "MButton")
}

pub(super) fn uses_gesture_trigger_recording(state: &AppState, key: &str) -> bool {
    // Pulse peripherals lack reliable keyup — keep Tap-on-down path.
    // Modifiers stay on the pending path so Ctrl+Key combos still work; lone
    // modifier double/tap is finished via begin_waiting_double after keyup.
    if is_peripheral_trigger_key(key) || is_volume_hotkey(key) || is_modifier_token(key) {
        return false;
    }
    state.record_hw_pending.lock().is_none()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn side_buttons_not_record_start_suppressed() {
        assert!(!is_record_start_suppressed_mouse("XButton1"));
        assert!(!is_record_start_suppressed_mouse("XButton2"));
        assert!(is_record_start_suppressed_mouse("LButton"));
    }

    #[test]
    fn ghost_media_combo_is_modifiers_plus_space() {
        assert!(is_ghost_media_keyboard_combo("LCtrl+LShift+Space"));
        assert!(is_ghost_media_keyboard_combo("Ctrl+Shift+Space"));
        assert!(is_ghost_media_keyboard_combo("Control+Shift+Space"));
        assert!(!is_ghost_media_keyboard_combo("LCtrl+Space"));
        assert!(!is_ghost_media_keyboard_combo("Space"));
    }

    #[test]
    fn duplicate_ctrl_aliases_are_spurious_trigger() {
        assert!(is_spurious_trigger_capture("Ctrl+LCtrl"));
        assert!(is_spurious_trigger_capture("Ctrl+Control"));
        assert!(is_spurious_trigger_capture("LCtrl+Ctrl"));
        assert!(!is_spurious_trigger_capture("RAlt"));
        assert!(!is_spurious_trigger_capture("Volume_Down"));
    }

    #[test]
    fn recognition_key_echo_detects_target_match() {
        assert!(recognition_key_echo("RAlt", "RAlt"));
        assert!(recognition_key_echo("RAlt", "AltRight"));
        assert!(!recognition_key_echo("RAlt", "Volume_Up"));
        assert!(!recognition_key_echo("", "RAlt"));
    }
}
