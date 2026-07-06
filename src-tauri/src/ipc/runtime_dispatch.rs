use std::sync::Arc;

use tauri::AppHandle;

use crate::app_chat_workflow;
use crate::config::effective_mapping_for_trigger;
use crate::press_gesture::parse_physical_event;
use crate::runtime_event;
use crate::AppState;

use super::trigger_dispatch::dispatch_trigger_action;

fn should_publish_input_obs(state: &AppState, kind: &str) -> bool {
    *state.recording.lock() || kind == runtime_event::kind::INPUT_PARSE_MISS
}

/// Publish low-frequency input observability events to the runtime ring.
pub fn handle_input_obs_event(state: &Arc<AppState>, app: &AppHandle, obs: crate::input_obs::InputObsEvent) {
    if !should_publish_input_obs(state, obs.kind) {
        return;
    }
    let message = match obs.kind {
        runtime_event::kind::INPUT_PARSE_MISS => "HID parse miss".into(),
        runtime_event::kind::INPUT_IGNORED => format!("Input ignored: {}", obs.reason),
        runtime_event::kind::INPUT_CAPTURED => format!("Input captured: {}", obs.key),
        other => other.to_string(),
    };
    let payload = serde_json::json!({
        "key": obs.key,
        "device": obs.device,
        "reportHex": obs.report_hex,
        "reason": obs.reason,
        "source": obs.source,
    });
    runtime_event::publish_runtime_event(
        Some(app),
        state,
        "input_ext",
        obs.kind,
        &message,
        Some(payload),
    );
}

/// 解析物理按键事件，处理长按/双击手势后触发语音。
pub fn dispatch_physical_event(state: &Arc<AppState>, window: &tauri::WebviewWindow, raw: &str) {
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(raw);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    if event.is_keyup {
        state.gesture.lock().on_keyup(&event);
        return;
    }
    let now = std::time::Instant::now();
    let fire_key = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mut gesture = state.gesture.lock();
        gesture.on_keydown(&event, mapping, now)
    };
    if let Some(key) = fire_key {
        handle_physical_key(state, window, &key);
    }
}

pub fn handle_physical_key(state: &Arc<AppState>, window: &tauri::WebviewWindow, key_name: &str) {
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(key_name);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    let now = std::time::Instant::now();
    let (mapping_id, duration_ms, actions) = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mapping_id = mapping.id.clone();
        let duration_ms = cfg.key_press_duration_ms;
        let foreground_app = app_chat_workflow::foreground_app_target_id();
        let effective =
            effective_mapping_for_trigger(mapping, foreground_app.as_deref());
        let actions = {
            let mut pool = state.machine_pool.lock();
            pool.get_or_create(&mapping_id)
                .trigger(&cfg, &effective, &event.key, now)
        };
        (mapping_id, duration_ms, actions)
    };
    let source_key = event.key.clone();
    for action in actions {
        dispatch_trigger_action(state, window, &mapping_id, duration_ms, &source_key, action);
    }
}
