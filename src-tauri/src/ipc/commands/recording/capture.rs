use std::sync::Arc;

use tauri::Emitter;

use crate::config::{canonical_trigger, RawEvent};
use crate::ipc::core::persist_and_rebind;
use crate::ipc::recording::{
    build_source_from_raw_events, enable_mapping_if_complete, handle_hardware_record_key,
    normalize_hardware_key, normalize_record_key,
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

#[tauri::command]
pub fn cmd_frontend_keydown(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    key: String,
    mapping_id: String,
    mode: String,
) {
    if !*state.recording.lock() {
        return;
    }
    if key.trim().is_empty() {
        return;
    }

    let is_target = mode == "target";
    let mapping_id = mapping_id.clone();
    if !is_target {
        let physical = normalize_hardware_key(&key);
        handle_hardware_record_key(state.inner(), &window, &physical);
        return;
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

    let captured_key = if is_target {
        key
    } else {
        normalize_record_key(&key)
    };
    let ack = serde_json::json!({
        "type": "mvp_key_captured",
        "key": captured_key,
        "mappingId": mapping_id,
        "mode": mode,
    });
    window.emit("to_js", &ack).ok();
}
