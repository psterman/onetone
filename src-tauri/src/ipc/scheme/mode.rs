use std::sync::Arc;

use tauri::AppHandle;

use crate::config::mapping_is_complete;
use crate::ipc::core::persist_and_rebind_via_app;
use crate::AppState;

pub fn set_active_trigger_mode(
    state: &Arc<AppState>,
    app: &AppHandle,
    mode: crate::config::TriggerMode,
) {
    let changed = {
        let mut cfg = state.cfg.lock();
        let active_id = {
            let id = cfg.active_scene_id.trim();
            if !id.is_empty() && cfg.find_mapping_by_id(id).is_some() {
                id.to_string()
            } else {
                cfg.mappings
                    .iter()
                    .find(|m| mapping_is_complete(m))
                    .map(|m| m.id.clone())
                    .unwrap_or_default()
            }
        };
        if active_id.is_empty() {
            return;
        }
        let id = active_id;
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            if m.trigger_mode != mode {
                m.trigger_mode = mode;
                true
            } else {
                false
            }
        } else {
            false
        }
    };
    if !changed {
        return;
    }
    state.machine_pool.lock().reset_all();
    persist_and_rebind_via_app(state, app, "mode_changed");
    let ack = serde_json::json!({
        "type": "mvp_mode_changed",
        "ok": true,
        "mode": match mode {
            crate::config::TriggerMode::Tap => "tap",
            crate::config::TriggerMode::PerPress => "perpress",
            crate::config::TriggerMode::LongPress => "longpress",
            crate::config::TriggerMode::Double => "double",
        },
    });
    crate::ipc::core::emit_to_main_if_available(app, Some(state), ack);
}
