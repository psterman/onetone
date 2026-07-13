//! Runtime integration for SAPI voice wake: start/stop, event drain, cooldown.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::config::{save_config, VoiceSapiConfig};
use crate::voice_sapi::{start_voice_sapi, stop_voice_sapi, VoiceSapiEvent};
use crate::AppState;

pub fn voice_sapi_start(state: &AppState, cfg: &VoiceSapiConfig) -> Result<(), String> {
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
    voice_sapi_stop(state);

    match start_voice_sapi(cfg.clone()) {
        Ok(handle) => {
            *state.voice_sapi.lock() = Some(handle);
            *state.voice_sapi_last_error.lock() = String::new();
            // Worker emits listening before returning; bootstrap may consume that event.
            *state.voice_sapi_state.lock() = "listening".into();
            Ok(())
        }
        Err(e) => {
            *state.voice_sapi_last_error.lock() = e.clone();
            *state.voice_sapi_state.lock() = "error".into();
            Err(e)
        }
    }
}

pub fn voice_sapi_stop(state: &AppState) {
    if let Some(handle) = state.voice_sapi.lock().take() {
        stop_voice_sapi(handle);
    }
    *state.voice_sapi_state.lock() = "stopped".into();
}

fn tick_cooldown_state(state: &AppState) {
    let mut current = state.voice_sapi_state.lock();
    if *current == "error" || *current == "stopped" {
        return;
    }

    let cooldown = state.voice_sapi_cooldown_until.lock();
    if let Some(until) = *cooldown {
        if Instant::now() < until {
            if *current != "cooldown" && *current != "triggered" {
                *current = "cooldown".into();
            }
            return;
        }
    }
    drop(cooldown);

    if state.voice_sapi.lock().is_some() {
        *current = "listening".into();
    }
}

/// Drain SAPI events and apply cooldown tick. Always runs (not blocked by paused/send_guard).
pub fn drain_voice_sapi_events(state: &Arc<AppState>, app: &AppHandle) {
    let events: Vec<VoiceSapiEvent> = {
        let guard = state.voice_sapi.lock();
        let Some(handle) = guard.as_ref() else {
            tick_cooldown_state(state);
            return;
        };
        let mut out = Vec::new();
        while let Some(ev) = handle.try_recv() {
            out.push(ev);
        }
        out
    };

    for ev in events {
        match ev {
            VoiceSapiEvent::StateChanged(s) => {
                *state.voice_sapi_state.lock() = s.clone();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_STATE_CHANGED,
                    &format!("sapi state: {s}"),
                    Some(serde_json::json!({ "engine": "sapi", "state": s })),
                );
            }
            VoiceSapiEvent::Error(e) => {
                *state.voice_sapi_last_error.lock() = e.clone();
                *state.voice_sapi_state.lock() = "error".into();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_ERROR,
                    &format!("sapi error: {e}"),
                    Some(serde_json::json!({ "engine": "sapi", "error": e })),
                );
                crate::tray::refresh_menu(app);
            }
            VoiceSapiEvent::Heard {
                text,
                confidence: _,
                final_result,
            } => {
                *state.voice_sapi_last_heard.lock() = if final_result {
                    text
                } else {
                    format!("{text}（还在听…）")
                };
            }
            VoiceSapiEvent::Trace(message) => {
                *state.voice_sapi_last_skip.lock() = message;
            }
            VoiceSapiEvent::Detected {
                phrase,
                confidence,
                exact,
            } => {
                if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                    *state.voice_sapi_last_skip.lock() = reason.into();
                    *state.voice_sapi_last_trigger.lock() = String::new();
                    continue;
                }
                process_detected(state, app, &phrase, confidence, exact);
            }
        }
    }

    tick_cooldown_state(state);
}

