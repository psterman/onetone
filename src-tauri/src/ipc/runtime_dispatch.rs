use std::sync::Arc;

use crate::press_gesture::parse_physical_event;
use crate::AppState;

use super::trigger_dispatch::dispatch_trigger_action;

/// 解析物理按键事件，处理长按/双击手势后触发语音。
pub fn dispatch_physical_event(state: &Arc<AppState>, window: &tauri::WebviewWindow, raw: &str) {
    if *state.paused.lock() || *state.recording.lock() || crate::send_guard::is_active() {
        return;
    }
    let event = parse_physical_event(raw);
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
    if *state.paused.lock() || *state.recording.lock() || crate::send_guard::is_active() {
        return;
    }
    let event = parse_physical_event(key_name);
    let now = std::time::Instant::now();
    let (mapping_id, duration_ms, actions) = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mapping_id = mapping.id.clone();
        let duration_ms = cfg.key_press_duration_ms;
        let actions = {
            let mut pool = state.machine_pool.lock();
            pool.get_or_create(&mapping_id)
                .trigger(&cfg, mapping, &event.key, now)
        };
        (mapping_id, duration_ms, actions)
    };
    let source_key = event.key.clone();
    for action in actions {
        dispatch_trigger_action(state, window, &mapping_id, duration_ms, &source_key, action);
    }
}
