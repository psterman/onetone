//! Voice dictation session: end-phrase detection and stop/commit key simulation.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, WebviewWindow};

use crate::config::VoiceConfig;
use crate::voice_vosk::{matches_final, normalize_phrase};
use crate::AppState;

pub fn can_enter_dictating(cfg: &VoiceConfig) -> bool {
    cfg.voice_end.enabled
        && (cfg.voice_vosk.enabled || cfg.voice_sapi.enabled || cfg.voice_kws.enabled)
}

pub fn session_state(state: &AppState) -> String {
    state.voice_session_state.lock().clone()
}

pub fn wake_phrase_skip_reason(state: &AppState) -> Option<&'static str> {
    match session_state(state).as_str() {
        "stopping" => Some("\u{6b63}\u{5728}\u{7ed3}\u{675f}\u{4e0a}\u{4e00}\u{8f6e}\u{542c}\u{5199}\u{ff0c}\u{8bf7}\u{7a0d}\u{5019}\u{518d}\u{8bf4}\u{3002}"),
        "committing" => Some("\u{6b63}\u{5728}\u{7b49}\u{5f85}\u{4e0a}\u{4e00}\u{8f6e}\u{4e0a}\u{5c4f}\u{ff0c}\u{8bf7}\u{7a0d}\u{5019}\u{518d}\u{8bf4}\u{3002}"),
        "sent" => Some("\u{4e0a}\u{4e00}\u{8f6e}\u{521a}\u{53d1}\u{9001}\u{5b8c}\u{6210}\u{ff0c}\u{8bf7}\u{7a0d}\u{5019}\u{518d}\u{8bf4}\u{3002}"),
        _ => None,
    }
}

pub fn should_match_end_phrase(state: &AppState) -> bool {
    session_state(state) == "dictating"
}

fn bump_commit_token(state: &AppState) -> u64 {
    let mut token = state.voice_session_commit_token.lock();
    *token += 1;
    *token
}

pub fn resolve_wake_mapping_id(cfg: &VoiceConfig) -> String {
    cfg.active_scene_id.clone()
}

/// Idle wake/stop target from effective scene (Rule A).
pub fn resolve_wake_target_key(cfg: &VoiceConfig, fallback: &str) -> String {
    if let Some(eff) = crate::scene_config::resolve_idle_effective_scene(cfg) {
        let key = eff.target_key.trim();
        if !key.is_empty() {
            return key.to_string();
        }
    }
    let fb = fallback.trim();
    if fb.is_empty() {
        "RAlt".into()
    } else {
        fb.to_string()
    }
}

/// IME / voice-engine shortcut for activating dictation in the foreground app.
/// Unlike `resolve_wake_target_key`, this never falls back to mapping `target_key`
/// (which for Cursor schemes may be Ctrl+L/Ctrl+I, not the voice shortcut).
pub fn resolve_voice_input_target_key(cfg: &VoiceConfig) -> Option<String> {
    let vosk_key = cfg.voice_vosk.target_key.trim();
    let sapi_key = cfg.voice_sapi.target_key.trim();

    if cfg.voice_vosk.enabled && !vosk_key.is_empty() {
        return Some(vosk_key.to_string());
    }
    if cfg.voice_sapi.enabled && !sapi_key.is_empty() {
        return Some(sapi_key.to_string());
    }
    if !vosk_key.is_empty() {
        return Some(vosk_key.to_string());
    }
    if !sapi_key.is_empty() {
        return Some(sapi_key.to_string());
    }
    None
}

fn resolve_stop_target_key(cfg: &VoiceConfig, session_mapping_id: &str) -> String {
    let ctx = crate::scene_config::SceneResolveContext {
        active_scene_id: session_mapping_id,
    };
    if let Some(eff) = crate::scene_config::resolve_effective_scene(cfg, &ctx) {
        let key = eff.target_key.trim();
        if !key.is_empty() {
            return key.to_string();
        }
    }
    resolve_wake_target_key(cfg, &cfg.voice_end.target_key)
}

fn session_effective(state: &AppState) -> Option<crate::scene_config::EffectiveSceneConfig> {
    state
        .voice_session_snapshot
        .lock()
        .as_ref()
        .map(|s| s.effective.clone())
}

pub fn idle_wake_phrases(cfg: &VoiceConfig) -> Vec<String> {
    crate::scene_config::resolve_idle_effective_scene(cfg)
        .map(|e| e.wake_phrases)
        .unwrap_or_default()
}

/// Wake + summon phrases that may start a voice session (routes differ in dispatch).
pub fn idle_start_phrases(cfg: &VoiceConfig) -> Vec<String> {
    let global = crate::scene_config::global_summon_phrases(cfg);
    let Some(e) = crate::scene_config::resolve_idle_effective_scene(cfg) else {
        return global;
    };
    let mut out = e.wake_phrases;
    out = crate::config::append_unique_phrases(out, &global);
    crate::config::append_unique_phrases(out, &e.summon_phrases)
}

fn status_label(state: &str) -> &'static str {
    match state {
        "dictating" => "正在听写，等待结束词",
        "stopping" => "已按快捷键结束录音",
        "committing" => "等待输入法上屏",
        "sent" => "已发送",
        "error" => "出错",
        _ => "待命",
    }
}

/// Send the user-recorded voice shortcut to the target app, not OneTone itself.
/// Minimum gap between physical wake/stop key sends (toggle keys like RAlt).
pub const MIN_WAKE_KEY_GAP_MS: u64 = 2800;

pub fn wake_key_gap_ms(cooldown_ms: u32) -> u64 {
    cooldown_ms.max(MIN_WAKE_KEY_GAP_MS as u32).max(200) as u64
}

pub fn wake_key_cooldown_remaining_ms(state: &AppState, cooldown_ms: u32) -> Option<u64> {
    let gap = Duration::from_millis(wake_key_gap_ms(cooldown_ms));
    let at = *state.voice_wake_last_key_at.lock();
    let at = at?;
    let elapsed = Instant::now().saturating_duration_since(at);
    if elapsed < gap {
        Some((gap - elapsed).as_millis() as u64)
    } else {
        None
    }
}