fn process_detected(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrase: &str,
    confidence: f32,
    exact: bool,
) {
    let (min_confidence, _target_key, duration_ms, cooldown_ms) = {
        let cfg = state.cfg.lock();
        (
            cfg.voice_sapi.min_confidence,
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_sapi.target_key),
            cfg.key_press_duration_ms,
            cfg.voice_sapi.cooldown_ms,
        )
    };

    if confidence < min_confidence && !exact {
        *state.voice_sapi_last_skip.lock() =
            "听清了，但灵敏度设得太高。试试把下方滑块往左调一点。".into();
        *state.voice_sapi_last_trigger.lock() = String::new();
        return;
    }

    // paused = pause all key output including voice wake (events still drain).
    if *state.paused.lock() {
        *state.voice_sapi_last_skip.lock() = "监听已暂停，请先在上方点「恢复」。".into();
        *state.voice_sapi_last_trigger.lock() = String::new();
        return;
    }

    if let Some(remain_ms) =
        crate::voice_end_runtime::wake_key_cooldown_remaining_ms(state, cooldown_ms)
    {
        *state.voice_sapi_last_skip.lock() = format!("防连按冷却中，请 {remain_ms} ms 后再说。");
        *state.voice_sapi_last_trigger.lock() = String::new();
        *state.voice_sapi_state.lock() = "cooldown".into();
        return;
    }

    let now = Instant::now();
    *state.voice_sapi_cooldown_until.lock() =
        Some(now + Duration::from_millis(crate::voice_end_runtime::wake_key_gap_ms(cooldown_ms)));

    let state2 = Arc::clone(state);
    let app2 = app.clone();
    let phrase2 = phrase.to_string();
    std::thread::spawn(move || {
        if crate::send_guard::is_active() {
            *state2.voice_sapi_last_skip.lock() = "等待上一轮快捷键发送完成。".into();
        }
        if !crate::send_guard::wait_until_inactive(800) {
            *state2.voice_sapi_last_skip.lock() = "快捷键发送通道忙，请再说一次。".into();
            *state2.voice_sapi_last_trigger.lock() = String::new();
            return;
        }
        let result = crate::voice_end_runtime::handle_voice_wake_detected(
            &state2,
            &app2,
            &phrase2,
            duration_ms,
            "sapi",
        );
        *state2.voice_sapi_state.lock() = if result.ok {
            "triggered".into()
        } else {
            "error".into()
        };
        if !result.ok {
            *state2.voice_sapi_last_error.lock() = format!("快捷键发送失败：{}", result.target_key);
            *state2.voice_sapi_last_trigger.lock() = String::new();
        } else {
            *state2.voice_sapi_last_error.lock() = String::new();
            *state2.voice_sapi_last_skip.lock() = String::new();
            if result.used_summon_workflow {
                *state2.voice_sapi_last_trigger.lock() =
                    format!("{}（召唤「{}」）", result.target_key, phrase2);
            } else {
                *state2.voice_sapi_last_trigger.lock() = format!("{}", result.target_key);
            }
        }

        let cue = if result.ok { "voice_wake" } else { "send_fail" };
        let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), cue);
        crate::ipc::push_runtime_via_app(
            &app2,
            state2.as_ref(),
            &result.runtime_label,
            "",
            sound_cue.as_deref(),
        );
    });
}

pub fn voice_sapi_status(state: &AppState) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let target_key =
        crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_sapi.target_key);
    serde_json::json!({
        "enabled": cfg.voice_sapi.enabled,
        "state": state.voice_sapi_state.lock().clone(),
        "lastError": state.voice_sapi_last_error.lock().clone(),
        "lastHeard": state.voice_sapi_last_heard.lock().clone(),
        "lastSkip": state.voice_sapi_last_skip.lock().clone(),
        "lastTrigger": state.voice_sapi_last_trigger.lock().clone(),
        "phrases": crate::voice_end_runtime::idle_wake_phrases(&cfg),
        "targetKey": target_key,
        "cooldownMs": cfg.voice_sapi.cooldown_ms,
        "minConfidence": cfg.voice_sapi.min_confidence,
    })
}

fn sapi_state_is_busy(state: &str) -> bool {
    matches!(
        state,
        "starting" | "listening" | "cooldown" | "triggered" | "stopping"
    )
}

/// Startup bootstrap: start SAPI runtime only. Does not change config or save_config.
pub fn bootstrap_voice_sapi_if_needed(state: &Arc<AppState>) -> bool {
    let cfg = state.cfg.lock().voice_sapi.clone();
    start_voice_sapi_runtime_only(state, cfg, "bootstrap")
}

pub fn bootstrap_voice_sapi_if_needed_with_config(
    state: &Arc<AppState>,
    cfg: VoiceSapiConfig,
) -> bool {
    start_voice_sapi_runtime_only(state, cfg, "bootstrap")
}

/// Start SAPI runtime from explicit config. Does not save_config or mutate enabled flags.
pub fn start_voice_sapi_runtime_only(
    state: &Arc<AppState>,
    cfg: VoiceSapiConfig,
    reason: &str,
) -> bool {
    if state.voice_sapi.lock().is_some() {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start sapi ({reason}): handle exists"),
        );
        return false;
    }
    let current = state.voice_sapi_state.lock().clone();
    if sapi_state_is_busy(&current) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start sapi ({reason}): state={current}"),
        );
        return false;
    }

    *state.voice_sapi_state.lock() = "starting".into();
    *state.voice_sapi_last_error.lock() = String::new();
    let state2 = Arc::clone(state);
    let reason_owned = reason.to_string();
    std::thread::Builder::new()
        .name(format!("voice-sapi-{reason}"))
        .spawn(move || {
            crate::voice_vosk_runtime::spawn_voice_vosk_stop(Arc::clone(&state2));
            if let Err(e) = voice_sapi_start(state2.as_ref(), &cfg) {
                *state2.voice_sapi_last_error.lock() = e.clone();
                *state2.voice_sapi_state.lock() = "error".into();
                crate::app_log::log_line(
                    &state2,
                    "voice",
                    &format!("start failed sapi ({reason_owned}): {e}"),
                );
            } else {
                crate::app_log::log_line(
                    &state2,
                    "voice",
                    &format!("sapi runtime started ({reason_owned})"),
                );
            }
            crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state2));
        })
        .ok();
    true
}

