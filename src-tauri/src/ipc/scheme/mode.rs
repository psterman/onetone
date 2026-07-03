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
        let active_id = cfg
            .active_mappings()
            .first()
            .map(|m| m.id.clone())
            .or_else(|| {
                cfg.mappings
                    .iter()
                    .find(|m| mapping_is_complete(m))
                    .map(|m| m.id.clone())
            });
        let Some(id) = active_id else {
            return;
        };
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
            crate::config::TriggerMode::Tap | crate::config::TriggerMode::Toggle => "tap",
            crate::config::TriggerMode::Hold => "hold",
            crate::config::TriggerMode::LongPress => "longpress",
            crate::config::TriggerMode::Double => "double",
        },
    });
    crate::ipc::core::emit_to_main_if_available(app, Some(state), ack);
}