pub fn mark_voice_wake_key_sent(state: &AppState) {
    *state.voice_wake_last_key_at.lock() = Some(Instant::now());
}

pub fn send_wake_to_target(
    state: Option<&AppState>,
    app: Option<&AppHandle>,
    target_key: &str,
    duration_ms: u32,
) -> bool {
    let restored = crate::keyboard::restore_external_foreground();
    if restored {
        std::thread::sleep(Duration::from_millis(50));
    } else if let Some(app) = app {
        if let Some(window) = crate::ipc::get_main_window(app) {
            let _ = window.run_on_main_thread({
                let w = window.clone();
                move || {
                    let _ = w.hide();
                }
            });
            std::thread::sleep(Duration::from_millis(80));
            if !crate::keyboard::restore_external_foreground() {
                std::thread::sleep(Duration::from_millis(40));
            }
        }
    }
    let sent = crate::keyboard::send_chord(target_key, duration_ms);
    if sent {
        if let Some(s) = state {
            mark_voice_wake_key_sent(s);
        }
    }
    if !restored {
        std::thread::sleep(Duration::from_millis(60));
        if let Some(app) = app {
            if let Some(window) = crate::ipc::get_main_window(app) {
                let _ = window.run_on_main_thread({
                    let w = window.clone();
                    move || {
                        let _ = w.show();
                    }
                });
            }
        }
    }
    sent
}

pub struct VoiceWakeDispatchResult {
    pub ok: bool,
    pub target_key: String,
    pub mapping_id: String,
    pub used_summon_workflow: bool,
    pub runtime_label: String,
}

fn try_run_summon_workflow(
    state: &Arc<AppState>,
    app: &AppHandle,
    mapping: &crate::config::MappingEntry,
    mapping_id: &str,
    summon_target: &str,
    duration_ms: u32,
) -> Option<String> {
    let window = crate::ipc::get_main_window(app)?;
    if let Some(rule_id) = crate::config::summon_rule_id_from_target(summon_target) {
        let rule = mapping
            .app_behavior_rules
            .iter()
            .find(|r| r.rule_id == rule_id)?;
        return crate::app_chat_workflow::run_for_custom_rule(
            state,
            &window,
            mapping_id,
            rule,
            duration_ms,
        )
        .ok();
    }
    if crate::app_chat_workflow::profile_for(summon_target).is_some() {
        return crate::app_chat_workflow::run_for_target_id(
            state,
            &window,
            mapping_id,
            summon_target,
            duration_ms,
        )
        .ok();
    }
    None
}

pub fn handle_voice_wake_detected(
    state: &Arc<AppState>,
    app: &AppHandle,
    matched_phrase: &str,
    duration_ms: u32,
    engine: &str,
) -> VoiceWakeDispatchResult {
    let (mapping_id, target_key, mapping_snapshot) = {
        let cfg = state.cfg.lock();
        let mapping_id = resolve_wake_mapping_id(&cfg);
        let target_key = resolve_wake_target_key(&cfg, "");
        let mapping = cfg.find_mapping_by_id(&mapping_id).cloned();
        (mapping_id, target_key, mapping)
    };

    let is_generic_wake = {
        let cfg = state.cfg.lock();
        idle_wake_phrases(&cfg)
            .iter()
            .any(|w| crate::config::phrases_fuzzy_match(matched_phrase, w))
    };

    // Prefer app-scenario summon (incl. acoustic command names) over generic wake,
    // so saying 「开始编程」 from the Default home scheme still opens Cursor.
    {
        let global_summon = {
            let cfg = state.cfg.lock();
            crate::scene_config::resolve_global_summon_for_phrase(&cfg, matched_phrase)
        };
        if let Some(gs) = global_summon {
            let summon_mapping = {
                let cfg = state.cfg.lock();
                cfg.find_mapping_by_id(&gs.mapping_id).cloned()
            };
            if let Some(mapping) = summon_mapping {
                if let Some(label) = try_run_summon_workflow(
                    state,
                    app,
                    &mapping,
                    &gs.mapping_id,
                    &gs.target,
                    duration_ms,
                ) {
                    {
                        let mut cfg = state.cfg.lock();
                        cfg.set_active_scenario(&gs.mapping_id);
                    }
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_WAKE_TRIGGERED,
                        &format!(
                            "{engine} global summon: {} -> {} ({})",
                            gs.phrase, gs.target, gs.mapping_id
                        ),
                        Some(serde_json::json!({
                            "engine": engine,
                            "phrase": matched_phrase,
                            "appTargetId": gs.target,
                            "mappingId": gs.mapping_id,
                            "workflow": true,
                            "global": true,
                            "preferSummon": true
                        })),
                    );
                    crate::tray::refresh_menu(app);
                    return VoiceWakeDispatchResult {
                        ok: true,
                        target_key: target_key.clone(),
                        mapping_id: gs.mapping_id,
                        used_summon_workflow: true,
                        runtime_label: label,
                    };
                }
            }
        }
    }

    if let Some(mapping) = mapping_snapshot.as_ref() {
        let preset = {
            let cfg = state.cfg.lock();
            crate::scene_config::effective_vosk_model_preset(&cfg, mapping)
        };
        if !is_generic_wake {
            if let Some(summon_target) =
                crate::config::resolve_summon_app_for_phrase(mapping, matched_phrase, &preset)
            {
                if let Some(label) = try_run_summon_workflow(
                    state,
                    app,
                    mapping,
                    &mapping_id,
                    &summon_target,
                    duration_ms,
                ) {
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_WAKE_TRIGGERED,
                        &format!(
                            "{engine} summon workflow: {summon_target} ({matched_phrase})"
                        ),
                        Some(serde_json::json!({
                            "engine": engine,
                            "phrase": matched_phrase,
                            "appTargetId": summon_target,
                            "workflow": true
                        })),
                    );
                    crate::tray::refresh_menu(app);
                    return VoiceWakeDispatchResult {
                        ok: true,
                        target_key: target_key.clone(),
                        mapping_id,
                        used_summon_workflow: true,
                        runtime_label: label,
                    };
                }
            }
        }
    }

    if is_generic_wake {
        if let Some(mapping) = mapping_snapshot.as_ref() {
            if let Some(summon_target) = crate::config::resolve_mapping_summon_target(mapping) {
                if let Some(label) = try_run_summon_workflow(
                    state,
                    app,
                    mapping,
                    &mapping_id,
                    &summon_target,
                    duration_ms,
                ) {
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state.as_ref(),
                        "voice",
                        crate::runtime_event::kind::VOICE_WAKE_TRIGGERED,
                        &format!(
                            "{engine} app-target wake: {summon_target} ({matched_phrase})"
                        ),
                        Some(serde_json::json!({
                            "engine": engine,
                            "phrase": matched_phrase,
                            "appTargetId": mapping.app_target_id,
                            "summonTarget": summon_target,
                            "mappingId": mapping_id,
                            "workflow": true,
                            "primaryAppTarget": true
                        })),
                    );
                    crate::tray::refresh_menu(app);
                    return VoiceWakeDispatchResult {
                        ok: true,
                        target_key: target_key.clone(),
                        mapping_id,
                        used_summon_workflow: true,
                        runtime_label: label,
                    };
                }
            }
        }
    }

    let sent = send_wake_to_target(Some(state.as_ref()), Some(app), &target_key, duration_ms);
    if sent {
        enter_dictating(state, Some(app), &mapping_id, &format!("{engine} wake"));
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "voice",
            crate::runtime_event::kind::VOICE_WAKE_TRIGGERED,
            &format!("{engine} wake triggered: {target_key} (phrase: {matched_phrase})"),
            Some(serde_json::json!({
                "engine": engine,
                "key": target_key,
                "phrase": matched_phrase
            })),
        );
        crate::tray::refresh_menu(app);
    } else {
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "voice",
            crate::runtime_event::kind::VOICE_SEND_FAILED,
            &format!("{engine} send failed: {target_key}"),
            Some(serde_json::json!({ "engine": engine, "key": target_key })),
        );
    }

    VoiceWakeDispatchResult {
        ok: sent,
        target_key,
        mapping_id,
        used_summon_workflow: false,
        runtime_label: if sent {
            format!("voice_{engine}")
        } else {
            format!("voice_{engine}_send_failed")
        },
    }
}

