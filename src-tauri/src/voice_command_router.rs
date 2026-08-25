//! Unified voice command router: engines report detections; business lives here.
//!
//! M2: cooldown timers still live in each runtime; this module owns kind routing
//! (wake / summon / end / cancel / keyword) so SAPI/Vosk/KWS share one entry.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::voice_end_runtime::{
    handle_cancel_phrase, handle_end_phrase, handle_send_phrase, handle_voice_wake_detected,
    session_state,
};
use crate::voice_keyword_dispatch::VoiceKeywordKind;
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VoiceDetectionKind {
    Wake,
    Summon,
    End,
    Cancel,
    Send,
    Keyword,
}

impl VoiceDetectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wake => "wake",
            Self::Summon => "summon",
            Self::End => "end",
            Self::Cancel => "cancel",
            Self::Send => "send",
            Self::Keyword => "keyword",
        }
    }

    pub fn from_keyword_kind(kind: VoiceKeywordKind) -> Self {
        match kind {
            VoiceKeywordKind::Wake => Self::Wake,
            VoiceKeywordKind::Summon => Self::Summon,
            VoiceKeywordKind::End => Self::End,
            VoiceKeywordKind::Cancel => Self::Cancel,
            VoiceKeywordKind::Send => Self::Send,
            VoiceKeywordKind::Custom => Self::Keyword,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDetection {
    pub engine: String,
    pub kind: VoiceDetectionKind,
    pub text: String,
    pub confidence: Option<f32>,
    pub matched_phrase: String,
    pub timestamp_ms: u64,
}

impl VoiceDetection {
    pub fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn wake(engine: &str, phrase: &str, confidence: Option<f32>) -> Self {
        let phrase = phrase.trim().to_string();
        Self {
            engine: engine.to_string(),
            kind: VoiceDetectionKind::Wake,
            text: phrase.clone(),
            confidence,
            matched_phrase: phrase,
            timestamp_ms: Self::now_ms(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct VoiceCommandRouterResult {
    pub handled: bool,
    pub skipped: bool,
    pub skip_reason: String,
    pub trigger_label: String,
}

/// Single business entry for all wake engines.
/// Cooldown / confidence gates stay in the calling runtime (M2).
pub fn handle_detection(
    state: &Arc<AppState>,
    app: &AppHandle,
    detection: &VoiceDetection,
) -> VoiceCommandRouterResult {
    let session = session_state(state);
    let idle = session == "idle";
    let active = session == "dictating";
    let phrase = if detection.matched_phrase.trim().is_empty() {
        detection.text.trim()
    } else {
        detection.matched_phrase.trim()
    };

    // Cursor beginner: route before Send/Cancel/Wake gates (「发送」等也是全局 send/cancel 词).
    if let Some(result) = try_route_cursor_beginner_voice(state, app, &detection.engine, phrase) {
        return result;
    }

    match detection.kind {
        VoiceDetectionKind::Wake | VoiceDetectionKind::Summon => {
            if !idle {
                return skip(format!(
                    "会话中忽略 {} 词「{}」",
                    detection.kind.as_str(),
                    phrase
                ));
            }
            if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                return skip(reason.into());
            }
            if !crate::voice_end_runtime::is_start_phrase(&state.cfg.lock(), phrase)
                && !(crate::cursor_beginner::probe_ok()
                    && crate::cursor_beginner::is_beginner_voice_phrase(phrase))
            {
                return skip(format!("未识别的启动词「{}」", phrase));
            }
            dispatch_wake_or_summon(state, app, &detection.engine, phrase)
        }
        VoiceDetectionKind::End => {
            if !active {
                return skip(format!("idle 状态下忽略 end 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            handle_end_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("结束（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Send => {
            if !active {
                return skip(format!("idle 状态下忽略 send 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            let mode = state.cfg.lock().voice_end.send_mode.clone();
            if !matches!(mode.trim().to_ascii_lowercase().as_str(), "phrase" | "auto") {
                return skip(format!("sendMode={} 忽略发送词「{}」", mode, phrase));
            }
            handle_send_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("发送（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Cancel => {
            if !active {
                return skip(format!("idle 状态下忽略 cancel 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            handle_cancel_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("取消（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Keyword => skip(format!("未归类关键词「{}」", phrase)),
    }
}

fn skip(reason: String) -> VoiceCommandRouterResult {
    VoiceCommandRouterResult {
        skipped: true,
        skip_reason: reason,
        ..Default::default()
    }
}

fn try_route_cursor_beginner_voice(
    state: &Arc<AppState>,
    app: &AppHandle,
    _engine: &str,
    phrase: &str,
) -> Option<VoiceCommandRouterResult> {
    if !crate::cursor_beginner::probe_ok() {
        return None;
    }
    if !crate::cursor_beginner::is_beginner_voice_phrase(phrase) {
        return None;
    }
    // Only intercept when Cursor is actually foreground or user explicitly armed.
    // On OneTone home, let normal routing handle phrases like「麦克风」(wake/dictation).
    if !crate::cursor_beginner::cursor_is_foreground()
        && !crate::cursor_beginner::is_armed()
        && !crate::cursor_beginner::is_arm_phrase(phrase)
    {
        // Habit active + Cursor alive: intercept action phrases (发送/继续/新建) but not mic toggle.
        let habit_ok = {
            let cfg = state.cfg.lock();
            crate::cursor_beginner::cursor_habit_active(&cfg)
        } && crate::cursor_beginner::probe_ok();
        let is_mic_phrase = crate::cursor_beginner::matches_beginner_phrase(phrase)
            .is_some_and(|d| d.slot_id == "pushToTalk");
        if !habit_ok || is_mic_phrase {
            return None;
        }
    }
    if *state.paused.lock() {
        return Some(skip("监听已暂停，请先在上方点「恢复」。".into()));
    }
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Some(skip("语音练习台中，仅本页听写测试，不发送快捷键。".into()));
    }
    if crate::send_guard::is_active() && !crate::send_guard::wait_until_inactive(800) {
        return Some(skip("快捷键发送通道忙，请再说一次。".into()));
    }
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let result = crate::cursor_beginner::dispatch_voice_phrase(state, app, phrase)?;
    // Update home page display — beginner phrases bypass the normal lastDetectedPhrase path.
    *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
    *state.voice_vosk_last_final.lock() = phrase.to_string();
    let label = result.runtime_label.clone();
    if result.ok {
        *state.voice_vosk_last_trigger.lock() = format!("{}（{}）", label, phrase);
        let sound_cue = crate::config::runtime_sound_cue(&state.cfg.lock(), "voice_wake");
        crate::ipc::push_runtime_via_app(
            app,
            state.as_ref(),
            &label,
            "",
            sound_cue.as_deref(),
        );
        crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
        Some(VoiceCommandRouterResult {
            handled: true,
            trigger_label: format!("{}（{}）", label, phrase),
            ..Default::default()
        })
    } else if label == "cursor_beginner:not_armed" {
        *state.voice_vosk_last_trigger.lock() = String::new();
        Some(skip("请先进入 Cursor 或说「小助手」激活。".into()))
    } else {
        *state.voice_vosk_last_trigger.lock() = String::new();
        Some(VoiceCommandRouterResult {
            handled: false,
            skipped: true,
            skip_reason: format!("Cursor 操作未执行（{}）", label),
            trigger_label: String::new(),
        })
    }
}

fn dispatch_wake_or_summon(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    phrase: &str,
) -> VoiceCommandRouterResult {
    let duration_ms = state.cfg.lock().key_press_duration_ms;

    if *state.paused.lock() {
        return skip("监听已暂停，请先在上方点「恢复」。".into());
    }
    // QS / habit setup practice: keep ASR for on-screen matching, never fire IME hotkeys
    // (Win+H etc. steals focus and feels like the wizard "exited").
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return skip("语音练习台中，仅本页听写测试，不发送快捷键。".into());
    }

    // Key-gap cooldown is checked/started by the runtime before calling the router.
    // Router still blocks on the shared send channel.
    if crate::send_guard::is_active() && !crate::send_guard::wait_until_inactive(800) {
        return skip("快捷键发送通道忙，请再说一次。".into());
    }

    let result = handle_voice_wake_detected(state, app, phrase, duration_ms, engine);

    let trigger_label = if result.ok {
        if result.used_summon_workflow {
            format!("{}（召唤「{}」）", result.target_key, phrase)
        } else {
            format!("{}（命中「{}」）", result.target_key, phrase)
        }
    } else {
        String::new()
    };

    if result.ok {
        let cue = "voice_wake";
        let sound_cue = crate::config::runtime_sound_cue(&state.cfg.lock(), cue);
        crate::ipc::push_runtime_via_app(
            app,
            state.as_ref(),
            &result.runtime_label,
            "",
            sound_cue.as_deref(),
        );
    } else {
        crate::agent_attention::emit_sound_event("voice.wake_failed", "voice.wake_failed");
    }

    VoiceCommandRouterResult {
        handled: result.ok,
        skipped: !result.ok,
        skip_reason: if result.ok {
            String::new()
        } else {
            format!("快捷键发送失败：{}", result.target_key)
        },
        trigger_label,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_maps_from_keyword_kind() {
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::Wake),
            VoiceDetectionKind::Wake
        );
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::Custom),
            VoiceDetectionKind::Keyword
        );
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::End),
            VoiceDetectionKind::End
        );
    }

    #[test]
    fn wake_builder_fills_fields() {
        let d = VoiceDetection::wake("vosk", "开始输入", Some(0.9));
        assert_eq!(d.engine, "vosk");
        assert_eq!(d.kind, VoiceDetectionKind::Wake);
        assert_eq!(d.matched_phrase, "开始输入");
        assert_eq!(d.confidence, Some(0.9));
    }
}