pub fn restart_voice_sapi_runtime(state: &Arc<AppState>, cfg: VoiceSapiConfig, reason: &str) {
    crate::app_log::log_line(
        state,
        "voice",
        &format!("voice config changed: sapi restart ({reason})"),
    );
    voice_sapi_stop(state);
    start_voice_sapi_runtime_only(state, cfg, reason);
}

pub fn voice_sapi_set_enabled(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_sapi.enabled = enabled;
        if enabled {
            cfg.voice_vosk.enabled = false;
            cfg.voice_kws.enabled = false;
        }
        crate::config::reconcile_voice_engine_flags(&mut cfg);
        cfg.normalize();
        save_config(&cfg);
    }

    if enabled {
        *state.voice_sapi_state.lock() = "starting".into();
        *state.voice_sapi_last_error.lock() = String::new();
        let state2 = Arc::clone(state);
        std::thread::Builder::new()
            .name("voice-sapi-enable".into())
            .spawn(move || {
                crate::voice_vosk_runtime::spawn_voice_vosk_stop(Arc::clone(&state2));
                crate::voice_kws_runtime::spawn_voice_kws_stop(Arc::clone(&state2));
                let cfg = state2.cfg.lock().voice_sapi.clone();
                if let Err(e) = voice_sapi_start(state2.as_ref(), &cfg) {
                    eprintln!("voice_sapi start: {e}");
                    let mut cfg = state2.cfg.lock();
                    cfg.voice_sapi.enabled = false;
                    cfg.normalize();
                    save_config(&cfg);
                    *state2.voice_sapi_last_error.lock() = e;
                    *state2.voice_sapi_state.lock() = "error".into();
                }
                crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state2));
            })
            .ok();
    } else {
        voice_sapi_stop(state);
        *state.voice_sapi_cooldown_until.lock() = None;
        *state.voice_sapi_last_error.lock() = String::new();
        *state.voice_sapi_state.lock() = "stopped".into();
        crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
    }

    crate::tray::refresh_tray_tooltip(window.app_handle(), state.as_ref());
    Ok(voice_sapi_status(state))
}

pub fn voice_sapi_set_phrases(
    state: &Arc<AppState>,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    let cleaned = clean_phrases(phrases);
    let enabled = {
        let mut cfg = state.cfg.lock();
        cfg.voice_sapi.phrases = if cleaned.is_empty() {
            vec!["开始输入".into()]
        } else {
            cleaned
        };
        cfg.normalize();
        save_config(&cfg);
        cfg.voice_sapi.enabled
    };

    if enabled {
        let cfg = state.cfg.lock().voice_sapi.clone();
        let state2 = Arc::clone(state);
        std::thread::Builder::new()
            .name("voice-sapi-restart".into())
            .spawn(move || {
                if let Err(e) = voice_sapi_start(state2.as_ref(), &cfg) {
                    eprintln!("voice_sapi restart: {e}");
                }
                crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state2));
            })
            .ok();
    }

    Ok(voice_sapi_status(state))
}

pub fn voice_sapi_set_min_confidence(
    state: &Arc<AppState>,
    min_confidence: f32,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_sapi.min_confidence = min_confidence.clamp(0.0, 1.0);
        cfg.normalize();
        save_config(&cfg);
    }
    Ok(voice_sapi_status(state))
}

fn clean_phrases(phrases: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for phrase in phrases {
        let p = phrase.trim();
        if p.is_empty() {
            continue;
        }
        if !out.iter().any(|x: &String| x == p) {
            out.push(p.to_string());
        }
    }
    out
}

pub fn voice_sapi_test_send(state: &AppState, window: &WebviewWindow) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "paused",
        });
    }
    if *state.recording.lock() {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "recording",
        });
    }

    let (key, duration_ms) = {
        let cfg = state.cfg.lock();
        (
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_sapi.target_key),
            cfg.key_press_duration_ms,
        )
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "no_target",
        });
    }

    if !crate::key_chord::chord_is_sendable(key.trim()) {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "invalid_key",
            "key": key,
        });
    }

    let ok = crate::voice_end_runtime::send_wake_to_target(
        Some(state),
        Some(&window.app_handle()),
        &key,
        duration_ms,
    );
    serde_json::json!({
        "type": "mvp_voice_sapi_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
    })
}
