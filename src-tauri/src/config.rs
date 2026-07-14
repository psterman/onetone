use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::ipc;
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TriggerMode {
    #[default]
    #[serde(alias = "toggle")]
    Tap,
    /// Each keydown fires once (UI: ???????). Formerly named `Hold`.
    #[serde(alias = "hold")]
    PerPress,
    LongPress,
    Double,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhraseBundle {
    #[serde(default)]
    pub zh: Vec<String>,
    #[serde(default)]
    pub en: Vec<String>,
}

impl PhraseBundle {
    pub fn is_empty(&self) -> bool {
        self.zh.iter().all(|p| p.trim().is_empty()) && self.en.iter().all(|p| p.trim().is_empty())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VoiceOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wake_phrases: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_phrases: Option<PhraseBundle>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancel_phrases: Option<PhraseBundle>,
    /// Per-scene engine preference: "sapi" | "vosk" | "none".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(
        rename = "modelPreset",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub model_preset: Option<String>,
}

impl VoiceOverride {
    pub fn is_empty(&self) -> bool {
        match &self.target_key {
            Some(s) if !s.trim().is_empty() => return false,
            _ => {}
        }
        match &self.wake_phrases {
            Some(p) if !p.is_empty() => return false,
            _ => {}
        }
        match &self.end_phrases {
            Some(b) if !b.is_empty() => return false,
            _ => {}
        }
        match &self.cancel_phrases {
            Some(b) if !b.is_empty() => return false,
            _ => {}
        }
        match &self.engine {
            Some(s) if !s.trim().is_empty() => return false,
            _ => {}
        }
        match &self.model_preset {
            Some(s) if !s.trim().is_empty() => return false,
            _ => {}
        }
        true
    }
}

pub fn normalize_voice_override(ov: Option<VoiceOverride>) -> Option<VoiceOverride> {
    match ov {
        Some(v) if v.is_empty() => None,
        other => other,
    }
}

/// Voice-only / voice-override shells keep empty trigger/target through normalize.
pub fn mapping_should_keep_empty_target_key(m: &MappingEntry) -> bool {
    m.trigger_key.trim().is_empty()
        && m
            .voice_override
            .as_ref()
            .is_some_and(|ov| !ov.is_empty())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppMatchSpec {
    #[serde(rename = "exeNames", default)]
    pub exe_names: Vec<String>,
    #[serde(rename = "pathContains", default, skip_serializing_if = "Option::is_none")]
    pub path_contains: Option<String>,
    #[serde(rename = "titleContains", default, skip_serializing_if = "Option::is_none")]
    pub title_contains: Option<String>,
    #[serde(rename = "fullPath", default, skip_serializing_if = "Option::is_none")]
    pub full_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppBehaviorRule {
    #[serde(rename = "ruleId", default)]
    pub rule_id: String,
    #[serde(rename = "appId")]
    pub app_id: String,
    #[serde(rename = "finishMode")]
    pub finish_mode: String,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(
        rename = "summonPhrase",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub summon_phrase: Option<String>,
    #[serde(rename = "match", default, skip_serializing_if = "Option::is_none")]
    pub app_match: Option<AppMatchSpec>,
    #[serde(rename = "displayName", default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

pub fn new_rule_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("rule-{ms}")
}

pub fn is_preset_app_id(app_id: &str) -> bool {
    matches!(
        app_id.trim(),
        "cursor-chat" | "codex-chat" | "claude-code" | "minimax-chat"
    )
}

pub fn app_match_has_constraints(spec: &AppMatchSpec) -> bool {
    if spec
        .exe_names
        .iter()
        .any(|name| !name.trim().is_empty())
    {
        return true;
    }
    spec.path_contains
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
        || spec
            .title_contains
            .as_ref()
            .is_some_and(|s| !s.trim().is_empty())
}

pub fn normalize_behavior_rule(rule: &mut AppBehaviorRule) {
    if rule.rule_id.trim().is_empty() {
        rule.rule_id = new_rule_id();
    }
    if let Some(spec) = rule.app_match.as_ref() {
        if !app_match_has_constraints(spec) {
            rule.app_match = None;
        }
    }
}

pub fn rule_matches_identity(
    rule: &AppBehaviorRule,
    identity: &crate::app_identity::AppIdentity,
) -> bool {
    if let Some(spec) = rule.app_match.as_ref() {
        if !app_match_has_constraints(spec) {
            return false;
        }
        if !spec.exe_names.is_empty()
            && !spec.exe_names.iter().any(|name| {
                let n = name.trim();
                !n.is_empty() && identity.exe_name.eq_ignore_ascii_case(n)
            })
        {
            return false;
        }
        if let Some(path_needle) = spec
            .path_contains
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            let Some(path) = identity.full_path.as_deref() else {
                return false;
            };
            if !path.to_ascii_lowercase().contains(&path_needle.to_ascii_lowercase()) {
                return false;
            }
        }
        if let Some(title_needle) = spec
            .title_contains
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            if !identity
                .window_title
                .to_ascii_lowercase()
                .contains(&title_needle.to_ascii_lowercase())
            {
                return false;
            }
        }
        return true;
    }

    if !is_preset_app_id(&rule.app_id) {
        return false;
    }
    identity.matched_preset_app_id.as_deref() == Some(rule.app_id.as_str())
}

pub fn rule_specificity(rule: &AppBehaviorRule) -> u32 {
    let Some(spec) = rule.app_match.as_ref() else {
        return 0;
    };
    let mut score = 0u32;
    if spec
        .path_contains
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        score += 300;
    }
    if spec
        .exe_names
        .iter()
        .any(|n| !n.trim().is_empty())
    {
        score += 200;
    }
    if spec
        .title_contains
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty())
    {
        score += 100;
    }
    score
}

pub fn rule_is_explicit_match(rule: &AppBehaviorRule) -> bool {
    rule.app_match
        .as_ref()
        .is_some_and(app_match_has_constraints)
}

pub fn match_behavior_rule<'a>(
    rules: &'a [AppBehaviorRule],
    identity: &crate::app_identity::AppIdentity,
) -> Option<&'a AppBehaviorRule> {
    let mut best: Option<(&AppBehaviorRule, u32, bool, usize)> = None;
    for (idx, rule) in rules.iter().enumerate() {
        if !rule_matches_identity(rule, identity) {
            continue;
        }
        let explicit = rule_is_explicit_match(rule);
        let specificity = rule_specificity(rule);
        let replace = best.as_ref().is_none_or(|(_, best_spec, best_explicit, best_idx)| {
            if explicit != *best_explicit {
                return explicit && !*best_explicit;
            }
            if specificity != *best_spec {
                return specificity > *best_spec;
            }
            idx < *best_idx
        });
        if replace {
            best = Some((rule, specificity, explicit, idx));
        }
    }
    best.map(|(rule, _, _, _)| rule)
}

pub fn default_summon_phrase(app_id: &str) -> Option<&'static str> {
    default_summon_phrase_for_preset(app_id, "cn-light")
}

pub fn default_summon_phrase_for_preset(app_id: &str, preset: &str) -> Option<&'static str> {
    let en = preset.trim() == "en-light";
    match app_id.trim() {
        "cursor-chat" => Some(if en { "Open Cursor" } else { "打开 Cursor" }),
        "codex-chat" => Some(if en { "Open Codex" } else { "打开 Codex" }),
        "claude-code" => Some(if en { "Open Claude" } else { "打开 Claude" }),
        "minimax-chat" => Some(if en { "Open MiniMax" } else { "打开 MiniMax" }),
        _ => None,
    }
}

pub fn preset_app_display_name(app_id: &str) -> Option<&'static str> {
    match app_id.trim() {
        "cursor-chat" => Some("Cursor"),
        "codex-chat" => Some("Codex"),
        "claude-code" => Some("Claude"),
        "minimax-chat" => Some("MiniMax"),
        _ => None,
    }
}

pub fn app_wake_phrases_for_rule(rule: &AppBehaviorRule, preset: &str) -> Vec<String> {
    if let Some(raw) = rule.summon_phrase.as_ref() {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return vec![trimmed.to_string()];
        }
    }
    let mut out = Vec::new();
    let mut push = |p: &str| {
        let t = p.trim();
        if t.is_empty() {
            return;
        }
        if !out.iter().any(|x| x == t) {
            out.push(t.to_string());
        }
    };
    let en = preset.trim() == "en-light";
    if is_preset_app_id(&rule.app_id) {
        if let Some(name) = preset_app_display_name(&rule.app_id) {
            if en {
                push(name);
                push(&format!("Open {name}"));
            } else {
                push(&format!("{name}旺"));
                push(&format!("打开{name}"));
            }
        }
        if let Some(default) = default_summon_phrase_for_preset(&rule.app_id, preset) {
            push(default);
        }
    } else if rule.app_id.trim() == "custom" {
        if let Some(name) = rule
            .display_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            if en {
                push(name);
                push(&format!("Open {name}"));
            } else {
                push(&format!("{name}旺"));
                push(&format!("打开{name}"));
            }
        }
    }
    out
}

pub fn summon_phrase_for_rule(rule: &AppBehaviorRule, preset: &str) -> Option<String> {
    app_wake_phrases_for_rule(rule, preset).into_iter().next()
}

pub const SUMMON_RULE_TARGET_PREFIX: &str = "rule:";

pub fn summon_target_ref_for_rule(rule: &AppBehaviorRule) -> Option<String> {
    if rule.app_id.trim() == "custom" {
        let id = rule.rule_id.trim();
        if id.is_empty() {
            return None;
        }
        return Some(format!("{SUMMON_RULE_TARGET_PREFIX}{id}"));
    }
    if is_preset_app_id(&rule.app_id) {
        return Some(rule.app_id.trim().to_string());
    }
    None
}

pub fn summon_rule_id_from_target(target: &str) -> Option<&str> {
    target
        .strip_prefix(SUMMON_RULE_TARGET_PREFIX)
        .filter(|id| !id.trim().is_empty())
}

pub fn summon_entries_for_mapping(mapping: &MappingEntry, preset: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for rule in &mapping.app_behavior_rules {
        let app_id = rule.app_id.trim();
        if app_id.is_empty() {
            continue;
        }
        if let Some(target) = summon_target_ref_for_rule(rule) {
            for phrase in app_wake_phrases_for_rule(rule, preset) {
                if seen.insert(phrase.clone()) {
                    out.push((phrase, target.clone()));
                }
            }
        }
    }
    let primary = mapping.app_target_id.trim();
    if !primary.is_empty() && is_preset_app_id(primary) {
        let has_rule = mapping
            .app_behavior_rules
            .iter()
            .any(|r| r.app_id.trim() == primary);
        if !has_rule {
            let fallback_rule = AppBehaviorRule {
                rule_id: String::new(),
                app_id: primary.to_string(),
                finish_mode: String::new(),
                note: None,
                summon_phrase: None,
                app_match: None,
                display_name: None,
            };
            for phrase in app_wake_phrases_for_rule(&fallback_rule, preset) {
                if seen.insert(phrase.clone()) {
                    out.push((phrase, primary.to_string()));
                }
            }
        }
    }
    let inject_target = if !primary.is_empty() {
        primary.to_string()
    } else {
        mapping.id.clone()
    };
    for phrase in voice_command_summon_phrases(mapping) {
        if seen.insert(phrase.clone()) {
            out.push((phrase, inject_target.clone()));
        }
    }
    out
}

pub fn phrases_fuzzy_match(heard: &str, reference: &str) -> bool {
    let heard = heard.trim();
    let reference = reference.trim();
    if heard.is_empty() || reference.is_empty() {
        return false;
    }
    if heard == reference {
        return true;
    }
    crate::voice_vosk::matches_final(heard, &[reference.to_string()]).is_some()
        || crate::voice_vosk::matches_final(reference, &[heard.to_string()]).is_some()
}

pub fn resolve_summon_app_for_phrase(
    mapping: &MappingEntry,
    matched_phrase: &str,
    preset: &str,
) -> Option<String> {
    for (phrase, app_id) in summon_entries_for_mapping(mapping, preset) {
        if phrases_fuzzy_match(matched_phrase, &phrase) {
            return Some(app_id);
        }
    }
    None
}

pub fn append_unique_phrases(mut phrases: Vec<String>, extra: &[String]) -> Vec<String> {
    for phrase in extra {
        let trimmed = phrase.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !phrases.iter().any(|p| p == trimmed) {
            phrases.push(trimmed.to_string());
        }
    }
    phrases
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommandQualitySignals {
    #[serde(rename = "hasFinalText", default)]
    pub has_final_text: bool,
    #[serde(rename = "micTooLow", default)]
    pub mic_too_low: bool,
    #[serde(rename = "textLengthOk", default = "default_true")]
    pub text_length_ok: bool,
    #[serde(rename = "sampleAgreement", default)]
    pub sample_agreement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommandSample {
    #[serde(default)]
    pub transcript: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    #[serde(default)]
    pub source: String,
    #[serde(rename = "qualitySignals", default, skip_serializing_if = "Option::is_none")]
    pub quality_signals: Option<VoiceCommandQualitySignals>,
    #[serde(rename = "createdAt", default)]
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceCommand {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_voice_command_version")]
    pub version: u32,
    #[serde(default = "default_voice_command_kind")]
    pub kind: String,
    #[serde(rename = "engineHint", default = "default_voice_command_engine_hint")]
    pub engine_hint: String,
    #[serde(default = "default_voice_command_locale")]
    pub locale: String,
    #[serde(rename = "scenarioId", default)]
    pub scenario_id: String,
    #[serde(rename = "canonicalPhrase", default)]
    pub canonical_phrase: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub samples: Vec<VoiceCommandSample>,
    #[serde(rename = "phoneticKey", default)]
    pub phonetic_key: String,
    #[serde(default = "default_voice_command_threshold")]
    pub threshold: f64,
    #[serde(default = "default_voice_command_margin")]
    pub margin: f64,
    #[serde(default = "default_voice_command_quality")]
    pub quality: String,
    #[serde(rename = "activationScope", default = "default_voice_command_scope")]
    pub activation_scope: String,
    #[serde(rename = "appBoost", default = "default_true")]
    pub app_boost: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "createdAt", default)]
    pub created_at: u64,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: u64,
}

fn default_voice_command_version() -> u32 {
    1
}
fn default_voice_command_kind() -> String {
    "scenario-activate".into()
}
fn default_voice_command_engine_hint() -> String {
    "asr-text".into()
}
fn default_voice_command_locale() -> String {
    "zh-CN".into()
}
fn default_voice_command_threshold() -> f64 {
    0.80
}
fn default_voice_command_margin() -> f64 {
    0.06
}
fn default_voice_command_quality() -> String {
    "good".into()
}
fn default_voice_command_scope() -> String {
    "global".into()
}

pub fn voice_command_summon_phrases(mapping: &MappingEntry) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push = |raw: &str| {
        let text = raw.trim();
        if text.is_empty() || text == "我的语音命令" {
            return;
        }
        if text.chars().all(|c| matches!(c, '?' | '？' | '.' | '-' | '_')) {
            return;
        }
        if seen.insert(text.to_string()) {
            out.push(text.to_string());
        }
    };
    for cmd in &mapping.voice_commands {
        if !cmd.enabled {
            continue;
        }
        push(&cmd.canonical_phrase);
        for alias in cmd.aliases.iter().take(2) {
            push(alias);
        }
    }
    // Acoustic labels are text names for management and KWS/Vosk summon from the home page.
    // Acoustic sound matching stays separate on AudioFrameBus.
    for cmd in &mapping.acoustic_voice_commands {
        if !cmd.enabled {
            continue;
        }
        push(&cmd.display_text);
        push(&cmd.label);
    }
    out
}

