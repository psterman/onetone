//! Runtime integration for Vosk offline voice wake.

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::config::{
    save_config, vosk_grammar_phrases, vosk_preset_default_phrases, vosk_preset_model_path,
    VoiceVoskConfig,
};
use crate::voice_vosk::{
    probe_vosk_resources, shutdown_sync, start_voice_vosk, stop_voice_vosk, VoiceVoskEvent,
    VoskResourceProbe,
};
use crate::AppState;

fn next_vosk_epoch(state: &AppState) -> u64 {
    state.voice_vosk_epoch.fetch_add(1, Ordering::SeqCst) + 1
}

fn vosk_epoch_matches(state: &AppState, epoch: u64) -> bool {
    state.voice_vosk_epoch.load(Ordering::SeqCst) == epoch
}

/// Stop on a background thread (IPC-safe). Invalidates in-flight start workers.
pub fn spawn_voice_vosk_stop(state: Arc<AppState>) {
    let epoch = next_vosk_epoch(state.as_ref());
    let _ = epoch;
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
    *state.voice_vosk_cooldown_until.lock() = None;
    *state.voice_vosk_last_error.lock() = String::new();
    let handle = state.voice_vosk.lock().take();
    if let Some(handle) = handle {
        *state.voice_vosk_state.lock() = "stopping".into();
        std::thread::Builder::new()
            .name("voice-vosk-stop".into())
            .spawn(move || {
                stop_voice_vosk(handle);
                *state.voice_vosk_state.lock() = "stopped".into();
            })
            .ok();
    } else {
        *state.voice_vosk_state.lock() = "stopped".into();
    }
}

/// Block until the worker exits. Background start threads only.
fn voice_vosk_stop_sync(state: &AppState) {
    if let Some(handle) = state.voice_vosk.lock().take() {
        shutdown_sync(handle);
    }
    *state.voice_vosk_state.lock() = "stopped".into();
}

pub fn voice_vosk_start(
    state: &AppState,
    cfg: &VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
    epoch: u64,
) -> Result<(), String> {
    if !vosk_epoch_matches(state, epoch) {
        return Ok(());
    }

    // Release mic level monitor so WASAPI default capture can reopen cleanly.
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
    voice_vosk_stop_sync(state);
    clear_vosk_recognition_state(state);

    if !vosk_epoch_matches(state, epoch) {
        return Ok(());
    }

    let probe = probe_vosk_resources(cfg, resource_dir.as_deref());
    *state.voice_vosk_probe.lock() = Some(probe);

    match start_voice_vosk(
        cfg.clone(),
        resource_dir,
        vosk_grammar_phrases(&state.cfg.lock()),
    ) {
        Ok(handle) => {
            if !vosk_epoch_matches(state, epoch) {
                stop_voice_vosk(handle);
                return Ok(());
            }
            *state.voice_vosk.lock() = Some(handle);
            *state.voice_vosk_last_error.lock() = String::new();
            *state.voice_vosk_state.lock() = "starting".into();
            Ok(())
        }
        Err(e) => {
            if vosk_epoch_matches(state, epoch) {
                *state.voice_vosk_last_error.lock() = e.clone();
                *state.voice_vosk_state.lock() = "error".into();
            }
            Err(e)
        }
    }
}

pub fn spawn_voice_vosk_start(
    state: Arc<AppState>,
    cfg: VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
) {
    let epoch = next_vosk_epoch(state.as_ref());
    *state.voice_vosk_state.lock() = "starting".into();
    *state.voice_vosk_last_error.lock() = String::new();
    std::thread::Builder::new()
        .name("voice-vosk-start".into())
        .spawn(move || {
            if let Err(e) = voice_vosk_start(state.as_ref(), &cfg, resource_dir, epoch) {
                eprintln!("voice_vosk background start failed: {e}");
            }
        })
        .ok();
}

/// End-phrase changes apply live from config; only grammar mode needs a Vosk reload.
pub fn maybe_restart_vosk_for_grammar(state: Arc<AppState>, resource_dir: Option<PathBuf>) {
    let cfg = {
        let lock = state.cfg.lock();
        if !lock.voice_vosk.enabled {
            return;
        }
        lock.voice_vosk.clone()
    };
    if *state.voice_vosk_grammar_mode.lock() != Some(true) {
        return;
    }
    spawn_voice_vosk_start(state, cfg, resource_dir);
}

pub fn voice_vosk_stop(state: &AppState) {
    if let Some(handle) = state.voice_vosk.lock().take() {
        stop_voice_vosk(handle);
    }
    *state.voice_vosk_state.lock() = "stopped".into();
}

