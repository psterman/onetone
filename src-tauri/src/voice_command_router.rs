//! Unified voice command router: engines report detections; business lives here.
//!
//! M2: cooldown timers still live in each runtime; this module owns kind routing
//! (wake / summon / end / cancel / keyword) so SAPI/Vosk/KWS share one entry.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::voice_end_runtime::{
    handle_cancel_phrase, handle_end_phrase, handle_voice_wake_detected, session_state,
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
    Keyword,
}

impl VoiceDetectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wake => "wake",
            Self::Summon => "summon",
            Self::End => "end",
            Self::Cancel => "cancel",
            Self::Keyword => "keyword",
        }
    }

    pub fn from_keyword_kind(kind: VoiceKeywordKind) -> Self {
        match kind {
            VoiceKeywordKind::Wake => Self::Wake,
            VoiceKeywordKind::Summon => Self::Summon,
            VoiceKeywordKind::End => Self::End,
            VoiceKeywordKind::Cancel => Self::Cancel,
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
            if !crate::voice_end_runtime::is_start_phrase(&state.cfg.lock(), phrase) {
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
