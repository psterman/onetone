use std::time::Duration;

use tauri::Emitter;

use crate::config::{is_peripheral_trigger_key, is_volume_hotkey};
use crate::ipc::recording::gesture::{
    collect_pressed_side_modifiers, handle_record_gesture_event, is_modifier_token,
    is_mouse_button, is_spurious_target_capture, is_spurious_trigger_capture,
    uses_gesture_trigger_recording,
};
use crate::ipc::recording::RecordMode;
use crate::press_gesture::{parse_physical_event, RecordedGesture};
use crate::AppState;

use super::finish::finish_hardware_capture;
use super::guard::{arm_record_guard, emit_record_seen, record_guard_active};
use super::normalize::{
    build_hardware_record_chord, is_recordable_target_hotkey, normalize_hardware_key,
};

pub fn handle_hardware_record_key(state: &AppState, window: &tauri::WebviewWindow, key_name: &str) {
    if !*state.recording.lock() {
        return;
    }
    let target = state.recording_target.lock().clone();
    let Some(target) = target else {
        return;
    };
    let event = parse_physical_event(key_name);
    let is_trigger = matches!(target.mode, RecordMode::Trigger);
    let is_target = matches!(target.mode, RecordMode::Target);
    let is_keyup = event.is_keyup;
    let normalized = normalize_hardware_key(&event.key);
    let device = event.device.as_deref();

    if is_trigger && is_mouse_button(&normalized) {
        let ignore = state
            .record_started_at
            .lock()
            .as_ref()
            .map(|t| t.elapsed() < Duration::from_millis(900))
            .unwrap_or(true);
        if ignore {
            return;
        }
    }

    emit_record_seen(window, &normalized, device);

    if is_trigger && record_guard_active(state) {
        if is_modifier_token(&normalized) && !is_volume_hotkey(&normalized) {
            return;
        }
    }

    if is_target {
        if is_recordable_target_hotkey(&normalized) && !is_keyup {
            finish_hardware_capture(state, window, &normalized, None, None);
        }
        return;
    }

    if is_keyup {
        if is_modifier_token(&normalized) {
            let should_finish = state
                .record_hw_pending
                .lock()
                .as_deref()
                .map(|p| p == &normalized)
                .unwrap_or(false);
            if should_finish {
                let pending = state
                    .record_hw_pending
                    .lock()
                    .take()
                    .unwrap_or(normalized.clone());
                finish_hardware_capture(state, window, &pending, device, None);
            }
            return;
        }
        if is_trigger && uses_gesture_trigger_recording(state, &normalized) {
            handle_record_gesture_event(state, window, &normalized, device, true);
        }
        return;
    }

    if is_trigger
        && uses_gesture_trigger_recording(state, &normalized)
        && (is_peripheral_trigger_key(&normalized)
            || is_volume_hotkey(&normalized)
            || is_mouse_button(&normalized)
            || !is_spurious_trigger_capture(&normalized))
    {
        if handle_record_gesture_event(state, window, &normalized, device, false) {
            if is_peripheral_trigger_key(&normalized) || is_volume_hotkey(&normalized) {
                arm_record_guard(state);
            }
            return;
        }
    }

    if is_trigger && (is_peripheral_trigger_key(&normalized) || is_volume_hotkey(&normalized)) {
        *state.record_hw_pending.lock() = None;
        finish_hardware_capture(
            state,
            window,
            &normalized,
            device,
            Some(RecordedGesture::Tap),
        );
        arm_record_guard(state);
        return;
    }

    if is_trigger && !is_modifier_token(&normalized) && !is_spurious_trigger_capture(&normalized) {
        *state.record_hw_pending.lock() = None;
        finish_hardware_capture(
            state,
            window,
            &normalized,
            device,
            Some(RecordedGesture::Tap),
        );
        return;
    }

    if is_modifier_token(&normalized) {
        let pressed = collect_pressed_side_modifiers();
        if pressed.len() == 1 && pressed[0] == normalized {
            *state.record_hw_pending.lock() = Some(normalized.clone());
            let ack = serde_json::json!({
                "type": "mvp_record_pending",
                "displayKey": normalized,
            });
            window.emit("to_js", &ack).ok();
            return;
        }
    }

    *state.record_hw_pending.lock() = None;
    let combo = build_hardware_record_chord(&normalized);
    if combo.trim().is_empty() {
        return;
    }
    if is_trigger && is_spurious_trigger_capture(&combo) {
        return;
    }
    if is_target && is_spurious_target_capture(&combo) {
        return;
    }
    finish_hardware_capture(state, window, &combo, device, None);
}
