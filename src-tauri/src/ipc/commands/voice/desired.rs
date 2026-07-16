use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

/// Persist global desired wake engine and activate it via supervisor.
pub fn voice_set_desired_engine(
    app: &AppHandle,
    state: &Arc<AppState>,
    engine: &str,
    reason: &str,
) -> Result<serde_json::Value, String> {
    let label = crate::config::parse_desired_engine_label(engine)
        .map(crate::config::desired_engine_label)
        .ok_or_else(|| format!("unknown desired engine: {engine}"))?;
    {
        let mut cfg = state.cfg.lock();
        crate::config::apply_desired_engine(&mut cfg, label);
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    crate::voice_bootstrap::activate_desired_engine(app, state, reason);
    let resource_dir = app.path().resource_dir().ok();
    Ok(serde_json::json!({
        "ok": true,
        "engine": label,
        "supervisor": crate::voice_bootstrap::supervisor_status_json(state),
        "voiceVosk": crate::voice_vosk_runtime::voice_vosk_status(state, resource_dir.clone()),
        "voiceSapi": crate::voice_sapi_runtime::voice_sapi_status(state),
        "voiceKws": crate::voice_kws_runtime::voice_kws_status(state, resource_dir),
    }))
}

pub fn voice_set_listening_strategy(
    app: &AppHandle,
    state: &Arc<AppState>,
    strategy: &str,
    reason: &str,
) -> Result<serde_json::Value, String> {
    let label = crate::config::parse_voice_listening_strategy_label(strategy)
        .ok_or_else(|| format!("unknown listening strategy: {strategy}"))?;
    {
        let mut cfg = state.cfg.lock();
        crate::config::apply_voice_listening_strategy(&mut cfg, label);
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    crate::voice_bootstrap::activate_desired_engine(app, state, reason);
    let resource_dir = app.path().resource_dir().ok();
    Ok(serde_json::json!({
        "ok": true,
        "strategy": label,
        "engine": crate::voice_bootstrap::supervisor_status_json(state).get("desiredEngine").cloned().unwrap_or(serde_json::json!("none")),
        "supervisor": crate::voice_bootstrap::supervisor_status_json(state),
        "voiceVosk": crate::voice_vosk_runtime::voice_vosk_status(state, resource_dir.clone()),
        "voiceSapi": crate::voice_sapi_runtime::voice_sapi_status(state),
        "voiceKws": crate::voice_kws_runtime::voice_kws_status(state, resource_dir),
    }))
}

#[tauri::command]
pub fn cmd_voice_set_desired_engine(
    state: tauri::State<Arc<AppState>>,
    window: WebviewWindow,
    engine: String,
) -> Result<serde_json::Value, String> {
    voice_set_desired_engine(
        window.app_handle(),
        state.inner(),
        &engine,
        "set_desired_engine",
    )
}

#[tauri::command]
pub fn cmd_voice_set_listening_strategy(
    state: tauri::State<Arc<AppState>>,
    window: WebviewWindow,
    strategy: String,
) -> Result<serde_json::Value, String> {
    voice_set_listening_strategy(
        window.app_handle(),
        state.inner(),
        &strategy,
        "set_listening_strategy",
    )
}
