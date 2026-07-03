//! Voice engine reload relevance — field comparisons only, no runtime/native deps.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum DesiredVoiceEngine {
    #[default]
    None,
    Vosk,
    Sapi,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VoiceVoskReload {
    pub enabled: bool,
    pub phrases: Vec<String>,
    pub model_path: String,
    pub model_preset: String,
    pub target_key: String,
    pub cooldown_ms: u32,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct VoiceSapiReload {
    pub enabled: bool,
    pub phrases: Vec<String>,
    pub min_confidence: f32,
    pub target_key: String,
    pub cooldown_ms: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VoiceEndReload {
    pub enabled: bool,
    pub phrases_zh: Vec<String>,
    pub phrases_en: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct VoiceReloadConfig {
    pub vosk: VoiceVoskReload,
    pub sapi: VoiceSapiReload,
    pub voice_end: VoiceEndReload,
}

pub fn desired_voice_engine(cfg: &VoiceReloadConfig) -> DesiredVoiceEngine {
    if cfg.vosk.enabled {
        DesiredVoiceEngine::Vosk
    } else if cfg.sapi.enabled {
        DesiredVoiceEngine::Sapi
    } else {
        DesiredVoiceEngine::None
    }
}

pub fn vosk_runtime_relevant_changed(old: &VoiceReloadConfig, new: &VoiceReloadConfig) -> bool {
    old.vosk.phrases != new.vosk.phrases
        || old.vosk.model_path != new.vosk.model_path
        || old.vosk.model_preset != new.vosk.model_preset
        || old.voice_end.enabled != new.voice_end.enabled
        || old.voice_end.phrases_zh != new.voice_end.phrases_zh
        || old.voice_end.phrases_en != new.voice_end.phrases_en
}

pub fn sapi_runtime_relevant_changed(old: &VoiceReloadConfig, new: &VoiceReloadConfig) -> bool {
    old.sapi.phrases != new.sapi.phrases
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_cfg() -> VoiceReloadConfig {
        VoiceReloadConfig::default()
    }

    #[test]
    fn desired_voice_engine_both_false() {
        let cfg = base_cfg();
        assert_eq!(desired_voice_engine(&cfg), DesiredVoiceEngine::None);
    }

    #[test]
    fn desired_voice_engine_sapi_only() {
        let mut cfg = base_cfg();
        cfg.sapi.enabled = true;
        assert_eq!(desired_voice_engine(&cfg), DesiredVoiceEngine::Sapi);
    }

    #[test]
    fn desired_voice_engine_vosk_only() {
        let mut cfg = base_cfg();
        cfg.vosk.enabled = true;
        assert_eq!(desired_voice_engine(&cfg), DesiredVoiceEngine::Vosk);
    }

    #[test]
    fn desired_voice_engine_both_true_prefers_vosk() {
        let mut cfg = base_cfg();
        cfg.vosk.enabled = true;
        cfg.sapi.enabled = true;
        assert_eq!(desired_voice_engine(&cfg), DesiredVoiceEngine::Vosk);
    }

    #[test]
    fn vosk_runtime_relevant_phrases_changed() {
        let old = base_cfg();
        let mut new = old.clone();
        new.vosk.phrases.push("新唤醒词".into());
        assert!(vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn vosk_runtime_relevant_model_path_changed() {
        let old = base_cfg();
        let mut new = old.clone();
        new.vosk.model_path = "other/model".into();
        assert!(vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn vosk_runtime_relevant_voice_end_enabled_changed() {
        let old = base_cfg();
        let mut new = old.clone();
        new.voice_end.enabled = true;
        assert!(vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn vosk_runtime_relevant_voice_end_phrases_zh_changed() {
        let old = base_cfg();
        let mut new = old.clone();
        new.voice_end.phrases_zh = vec!["结束".into()];
        assert!(vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn vosk_runtime_not_relevant_target_key_only() {
        let old = base_cfg();
        let mut new = old.clone();
        new.vosk.target_key = "F2".into();
        assert!(!vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn vosk_runtime_not_relevant_cooldown_only() {
        let old = base_cfg();
        let mut new = old.clone();
        new.vosk.cooldown_ms = 9999;
        assert!(!vosk_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn sapi_runtime_relevant_phrases_changed() {
        let old = base_cfg();
        let mut new = old.clone();
        new.sapi.phrases = vec!["你好".into()];
        assert!(sapi_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn sapi_runtime_not_relevant_min_confidence_only() {
        let old = base_cfg();
        let mut new = old.clone();
        new.sapi.min_confidence = 0.9;
        assert!(!sapi_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn sapi_runtime_not_relevant_cooldown_only() {
        let old = base_cfg();
        let mut new = old.clone();
        new.sapi.cooldown_ms = 5000;
        assert!(!sapi_runtime_relevant_changed(&old, &new));
    }

    #[test]
    fn sapi_runtime_not_relevant_target_key_only() {
        let old = base_cfg();
        let mut new = old.clone();
        new.sapi.target_key = "F2".into();
        assert!(!sapi_runtime_relevant_changed(&old, &new));
    }
}