/// Acoustic scene command hit: select scenario and open/focus the mapped app + start voice.
pub fn handle_acoustic_scene_command(
    state: &Arc<AppState>,
    app: &AppHandle,
    scenario_id: &str,
    command_id: &str,
    score: f64,
) -> VoiceWakeDispatchResult {
    let mapping = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(scenario_id).cloned()
    };
    let Some(mapping) = mapping else {
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "acoustic",
            "acoustic_voice_matched",
            "acoustic match: mapping missing",
            Some(serde_json::json!({
                "scenarioId": scenario_id,
                "commandId": command_id,
                "score": score,
                "ok": false,
                "reason": "mapping_missing"
            })),
        );
        return VoiceWakeDispatchResult {
            ok: false,
            target_key: String::new(),
            mapping_id: scenario_id.to_string(),
            used_summon_workflow: false,
            runtime_label: "acoustic_mapping_missing".into(),
        };
    };

    {
        let mut cfg = state.cfg.lock();
        cfg.set_active_scenario(scenario_id);
    }

    let primary_app = mapping.app_target_id.trim().to_string();
    let summon_target = crate::config::resolve_mapping_summon_target(&mapping)
        .unwrap_or_else(|| primary_app.clone());
    let duration_ms = 280u32;
    let mut used_workflow = false;
    let mut runtime_label = String::new();
    let mut target_key = {
        let cfg = state.cfg.lock();
        resolve_wake_target_key(&cfg, "")
    };

    if !summon_target.is_empty() {
        if let Some(label) = try_run_summon_workflow(
            state,
            app,
            &mapping,
            scenario_id,
            &summon_target,
            duration_ms,
        ) {
            used_workflow = true;
            runtime_label = label;
        }
    }

    let ok = if used_workflow {
        true
    } else {
        // No app-chat profile: fall back to wake-key / dictation entry for the active scene.
        let sent = send_wake_to_target(Some(state.as_ref()), Some(app), &target_key, duration_ms);
        if sent {
            enter_dictating(state, Some(app), scenario_id, "acoustic command");
            runtime_label = format!("acoustic_key_{target_key}");
        } else {
            runtime_label = "acoustic_summon_failed".into();
        }
        sent
    };

    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "acoustic",
        "acoustic_voice_matched",
        &format!(
            "acoustic command matched -> {} (score={score:.3}, workflow={used_workflow})",
            if summon_target.is_empty() {
                target_key.as_str()
            } else {
                summon_target.as_str()
            }
        ),
        Some(serde_json::json!({
            "scenarioId": scenario_id,
            "commandId": command_id,
            "score": score,
            "appTargetId": primary_app,
            "summonTarget": summon_target,
            "workflow": used_workflow,
            "ok": ok,
            "runtimeLabel": runtime_label
        })),
    );
    crate::tray::refresh_menu(app);

    VoiceWakeDispatchResult {
        ok,
        target_key,
        mapping_id: scenario_id.to_string(),
        used_summon_workflow: used_workflow,
        runtime_label,
    }
}