/// Rekey voice commands when duplicating a mapping.
pub fn rekey_voice_commands_for_mapping(
    commands: &[VoiceCommand],
    scenario_id: &str,
) -> Vec<VoiceCommand> {
    commands
        .iter()
        .map(|c| {
            let mut next = c.clone();
            next.id = format!("cmd-{}", new_mapping_id());
            next.scenario_id = scenario_id.to_string();
            next
        })
        .collect()
}

/// MFCC feature dimensions for `featureKind: "mfcc-v1"`.
pub const ACOUSTIC_FEATURE_DIMS: u32 = 13;
/// Max MFCC frames per sample (~2s @ 10ms hop).
pub const ACOUSTIC_MAX_FEATURE_FRAMES: u32 = 200;
const ACOUSTIC_MAX_SAMPLES_PER_COMMAND: usize = 3;
const ACOUSTIC_MAX_COMMANDS_PER_MAPPING: usize = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcousticVoiceCommandQualitySignals {
    #[serde(rename = "hasSpeech", default)]
    pub has_speech: bool,
    #[serde(rename = "tooShort", default)]
    pub too_short: bool,
    #[serde(rename = "tooLong", default)]
    pub too_long: bool,
    #[serde(rename = "sampleAgreement", default)]
    pub sample_agreement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcousticVoiceCommandSample {
    #[serde(default)]
    pub id: String,
    #[serde(rename = "durationMs", default)]
    pub duration_ms: u32,
    #[serde(default)]
    pub feature: Vec<f32>,
    #[serde(rename = "featureKind", default = "default_acoustic_feature_kind")]
    pub feature_kind: String,
    #[serde(rename = "featureFrames", default)]
    pub feature_frames: u32,
    #[serde(rename = "featureDims", default = "default_acoustic_feature_dims")]
    pub feature_dims: u32,
    #[serde(rename = "sampleRate", default = "default_acoustic_sample_rate")]
    pub sample_rate: u32,
    #[serde(rename = "qualitySignals", default, skip_serializing_if = "Option::is_none")]
    pub quality_signals: Option<AcousticVoiceCommandQualitySignals>,
    #[serde(rename = "createdAt", default)]
    pub created_at: u64,
}

fn default_acoustic_feature_kind() -> String {
    "mfcc-v1".into()
}
fn default_acoustic_feature_dims() -> u32 {
    ACOUSTIC_FEATURE_DIMS
}
fn default_acoustic_sample_rate() -> u32 {
    16000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcousticVoiceCommand {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_acoustic_command_version")]
    pub version: u32,
    #[serde(default = "default_acoustic_command_kind")]
    pub kind: String,
    #[serde(rename = "scenarioId", default)]
    pub scenario_id: String,
    #[serde(default = "default_acoustic_command_label")]
    pub label: String,
    #[serde(rename = "displayText", default)]
    pub display_text: String,
    #[serde(default)]
    pub samples: Vec<AcousticVoiceCommandSample>,
    #[serde(default = "default_acoustic_command_threshold")]
    pub threshold: f64,
    #[serde(default = "default_acoustic_command_margin")]
    pub margin: f64,
    #[serde(default = "default_acoustic_command_quality")]
    pub quality: String,
    #[serde(rename = "activationScope", default = "default_acoustic_command_scope")]
    pub activation_scope: String,
    #[serde(rename = "appBoost", default = "default_true")]
    pub app_boost: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(rename = "createdAt", default)]
    pub created_at: u64,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: u64,
}

fn default_acoustic_command_version() -> u32 {
    1
}
fn default_acoustic_command_kind() -> String {
    "scenario-acoustic-activate".into()
}
fn default_acoustic_command_label() -> String {
    "我的语音命令".into()
}
fn default_acoustic_command_threshold() -> f64 {
    0.78
}
fn default_acoustic_command_margin() -> f64 {
    0.08
}
fn default_acoustic_command_quality() -> String {
    "good".into()
}
fn default_acoustic_command_scope() -> String {
    "global".into()
}

pub fn new_acoustic_voice_command_id() -> String {
    format!("acmd_{}", new_mapping_id())
}

pub fn new_acoustic_voice_sample_id() -> String {
    format!("sample_{}", new_mapping_id())
}

fn acoustic_feature_values_valid(feature: &[f32]) -> bool {
    !feature.is_empty() && feature.iter().all(|v| v.is_finite())
}

fn normalize_acoustic_quality_signals(
    raw: Option<AcousticVoiceCommandQualitySignals>,
) -> Option<AcousticVoiceCommandQualitySignals> {
    raw.map(|qs| AcousticVoiceCommandQualitySignals {
        has_speech: qs.has_speech,
        too_short: qs.too_short,
        too_long: qs.too_long,
        sample_agreement: if qs.sample_agreement.is_finite() {
            qs.sample_agreement
        } else {
            0.0
        },
    })
}

/// Normalize and validate one acoustic sample; returns None if invalid.
pub fn normalize_acoustic_voice_command_sample(
    mut sample: AcousticVoiceCommandSample,
) -> Option<AcousticVoiceCommandSample> {
    let id = sample.id.trim();
    sample.id = if id.is_empty() {
        new_acoustic_voice_sample_id()
    } else {
        id.to_string()
    };
    let kind = sample.feature_kind.trim();
    sample.feature_kind = if kind.is_empty() {
        default_acoustic_feature_kind()
    } else {
        kind.to_string()
    };
    if sample.feature_kind != "mfcc-v1" {
        return None;
    }
    let dims = if sample.feature_dims == 0 {
        ACOUSTIC_FEATURE_DIMS
    } else {
        sample.feature_dims
    };
    if dims != ACOUSTIC_FEATURE_DIMS {
        return None;
    }
    sample.feature_dims = dims;
    let frames = sample.feature_frames;
    if frames == 0 || frames > ACOUSTIC_MAX_FEATURE_FRAMES {
        return None;
    }
    let expected_len = (frames as usize).saturating_mul(dims as usize);
    if sample.feature.len() != expected_len || !acoustic_feature_values_valid(&sample.feature) {
        return None;
    }
    if sample.sample_rate == 0 {
        sample.sample_rate = default_acoustic_sample_rate();
    }
    if sample.created_at == 0 {
        sample.created_at = now_ms();
    }
    sample.quality_signals = normalize_acoustic_quality_signals(sample.quality_signals);
    Some(sample)
}

/// Normalize acoustic commands for a mapping. Drops weak/invalid entries; MVP keeps one command.
pub fn normalize_acoustic_voice_commands(
    commands: Vec<AcousticVoiceCommand>,
    scenario_id: &str,
) -> Vec<AcousticVoiceCommand> {
    let sid = scenario_id.trim();
    let mut out = Vec::new();
    for mut cmd in commands {
        let quality = cmd.quality.trim();
        if quality != "good" && quality != "ok" {
            continue;
        }
        let samples: Vec<AcousticVoiceCommandSample> = cmd
            .samples
            .into_iter()
            .filter_map(normalize_acoustic_voice_command_sample)
            .take(ACOUSTIC_MAX_SAMPLES_PER_COMMAND)
            .collect();
        if samples.is_empty() {
            continue;
        }
        let id = cmd.id.trim();
        cmd.id = if id.is_empty() {
            new_acoustic_voice_command_id()
        } else {
            id.to_string()
        };
        cmd.version = if cmd.version == 0 { 1 } else { cmd.version };
        let kind = cmd.kind.trim();
        cmd.kind = if kind.is_empty() {
            default_acoustic_command_kind()
        } else {
            kind.to_string()
        };
        cmd.scenario_id = if cmd.scenario_id.trim().is_empty() {
            sid.to_string()
        } else {
            cmd.scenario_id.trim().to_string()
        };
        let label = cmd.label.trim();
        cmd.label = if label.is_empty() {
            default_acoustic_command_label()
        } else {
            label.to_string()
        };
        cmd.display_text = cmd.display_text.trim().to_string();
        cmd.samples = samples;
        if !cmd.threshold.is_finite() {
            cmd.threshold = default_acoustic_command_threshold();
        }
        if !cmd.margin.is_finite() {
            cmd.margin = default_acoustic_command_margin();
        }
        cmd.quality = quality.to_string();
        let scope = cmd.activation_scope.trim();
        cmd.activation_scope = if scope == "foreground-app" {
            "foreground-app".into()
        } else {
            default_acoustic_command_scope()
        };
        let now = now_ms();
        if cmd.created_at == 0 {
            cmd.created_at = now;
        }
        if cmd.updated_at == 0 {
            cmd.updated_at = cmd.created_at;
        }
        out.push(cmd);
        if out.len() >= ACOUSTIC_MAX_COMMANDS_PER_MAPPING {
            break;
        }
    }
    out
}

/// Rekey acoustic commands when duplicating a mapping.
pub fn rekey_acoustic_voice_commands_for_mapping(
    commands: &[AcousticVoiceCommand],
    scenario_id: &str,
) -> Vec<AcousticVoiceCommand> {
    let normalized = normalize_acoustic_voice_commands(commands.to_vec(), scenario_id);
    normalized
        .into_iter()
        .map(|mut cmd| {
            cmd.id = new_acoustic_voice_command_id();
            cmd.scenario_id = scenario_id.to_string();
            cmd.samples = cmd
                .samples
                .into_iter()
                .map(|mut s| {
                    s.id = new_acoustic_voice_sample_id();
                    s
                })
                .collect();
            cmd.updated_at = now_ms();
            cmd
        })
        .collect()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Persisted habit/scene row. Runtime display uses read-only [`crate::habit_profile::HabitProfile`] projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappingEntry {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_group")]
    pub group: String,
    #[serde(rename = "triggerKey", default)]
    pub trigger_key: String,
    #[serde(rename = "targetKey", default)]
    pub target_key: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub order: u32,
    #[serde(rename = "triggerMode", default)]
    pub trigger_mode: TriggerMode,
    #[serde(rename = "triggerSource", default)]
    pub trigger_source: Option<TriggerSource>,
    #[serde(rename = "sourceKey", default)]
    pub source_key: String,
    #[serde(rename = "sourceTime", default)]
    pub source_time: String,
    #[serde(rename = "intervalMs", default)]
    pub interval_ms: u32,
    #[serde(rename = "enterDelayMs", default)]
    pub enter_delay_ms: u32,
    #[serde(rename = "cancelEnabled", default = "default_true")]
    pub cancel_enabled: bool,
    #[serde(rename = "autoEnterEnabled", default = "default_true")]
    pub auto_enter_enabled: bool,
    /// ?????????????????????????????????????????????????
    #[serde(rename = "switchKeys", default)]
    pub switch_keys: Vec<String>,
    /// ? true ????????????????????????????????????????????
    #[serde(rename = "nativeKeyRestore", default)]
    pub native_key_restore: bool,
    /// ?????????????????????????Raw Input ????????????????????
    #[serde(rename = "triggerDevice", default)]
    pub trigger_device: String,
    #[serde(rename = "longPressMs", default = "default_long_press_ms")]
    pub long_press_ms: u32,
    #[serde(rename = "doubleClickMs", default = "default_double_click_ms")]
    pub double_click_ms: u32,
    #[serde(rename = "imePresetId", default)]
    pub ime_preset_id: String,
    #[serde(rename = "appTargetId", default)]
    pub app_target_id: String,
    #[serde(rename = "appBehaviorRules", default)]
    pub app_behavior_rules: Vec<AppBehaviorRule>,
    #[serde(
        rename = "voiceOverride",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub voice_override: Option<VoiceOverride>,
    #[serde(rename = "voiceCommands", default)]
    pub voice_commands: Vec<VoiceCommand>,
    #[serde(rename = "acousticVoiceCommands", default)]
    pub acoustic_voice_commands: Vec<AcousticVoiceCommand>,
}

fn default_long_press_ms() -> u32 {
    500
}

fn default_double_click_ms() -> u32 {
    400
}

pub const SCHEME_CYCLE_MARKER: &str = "__scheme_cycle__";
pub const SCHEME_SELECT_PREFIX: &str = "__scheme_select__:";

fn default_group() -> String {
    "  ".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RawEvent {
    #[serde(default)]
    pub device: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub location: u32,
    #[serde(default, rename = "type")]
    pub event_type: String,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub button: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TriggerSource {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub grouping: String,
    #[serde(default, rename = "rawEvents")]
    pub raw_events: Vec<RawEvent>,
}

/// Legacy migrate-only; not used at runtime.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActionConfig {
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub cancel: String,
    #[serde(default)]
    pub send: String,
}

/// Legacy / reserved; not used at runtime.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SceneConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, rename = "overrideMode")]
    pub override_mode: String,
    #[serde(default, rename = "cancelWindowMs")]
    pub cancel_window_ms: u32,
    #[serde(default, rename = "sendDelayMs")]
    pub send_delay_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub mappings: Vec<MappingEntry>,
    ///                 
    #[serde(default)]
    pub trash: Vec<MappingEntry>,
    #[serde(default = "default_interval_ms")]
    #[serde(rename = "intervalMs")]
    pub interval_ms: u32,
    #[serde(default = "default_enter_delay_ms")]
    #[serde(rename = "enterDelayMs")]
    pub enter_delay_ms: u32,
    #[serde(default = "default_true")]
    #[serde(rename = "cancelEnabled")]
    pub cancel_enabled: bool,
    #[serde(default = "default_true")]
    #[serde(rename = "autoEnterEnabled")]
    pub auto_enter_enabled: bool,
    #[serde(default = "default_debounce_ms")]
    #[serde(rename = "debounceMs")]
    pub debounce_ms: u32,
    #[serde(default = "default_key_press_duration_ms")]
    #[serde(rename = "keyPressDurationMs")]
    pub key_press_duration_ms: u32,
    #[serde(default, rename = "voiceSapi")]
    pub voice_sapi: VoiceSapiConfig,
    #[serde(default, rename = "voiceVosk")]
    pub voice_vosk: VoiceVoskConfig,
    #[serde(default, rename = "voiceKws")]
    pub voice_kws: VoiceKwsConfig,
    #[serde(default, rename = "voiceEnd")]
    pub voice_end: VoiceEndConfig,
    #[serde(default, skip_serializing)]
    pub scenes: Option<Vec<SceneConfig>>,
    #[serde(rename = "schemeSwitchKey", default = "default_scheme_switch_key")]
    pub scheme_switch_key: String,
    #[serde(default, rename = "keyWakeSoundEnabled")]
    pub key_wake_sound_enabled: bool,
    #[serde(default, rename = "coachHudEnabled")]
    pub coach_hud_enabled: bool,
    #[serde(default, rename = "sounds")]
    pub sounds: SoundsConfig,
    #[serde(default = "default_false", rename = "startMinimizedToTray")]
    pub start_minimized_to_tray: bool,
    /// false on fresh install (first launch maximizes); true when missing from JSON (upgrade).
    #[serde(default = "default_true", rename = "windowLayoutSeen")]
    pub window_layout_seen: bool,
    #[serde(default, rename = "windowMaximized")]
    pub window_maximized: bool,
    #[serde(default = "default_window_width", rename = "windowWidth")]
    pub window_width: f64,
    #[serde(default = "default_window_height", rename = "windowHeight")]
    pub window_height: f64,
    #[serde(default, rename = "windowX")]
    pub window_x: Option<f64>,
    #[serde(default, rename = "windowY")]
    pub window_y: Option<f64>,
    #[serde(rename = "imePresetId", default)]
    pub ime_preset_id: String,
    /// Current scene truth for voice/runtime (Rule A). Not the UI selection highlight.
    #[serde(rename = "activeSceneId", default)]
    pub active_scene_id: String,
    // --- migrate-only (read, never serialize) ---
    #[serde(default, rename = "recordKey", skip_serializing)]
    pub record_key: String,
    #[serde(default, rename = "targetKey", skip_serializing)]
    pub target_key: String,
    #[serde(default, rename = "triggerSource", skip_serializing)]
    pub trigger_source: Option<TriggerSource>,
    #[serde(default, skip_serializing)]
    pub actions: Option<ActionConfig>,
}

fn default_version() -> u32 {
    6
}

fn default_window_width() -> f64 {
    760.0
}

fn default_window_height() -> f64 {
    820.0
}
fn default_scheme_switch_key() -> String {
    String::new()
}
fn default_interval_ms() -> u32 {
    1200
}
fn default_enter_delay_ms() -> u32 {
    5000
}
fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}
fn default_debounce_ms() -> u32 {
    80
}
fn default_key_press_duration_ms() -> u32 {
    250
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSapiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_sapi_phrases")]
    pub phrases: Vec<String>,
    #[serde(default = "default_voice_sapi_target_key")]
    pub target_key: String,
    #[serde(default = "default_voice_sapi_cooldown_ms")]
    pub cooldown_ms: u32,
    #[serde(default = "default_voice_sapi_min_confidence")]
    pub min_confidence: f32,
}

fn default_voice_sapi_phrases() -> Vec<String> {
    vec![
        "开始输入".into(),
        "开始听写".into(),
        "开启输入".into(),
        "开始说话".into(),
    ]
}

fn default_voice_sapi_target_key() -> String {
    "RAlt".into()
}

fn default_voice_sapi_cooldown_ms() -> u32 {
    2000
}

fn default_voice_sapi_min_confidence() -> f32 {
    0.35
}

impl Default for VoiceSapiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases: default_voice_sapi_phrases(),
            target_key: default_voice_sapi_target_key(),
            cooldown_ms: default_voice_sapi_cooldown_ms(),
            min_confidence: default_voice_sapi_min_confidence(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceEndConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_end_phrases_zh")]
    pub phrases_zh: Vec<String>,
    #[serde(default = "default_voice_end_phrases_en")]
    pub phrases_en: Vec<String>,
    #[serde(default = "default_voice_end_cancel_phrases_zh")]
    pub cancel_phrases_zh: Vec<String>,
    #[serde(default = "default_voice_end_cancel_phrases_en")]
    pub cancel_phrases_en: Vec<String>,
    #[serde(default = "default_voice_end_commit_delay_ms")]
    pub commit_delay_ms: u32,
    #[serde(default = "default_voice_end_commit_key")]
    pub commit_key: String,
    #[serde(default = "default_voice_end_dictation_timeout_ms")]
    pub dictation_timeout_ms: u32,
    #[serde(default = "default_false")]
    pub auto_send_enabled: bool,
    #[serde(default = "default_voice_end_target_key")]
    pub target_key: String,
}

pub fn default_voice_end_phrases_zh() -> Vec<String> {
    vec!["结束输入".into(), "发出去".into()]
}

pub fn default_voice_end_phrases_en() -> Vec<String> {
    vec!["end dictation".into(), "send it".into()]
}

pub fn default_voice_end_cancel_phrases_zh() -> Vec<String> {
    vec!["取消输入".into(), "不要了".into()]
}

pub fn default_voice_end_cancel_phrases_en() -> Vec<String> {
    vec!["cancel input".into(), "never mind".into()]
}

fn default_voice_end_commit_delay_ms() -> u32 {
    4000
}

fn default_voice_end_commit_key() -> String {
    "Enter".into()
}

fn default_voice_end_dictation_timeout_ms() -> u32 {
    60000
}

fn default_voice_end_target_key() -> String {
    "RAlt".into()
}

impl Default for VoiceEndConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases_zh: default_voice_end_phrases_zh(),
            phrases_en: default_voice_end_phrases_en(),
            cancel_phrases_zh: default_voice_end_cancel_phrases_zh(),
            cancel_phrases_en: default_voice_end_cancel_phrases_en(),
            commit_delay_ms: default_voice_end_commit_delay_ms(),
            commit_key: default_voice_end_commit_key(),
            dictation_timeout_ms: default_voice_end_dictation_timeout_ms(),
            auto_send_enabled: false,
            target_key: default_voice_end_target_key(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundSlot {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub id: String,
}

fn default_sound_id_record() -> String {
    "tiny-tick".into()
}
fn default_sound_id_voice_wake() -> String {
    "voice-open-signal".into()
}
fn default_sound_id_key_wake() -> String {
    "input-ready-soft".into()
}
fn default_sound_id_send_success() -> String {
    "send-confirm-click".into()
}
fn default_sound_id_send_fail() -> String {
    "error-subtle".into()
}

impl Default for SoundSlot {
    fn default() -> Self {
        Self {
            enabled: false,
            id: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundsConfig {
    #[serde(default = "default_true", rename = "masterEnabled")]
    pub master_enabled: bool,
    #[serde(default = "default_sound_slot_record")]
    pub record: SoundSlot,
    #[serde(default = "default_sound_slot_voice_wake", rename = "voiceWake")]
    pub voice_wake: SoundSlot,
    #[serde(default = "default_sound_slot_key_wake", rename = "keyWake")]
    pub key_wake: SoundSlot,
    #[serde(default = "default_sound_slot_send_success", rename = "sendSuccess")]
    pub send_success: SoundSlot,
    #[serde(default = "default_sound_slot_send_fail", rename = "sendFail")]
    pub send_fail: SoundSlot,
    #[serde(default = "default_false", rename = "recordingMuteEnabled")]
    pub recording_mute_enabled: bool,
    #[serde(
        default = "default_recording_mute_strength",
        rename = "recordingMuteStrength"
    )]
    pub recording_mute_strength: String,
}

fn default_sound_slot_record() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_record(),
    }
}
fn default_sound_slot_voice_wake() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_voice_wake(),
    }
}
fn default_sound_slot_key_wake() -> SoundSlot {
    SoundSlot {
        enabled: false,
        id: default_sound_id_key_wake(),
    }
}
fn default_sound_slot_send_success() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_send_success(),
    }
}
fn default_sound_slot_send_fail() -> SoundSlot {
    SoundSlot {
        enabled: true,
        id: default_sound_id_send_fail(),
    }
}

