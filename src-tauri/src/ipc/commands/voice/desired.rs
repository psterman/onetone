use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

/// Persist global desired wake engine and activate via single voice supervisor worker.
pub fn voice_set_desired_engine(
    app: &AppHandle,
    state: &Arc<AppState>,
    engine: &str,
    reason: &str,
) -> Result<serde_json::Value, String> {
    let label = crate::config::parse_desired_engine_label(engine)
        .map(crate::config::desired_engine_label)
        .ok_or_else(|| format!("unknown desired engine: {engine}"))?;
    let (cfg_snapshot, config_changed) = {
        let mut cfg = state.cfg.lock();
        let before_desired = cfg.desired_engine.clone();
        let before_strategy = cfg.voice_listening_strategy.clone();
        let before_vosk = cfg.voice_vosk.enabled;
        let before_sapi = cfg.voice_sapi.enabled;
        let before_kws = cfg.voice_kws.enabled;
        crate::config::apply_desired_engine(&mut cfg, label);
        cfg.normalize();
        let changed = before_desired != cfg.desired_engine
            || before_strategy != cfg.voice_listening_strategy
            || before_vosk != cfg.voice_vosk.enabled
            || before_sapi != cfg.voice_sapi.enabled
            || before_kws != cfg.voice_kws.enabled;
        (cfg.clone(), changed)
    };
    if config_changed {
        let save_snapshot = cfg_snapshot.clone();
        let _ = std::thread::Builder::new()
            .name("desired-engine-save".into())
            .spawn(move || {
                crate::config::save_config(&save_snapshot);
            });
        crate::voice_supervisor::enqueue_activate(app.clone(), Arc::clone(state), reason);
    }
    let resource_dir = app.path().resource_dir().ok();
    Ok(serde_json::json!({
        "ok": true,
        "engine": label,
        "supervisor": crate::voice_bootstrap::supervisor_status_json(state),
        "voiceVosk": crate::voice_vosk_runtime::voice_vosk_status(state, resource_dir.clone()),
        "voiceSapi": crate::voice_sapi_runtime::voice_sapi_status(state),
        "voiceKws": crate::voice_kws_runtime::voice_kws_status(state, resource_dir),
        "activateAsync": config_changed,
        "activateBusy": config_changed && crate::voice_supervisor::activate_busy(),
        "noop": !config_changed,
    }))
}

