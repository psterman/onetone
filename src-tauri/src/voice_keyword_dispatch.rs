//! Keyword classification helpers for KWS (and other spotters).
//! Business dispatch goes through [`crate::voice_command_router`].

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config::VoiceConfig;
use crate::voice_command_router::{
    handle_detection, VoiceCommandRouterResult, VoiceDetection, VoiceDetectionKind,
};
use crate::voice_end_runtime::{
    idle_wake_phrases, matches_cancel_phrase, matches_end_phrase,
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

impl From<VoiceCommandRouterResult> for VoiceKeywordDispatchResult {
    fn from(r: VoiceCommandRouterResult) -> Self {
        Self {
            handled: r.handled,
            skipped: r.skipped,
            skip_reason: r.skip_reason,
            trigger_label: r.trigger_label,
        }
    }
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
        for p in &crate::scene_config::global_summon_phrases(cfg) {
            if crate::config::phrases_fuzzy_match(text, p) {
                return VoiceKeywordKind::Wake;
            }
        }
        for p in &effective.summon_phrases {
            if crate::config::phrases_fuzzy_match(text, p) {
                return VoiceKeywordKind::Wake;
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
        for p in &crate::scene_config::global_summon_phrases(cfg) {
            if crate::config::phrases_fuzzy_match(text, p) {
                return VoiceKeywordKind::Wake;
            }
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

/// Legacy entry used by KWS; forwards to [`handle_detection`].
pub fn dispatch_voice_keyword_detected(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    detection: &VoiceKeywordDetection,
) -> VoiceKeywordDispatchResult {
    let matched = if detection.keyword.trim().is_empty() {
        detection.phrase.clone()
    } else {
        detection.keyword.clone()
    };
    let det = VoiceDetection {
        engine: engine.to_string(),
        kind: VoiceDetectionKind::from_keyword_kind(detection.kind),
        text: detection.phrase.clone(),
        confidence: None,
        matched_phrase: matched,
        timestamp_ms: VoiceDetection::now_ms(),
    };
    handle_detection(state, app, &det).into()
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