pub fn enter_dictating(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    mapping_id: &str,
    reason: &str,
) {
    if !can_enter_dictating(&state.cfg.lock()) {
        return;
    }
    if session_state(state) == "dictating" {
        *state.voice_session_started_at.lock() = Some(Instant::now());
        *state.voice_session_last_action.lock() = reason.to_string();
        refresh_coach_hud(app, state);
        return;
    }
    bump_commit_token(state);
    let scene_id = if mapping_id.trim().is_empty() {
        state.cfg.lock().active_scene_id.clone()
    } else {
        mapping_id.to_string()
    };
    if let Some(snapshot) =
        crate::scene_config::freeze_session_snapshot(&state.cfg.lock(), &scene_id)
    {
        *state.voice_session_snapshot.lock() = Some(snapshot);
    }
    *state.voice_session_state.lock() = "dictating".into();
    *state.voice_session_started_at.lock() = Some(Instant::now());
    *state.voice_session_mapping_id.lock() = scene_id.clone();
    *state.voice_session_last_end_phrase.lock() = String::new();
    *state.voice_session_last_action.lock() = reason.to_string();
    if let Some(app) = app {
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "session",
            crate::runtime_event::kind::SESSION_STARTED,
            reason,
            Some(serde_json::json!({ "mappingId": scene_id })),
        );
        crate::tray::refresh_menu(app);
        refresh_coach_hud(Some(app), state);
    }
}

pub fn reset_voice_session(state: &Arc<AppState>, app: Option<&AppHandle>, reason: &str) {
    bump_commit_token(state);
    *state.voice_session_state.lock() = "idle".into();
    *state.voice_session_started_at.lock() = None;
    *state.voice_session_mapping_id.lock() = String::new();
    *state.voice_session_snapshot.lock() = None;
    *state.voice_session_last_action.lock() = reason.to_string();
    if let Some(app) = app {
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "session",
            crate::runtime_event::kind::SESSION_ENDED,
            reason,
            None,
        );
        crate::tray::refresh_menu(app);
    }
}

pub fn maybe_timeout_dictation(state: &Arc<AppState>, app: &AppHandle) {
    if session_state(state) != "dictating" {
        return;
    }
    let timeout_ms = {
        let cfg = state.cfg.lock();
        if !cfg.voice_end.enabled {
            return;
        }
        cfg.voice_end.dictation_timeout_ms
    };
    let started = *state.voice_session_started_at.lock();
    let Some(started_at) = started else {
        return;
    };
    if started_at.elapsed() < Duration::from_millis(timeout_ms as u64) {
        return;
    }
    reset_voice_session(state, Some(app), "dictation timeout");
}

fn normalize_end_text(text: &str) -> String {
    normalize_phrase(text).to_ascii_lowercase()
}

fn phrase_matches_end(norm_text: &str, phrase: &str) -> bool {
    if norm_text.len() < 3 {
        return false;
    }
    let norm_phrase = normalize_end_text(phrase);
    if norm_phrase.is_empty() {
        return false;
    }
    let lower = phrase.trim().to_ascii_lowercase();
    if lower == "send" {
        return norm_text == "send" || norm_text.contains("sendit");
    }
    if lower == "done" || lower == "finish" {
        return norm_text == norm_phrase;
    }
    norm_text == norm_phrase || norm_text.contains(&norm_phrase)
}

pub fn matches_end_phrase(
    text: &str,
    phrases_zh: &[String],
    phrases_en: &[String],
) -> Option<String> {
    let norm = normalize_end_text(text);
    if norm.len() < 3 {
        return None;
    }
    let mut best: Option<(String, usize)> = None;
    for phrase in phrases_zh.iter().chain(phrases_en) {
        if phrase_matches_end(&norm, phrase) {
            let len = normalize_end_text(phrase).len();
            if best.as_ref().is_none_or(|(_, best_len)| len > *best_len) {
                best = Some((phrase.clone(), len));
            }
        }
    }
    best.map(|(phrase, _)| phrase)
}

pub fn matches_cancel_phrase(
    text: &str,
    phrases_zh: &[String],
    phrases_en: &[String],
) -> Option<String> {
    matches_end_phrase(text, phrases_zh, phrases_en)
}

pub fn matches_send_phrase(
    text: &str,
    phrases_zh: &[String],
    phrases_en: &[String],
) -> Option<String> {
    matches_end_phrase(text, phrases_zh, phrases_en)
}

pub fn text_matches_wake_phrase(cfg: &VoiceConfig, text: &str) -> bool {
    matches_final(text, &idle_wake_phrases(cfg)).is_some()
}

pub fn text_matches_wake_phrases(phrases: &[String], text: &str) -> bool {
    matches_final(text, phrases).is_some()
}

fn send_mode_allows_phrase(mode: &str) -> bool {
    matches!(mode.trim().to_ascii_lowercase().as_str(), "phrase" | "auto")
}

pub fn try_match_session_phrase_on_final(state: &Arc<AppState>, app: &AppHandle, text: &str) {
    if !should_match_end_phrase(state) {
        return;
    }
    let (cancel_zh, cancel_en, send_zh, send_en, end_zh, end_en, wake_phrases, send_mode) = {
        let cfg = state.cfg.lock();
        if !cfg.voice_end.enabled {
            crate::app_log::log_line(
                state,
                "voice",
                "session phrase match skipped: voice_end disabled",
            );
            return;
        }
        let send_mode = cfg.voice_end.send_mode.clone();
        let snapshot = state.voice_session_snapshot.lock();
        let Some(snap) = snapshot.as_ref() else {
            crate::app_log::log_line(
                state,
                "voice",
                "session phrase match skipped: no session snapshot",
            );
            return;
        };
        (
            snap.effective.cancel_phrases.zh.clone(),
            snap.effective.cancel_phrases.en.clone(),
            snap.effective.send_phrases.zh.clone(),
            snap.effective.send_phrases.en.clone(),
            snap.effective.end_phrases.zh.clone(),
            snap.effective.end_phrases.en.clone(),
            snap.effective.wake_phrases.clone(),
            send_mode,
        )
    };
    if text_matches_wake_phrases(&wake_phrases, text) {
        return;
    }
    if let Some(phrase) = matches_cancel_phrase(text, &cancel_zh, &cancel_en) {
        handle_cancel_phrase(state, app, &phrase);
        return;
    }
    if send_mode_allows_phrase(&send_mode) {
        if let Some(phrase) = matches_send_phrase(text, &send_zh, &send_en) {
            handle_send_phrase(state, app, &phrase);
            return;
        }
    }
    if let Some(phrase) = matches_end_phrase(text, &end_zh, &end_en) {
        handle_end_phrase(state, app, &phrase);
    }
}

