use std::sync::Arc;

use tauri::Emitter;
use tauri::Manager;

use crate::config::{canonical_trigger, RawEvent};
use crate::ipc::core::persist_and_rebind;
use crate::ipc::recording::{
    build_source_from_raw_events, enable_mapping_if_complete, handle_hardware_record_key,
    normalize_hardware_key, normalize_record_key, RecordMode, RecordingTarget,
};
use crate::AppState;

#[tauri::command]
pub fn cmd_capture_source(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    mapping_id: String,
    raw_events: Vec<RawEvent>,
) {
    if raw_events.is_empty() {
        return;
    }
    let source = build_source_from_raw_events(raw_events);
    let captured = source
        .raw_events
        .first()
        .map(|r| canonical_trigger(&r.hotkey))
        .unwrap_or_else(|| "AutoTrigger".into());
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
            m.trigger_key = captured.clone();
            m.source_key = source
                .raw_events
                .first()
                .map(|r| crate::config::canonical_trigger(&r.hotkey))
                .unwrap_or_else(|| captured.clone());
            m.trigger_source = Some(source.clone());
            m.source_time = crate::config::now_source_time();
            m.label = format!("{} -> {}", m.trigger_key, m.target_key);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &mapping_id);
    }
    persist_and_rebind(&state, &window, "source_captured");
    let ack = serde_json::json!({
        "type": "mvp_source_captured",
        "mappingId": mapping_id,
        "key": captured,
        "source": source,
        "sourceTime": crate::config::now_source_time(),
    });
    window.emit("to_js", &ack).ok();
}

fn record_mode_from_fe(mode: &str) -> RecordMode {
    match mode {
        "target" => RecordMode::Target,
        "agentBinding" | "agent_binding" => RecordMode::AgentBinding,
        "padBind" | "pad_bind" => RecordMode::PadBind,
        "oralTrigger" | "oral_trigger" | "oral" => RecordMode::OralTrigger,
        _ => RecordMode::Trigger,
    }
}

#[tauri::command]
pub fn cmd_frontend_keydown(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    key: String,
    mapping_id: String,
    mode: String,
) -> serde_json::Value {
    // FE must not rely on to_js alone: Logitech G HUB often blocks WH_MOUSE_LL while
    // page pointer events still fire. Return commit status so the backup path can
    // finish the modal even when mvp_record_probe / mvp_key_captured is dropped.
    if key.trim().is_empty() {
        return serde_json::json!({
            "ok": false,
            "committed": false,
            "stage": "empty_key",
            "key": "",
            "mappingId": mapping_id,
        });
    }

    // Logitech side buttons often never reach WH_MOUSE_LL / GetAsyncKeyState.
    // The page-side backup is then the only commit path — never drop it silently
    // when the FE modal is still open but state.recording was cleared by a prior
    // reject ExitGuard race.
    if !*state.recording.lock() {
        let session = crate::hotkey_win::is_recording_session_active();
        let mid = mapping_id.trim().to_string();
        if session || !mid.is_empty() {
            *state.recording.lock() = true;
            if state.recording_target.lock().is_none() && !mid.is_empty() {
                *state.recording_target.lock() = Some(RecordingTarget {
                    mapping_id: mid.clone(),
                    mode: record_mode_from_fe(&mode),
                });
            }
            if state.record_started_at.lock().is_none() {
                *state.record_started_at.lock() = Some(std::time::Instant::now());
            }
            crate::hotkey_win::arm_recording_session();
            crate::ipc::recording::emit_record_probe(&window, "recv", key.trim(), "fe_recover");
        } else {
            crate::ipc::recording::emit_record_probe(
                &window,
                "drop",
                key.trim(),
                "not_recording",
            );
            return serde_json::json!({
                "ok": false,
                "committed": false,
                "stage": "not_recording",
                "key": key.trim(),
                "mappingId": mapping_id,
            });
        }
    }

    let is_target = mode == "target";
    let mapping_id = mapping_id.clone();
    if !is_target {
        let physical = if let Some(rest) = key.strip_prefix("keyup:") {
            format!("keyup:{}", normalize_hardware_key(rest))
        } else {
            normalize_hardware_key(&key)
        };
        let mid_before = state
            .recording_target
            .lock()
            .as_ref()
            .map(|t| t.mapping_id.clone())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| mapping_id.clone());
        handle_hardware_record_key(state.inner(), &window, &physical);
        let committed = !*state.recording.lock();
        return serde_json::json!({
            "ok": true,
            "committed": committed,
            "stage": if committed { "committed" } else { "pending" },
            "key": physical,
            "mappingId": mid_before,
            "mode": mode,
        });
    }
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
            m.target_key = key.clone();
            m.label = format!("{}  ?{}", m.trigger_key, key);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &mapping_id);
    }

    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    persist_and_rebind(&state, &window, "recorded");

    crate::tray::refresh_tray_visual_forced(window.app_handle());

    let captured_key = key.clone();
    let ack = serde_json::json!({
        "type": "mvp_key_captured",
        "key": captured_key,
        "mappingId": mapping_id,
        "mode": mode,
    });
    window.emit("to_js", &ack).ok();
    serde_json::json!({
        "ok": true,
        "committed": true,
        "stage": "committed",
        "key": captured_key,
        "mappingId": mapping_id,
        "mode": mode,
    })
}