fn default_recording_mute_strength() -> String {
    "balanced".into()
}

impl Default for SoundsConfig {
    fn default() -> Self {
        Self {
            master_enabled: true,
            record: default_sound_slot_record(),
            voice_wake: default_sound_slot_voice_wake(),
            key_wake: default_sound_slot_key_wake(),
            send_success: default_sound_slot_send_success(),
            send_fail: default_sound_slot_send_fail(),
            recording_mute_enabled: false,
            recording_mute_strength: default_recording_mute_strength(),
        }
    }
}

impl SoundsConfig {
    pub fn normalize(&mut self) {
        if self.record.id.trim().is_empty() {
            self.record.id = default_sound_id_record();
        }
        if self.voice_wake.id.trim().is_empty() {
            self.voice_wake.id = default_sound_id_voice_wake();
        }
        if self.key_wake.id.trim().is_empty() {
            self.key_wake.id = default_sound_id_key_wake();
        }
        if self.send_success.id.trim().is_empty() {
            self.send_success.id = default_sound_id_send_success();
        }
        if self.send_fail.id.trim().is_empty() {
            self.send_fail.id = default_sound_id_send_fail();
        }
        if !matches!(
            self.recording_mute_strength.trim(),
            "light" | "balanced" | "strong" | "mute"
        ) {
            self.recording_mute_strength = default_recording_mute_strength();
        }
    }

    pub fn cue_enabled(&self, cue: &str) -> bool {
        if !self.master_enabled {
            return false;
        }
        match cue {
            "record" => self.record.enabled,
            "voice_wake" => self.voice_wake.enabled,
            "key_wake" => self.key_wake.enabled,
            "send_success" => self.send_success.enabled,
            "send_fail" => self.send_fail.enabled,
            _ => false,
        }
    }

    pub fn recording_mute_target_scale(&self) -> f32 {
        match self.recording_mute_strength.trim() {
            "light" => 0.7,
            "balanced" => 0.45,
            "strong" => 0.15,
            "mute" => 0.0,
            _ => 0.45,
        }
    }
}

pub fn runtime_sound_cue(cfg: &VoiceConfig, cue: &str) -> Option<String> {
    if cfg.sounds.cue_enabled(cue) {
        Some(cue.to_string())
    } else {
        None
    }
}

/// Start + end phrases merged for Vosk grammar (deduplicated, active scene effective).
pub fn vosk_grammar_phrases(cfg: &VoiceConfig) -> Vec<String> {
    crate::scene_config::vosk_grammar_phrases_for_cfg(cfg)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceVoskConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_vosk_phrases")]
    pub phrases: Vec<String>,
    #[serde(default = "default_voice_vosk_target_key")]
    pub target_key: String,
    #[serde(default = "default_voice_vosk_cooldown_ms")]
    pub cooldown_ms: u32,
    #[serde(default = "default_voice_vosk_model_path")]
    pub model_path: String,
    #[serde(default = "default_voice_vosk_model_preset")]
    pub model_preset: String,
}

fn default_voice_vosk_phrases() -> Vec<String> {
    default_voice_vosk_phrases_cn()
}

fn default_voice_vosk_phrases_cn() -> Vec<String> {
    vec![
        "开始输入".into(),
        "开始听写".into(),
        "打开听写".into(),
        "语音输入".into(),
        "开启输入".into(),
    ]
}

fn default_voice_vosk_phrases_en() -> Vec<String> {
    vec![
        "start dictation".into(),
        "start input".into(),
        "begin dictation".into(),
        "voice input".into(),
        "start typing".into(),
    ]
}

fn default_voice_vosk_target_key() -> String {
    "RAlt".into()
}

fn default_voice_vosk_cooldown_ms() -> u32 {
    2000
}

fn default_voice_vosk_model_path() -> String {
    "resources/vosk/vosk-model-small-cn-0.22".into()
}

fn default_voice_vosk_model_preset() -> String {
    "cn-light".into()
}

/// Relative paths for built-in Vosk light models.
pub const VOSK_CN_LIGHT_REL: &str = "resources/vosk/vosk-model-small-cn-0.22";
pub const VOSK_EN_LIGHT_REL: &str = "resources/vosk/vosk-model-small-en-us-0.15";

impl Default for VoiceVoskConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases: default_voice_vosk_phrases(),
            target_key: default_voice_vosk_target_key(),
            cooldown_ms: default_voice_vosk_cooldown_ms(),
            model_path: default_voice_vosk_model_path(),
            model_preset: default_voice_vosk_model_preset(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceKwsConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_voice_vosk_phrases")]
    pub phrases: Vec<String>,
    #[serde(default = "default_voice_vosk_target_key")]
    pub target_key: String,
    #[serde(default = "default_voice_vosk_cooldown_ms")]
    pub cooldown_ms: u32,
    #[serde(default = "default_voice_kws_model_path")]
    pub model_path: String,
    #[serde(default = "default_voice_kws_model_preset")]
    pub model_preset: String,
}

fn default_voice_kws_model_path() -> String {
    "resources/kws/sherpa-kws-zh-small".into()
}

fn default_voice_kws_model_preset() -> String {
    "cn-light".into()
}

impl Default for VoiceKwsConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases: default_voice_vosk_phrases(),
            target_key: default_voice_vosk_target_key(),
            cooldown_ms: default_voice_vosk_cooldown_ms(),
            model_path: default_voice_kws_model_path(),
            model_preset: default_voice_kws_model_preset(),
        }
    }
}

/// Built-in KWS model preset ??? relative path (Phase 2 native).
pub fn kws_preset_model_path(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some("resources/kws/sherpa-kws-zh-small"),
        _ => None,
    }
}

pub fn kws_model_download_url(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some(
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01-mobile.tar.bz2",
        ),
        _ => None,
    }
}