pub fn try_match_end_phrase_on_final(state: &Arc<AppState>, app: &AppHandle, text: &str) {
    try_match_session_phrase_on_final(state, app, text);
}

pub fn is_start_phrase(cfg: &VoiceConfig, phrase: &str) -> bool {
    let norm = normalize_end_text(phrase);
    idle_start_phrases(cfg).iter().any(|p| {
        let np = normalize_end_text(p);
        !np.is_empty() && (norm == np || norm.contains(&np))
    })
}

pub fn stop_dictation_after_trigger_key(state: &Arc<AppState>, app: &AppHandle) {
    if session_state(state) != "dictating" {
        return;
    }
    finish_dictation_session(state, Some(app), "trigger key", CommitPolicy::AutoConfig, true);
}

pub fn cancel_dictation_after_trigger_key(state: &Arc<AppState>, app: &AppHandle) {
    cancel_dictation_session(state, Some(app), "trigger key");
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerWhileDictatingAction {
    Cancelled,
    Stopped,
}

/// True only within `intervalMs` after dictation started (mistake-correction window).
pub fn is_in_trigger_cancel_window(state: &AppState, mapping_id: &str) -> bool {
    if session_state(state) != "dictating" {
        return false;
    }
    let cfg = state.cfg.lock();
    let (interval_ms, _, cancel_enabled, _) = match cfg.find_mapping_by_id(mapping_id) {
        Some(m) => crate::config::mapping_timing(m, &cfg),
        None => (
            cfg.interval_ms,
            cfg.enter_delay_ms,
            cfg.cancel_enabled,
            cfg.auto_enter_enabled,
        ),
    };
    if !cancel_enabled {
        return false;
    }
    let Some(started_at) = *state.voice_session_started_at.lock() else {
        return false;
    };
    started_at.elapsed() < Duration::from_millis(interval_ms.max(200) as u64)
}

pub fn handle_trigger_press_while_dictating(
    state: &Arc<AppState>,
    app: &AppHandle,
    mapping_id: &str,
) -> TriggerWhileDictatingAction {
    if is_in_trigger_cancel_window(state, mapping_id) {
        cancel_dictation_after_trigger_key(state, app);
        TriggerWhileDictatingAction::Cancelled
    } else {
        stop_dictation_after_trigger_key(state, app);
        TriggerWhileDictatingAction::Stopped
    }
}

pub fn ui_cancel_dictation(state: &Arc<AppState>, app: &AppHandle) -> bool {
    if session_state(state) != "dictating" {
        return false;
    }
    cancel_dictation_after_trigger_key(state, app);
    true
}

fn refresh_coach_hud(app: Option<&AppHandle>, state: &AppState) {
    if let Some(app) = app {
        crate::coach_hud::push_state(app, state);
    }
}

pub fn handle_cancel_phrase(state: &Arc<AppState>, app: &AppHandle, phrase: &str) {
    if session_state(state) != "dictating" {
        crate::app_log::log_line(
            state,
            "voice",
            &format!(
                "cancel phrase ignored (session={}): {phrase}",
                session_state(state)
            ),
        );
        return;
    }
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "session",
        crate::runtime_event::kind::CANCEL_PHRASE_MATCHED,
        phrase,
        None,
    );
    crate::app_log::log_line(state, "voice", &format!("cancel phrase matched: {phrase}"));
    cancel_dictation_session(state, Some(app), phrase);
}

fn cancel_dictation_session(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    reason: &str,
) {
    if session_state(state) != "dictating" {
        return;
    }
    if *state.paused.lock() {
        *state.voice_session_last_action.lock() = "skipped: paused".into();
        return;
    }
    if crate::send_guard::is_active() {
        *state.voice_session_last_action.lock() = "skipped: send_guard".into();
        return;
    }

    let _ = bump_commit_token(state);
    let session_mapping_id = state.voice_session_mapping_id.lock().clone();
    *state.voice_session_state.lock() = "idle".into();
    *state.voice_session_started_at.lock() = None;
    *state.voice_session_last_end_phrase.lock() = String::new();
    *state.voice_session_last_action.lock() = format!("cancelled: {reason}");

    crate::keyboard::send_escape();

    if let Some(app) = app {
        crate::ipc::push_runtime_via_app(app, state.as_ref(), "esc", &session_mapping_id, None);
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "session",
            crate::runtime_event::kind::SESSION_ENDED,
            "dictation cancelled",
            None,
        );
        crate::tray::refresh_menu(app);
        refresh_coach_hud(Some(app), state);
    }
}

pub fn handle_end_phrase(state: &Arc<AppState>, app: &AppHandle, phrase: &str) {
    if session_state(state) != "dictating" {
        return;
    }
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "session",
        crate::runtime_event::kind::END_PHRASE_MATCHED,
        phrase,
        None,
    );
    finish_dictation_session(state, Some(app), phrase, CommitPolicy::Never, false);
}

pub fn handle_send_phrase(state: &Arc<AppState>, app: &AppHandle, phrase: &str) {
    if session_state(state) != "dictating" {
        return;
    }
    {
        let cfg = state.cfg.lock();
        if !send_mode_allows_phrase(&cfg.voice_end.send_mode) {
            return;
        }
    }
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "session",
        crate::runtime_event::kind::SEND_PHRASE_MATCHED,
        phrase,
        None,
    );
    finish_dictation_session(state, Some(app), phrase, CommitPolicy::Force, false);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitPolicy {
    Force,
    Never,
    AutoConfig,
}