pub fn voice_set_listening_strategy(
    app: &AppHandle,
    state: &Arc<AppState>,
    strategy: &str,
    reason: &str,
) -> Result<serde_json::Value, String> {
    use std::sync::atomic::Ordering;

    let label = crate::config::parse_voice_listening_strategy_label(strategy)
        .ok_or_else(|| format!("unknown listening strategy: {strategy}"))?;
    // Tray / homepage enable must not stay config-only while settings park is latched.
    if label != "off" {
        state.settings_asr_quiet.store(false, Ordering::SeqCst);
    }
    let (cfg_snapshot, config_changed) = {
        let mut cfg = state.cfg.lock();
        let before_strategy = cfg.voice_listening_strategy.clone();
        let before_assist = cfg.voice_assist_enabled;
        let before_activation = cfg.voice_activation.clone();
        let before_desired = cfg.desired_engine.clone();
        let before_vosk = cfg.voice_vosk.enabled;
        let before_sapi = cfg.voice_sapi.enabled;
        let before_kws = cfg.voice_kws.enabled;
        crate::config::apply_voice_listening_strategy(&mut cfg, label);
        cfg.normalize();
        let changed = before_strategy != cfg.voice_listening_strategy
            || before_assist != cfg.voice_assist_enabled
            || before_activation != cfg.voice_activation
            || before_desired != cfg.desired_engine
            || before_vosk != cfg.voice_vosk.enabled
            || before_sapi != cfg.voice_sapi.enabled
            || before_kws != cfg.voice_kws.enabled;
        (cfg.clone(), changed)
    };
    let parked = crate::voice_bootstrap::voice_settings_parked(state.as_ref());
    // Always save off-thread. Homepage「开启自动」used to sync pretty-print a bloated
    // settings.json on the blocking worker and 假死 the UI (layout_persist convoy).
    if config_changed {
        let _ = std::thread::Builder::new()
            .name("strategy-save".into())
            .spawn({
                let cfg_snapshot = cfg_snapshot.clone();
                move || {
                    crate::config::save_config(&cfg_snapshot);
                }
            });
    }
    crate::app_log::log_line(
        state.as_ref(),
        "voice",
        &format!("set_listening_strategy label={label} reason={reason}"),
    );
    if label == "resourceSaver" {
        crate::voice_bootstrap::touch_wake_activity(state.as_ref());
    }
    // Voice-settings park: only persist strategy; unpark activates.
    if !config_changed {
        crate::app_log::log_line(
            state.as_ref(),
            "voice",
            &format!("set_listening_strategy noop label={label} reason={reason}"),
        );
    } else if parked {
        crate::app_log::log_line(
            state.as_ref(),
            "voice",
            "set_listening_strategy config-only (settings park; activate deferred to unpark)",
        );
    } else {
        crate::voice_supervisor::enqueue_activate(app.clone(), Arc::clone(state), reason);
    }

    let supervisor = crate::voice_bootstrap::supervisor_status_json(state);
    Ok(serde_json::json!({
        "ok": true,
        "strategy": label,
        "engine": supervisor.get("desiredEngine").cloned().unwrap_or(serde_json::json!("none")),
        "supervisor": supervisor,
        "activateAsync": config_changed && !parked,
        "activateBusy": config_changed && !parked,
        "noop": !config_changed,
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
pub async fn cmd_voice_set_listening_strategy(
    state: tauri::State<'_, Arc<AppState>>,
    window: WebviewWindow,
    strategy: String,
) -> Result<serde_json::Value, String> {
    // Disk save + cfg lock must not run on the UI/IPC thread — sync cmd 假死'd WebView (~5s).
    let app = window.app_handle().clone();
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        voice_set_listening_strategy(&app, &state, &strategy, "set_listening_strategy")
    })
    .await
    .map_err(|e| format!("set_listening_strategy join: {e}"))?
}

/// Persist voiceActivation (pushToTalk | softPad | wakeOrPushToTalk | disabled) and activate.
pub fn voice_set_activation(
    app: &AppHandle,
    state: &Arc<AppState>,
    mode: &str,
    reason: &str,
) -> Result<serde_json::Value, String> {
    use std::sync::atomic::Ordering;

    let label = crate::config::normalize_voice_activation(mode);
    if label == "wakeOrPushToTalk" {
        state.settings_asr_quiet.store(false, Ordering::SeqCst);
    }
    let cfg_snapshot = {
        let mut cfg = state.cfg.lock();
        crate::config::apply_voice_activation(&mut cfg, label);
        cfg.normalize();
        cfg.clone()
    };
    let parked = crate::voice_bootstrap::voice_settings_parked(state.as_ref());
    let _ = std::thread::Builder::new()
        .name("activation-save".into())
        .spawn({
            let snap = cfg_snapshot.clone();
            move || {
                crate::config::save_config(&snap);
            }
        });
    crate::app_log::log_line(
        state.as_ref(),
        "voice",
        &format!("set_voice_activation label={label} reason={reason}"),
    );
    if label == "wakeOrPushToTalk" {
        crate::voice_bootstrap::touch_wake_activity(state.as_ref());
    }
    if !parked {
        crate::voice_supervisor::enqueue_activate(app.clone(), Arc::clone(state), reason);
    }
    let supervisor = crate::voice_bootstrap::supervisor_status_json(state);
    let payload = serde_json::json!({
        "ok": true,
        "on": label == "wakeOrPushToTalk",
        "voiceActivation": label,
        "voiceWakeListeningOptIn": cfg_snapshot.voice_wake_listening_opt_in,
        "voiceAssistEnabled": cfg_snapshot.voice_assist_enabled,
        "strategy": cfg_snapshot.voice_listening_strategy,
        "desiredEngine": cfg_snapshot.desired_engine,
        "supervisor": supervisor,
        "activateAsync": !parked,
        "activateBusy": !parked,
    });
    // Cross-webview sync: Soft Pad / mini / tray ↔ main home/settings paint.
    let _ = crate::ipc::emit_app_event(app, "voice-keyless-changed", &payload);
    Ok(payload)
}

#[tauri::command]
pub async fn cmd_voice_set_activation(
    state: tauri::State<'_, Arc<AppState>>,
    window: WebviewWindow,
    mode: String,
) -> Result<serde_json::Value, String> {
    let app = window.app_handle().clone();
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        voice_set_activation(&app, &state, &mode, "set_voice_activation")
    })
    .await
    .map_err(|e| format!("set_voice_activation join: {e}"))?
}
