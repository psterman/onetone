//! Effective scene config merge (Rule A) and session snapshot (Rule B).

use serde::Serialize;

use crate::config::{
    is_workflow_app_target, normalize_voice_override, vosk_preset_model_path, MappingEntry,
    PhraseBundle, VoiceConfig, VoiceOverride, VoiceSapiConfig, VoiceVoskConfig,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DesiredVoiceEngine {
    Vosk,
    Sapi,
    None,
}

pub struct SceneResolveContext<'a> {
    pub active_scene_id: &'a str,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveSceneConfig {
    pub scene_id: String,
    pub target_key: String,
    pub wake_phrases: Vec<String>,
    pub end_phrases: PhraseBundle,
    pub trigger_key: String,
    pub app_target_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSessionSnapshot {
    pub scene_id: String,
    pub effective: EffectiveSceneConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRuntimeFingerprint {
    pub engine: DesiredVoiceEngine,
    pub wake_phrases: Vec<String>,
    pub end_phrases: PhraseBundle,
    pub vosk_model_path: String,
    pub vosk_model_preset: String,
    pub min_confidence: f32,
}

pub fn resolve_effective_scene(
    cfg: &VoiceConfig,
    ctx: &SceneResolveContext<'_>,
) -> Option<EffectiveSceneConfig> {
    let mapping = cfg.find_mapping_by_id(ctx.active_scene_id)?;
    let ov = mapping.voice_override.as_ref();
    let target_key = resolve_effective_target_key(cfg, mapping, ov);
    let wake_phrases = merge_wake_phrases(cfg, mapping, ov);
    let end_phrases = merge_end_phrases(cfg, ov);
    Some(EffectiveSceneConfig {
        scene_id: mapping.id.clone(),
        target_key,
        wake_phrases,
        end_phrases,
        trigger_key: mapping.trigger_key.clone(),
        app_target_id: mapping.app_target_id.clone(),
    })
}

pub fn voice_runtime_fingerprint(
    cfg: &VoiceConfig,
    ctx: &SceneResolveContext<'_>,
) -> Option<VoiceRuntimeFingerprint> {
    let mapping = cfg.find_mapping_by_id(ctx.active_scene_id)?;
    let effective = resolve_effective_scene(cfg, ctx)?;
    let model_preset = effective_vosk_model_preset(cfg, mapping);
    let model_path = if model_preset != "custom" {
        vosk_preset_model_path(&model_preset)
            .map(|p| p.to_string())
            .unwrap_or_else(|| cfg.voice_vosk.model_path.trim().to_string())
    } else {
        cfg.voice_vosk.model_path.trim().to_string()
    };
    Some(VoiceRuntimeFingerprint {
        engine: effective_desired_engine(cfg, mapping),
        wake_phrases: normalize_phrase_list(&effective.wake_phrases),
        end_phrases: normalize_end_phrases(&effective.end_phrases),
        vosk_model_path: model_path,
        vosk_model_preset: model_preset,
        min_confidence: cfg.voice_sapi.min_confidence,
    })
}

pub fn freeze_session_snapshot(
    cfg: &VoiceConfig,
    scene_id_at_enter: &str,
) -> Option<VoiceSessionSnapshot> {
    let ctx = SceneResolveContext {
        active_scene_id: scene_id_at_enter,
    };
    let effective = resolve_effective_scene(cfg, &ctx)?;
    Some(VoiceSessionSnapshot {
        scene_id: effective.scene_id.clone(),
        effective,
    })
}

pub fn idle_scene_ctx(cfg: &VoiceConfig) -> SceneResolveContext<'_> {
    SceneResolveContext {
        active_scene_id: &cfg.active_scene_id,
    }
}

pub fn resolve_idle_effective_scene(cfg: &VoiceConfig) -> Option<EffectiveSceneConfig> {
    resolve_effective_scene(cfg, &idle_scene_ctx(cfg))
}

pub fn idle_voice_fingerprint(cfg: &VoiceConfig) -> Option<VoiceRuntimeFingerprint> {
    voice_runtime_fingerprint(cfg, &idle_scene_ctx(cfg))
}

/// Wake + end phrases for Vosk grammar from the active scene effective config.
pub fn vosk_grammar_phrases_for_cfg(cfg: &VoiceConfig) -> Vec<String> {
    let Some(effective) = resolve_idle_effective_scene(cfg) else {
        return Vec::new();
    };
    vosk_grammar_from_effective(&effective, cfg.voice_end.enabled)
}

pub fn vosk_grammar_from_effective(
    effective: &EffectiveSceneConfig,
    voice_end_enabled: bool,
) -> Vec<String> {
    use std::collections::HashSet;

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut push = |p: &str| {
        let t = p.trim();
        if t.is_empty() {
            return;
        }
        if seen.insert(t.to_string()) {
            out.push(t.to_string());
        }
    };
    for p in &effective.wake_phrases {
        push(p);
    }
    if voice_end_enabled {
        for p in &effective.end_phrases.zh {
            push(p);
        }
        for p in &effective.end_phrases.en {
            push(p);
        }
    }
    out
}

fn global_desired_voice_engine(cfg: &VoiceConfig) -> DesiredVoiceEngine {
    if cfg.voice_vosk.enabled {
        DesiredVoiceEngine::Vosk
    } else if cfg.voice_sapi.enabled {
        DesiredVoiceEngine::Sapi
    } else {
        DesiredVoiceEngine::None
    }
}

pub fn idle_desired_voice_engine(cfg: &VoiceConfig) -> DesiredVoiceEngine {
    let Some(mapping) = cfg.find_mapping_by_id(&cfg.active_scene_id) else {
        return global_desired_voice_engine(cfg);
    };
    effective_desired_engine(cfg, mapping)
}

pub fn effective_desired_engine(cfg: &VoiceConfig, mapping: &MappingEntry) -> DesiredVoiceEngine {
    if let Some(raw) = mapping
        .voice_override
        .as_ref()
        .and_then(|o| o.engine.as_ref())
    {
        match raw.trim().to_ascii_lowercase().as_str() {
            "vosk" | "pro" | "advanced" => return DesiredVoiceEngine::Vosk,
            "sapi" | "lite" => return DesiredVoiceEngine::Sapi,
            "none" | "off" => return DesiredVoiceEngine::None,
            _ => {}
        }
    }
    global_desired_voice_engine(cfg)
}

fn effective_vosk_model_preset(cfg: &VoiceConfig, mapping: &MappingEntry) -> String {
    if let Some(preset) = mapping
        .voice_override
        .as_ref()
        .and_then(|o| o.model_preset.as_ref())
    {
        let trimmed = preset.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let global = cfg.voice_vosk.model_preset.trim();
    if global.is_empty() {
        "cn-light".to_string()
    } else {
        global.to_string()
    }
}

pub fn resolve_effective_vosk_config(cfg: &VoiceConfig) -> VoiceVoskConfig {
    let mut vosk = cfg.voice_vosk.clone();
    if idle_desired_voice_engine(cfg) != DesiredVoiceEngine::Vosk {
        vosk.enabled = false;
        return vosk;
    }
    vosk.enabled = true;
    if let Some(mapping) = cfg.find_mapping_by_id(&cfg.active_scene_id) {
        let preset = effective_vosk_model_preset(cfg, mapping);
        if preset != "custom" {
            vosk.model_preset = preset.clone();
            if let Some(path) = vosk_preset_model_path(&preset) {
                vosk.model_path = path.to_string();
            }
        }
    }
    vosk
}

pub fn resolve_effective_sapi_config(cfg: &VoiceConfig) -> VoiceSapiConfig {
    let mut sapi = cfg.voice_sapi.clone();
    sapi.enabled = idle_desired_voice_engine(cfg) == DesiredVoiceEngine::Sapi;
    sapi
}

fn global_wake_phrases(cfg: &VoiceConfig) -> Vec<String> {
    match global_desired_voice_engine(cfg) {
        DesiredVoiceEngine::Vosk => cfg.voice_vosk.phrases.clone(),
        DesiredVoiceEngine::Sapi => cfg.voice_sapi.phrases.clone(),
        DesiredVoiceEngine::None => cfg.voice_vosk.phrases.clone(),
    }
}

fn global_end_phrases(cfg: &VoiceConfig) -> PhraseBundle {
    PhraseBundle {
        zh: cfg.voice_end.phrases_zh.clone(),
        en: cfg.voice_end.phrases_en.clone(),
    }
}

fn merge_wake_phrases(
    cfg: &VoiceConfig,
    mapping: &crate::config::MappingEntry,
    ov: Option<&VoiceOverride>,
) -> Vec<String> {
    let base = if let Some(phrases) = ov.and_then(|o| o.wake_phrases.as_ref()) {
        if !phrases.is_empty() {
            phrases.clone()
        } else {
            global_wake_phrases(cfg)
        }
    } else {
        global_wake_phrases(cfg)
    };
    let summon: Vec<String> = crate::config::summon_entries_for_mapping(mapping)
        .into_iter()
        .map(|(phrase, _)| phrase)
        .collect();
    crate::config::append_unique_phrases(base, &summon)
}

fn merge_end_phrases(cfg: &VoiceConfig, ov: Option<&VoiceOverride>) -> PhraseBundle {
    let global = global_end_phrases(cfg);
    let Some(bundle) = ov.and_then(|o| o.end_phrases.as_ref()) else {
        return global;
    };
    PhraseBundle {
        zh: if bundle.zh.is_empty() {
            global.zh
        } else {
            bundle.zh.clone()
        },
        en: if bundle.en.is_empty() {
            global.en
        } else {
            bundle.en.clone()
        },
    }
}

fn resolve_effective_target_key(
    cfg: &VoiceConfig,
    mapping: &crate::config::MappingEntry,
    ov: Option<&VoiceOverride>,
) -> String {
    if let Some(key) = ov.and_then(|o| o.target_key.as_ref()) {
        let k = key.trim();
        if !k.is_empty() {
            return k.to_string();
        }
    }
    if is_workflow_app_target(&mapping.app_target_id) {
        if let Some(key) = global_voice_input_target_key(cfg) {
            return key;
        }
    }
    if let Some(key) = global_voice_input_target_key(cfg) {
        return key;
    }
    let end_key = cfg.voice_end.target_key.trim();
    if !end_key.is_empty() {
        return end_key.to_string();
    }
    "RAlt".into()
}

fn global_voice_input_target_key(cfg: &VoiceConfig) -> Option<String> {
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

fn normalize_phrase_list(phrases: &[String]) -> Vec<String> {
    let mut out: Vec<String> = phrases
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    out.sort();
    out.dedup();
    out
}

fn normalize_end_phrases(bundle: &PhraseBundle) -> PhraseBundle {
    PhraseBundle {
        zh: normalize_phrase_list(&bundle.zh),
        en: normalize_phrase_list(&bundle.en),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{
        default_voice_end_phrases_en, default_voice_end_phrases_zh, MappingEntry, TriggerMode,
        VoiceConfig, VoiceOverride,
    };

    fn base_cfg() -> VoiceConfig {
        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.enabled = true;
        cfg.voice_end.enabled = true;
        cfg
    }

    fn ctx<'a>(cfg: &'a VoiceConfig) -> SceneResolveContext<'a> {
        SceneResolveContext {
            active_scene_id: &cfg.active_scene_id,
        }
    }

    fn add_mapping(cfg: &mut VoiceConfig, id: &str, order: u32, enabled: bool) -> String {
        cfg.mappings.push(MappingEntry {
            id: id.into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled,
            order,
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
            voice_override: None,
        });
        id.to_string()
    }

    #[test]
    fn t2_null_override_inherits_global() {
        let cfg = base_cfg();
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(eff.wake_phrases, cfg.voice_vosk.phrases);
        assert_eq!(eff.end_phrases.zh, cfg.voice_end.phrases_zh);
        assert_eq!(eff.target_key, cfg.voice_vosk.target_key);
    }

    #[test]
    fn t3_partial_target_override_only() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.voice_override = Some(VoiceOverride {
                target_key: Some("F9".into()),
                wake_phrases: None,
                end_phrases: None,
                ..Default::default()
            });
        }
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(eff.target_key, "F9");
        assert_eq!(eff.wake_phrases, cfg.voice_vosk.phrases);
    }

    #[test]
    fn t4_wake_and_end_override() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["小调小调".into()]),
                end_phrases: Some(PhraseBundle {
                    zh: vec!["结束输入".into()],
                    en: vec!["send it".into()],
                }),
                ..Default::default()
            });
        }
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(eff.wake_phrases, vec!["小调小调".to_string()]);
        assert_eq!(eff.end_phrases.zh, vec!["结束输入".to_string()]);
        assert_eq!(eff.end_phrases.en, vec!["send it".to_string()]);
    }

    #[test]
    fn t5_workflow_never_uses_mapping_target_key() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
            m.target_key = "Ctrl+L".into();
        }
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert_ne!(eff.target_key, "Ctrl+L");
        assert_eq!(eff.target_key, cfg.voice_vosk.target_key);
    }

    #[test]
    fn t6_reorder_does_not_change_effective() {
        let mut cfg = base_cfg();
        add_mapping(&mut cfg, "b", 1, false);
        let fp1 = voice_runtime_fingerprint(&cfg, &ctx(&cfg)).unwrap();
        cfg.mappings[0].order = 2;
        cfg.mappings[1].order = 0;
        cfg.mappings.sort_by_key(|m| m.order);
        let fp2 = voice_runtime_fingerprint(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn t7_switch_active_scene_changes_fingerprint() {
        let mut cfg = base_cfg();
        let a = cfg.active_scene_id.clone();
        let b = add_mapping(&mut cfg, "scene-b", 1, false);
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == b) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["scene b wake".into()]),
                end_phrases: None,
                ..Default::default()
            });
        }
        let fp_a = voice_runtime_fingerprint(&cfg, &ctx(&cfg)).unwrap();
        cfg.active_scene_id = b.clone();
        let ctx_b = SceneResolveContext {
            active_scene_id: &b,
        };
        let fp_b = voice_runtime_fingerprint(&cfg, &ctx_b).unwrap();
        assert_ne!(fp_a, fp_b);
        assert!(fp_b.wake_phrases.contains(&"scene b wake".to_string()));
        let _ = a;
    }

    #[test]
    fn t8_same_fingerprint_on_identical_config() {
        let cfg = base_cfg();
        let fp1 = voice_runtime_fingerprint(&cfg, &ctx(&cfg)).unwrap();
        let fp2 = voice_runtime_fingerprint(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn t9_session_snapshot_frozen_at_enter() {
        let mut cfg = base_cfg();
        let a = cfg.active_scene_id.clone();
        let b = add_mapping(&mut cfg, "scene-b", 1, false);
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == a) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["wake-a".into()]),
                end_phrases: Some(PhraseBundle {
                    zh: vec!["结束A".into()],
                    en: default_voice_end_phrases_en(),
                }),
                ..Default::default()
            });
        }
        let snapshot = freeze_session_snapshot(&cfg, &a).unwrap();
        cfg.active_scene_id = b;
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == a) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["wake-a-changed".into()]),
                end_phrases: Some(PhraseBundle {
                    zh: vec!["结束A-改".into()],
                    en: default_voice_end_phrases_en(),
                }),
                ..Default::default()
            });
        }
        assert_eq!(snapshot.scene_id, a);
        assert_eq!(snapshot.effective.wake_phrases, vec!["wake-a".to_string()]);
        assert_eq!(snapshot.effective.end_phrases.zh, vec!["结束A".to_string()]);
    }

    #[test]
    fn t10_deleted_active_scene_falls_back_on_normalize() {
        let mut cfg = base_cfg();
        let fallback = cfg.mappings[0].id.clone();
        cfg.active_scene_id = "gone".into();
        cfg.normalize();
        assert_eq!(cfg.active_scene_id, fallback);
    }

    #[test]
    fn t11_browse_selection_not_used_for_effective() {
        let mut cfg = base_cfg();
        let a = cfg.active_scene_id.clone();
        let b = add_mapping(&mut cfg, "scene-b", 1, false);
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == b) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["only-b".into()]),
                end_phrases: None,
                ..Default::default()
            });
        }
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert_eq!(eff.scene_id, a);
        assert_ne!(eff.wake_phrases, vec!["only-b".to_string()]);
    }

    #[test]
    fn summon_phrases_merge_into_effective_wake() {
        use crate::config::AppBehaviorRule;

        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
            m.app_behavior_rules = vec![AppBehaviorRule {
                app_id: "cursor-chat".into(),
                finish_mode: "confirm".into(),
                note: None,
                summon_phrase: Some("打开我的 Cursor".into()),
            }];
        }
        let eff = resolve_effective_scene(&cfg, &ctx(&cfg)).unwrap();
        assert!(eff.wake_phrases.contains(&"打开我的 Cursor".to_string()));
    }

    #[test]
    fn empty_voice_override_normalizes_to_none() {
        let ov = normalize_voice_override(Some(VoiceOverride::default()));
        assert!(ov.is_none());
    }

    #[test]
    fn migrate_v5_sets_active_scene_from_enabled() {
        let mut cfg = VoiceConfig {
            version: 5,
            ..VoiceConfig::default()
        };
        cfg.migrate();
        assert_eq!(cfg.version, 6);
        assert!(!cfg.active_scene_id.is_empty());
        assert!(cfg
            .mappings
            .iter()
            .any(|m| m.id == cfg.active_scene_id && m.enabled));
        assert!(cfg.mappings.iter().all(|m| m.voice_override.is_none()));
    }
}