fn finish_dictation_session(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    phrase: &str,
    policy: CommitPolicy,
    target_key_already_sent: bool,
) {
    if session_state(state) != "dictating" {
        return;
    }
    if *state.paused.lock() {
        *state.voice_session_last_action.lock() = "skipped: paused".into();
        return;
    }
    if crate::send_guard::is_active() {
        *state.voice_session_last_action.lock() = "skipped: send_guard".into();
        return;
    }

    let (target_key, duration_ms, commit_delay_ms, commit_key, should_commit, cooldown_ms) = {
        let Some(eff) = session_effective(state) else {
            *state.voice_session_last_action.lock() = "skipped: no session snapshot".into();
            return;
        };
        let cfg = state.cfg.lock();
        let should_commit = match policy {
            CommitPolicy::Force => true,
            CommitPolicy::Never => false,
            CommitPolicy::AutoConfig => {
                cfg.voice_end.send_mode.trim().eq_ignore_ascii_case("auto")
                    || cfg.voice_end.auto_send_enabled
            }
        };
        (
            eff.target_key,
            cfg.key_press_duration_ms,
            cfg.voice_end.commit_delay_ms,
            cfg.voice_end.commit_key.clone(),
            should_commit,
            cfg.voice_vosk.cooldown_ms,
        )
    };

    let session_mapping_id = state.voice_session_mapping_id.lock().clone();
    *state.voice_session_state.lock() = "stopping".into();
    let token = bump_commit_token(state);
    *state.voice_session_last_end_phrase.lock() = phrase.to_string();

    let state2 = Arc::clone(state);
    let app2 = app.cloned();
    let phrase2 = phrase.to_string();
    std::thread::spawn(move || {
        if !target_key_already_sent {
            let sent = crate::keyboard::send_chord(&target_key, duration_ms);
            if !sent {
                *state2.voice_session_state.lock() = "error".into();
                *state2.voice_session_last_action.lock() =
                    format!("targetKey send failed: {target_key}");
                let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_fail");
                if let Some(ref app) = app2 {
                    crate::ipc::push_runtime_via_app(
                        app,
                        state2.as_ref(),
                        "send_failed",
                        &session_mapping_id,
                        sound_cue.as_deref(),
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state2.as_ref(),
                        "session",
                        crate::runtime_event::kind::VOICE_SEND_FAILED,
                        &format!("session targetKey send failed: {target_key}"),
                        None,
                    );
                }
                return;
            }
        }

        *state2.voice_session_state.lock() = "committing".into();
        *state2.voice_session_last_action.lock() = if target_key_already_sent {
            "trigger key stopped dictation".into()
        } else {
            "sent targetKey to stop dictation".into()
        };
        mark_voice_wake_key_sent(state2.as_ref());

        let now = Instant::now();
        *state2.voice_vosk_cooldown_until.lock() =
            Some(now + Duration::from_millis(wake_key_gap_ms(cooldown_ms)));

        let mapping_snapshot = session_mapping_id.clone();
        std::thread::sleep(Duration::from_millis(commit_delay_ms as u64));

        if *state2.voice_session_commit_token.lock() != token {
            return;
        }
        if session_state(&state2) != "committing" {
            return;
        }
        if *state2.voice_session_mapping_id.lock() != mapping_snapshot {
            return;
        }

        if should_commit {
            let duration = state2.cfg.lock().key_press_duration_ms;
            let ok = crate::keyboard::send_chord(&commit_key, duration);
            if ok {
                *state2.voice_session_state.lock() = "sent".into();
                *state2.voice_session_last_action.lock() = "commitKey sent".into();
                let sound_cue =
                    crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_success");
                if let Some(ref app) = app2 {
                    crate::ipc::push_runtime_via_app(
                        app,
                        state2.as_ref(),
                        "voice_commit_sent",
                        &mapping_snapshot,
                        sound_cue.as_deref(),
                    );
                }
            } else {
                *state2.voice_session_state.lock() = "error".into();
                *state2.voice_session_last_action.lock() =
                    format!("commitKey send failed: {commit_key}");
                let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_fail");
                if let Some(ref app) = app2 {
                    crate::ipc::push_runtime_via_app(
                        app,
                        state2.as_ref(),
                        "send_failed",
                        &mapping_snapshot,
                        sound_cue.as_deref(),
                    );
                    crate::runtime_event::publish_runtime_event(
                        Some(app),
                        state2.as_ref(),
                        "session",
                        crate::runtime_event::kind::VOICE_SEND_FAILED,
                        &format!("session commitKey send failed: {commit_key}"),
                        None,
                    );
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        } else {
            *state2.voice_session_last_action.lock() = "auto send disabled".into();
        }

        if *state2.voice_session_commit_token.lock() == token {
            *state2.voice_session_state.lock() = "idle".into();
            *state2.voice_session_started_at.lock() = None;
            if let Some(ref app) = app2 {
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state2.as_ref(),
                    "session",
                    crate::runtime_event::kind::SESSION_ENDED,
                    "dictation finished",
                    None,
                );
                crate::tray::refresh_menu(app);
                refresh_coach_hud(Some(app), state2.as_ref());
            }
        }
        let _ = phrase2;
    });
}

pub fn test_stop_dictation(state: &Arc<AppState>, _window: &WebviewWindow) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({ "ok": false, "reason": "paused" });
    }
    if crate::send_guard::is_active() {
        return serde_json::json!({ "ok": false, "reason": "send_guard" });
    }
    let (target_key, duration_ms) = {
        let cfg = state.cfg.lock();
        let mapping_id = resolve_wake_mapping_id(&cfg);
        (
            resolve_stop_target_key(&cfg, &mapping_id),
            cfg.key_press_duration_ms,
        )
    };
    let ok = crate::keyboard::send_chord(&target_key, duration_ms);
    serde_json::json!({
        "ok": ok,
        "targetKey": target_key,
        "note": "test stop (no session change)",
    })
}

