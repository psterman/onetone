//! Runtime integration for SAPI voice wake: start/stop, event drain, cooldown.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::WebviewWindow;

use crate::config::{save_config, VoiceSapiConfig};
use crate::voice_sapi::{start_voice_sapi, stop_voice_sapi, VoiceSapiEvent};
use crate::AppState;

pub fn voice_sapi_start(state: &AppState, cfg: &VoiceSapiConfig) -> Result<(), String> {
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
pub fn drain_voice_sapi_events(state: &Arc<AppState>, window: &WebviewWindow) {
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
                *state.voice_sapi_state.lock() = s;
            }
            VoiceSapiEvent::Error(e) => {
                *state.voice_sapi_last_error.lock() = e;
                *state.voice_sapi_state.lock() = "error".into();
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
                if crate::voice_end_runtime::should_skip_wake_phrase(state) {
                    continue;
                }
                process_detected(state, window, &phrase, confidence, exact);
            }
        }
    }

    tick_cooldown_state(state);
}

fn process_detected(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    _phrase: &str,
    confidence: f32,
    exact: bool,
) {
    let (min_confidence, target_key, duration_ms, cooldown_ms) = {
        let cfg = state.cfg.lock();
        (
            cfg.voice_sapi.min_confidence,
            cfg.voice_sapi.target_key.clone(),
            cfg.key_press_duration_ms,
            cfg.voice_sapi.cooldown_ms,
        )
    };

    if confidence < min_confidence && !exact {
        *state.voice_sapi_last_skip.lock() =
            "听清了，但灵敏度设得太高。试试把下方滑块往左调一点。".into();
        return;
    }

    // send_guard blocks actual key output but we still drain events above.
    if crate::send_guard::is_active() {
        *state.voice_sapi_last_skip.lock() = "正在发送快捷键，请稍候再试。".into();
        return;
    }

    // paused = pause all key output including voice wake (events still drain).
    if *state.paused.lock() {
        *state.voice_sapi_last_skip.lock() = "监听已暂停，请先在上方点「恢复」。".into();
        return;
    }

    let now = Instant::now();
    if let Some(until) = *state.voice_sapi_cooldown_until.lock() {
        if now < until {
            *state.voice_sapi_last_skip.lock() = "说得太快了，等几秒再说一次。".into();
            return;
        }
    }

    let state2 = Arc::clone(state);
    let window2 = window.clone();
    std::thread::spawn(move || {
        let sent = crate::keyboard::send_chord(&target_key, duration_ms);
        let now = Instant::now();
        *state2.voice_sapi_cooldown_until.lock() =
            Some(now + Duration::from_millis(cooldown_ms.max(200) as u64));
        *state2.voice_sapi_state.lock() = if sent {
            "triggered".into()
        } else {
            "error".into()
        };
        if !sent {
            *state2.voice_sapi_last_error.lock() = format!("快捷键发送失败：{target_key}");
        } else {
            *state2.voice_sapi_last_skip.lock() = "已触发语音快捷键。".into();
            let mapping_id = {
                let cfg = state2.cfg.lock();
                crate::voice_end_runtime::resolve_wake_mapping_id(&cfg)
            };
            crate::voice_end_runtime::enter_dictating(&state2, &window2, &mapping_id, "sapi wake");
        }

        let label = if sent {
            "voice_sapi"
        } else {
            "voice_sapi_send_failed"
        };
        let cue = if sent { "voice_wake" } else { "send_fail" };
        let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), cue);
        crate::ipc::push_runtime_with_cue(
            state2.as_ref(),
            &window2,
            label,
            "",
            sound_cue.as_deref(),
        );
    });
}

pub fn voice_sapi_status(state: &AppState) -> serde_json::Value {
    let cfg = state.cfg.lock();
    serde_json::json!({
        "enabled": cfg.voice_sapi.enabled,
        "state": state.voice_sapi_state.lock().clone(),
        "lastError": state.voice_sapi_last_error.lock().clone(),
        "lastHeard": state.voice_sapi_last_heard.lock().clone(),
        "lastSkip": state.voice_sapi_last_skip.lock().clone(),
        "phrases": cfg.voice_sapi.phrases.clone(),
        "targetKey": cfg.voice_sapi.target_key.clone(),
        "cooldownMs": cfg.voice_sapi.cooldown_ms,
        "minConfidence": cfg.voice_sapi.min_confidence,
    })
}

pub fn voice_sapi_set_enabled(
    state: &Arc<AppState>,
    _window: &WebviewWindow,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    if enabled {
        crate::voice_vosk_runtime::disable_vosk_for_sapi(state);
    }

    {
        let mut cfg = state.cfg.lock();
        cfg.voice_sapi.enabled = enabled;
        cfg.normalize();
        save_config(&cfg);
    }

    if enabled {
        let cfg = state.cfg.lock().voice_sapi.clone();
        let state2 = Arc::clone(state);
        std::thread::Builder::new()
            .name("voice-sapi-start".into())
            .spawn(move || {
                if let Err(e) = voice_sapi_start(state2.as_ref(), &cfg) {
                    eprintln!("voice_sapi start: {e}");
                }
            })
            .map_err(|e| format!("spawn voice sapi start: {e}"))?;
    } else {
        voice_sapi_stop(state);
        *state.voice_sapi_cooldown_until.lock() = None;
        *state.voice_sapi_last_error.lock() = String::new();
    }

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

pub fn voice_sapi_test_send(state: &AppState) -> serde_json::Value {
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
        (cfg.voice_sapi.target_key.clone(), cfg.key_press_duration_ms)
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "no_target",
        });
    }

    if crate::key_chord::parse_chord(key.trim()).is_err() {
        return serde_json::json!({
            "type": "mvp_voice_sapi_test_sent",
            "ok": false,
            "reason": "invalid_key",
            "key": key,
        });
    }

    let ok = crate::keyboard::send_chord(&key, duration_ms);
    serde_json::json!({
        "type": "mvp_voice_sapi_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
    })
}
