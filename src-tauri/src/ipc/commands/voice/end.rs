use std::sync::Arc;

use crate::AppState;

use super::sapi::app_resource_dir;

#[tauri::command]
pub fn cmd_voice_end_status(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::voice_end_runtime::voice_end_status(&state)
}

#[tauri::command]
pub fn cmd_voice_end_set_enabled(
    state: tauri::State<Arc<AppState>>,
    _window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let status = crate::voice_end_runtime::voice_end_set_enabled(&state, Some(&app), enabled);
    crate::voice_vosk_runtime::maybe_restart_vosk_for_grammar(
        Arc::clone(&state),
        app_resource_dir(&app),
    );
    Ok(status)
}

#[tauri::command]
pub fn cmd_voice_end_set_auto_send(
    state: tauri::State<Arc<AppState>>,
    enabled: bool,
) -> serde_json::Value {
    crate::voice_end_runtime::voice_end_set_auto_send(&state, enabled)
}

#[tauri::command]
pub fn cmd_voice_end_set_commit_delay(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] commitDelayMs: Option<u32>,
    commit_delay_ms: Option<u32>,
) -> serde_json::Value {
    let delay = commit_delay_ms.or(commitDelayMs).unwrap_or(4000);
    crate::voice_end_runtime::voice_end_set_commit_delay(&state, delay)
}

#[tauri::command]
pub fn cmd_voice_end_set_commit_key(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] commitKey: Option<String>,
    commit_key: Option<String>,
) -> serde_json::Value {
    let key = commit_key
        .or(commitKey)
        .unwrap_or_else(|| "Enter".to_string());
    crate::voice_end_runtime::voice_end_set_commit_key(&state, key)
}

#[tauri::command]
pub fn cmd_voice_end_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    #[allow(non_snake_case)] phrasesZh: Option<Vec<String>>,
    phrases_zh: Option<Vec<String>>,
    #[allow(non_snake_case)] phrasesEn: Option<Vec<String>>,
    phrases_en: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let zh = phrases_zh.or(phrasesZh).unwrap_or_default();
    let en = phrases_en.or(phrasesEn).unwrap_or_default();
    let status = crate::voice_end_runtime::voice_end_set_phrases(&state, zh, en);
    crate::voice_vosk_runtime::maybe_restart_vosk_for_grammar(
        Arc::clone(&state),
        app_resource_dir(&app),
    );
    Ok(status)
}

#[tauri::command]
pub fn cmd_voice_end_test_stop(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_end_runtime::test_stop_dictation(&state, &window)
}

#[tauri::command]
pub fn cmd_voice_end_ui_end(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    let _ = window;
    // UI-driven "结束输入" button: force stop current dictation session.
    // Unlike trigger-key stop (where target key was already sent), UI stop always sends target shortcut.
    if crate::voice_end_runtime::session_state(&state) != "dictating" {
        return serde_json::json!({
            "ok": false,
            "reason": "not dictating"
        });
    }
    crate::voice_end_runtime::handle_end_phrase(&state, &app, "ui end input");
    crate::voice_end_runtime::voice_end_status(&state)
}

#[tauri::command]
pub fn cmd_voice_end_ui_cancel(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    let _ = window;
    if !crate::voice_end_runtime::ui_cancel_dictation(&state, &app) {
        return serde_json::json!({
            "ok": false,
            "reason": "not dictating"
        });
    }
    crate::voice_end_runtime::voice_end_status(&state)
}

#[tauri::command]
pub fn cmd_voice_end_test_commit(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_end_runtime::test_commit_key(&state, &window)
}
