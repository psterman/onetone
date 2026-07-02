//! Voice dictation session: end-phrase detection and stop/commit key simulation.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::WebviewWindow;

use crate::config::VoiceConfig;
use crate::voice_vosk::{matches_final, normalize_phrase};
use crate::AppState;

pub fn can_enter_dictating(cfg: &VoiceConfig) -> bool {
    cfg.voice_end.enabled && cfg.voice_vosk.enabled
}

pub fn session_state(state: &AppState) -> String {
    state.voice_session_state.lock().clone()
}

pub fn wake_phrase_skip_reason(state: &AppState) -> Option<&'static str> {
    match session_state(state).as_str() {
        "stopping" => Some("正在结束上一轮听写，请稍候再说。"),
        "committing" => Some("正在等待上一轮上屏，请稍候再说。"),
        "sent" => Some("上一轮刚发送完成，请稍候再说。"),
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
    cfg.active_mappings()
        .first()
        .map(|m| m.id.clone())
        .unwrap_or_default()
}

/// Voice wake should press the same shortcut as the active key-mapping scheme.
pub fn resolve_wake_target_key(cfg: &VoiceConfig, fallback: &str) -> String {
    if let Some(m) = cfg.active_mappings().first() {
        let key = m.target_key.trim();
        if !key.is_empty() {
            return key.to_string();
        }
    }
    if let Some(m) = cfg
        .mappings
        .iter()
        .find(|m| crate::config::mapping_is_complete(m))
    {
        let key = m.target_key.trim();
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

fn resolve_stop_target_key(cfg: &VoiceConfig, session_mapping_id: &str) -> String {
    if !session_mapping_id.is_empty() {
        if let Some(m) = cfg.find_mapping_by_id(session_mapping_id) {
            if !m.target_key.trim().is_empty() {
                return m.target_key.clone();
            }
        }
    }
    let fallback = cfg.voice_end.target_key.trim();
    if fallback.is_empty() {
        "RAlt".into()
    } else {
        fallback.to_string()
    }
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
    window: &WebviewWindow,
    target_key: &str,
    duration_ms: u32,
) -> bool {
    let restored = crate::keyboard::restore_external_foreground();
    if restored {
        std::thread::sleep(Duration::from_millis(50));
    } else {
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
    let sent = crate::keyboard::send_chord(target_key, duration_ms);
    if sent {
        if let Some(s) = state {
            mark_voice_wake_key_sent(s);
        }
    }
    if !restored {
        std::thread::sleep(Duration::from_millis(60));
        let _ = window.run_on_main_thread({
            let w = window.clone();
            move || {
                let _ = w.show();
            }
        });
    }
    sent
}

pub fn enter_dictating(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    reason: &str,
) {
    if !can_enter_dictating(&state.cfg.lock()) {
        return;
    }
    if session_state(state) == "dictating" {
        *state.voice_session_started_at.lock() = Some(Instant::now());
        *state.voice_session_last_action.lock() = reason.to_string();
        return;
    }
    bump_commit_token(state);
    *state.voice_session_state.lock() = "dictating".into();
    *state.voice_session_started_at.lock() = Some(Instant::now());
    *state.voice_session_mapping_id.lock() = mapping_id.to_string();
    *state.voice_session_last_end_phrase.lock() = String::new();
    *state.voice_session_last_action.lock() = reason.to_string();
    // Session UI is polled via cmd_voice_end_status; avoid push_runtime here to reduce UI churn.
    let _ = window;
}

pub fn reset_voice_session(state: &Arc<AppState>, window: &WebviewWindow, reason: &str) {
    bump_commit_token(state);
    *state.voice_session_state.lock() = "idle".into();
    *state.voice_session_started_at.lock() = None;
    *state.voice_session_mapping_id.lock() = String::new();
    *state.voice_session_last_action.lock() = reason.to_string();
    let _ = window;
}

pub fn maybe_timeout_dictation(state: &Arc<AppState>, window: &WebviewWindow) {
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
    reset_voice_session(state, window, "dictation timeout");
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

pub fn text_matches_wake_phrase(cfg: &VoiceConfig, text: &str) -> bool {
    matches_final(text, &cfg.voice_vosk.phrases).is_some()
}

pub fn try_match_end_phrase_on_final(state: &Arc<AppState>, window: &WebviewWindow, text: &str) {
    if !should_match_end_phrase(state) {
        return;
    }
    let (phrases_zh, phrases_en) = {
        let cfg = state.cfg.lock();
        if !cfg.voice_end.enabled {
            return;
        }
        if text_matches_wake_phrase(&cfg, text) {
            return;
        }
        (
            cfg.voice_end.phrases_zh.clone(),
            cfg.voice_end.phrases_en.clone(),
        )
    };
    if let Some(phrase) = matches_end_phrase(text, &phrases_zh, &phrases_en) {
        handle_end_phrase(state, window, &phrase);
    }
}

pub fn is_start_phrase(cfg: &VoiceConfig, phrase: &str) -> bool {
    let norm = normalize_end_text(phrase);
    cfg.voice_vosk.phrases.iter().any(|p| {
        let np = normalize_end_text(p);
        !np.is_empty() && (norm == np || norm.contains(&np))
    })
}

pub fn handle_end_phrase(state: &Arc<AppState>, window: &WebviewWindow, phrase: &str) {
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

    let (target_key, duration_ms, commit_delay_ms, commit_key, auto_send, cooldown_ms) = {
        let cfg = state.cfg.lock();
        let mapping_id = state.voice_session_mapping_id.lock().clone();
        (
            resolve_stop_target_key(&cfg, &mapping_id),
            cfg.key_press_duration_ms,
            cfg.voice_end.commit_delay_ms,
            cfg.voice_end.commit_key.clone(),
            cfg.voice_end.auto_send_enabled,
            cfg.voice_vosk.cooldown_ms,
        )
    };

    let session_mapping_id = state.voice_session_mapping_id.lock().clone();
    *state.voice_session_state.lock() = "stopping".into();
    let token = bump_commit_token(state);
    *state.voice_session_last_end_phrase.lock() = phrase.to_string();

    let state2 = Arc::clone(state);
    let window2 = window.clone();
    let phrase2 = phrase.to_string();
    std::thread::spawn(move || {
        let sent = crate::keyboard::send_chord(&target_key, duration_ms);
        if !sent {
            *state2.voice_session_state.lock() = "error".into();
            *state2.voice_session_last_action.lock() =
                format!("targetKey send failed: {target_key}");
            let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_fail");
            crate::ipc::push_runtime_with_cue(
                state2.as_ref(),
                &window2,
                "send_failed",
                &session_mapping_id,
                sound_cue.as_deref(),
            );
            return;
        }

        *state2.voice_session_state.lock() = "committing".into();
        *state2.voice_session_last_action.lock() = "sent targetKey to stop dictation".into();
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

        if auto_send {
            let duration = state2.cfg.lock().key_press_duration_ms;
            let ok = crate::keyboard::send_chord(&commit_key, duration);
            if ok {
                *state2.voice_session_state.lock() = "sent".into();
                *state2.voice_session_last_action.lock() = "commitKey sent".into();
                let sound_cue =
                    crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_success");
                crate::ipc::push_runtime_with_cue(
                    state2.as_ref(),
                    &window2,
                    "voice_commit_sent",
                    &mapping_snapshot,
                    sound_cue.as_deref(),
                );
            } else {
                *state2.voice_session_state.lock() = "error".into();
                *state2.voice_session_last_action.lock() =
                    format!("commitKey send failed: {commit_key}");
                let sound_cue = crate::config::runtime_sound_cue(&state2.cfg.lock(), "send_fail");
                crate::ipc::push_runtime_with_cue(
                    state2.as_ref(),
                    &window2,
                    "send_failed",
                    &mapping_snapshot,
                    sound_cue.as_deref(),
                );
            }
            std::thread::sleep(Duration::from_millis(500));
        } else {
            *state2.voice_session_last_action.lock() = "auto send disabled".into();
        }

        if *state2.voice_session_commit_token.lock() == token {
            *state2.voice_session_state.lock() = "idle".into();
            *state2.voice_session_started_at.lock() = None;
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
        "commitDelayMs": cfg.voice_end.commit_delay_ms,
        "commitKey": cfg.voice_end.commit_key,
        "autoSendEnabled": cfg.voice_end.auto_send_enabled,
        "dictationTimeoutMs": cfg.voice_end.dictation_timeout_ms,
        "targetKey": cfg.voice_end.target_key,
    })
}

pub fn voice_end_set_enabled(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    enabled: bool,
) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.enabled = enabled;
        cfg.normalize();
        crate::config::save_config(&cfg);
    }
    if !enabled {
        reset_voice_session(state, window, "voice end disabled");
    }
    voice_end_status(state)
}

pub fn voice_end_set_auto_send(state: &Arc<AppState>, enabled: bool) -> serde_json::Value {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.auto_send_enabled = enabled;
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
    fn end_phrase_zh_match() {
        let zh = vec!["结束输入".into()];
        let en: Vec<String> = vec![];
        assert_eq!(
            matches_end_phrase("结束输入", &zh, &en),
            Some("结束输入".into())
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
    fn wake_text_does_not_match_end() {
        use crate::config::VoiceConfig;

        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.phrases = vec!["start dictation".into()];
        assert!(text_matches_wake_phrase(&cfg, "startdictating startsdictation"));
        let en = vec!["end dictation".into(), "send it".into()];
        assert_eq!(
            matches_end_phrase("startdictating startsdictation", &[], &en),
            None
        );
    }

    #[test]
    fn wake_target_prefers_active_mapping() {
        use crate::config::{MappingEntry, TriggerMode, VoiceConfig, new_mapping_id};

        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![MappingEntry {
            id: new_mapping_id(),
            label: "test".into(),
            group: "默认".into(),
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
        }];
        assert_eq!(resolve_wake_target_key(&cfg, "RAlt"), "Win+H".to_string());
    }
}
