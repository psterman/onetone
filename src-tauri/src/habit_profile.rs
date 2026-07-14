//! Read-only view projection from persisted [`MappingEntry`] rows.
//! Not stored, not serialized to IPC — delegates voice merge to [`crate::scene_config`].

use serde::Serialize;

use crate::config::{mapping_is_complete, MappingEntry, PhraseBundle, TriggerMode, VoiceConfig};
use crate::scene_config::{resolve_effective_scene, SceneResolveContext};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HabitType {
    Keys,
    Voice,
    App,
    Combo,
}

/// Flat read-only habit view derived from storage + active scene context.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitProfile {
    pub id: String,
    pub name: String,
    pub order: u32,
    pub trigger_key: String,
    pub target_key: String,
    pub trigger_mode: TriggerMode,
    pub key_enabled: bool,
    pub is_active: bool,
    pub is_complete: bool,
    pub habit_type: HabitType,
    pub effective_target_key: String,
    pub effective_wake_phrases: Vec<String>,
    pub effective_end_phrases: PhraseBundle,
    pub app_target_id: String,
}

pub fn project_habit(mapping: &MappingEntry, cfg: &VoiceConfig) -> HabitProfile {
    let ctx = SceneResolveContext {
        active_scene_id: &mapping.id,
    };
    let effective = resolve_effective_scene(cfg, &ctx);
    let habit_type = classify_habit_type(mapping, cfg);

    let (effective_target_key, effective_wake_phrases, effective_end_phrases) =
        if let Some(eff) = effective {
            (eff.target_key, eff.wake_phrases, eff.end_phrases)
        } else {
            (String::new(), Vec::new(), PhraseBundle::default())
        };

    HabitProfile {
        id: mapping.id.clone(),
        name: habit_display_name(mapping),
        order: mapping.order,
        trigger_key: mapping.trigger_key.clone(),
        target_key: mapping.target_key.clone(),
        trigger_mode: mapping.trigger_mode,
        key_enabled: mapping.enabled,
        is_active: mapping.id == cfg.active_scene_id,
        is_complete: mapping_is_complete(mapping),
        habit_type,
        effective_target_key,
        effective_wake_phrases,
        effective_end_phrases,
        app_target_id: mapping.app_target_id.clone(),
    }
}

pub fn project_all(cfg: &VoiceConfig) -> Vec<HabitProfile> {
    let mut out: Vec<HabitProfile> = cfg.mappings.iter().map(|m| project_habit(m, cfg)).collect();
    out.sort_by_key(|h| h.order);
    out
}

pub fn project_active(cfg: &VoiceConfig) -> Option<HabitProfile> {
    let id = cfg.active_scene_id.trim();
    if id.is_empty() {
        return None;
    }
    let mapping = cfg.find_mapping_by_id(id)?;
    Some(project_habit(mapping, cfg))
}

fn habit_display_name(mapping: &MappingEntry) -> String {
    let group = mapping.group.trim();
    if !group.is_empty() {
        return group.to_string();
    }
    let label = mapping.label.trim();
    if !label.is_empty() {
        return label.to_string();
    }
    mapping.id.clone()
}

fn has_key_parts(mapping: &MappingEntry) -> bool {
    !mapping.trigger_key.trim().is_empty() || !mapping.target_key.trim().is_empty()
}

fn has_app_parts(mapping: &MappingEntry) -> bool {
    if !mapping.app_target_id.trim().is_empty() {
        return true;
    }
    mapping
        .app_behavior_rules
        .iter()
        .any(|r| !r.app_id.trim().is_empty())
}

