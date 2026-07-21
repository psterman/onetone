use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::codex_micro_overlay;
use crate::codex_numpad_layer;
use crate::config;
use crate::AppState;

fn locale_from_cfg(_cfg: &config::VoiceConfig) -> &str {
    "zh-CN"
}

fn apply_ensure_result(state: &Arc<AppState>, app: &AppHandle, result: codex_numpad_layer::CodexPadEnsureResult) {
    if !result.changed {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "to_js",
            &serde_json::json!({
                "type": "codex_micro_pad_ready",
                "readiness": result.readiness,
                "mappingId": result.mapping_id,
                "codexMicroPad": result.codex_micro_pad,
                "agentBindings": result.agent_bindings,
            }),
        );
    }
    let state_bg = Arc::clone(state);
    let app_bg = app.clone();
    let _ = std::thread::Builder::new()
        .name("codex-pad-ready-overlay".into())
        .spawn(move || {
            codex_micro_overlay::push_state(&app_bg, &state_bg);
        });
}

/// Seed standard Codex Micro pad + bindings when missing (out-of-box).
#[tauri::command]
pub fn cmd_codex_micro_pad_ensure_ready(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    locale: Option<String>,
) -> serde_json::Value {
    let result = {
        let mut cfg = state.cfg.lock();
        let loc = locale
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| locale_from_cfg(&cfg))
            .to_string();
        let result = codex_numpad_layer::ensure_codex_pad_ready(&mut cfg, &loc);
        if result.changed {
            config::save_config(&cfg);
            codex_numpad_layer::sync_hook_cache(&cfg);
        }
        result
    };
    apply_ensure_result(state.inner(), &app, result.clone());
    serde_json::to_value(result).unwrap_or_else(|_| serde_json::json!({ "changed": false }))
}

/// Live readiness for recognition UI (foreground / NumLock / hook routes).
#[tauri::command]
pub fn cmd_codex_micro_pad_get_readiness(
    state: State<'_, Arc<AppState>>,
) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let readiness = codex_numpad_layer::readiness_snapshot(&cfg);
    serde_json::to_value(readiness).unwrap_or_else(|_| serde_json::json!({ "ready": false }))
}