fn clear_vosk_recognition_state(state: &AppState) {
    *state.voice_vosk_last_partial.lock() = String::new();
    *state.voice_vosk_last_final.lock() = String::new();
    *state.voice_vosk_last_skip.lock() = String::new();
    *state.voice_vosk_last_detected_phrase.lock() = String::new();
    *state.voice_vosk_last_error.lock() = String::new();
    *state.voice_vosk_grammar_mode.lock() = None;
    *state.voice_vosk_model_load_time_ms.lock() = None;
}

fn tick_cooldown_state(state: &AppState) {
    let mut current = state.voice_vosk_state.lock();
    if *current == "error" || *current == "stopped" || *current == "stopping" {
        return;
    }

    let cooldown = state.voice_vosk_cooldown_until.lock();
    if let Some(until) = *cooldown {
        if Instant::now() < until {
            if *current != "cooldown" && *current != "triggered" {
                *current = "cooldown".into();
            }
            return;
        }
    }
    drop(cooldown);

    if state.voice_vosk.lock().is_some() {
        if *current != "starting" {
            *current = "listening".into();
        }
    }
}

fn emit_vosk_mic_level(app: &AppHandle, state: &AppState, level: u32) {
    let payload = serde_json::json!({
        "type": "mic_level",
        "deviceId": "",
        "level": level,
    });
    crate::ipc::emit_to_main_if_available(app, Some(state), payload);
}

pub fn drain_voice_vosk_events(state: &Arc<AppState>, app: &AppHandle) {
    let events: Vec<VoiceVoskEvent> = {
        let guard = state.voice_vosk.lock();
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
            VoiceVoskEvent::StateChanged(s) => {
                if s == "stopped" || s == "error" {
                    state.mic_level.clear();
                    emit_vosk_mic_level(app, state.as_ref(), 0);
                }
                *state.voice_vosk_state.lock() = s.clone();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_STATE_CHANGED,
                    &format!("vosk state: {s}"),
                    Some(serde_json::json!({ "engine": "vosk", "state": s })),
                );
            }
            VoiceVoskEvent::Error(e) => {
                state.mic_level.clear();
                emit_vosk_mic_level(app, state.as_ref(), 0);
                *state.voice_vosk_last_error.lock() = e.clone();
                *state.voice_vosk_state.lock() = "error".into();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_ERROR,
                    &format!("vosk error: {e}"),
                    Some(serde_json::json!({ "engine": "vosk", "error": e })),
                );
                crate::tray::refresh_menu(app);
            }
            VoiceVoskEvent::Level { level } => {
                state.mic_level.set("", level);
                emit_vosk_mic_level(app, state.as_ref(), level);
            }
            VoiceVoskEvent::Partial(text) => {
                *state.voice_vosk_last_partial.lock() = text;
            }
            VoiceVoskEvent::Final(text) => {
                *state.voice_vosk_last_final.lock() = text.clone();
                crate::voice_end_runtime::try_match_end_phrase_on_final(state, app, &text);
            }
            VoiceVoskEvent::GrammarMode { grammar, note } => {
                *state.voice_vosk_grammar_mode.lock() = Some(grammar);
                *state.voice_vosk_last_skip.lock() = note;
            }
            VoiceVoskEvent::ModelLoaded { load_time_ms } => {
                *state.voice_vosk_model_load_time_ms.lock() = Some(load_time_ms);
            }
            VoiceVoskEvent::Detected { phrase, text } => {
                if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                    *state.voice_vosk_last_skip.lock() = reason.into();
                    *state.voice_vosk_last_trigger.lock() = String::new();
                    continue;
                }
                let is_start = {
                    let cfg = state.cfg.lock();
                    crate::voice_end_runtime::is_start_phrase(&cfg, &phrase)
                };
                if !is_start {
                    continue;
                }
                *state.voice_vosk_last_detected_phrase.lock() = phrase.clone();
                *state.voice_vosk_last_final.lock() = text;
                process_detected(state, app, &phrase);
            }
        }
    }

    tick_cooldown_state(state);
}