fn has_voice_parts(mapping: &MappingEntry, cfg: &VoiceConfig) -> bool {
    if let Some(ov) = mapping.voice_override.as_ref() {
        if ov.wake_phrases.as_ref().is_some_and(|p| !p.is_empty()) {
            return true;
        }
        if ov.end_phrases.as_ref().is_some_and(|b| !b.is_empty()) {
            return true;
        }
        if ov.target_key.as_ref().is_some_and(|k| !k.trim().is_empty()) {
            return true;
        }
    }
    let ctx = SceneResolveContext {
        active_scene_id: &mapping.id,
    };
    let Some(effective) = resolve_effective_scene(cfg, &ctx) else {
        return false;
    };
    let global_ctx = SceneResolveContext {
        active_scene_id: &cfg.active_scene_id,
    };
    let global_eff = resolve_effective_scene(cfg, &global_ctx);
    if let Some(global) = global_eff {
        if effective.wake_phrases != global.wake_phrases {
            return true;
        }
        if effective.end_phrases != global.end_phrases {
            return true;
        }
    }
    false
}

fn classify_habit_type(mapping: &MappingEntry, cfg: &VoiceConfig) -> HabitType {
    let key = has_key_parts(mapping);
    let voice = has_voice_parts(mapping, cfg);
    let app = has_app_parts(mapping);
    let n = key as u8 + voice as u8 + app as u8;
    if n >= 2 {
        return HabitType::Combo;
    }
    if app {
        return HabitType::App;
    }
    if voice {
        return HabitType::Voice;
    }
    HabitType::Keys
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{
        default_voice_end_phrases_en, default_voice_end_phrases_zh, is_workflow_app_target,
        mapping_is_complete, MappingEntry, TriggerMode, VoiceConfig, VoiceOverride,
    };
    use crate::scene_config::{idle_scene_ctx, resolve_effective_scene};

    fn base_cfg() -> VoiceConfig {
        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.enabled = true;
        cfg.voice_end.enabled = true;
        cfg
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
            voice_commands: vec![],
        });
        id.to_string()
    }

    #[test]
    fn reconcile_active_habit_matches_active_scene_id() {
        let cfg = base_cfg();
        let active = project_active(&cfg).unwrap();
        assert_eq!(active.id, cfg.active_scene_id);
        assert!(active.is_active);
    }

    #[test]
    fn reconcile_voice_fields_match_resolve_effective_scene() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.voice_override = Some(VoiceOverride {
                target_key: Some("F9".into()),
                wake_phrases: Some(vec!["小调小调".into()]),
                end_phrases: Some(PhraseBundle {
                    zh: vec!["结束输入".into()],
                    en: vec!["send it".into()],
                }),
                ..Default::default()
            });
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &id,
            },
        )
        .unwrap();
        assert_eq!(profile.effective_target_key, eff.target_key);
        assert_eq!(profile.effective_wake_phrases, eff.wake_phrases);
        assert_eq!(profile.effective_end_phrases, eff.end_phrases);
    }

    #[test]
    fn reconcile_idle_active_matches_project_active() {
        let cfg = base_cfg();
        let idle = resolve_effective_scene(&cfg, &idle_scene_ctx(&cfg)).unwrap();
        let active = project_active(&cfg).unwrap();
        assert_eq!(active.effective_target_key, idle.target_key);
        assert_eq!(active.effective_wake_phrases, idle.wake_phrases);
        assert_eq!(active.effective_end_phrases, idle.end_phrases);
    }

    #[test]
    fn key_enabled_and_is_active_can_differ() {
        let mut cfg = base_cfg();
        let active_id = cfg.active_scene_id.clone();
        let other = add_mapping(&mut cfg, "scene-b", 1, true);
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == active_id) {
            m.enabled = false;
        }
        let profiles = project_all(&cfg);
        let active_row = profiles.iter().find(|p| p.id == active_id).unwrap();
        let other_row = profiles.iter().find(|p| p.id == other).unwrap();
        assert!(active_row.is_active);
        assert!(!active_row.key_enabled);
        assert!(!other_row.is_active);
        assert!(other_row.key_enabled);
    }

    #[test]
    fn habit_type_keys_by_default() {
        let cfg = base_cfg();
        let mapping = cfg.mappings.first().unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::Keys);
    }

    #[test]
    fn habit_type_combo_when_keys_and_voice_override() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["only-this".into()]),
                end_phrases: None,
                ..Default::default()
            });
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::Combo);
    }

    #[test]
    fn habit_type_combo_when_keys_and_app_target() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::Combo);
    }

    #[test]
    fn habit_type_voice_when_no_keys() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.trigger_key.clear();
            m.target_key.clear();
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["only-this".into()]),
                end_phrases: None,
                ..Default::default()
            });
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::Voice);
    }

    #[test]
    fn habit_type_app_when_no_keys() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.trigger_key.clear();
            m.target_key.clear();
            m.app_target_id = "cursor-chat".into();
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::App);
    }

    #[test]
    fn habit_type_combo_when_multiple_parts() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["combo-wake".into()]),
                end_phrases: Some(PhraseBundle {
                    zh: default_voice_end_phrases_zh(),
                    en: default_voice_end_phrases_en(),
                }),
                ..Default::default()
            });
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        assert_eq!(profile.habit_type, HabitType::Combo);
    }

    #[test]
    fn reconcile_scene_config_t2_null_override_inherits_global() {
        let cfg = base_cfg();
        let mapping = cfg.find_mapping_by_id(&cfg.active_scene_id).unwrap();
        let profile = project_habit(mapping, &cfg);
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &cfg.active_scene_id,
            },
        )
        .unwrap();
        assert_eq!(profile.effective_target_key, eff.target_key);
        assert_eq!(profile.effective_wake_phrases, eff.wake_phrases);
        assert_eq!(profile.effective_end_phrases, eff.end_phrases);
    }

    #[test]
    fn reconcile_scene_config_t3_partial_target_override_only() {
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
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &id,
            },
        )
        .unwrap();
        assert_eq!(profile.effective_target_key, "F9");
        assert_eq!(profile.effective_target_key, eff.target_key);
        assert_eq!(profile.effective_wake_phrases, eff.wake_phrases);
    }

    #[test]
    fn reconcile_scene_config_t4_wake_and_end_override() {
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
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &id,
            },
        )
        .unwrap();
        assert_eq!(profile.effective_wake_phrases, vec!["小调小调".to_string()]);
        assert_eq!(
            profile.effective_end_phrases.zh,
            vec!["结束输入".to_string()]
        );
        assert_eq!(profile.effective_wake_phrases, eff.wake_phrases);
        assert_eq!(profile.effective_end_phrases, eff.end_phrases);
    }

    #[test]
    fn reconcile_scene_config_t5_workflow_never_uses_mapping_target_key() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
            m.target_key = "Ctrl+L".into();
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        let profile = project_habit(mapping, &cfg);
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &id,
            },
        )
        .unwrap();
        assert_ne!(profile.effective_target_key, "Ctrl+L");
        assert_eq!(profile.effective_target_key, eff.target_key);
    }

    #[test]
    fn reconcile_scene_config_t7_switch_active_scene_changes_effective() {
        let mut cfg = base_cfg();
        let b = add_mapping(&mut cfg, "scene-b", 1, false);
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == b) {
            m.voice_override = Some(VoiceOverride {
                target_key: None,
                wake_phrases: Some(vec!["scene b wake".into()]),
                end_phrases: None,
                ..Default::default()
            });
        }
        cfg.active_scene_id = b.clone();
        let active = project_active(&cfg).unwrap();
        let eff = resolve_effective_scene(
            &cfg,
            &SceneResolveContext {
                active_scene_id: &b,
            },
        )
        .unwrap();
        assert_eq!(active.id, b);
        assert!(active.is_active);
        assert_eq!(active.effective_wake_phrases, eff.wake_phrases);
        assert!(active
            .effective_wake_phrases
            .contains(&"scene b wake".to_string()));
    }

    #[test]
    fn workflow_app_does_not_change_is_complete() {
        let mut cfg = base_cfg();
        let id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.app_target_id = "cursor-chat".into();
        }
        let mapping = cfg.find_mapping_by_id(&id).unwrap();
        assert!(mapping_is_complete(mapping));
        let profile = project_habit(mapping, &cfg);
        assert!(profile.is_complete);
        assert!(is_workflow_app_target(&profile.app_target_id));
    }
}
