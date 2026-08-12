use std::sync::Arc;

use tauri::Emitter;

use crate::config::{
    new_mapping_id, rekey_acoustic_voice_commands_for_mapping, rekey_voice_commands_for_mapping,
    MappingEntry,
};
use crate::ipc::core::persist_and_rebind;
use crate::AppState;

#[tauri::command]
pub fn cmd_mapping_toggle(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    enabled: bool,
) {
    let mut disabled_ids = Vec::new();
    {
        let mut cfg = state.cfg.lock();
        if enabled {
            disabled_ids = cfg.enable_mapping(&id);
        } else {
            cfg.disable_mapping(&id);
        }
        cfg.normalize();
    }
    persist_and_rebind(&state, &window, "mapping_toggled");
    let ack = serde_json::json!({
        "type": "mvp_mapping_toggled",
        "ok": true,
        "id": id,
        "enabled": enabled,
        "autoDisabled": disabled_ids,
    });
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_delete(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
) {
    let mut cfg = state.cfg.lock();
    if cfg.mappings.len() <= 1 {
        let ack =
            serde_json::json!({"type":"mvp_mapping_delete","ok":false,"reason":"last_mapping"});
        window.emit("to_js", &ack).ok();
        return;
    }
    cfg.mappings.retain(|m| m.id != id);
    cfg.normalize();
    drop(cfg);
    persist_and_rebind(&state, &window, "mapping_deleted");
    let ack = serde_json::json!({"type":"mvp_mapping_delete","ok":true,"id":id});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_duplicate(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
) {
    let mut new_id = String::new();
    {
        let mut cfg = state.cfg.lock();
        if let Some(src) = cfg.mappings.iter().find(|m| m.id == id).cloned() {
            new_id = new_mapping_id();
            let order = cfg.mappings.len() as u32;
            cfg.mappings.push(MappingEntry {
                id: new_id.clone(),
                label: format!("{}    ", src.display_label()),
                group: src.group,
                trigger_key: src.trigger_key,
                target_key: src.target_key,
                enabled: false,
                key_mode_enabled: src.key_mode_enabled,
                voice_mode_enabled: src.voice_mode_enabled,
                order,
                trigger_mode: src.trigger_mode,
                trigger_source: src.trigger_source,
                source_key: src.source_key,
                source_time: src.source_time,
                interval_ms: src.interval_ms,
                enter_delay_ms: src.enter_delay_ms,
                cancel_enabled: src.cancel_enabled,
                auto_enter_enabled: src.auto_enter_enabled,
                switch_keys: src.switch_keys.clone(),
                native_key_restore: src.native_key_restore,
                trigger_device: src.trigger_device.clone(),
                long_press_ms: src.long_press_ms,
                double_click_ms: src.double_click_ms,
                ime_preset_id: src.ime_preset_id.clone(),
                app_target_id: src.app_target_id.clone(),
                app_behavior_rules: src.app_behavior_rules.clone(),
                voice_override: src.voice_override.clone(),
                camera_override: None,
                voice_commands: rekey_voice_commands_for_mapping(&src.voice_commands, &new_id),
                acoustic_voice_commands: rekey_acoustic_voice_commands_for_mapping(
                    &src.acoustic_voice_commands,
                    &new_id,
                ),
                agent_template_id: src.agent_template_id.clone(),
                agent_provider_id: src.agent_provider_id.clone(),
                agent_bindings: src.agent_bindings.clone(),
                codex_micro_pad: src.codex_micro_pad.clone(),
                time_machine_workspace: src.time_machine_workspace.clone(),
            });
            cfg.normalize();
        }
    }
    persist_and_rebind(&state, &window, "mapping_duplicated");
    let ack = serde_json::json!({"type":"mvp_mapping_duplicated","ok":true,"id":new_id});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_reorder(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    ordered_ids: Vec<String>,
) {
    {
        let mut cfg = state.cfg.lock();
        for (i, oid) in ordered_ids.iter().enumerate() {
            if let Some(m) = cfg.mappings.iter_mut().find(|m| &m.id == oid) {
                m.order = i as u32;
            }
        }
        cfg.mappings.sort_by_key(|m| m.order);
    }
    persist_and_rebind(&state, &window, "mapping_reordered");
}