fn process_detected(state: &Arc<AppState>, app: &AppHandle, phrase: &str) {
    let (target_key, duration_ms, cooldown_ms) = {
        let cfg = state.cfg.lock();
        (
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_vosk.target_key),
            cfg.key_press_duration_ms,
            cfg.voice_vosk.cooldown_ms,
        )
    };

    if *state.paused.lock() {
        *state.voice_vosk_last_skip.lock() = "监听已暂停，请先在上方点「恢复」。".into();
        *state.voice_vosk_last_trigger.lock() = String::new();
        return;
    }

    if let Some(remain_ms) =
        crate::voice_end_runtime::wake_key_cooldown_remaining_ms(state, cooldown_ms)
    {
        *state.voice_vosk_last_skip.lock() = format!("防连按冷却中，请 {remain_ms} ms 后再说。");
        *state.voice_vosk_last_trigger.lock() = String::new();
        *state.voice_vosk_state.lock() = "cooldown".into();
        return;
    }

    let now = Instant::now();
    *state.voice_vosk_cooldown_until.lock() =
        Some(now + Duration::from_millis(crate::voice_end_runtime::wake_key_gap_ms(cooldown_ms)));

    let state2 = Arc::clone(state);
    let app2 = app.clone();
    let phrase2 = phrase.to_string();
    std::thread::spawn(move || {
        if crate::send_guard::is_active() {
            *state2.voice_vosk_last_skip.lock() = "等待上一轮快捷键发送完成。".into();
        }
        if !crate::send_guard::wait_until_inactive(800) {
            *state2.voice_vosk_last_skip.lock() = "快捷键发送通道忙，请再说一次。".into();
            *state2.voice_vosk_last_trigger.lock() = String::new();
            return;
        }
        let sent = crate::voice_end_runtime::send_wake_to_target(
            Some(state2.as_ref()),
            Some(&app2),
            &target_key,
            duration_ms,
        );
        *state2.voice_vosk_state.lock() = if sent {
            "triggered".into()
        } else {
            "error".into()
        };
        if !sent {
            *state2.voice_vosk_last_error.lock() = format!("快捷键发送失败：{target_key}");
            *state2.voice_vosk_last_trigger.lock() = String::new();
            crate::runtime_event::publish_runtime_event(
                Some(&app2),
                state2.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_SEND_FAILED,
                &format!("vosk send failed: {target_key}"),
                Some(serde_json::json!({ "engine": "vosk", "key": target_key })),
            );
        } else {
            *state2.voice_vosk_last_error.lock() = String::new();
            *state2.voice_vosk_last_skip.lock() = String::new();
            *state2.voice_vosk_last_trigger.lock() = format!("{target_key}（命中「{phrase2}」）");
            let mapping_id = {
                let cfg = state2.cfg.lock();
                crate::voice_end_runtime::resolve_wake_mapping_id(&cfg)
            };
            crate::voice_end_runtime::enter_dictating(
                &state2,
                Some(&app2),
                &mapping_id,
                "vosk wake",
            );
            crate::runtime_event::publish_runtime_event(
                Some(&app2),
                state2.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_WAKE_TRIGGERED,
                &format!("vosk wake triggered: {target_key} (phrase: {phrase2})"),
                Some(serde_json::json!({ "engine": "vosk", "key": target_key, "phrase": phrase2 })),
            );
            crate::tray::refresh_menu(&app2);
        }

        let label = if sent {
            "voice_vosk"
        } else {
            "voice_vosk_send_failed"
        };
        let cue = if sent { "voice_wake" } else { "send_fail" };
        let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), cue);
        crate::ipc::push_runtime_via_app(&app2, state2.as_ref(), label, "", sound_cue.as_deref());
    });
}

pub fn voice_vosk_status(state: &AppState, resource_dir: Option<PathBuf>) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let probe = cached_vosk_probe(state, &cfg.voice_vosk, resource_dir.as_deref());
    let target_key =
        crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_vosk.target_key);
    serde_json::json!({
        "enabled": cfg.voice_vosk.enabled,
        "state": state.voice_vosk_state.lock().clone(),
        "lastError": state.voice_vosk_last_error.lock().clone(),
        "lastPartial": state.voice_vosk_last_partial.lock().clone(),
        "lastFinal": state.voice_vosk_last_final.lock().clone(),
        "lastSkip": state.voice_vosk_last_skip.lock().clone(),
        "lastTrigger": state.voice_vosk_last_trigger.lock().clone(),
        "lastDetectedPhrase": state.voice_vosk_last_detected_phrase.lock().clone(),
        "phrases": cfg.voice_vosk.phrases.clone(),
        "targetKey": target_key,
        "cooldownMs": cfg.voice_vosk.cooldown_ms,
        "modelPath": probe.model_path,
        "modelPreset": probe.model_preset,
        "resolvedModelPath": probe.resolved_model_path,
        "resolvedDllPath": probe.resolved_dll_path,
        "modelExists": probe.model_exists,
        "dllExists": probe.dll_exists,
        "libExists": probe.lib_exists,
        "grammarMode": state.voice_vosk_grammar_mode.lock().clone(),
        "modelLoadTimeMs": state.voice_vosk_model_load_time_ms.lock().clone(),
    })
}