/// Normalize mutually exclusive voice engine enabled flags. Priority: Vosk > SAPI > KWS.
pub fn reconcile_voice_engine_flags(cfg: &mut VoiceConfig) -> bool {
    let mut changed = false;
    let count = [cfg.voice_vosk.enabled, cfg.voice_sapi.enabled, cfg.voice_kws.enabled]
        .iter()
        .filter(|&&x| x)
        .count();
    if count <= 1 {
        return false;
    }
    if cfg.voice_vosk.enabled {
        if cfg.voice_sapi.enabled {
            cfg.voice_sapi.enabled = false;
            changed = true;
        }
        if cfg.voice_kws.enabled {
            cfg.voice_kws.enabled = false;
            changed = true;
        }
    } else if cfg.voice_sapi.enabled && cfg.voice_kws.enabled {
        cfg.voice_kws.enabled = false;
        changed = true;
    }
    changed
}

/// Built-in Vosk model preset ??? relative path under project/resources.
pub fn vosk_preset_model_path(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some(VOSK_CN_LIGHT_REL),
        "en-light" => Some(VOSK_EN_LIGHT_REL),
        _ => None,
    }
}

pub fn vosk_preset_is_dual(preset: &str) -> bool {
    preset.trim() == "auto"
}

/// Default wake phrases when switching model preset.
pub fn vosk_preset_default_phrases(preset: &str) -> Option<Vec<String>> {
    match preset.trim() {
        "cn-light" => Some(default_voice_vosk_phrases_cn()),
        "en-light" => Some(default_voice_vosk_phrases_en()),
        _ => None,
    }
}

/// When preset and stored phrases disagree (e.g. en-light with cn default list), align defaults.
pub fn reconcile_vosk_phrases_for_preset(vosk: &mut VoiceVoskConfig) {
    let preset = vosk.model_preset.trim();
    if preset == "custom" {
        return;
    }
    let Some(target_defaults) = vosk_preset_default_phrases(preset) else {
        return;
    };
    let cn_defaults = default_voice_vosk_phrases_cn();
    let en_defaults = default_voice_vosk_phrases_en();
    if preset == "en-light" && vosk.phrases == cn_defaults {
        vosk.phrases = target_defaults;
    } else if preset == "cn-light" && vosk.phrases == en_defaults {
        vosk.phrases = target_defaults;
    }
}
pub fn resolve_vosk_model_path(cfg: &VoiceVoskConfig) -> String {
    if cfg.model_preset.trim() == "custom" || cfg.model_preset.trim().is_empty() {
        if cfg.model_path.trim().is_empty() {
            return default_voice_vosk_model_path();
        }
        return cfg.model_path.trim().to_string();
    }
    if let Some(path) = vosk_preset_model_path(&cfg.model_preset) {
        return path.to_string();
    }
    if cfg.model_path.trim().is_empty() {
        default_voice_vosk_model_path()
    } else {
        cfg.model_path.trim().to_string()
    }
}

pub fn now_source_time() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{ms}")
}

pub fn new_mapping_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("m-{ms}")
}

pub fn canonical_trigger(key: &str) -> String {
    match key.trim() {
        "AltRight" | "RMenu" => "RAlt".into(),
        "ControlRight" | "RControl" => "RCtrl".into(),
        "AudioVolumeUp" | "VolumeUp" | "Volume_Up" | "Audio_Volume_Up" => "Volume_Up".into(),
        "AudioVolumeDown" | "VolumeDown" | "Volume_Down" | "Audio_Volume_Down" => {
            "Volume_Down".into()
        }
        "AudioVolumeMute" | "VolumeMute" | "Volume_Mute" | "Audio_Volume_Mute" => {
            "Volume_Mute".into()
        }
        other => other.to_string(),
    }
}

pub fn is_allowed_trigger(key: &str) -> bool {
    let canonical = canonical_trigger(key);
    !canonical.trim().is_empty() && !contains_left_mouse_token(&canonical)
}

pub fn contains_left_mouse_token(key: &str) -> bool {
    key.split('+').any(|part| {
        matches!(
            canonical_trigger(part.trim()).as_str(),
            "LButton" | "Mouse_Left" | "MouseLeft"
        )
    })
}

pub fn is_allowed_target_shortcut(key: &str) -> bool {
    !key.trim().is_empty() && !contains_left_mouse_token(key)
}

pub fn physical_bindings(trigger_key: &str) -> Vec<String> {
    let c = canonical_trigger(trigger_key);
    if c.is_empty() {
        vec![]
    } else {
        vec![c]
    }
}

pub fn is_volume_hotkey(key: &str) -> bool {
    matches!(
        canonical_trigger(key).as_str(),
        "Volume_Up" | "Volume_Down" | "Volume_Mute"
    )
}

fn volume_raw_event_with_device(hotkey: &str, label: &str, device: &str) -> RawEvent {
    let (key, code) = match hotkey {
        "Volume_Down" => ("AudioVolumeDown", "AudioVolumeDown"),
        "Volume_Up" => ("AudioVolumeUp", "AudioVolumeUp"),
        "Volume_Mute" => ("AudioVolumeMute", "AudioVolumeMute"),
        other => (other, other),
    };
    RawEvent {
        device: if device.trim().is_empty() {
            "keyboard".into()
        } else {
            device.into()
        },
        key: key.into(),
        code: code.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: label.into(),
        button: None,
    }
}

/// Mouse buttons usable as launch keys.
pub fn is_mouse_button(key: &str) -> bool {
    matches!(
        canonical_trigger(key).as_str(),
        "LButton" | "RButton" | "MButton" | "XButton1" | "XButton2"
    )
}

pub fn bindings_need_mouse_hook(bindings: &[String]) -> bool {
    bindings.iter().any(|b| is_mouse_button(b))
}

///     /        ?
pub fn is_peripheral_trigger_key(key: &str) -> bool {
    if is_mouse_button(key) {
        return true;
    }
    if key.starts_with("Gamepad_") || key.starts_with("HID_") {
        return true;
    }
    let c = canonical_trigger(key);
    if c.starts_with("VK_") && c.len() >= 4 {
        return true;
    }
    matches!(
        c.as_str(),
        "Media_Next"
            | "Media_Prev"
            | "Media_Play_Pause"
            | "Media_Stop"
            | "Browser_Back"
            | "Browser_Forward"
            | "Browser_Refresh"
            | "Launch_Mail"
            | "Launch_App1"
            | "Launch_App2"
            | "AppsKey"
    ) || c.starts_with('F') && c[1..].chars().all(|ch| ch.is_ascii_digit())
}

fn peripheral_raw_event_with_device(hotkey: &str, device: &str) -> RawEvent {
    if is_volume_hotkey(hotkey) {
        let hk = canonical_trigger(hotkey);
        let label = match hk.as_str() {
            "Volume_Down" => "Volume Down",
            "Volume_Up" => "Volume Up",
            "Volume_Mute" => "Volume Mute",
            _ => hotkey,
        };
        return volume_raw_event_with_device(&hk, label, device);
    }
    RawEvent {
        device: if device.trim().is_empty() {
            "keyboard".into()
        } else {
            device.into()
        },
        key: hotkey.into(),
        code: hotkey.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: hotkey.into(),
        button: None,
    }
}

fn peripheral_raw_event(hotkey: &str) -> RawEvent {
    peripheral_raw_event_with_device(hotkey, "")
}

///                + F1 ?
pub fn default_peripheral_hotkeys() -> Vec<String> {
    vec![]
}

