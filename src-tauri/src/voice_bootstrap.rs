//! Voice engine bootstrap at startup and runtime apply on config hot reload.
//! Runtime-only: never mutates config enabled flags or calls save_config.

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::config::{VoiceConfig, VoiceVoskConfig};
use crate::voice_sapi_runtime;
use crate::voice_vosk_runtime;
use crate::AppState;

pub use onetone_logic::voice_reload::DesiredVoiceEngine;

fn voice_reload_snapshot(cfg: &VoiceConfig) -> onetone_logic::voice_reload::VoiceReloadConfig {
    onetone_logic::voice_reload::VoiceReloadConfig {
        vosk: onetone_logic::voice_reload::VoiceVoskReload {
            enabled: cfg.voice_vosk.enabled,
            phrases: cfg.voice_vosk.phrases.clone(),
            model_path: cfg.voice_vosk.model_path.clone(),
            model_preset: cfg.voice_vosk.model_preset.clone(),
            target_key: cfg.voice_vosk.target_key.clone(),
            cooldown_ms: cfg.voice_vosk.cooldown_ms,
        },
        sapi: onetone_logic::voice_reload::VoiceSapiReload {
            enabled: cfg.voice_sapi.enabled,
            phrases: cfg.voice_sapi.phrases.clone(),
            min_confidence: cfg.voice_sapi.min_confidence,
            target_key: cfg.voice_sapi.target_key.clone(),
            cooldown_ms: cfg.voice_sapi.cooldown_ms,
        },
        voice_end: onetone_logic::voice_reload::VoiceEndReload {
            enabled: cfg.voice_end.enabled,
            phrases_zh: cfg.voice_end.phrases_zh.clone(),
            phrases_en: cfg.voice_end.phrases_en.clone(),
        },
    }
}

fn voice_engine_state_is_busy(state: &str) -> bool {
    matches!(
        state,
        "starting" | "listening" | "cooldown" | "triggered" | "stopping"
    )
}

pub fn desired_voice_engine(cfg: &VoiceConfig) -> DesiredVoiceEngine {
    onetone_logic::voice_reload::desired_voice_engine(&voice_reload_snapshot(cfg))
}

fn desired_engine_label(engine: DesiredVoiceEngine) -> &'static str {
    match engine {
        DesiredVoiceEngine::None => "none",
        DesiredVoiceEngine::Vosk => "vosk",
        DesiredVoiceEngine::Sapi => "sapi",
    }
}

pub fn vosk_runtime_relevant_changed(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    onetone_logic::voice_reload::vosk_runtime_relevant_changed(
        &voice_reload_snapshot(old),
        &voice_reload_snapshot(new),
    )
}

pub fn sapi_runtime_relevant_changed(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    onetone_logic::voice_reload::sapi_runtime_relevant_changed(
        &voice_reload_snapshot(old),
        &voice_reload_snapshot(new),
    )
}

pub fn bootstrap_voice_engines(app: &AppHandle, state: &Arc<AppState>, safe_mode: bool) {
    if safe_mode {
        crate::app_log::log_line(state, "voice", "voice bootstrap skipped (safe mode)");
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "voice",
            crate::runtime_event::kind::VOICE_BOOTSTRAP,
            "voice bootstrap skipped (safe mode)",
            None,
        );
        return;
    }

    let cfg = state.cfg.lock().clone();
    let desired = desired_voice_engine(&cfg);

    match desired {
        DesiredVoiceEngine::Vosk => {
            try_start_vosk_runtime(app, state, cfg.voice_vosk, "bootstrap");
            crate::runtime_event::publish_runtime_event(
                Some(app),
                state.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_BOOTSTRAP,
                "voice bootstrap: starting vosk",
                Some(serde_json::json!({ "engine": "vosk" })),
            );
        }
        DesiredVoiceEngine::Sapi => {
            if voice_sapi_runtime::bootstrap_voice_sapi_if_needed(state) {
                crate::app_log::log_line(state, "voice", "voice bootstrap: sapi scheduled");
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_BOOTSTRAP,
                    "voice bootstrap: sapi scheduled",
                    Some(serde_json::json!({ "engine": "sapi" })),
                );
            }
        }
        DesiredVoiceEngine::None => {
            crate::app_log::log_line(state, "voice", "voice bootstrap: no engine enabled");
            crate::runtime_event::publish_runtime_event(
                Some(app),
                state.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_BOOTSTRAP,
                "voice bootstrap: no engine enabled",
                Some(serde_json::json!({ "engine": "none" })),
            );
        }
    }
}

