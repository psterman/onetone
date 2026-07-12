use std::sync::Arc;

use tauri::Manager;

use crate::AppState;

/// 测试发送目标键；直接返回结果 JSON。
pub fn perform_test_send(
    state: &AppState,
    app: &tauri::AppHandle,
    mapping_id: Option<String>,
    target_key: Option<String>,
) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "paused",
        });
    }
    if *state.recording.lock() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "recording",
        });
    }

    let (key, duration_ms, mapping_label) = {
        let cfg = state.cfg.lock();
        let duration_ms = cfg.key_press_duration_ms;
        let mut mapping_label = String::new();
        if let Some(ref id) = mapping_id {
            if let Some(m) = cfg.find_mapping_by_id(id) {
                mapping_label = m.display_label();
            }
        }
        let mut key = target_key
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .map(str::to_string)
            .unwrap_or_default();
        if key.is_empty() {
            if let Some(ref id) = mapping_id {
                if let Some(m) = cfg.find_mapping_by_id(id) {
                    if !m.target_key.trim().is_empty() {
                        key = m.target_key.clone();
                    }
                }
            }
        }
        (key, duration_ms, mapping_label)
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "no_target",
            "mappingLabel": mapping_label,
        });
    }

    if !crate::key_chord::chord_is_sendable(key.trim()) {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "invalid_key",
            "key": key,
            "mappingLabel": mapping_label,
        });
    }

    let ok = crate::voice_end_runtime::send_wake_to_target(
        Some(state),
        Some(app),
        &key,
        duration_ms,
    );
    serde_json::json!({
        "type": "mvp_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
        "mappingLabel": mapping_label,
    })
}

#[tauri::command]
pub fn cmd_test_send(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    mapping_id: Option<String>,
    target_key: Option<String>,
) -> serde_json::Value {
    perform_test_send(
        state.inner(),
        &window.app_handle(),
        mapping_id,
        target_key,
    )
}