pub fn test_commit_key(state: &Arc<AppState>, _window: &WebviewWindow) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({ "ok": false, "reason": "paused" });
    }
    if crate::send_guard::is_active() {
        return serde_json::json!({ "ok": false, "reason": "send_guard" });
    }
    let (commit_key, duration_ms) = {
        let cfg = state.cfg.lock();
        (cfg.voice_end.commit_key.clone(), cfg.key_press_duration_ms)
    };
    let ok = crate::keyboard::send_chord(&commit_key, duration_ms);
    serde_json::json!({
        "ok": ok,
        "commitKey": commit_key,
        "note": "test commit (no session change)",
    })
}

pub fn voice_end_status(state: &AppState) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let session = session_state(state);
    let vosk_enabled = cfg.voice_vosk.enabled;
    let voice_end_enabled = cfg.voice_end.enabled;
    let recording_audio_enabled = cfg.sounds.recording_mute_enabled;
    let recording_audio_strength = cfg.sounds.recording_mute_strength.clone();
    let recording_audio_target_scale = cfg.sounds.recording_mute_target_scale();
    serde_json::json!({
        "enabled": voice_end_enabled,
        "voskEnabled": vosk_enabled,
        "voskRequired": voice_end_enabled && !vosk_enabled,
        "state": session,
        "statusLabel": status_label(&session),
        "lastEndPhrase": state.voice_session_last_end_phrase.lock().clone(),
        "lastAction": state.voice_session_last_action.lock().clone(),
        "mappingId": state.voice_session_mapping_id.lock().clone(),
        "phrasesZh": cfg.voice_end.phrases_zh,
        "phrasesEn": cfg.voice_end.phrases_en,
        "cancelPhrasesZh": cfg.voice_end.cancel_phrases_zh,
        "cancelPhrasesEn": cfg.voice_end.cancel_phrases_en,
        "cancelPhrases": {
            "zh": cfg.voice_end.cancel_phrases_zh,
            "en": cfg.voice_end.cancel_phrases_en,
        },
        "sendPhrasesZh": cfg.voice_end.send_phrases_zh,
        "sendPhrasesEn": cfg.voice_end.send_phrases_en,
        "sendMode": cfg.voice_end.send_mode,
        "commitDelayMs": cfg.voice_end.commit_delay_ms,
        "commitKey": cfg.voice_end.commit_key,
        "autoSendEnabled": cfg.voice_end.auto_send_enabled,
        "dictationTimeoutMs": cfg.voice_end.dictation_timeout_ms,
        "targetKey": cfg.voice_end.target_key,
        "recordingAudioEnabled": recording_audio_enabled,
        "recordingAudioStrength": recording_audio_strength,
        "recordingAudioTargetScale": recording_audio_target_scale,
        "recordingAudioActive": crate::audio_win::recording_audio_mute_active(state),
    })
}

pub fn voice_end_set_enabled(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    enabled: bool,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.enabled = enabled;
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    if !enabled {
        reset_voice_session(state, app, "voice end disabled");
    }
    voice_end_status(state)
}

