use std::time::Duration;

use tauri::Emitter;

use crate::config::{is_peripheral_trigger_key, is_volume_hotkey};
use crate::gesture_timing::RECORD_MOUSE_SUPPRESS_MS;
use crate::ipc::recording::gesture::{
    collect_pressed_side_modifiers, handle_record_gesture_event, is_ghost_media_keyboard_combo,
    is_modifier_token, is_record_start_suppressed_mouse, is_spurious_target_capture,
    is_spurious_trigger_capture, uses_gesture_trigger_recording,
};
use crate::ipc::recording::RecordMode;
use crate::press_gesture::{parse_physical_event, RecordedGesture};
use crate::AppState;

use super::finish::finish_hardware_capture;
use super::guard::{emit_record_probe, emit_record_seen, record_guard_active};
use super::normalize::{
    build_hardware_record_chord, is_recordable_target_hotkey, normalize_hardware_key,
};

fn record_report_hex(key: &str, device: Option<&str>) -> Option<String> {
    let pending = crate::hotkey_win::take_pending_input_debug()?;
    if pending.key != key {
        return None;
    }
    if device.unwrap_or("") != pending.device.as_str() {
        return None;
    }
    if pending.report_hex.is_empty() {
        return None;
    }
    Some(pending.report_hex)
}

pub fn handle_hardware_record_key(state: &AppState, window: &tauri::WebviewWindow, key_name: &str) {
    if !*state.recording.lock() {
        emit_record_probe(window, "drop", key_name, "not_recording");
        return;
    }
    let target = state.recording_target.lock().clone();
    let Some(target) = target else {
        emit_record_probe(window, "drop", key_name, "no_target");
        return;
    };
    let event = parse_physical_event(key_name);
    let is_trigger = matches!(target.mode, RecordMode::Trigger | RecordMode::AgentBinding);
    let is_pad_bind = matches!(target.mode, RecordMode::PadBind);
    let is_target = matches!(target.mode, RecordMode::Target);
    let is_keyup = event.is_keyup;
    let normalized = normalize_hardware_key(&event.key);
    let device = event.device.as_deref();
    if (is_trigger || is_pad_bind) && normalized.starts_with("HID_") {
        let hex = record_report_hex(&normalized, device).unwrap_or_default();
        let note = [device.unwrap_or(""), hex.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        emit_record_probe(
            window,
            "unknown",
            &normalized,
            if note.is_empty() { "unknown_hid" } else { &note },
        );
        return;
    }
    emit_record_probe(
        window,
        "recv",
        &normalized,
        if is_keyup { "keyup" } else { "keydown" },
    );

    if is_trigger && is_record_start_suppressed_mouse(&normalized) {
        let ignore = state
            .record_started_at
            .lock()
            .as_ref()
            .map(|t| t.elapsed() < Duration::from_millis(RECORD_MOUSE_SUPPRESS_MS))
            .unwrap_or(true);
        if ignore {
            emit_record_probe(window, "drop", &normalized, "record_start_mouse_suppress");
            return;
        }
    }

    emit_record_seen(
        window,
        &normalized,
        device,
        record_report_hex(&normalized, device).as_deref(),
    );

    if is_trigger && record_guard_active(state) {
        if !(is_volume_hotkey(&normalized) || is_peripheral_trigger_key(&normalized)) {
            emit_record_probe(window, "drop", &normalized, "record_guard");
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
            if is_ghost_media_keyboard_combo(&build_hardware_record_chord(&normalized)) {
                state.record_gesture.lock().reset();
                return;
            }
            handle_record_gesture_event(state, window, &normalized, device, true);
        }
        return;
    }

    // Pulse peripherals (volume, side buttons) finish on keydown — they often lack keyup.
    if (is_trigger || is_pad_bind)
        && (is_peripheral_trigger_key(&normalized) || is_volume_hotkey(&normalized))
    {
        *state.record_hw_pending.lock() = None;
        emit_record_probe(window, "finish", &normalized, "pulse_peripheral");
        finish_hardware_capture(
            state,
            window,
            &normalized,
            device,
            Some(RecordedGesture::Tap),
        );
        return;
    }

    // Dongle ghost Ctrl+Shift+Space must not TAP-finish before Volume_* arrives.
    if is_trigger && is_ghost_media_keyboard_combo(&build_hardware_record_chord(&normalized)) {
        emit_record_probe(window, "drop", &normalized, "ghost_media_combo");
        state.record_gesture.lock().reset();
        return;
    }

    if is_trigger
        && uses_gesture_trigger_recording(state, &normalized)
        && !is_spurious_trigger_capture(&normalized)
    {
        if handle_record_gesture_event(state, window, &normalized, device, false) {
            return;
        }
    }

    if (is_trigger || is_pad_bind)
        && !is_modifier_token(&normalized)
        && !is_spurious_trigger_capture(&normalized)
    {
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
        emit_record_probe(window, "drop", &combo, "spurious_combo");
        return;
    }
    if is_trigger && is_ghost_media_keyboard_combo(&combo) {
        emit_record_probe(window, "drop", &combo, "ghost_combo");
        return;
    }
    if is_target && is_spurious_target_capture(&combo) {
        return;
    }
    finish_hardware_capture(state, window, &combo, device, None);
}
