use tauri::Emitter;

use crate::config::is_allowed_trigger;
use crate::ipc::core::persist_and_rebind;
use crate::press_gesture::RecordedGesture;
use crate::AppState;

use crate::ipc::recording::apply::{
    apply_trigger_capture, enable_mapping_if_complete, normalize_record_key,
};
use crate::ipc::recording::gesture::{
    gesture_mode_label, is_spurious_trigger_capture, sanitize_trigger_capture,
};
use crate::ipc::recording::RecordMode;

use super::guard::clear_record_guard;

pub(crate) fn finish_hardware_capture(
    state: &AppState,
    window: &tauri::WebviewWindow,
    key: &str,
    device: Option<&str>,
    gesture: Option<RecordedGesture>,
) {
    state.record_gesture.lock().reset();
    let target = state.recording_target.lock().clone();
    let Some(target) = target else {
        return;
    };

    let key = if matches!(target.mode, RecordMode::Trigger) {
        sanitize_trigger_capture(key)
    } else {
        key.to_string()
    };

    if matches!(target.mode, RecordMode::Trigger) && is_spurious_trigger_capture(&key) {
        return;
    }

    let physical_key = key.clone();
    let captured = if matches!(target.mode, RecordMode::Trigger) {
        normalize_record_key(&key)
    } else {
        key.to_string()
    };

    if matches!(target.mode, RecordMode::Trigger) {
        if !is_allowed_trigger(&captured) {
            let ack = serde_json::json!({
                "type": "mvp_record_rejected",
                "reason": "trigger_not_allowed",
                "key": captured,
            });
            window.emit("to_js", &ack).ok();
            return;
        }
        {
            let mut cfg = state.cfg.lock();
            apply_trigger_capture(
                &mut cfg,
                &target.mapping_id,
                &captured,
                &physical_key,
                device.unwrap_or(""),
                gesture.unwrap_or(RecordedGesture::Tap),
            );
        }
    } else {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == target.mapping_id) {
            m.target_key = captured.clone();
            m.label = format!("{}  ?{}", m.trigger_key, captured);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &target.mapping_id);
    }

    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    clear_record_guard(state);
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    persist_and_rebind(state, window, "recorded");

    let mode = if matches!(target.mode, RecordMode::Target) {
        "target"
    } else {
        "trigger"
    };
    let (display_key, target_key, trigger_source, source_key, source_time, trigger_mode) = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(&target.mapping_id);
        if matches!(target.mode, RecordMode::Target) {
            (
                captured.clone(),
                mapping
                    .map(|m| m.target_key.clone())
                    .unwrap_or_else(|| captured.clone()),
                None,
                String::new(),
                String::new(),
                String::new(),
            )
        } else {
            let tm = mapping
                .map(|m| match m.trigger_mode {
                    crate::config::TriggerMode::Tap | crate::config::TriggerMode::Toggle => {
                        "tap".to_string()
                    }
                    crate::config::TriggerMode::Hold => "hold".to_string(),
                    crate::config::TriggerMode::LongPress => "longpress".to_string(),
                    crate::config::TriggerMode::Double => "double".to_string(),
                })
                .unwrap_or_else(|| {
                    gesture_mode_label(gesture.unwrap_or(RecordedGesture::Tap)).to_string()
                });
            (
                mapping
                    .map(|m| m.trigger_key.clone())
                    .unwrap_or_else(|| captured.clone()),
                mapping.map(|m| m.target_key.clone()).unwrap_or_default(),
                mapping.and_then(|m| m.trigger_source.clone()),
                mapping.map(|m| m.source_key.clone()).unwrap_or_default(),
                mapping.map(|m| m.source_time.clone()).unwrap_or_default(),
                tm,
            )
        }
    };
    let ack = serde_json::json!({
        "type": "mvp_key_captured",
        "key": display_key,
        "targetKey": target_key,
        "source": trigger_source,
        "sourceKey": source_key,
        "sourceTime": source_time,
        "triggerMode": trigger_mode,
        "mappingId": target.mapping_id,
        "mode": mode,
    });
    window.emit("to_js", &ack).ok();
}

pub fn finish_trigger_gesture_capture(
    state: &AppState,
    window: &tauri::WebviewWindow,
    key: &str,
    device: Option<&str>,
    gesture: RecordedGesture,
) {
    state.record_gesture.lock().reset();
    finish_hardware_capture(state, window, key, device, Some(gesture));
}