pub fn make_combo_trigger_source(combo: &str) -> TriggerSource {
    let parts: Vec<String> = combo
        .split('+')
        .map(|s| canonical_trigger(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    TriggerSource {
        id: "source_combo".into(),
        label: "组合启动键".into(),
        mode: "chord".into(),
        grouping: "exact".into(),
        raw_events: parts.iter().map(|k| peripheral_raw_event(k)).collect(),
    }
}

pub fn make_peripheral_mixed_source(extra: &[String]) -> TriggerSource {
    make_peripheral_mixed_source_with_device(extra, "")
}

pub fn make_peripheral_mixed_source_with_device(extra: &[String], device: &str) -> TriggerSource {
    let mut keys = default_peripheral_hotkeys();
    for k in extra {
        let c = canonical_trigger(k);
        if matches!(c.as_str(), "Volume_Up" | "Volume_Down") {
            for volume_key in ["Volume_Down", "Volume_Up"] {
                if !keys.iter().any(|x| x == volume_key) {
                    keys.push(volume_key.to_string());
                }
            }
            continue;
        }
        let hotkey = if c == "AutoTrigger" { k.to_string() } else { c };
        if !hotkey.is_empty() && !keys.iter().any(|x| x == &hotkey) {
            keys.push(hotkey);
        }
    }
    TriggerSource {
        id: "source_peripheral_mixed".into(),
        label: "      ".into(),
        mode: "single_press".into(),
        grouping: "same_source_group".into(),
        raw_events: keys
            .iter()
            .map(|k| peripheral_raw_event_with_device(k, device))
            .collect(),
    }
}

///                            ?
#[allow(dead_code)]
pub fn make_volume_mixed_source() -> TriggerSource {
    make_peripheral_mixed_source(&[])
}

pub fn hotkey_from_raw_event(r: &RawEvent) -> Option<String> {
    if !r.hotkey.is_empty() && r.hotkey != "AutoTrigger" {
        return Some(canonical_trigger(&r.hotkey));
    }
    match r.key.as_str() {
        "AudioVolumeUp" | "Volume_Up" => Some("Volume_Up".into()),
        "AudioVolumeDown" | "Volume_Down" => Some("Volume_Down".into()),
        "AudioVolumeMute" | "Volume_Mute" => Some("Volume_Mute".into()),
        k if !k.is_empty() && k != "AutoTrigger" => Some(k.to_string()),
        _ => None,
    }
}

fn mapping_matches_device(m: &MappingEntry, event_device: Option<&str>) -> bool {
    let filter = m.trigger_device.trim();
    if filter.is_empty() {
        return true;
    }
    let incoming = event_device.unwrap_or("").trim();
    if incoming.is_empty() {
        return false;
    }
    crate::press_gesture::devices_match(filter, incoming)
}

pub fn effective_physical_bindings(m: &MappingEntry) -> Vec<String> {
    if m.native_key_restore {
        return vec![];
    }
    mapping_physical_bindings(m)
}

/// Physical bindings registered with the hotkey thread, including device-prefixed wire keys.
pub fn hotkey_registration_bindings(m: &MappingEntry) -> Vec<String> {
    let physical = effective_physical_bindings(m);
    let device = m.trigger_device.trim();
    if device.is_empty() {
        return physical;
    }
    let mut out = physical.clone();
    for pb in physical {
        let prefixed = crate::press_gesture::format_device_key(device, &pb);
        if !out.contains(&prefixed) {
            out.push(prefixed);
        }
    }
    out
}

pub fn mapping_physical_bindings(m: &MappingEntry) -> Vec<String> {
    let tk = canonical_trigger(&m.trigger_key);
    if tk.contains('+') {
        if is_allowed_trigger(&tk) {
            return vec![tk];
        }
        return vec![];
    }
    if let Some(src) = &m.trigger_source {
        let from_raw: Vec<String> = src
            .raw_events
            .iter()
            .filter_map(hotkey_from_raw_event)
            .filter(|k| is_allowed_trigger(k))
            .collect();
        if !from_raw.is_empty() {
            let mut out = Vec::new();
            for k in from_raw {
                if !out.contains(&k) {
                    out.push(k);
                }
            }
            return out;
        }
    }
    if canonical_trigger(&m.trigger_key) == "AutoTrigger" {
        return vec!["Volume_Down".into(), "Volume_Up".into()];
    }
    if !is_allowed_trigger(&tk) {
        return vec![];
    }
    physical_bindings(&m.trigger_key)
}

fn needs_autotrigger_default_source(m: &MappingEntry) -> bool {
    if canonical_trigger(&m.trigger_key) != "AutoTrigger" {
        return false;
    }
    m.trigger_source
        .as_ref()
        .map(|s| s.raw_events.is_empty())
        .unwrap_or(true)
}

pub fn ensure_autotrigger_bindings(m: &mut MappingEntry) {
    if !needs_autotrigger_default_source(m) {
        return;
    }
    let hint = if is_volume_hotkey(&m.source_key) {
        canonical_trigger(&m.source_key)
    } else if is_peripheral_trigger_key(&m.source_key) {
        canonical_trigger(&m.source_key)
    } else {
        "Volume_Down".into()
    };
    apply_peripheral_autotrigger(m, &hint);
}

pub fn apply_autotrigger_source(m: &mut MappingEntry) {
    if canonical_trigger(&m.trigger_key) != "AutoTrigger" {
        return;
    }
    m.trigger_key = "AutoTrigger".into();
    if let Some(src) = &mut m.trigger_source {
        src.raw_events.retain(|r| !r.hotkey.trim().is_empty());
    }
}

pub fn apply_peripheral_autotrigger(m: &mut MappingEntry, captured: &str) {
    apply_peripheral_autotrigger_with_device(m, captured, "");
}

pub fn apply_peripheral_autotrigger_with_device(
    m: &mut MappingEntry,
    captured: &str,
    device: &str,
) {
    m.trigger_key = "AutoTrigger".into();
    let extra = if captured.trim().is_empty() || canonical_trigger(captured) == "AutoTrigger" {
        vec![]
    } else {
        vec![captured.to_string()]
    };
    if !device.trim().is_empty() {
        m.trigger_device = crate::device_identity::stable_id_from_path(device.trim());
    }
    if m.source_key.trim().is_empty() {
        m.source_key = if extra.is_empty() {
            "AutoTrigger".into()
        } else {
            canonical_trigger(&extra[0])
        };
    }
    m.trigger_source = Some(make_peripheral_mixed_source_with_device(&extra, device));
}

impl Default for VoiceConfig {
    fn default() -> Self {
        let id = new_mapping_id();
        Self {
            version: 6,
            mappings: vec![MappingEntry {
                id: id.clone(),
                label: "AutoTrigger  ?RAlt".into(),
                group: default_group(),
                trigger_key: "AutoTrigger".into(),
                target_key: "RAlt".into(),
                enabled: true,
                order: 0,
                trigger_mode: TriggerMode::Tap,
                trigger_source: None,
                source_key: String::new(),
                source_time: String::new(),
                interval_ms: default_interval_ms(),
                enter_delay_ms: default_enter_delay_ms(),
                cancel_enabled: true,
                auto_enter_enabled: true,
                switch_keys: vec![],
                native_key_restore: false,
                trigger_device: String::new(),
                long_press_ms: default_long_press_ms(),
                double_click_ms: default_double_click_ms(),
                ime_preset_id: String::new(),
                app_target_id: String::new(),
                app_behavior_rules: vec![],
                voice_override: None,
                voice_commands: vec![],
                acoustic_voice_commands: vec![],
            }],
            trash: vec![],
            interval_ms: default_interval_ms(),
            enter_delay_ms: default_enter_delay_ms(),
            cancel_enabled: true,
            auto_enter_enabled: true,
            debounce_ms: default_debounce_ms(),
            key_press_duration_ms: default_key_press_duration_ms(),
            voice_sapi: VoiceSapiConfig::default(),
            voice_vosk: VoiceVoskConfig::default(),
            voice_kws: VoiceKwsConfig::default(),
            voice_end: VoiceEndConfig::default(),
            scenes: None,
            scheme_switch_key: String::new(),
            key_wake_sound_enabled: false,
            coach_hud_enabled: false,
            sounds: SoundsConfig::default(),
            start_minimized_to_tray: false,
            window_layout_seen: false,
            window_maximized: false,
            window_width: default_window_width(),
            window_height: default_window_height(),
            window_x: None,
            window_y: None,
            ime_preset_id: String::new(),
            active_scene_id: id,
            record_key: String::new(),
            target_key: String::new(),
            trigger_source: None,
            actions: None,
        }
    }
}

impl MappingEntry {
    pub fn display_label(&self) -> String {
        if !self.label.is_empty() {
            return self.label.clone();
        }
        format!("{}  ?{}", self.trigger_key, self.target_key)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConflictKind {
    CanonicalTrigger,
    PhysicalKey,
}

#[derive(Debug, Clone)]
pub struct Conflict {
    pub kind: ConflictKind,
    pub other_id: String,
    pub detail: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
    pub mapping_id: String,
    pub other_id: String,
    pub kind: String,
    pub detail: String,
}

impl ConflictKind {
    fn as_str(&self) -> &'static str {
        match self {
            ConflictKind::CanonicalTrigger => "canonical",
            ConflictKind::PhysicalKey => "physical",
        }
    }
}

fn is_mapping_complete(m: &MappingEntry) -> bool {
    !m.trigger_key.trim().is_empty() && !m.target_key.trim().is_empty()
}

pub fn mapping_is_complete(m: &MappingEntry) -> bool {
    is_mapping_complete(m)
}

pub fn is_workflow_app_target(app_target_id: &str) -> bool {
    matches!(
        app_target_id.trim(),
        "cursor-chat" | "codex-chat" | "claude-code" | "minimax-chat"
    )
}

pub fn mapping_timing(m: &MappingEntry, cfg: &VoiceConfig) -> (u32, u32, bool, bool) {
    let interval = if m.interval_ms >= 200 {
        m.interval_ms
    } else {
        cfg.interval_ms
    };
    let enter_delay = if m.enter_delay_ms >= 1000 {
        m.enter_delay_ms
    } else {
        cfg.enter_delay_ms
    };
    (
        interval,
        enter_delay,
        m.cancel_enabled,
        m.auto_enter_enabled,
    )
}

pub fn apply_finish_mode_to_mapping(mapping: &mut MappingEntry, finish_mode: &str) {
    match finish_mode.trim().to_lowercase().as_str() {
        "perpress" | "hold" | "longpress" => {
            mapping.trigger_mode = TriggerMode::PerPress;
        }
        "confirm" => {
            mapping.trigger_mode = TriggerMode::Tap;
            mapping.cancel_enabled = true;
            mapping.auto_enter_enabled = true;
        }
        _ => {
            mapping.trigger_mode = TriggerMode::Tap;
            mapping.cancel_enabled = false;
            mapping.auto_enter_enabled = false;
        }
    }
}

pub fn effective_mapping_for_trigger(
    mapping: &MappingEntry,
    foreground: Option<&crate::app_identity::AppIdentity>,
) -> MappingEntry {
    let mut effective = mapping.clone();
    let Some(identity) = foreground else {
        return effective;
    };
    if let Some(rule) = match_behavior_rule(&mapping.app_behavior_rules, identity) {
        apply_finish_mode_to_mapping(&mut effective, &rule.finish_mode);
    }
    effective
}

impl VoiceConfig {
    pub fn migrate(&mut self) {
        if self.version >= 6 && !self.mappings.is_empty() {
            self.normalize();
            return;
        }

        if self.version >= 5 && !self.mappings.is_empty() {
            self.migrate_v5_to_v6();
            self.normalize();
            return;
        }

        if self.version >= 4 && !self.mappings.is_empty() {
            for m in &mut self.mappings {
                if m.switch_keys.is_empty() {
                    m.switch_keys = vec![];
                }
            }
            for m in &mut self.trash {
                if m.switch_keys.is_empty() {
                    m.switch_keys = vec![];
                }
            }
            self.version = 5;
            self.migrate_v5_to_v6();
            self.normalize();
            return;
        }

        if self.version >= 3 && !self.mappings.is_empty() {
            let g_interval = self.interval_ms;
            let g_enter = self.enter_delay_ms;
            let g_cancel = self.cancel_enabled;
            let g_auto = self.auto_enter_enabled;
            for m in &mut self.mappings {
                if m.interval_ms < 200 {
                    m.interval_ms = g_interval;
                }
                if m.enter_delay_ms < 1000 {
                    m.enter_delay_ms = g_enter;
                }
            }
            for m in &mut self.trash {
                if m.interval_ms < 200 {
                    m.interval_ms = g_interval;
                }
                if m.enter_delay_ms < 1000 {
                    m.enter_delay_ms = g_enter;
                }
                m.cancel_enabled = g_cancel;
                m.auto_enter_enabled = g_auto;
            }
            self.version = 5;
            self.migrate_v5_to_v6();
            self.normalize();
            return;
        }

        if self.mappings.is_empty() {
            let trigger = if self.record_key.is_empty() {
                "AutoTrigger".into()
            } else {
                canonical_trigger(&self.record_key)
            };
            let target = if self.target_key.is_empty() {
                "RAlt".into()
            } else {
                self.target_key.clone()
            };
            self.mappings.push(MappingEntry {
                id: new_mapping_id(),
                label: format!("{trigger}  ?{target}"),
                group: default_group(),
                trigger_key: trigger,
                target_key: target,
                enabled: true,
                order: 0,
                trigger_mode: TriggerMode::Tap,
                trigger_source: self.trigger_source.clone(),
                source_key: String::new(),
                source_time: String::new(),
                interval_ms: self.interval_ms,
                enter_delay_ms: self.enter_delay_ms,
                cancel_enabled: self.cancel_enabled,
                auto_enter_enabled: self.auto_enter_enabled,
                switch_keys: vec![],
                native_key_restore: false,
                trigger_device: String::new(),
                long_press_ms: default_long_press_ms(),
                double_click_ms: default_double_click_ms(),
                ime_preset_id: String::new(),
                app_target_id: String::new(),
                app_behavior_rules: vec![],
                voice_override: None,
                voice_commands: vec![],
                acoustic_voice_commands: vec![],
            });
        }

        self.version = 5;
        self.migrate_v5_to_v6();
        self.record_key.clear();
        self.target_key.clear();
        self.trigger_source = None;
        self.actions = None;
        self.normalize();
    }

    fn migrate_v5_to_v6(&mut self) {
        for m in &mut self.mappings {
            m.voice_override = normalize_voice_override(m.voice_override.take());
        }
        for m in &mut self.trash {
            m.voice_override = normalize_voice_override(m.voice_override.take());
        }
        if self.active_scene_id.is_empty() {
            self.active_scene_id = self.resolve_default_active_scene_id();
        }
        self.version = 6;
    }

    pub fn resolve_default_active_scene_id(&self) -> String {
        let mut enabled: Vec<_> = self
            .mappings
            .iter()
            .filter(|m| m.enabled && is_mapping_complete(m))
            .collect();
        enabled.sort_by_key(|m| m.order);
        if let Some(m) = enabled.first() {
            return m.id.clone();
        }
        self.mappings
            .iter()
            .find(|m| is_mapping_complete(m))
            .map(|m| m.id.clone())
            .or_else(|| self.mappings.first().map(|m| m.id.clone()))
            .unwrap_or_default()
    }

    pub fn ensure_active_scene_id(&mut self) {
        if self.active_scene_id.is_empty()
            || self.find_mapping_by_id(&self.active_scene_id).is_none()
        {
            self.active_scene_id = self.resolve_default_active_scene_id();
        }
    }

    pub fn normalize(&mut self) {
        if self.interval_ms < 200 {
            self.interval_ms = 200;
        }
        if self.enter_delay_ms < 1000 {
            self.enter_delay_ms = 1000;
        }
        if self.mappings.is_empty() {
            let preserved_trash = std::mem::take(&mut self.trash);
            *self = VoiceConfig::default();
            self.trash = preserved_trash;
        }
        if self.voice_sapi.phrases.iter().all(|p| p.trim().is_empty()) {
            self.voice_sapi.phrases = default_voice_sapi_phrases();
        }
        if self.voice_sapi.target_key.trim().is_empty() {
            self.voice_sapi.target_key = default_voice_sapi_target_key();
        }
        if self.voice_sapi.cooldown_ms < 200 {
            self.voice_sapi.cooldown_ms = default_voice_sapi_cooldown_ms();
        }
        if self.voice_sapi.min_confidence <= 0.0
            || (self.voice_sapi.min_confidence - 0.55).abs() < f32::EPSILON
        {
            self.voice_sapi.min_confidence = default_voice_sapi_min_confidence();
        }
        if self.voice_vosk.phrases.iter().all(|p| p.trim().is_empty()) {
            self.voice_vosk.phrases = default_voice_vosk_phrases();
        }
        if self.voice_vosk.target_key.trim().is_empty() {
            self.voice_vosk.target_key = default_voice_vosk_target_key();
        }
        if self.voice_vosk.cooldown_ms < 200 {
            self.voice_vosk.cooldown_ms = default_voice_vosk_cooldown_ms();
        }
        if self.voice_kws.phrases.iter().all(|p| p.trim().is_empty()) {
            self.voice_kws.phrases = default_voice_vosk_phrases();
        }
        if self.voice_kws.target_key.trim().is_empty() {
            self.voice_kws.target_key = default_voice_vosk_target_key();
        }
        if self.voice_kws.cooldown_ms < 200 {
            self.voice_kws.cooldown_ms = default_voice_vosk_cooldown_ms();
        }
        if self.voice_kws.model_preset.trim().is_empty() {
            self.voice_kws.model_preset = default_voice_kws_model_preset();
        }
        if self.voice_kws.model_path.trim().is_empty() {
            if let Some(path) = kws_preset_model_path(&self.voice_kws.model_preset) {
                self.voice_kws.model_path = path.to_string();
            } else {
                self.voice_kws.model_path = default_voice_kws_model_path();
            }
        }
        reconcile_voice_engine_flags(self);
        if self.voice_vosk.model_preset == "auto" {
            self.voice_vosk.model_preset = "cn-light".to_string();
        }
        if self.voice_vosk.model_preset.trim().is_empty()
            || (self.voice_vosk.model_preset != "custom"
                && vosk_preset_model_path(&self.voice_vosk.model_preset).is_none())
        {
            self.voice_vosk.model_preset = default_voice_vosk_model_preset();
            self.voice_vosk.phrases = default_voice_vosk_phrases_cn();
        }
        if self.voice_vosk.model_preset != "custom" {
            if let Some(path) = vosk_preset_model_path(&self.voice_vosk.model_preset) {
                self.voice_vosk.model_path = path.to_string();
            }
            reconcile_vosk_phrases_for_preset(&mut self.voice_vosk);
        } else if self.voice_vosk.model_path.trim().is_empty() {
            self.voice_vosk.model_path = default_voice_vosk_model_path();
        }
        if self
            .voice_end
            .phrases_zh
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.phrases_zh = default_voice_end_phrases_zh();
        }
        if self
            .voice_end
            .phrases_en
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.phrases_en = default_voice_end_phrases_en();
        }
        if self
            .voice_end
            .cancel_phrases_zh
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.cancel_phrases_zh = default_voice_end_cancel_phrases_zh();
        }
        if self
            .voice_end
            .cancel_phrases_en
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.cancel_phrases_en = default_voice_end_cancel_phrases_en();
        }
        if self.voice_end.commit_key.trim().is_empty() {
            self.voice_end.commit_key = default_voice_end_commit_key();
        }
        if self.voice_end.target_key.trim().is_empty() {
            self.voice_end.target_key = default_voice_end_target_key();
        }
        if self.voice_end.commit_delay_ms < 1000 {
            self.voice_end.commit_delay_ms = default_voice_end_commit_delay_ms();
        } else if self.voice_end.commit_delay_ms > 10000 {
            self.voice_end.commit_delay_ms = 10000;
        }
        if self.voice_end.dictation_timeout_ms < 10000 {
            self.voice_end.dictation_timeout_ms = default_voice_end_dictation_timeout_ms();
        }
        if self.key_wake_sound_enabled && !self.sounds.key_wake.enabled {
            self.sounds.key_wake.enabled = true;
        }
        self.sounds.normalize();
        for (i, m) in self.mappings.iter_mut().enumerate() {
            if m.id.is_empty() {
                m.id = new_mapping_id();
            }
            m.trigger_key = canonical_trigger(&m.trigger_key);
            apply_autotrigger_source(m);
            ensure_autotrigger_bindings(m);
            if m.source_key.trim().is_empty() {
                m.source_key = m
                    .trigger_source
                    .as_ref()
                    .and_then(|s| s.raw_events.first())
                    .map(|r| canonical_trigger(&r.hotkey))
                    .unwrap_or_else(|| m.trigger_key.clone());
            }
            if m.source_time.trim().is_empty() {
                m.source_time = String::new();
            }
            if m.group.is_empty() {
                m.group = default_group();
            }
            m.order = i as u32;
            if m.target_key.is_empty() && !mapping_should_keep_empty_target_key(m) {
                m.target_key = "RAlt".into();
            }
            if m.interval_ms < 200 {
                m.interval_ms = self.interval_ms;
            }
            if m.enter_delay_ms < 1000 {
                m.enter_delay_ms = self.enter_delay_ms;
            }
            m.voice_override = normalize_voice_override(m.voice_override.take());
            // Legacy configs may still carry triggerDevice full paths ??? migrate below.
            if !m.trigger_device.trim().is_empty() {
                let stable = crate::device_identity::normalize_device_id(&m.trigger_device);
                if stable.starts_with("dev:") {
                    m.trigger_device = stable;
                }
            }
            for rule in &mut m.app_behavior_rules {
                normalize_behavior_rule(rule);
            }
        }
        self.mappings.sort_by_key(|m| m.order);
        self.ensure_active_scene_id();
    }

    /// ??????? canonical trigger ??????????????????? enabled??????? (from_id, to_id)???
    /// ??????????????????????????? `active_scene_id`???
    pub fn cycle_scheme_same_trigger(&mut self) -> Option<(String, String)> {
        let active = self
            .mappings
            .iter()
            .find(|m| m.enabled && is_mapping_complete(m))?;
        let trigger = canonical_trigger(&active.trigger_key);
        let mut siblings: Vec<&MappingEntry> = self
            .mappings
            .iter()
            .filter(|m| is_mapping_complete(m) && canonical_trigger(&m.trigger_key) == trigger)
            .collect();
        if siblings.len() < 2 {
            return None;
        }
        siblings.sort_by_key(|m| m.order);
        let from_id = active.id.clone();
        let pos = siblings.iter().position(|m| m.id == from_id)?;
        let next = siblings[(pos + 1) % siblings.len()];
        let to_id = next.id.clone();
        if let Some(m) = self.mappings.iter_mut().find(|m| m.id == from_id) {
            m.enabled = false;
        }
        self.enable_mapping(&to_id);
        Some((from_id, to_id))
    }

    /// ?????????????????????????????????????????????? (from_id, to_id)???
    /// ????? `mapping.enabled`???
    pub fn select_scheme(&mut self, target_id: &str) -> Option<(String, String)> {
        if self.find_mapping_by_id(target_id).is_none() {
            return None;
        }
        let from_id = self.active_scene_id.clone();
        if from_id == target_id {
            return None;
        }
        self.active_scene_id = target_id.to_string();
        Some((from_id, target_id.to_string()))
    }

    /// ????????????????????? id?????????????????????
    pub fn set_active_scenario(&mut self, id: &str) -> bool {
        if self.find_mapping_by_id(id).is_none() {
            return false;
        }
        if self.active_scene_id == id {
            return false;
        }
        self.active_scene_id = id.to_string();
        true
    }

    /// ??????????????????????? (combo, mapping_id)???
    pub fn switch_bindings(&self) -> Vec<(String, String)> {
        let mut out = Vec::new();
        for m in &self.mappings {
            if !is_mapping_complete(m) {
                continue;
            }
            for key in &m.switch_keys {
                let k = key.trim();
                if !k.is_empty() {
                    out.push((k.to_string(), m.id.clone()));
                }
            }
        }
        out
    }

    pub fn mapping_ids(&self) -> HashSet<String> {
        self.mappings.iter().map(|m| m.id.clone()).collect()
    }

    pub fn active_mappings(&self) -> Vec<&MappingEntry> {
        let mut out: Vec<_> = self.mappings.iter().filter(|m| m.enabled).collect();
        out.sort_by_key(|m| m.order);
        out
    }

    pub fn find_mapping_by_id(&self, id: &str) -> Option<&MappingEntry> {
        self.mappings.iter().find(|m| m.id == id)
    }

    pub fn find_mapping_by_physical(&self, physical_key: &str) -> Option<&MappingEntry> {
        self.find_mapping_for_event(&crate::press_gesture::PhysicalKeyEvent {
            is_keyup: false,
            device: None,
            key: physical_key.to_string(),
        })
    }

    pub fn find_mapping_for_event(
        &self,
        event: &crate::press_gesture::PhysicalKeyEvent,
    ) -> Option<&MappingEntry> {
        let canonical = canonical_trigger(&event.key);
        for m in self.active_mappings() {
            if !mapping_matches_device(m, event.device.as_deref()) {
                continue;
            }
            if canonical_trigger(&m.trigger_key) == canonical {
                return Some(m);
            }
            for pb in mapping_physical_bindings(m) {
                if pb == event.key || pb == canonical {
                    return Some(m);
                }
            }
        }
        None
    }

    pub fn bindings(&self) -> Vec<String> {
        let mut out = Vec::new();
        for m in self.active_mappings() {
            for pb in hotkey_registration_bindings(m) {
                if !out.contains(&pb) {
                    out.push(pb);
                }
            }
        }
        out
    }

    pub fn conflicts_on_enable(&self, id: &str) -> Vec<Conflict> {
        let Some(entry) = self.find_mapping_by_id(id) else {
            return vec![];
        };
        let canonical = canonical_trigger(&entry.trigger_key);
        let physical: HashSet<String> = mapping_physical_bindings(entry).into_iter().collect();
        let mut conflicts = Vec::new();

        for other in self.mappings.iter().filter(|m| m.enabled && m.id != id) {
            let other_canonical = canonical_trigger(&other.trigger_key);
            if other_canonical == canonical {
                conflicts.push(Conflict {
                    kind: ConflictKind::CanonicalTrigger,
                    other_id: other.id.clone(),
                    detail: format!(
                        "{other_canonical} is already used by {}",
                        other.display_label()
                    ),
                });
            }
            for pb in mapping_physical_bindings(other) {
                if physical.contains(&pb) {
                    conflicts.push(Conflict {
                        kind: ConflictKind::PhysicalKey,
                        other_id: other.id.clone(),
                        detail: format!(
                            "physical key {pb} is already used by {}",
                            other.display_label()
                        ),
                    });
                    break;
                }
            }
        }
        conflicts
    }

    ///                    ?mapping id    ?
    pub fn enable_mapping(&mut self, id: &str) -> Vec<String> {
        let conflicts = self.conflicts_on_enable(id);
        let mut disabled = Vec::new();
        for c in conflicts {
            if let Some(other) = self.mappings.iter_mut().find(|m| m.id == c.other_id) {
                if other.enabled {
                    other.enabled = false;
                    disabled.push(other.id.clone());
                }
            }
        }
        if let Some(entry) = self.mappings.iter_mut().find(|m| m.id == id) {
            entry.enabled = true;
        }
        disabled
    }

    pub fn disable_mapping(&mut self, id: &str) {
        if let Some(entry) = self.mappings.iter_mut().find(|m| m.id == id) {
            entry.enabled = false;
        }
    }

    ///                   ?`conflicts_on_enable`        ?
    pub fn conflict_report(&self) -> Vec<ConflictReport> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for m in &self.mappings {
            for c in self.conflicts_on_enable(&m.id) {
                let (a, b) = if m.id < c.other_id {
                    (m.id.as_str(), c.other_id.as_str())
                } else {
                    (c.other_id.as_str(), m.id.as_str())
                };
                let key = format!("{a}|{b}|{}", c.kind.as_str());
                if seen.insert(key) {
                    out.push(ConflictReport {
                        mapping_id: m.id.clone(),
                        other_id: c.other_id.clone(),
                        kind: c.kind.as_str().into(),
                        detail: c.detail.clone(),
                    });
                }
            }
        }
        out
    }

    pub fn conflicts_for_mapping(&self, id: &str) -> Vec<ConflictReport> {
        self.conflicts_on_enable(id)
            .into_iter()
            .map(|c| ConflictReport {
                mapping_id: id.to_string(),
                other_id: c.other_id,
                kind: c.kind.as_str().into(),
                detail: c.detail,
            })
            .collect()
    }
}

