//! Unified command dispatch for keyword spotting engines (KWS stub + future native).

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config::VoiceConfig;
use crate::voice_end_runtime::{
    handle_cancel_phrase, handle_end_phrase, handle_voice_wake_detected, idle_wake_phrases,
    matches_cancel_phrase, matches_end_phrase, session_state,
};
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VoiceKeywordKind {
    Wake,
    End,
    Cancel,
    Summon,
    Custom,
}

impl VoiceKeywordKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wake => "wake",
            Self::End => "end",
            Self::Cancel => "cancel",
            Self::Summon => "summon",
            Self::Custom => "custom",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceKeywordDetection {
    pub phrase: String,
    pub keyword: String,
    pub kind: VoiceKeywordKind,
}

#[derive(Debug, Clone, Default)]
pub struct VoiceKeywordDispatchResult {
    pub handled: bool,
    pub skipped: bool,
    pub skip_reason: String,
    pub trigger_label: String,
}

pub fn classify_voice_keyword(cfg: &VoiceConfig, phrase: &str) -> VoiceKeywordKind {
    let text = phrase.trim();
    if text.is_empty() {
        return VoiceKeywordKind::Custom;
    }

    if let Some(effective) = crate::scene_config::resolve_idle_effective_scene(cfg) {
        if matches_cancel_phrase(
            text,
            &effective.cancel_phrases.zh,
            &effective.cancel_phrases.en,
        )
        .is_some()
        {
            return VoiceKeywordKind::Cancel;
        }
        if matches_end_phrase(text, &effective.end_phrases.zh, &effective.end_phrases.en).is_some()
        {
            return VoiceKeywordKind::End;
        }
        for p in &effective.summon_phrases {
            if crate::config::phrases_fuzzy_match(text, p) {
                return VoiceKeywordKind::Summon;
            }
        }
    } else {
        let cancel_zh = &cfg.voice_end.cancel_phrases_zh;
        let cancel_en = &cfg.voice_end.cancel_phrases_en;
        if matches_cancel_phrase(text, cancel_zh, cancel_en).is_some() {
            return VoiceKeywordKind::Cancel;
        }
        let end_zh = &cfg.voice_end.phrases_zh;
        let end_en = &cfg.voice_end.phrases_en;
        if matches_end_phrase(text, end_zh, end_en).is_some() {
            return VoiceKeywordKind::End;
        }
    }

    if idle_wake_phrases(cfg)
        .iter()
        .any(|w| crate::config::phrases_fuzzy_match(text, w))
    {
        return VoiceKeywordKind::Wake;
    }

    VoiceKeywordKind::Custom
}

pub fn dispatch_voice_keyword_detected(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    detection: &VoiceKeywordDetection,
) -> VoiceKeywordDispatchResult {
    let session = session_state(state);
    let idle = session == "idle";
    let active = session == "dictating";

    match detection.kind {
        VoiceKeywordKind::Wake | VoiceKeywordKind::Summon => {
            if !idle {
                return skip_result(format!(
                    "会话中忽略 {} 词「{}」",
                    detection.kind.as_str(),
                    detection.phrase
                ));
            }
            if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                return skip_result(reason.into());
            }
            if !crate::voice_end_runtime::is_start_phrase(&state.cfg.lock(), &detection.phrase) {
                return skip_result(format!("未识别的启动词「{}」", detection.phrase));
            }
            dispatch_wake_or_summon(state, app, engine, detection)
        }
        VoiceKeywordKind::End => {
            if !active {
                return skip_result(format!("idle 状态下忽略 end 词「{}」", detection.phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip_result("结束词功能未启用".into());
            }
            handle_end_phrase(state, app, &detection.phrase);
            VoiceKeywordDispatchResult {
                handled: true,
                trigger_label: format!("结束（{}）", detection.phrase),
                ..Default::default()
            }
        }
        VoiceKeywordKind::Cancel => {
            if !active {
                return skip_result(format!("idle 状态下忽略 cancel 词「{}」", detection.phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip_result("结束词功能未启用".into());
            }
            handle_cancel_phrase(state, app, &detection.phrase);
            VoiceKeywordDispatchResult {
                handled: true,
                trigger_label: format!("取消（{}）", detection.phrase),
                ..Default::default()
            }
        }
        VoiceKeywordKind::Custom => skip_result(format!("未归类关键词「{}」", detection.phrase)),
    }
}

fn skip_result(reason: String) -> VoiceKeywordDispatchResult {
    VoiceKeywordDispatchResult {
        skipped: true,
        skip_reason: reason,
        ..Default::default()
    }
}

fn dispatch_wake_or_summon(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    detection: &VoiceKeywordDetection,
) -> VoiceKeywordDispatchResult {
    let (duration_ms, cooldown_ms) = {
        let cfg = state.cfg.lock();
        let cooldown = if engine == "kws" {
            cfg.voice_kws.cooldown_ms
        } else {
            cfg.voice_vosk.cooldown_ms
        };
        (cfg.key_press_duration_ms, cooldown)
    };

    if *state.paused.lock() {
        return skip_result("监听已暂停，请先在上方点「恢复」。".into());
    }

    if let Some(remain_ms) =
        crate::voice_end_runtime::wake_key_cooldown_remaining_ms(state, cooldown_ms)
    {
        return skip_result(format!("防连按冷却中，请 {remain_ms} ms 后再说。"));
    }

    let now = Instant::now();
    if engine == "kws" {
        *state.voice_kws_cooldown_until.lock() =
            Some(now + Duration::from_millis(crate::voice_end_runtime::wake_key_gap_ms(cooldown_ms)));
    }

    if crate::send_guard::is_active() && !crate::send_guard::wait_until_inactive(800) {
        return skip_result("快捷键发送通道忙，请再说一次。".into());
    }

    let result = handle_voice_wake_detected(state, app, &detection.phrase, duration_ms, engine);

    let trigger_label = if result.ok {
        if result.used_summon_workflow {
            format!("{}（召唤「{}」）", result.target_key, detection.phrase)
        } else {
            format!("{}（命中「{}」）", result.target_key, detection.phrase)
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

    VoiceKeywordDispatchResult {
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
    use crate::config::VoiceConfig;

    #[test]
    fn classify_wake_end_cancel() {
        let cfg = VoiceConfig::default();
        assert_eq!(
            classify_voice_keyword(&cfg, "开始输入"),
            VoiceKeywordKind::Wake
        );
        assert_eq!(
            classify_voice_keyword(&cfg, "发出去"),
            VoiceKeywordKind::End
        );
        assert_eq!(
            classify_voice_keyword(&cfg, "取消输入"),
            VoiceKeywordKind::Cancel
        );
    }

    #[test]
    fn classify_uses_scene_override_end_phrases() {
        use crate::config::{PhraseBundle, VoiceOverride};

        let mut cfg = VoiceConfig::default();
        let scene_id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == scene_id) {
            m.voice_override = Some(VoiceOverride {
                end_phrases: Some(PhraseBundle {
                    zh: vec!["情景结束".into()],
                    en: vec![],
                }),
                ..Default::default()
            });
        }
        assert_eq!(
            classify_voice_keyword(&cfg, "情景结束"),
            VoiceKeywordKind::End
        );
    }
}