fn cached_vosk_probe(
    state: &AppState,
    cfg: &VoiceVoskConfig,
    resource_dir: Option<&std::path::Path>,
) -> VoskResourceProbe {
    if let Some(probe) = state.voice_vosk_probe.lock().clone() {
        return probe;
    }
    let probe = probe_vosk_resources(cfg, resource_dir);
    *state.voice_vosk_probe.lock() = Some(probe.clone());
    probe
}

pub fn refresh_vosk_probe_cache(state: &AppState, resource_dir: Option<&std::path::Path>) {
    let cfg = state.cfg.lock().voice_vosk.clone();
    *state.voice_vosk_probe.lock() = Some(probe_vosk_resources(&cfg, resource_dir));
}

fn stop_sapi_engine(state: &Arc<AppState>) {
    crate::voice_sapi_runtime::voice_sapi_stop(state);
    *state.voice_sapi_cooldown_until.lock() = None;
}

pub fn voice_vosk_set_enabled(
    state: &Arc<AppState>,
    _window: &WebviewWindow,
    enabled: bool,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.enabled = enabled;
        if enabled {
            cfg.voice_sapi.enabled = false;
        }
        cfg.normalize();
        save_config(&cfg);
    }

    if enabled {
        *state.voice_vosk_state.lock() = "starting".into();
        *state.voice_vosk_last_error.lock() = String::new();
        let state2 = Arc::clone(state);
        let resource_dir_bg = resource_dir.clone();
        std::thread::Builder::new()
            .name("voice-vosk-enable".into())
            .spawn(move || {
                stop_sapi_engine(&state2);
                let cfg = state2.cfg.lock().voice_vosk.clone();
                spawn_voice_vosk_start(state2, cfg, resource_dir_bg);
            })
            .ok();
    } else {
        spawn_voice_vosk_stop(Arc::clone(state));
        let state2 = Arc::clone(state);
        let resource_dir2 = resource_dir.clone();
        std::thread::Builder::new()
            .name("voice-vosk-probe".into())
            .spawn(move || {
                refresh_vosk_probe_cache(state2.as_ref(), resource_dir2.as_deref());
            })
            .ok();
    }

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_phrases(
    state: &Arc<AppState>,
    phrases: Vec<String>,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let cleaned = clean_phrases(phrases);
    let enabled = {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.phrases = if cleaned.is_empty() {
            vec!["开始输入".into()]
        } else {
            cleaned
        };
        cfg.normalize();
        save_config(&cfg);
        cfg.voice_vosk.enabled
    };

    if enabled {
        let cfg = state.cfg.lock().voice_vosk.clone();
        spawn_voice_vosk_start(Arc::clone(state), cfg, resource_dir.clone());
    }

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_model_preset(
    state: &Arc<AppState>,
    preset: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let preset = preset.trim().to_string();
    if preset.is_empty() {
        return Err("model preset is empty".into());
    }
    if preset != "custom" && vosk_preset_model_path(&preset).is_none() {
        return Err(format!("unknown model preset: {preset}"));
    }

    let enabled = {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.model_preset = preset.clone();
        if preset != "custom" {
            if let Some(path) = vosk_preset_model_path(&preset) {
                cfg.voice_vosk.model_path = path.to_string();
            }
            if let Some(phrases) = vosk_preset_default_phrases(&preset) {
                cfg.voice_vosk.phrases = phrases;
            }
        }
        cfg.normalize();
        save_config(&cfg);
        cfg.voice_vosk.enabled
    };

    if enabled {
        let cfg = state.cfg.lock().voice_vosk.clone();
        spawn_voice_vosk_start(Arc::clone(state), cfg, resource_dir.clone());
    }

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_model_path(
    state: &Arc<AppState>,
    path: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("model path is empty".into());
    }

    let enabled = {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.model_preset = "custom".into();
        cfg.voice_vosk.model_path = path;
        cfg.normalize();
        save_config(&cfg);
        cfg.voice_vosk.enabled
    };

    if enabled {
        let cfg = state.cfg.lock().voice_vosk.clone();
        spawn_voice_vosk_start(Arc::clone(state), cfg, resource_dir.clone());
    }

    Ok(voice_vosk_status(state, resource_dir))
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

pub fn voice_vosk_test_send(state: &AppState, window: &WebviewWindow) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "paused",
        });
    }
    if *state.recording.lock() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "recording",
        });
    }

    let (key, duration_ms) = {
        let cfg = state.cfg.lock();
        (
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_vosk.target_key),
            cfg.key_press_duration_ms,
        )
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "no_target",
        });
    }

    if !crate::key_chord::chord_is_sendable(key.trim()) {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
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
        "type": "mvp_voice_vosk_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
    })
}