pub fn voice_end_set_auto_send(state: &Arc<AppState>, enabled: bool) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        crate::config::apply_auto_send_to_send_mode(&mut cfg.voice_end, enabled);
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_commit_delay(state: &Arc<AppState>, delay_ms: u32) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.commit_delay_ms = delay_ms.clamp(1000, 10000);
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_commit_key(state: &Arc<AppState>, commit_key: String) -> serde_json::Value {
    let trimmed = commit_key.trim();
    let normalized = if trimmed.eq_ignore_ascii_case("ctrl+enter") {
        "Ctrl+Enter".to_string()
    } else {
        "Enter".to_string()
    };
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.commit_key = normalized;
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_phrases(
    state: &Arc<AppState>,
    phrases_zh: Vec<String>,
    phrases_en: Vec<String>,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.phrases_zh = clean_phrases(phrases_zh);
        cfg.voice_end.phrases_en = clean_phrases(phrases_en);
        if cfg.voice_end.phrases_zh.is_empty() {
            cfg.voice_end.phrases_zh = crate::config::default_voice_end_phrases_zh();
        }
        if cfg.voice_end.phrases_en.is_empty() {
            cfg.voice_end.phrases_en = crate::config::default_voice_end_phrases_en();
        }
        cfg.voice_end.enabled = true;
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_cancel_phrases(
    state: &Arc<AppState>,
    phrases_zh: Vec<String>,
    phrases_en: Vec<String>,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.cancel_phrases_zh = clean_phrases(phrases_zh);
        cfg.voice_end.cancel_phrases_en = clean_phrases(phrases_en);
        if cfg.voice_end.cancel_phrases_zh.is_empty() {
            cfg.voice_end.cancel_phrases_zh = crate::config::default_voice_end_cancel_phrases_zh();
        }
        if cfg.voice_end.cancel_phrases_en.is_empty() {
            cfg.voice_end.cancel_phrases_en = crate::config::default_voice_end_cancel_phrases_en();
        }
        // Configuring cancel phrases implies end-session control should be on.
        cfg.voice_end.enabled = true;
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_send_phrases(
    state: &Arc<AppState>,
    phrases_zh: Vec<String>,
    phrases_en: Vec<String>,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.send_phrases_zh = clean_phrases(phrases_zh);
        cfg.voice_end.send_phrases_en = clean_phrases(phrases_en);
        if cfg.voice_end.send_phrases_zh.is_empty() {
            cfg.voice_end.send_phrases_zh = crate::config::default_voice_end_send_phrases_zh();
        }
        if cfg.voice_end.send_phrases_en.is_empty() {
            cfg.voice_end.send_phrases_en = crate::config::default_voice_end_send_phrases_en();
        }
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
}

pub fn voice_end_set_send_mode(state: &Arc<AppState>, send_mode: String) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        let mode = send_mode.trim().to_ascii_lowercase();
        cfg.voice_end.send_mode = match mode.as_str() {
            "auto" | "phrase" | "confirm" => mode,
            _ => crate::config::default_voice_end_send_mode(),
        };
        crate::config::sync_send_mode_and_auto_send(&mut cfg.voice_end);
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    voice_end_status(state)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn can_enter_dictating_with_kws_only() {
        let mut cfg = crate::config::VoiceConfig::default();
        cfg.voice_end.enabled = true;
        cfg.voice_vosk.enabled = false;
        cfg.voice_sapi.enabled = false;
        cfg.voice_kws.enabled = true;
        assert!(can_enter_dictating(&cfg));
    }

    #[test]
    fn end_phrase_zh_match() {
        let phrase = "\u{53d1}\u{9001}\u{5b8c}\u{6210}";
        let zh = vec![phrase.into()];
        let en: Vec<String> = vec![];
        assert_eq!(
            matches_end_phrase(phrase, &zh, &en),
            Some(phrase.into())
        );
    }

    #[test]
    fn end_phrase_send_strict() {
        let en = vec!["send".into(), "send it".into()];
        let zh: Vec<String> = vec![];
        assert_eq!(matches_end_phrase("sending", &zh, &en), None);
        assert_eq!(
            matches_end_phrase("send it", &zh, &en),
            Some("send it".into())
        );
    }

    #[test]
    fn cancel_phrase_zh_match() {
        let phrase = "\u{53d6}\u{6d88}\u{8f93}\u{5165}";
        let zh = vec![phrase.into()];
        let en: Vec<String> = vec![];
        assert_eq!(
            matches_cancel_phrase(phrase, &zh, &en),
            Some(phrase.into())
        );
    }

    #[test]
    fn cancel_phrase_matches_embedded_utterance() {
        let phrase = "\u{53d6}\u{6d88}\u{8f93}\u{5165}";
        let zh = vec![phrase.into()];
        let en: Vec<String> = vec![];
        let text = "\u{4f60}\u{597d}\u{ff0c}\u{6211}\u{8fd8}\u{5728}\u{60f3}\u{4e00}\u{4e9b}\u{4e1c}\u{897f}\u{53d6}\u{6d88}\u{8f93}\u{5165}\u{3002}";
        assert_eq!(
            matches_cancel_phrase(text, &zh, &en),
            Some(phrase.into())
        );
    }

    #[test]
    fn cancel_phrase_prefers_longer_match() {
        let short = "\u{53d6}\u{6d88}";
        let long = "\u{53d6}\u{6d88}\u{8f93}\u{5165}";
        let zh = vec![short.into(), long.into()];
        let en: Vec<String> = vec![];
        assert_eq!(
            matches_cancel_phrase(long, &zh, &en),
            Some(long.into())
        );
    }

    #[test]
    fn wake_text_does_not_match_end() {
        use crate::config::VoiceConfig;

        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.phrases = vec!["start dictation".into()];
        assert!(text_matches_wake_phrase(
            &cfg,
            "startdictating startsdictation"
        ));
        let en = vec!["end dictation".into(), "send it".into()];
        assert_eq!(
            matches_end_phrase("startdictating startsdictation", &[], &en),
            None
        );
    }

    #[test]
    fn commit_policy_variants() {
        assert_ne!(CommitPolicy::Force, CommitPolicy::Never);
        assert_ne!(CommitPolicy::Never, CommitPolicy::AutoConfig);
        assert_ne!(CommitPolicy::Force, CommitPolicy::AutoConfig);
    }

    #[test]
    fn send_mode_allows_phrase_gate() {
        assert!(!send_mode_allows_phrase("confirm"));
        assert!(send_mode_allows_phrase("phrase"));
        assert!(send_mode_allows_phrase("auto"));
        assert!(!send_mode_allows_phrase(""));
    }

    #[test]
    fn send_phrase_match_separate_from_end_defaults() {
        let cfg = crate::config::VoiceConfig::default();
        assert_eq!(
            matches_send_phrase(
                "发出去",
                &cfg.voice_end.send_phrases_zh,
                &cfg.voice_end.send_phrases_en
            ),
            Some("发出去".into())
        );
        assert_eq!(
            matches_end_phrase(
                "发出去",
                &cfg.voice_end.phrases_zh,
                &cfg.voice_end.phrases_en
            ),
            None
        );
        assert_eq!(
            matches_end_phrase(
                "结束输入",
                &cfg.voice_end.phrases_zh,
                &cfg.voice_end.phrases_en
            ),
            Some("结束输入".into())
        );
    }

    #[test]
    fn wake_target_uses_scene_override() {
        use crate::config::{
            new_mapping_id, MappingEntry, TriggerMode, VoiceConfig, VoiceOverride,
        };

        let mut cfg = VoiceConfig::default();
        let id = cfg.active_scene_id.clone();
        cfg.mappings = vec![MappingEntry {
            id,
            label: "test".into(),
            group: "\u{9ed8}\u{8ba4}".into(),
            trigger_key: "F13".into(),
            target_key: "Win+H".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: Some(VoiceOverride {
                target_key: Some("Win+H".into()),
                wake_phrases: None,
                end_phrases: None,
                ..Default::default()
            }),
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        }];
        assert_eq!(resolve_wake_target_key(&cfg, "RAlt"), "Win+H".to_string());
    }

    #[test]
    fn voice_input_key_uses_engine_not_mapping_target() {
        use crate::config::{new_mapping_id, MappingEntry, TriggerMode, VoiceConfig};

        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.enabled = true;
        cfg.voice_vosk.target_key = "RAlt".into();
        cfg.mappings = vec![MappingEntry {
            id: new_mapping_id(),
            label: "cursor".into(),
            group: "默认".into(),
            trigger_key: "F13".into(),
            target_key: "Ctrl+L".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_target_id: "cursor-chat".into(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        }];
        assert_eq!(
            resolve_voice_input_target_key(&cfg).as_deref(),
            Some("RAlt")
        );
        assert_eq!(resolve_wake_target_key(&cfg, "RAlt"), "RAlt".to_string());
    }
}