pub fn apply_voice_config_change(
    app: &AppHandle,
    state: &Arc<AppState>,
    old_cfg: &VoiceConfig,
    new_cfg: &VoiceConfig,
) {
    let old_desired = desired_voice_engine(old_cfg);
    let new_desired = desired_voice_engine(new_cfg);

    if old_desired == new_desired {
        match old_desired {
            DesiredVoiceEngine::Vosk => {
                if vosk_runtime_relevant_changed(old_cfg, new_cfg) {
                    restart_vosk_runtime(
                        app,
                        state,
                        new_cfg.voice_vosk.clone(),
                        "phrases/model/grammar changed",
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_RESTART,
                        "voice config changed: vosk restart (phrases/model/grammar changed)",
                        Some(serde_json::json!({ "engine": "vosk" })),
                    );
                } else {
                    crate::app_log::log_line(
                        state,
                        "voice",
                        "voice config changed: no runtime change",
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_NO_CHANGE,
                        "voice config changed: no runtime change",
                        None,
                    );
                }
            }
            DesiredVoiceEngine::Sapi => {
                if sapi_runtime_relevant_changed(old_cfg, new_cfg) {
                    voice_sapi_runtime::restart_voice_sapi_runtime(
                        state,
                        new_cfg.voice_sapi.clone(),
                        "phrases changed",
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_RESTART,
                        "voice config changed: sapi restart (phrases changed)",
                        Some(serde_json::json!({ "engine": "sapi" })),
                    );
                } else {
                    crate::app_log::log_line(
                        state,
                        "voice",
                        "voice config changed: no runtime change",
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_NO_CHANGE,
                        "voice config changed: no runtime change",
                        None,
                    );
                }
            }
            DesiredVoiceEngine::None => {
                crate::app_log::log_line(state, "voice", "voice config changed: no runtime change");
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_NO_CHANGE,
                    "voice config changed: no runtime change",
                    None,
                );
            }
        }
        return;
    }

    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice config changed: {} -> {}",
            desired_engine_label(old_desired),
            desired_engine_label(new_desired)
        ),
    );
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "voice",
        crate::runtime_event::kind::VOICE_RESTART,
        &format!(
            "voice config changed: {} -> {}",
            desired_engine_label(old_desired),
            desired_engine_label(new_desired)
        ),
        Some(serde_json::json!({
            "fromEngine": desired_engine_label(old_desired),
            "toEngine": desired_engine_label(new_desired),
        })),
    );

    match (old_desired, new_desired) {
        (DesiredVoiceEngine::None, DesiredVoiceEngine::Vosk) => {
            voice_sapi_runtime::voice_sapi_stop(state);
            try_start_vosk_runtime(app, state, new_cfg.voice_vosk.clone(), "config change");
        }
        (DesiredVoiceEngine::None, DesiredVoiceEngine::Sapi) => {
            voice_vosk_runtime::spawn_voice_vosk_stop(Arc::clone(state));
            voice_sapi_runtime::start_voice_sapi_runtime_only(
                state,
                new_cfg.voice_sapi.clone(),
                "config change",
            );
        }
        (DesiredVoiceEngine::Vosk, DesiredVoiceEngine::None) => {
            voice_vosk_runtime::spawn_voice_vosk_stop(Arc::clone(state));
        }
        (DesiredVoiceEngine::Sapi, DesiredVoiceEngine::None) => {
            voice_sapi_runtime::voice_sapi_stop(state);
        }
        (DesiredVoiceEngine::Vosk, DesiredVoiceEngine::Sapi) => {
            voice_vosk_runtime::spawn_voice_vosk_stop(Arc::clone(state));
            voice_sapi_runtime::start_voice_sapi_runtime_only(
                state,
                new_cfg.voice_sapi.clone(),
                "config change",
            );
        }
        (DesiredVoiceEngine::Sapi, DesiredVoiceEngine::Vosk) => {
            voice_sapi_runtime::voice_sapi_stop(state);
            try_start_vosk_runtime(app, state, new_cfg.voice_vosk.clone(), "config change");
        }
        _ => {}
    }
}

fn try_start_vosk_runtime(
    app: &AppHandle,
    state: &Arc<AppState>,
    vosk_cfg: VoiceVoskConfig,
    reason: &str,
) -> bool {
    if state.voice_vosk.lock().is_some() {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start vosk ({reason}): handle exists"),
        );
        return false;
    }
    let current = state.voice_vosk_state.lock().clone();
    if voice_engine_state_is_busy(&current) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start vosk ({reason}): state={current}"),
        );
        return false;
    }

    crate::app_log::log_line(state, "voice", &format!("starting vosk ({reason})"));
    voice_sapi_runtime::voice_sapi_stop(state);
    let resource_dir = app.path().resource_dir().ok();
    voice_vosk_runtime::spawn_voice_vosk_start(Arc::clone(state), vosk_cfg, resource_dir);
    true
}

fn restart_vosk_runtime(
    app: &AppHandle,
    state: &Arc<AppState>,
    vosk_cfg: VoiceVoskConfig,
    reason: &str,
) {
    crate::app_log::log_line(
        state,
        "voice",
        &format!("voice config changed: vosk restart ({reason})"),
    );
    voice_sapi_runtime::voice_sapi_stop(state);
    let resource_dir = app.path().resource_dir().ok();
    voice_vosk_runtime::spawn_voice_vosk_start(Arc::clone(state), vosk_cfg, resource_dir);
}
