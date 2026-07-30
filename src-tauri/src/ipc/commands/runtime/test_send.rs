use std::sync::Arc;

use tauri::Manager;

use crate::AppState;

/// 测试发送目标键；直接返回结果 JSON。
pub fn perform_test_send(
    state: &Arc<AppState>,
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
        Some(state.as_ref()),
        Some(app),
        &key,
        duration_ms,
    );

    if !ok {
        // Alt/Win into OneTone itself is blocked on purpose; surface that so camera
        // gestures don't look like "recognized but broken" while settings are focused.
        let reason = if crate::app_identity::foreground_is_self() {
            "self_foreground"
        } else {
            "send_failed"
        };
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": reason,
            "key": key,
            "mappingLabel": mapping_label,
        });
    }

    // Camera / test-send voice activate must open a dictation session, otherwise
    // Vosk can hear 「结束输入」 and show it in the transcript UI while end-phrase
    // matching is skipped (session stays idle).
    {
        let action = {
            let cfg = state.cfg.lock();
            let voice_key = crate::voice_end_runtime::resolve_voice_input_target_key(&cfg);
            let is_voice_key = voice_key
                .as_ref()
                .map(|k| k.eq_ignore_ascii_case(key.trim()))
                .unwrap_or(false);
            let mid = mapping_id
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| cfg.active_scene_id.clone());
            let session = crate::voice_end_runtime::session_state(state);
            if is_voice_key && session == "dictating" {
                Some(("stop", mid))
            } else if is_voice_key && crate::voice_end_runtime::can_enter_dictating(&cfg) {
                Some(("enter", mid))
            } else {
                None
            }
        };
        if let Some((kind, mid)) = action {
            if kind == "stop" {
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!("test_send voice key while dictating → stop ({key})"),
                );
                crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
                crate::ipc::push_runtime_via_app(app, state.as_ref(), "test_send_stop", &mid, None);
            } else {
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!("test_send voice key → enter dictating ({key})"),
                );
                crate::voice_end_runtime::enter_dictating(
                    state,
                    Some(app),
                    &mid,
                    "test_send voice activate",
                );
                crate::ipc::push_runtime_via_app(
                    app,
                    state.as_ref(),
                    "test_send_enter",
                    &mid,
                    None,
                );
            }
        }
    }

    serde_json::json!({
        "type": "mvp_test_sent",
        "ok": true,
        "reason": "sent",
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
    perform_test_send(state.inner(), &window.app_handle(), mapping_id, target_key)
}