static CONFIG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn config_candidate_paths() -> Vec<PathBuf> {
    [
        directories::ProjectDirs::from("com", "onetone", "app")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("com", "onetone", "onetone")
            .map(|d| d.config_dir().join("settings.json")),
        // Legacy oneTone branding (pre-com.onetone.* layout)
        directories::ProjectDirs::from("", "oneTone", "app")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("", "oneTone", "oneTone")
            .map(|d| d.config_dir().join("settings.json")),
        directories::ProjectDirs::from("com", "oneTone", "oneTone")
            .map(|d| d.config_dir().join("settings.json")),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn canonical_config_path() -> PathBuf {
    config_candidate_paths()
        .first()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("settings.json"))
}

fn resolve_config_path() -> PathBuf {
    let canonical = canonical_config_path();
    let mut best: Option<(PathBuf, VoiceConfig, usize)> = None;

    let mut consider = |path: PathBuf, cfg: VoiceConfig| {
        let score = cfg.mappings.len()
            + if cfg.voice_vosk.enabled { 4 } else { 0 }
            + if cfg.voice_sapi.enabled { 4 } else { 0 }
            + if cfg.voice_end.enabled { 4 } else { 0 };
        if best
            .as_ref()
            .is_none_or(|(_, _, prev_score)| score > *prev_score)
        {
            best = Some((path, cfg, score));
        }
    };

    for path in config_candidate_paths() {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(path, cfg);
            }
        }
    }

    if let Some(voice_pilot_dirs) =
        directories::ProjectDirs::from("com", "VoicePilot", "Voice Pilot")
    {
        let legacy_vp = voice_pilot_dirs.config_dir().join("settings.json");
        if legacy_vp.exists() {
            if let Ok(raw) = fs::read_to_string(&legacy_vp) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(legacy_vp, cfg);
            }
        }
    }

    for path in legacy_config_candidates() {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                let mut cfg = serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default();
                cfg.migrate();
                consider(path, cfg);
            }
        }
    }

    if let Some((source, cfg, _)) = best {
        if source != canonical {
            if let Some(parent) = canonical.parent() {
                fs::create_dir_all(parent).ok();
            }
            let json = serde_json::to_string_pretty(&cfg).unwrap();
            if fs::write(&canonical, json).is_ok() {
                return canonical;
            }
        }
        return source;
    }

    canonical
}

pub fn config_path() -> PathBuf {
    CONFIG_PATH.get_or_init(resolve_config_path).clone()
}

/// Apply a frontend mapping save. Voice sections always stay from `existing` because
/// toggles are persisted only via voice IPC commands (`cmd_voice_vosk_set_enabled`, etc.).
pub fn merge_save_payload(existing: &VoiceConfig, json: &str) -> Option<VoiceConfig> {
    let mut cfg: VoiceConfig = serde_json::from_str(json).ok()?;
    for m in &mut cfg.mappings {
        if m.app_behavior_rules.is_empty() {
            if let Some(prev) = existing.mappings.iter().find(|x| x.id == m.id) {
                if !prev.app_behavior_rules.is_empty() {
                    m.app_behavior_rules = prev.app_behavior_rules.clone();
                }
            }
        }
    }
    for m in &mut cfg.trash {
        if m.app_behavior_rules.is_empty() {
            if let Some(prev) = existing.trash.iter().find(|x| x.id == m.id) {
                if !prev.app_behavior_rules.is_empty() {
                    m.app_behavior_rules = prev.app_behavior_rules.clone();
                }
            }
        }
    }
    cfg.voice_vosk = existing.voice_vosk.clone();
    cfg.voice_sapi = existing.voice_sapi.clone();
    cfg.voice_kws = existing.voice_kws.clone();
    cfg.voice_end = existing.voice_end.clone();
    cfg.start_minimized_to_tray = existing.start_minimized_to_tray;
    cfg.window_layout_seen = existing.window_layout_seen;
    cfg.window_maximized = existing.window_maximized;
    cfg.window_width = existing.window_width;
    cfg.window_height = existing.window_height;
    cfg.window_x = existing.window_x;
    cfg.window_y = existing.window_y;
    Some(cfg)
}

pub fn should_show_main_on_startup(cfg: &VoiceConfig) -> bool {
    !cfg.start_minimized_to_tray
}

pub fn prefer_vosk_when_both_voice_engines_enabled(cfg: &mut VoiceConfig) -> bool {
    reconcile_voice_engine_flags(cfg)
}

fn legacy_config_candidates() -> Vec<PathBuf> {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    vec![
        exe_dir.join("voice_input_settings.json"),
        exe_dir.join("settings.json"),
        PathBuf::from("voice_input_settings.json"),
        PathBuf::from("settings.json"),
        PathBuf::from("../voice_input_settings.json"),
    ]
}

pub fn load_config() -> VoiceConfig {
    let path = config_path();
    let mut cfg = match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<VoiceConfig>(&raw).unwrap_or_default(),
        Err(_) => VoiceConfig::default(),
    };
    cfg.migrate();
    cfg
}

pub fn save_config(cfg: &VoiceConfig) {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(cfg).unwrap();
    fs::write(&path, json).ok();
}

pub fn apply_config(state: &AppState, cfg: &VoiceConfig) {
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.bind_all(&cfg.bindings());
        mgr.bind_scheme_select(cfg.switch_bindings());
        let switch_key = cfg.scheme_switch_key.trim();
        if switch_key.is_empty() {
            mgr.bind_scheme_switch(None);
        } else {
            mgr.bind_scheme_switch(Some(switch_key.to_string()));
        }
    }
    state.machine_pool.lock().prune(&cfg.mapping_ids());
}

