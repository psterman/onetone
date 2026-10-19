use tauri::Emitter;
use tauri::Manager;

use crate::config::{is_allowed_target_shortcut, is_allowed_trigger};
use crate::ipc::core::persist_and_rebind;
use crate::press_gesture::RecordedGesture;
use crate::AppState;

use crate::ipc::recording::apply::{
    apply_trigger_capture, enable_mapping_if_complete, normalize_record_key,
};
use crate::ipc::recording::gesture::{
    gesture_mode_label, is_recognition_key_echo, is_spurious_trigger_capture,
    sanitize_trigger_capture,
};
use crate::ipc::recording::RecordMode;

use super::guard::{arm_record_guard, clear_record_guard, emit_record_probe};

/// Guarantees that a rejected/aborted capture cannot leave the native hook in
/// recording mode.  Most capture paths clear this state after committing, but
/// validation failures return early and used to leave side-button events
/// swallowed indefinitely.
struct RecordingExitGuard<'a> {
    state: &'a AppState,
}

impl Drop for RecordingExitGuard<'_> {
    fn drop(&mut self) {
        *self.state.recording.lock() = false;
        *self.state.recording_target.lock() = None;
        *self.state.record_hw_pending.lock() = None;
        *self.state.record_started_at.lock() = None;
        clear_record_guard(self.state);
        if let Some(ref mgr) = *self.state.hotkey_mgr.lock() {
            mgr.stop_recording();
        }
        crate::hotkey_win::abort_recording_session();
    }
}

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
    // ponytail: ExitGuard used to wrap the whole function — early reject/echo
    // paths aborted RECORDING_SESSION while the FE modal stayed open, so the
    // next Logitech side-button FE backup hit silent not_recording. Only arm
    // the guard once validation passed and we are about to commit.

    let is_trigger = matches!(target.mode, RecordMode::Trigger);
    let is_oral_trigger = matches!(target.mode, RecordMode::OralTrigger);
    let is_target = matches!(target.mode, RecordMode::Target);
    let is_agent_binding = matches!(target.mode, RecordMode::AgentBinding);
    let is_pad_bind = matches!(target.mode, RecordMode::PadBind);

    let key = if is_trigger || is_oral_trigger || is_agent_binding || is_pad_bind {
        sanitize_trigger_capture(key)
    } else {
        key.to_string()
    };

    if (is_trigger || is_oral_trigger || is_agent_binding) && is_spurious_trigger_capture(&key) {
        emit_record_probe(window, "drop", &key, "spurious_trigger_capture");
        let ack = serde_json::json!({
            "type": "mvp_record_rejected",
            "reason": "spurious_trigger_capture",
            "key": key,
            "mappingId": target.mapping_id,
            "mode": if is_agent_binding { "agentBinding" } else if is_oral_trigger { "oralTrigger" } else { "trigger" },
        });
        window.emit("to_js", &ack).ok();
        return;
    }

    if (is_trigger || is_oral_trigger) && is_recognition_key_echo(state, &target.mapping_id, &key) {
        emit_record_probe(window, "drop", &key, "recognition_key_echo");
        let ack = serde_json::json!({
            "type": "mvp_record_echo",
            "key": key,
            "mappingId": target.mapping_id,
            "mode": if is_oral_trigger { "oralTrigger" } else { "trigger" },
        });
        window.emit("to_js", &ack).ok();
        return;
    }

    // Dictation 01 only — oral arm may steal Soft Pad source_key (cleared in apply).
    if is_trigger
        && crate::config::physical_key_owned_by_pads(&state.cfg.lock(), &key, &target.mapping_id)
    {
        emit_record_probe(window, "drop", &key, "softpad_occupied");
        let ack = serde_json::json!({
            "type": "mvp_record_echo",
            "key": key,
            "mappingId": target.mapping_id,
            "mode": "trigger",
            "reason": "softpad_occupied",
        });
        window.emit("to_js", &ack).ok();
        return;
    }

    if is_pad_bind && !crate::config::is_folk_pad_bind_key(&key) {
        emit_record_probe(window, "drop", &key, "pad_unfriendly_key");
        let ack = serde_json::json!({
            "type": "mvp_record_rejected",
            "reason": "pad_unfriendly_key",
            "key": key,
            "mappingId": target.mapping_id,
            "mode": "padBind",
        });
        window.emit("to_js", &ack).ok();
        return;
    }

    if is_pad_bind
        && crate::config::physical_key_owned_by_triggers(
            &state.cfg.lock(),
            &key,
            &target.mapping_id,
        )
    {
        emit_record_probe(window, "drop", &key, "trigger_occupied");
        let ack = serde_json::json!({
            "type": "mvp_record_rejected",
            "reason": "trigger_occupied",
            "key": key,
            "mappingId": target.mapping_id,
            "mode": "padBind",
        });
        window.emit("to_js", &ack).ok();
        return;
    }

    let physical_key = key.clone();
    let captured = if is_trigger || is_oral_trigger || is_agent_binding {
        normalize_record_key(&key)
    } else {
        key.to_string()
    };

    if is_trigger || is_oral_trigger || is_agent_binding {
        if !is_allowed_trigger(&captured) {
            let ack = serde_json::json!({
                "type": "mvp_record_rejected",
                "reason": "left_mouse_not_allowed",
                "key": captured,
            });
            window.emit("to_js", &ack).ok();
            return;
        }
    }

    // First commit wins; a concurrent frontend finish clears recording first.
    if !*state.recording.lock() {
        emit_record_probe(window, "drop", &key, "already_idle");
        return;
    }
    // Validation passed — now own teardown (reject paths above must keep session).
    let _recording_exit_guard = RecordingExitGuard { state };
    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    // Keep the native recording owner through persistence/rebind. This closes the
    // window where the same side-button release or the next twin event can enter
    // Soft Pad before the new binding is installed.
    clear_record_guard(state);

    if is_pad_bind {
        if let Some(ref mgr) = *state.hotkey_mgr.lock() {
            mgr.stop_recording();
        }
        let ack = serde_json::json!({
            "type": "mvp_pad_bind_captured",
            "key": physical_key,
            "mappingId": target.mapping_id,
            "mode": "padBind",
        });
        window.emit("to_js", &ack).ok();
        emit_record_probe(window, "commit", &physical_key, "padBind");
        crate::tray::refresh_tray_visual_forced(window.app_handle());
        crate::hotkey_win::disarm_recording_session();
        return;
    }

    if is_oral_trigger {
        {
            let mut cfg = state.cfg.lock();
            crate::ipc::recording::apply::apply_oral_trigger_capture(
                &mut cfg,
                &target.mapping_id,
                &captured,
                &physical_key,
            );
        }
        if let Some(ref mgr) = *state.hotkey_mgr.lock() {
            mgr.stop_recording();
            let cfg = state.cfg.lock();
            mgr.bind_all(&cfg.bindings());
            mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
        }
        persist_and_rebind(state, window, "oral_trigger_recorded");
        let oral_key = {
            let cfg = state.cfg.lock();
            cfg.find_mapping_by_id(&target.mapping_id)
                .map(|m| m.oral_trigger_key().to_string())
                .unwrap_or_else(|| captured.clone())
        };
        let ack = serde_json::json!({
            "type": "mvp_key_captured",
            "key": oral_key,
            "physicalKey": physical_key,
            "mappingId": target.mapping_id,
            "mode": "oralTrigger",
            "triggerMode": "tap",
            "backendCommitted": true,
        });
        window.emit("to_js", &ack).ok();
        emit_record_probe(window, "commit", &oral_key, "oralTrigger");
        let app = window.app_handle();
        crate::tray::refresh_tray_visual_forced(&app);
        // Oral commit must not leave Soft Pad / calibrate covering the monitor
        // (录完侧键2后「整个屏幕无法点击」). recording already cleared above;
        // ExitGuard will disarm hooks on return.
        if let Some(arc) = app.try_state::<std::sync::Arc<AppState>>() {
            crate::voice_command_session::force_cancel(arc.inner(), &app, "oral_trigger_commit");
        } else {
            crate::codex_micro_overlay::note_pad_run_status("idle", "ACT10");
        }
        crate::input_aim_calibrate::abort_if_open(&app);
        crate::codex_micro_overlay::mute_overlay_for_recording(&app);
        crate::codex_micro_overlay::push_state(&app, state);
        crate::hotkey_win::disarm_recording_session();
        return;
    }

    if is_trigger {
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
    } else if is_target {
        if !is_allowed_target_shortcut(&captured) {
            let ack = serde_json::json!({
                "type": "mvp_record_rejected",
                "reason": "left_mouse_not_allowed",
                "key": captured,
            });
            window.emit("to_js", &ack).ok();
            crate::hotkey_win::disarm_recording_session();
            return;
        }
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == target.mapping_id) {
            m.target_key = captured.clone();
            m.label = format!("{}  ?{}", m.trigger_key, captured);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &target.mapping_id);
    }

    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    if is_agent_binding {
        if let Some(ref mgr) = *state.hotkey_mgr.lock() {
            let cfg = state.cfg.lock();
            mgr.bind_all(&cfg.bindings());
            mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
        }
    } else {
        persist_and_rebind(state, window, "recorded");
    }

    let mode = if is_target {
        "target"
    } else if is_agent_binding {
        "agentBinding"
    } else {
        "trigger"
    };
    let (display_key, target_key, trigger_source, source_key, source_time, trigger_mode) = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(&target.mapping_id);
        if is_agent_binding {
            (
                captured.clone(),
                mapping.map(|m| m.target_key.clone()).unwrap_or_default(),
                None,
                physical_key.clone(),
                String::new(),
                gesture_mode_label(gesture.unwrap_or(RecordedGesture::Tap)).to_string(),
            )
        } else if is_target {
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
                    crate::config::TriggerMode::Tap => "tap".to_string(),
                    crate::config::TriggerMode::PerPress => "perpress".to_string(),
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
    emit_record_probe(window, "commit", &display_key, mode);
    if is_trigger || is_agent_binding {
        arm_record_guard(state);
    }
    crate::tray::refresh_tray_visual_forced(window.app_handle());
    crate::hotkey_win::disarm_recording_session();
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