pub fn start_watcher(state: Arc<AppState>, app: tauri::AppHandle) {
    let path = config_path();
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if matches!(event.kind, EventKind::Modify(_)) {
                    tx.send(()).ok();
                }
            }
        })
        .ok();

        if let Some(w) = &mut watcher {
            if let Some(parent) = path.parent() {
                w.watch(parent, RecursiveMode::NonRecursive).ok();
            }
            let mut last_emit = std::time::Instant::now() - std::time::Duration::from_secs(10);
            loop {
                if rx.recv_timeout(Duration::from_millis(500)).is_ok() {
                    if last_emit.elapsed() < Duration::from_millis(1500) {
                        continue;
                    }
                    let mut new_cfg = load_config();
                    new_cfg.migrate();
                    new_cfg.normalize();
                    let normalized_voice_engine =
                        prefer_vosk_when_both_voice_engines_enabled(&mut new_cfg);

                    let old_cfg = state.cfg.lock().clone();
                    {
                        *state.cfg.lock() = new_cfg.clone();
                    }
                    apply_config(&state, &new_cfg);
                    crate::voice_bootstrap::apply_voice_config_change(
                        &app, &state, &old_cfg, &new_cfg,
                    );
                    let payload = ipc::mvp_init_payload(&state, "unchanged");
                    ipc::emit_to_main_if_available(&app, Some(&state), payload);
                    if normalized_voice_engine {
                        crate::app_log::log_line(
                            &state,
                            "config",
                            "voice config normalized in memory: vosk preferred over sapi",
                        );
                    }
                    crate::app_log::log_line(&state, "config", "config file changed");
                    crate::runtime_event::publish_runtime_event(
                        Some(&app),
                        &state,
                        "config",
                        crate::runtime_event::kind::CONFIG_CHANGED,
                        "config file changed",
                        None,
                    );
                    crate::tray::refresh_menu(&app);
                    last_emit = std::time::Instant::now();
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_identity::AppIdentity;

    fn test_identity(preset: Option<&str>, exe: &str) -> AppIdentity {
        AppIdentity {
            pid: 1,
            exe_name: exe.to_string(),
            full_path: Some(format!(r"C:\fake\{exe}")),
            window_title: String::new(),
            matched_preset_app_id: preset.map(|s| s.to_string()),
        }
    }

    fn test_rule(app_id: &str, finish_mode: &str) -> AppBehaviorRule {
        AppBehaviorRule {
            rule_id: new_rule_id(),
            app_id: app_id.to_string(),
            finish_mode: finish_mode.to_string(),
            note: None,
            summon_phrase: None,
            app_match: None,
            display_name: None,
        }
    }

    #[test]
    fn start_minimized_to_tray_missing_field_means_show() {
        let cfg: VoiceConfig =
            serde_json::from_str(r#"{"version":5,"mappings":[],"trash":[]}"#).unwrap();
        assert!(!cfg.start_minimized_to_tray);
        assert!(should_show_main_on_startup(&cfg));
    }

    #[test]
    fn start_minimized_to_tray_explicit_true_means_hide() {
        let cfg: VoiceConfig = serde_json::from_str(
            r#"{"version":5,"mappings":[],"trash":[],"startMinimizedToTray":true}"#,
        )
        .unwrap();
        assert!(!should_show_main_on_startup(&cfg));
    }

    #[test]
    fn hot_reload_voice_engine_prefers_vosk_in_memory() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.enabled = true;
        cfg.voice_sapi.enabled = true;

        assert!(prefer_vosk_when_both_voice_engines_enabled(&mut cfg));
        assert!(cfg.voice_vosk.enabled);
        assert!(!cfg.voice_sapi.enabled);
    }

    #[test]
    fn hot_reload_voice_engine_keeps_sapi_when_vosk_off() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_sapi.enabled = true;

        assert!(!prefer_vosk_when_both_voice_engines_enabled(&mut cfg));
        assert!(!cfg.voice_vosk.enabled);
        assert!(cfg.voice_sapi.enabled);
    }

    #[test]
    fn reconcile_voice_engine_flags_prefers_vosk_over_kws() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_vosk.enabled = true;
        cfg.voice_kws.enabled = true;
        assert!(reconcile_voice_engine_flags(&mut cfg));
        assert!(cfg.voice_vosk.enabled);
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn reconcile_voice_engine_flags_prefers_sapi_over_kws() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_sapi.enabled = true;
        cfg.voice_kws.enabled = true;
        assert!(reconcile_voice_engine_flags(&mut cfg));
        assert!(cfg.voice_sapi.enabled);
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn merge_save_payload_preserves_voice_kws() {
        let mut existing = VoiceConfig::default();
        existing.voice_kws.enabled = true;
        let json = r#"{"version":5,"mappings":[],"trash":[],"voiceKws":{"enabled":false}}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.voice_kws.enabled);
    }

    #[test]
    fn migrate_v2_to_v3() {
        let mut cfg = VoiceConfig {
            version: 2,
            record_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            mappings: vec![],
            ..Default::default()
        };
        cfg.migrate();
        assert_eq!(cfg.version, 6);
        assert_eq!(cfg.mappings.len(), 1);
        assert_eq!(cfg.mappings[0].trigger_key, "AutoTrigger");
        assert_eq!(cfg.mappings[0].target_key, "F2");
    }

    #[test]
    fn physical_conflict_autotrigger_vs_volume_down() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings.push(MappingEntry {
            id: "a".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "Volume_Down".into(),
            target_key: "F2".into(),
            enabled: true,
            order: 1,
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        let conflicts = cfg.conflicts_on_enable(&cfg.mappings[0].id);
        assert!(!conflicts.is_empty());
        assert!(matches!(conflicts[0].kind, ConflictKind::PhysicalKey));
    }

    #[test]
    fn enable_disables_conflicts() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        cfg.enable_mapping("b");
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn voice_only_mapping_keeps_empty_keys_after_normalize() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings.push(MappingEntry {
            id: "voice-only".into(),
            label: String::new(),
            group: "Voice shell".into(),
            trigger_key: String::new(),
            target_key: String::new(),
            enabled: false,
            order: 1,
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: Some(VoiceOverride {
                wake_phrases: Some(vec!["????".into()]),
                ..VoiceOverride::default()
            }),
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        cfg.normalize();
        let m = cfg
            .mappings
            .iter()
            .find(|x| x.id == "voice-only")
            .expect("voice-only mapping");
        assert!(m.trigger_key.is_empty());
        assert!(m.target_key.is_empty());
        assert!(m.voice_override.is_some());
    }

    #[test]
    fn autotrigger_without_source_binds_volume_keys() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].trigger_source = None;
        cfg.mappings[0].source_key = "AutoTrigger".into();
        cfg.normalize();
        let bindings = mapping_physical_bindings(&cfg.mappings[0]);
        assert!(bindings.contains(&"Volume_Down".to_string()));
        assert!(bindings.contains(&"Volume_Up".to_string()));
        assert!(cfg.mappings[0].trigger_source.is_some());
    }

    #[test]
    fn cycle_scheme_same_trigger_rotates() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger ??? F2".into(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        let result = cfg.cycle_scheme_same_trigger();
        assert!(result.is_some());
        let (_, to_id) = result.unwrap();
        assert_eq!(to_id, "b");
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn mapping_bindings_follow_trigger_source() {
        let m = MappingEntry {
            id: "x".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            trigger_source: Some(TriggerSource {
                id: "source_captured".into(),
                label: "      ".into(),
                mode: "single_press".into(),
                grouping: "exact".into(),
                raw_events: vec![RawEvent {
                    device: "keyboard".into(),
                    key: "F1".into(),
                    code: "F1".into(),
                    location: 0,
                    event_type: "keydown".into(),
                    hotkey: "F1".into(),
                    label: "F1".into(),
                    button: None,
                }],
            }),
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        };
        let bindings = mapping_physical_bindings(&m);
        assert_eq!(bindings, vec!["F1".to_string()]);
    }

    #[test]
    fn autotrigger_volume_capture_binds_both_directions() {
        let mut m = MappingEntry {
            id: "y6".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: String::new(),
            target_key: "RAlt".into(),
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        };
        apply_peripheral_autotrigger(&mut m, "Volume_Down");
        let bindings = mapping_physical_bindings(&m);
        assert_eq!(
            bindings,
            vec!["Volume_Down".to_string(), "Volume_Up".to_string()]
        );
    }

    #[test]
    fn select_scheme_by_id() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger ??? F2".into(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec!["Ctrl+Alt+1".into()],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        let result = cfg.select_scheme("b");
        assert!(result.is_some());
        assert_eq!(cfg.active_scene_id, "b");
        assert!(cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(!cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn enable_mapping_does_not_change_active_scenario() {
        let mut cfg = VoiceConfig::default();
        let active_id = cfg.active_scene_id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger ??? F2".into(),
            group: "  ".into(),
            trigger_key: "F1".into(),
            target_key: "F2".into(),
            enabled: false,
            order: 1,
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        cfg.enable_mapping("b");
        assert_eq!(cfg.active_scene_id, active_id);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
    }

    #[test]
    fn native_key_restore_skips_active_bindings() {
        let mut m = MappingEntry {
            id: "z".into(),
            label: String::new(),
            group: "  ".into(),
            trigger_key: "AutoTrigger".into(),
            target_key: "RAlt".into(),
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
            native_key_restore: true,
            trigger_device: String::new(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        };
        apply_peripheral_autotrigger(&mut m, "Volume_Down");
        assert!(!mapping_physical_bindings(&m).is_empty());
        assert!(effective_physical_bindings(&m).is_empty());
    }

    #[test]
    fn switch_bindings_collects_per_mapping() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].switch_keys = vec!["Ctrl+Alt+1".into(), "Ctrl+Alt+2".into()];
        let bindings = cfg.switch_bindings();
        assert_eq!(bindings.len(), 2);
        assert!(bindings.iter().all(|(_, id)| id == &cfg.mappings[0].id));
    }
    #[test]
    fn merge_save_payload_preserves_voice_when_omitted() {
        let mut existing = VoiceConfig::default();
        existing.voice_vosk.enabled = true;
        existing.voice_end.enabled = true;
        let json = r#"{"version":5,"mappings":[],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.voice_vosk.enabled);
        assert!(merged.voice_end.enabled);
    }

    #[test]
    fn merge_save_payload_ignores_stale_frontend_voice_flags() {
        let mut existing = VoiceConfig::default();
        existing.voice_vosk.enabled = true;
        existing.voice_end.enabled = true;
        let json = r#"{"version":5,"mappings":[],"trash":[],"voiceVosk":{"enabled":false},"voiceEnd":{"enabled":false}}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.voice_vosk.enabled);
        assert!(merged.voice_end.enabled);
    }

    #[test]
    fn merge_save_payload_preserves_window_layout() {
        let mut existing = VoiceConfig::default();
        existing.window_layout_seen = true;
        existing.window_maximized = false;
        existing.window_width = 900.0;
        existing.window_height = 950.0;
        existing.window_x = Some(120.0);
        existing.window_y = Some(80.0);
        let json = r#"{"version":5,"mappings":[],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(merged.window_layout_seen);
        assert!(!merged.window_maximized);
        assert!((merged.window_width - 900.0).abs() < f64::EPSILON);
        assert!((merged.window_height - 950.0).abs() < f64::EPSILON);
        assert_eq!(merged.window_x, Some(120.0));
        assert_eq!(merged.window_y, Some(80.0));
    }

    #[test]
    fn hotkey_registration_includes_device_prefixed_bindings() {
        let m = MappingEntry {
            id: "pad".into(),
            label: String::new(),
            group: String::new(),
            trigger_key: "Gamepad_A".into(),
            target_key: "F2".into(),
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
            trigger_device: "xinput:0".into(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        };
        let bindings = hotkey_registration_bindings(&m);
        assert!(bindings.contains(&"Gamepad_A".to_string()));
        assert!(bindings.contains(&"dev:xinput:0::Gamepad_A".to_string()));
    }

    #[test]
    fn find_mapping_respects_trigger_device() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].trigger_key = "Gamepad_A".into();
        cfg.mappings[0].trigger_device = "xinput:0".into();
        cfg.mappings.push(MappingEntry {
            id: "pad1".into(),
            label: String::new(),
            group: String::new(),
            trigger_key: "Gamepad_A".into(),
            target_key: "F3".into(),
            enabled: true,
            order: 1,
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
            trigger_device: "xinput:1".into(),
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        });
        let hit0 = cfg.find_mapping_for_event(&crate::press_gesture::PhysicalKeyEvent {
            is_keyup: false,
            device: Some("xinput:0".into()),
            key: "Gamepad_A".into(),
        });
        let hit1 = cfg.find_mapping_for_event(&crate::press_gesture::PhysicalKeyEvent {
            is_keyup: false,
            device: Some("xinput:1".into()),
            key: "Gamepad_A".into(),
        });
        assert_eq!(
            hit0.map(|m| m.id.as_str()),
            Some(cfg.mappings[0].id.as_str())
        );
        assert_eq!(hit1.map(|m| m.id.as_str()), Some("pad1"));
    }

    #[test]
    fn window_layout_serializes_to_json() {
        let mut cfg = VoiceConfig::default();
        cfg.window_layout_seen = true;
        cfg.window_maximized = false;
        cfg.window_width = 1024.0;
        cfg.window_height = 768.0;
        cfg.window_x = Some(40.0);
        cfg.window_y = Some(20.0);
        let json = serde_json::to_string(&cfg).expect("serialize");
        assert!(json.contains("\"windowLayoutSeen\":true"));
        assert!(json.contains("\"windowWidth\":1024"));
        assert!(json.contains("\"windowX\":40"));
        let loaded: VoiceConfig = serde_json::from_str(&json).expect("deserialize");
        assert!(loaded.window_layout_seen);
        assert!((loaded.window_width - 1024.0).abs() < f64::EPSILON);
        assert_eq!(loaded.window_x, Some(40.0));
    }

    #[test]
    fn effective_mapping_applies_app_behavior_rule() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.trigger_mode = TriggerMode::Tap;
        mapping.cancel_enabled = true;
        mapping.auto_enter_enabled = true;
        mapping.app_behavior_rules = vec![test_rule("cursor-chat", "perpress")];
        let effective =
            effective_mapping_for_trigger(&mapping, Some(&test_identity(Some("cursor-chat"), "Cursor.exe")));
        assert_eq!(effective.trigger_mode, TriggerMode::PerPress);
        let fallback =
            effective_mapping_for_trigger(&mapping, Some(&test_identity(Some("codex-chat"), "Codex.exe")));
        assert_eq!(fallback.trigger_mode, TriggerMode::Tap);
        assert!(fallback.cancel_enabled);
        assert!(fallback.auto_enter_enabled);
    }

    #[test]
    fn explicit_custom_match_beats_preset_fallback() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.trigger_mode = TriggerMode::Tap;
        mapping.app_behavior_rules = vec![
            test_rule("cursor-chat", "perpress"),
            AppBehaviorRule {
                rule_id: new_rule_id(),
                app_id: "custom".into(),
                finish_mode: "manual".into(),
                note: None,
                summon_phrase: None,
                display_name: Some("Cursor custom".into()),
                app_match: Some(AppMatchSpec {
                    exe_names: vec!["Cursor.exe".into()],
                    path_contains: Some("Programs\\cursor".into()),
                    title_contains: None,
                    full_path: None,
                }),
            },
        ];
        let identity = AppIdentity {
            pid: 2,
            exe_name: "Cursor.exe".into(),
            full_path: Some(r"C:\Users\me\AppData\Local\Programs\cursor\Cursor.exe".into()),
            window_title: "proj - Cursor".into(),
            matched_preset_app_id: Some("cursor-chat".into()),
        };
        let effective = effective_mapping_for_trigger(&mapping, Some(&identity));
        assert_eq!(effective.trigger_mode, TriggerMode::Tap);
        assert!(!effective.cancel_enabled);
    }

    #[test]
    fn app_match_requires_all_specified_fields() {
        let rule = AppBehaviorRule {
            rule_id: new_rule_id(),
            app_id: "custom".into(),
            finish_mode: "manual".into(),
            note: None,
            summon_phrase: None,
            display_name: None,
            app_match: Some(AppMatchSpec {
                exe_names: vec!["Code.exe".into()],
                path_contains: Some("Cursor".into()),
                title_contains: None,
                full_path: None,
            }),
        };
        let identity_exe_only = AppIdentity {
            pid: 3,
            exe_name: "Code.exe".into(),
            full_path: None,
            window_title: String::new(),
            matched_preset_app_id: None,
        };
        assert!(!rule_matches_identity(&rule, &identity_exe_only));
        let identity_both = AppIdentity {
            full_path: Some(r"C:\Cursor\Code.exe".into()),
            ..identity_exe_only
        };
        assert!(rule_matches_identity(&rule, &identity_both));
    }

    #[test]
    fn default_summon_phrase_respects_preset() {
        assert_eq!(default_summon_phrase("cursor-chat"), Some("打开 Cursor"));
        assert_eq!(
            default_summon_phrase_for_preset("cursor-chat", "cn-light"),
            Some("打开 Cursor")
        );
        assert_eq!(
            default_summon_phrase_for_preset("cursor-chat", "en-light"),
            Some("Open Cursor")
        );
    }

    #[test]
    fn primary_app_without_behavior_rule_uses_target_fallback() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.app_target_id = "cursor-chat".into();
        mapping.app_behavior_rules = vec![];
        let entries = summon_entries_for_mapping(&mapping, "cn-light");
        assert!(entries.len() >= 2);
        assert!(entries.iter().any(|e| e.0 == "Cursor旺"));
        assert!(entries.iter().any(|e| e.0 == "打开 Cursor"));
        assert!(entries.iter().all(|e| e.1 == "cursor-chat"));
    }

    #[test]
    fn summon_requires_explicit_behavior_rule() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.app_target_id = "cursor-chat".into();
        mapping.app_behavior_rules = vec![AppBehaviorRule {
            rule_id: String::new(),
            app_id: "cursor-chat".into(),
            finish_mode: "confirm".into(),
            note: None,
            summon_phrase: None,
            app_match: None,
            display_name: None,
        }];
        let entries = summon_entries_for_mapping(&mapping, "cn-light");
        assert!(entries.len() >= 2);
        assert!(entries.iter().any(|e| e.0 == "Cursor旺"));
        assert!(entries.iter().any(|e| e.0 == "打开 Cursor"));
        assert_eq!(entries[0].1, "cursor-chat");
    }

    #[test]
    fn reconcile_vosk_phrases_swaps_stale_cn_on_en_light() {
        let mut vosk = VoiceVoskConfig {
            enabled: true,
            phrases: vosk_preset_default_phrases("cn-light").unwrap(),
            target_key: default_voice_vosk_target_key(),
            cooldown_ms: default_voice_vosk_cooldown_ms(),
            model_path: VOSK_EN_LIGHT_REL.into(),
            model_preset: "en-light".into(),
        };
        reconcile_vosk_phrases_for_preset(&mut vosk);
        assert_eq!(
            vosk.phrases,
            vosk_preset_default_phrases("en-light").unwrap()
        );
    }

    #[test]
    fn distinct_custom_rules_same_exe_resolve_by_path() {
        let rules = vec![
            AppBehaviorRule {
                rule_id: "rule-wechat-a".into(),
                app_id: "custom".into(),
                finish_mode: "manual".into(),
                note: None,
                summon_phrase: None,
                display_name: Some("WeChat A".into()),
                app_match: Some(AppMatchSpec {
                    exe_names: vec!["WeChat.exe".into()],
                    path_contains: Some("Tencent\\WeChat".into()),
                    title_contains: None,
                    full_path: None,
                }),
            },
            AppBehaviorRule {
                rule_id: "rule-wechat-b".into(),
                app_id: "custom".into(),
                finish_mode: "perpress".into(),
                note: None,
                summon_phrase: None,
                display_name: Some("WeChat B".into()),
                app_match: Some(AppMatchSpec {
                    exe_names: vec!["WeChat.exe".into()],
                    path_contains: Some("Weixin".into()),
                    title_contains: None,
                    full_path: None,
                }),
            },
        ];
        let identity_a = AppIdentity {
            pid: 10,
            exe_name: "WeChat.exe".into(),
            full_path: Some(r"C:\Program Files\Tencent\WeChat\WeChat.exe".into()),
            window_title: "Chat".into(),
            matched_preset_app_id: None,
        };
        let matched = match_behavior_rule(&rules, &identity_a).unwrap();
        assert_eq!(matched.rule_id, "rule-wechat-a");
        assert_eq!(matched.finish_mode, "manual");

        let identity_b = AppIdentity {
            full_path: Some(r"D:\Weixin\WeChat.exe".into()),
            ..identity_a.clone()
        };
        let matched_b = match_behavior_rule(&rules, &identity_b).unwrap();
        assert_eq!(matched_b.rule_id, "rule-wechat-b");
    }

    #[test]
    fn path_contains_fails_when_full_path_missing() {
        let rule = AppBehaviorRule {
            rule_id: "rule-path-only".into(),
            app_id: "custom".into(),
            finish_mode: "manual".into(),
            note: None,
            summon_phrase: None,
            display_name: None,
            app_match: Some(AppMatchSpec {
                exe_names: vec!["WeChat.exe".into()],
                path_contains: Some("Tencent".into()),
                title_contains: None,
                full_path: None,
            }),
        };
        let identity = AppIdentity {
            pid: 11,
            exe_name: "WeChat.exe".into(),
            full_path: None,
            window_title: String::new(),
            matched_preset_app_id: None,
        };
        assert!(!rule_matches_identity(&rule, &identity));
    }

    #[test]
    fn exe_only_custom_matches_without_full_path() {
        let rule = AppBehaviorRule {
            rule_id: "rule-exe-only".into(),
            app_id: "custom".into(),
            finish_mode: "confirm".into(),
            note: None,
            summon_phrase: None,
            display_name: Some("WeChat generic".into()),
            app_match: Some(AppMatchSpec {
                exe_names: vec!["WeChat.exe".into()],
                path_contains: None,
                title_contains: None,
                full_path: None,
            }),
        };
        let identity = AppIdentity {
            pid: 12,
            exe_name: "WeChat.exe".into(),
            full_path: None,
            window_title: "????".into(),
            matched_preset_app_id: None,
        };
        let rules_one = vec![rule];
        let matched = match_behavior_rule(&rules_one, &identity).unwrap();
        assert_eq!(matched.rule_id, "rule-exe-only");
    }

    #[test]
    fn behavior_rules_json_round_trip_preserves_custom_fields() {
        let rules = vec![AppBehaviorRule {
            rule_id: "rule-save-1".into(),
            app_id: "custom".into(),
            finish_mode: "manual".into(),
            note: Some("note".into()),
            summon_phrase: None,
            display_name: Some("Microsoft Word".into()),
            app_match: Some(AppMatchSpec {
                exe_names: vec!["WINWORD.EXE".into()],
                path_contains: Some("Microsoft Office".into()),
                title_contains: Some("Document".into()),
                full_path: None,
            }),
        }];
        let json = serde_json::to_string(&rules).unwrap();
        let back: Vec<AppBehaviorRule> = serde_json::from_str(&json).unwrap();
        assert_eq!(back.len(), 1);
        let r = &back[0];
        assert_eq!(r.rule_id, "rule-save-1");
        assert_eq!(r.app_id, "custom");
        assert_eq!(r.finish_mode, "manual");
        assert_eq!(r.display_name.as_deref(), Some("Microsoft Word"));
        let spec = r.app_match.as_ref().unwrap();
        assert_eq!(spec.exe_names, vec!["WINWORD.EXE"]);
        assert_eq!(spec.path_contains.as_deref(), Some("Microsoft Office"));
        assert_eq!(spec.title_contains.as_deref(), Some("Document"));
    }

    #[test]
    fn voice_commands_inject_canonical_and_two_aliases() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.app_target_id = "cursor-chat".into();
        mapping.voice_commands = vec![VoiceCommand {
            id: "cmd1".into(),
            version: 1,
            kind: "scenario-activate".into(),
            engine_hint: "asr-text".into(),
            locale: "zh-CN".into(),
            scenario_id: mapping.id.clone(),
            canonical_phrase: "微信输入".into(),
            aliases: vec!["微信语音输入".into(), "微信开始输入".into(), "第三alias".into()],
            samples: vec![VoiceCommandSample {
                transcript: "采样不应注入".into(),
                confidence: None,
                source: "vosk".into(),
                quality_signals: None,
                created_at: 0,
            }],
            phonetic_key: String::new(),
            threshold: 0.8,
            margin: 0.06,
            quality: "good".into(),
            activation_scope: "global".into(),
            app_boost: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }];
        let phrases = voice_command_summon_phrases(&mapping);
        assert!(phrases.contains(&"微信输入".to_string()));
        assert!(phrases.contains(&"微信语音输入".to_string()));
        assert!(phrases.contains(&"微信开始输入".to_string()));
        assert!(!phrases.iter().any(|p| p == "第三alias"));
        assert!(!phrases.iter().any(|p| p.contains("采样")));
        let entries = summon_entries_for_mapping(&mapping, "cn-light");
        assert!(entries.iter().any(|(p, t)| p == "微信输入" && t == "cursor-chat"));
    }

    #[test]
    fn voice_commands_disabled_are_skipped() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.voice_commands = vec![VoiceCommand {
            id: "cmd-disabled".into(),
            version: 1,
            kind: "scenario-activate".into(),
            engine_hint: "asr-text".into(),
            locale: "zh-CN".into(),
            scenario_id: mapping.id.clone(),
            canonical_phrase: "不应出现".into(),
            aliases: vec!["也不应出现".into()],
            samples: vec![],
            phonetic_key: String::new(),
            threshold: 0.8,
            margin: 0.06,
            quality: "good".into(),
            activation_scope: "global".into(),
            app_boost: true,
            enabled: false,
            created_at: 0,
            updated_at: 0,
        }];
        let phrases = voice_command_summon_phrases(&mapping);
        assert!(phrases.is_empty());
    }

    #[test]
    fn acoustic_display_text_injects_global_summon() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.app_target_id = "cursor-chat".into();
        mapping.voice_commands = vec![];
        mapping.acoustic_voice_commands = vec![AcousticVoiceCommand {
            id: "ac1".into(),
            version: 1,
            kind: "scenario-acoustic-activate".into(),
            scenario_id: mapping.id.clone(),
            label: "开始编程".into(),
            display_text: "开始编程".into(),
            samples: vec![],
            threshold: 0.72,
            margin: 0.08,
            quality: "good".into(),
            activation_scope: "global".into(),
            app_boost: true,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }];
        let phrases = voice_command_summon_phrases(&mapping);
        assert!(phrases.contains(&"开始编程".to_string()));
        let entries = summon_entries_for_mapping(&mapping, "cn-light");
        assert!(entries.iter().any(|(p, t)| p == "开始编程" && t == "cursor-chat"));
    }

    fn sample_acoustic_feature(frames: u32) -> Vec<f32> {
        let len = (frames as usize) * (ACOUSTIC_FEATURE_DIMS as usize);
        (0..len).map(|i| (i as f32) * 0.01 + 0.1).collect()
    }

    fn sample_acoustic_command(scenario_id: &str, quality: &str) -> AcousticVoiceCommand {
        let frames = 40u32;
        AcousticVoiceCommand {
            id: "acmd_test".into(),
            version: 1,
            kind: "scenario-acoustic-activate".into(),
            scenario_id: scenario_id.into(),
            label: "????".into(),
            display_text: String::new(),
            samples: vec![AcousticVoiceCommandSample {
                id: "sample_test".into(),
                duration_ms: 900,
                feature: sample_acoustic_feature(frames),
                feature_kind: "mfcc-v1".into(),
                feature_frames: frames,
                feature_dims: ACOUSTIC_FEATURE_DIMS,
                sample_rate: 16000,
                quality_signals: Some(AcousticVoiceCommandQualitySignals {
                    has_speech: true,
                    too_short: false,
                    too_long: false,
                    sample_agreement: 0.91,
                }),
                created_at: 1,
            }],
            threshold: 0.78,
            margin: 0.08,
            quality: quality.into(),
            activation_scope: "global".into(),
            app_boost: true,
            enabled: true,
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn acoustic_voice_commands_round_trip_json() {
        let cmd = sample_acoustic_command("sc1", "good");
        let mapping = MappingEntry {
            id: "sc1".into(),
            label: "test".into(),
            group: default_group(),
            trigger_key: String::new(),
            target_key: "RAlt".into(),
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
            long_press_ms: default_long_press_ms(),
            double_click_ms: default_double_click_ms(),
            ime_preset_id: String::new(),
            app_target_id: "wechat".into(),
            app_behavior_rules: vec![],
            voice_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![cmd],
        };
        let json = serde_json::to_string(&mapping).expect("serialize");
        let back: MappingEntry = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.acoustic_voice_commands.len(), 1);
        assert_eq!(back.acoustic_voice_commands[0].samples[0].feature_frames, 40);
        assert_eq!(
            back.acoustic_voice_commands[0].samples[0].feature.len(),
            40 * ACOUSTIC_FEATURE_DIMS as usize
        );
    }

    #[test]
    fn acoustic_voice_commands_reject_nan_and_weak() {
        let mut bad = sample_acoustic_command("sc1", "good");
        bad.samples[0].feature[0] = f32::NAN;
        assert!(normalize_acoustic_voice_command_sample(bad.samples[0].clone()).is_none());

        let weak = sample_acoustic_command("sc1", "weak");
        let out = normalize_acoustic_voice_commands(vec![weak], "sc1");
        assert!(out.is_empty());
    }

    #[test]
    fn acoustic_voice_commands_rekey_on_duplicate() {
        let cmd = sample_acoustic_command("old", "good");
        let old_id = cmd.id.clone();
        let old_sample = cmd.samples[0].id.clone();
        let rekeyed = rekey_acoustic_voice_commands_for_mapping(&[cmd], "new");
        assert_eq!(rekeyed.len(), 1);
        assert_ne!(rekeyed[0].id, old_id);
        assert_eq!(rekeyed[0].scenario_id, "new");
        assert_ne!(rekeyed[0].samples[0].id, old_sample);
    }

    #[test]
    fn merge_save_payload_preserves_acoustic_voice_commands() {
        let mut existing = VoiceConfig::default();
        let mut cmd = sample_acoustic_command("sc1", "good");
        cmd.scenario_id = existing.mappings[0].id.clone();
        existing.mappings[0].acoustic_voice_commands = vec![cmd];
        let payload = serde_json::to_string(&existing).expect("payload");
        let merged = merge_save_payload(&existing, &payload).expect("merge");
        assert_eq!(merged.mappings[0].acoustic_voice_commands.len(), 1);
        assert_eq!(
            merged.mappings[0].acoustic_voice_commands[0].samples[0].feature_dims,
            ACOUSTIC_FEATURE_DIMS
        );
    }
}
