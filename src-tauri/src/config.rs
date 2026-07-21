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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub send_phrases: Option<PhraseBundle>,
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
        match &self.send_phrases {
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

/// Partial trigger overrides for a scenario (`cameraOverride.triggers`).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CameraOverrideTriggers {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub away: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shake: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blink: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_palm: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ok_hand: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fist: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wave: Option<bool>,
}

impl CameraOverrideTriggers {
    pub fn is_empty(&self) -> bool {
        self.away.is_none()
            && self.shake.is_none()
            && self.blink.is_none()
            && self.open_palm.is_none()
            && self.ok_hand.is_none()
            && self.fist.is_none()
            && self.wave.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CameraOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_away: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_return: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shake_head: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deliberate_blink: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open_palm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ok_hand: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fist: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wave: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub triggers: Option<CameraOverrideTriggers>,
}

impl CameraOverride {
    pub fn is_empty(&self) -> bool {
        fn blank(v: &Option<String>) -> bool {
            match v {
                Some(s) if !s.trim().is_empty() => false,
                _ => true,
            }
        }
        blank(&self.on_away)
            && blank(&self.on_return)
            && blank(&self.shake_head)
            && blank(&self.deliberate_blink)
            && blank(&self.open_palm)
            && blank(&self.ok_hand)
            && blank(&self.fist)
            && blank(&self.wave)
            && self.triggers.as_ref().map(|t| t.is_empty()).unwrap_or(true)
    }
}

pub fn normalize_camera_override(ov: Option<CameraOverride>) -> Option<CameraOverride> {
    ov.and_then(|o| if o.is_empty() { None } else { Some(o) })
}

pub fn normalize_voice_override(ov: Option<VoiceOverride>) -> Option<VoiceOverride> {
    match ov {
        Some(v) if v.is_empty() => None,
        other => other,
    }
}

/// Voice-only / voice-override shells keep empty trigger/target through normalize.
pub fn mapping_should_keep_empty_target_key(m: &MappingEntry) -> bool {
    m.trigger_key.trim().is_empty() && m.voice_override.as_ref().is_some_and(|ov| !ov.is_empty())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AppMatchSpec {
    #[serde(rename = "exeNames", default)]
    pub exe_names: Vec<String>,
    #[serde(
        rename = "pathContains",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub path_contains: Option<String>,
    #[serde(
        rename = "titleContains",
        default,
        skip_serializing_if = "Option::is_none"
    )]
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
    #[serde(
        rename = "displayName",
        default,
        skip_serializing_if = "Option::is_none"
    )]
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
    if spec.exe_names.iter().any(|name| !name.trim().is_empty()) {
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
            if !path
                .to_ascii_lowercase()
                .contains(&path_needle.to_ascii_lowercase())
            {
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

fn is_wechat_family_token(s: &str) -> bool {
    let l = s.to_ascii_lowercase();
    l.contains("weixin") || l.contains("wechat") || l.contains("xwechat")
}

/// True when the rule targets WeChat / Weixin (including legacy installers).
pub fn is_wechat_family_rule(rule: &AppBehaviorRule) -> bool {
    if rule
        .display_name
        .as_deref()
        .is_some_and(|n| n.contains("微信") || is_wechat_family_token(n))
    {
        return true;
    }
    let Some(spec) = rule.app_match.as_ref() else {
        return false;
    };
    spec.exe_names.iter().any(|n| is_wechat_family_token(n))
        || spec
            .path_contains
            .as_deref()
            .is_some_and(is_wechat_family_token)
        || spec
            .full_path
            .as_deref()
            .is_some_and(is_wechat_family_token)
}

pub fn is_wechat_family_identity(identity: &crate::app_identity::AppIdentity) -> bool {
    is_wechat_family_token(&identity.exe_name)
        || identity
            .full_path
            .as_deref()
            .is_some_and(is_wechat_family_token)
}

/// Summon matching: exact rule match, or WeChat family cross-process
/// (`Weixin.exe` rule ↔ `WeChatAppEx.exe` chat UI under xwechat).
pub fn rule_matches_identity_for_summon(
    rule: &AppBehaviorRule,
    identity: &crate::app_identity::AppIdentity,
) -> bool {
    if rule_matches_identity(rule, identity) {
        return true;
    }
    is_wechat_family_rule(rule) && is_wechat_family_identity(identity)
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
    if spec.exe_names.iter().any(|n| !n.trim().is_empty()) {
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
        let replace = best
            .as_ref()
            .is_none_or(|(_, best_spec, best_explicit, best_idx)| {
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
    let inject_target = resolve_mapping_summon_target(mapping).unwrap_or_else(|| {
        if !primary.is_empty() {
            primary.to_string()
        } else {
            mapping.id.clone()
        }
    });
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

/// Resolve the summon workflow target for a mapping's primary app.
/// Custom app scenarios use `appTargetId=custom` plus a concrete behavior rule;
/// workflow needs `rule:<ruleId>`, not the literal `"custom"`.
pub fn resolve_mapping_summon_target(mapping: &MappingEntry) -> Option<String> {
    let primary = mapping.app_target_id.trim();
    if primary.is_empty() {
        return mapping
            .app_behavior_rules
            .iter()
            .find_map(summon_target_ref_for_rule);
    }
    if is_preset_app_id(primary) {
        return Some(primary.to_string());
    }
    if primary == "custom" {
        let mut loose: Option<String> = None;
        for rule in &mapping.app_behavior_rules {
            if rule.app_id.trim() != "custom" {
                continue;
            }
            let Some(target) = summon_target_ref_for_rule(rule) else {
                continue;
            };
            let concrete = rule
                .app_match
                .as_ref()
                .is_some_and(app_match_has_constraints);
            if concrete {
                return Some(target);
            }
            if loose.is_none() {
                loose = Some(target);
            }
        }
        return loose;
    }
    mapping
        .app_behavior_rules
        .iter()
        .find(|r| r.app_id.trim() == primary)
        .and_then(summon_target_ref_for_rule)
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
    #[serde(
        rename = "qualitySignals",
        default,
        skip_serializing_if = "Option::is_none"
    )]
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
        if text
            .chars()
            .all(|c| matches!(c, '?' | '？' | '.' | '-' | '_'))
        {
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
    #[serde(
        rename = "qualitySignals",
        default,
        skip_serializing_if = "Option::is_none"
    )]
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

/// Shared wake/end/cancel samples: keep at most one valid command per scenario_id.
pub fn normalize_global_acoustic_voice_commands(
    commands: Vec<AcousticVoiceCommand>,
) -> Vec<AcousticVoiceCommand> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for cmd in commands {
        let sid = {
            let raw = cmd.scenario_id.trim();
            if raw.is_empty() {
                "__voice_wake__".to_string()
            } else {
                raw.to_string()
            }
        };
        if !seen.insert(sid.clone()) {
            continue;
        }
        let mut normalized = normalize_acoustic_voice_commands(vec![cmd], &sid);
        if let Some(mut keep) = normalized.pop() {
            keep.scenario_id = sid;
            out.push(keep);
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
    #[serde(
        rename = "cameraOverride",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub camera_override: Option<CameraOverride>,
    #[serde(rename = "voiceCommands", default)]
    pub voice_commands: Vec<VoiceCommand>,
    #[serde(rename = "acousticVoiceCommands", default)]
    pub acoustic_voice_commands: Vec<AcousticVoiceCommand>,
    /// Application-scenario agent template id (e.g. "codex-micro-13").
    #[serde(rename = "agentTemplateId", default)]
    pub agent_template_id: String,
    /// Provider id for agent actions (e.g. "codex").
    #[serde(rename = "agentProviderId", default)]
    pub agent_provider_id: String,
    /// Key / voice / camera bindings onto AgentAction slots.
    #[serde(rename = "agentBindings", default)]
    pub agent_bindings: Vec<AgentBinding>,
    /// Codex Micro numpad physical-key routing (source scan -> slot -> output chord).
    #[serde(
        rename = "codexMicroPad",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub codex_micro_pad: Option<CodexMicroPadConfig>,
}

/// Codex scenario numpad layer — routes physical numpad keys to agent slots.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroPadConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub require_foreground: bool,
    #[serde(default)]
    pub require_num_lock_off: bool,
    #[serde(default)]
    pub overlay_enabled: bool,
    #[serde(default)]
    pub keys: Vec<CodexMicroPadKeyRoute>,
}

/// Physical numpad key -> Micro cell -> agent slot (output chord lives on slot binding).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroPadKeyRoute {
    #[serde(default)]
    pub micro_key_id: String,
    #[serde(default)]
    pub source_scan: u16,
    #[serde(default)]
    pub source_extended: bool,
    #[serde(default)]
    pub slot_id: String,
    /// UI-only keycap icon id (fast / reject / mic …). Does not affect dispatch.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub ui_icon_id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// Binding from a physical key, voice phrase, or camera gesture to an AgentAction slot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentBinding {
    #[serde(default)]
    pub slot_id: String,
    #[serde(default)]
    pub action_id: String,
    /// "key" | "voice" | "camera"
    #[serde(default)]
    pub trigger_type: String,
    /// Chord, phrase, or camera bind key (e.g. deliberateBlink).
    #[serde(default)]
    pub trigger_binding: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_mode: Option<String>,
    /// "global" | "foregroundApp"
    #[serde(default)]
    pub activation_scope: String,
}

impl Default for AgentBinding {
    fn default() -> Self {
        Self {
            slot_id: String::new(),
            action_id: String::new(),
            trigger_type: String::new(),
            trigger_binding: String::new(),
            enabled: true,
            execution_mode: None,
            activation_scope: "foregroundApp".into(),
        }
    }
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

fn default_presence_action_none() -> String {
    "none".into()
}

/// Independent recognition toggles — must persist separately from action bindings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PresenceTriggersPrefs {
    #[serde(default)]
    pub away: bool,
    #[serde(default)]
    pub shake: bool,
    #[serde(default)]
    pub blink: bool,
    #[serde(default)]
    pub open_palm: bool,
    #[serde(default)]
    pub ok_hand: bool,
    #[serde(default)]
    pub fist: bool,
    #[serde(default)]
    pub wave: bool,
}

/// Low-precision camera presence / gesture action mappings. Defaults are conservative.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PresenceActionsPrefs {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub triggers: PresenceTriggersPrefs,
    #[serde(default = "default_presence_action_none")]
    pub on_away: String,
    #[serde(default = "default_presence_action_none")]
    pub on_return: String,
    #[serde(default = "default_presence_action_none")]
    pub shake_head: String,
    #[serde(default = "default_presence_action_none")]
    pub deliberate_blink: String,
    #[serde(default = "default_presence_action_none")]
    pub open_palm: String,
    #[serde(default = "default_presence_action_none")]
    pub ok_hand: String,
    #[serde(default = "default_presence_action_none")]
    pub fist: String,
    #[serde(default = "default_presence_action_none")]
    pub wave: String,
}

impl Default for PresenceActionsPrefs {
    fn default() -> Self {
        Self {
            enabled: false,
            triggers: PresenceTriggersPrefs::default(),
            on_away: default_presence_action_none(),
            on_return: default_presence_action_none(),
            shake_head: default_presence_action_none(),
            deliberate_blink: default_presence_action_none(),
            open_palm: default_presence_action_none(),
            ok_hand: default_presence_action_none(),
            fist: default_presence_action_none(),
            wave: default_presence_action_none(),
        }
    }
}

/// Local preview-only video enhancement (never fed to recognition).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoEnhancementPrefs {
    #[serde(default)]
    pub enabled: bool,
    /// Look id: off | natural | cream | glow | fresh
    #[serde(default = "default_video_enhancement_look")]
    pub look: String,
    /// Privacy face mask: off | solid | emoji | animal (preview-only)
    #[serde(default = "default_video_enhancement_face_mask")]
    pub face_mask: String,
    #[serde(default = "default_video_enhancement_preset")]
    pub preset: String,
    #[serde(default)]
    pub beauty_enabled: bool,
    /// Beauty level chips: 0=off 1=light 2=mid 3=strong
    #[serde(default)]
    pub whiten: u8,
    #[serde(default)]
    pub smooth: u8,
    #[serde(default)]
    pub rosy: u8,
    #[serde(default)]
    pub slim: u8,
    #[serde(default = "default_video_enhancement_beauty")]
    pub beauty: u32,
    #[serde(default)]
    pub brightness: i32,
    #[serde(default = "default_video_enhancement_contrast")]
    pub contrast: i32,
    #[serde(default = "default_video_enhancement_saturation")]
    pub saturation: i32,
    #[serde(default = "default_video_enhancement_sharpen")]
    pub sharpen: u32,
    #[serde(default = "default_video_enhancement_denoise")]
    pub denoise: u32,
    #[serde(default)]
    pub low_light: u32,
    #[serde(default = "default_video_enhancement_anti_flicker")]
    pub anti_flicker: String,
    #[serde(default)]
    pub display_frame_rate: u32,
}

fn default_video_enhancement_look() -> String {
    "off".into()
}
fn default_video_enhancement_face_mask() -> String {
    "off".into()
}
fn default_video_enhancement_preset() -> String {
    "natural".into()
}
fn default_video_enhancement_beauty() -> u32 {
    18
}
fn default_video_enhancement_contrast() -> i32 {
    8
}
fn default_video_enhancement_saturation() -> i32 {
    6
}
fn default_video_enhancement_sharpen() -> u32 {
    8
}
fn default_video_enhancement_denoise() -> u32 {
    8
}
fn default_video_enhancement_anti_flicker() -> String {
    "auto".into()
}

impl Default for VideoEnhancementPrefs {
    fn default() -> Self {
        Self {
            enabled: false,
            look: default_video_enhancement_look(),
            face_mask: default_video_enhancement_face_mask(),
            preset: default_video_enhancement_preset(),
            beauty_enabled: false,
            whiten: 0,
            smooth: 0,
            rosy: 0,
            slim: 0,
            beauty: default_video_enhancement_beauty(),
            brightness: 0,
            contrast: default_video_enhancement_contrast(),
            saturation: default_video_enhancement_saturation(),
            sharpen: default_video_enhancement_sharpen(),
            denoise: default_video_enhancement_denoise(),
            low_light: 0,
            anti_flicker: default_video_enhancement_anti_flicker(),
            display_frame_rate: 0,
        }
    }
}

/// Local camera preview prefs (Glance MVP). Never auto-starts the camera.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CameraPrefs {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub selected_device_id: String,
    /// Schema only — frontend must not auto getUserMedia from this flag.
    #[serde(default)]
    pub preview_enabled: bool,
    #[serde(default)]
    pub selected_width: u32,
    #[serde(default)]
    pub selected_height: u32,
    #[serde(default)]
    pub selected_frame_rate: u32,
    #[serde(default)]
    pub gaze_calibration: Option<serde_json::Value>,
    /// Personal open-eye blink blendshape baseline (FE-owned JSON).
    #[serde(default)]
    pub blink_baseline: Option<serde_json::Value>,
    #[serde(default)]
    pub presence_actions: PresenceActionsPrefs,
    /// Preview-only enhancement; omitted in quiet saves must not wipe disk prefs.
    #[serde(default)]
    pub video_enhancement: VideoEnhancementPrefs,
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
    /// Global desired wake engine: "vosk" | "sapi" | "kws" | "none".
    /// Source of truth for which engine should run; per-engine `enabled` flags are mirrors.
    #[serde(default = "default_desired_engine", rename = "desiredEngine")]
    pub desired_engine: String,
    #[serde(
        default = "default_voice_listening_strategy",
        rename = "voiceListeningStrategy"
    )]
    pub voice_listening_strategy: String,
    #[serde(default, skip_serializing)]
    pub scenes: Option<Vec<SceneConfig>>,
    #[serde(rename = "schemeSwitchKey", default = "default_scheme_switch_key")]
    pub scheme_switch_key: String,
    #[serde(default, rename = "keyWakeSoundEnabled")]
    pub key_wake_sound_enabled: bool,
    #[serde(default, rename = "coachHudEnabled")]
    pub coach_hud_enabled: bool,
    #[serde(default, rename = "cameraPrefs")]
    pub camera_prefs: CameraPrefs,
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
    /// Global acoustic wake samples (not scenario-bound). Matched in idle to start dictation.
    #[serde(default, rename = "voiceWakeAcousticCommands")]
    pub voice_wake_acoustic_commands: Vec<AcousticVoiceCommand>,
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
    7
}

fn default_desired_engine() -> String {
    "none".into()
}

fn default_voice_listening_strategy() -> String {
    "auto".into()
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
    #[serde(default = "default_voice_end_send_phrases_zh")]
    pub send_phrases_zh: Vec<String>,
    #[serde(default = "default_voice_end_send_phrases_en")]
    pub send_phrases_en: Vec<String>,
    /// "confirm" | "phrase" | "auto"
    #[serde(default = "default_voice_end_send_mode")]
    pub send_mode: String,
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
    vec!["结束输入".into(), "就这样".into(), "停止听写".into()]
}

pub fn default_voice_end_phrases_en() -> Vec<String> {
    vec![
        "end dictation".into(),
        "that's it".into(),
        "stop dictation".into(),
    ]
}

pub fn default_voice_end_cancel_phrases_zh() -> Vec<String> {
    vec!["取消输入".into(), "不要了".into(), "撤掉".into()]
}

pub fn default_voice_end_cancel_phrases_en() -> Vec<String> {
    vec!["cancel input".into(), "never mind".into()]
}

pub fn default_voice_end_send_phrases_zh() -> Vec<String> {
    vec!["发送".into(), "发出去".into(), "提交".into()]
}

pub fn default_voice_end_send_phrases_en() -> Vec<String> {
    vec!["send it".into(), "send".into(), "submit".into()]
}

pub fn default_voice_end_send_mode() -> String {
    "confirm".into()
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

fn normalize_phrase_key(s: &str) -> String {
    s.chars()
        .filter(|c| {
            c.is_ascii_alphanumeric()
                || ('\u{4e00}'..='\u{9fff}').contains(c)
                || ('\u{3400}'..='\u{4dbf}').contains(c)
        })
        .map(|c| {
            if c.is_ascii_alphabetic() {
                c.to_ascii_lowercase()
            } else {
                c
            }
        })
        .collect::<String>()
        .to_ascii_lowercase()
}

fn is_send_like_phrase(phrase: &str) -> bool {
    const SEND_LIKE: &[&str] = &["发送", "发出去", "提交", "send", "sendit", "submit"];
    let key = normalize_phrase_key(phrase);
    SEND_LIKE.iter().any(|p| *p == key)
}

fn peel_send_like_phrases(phrases: &[String]) -> (Vec<String>, Vec<String>) {
    let mut peeled = Vec::new();
    let mut remain = Vec::new();
    for p in phrases {
        if is_send_like_phrase(p) {
            peeled.push(p.clone());
        } else {
            remain.push(p.clone());
        }
    }
    (peeled, remain)
}

fn merge_phrase_vec(dest: &mut Vec<String>, extra: &[String]) {
    for p in extra {
        let t = p.trim();
        if t.is_empty() {
            continue;
        }
        if !dest
            .iter()
            .any(|x| normalize_phrase_key(x) == normalize_phrase_key(t))
        {
            dest.push(t.to_string());
        }
    }
}

fn ensure_cancel_zh_has_chediao(cancel_zh: &mut Vec<String>) {
    if !cancel_zh
        .iter()
        .any(|p| normalize_phrase_key(p) == normalize_phrase_key("撤掉"))
    {
        cancel_zh.push("撤掉".into());
    }
}

fn peel_send_from_voice_override(ov: Option<&mut VoiceOverride>) {
    let Some(ov) = ov else {
        return;
    };
    let Some(end) = ov.end_phrases.as_mut() else {
        return;
    };
    let (peeled_zh, remain_zh) = peel_send_like_phrases(&end.zh);
    let (peeled_en, remain_en) = peel_send_like_phrases(&end.en);
    end.zh = remain_zh;
    end.en = remain_en;
    if peeled_zh.is_empty() && peeled_en.is_empty() {
        return;
    }
    let send = ov.send_phrases.get_or_insert_with(|| PhraseBundle {
        zh: Vec::new(),
        en: Vec::new(),
    });
    merge_phrase_vec(&mut send.zh, &peeled_zh);
    merge_phrase_vec(&mut send.en, &peeled_en);
}

pub fn sync_send_mode_and_auto_send(voice_end: &mut VoiceEndConfig) {
    let mode = voice_end.send_mode.trim().to_ascii_lowercase();
    let mode = match mode.as_str() {
        "auto" | "phrase" | "confirm" => mode,
        _ => default_voice_end_send_mode(),
    };
    voice_end.send_mode = mode.clone();
    voice_end.auto_send_enabled = mode == "auto";
}

pub fn apply_auto_send_to_send_mode(voice_end: &mut VoiceEndConfig, enabled: bool) {
    voice_end.auto_send_enabled = enabled;
    if enabled {
        voice_end.send_mode = "auto".into();
    } else if voice_end.send_mode.trim().eq_ignore_ascii_case("auto") {
        voice_end.send_mode = "confirm".into();
    }
}

impl Default for VoiceEndConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            phrases_zh: default_voice_end_phrases_zh(),
            phrases_en: default_voice_end_phrases_en(),
            cancel_phrases_zh: default_voice_end_cancel_phrases_zh(),
            cancel_phrases_en: default_voice_end_cancel_phrases_en(),
            send_phrases_zh: default_voice_end_send_phrases_zh(),
            send_phrases_en: default_voice_end_send_phrases_en(),
            send_mode: default_voice_end_send_mode(),
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
fn default_sound_id_camera_action() -> String {
    "input-ready-soft".into()
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
    #[serde(default = "default_sound_slot_camera_action", rename = "cameraAction")]
    pub camera_action: SoundSlot,
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
fn default_sound_slot_camera_action() -> SoundSlot {
    SoundSlot {
        enabled: false,
        id: default_sound_id_camera_action(),
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
            camera_action: default_sound_slot_camera_action(),
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
        if self.camera_action.id.trim().is_empty() {
            self.camera_action.id = default_sound_id_camera_action();
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
            "camera_action" => self.camera_action.enabled,
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
/// Also keeps [`VoiceConfig::desired_engine`] aligned with the surviving flag.
pub fn reconcile_voice_engine_flags(cfg: &mut VoiceConfig) -> bool {
    let before_flags = (
        cfg.voice_vosk.enabled,
        cfg.voice_sapi.enabled,
        cfg.voice_kws.enabled,
    );
    let multi = [
        cfg.voice_vosk.enabled,
        cfg.voice_sapi.enabled,
        cfg.voice_kws.enabled,
    ]
    .iter()
    .filter(|&&x| x)
    .count()
        > 1;
    heal_desired_engine_from_flags_if_needed(cfg);
    sync_enabled_flags_from_desired(cfg);
    let after_flags = (
        cfg.voice_vosk.enabled,
        cfg.voice_sapi.enabled,
        cfg.voice_kws.enabled,
    );
    multi || before_flags != after_flags
}

/// Label for persisted `desiredEngine` (lowercase canonical).
pub fn desired_engine_label(engine: crate::scene_config::DesiredVoiceEngine) -> &'static str {
    match engine {
        crate::scene_config::DesiredVoiceEngine::Vosk => "vosk",
        crate::scene_config::DesiredVoiceEngine::Sapi => "sapi",
        crate::scene_config::DesiredVoiceEngine::Kws => "kws",
        crate::scene_config::DesiredVoiceEngine::None => "none",
    }
}

/// Parse a desired-engine label. Returns `None` only for unrecognized non-empty values.
pub fn parse_desired_engine_label(raw: &str) -> Option<crate::scene_config::DesiredVoiceEngine> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "" | "none" | "off" => Some(crate::scene_config::DesiredVoiceEngine::None),
        "vosk" | "pro" | "advanced" => Some(crate::scene_config::DesiredVoiceEngine::Vosk),
        "sapi" | "lite" => Some(crate::scene_config::DesiredVoiceEngine::Sapi),
        "kws" | "keyword" | "keywords" => Some(crate::scene_config::DesiredVoiceEngine::Kws),
        _ => None,
    }
}

/// Derive desired engine from enabled flags (priority: Vosk > SAPI > KWS).
pub fn desired_engine_from_enabled_flags(
    cfg: &VoiceConfig,
) -> crate::scene_config::DesiredVoiceEngine {
    if cfg.voice_vosk.enabled {
        crate::scene_config::DesiredVoiceEngine::Vosk
    } else if cfg.voice_sapi.enabled {
        crate::scene_config::DesiredVoiceEngine::Sapi
    } else if cfg.voice_kws.enabled {
        crate::scene_config::DesiredVoiceEngine::Kws
    } else {
        crate::scene_config::DesiredVoiceEngine::None
    }
}

pub fn parse_voice_listening_strategy_label(raw: &str) -> Option<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "" | "auto" => Some("auto"),
        "resourcesaver" | "resource_saver" | "resource-saver" => Some("resourceSaver"),
        "enhanced" | "vosk" => Some("enhanced"),
        "off" | "none" => Some("off"),
        "advanced" => Some("advanced"),
        _ => None,
    }
}

pub fn normalize_voice_listening_strategy(raw: &str) -> &'static str {
    parse_voice_listening_strategy_label(raw).unwrap_or("auto")
}

pub fn derive_voice_listening_strategy_from_legacy(cfg: &VoiceConfig) -> &'static str {
    match parse_desired_engine_label(&cfg.desired_engine)
        .unwrap_or_else(|| desired_engine_from_enabled_flags(cfg))
    {
        crate::scene_config::DesiredVoiceEngine::None => "off",
        crate::scene_config::DesiredVoiceEngine::Vosk => "enhanced",
        crate::scene_config::DesiredVoiceEngine::Kws
        | crate::scene_config::DesiredVoiceEngine::Sapi => "advanced",
    }
}

pub fn apply_voice_listening_strategy(cfg: &mut VoiceConfig, strategy: &str) {
    cfg.voice_listening_strategy = normalize_voice_listening_strategy(strategy).to_string();
    match cfg.voice_listening_strategy.as_str() {
        "off" => {
            cfg.desired_engine = "none".into();
            sync_enabled_flags_from_desired(cfg);
        }
        "enhanced" => {
            cfg.desired_engine = "vosk".into();
            sync_enabled_flags_from_desired(cfg);
        }
        "auto" | "resourceSaver" => {
            // Supervisor may still fall back to Vosk when KWS is not ready (auto only).
            cfg.desired_engine = "kws".into();
            sync_enabled_flags_from_desired(cfg);
        }
        "advanced" => {}
        _ => sync_enabled_flags_from_desired(cfg),
    }
}

/// Write `desired_engine` and mirror it onto the three `enabled` flags. Does not save.
pub fn apply_desired_engine(cfg: &mut VoiceConfig, engine: &str) {
    let parsed =
        parse_desired_engine_label(engine).unwrap_or(crate::scene_config::DesiredVoiceEngine::None);
    cfg.desired_engine = desired_engine_label(parsed).to_string();
    cfg.voice_listening_strategy = "advanced".into();
    sync_enabled_flags_from_desired(cfg);
}

/// Mirror `desired_engine` onto mutually exclusive `enabled` flags.
pub fn sync_enabled_flags_from_desired(cfg: &mut VoiceConfig) {
    let engine = parse_desired_engine_label(&cfg.desired_engine)
        .unwrap_or(crate::scene_config::DesiredVoiceEngine::None);
    cfg.desired_engine = desired_engine_label(engine).to_string();
    cfg.voice_vosk.enabled = engine == crate::scene_config::DesiredVoiceEngine::Vosk;
    cfg.voice_sapi.enabled = engine == crate::scene_config::DesiredVoiceEngine::Sapi;
    cfg.voice_kws.enabled = engine == crate::scene_config::DesiredVoiceEngine::Kws;
}

fn heal_desired_engine_from_flags_if_needed(cfg: &mut VoiceConfig) {
    let from_flags = desired_engine_from_enabled_flags(cfg);
    match parse_desired_engine_label(&cfg.desired_engine) {
        Some(crate::scene_config::DesiredVoiceEngine::None)
            if from_flags != crate::scene_config::DesiredVoiceEngine::None =>
        {
            // Legacy callers may flip enabled flags without desiredEngine.
            cfg.desired_engine = desired_engine_label(from_flags).to_string();
        }
        Some(_) => {}
        None => {
            cfg.desired_engine = desired_engine_label(from_flags).to_string();
        }
    }
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
    let mut out = physical.clone();
    if device.is_empty() {
        // fall through to agent keys below
    } else {
        for pb in &physical {
            let prefixed = crate::press_gesture::format_device_key(device, pb);
            if !out.contains(&prefixed) {
                out.push(prefixed);
            }
        }
    }
    for chord in agent_key_chords(m) {
        if chord.is_empty() || out.contains(&chord) {
            continue;
        }
        // Hold-to-talk (Codex Ctrl+Shift+D) must reach the app as a physical hold.
        // OneTone synthesizes it only from PageDown / mapping long-press — never via hotkey.
        if crate::key_chord::is_hold_to_talk_chord(&chord) {
            continue;
        }
        out.push(chord);
    }
    out
}

/// Enabled agent key chords bound on this mapping (Codex Micro capability pack).
/// Modifier-only chords (LAlt, LShift, …) are excluded — they use tap-on-keyup dispatch.
pub fn agent_key_chords(m: &MappingEntry) -> Vec<String> {
    let mut out = Vec::new();
    for b in &m.agent_bindings {
        if !b.enabled {
            continue;
        }
        if !b.trigger_type.eq_ignore_ascii_case("key") {
            continue;
        }
        let chord = canonical_trigger(b.trigger_binding.trim());
        if chord.is_empty() || crate::key_chord::is_modifier_only_chord(&chord) {
            continue;
        }
        if !out.contains(&chord) {
            out.push(chord);
        }
    }
    out
}

/// Modifier-only agent chords watched for tap-on-keyup (not registered as global hotkeys).
pub fn agent_modifier_watch_chords(m: &MappingEntry) -> Vec<String> {
    let mut out = Vec::new();
    for b in &m.agent_bindings {
        if !b.enabled || !b.trigger_type.eq_ignore_ascii_case("key") {
            continue;
        }
        let chord = canonical_trigger(b.trigger_binding.trim());
        if chord.is_empty() || !crate::key_chord::is_modifier_only_chord(&chord) {
            continue;
        }
        if !out.contains(&chord) {
            out.push(chord);
        }
    }
    out
}

/// Find an enabled agent key binding matching the live pressed chord.
pub fn find_agent_key_binding_for_chord<'a>(
    m: &'a MappingEntry,
    pressed_chord: &str,
) -> Option<&'a AgentBinding> {
    let pressed = pressed_chord.trim();
    if pressed.is_empty() {
        return None;
    }
    m.agent_bindings.iter().find(|b| {
        b.enabled
            && b.trigger_type.eq_ignore_ascii_case("key")
            && crate::key_chord::chords_equivalent(b.trigger_binding.trim(), pressed)
    })
}

/// Find an enabled agent key binding matching this physical key event.
pub fn find_agent_key_binding<'a>(
    m: &'a MappingEntry,
    physical_key: &str,
) -> Option<&'a AgentBinding> {
    let chord = crate::key_chord::build_pressed_chord(physical_key);
    find_agent_key_binding_for_chord(m, &chord)
}

/// Find an enabled agent voice binding whose phrase fuzzy-matches `text`.
pub fn find_agent_voice_binding<'a>(m: &'a MappingEntry, text: &str) -> Option<&'a AgentBinding> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    m.agent_bindings.iter().find(|b| {
        b.enabled
            && b.trigger_type.eq_ignore_ascii_case("voice")
            && !b.trigger_binding.trim().is_empty()
            && phrases_fuzzy_match(text, &b.trigger_binding)
    })
}

/// All enabled agent voice phrases across mappings (for grammar injection).
pub fn agent_voice_phrases_for_cfg(cfg: &VoiceConfig) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for m in cfg.mappings.iter().filter(|m| m.enabled) {
        for b in &m.agent_bindings {
            if !b.enabled || !b.trigger_type.eq_ignore_ascii_case("voice") {
                continue;
            }
            let p = b.trigger_binding.trim();
            if p.is_empty() {
                continue;
            }
            if seen.insert(p.to_string()) {
                out.push(p.to_string());
            }
        }
    }
    out
}

pub fn mapping_physical_bindings(m: &MappingEntry) -> Vec<String> {
    let mut tk = canonical_trigger(&m.trigger_key);
    if tk.is_empty() {
        tk = canonical_trigger(&m.source_key);
    }
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
    physical_bindings(&tk)
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
            version: 8,
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
                camera_override: None,
                voice_commands: vec![],
                acoustic_voice_commands: vec![],
                agent_template_id: String::new(),
                agent_provider_id: String::new(),
                agent_bindings: vec![],
                codex_micro_pad: None,
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
            desired_engine: default_desired_engine(),
            voice_listening_strategy: default_voice_listening_strategy(),
            scenes: None,
            scheme_switch_key: String::new(),
            key_wake_sound_enabled: false,
            coach_hud_enabled: false,
            camera_prefs: CameraPrefs::default(),
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
            voice_wake_acoustic_commands: vec![],
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

/// Dedicated app scenario (Codex / custom bind) — not a global row with preset finish chips.
pub fn is_app_scenario_mapping(m: &MappingEntry) -> bool {
    if !m.app_target_id.trim().is_empty() {
        return true;
    }
    for rule in &m.app_behavior_rules {
        if rule.app_id.trim() == "custom" {
            return true;
        }
        let Some(spec) = rule.app_match.as_ref() else {
            continue;
        };
        let has_exe = spec.exe_names.iter().any(|n| !n.trim().is_empty());
        let has_path = spec
            .full_path
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty())
            || spec
                .path_contains
                .as_deref()
                .is_some_and(|s| !s.trim().is_empty());
        let has_title = spec
            .title_contains
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty());
        if has_exe || has_path || has_title {
            return true;
        }
    }
    false
}

pub fn mapping_matches_foreground_identity(
    m: &MappingEntry,
    identity: &crate::app_identity::AppIdentity,
) -> bool {
    if let Some(preset) = identity.matched_preset_app_id.as_deref() {
        let preset = preset.trim();
        if !preset.is_empty() {
            if m.app_target_id.trim() == preset {
                return true;
            }
            if m.app_behavior_rules
                .iter()
                .any(|r| r.app_id.trim() == preset)
            {
                return true;
            }
        }
    }
    match_behavior_rule(&m.app_behavior_rules, identity).is_some()
}

/// When a dedicated app scenario owns the foreground app, global preset rows that route
/// workflow to that app must not steal triggers (e.g. global `Ctrl+Shift+D` vs Codex hold).
pub fn mapping_shadowed_by_foreground_app_scenario(
    cfg: &VoiceConfig,
    mapping: &MappingEntry,
    identity: &crate::app_identity::AppIdentity,
) -> bool {
    if is_app_scenario_mapping(mapping) {
        return false;
    }
    find_app_scenario_for_foreground(cfg, identity).is_some()
        && resolve_foreground_workflow_target(mapping, identity).is_some()
}

/// Best dedicated app-scenario mapping for the foreground app (prefers agent packs).
pub fn find_app_scenario_for_foreground<'a>(
    cfg: &'a VoiceConfig,
    identity: &crate::app_identity::AppIdentity,
) -> Option<&'a MappingEntry> {
    cfg.active_mappings()
        .into_iter()
        .filter(|m| is_app_scenario_mapping(m) && mapping_matches_foreground_identity(m, identity))
        .max_by_key(|m| {
            let agent = m
                .agent_bindings
                .iter()
                .filter(|b| b.enabled && !b.trigger_binding.trim().is_empty())
                .count();
            let template = usize::from(!m.agent_template_id.trim().is_empty());
            (agent, template)
        })
}

/// When a global trigger mapping fires, resolve workflow app from foreground + behavior rules.
pub fn resolve_foreground_workflow_target(
    mapping: &MappingEntry,
    identity: &crate::app_identity::AppIdentity,
) -> Option<String> {
    if is_app_scenario_mapping(mapping) {
        return None;
    }
    let preset = identity.matched_preset_app_id.as_deref()?.trim();
    if preset.is_empty() || !is_workflow_app_target(preset) {
        return None;
    }
    if mapping.app_target_id.trim() == preset {
        return Some(preset.to_string());
    }
    if match_behavior_rule(&mapping.app_behavior_rules, identity).is_some() {
        return Some(preset.to_string());
    }
    None
}

pub fn agent_key_binding_for_slot<'a>(
    m: &'a MappingEntry,
    slot_id: &str,
) -> Option<&'a AgentBinding> {
    let slot_id = slot_id.trim();
    m.agent_bindings.iter().find(|b| {
        b.enabled
            && b.slot_id == slot_id
            && b.trigger_type.eq_ignore_ascii_case("key")
            && !b.trigger_binding.trim().is_empty()
    })
}

impl VoiceConfig {
    pub fn migrate(&mut self) {
        if self.version >= 8 && !self.mappings.is_empty() {
            self.normalize();
            return;
        }

        if self.version >= 7 && !self.mappings.is_empty() {
            self.migrate_v7_to_v8();
            self.normalize();
            return;
        }

        if self.version >= 6 && !self.mappings.is_empty() {
            self.migrate_v6_to_v7();
            self.migrate_v7_to_v8();
            self.normalize();
            return;
        }

        if self.version >= 5 && !self.mappings.is_empty() {
            self.migrate_v5_to_v6();
            self.migrate_v6_to_v7();
            self.migrate_v7_to_v8();
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
            self.migrate_v6_to_v7();
            self.migrate_v7_to_v8();
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
            self.migrate_v6_to_v7();
            self.migrate_v7_to_v8();
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
                camera_override: None,
                voice_commands: vec![],
                acoustic_voice_commands: vec![],
                agent_template_id: String::new(),
                agent_provider_id: String::new(),
                agent_bindings: vec![],
                codex_micro_pad: None,
            });
        }

        self.version = 5;
        self.migrate_v5_to_v6();
        self.migrate_v6_to_v7();
        self.migrate_v7_to_v8();
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

    fn migrate_v6_to_v7(&mut self) {
        // Always derive from flags on upgrade (JSON default "none" would be wrong when an engine was on).
        self.desired_engine =
            desired_engine_label(desired_engine_from_enabled_flags(self)).to_string();
        sync_enabled_flags_from_desired(self);
        self.version = 7;
    }

    fn migrate_v7_to_v8(&mut self) {
        let (peeled_zh, remain_zh) = peel_send_like_phrases(&self.voice_end.phrases_zh);
        let (peeled_en, remain_en) = peel_send_like_phrases(&self.voice_end.phrases_en);
        self.voice_end.phrases_zh = remain_zh;
        self.voice_end.phrases_en = remain_en;
        merge_phrase_vec(&mut self.voice_end.send_phrases_zh, &peeled_zh);
        merge_phrase_vec(&mut self.voice_end.send_phrases_en, &peeled_en);
        if self.voice_end.send_phrases_zh.is_empty() {
            self.voice_end.send_phrases_zh = default_voice_end_send_phrases_zh();
        }
        if self.voice_end.send_phrases_en.is_empty() {
            self.voice_end.send_phrases_en = default_voice_end_send_phrases_en();
        }
        if self.voice_end.phrases_zh.is_empty() {
            self.voice_end.phrases_zh = default_voice_end_phrases_zh();
        }
        if self.voice_end.phrases_en.is_empty() {
            self.voice_end.phrases_en = default_voice_end_phrases_en();
        }

        ensure_cancel_zh_has_chediao(&mut self.voice_end.cancel_phrases_zh);

        for m in self.mappings.iter_mut().chain(self.trash.iter_mut()) {
            peel_send_from_voice_override(m.voice_override.as_mut());
        }

        let mode = self.voice_end.send_mode.trim().to_ascii_lowercase();
        if self.voice_end.auto_send_enabled && (mode.is_empty() || mode == "confirm") {
            self.voice_end.send_mode = "auto".into();
        }
        sync_send_mode_and_auto_send(&mut self.voice_end);
        self.version = 8;
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
        self.voice_listening_strategy = if self.voice_listening_strategy.trim().is_empty() {
            derive_voice_listening_strategy_from_legacy(self).to_string()
        } else {
            normalize_voice_listening_strategy(&self.voice_listening_strategy).to_string()
        };
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
        if self
            .voice_end
            .send_phrases_zh
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.send_phrases_zh = default_voice_end_send_phrases_zh();
        }
        if self
            .voice_end
            .send_phrases_en
            .iter()
            .all(|p| p.trim().is_empty())
        {
            self.voice_end.send_phrases_en = default_voice_end_send_phrases_en();
        }
        ensure_cancel_zh_has_chediao(&mut self.voice_end.cancel_phrases_zh);
        sync_send_mode_and_auto_send(&mut self.voice_end);
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
            if m.trigger_key.is_empty() {
                let from_source = canonical_trigger(&m.source_key);
                if is_allowed_trigger(&from_source) {
                    m.trigger_key = from_source.clone();
                }
            }
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
        let foreground = crate::app_identity::foreground_app_identity();
        let mut candidates: Vec<&MappingEntry> = Vec::new();
        for m in self.active_mappings() {
            if !mapping_matches_device(m, event.device.as_deref()) {
                continue;
            }
            let matches_trigger = canonical_trigger(&m.trigger_key) == canonical;
            let matches_physical = mapping_physical_bindings(m)
                .iter()
                .any(|pb| pb == &event.key || pb == &canonical);
            if matches_trigger || matches_physical {
                candidates.push(m);
            }
        }
        if let Some(ref identity) = foreground {
            candidates.retain(|m| !mapping_shadowed_by_foreground_app_scenario(self, m, identity));
        }
        if candidates.is_empty() {
            return None;
        }
        if candidates.len() == 1 {
            return Some(candidates[0]);
        }
        if let Some(ref identity) = foreground {
            if let Some(hit) = candidates.iter().copied().find(|m| {
                is_app_scenario_mapping(m) && mapping_matches_foreground_identity(m, identity)
            }) {
                return Some(hit);
            }
        }
        if let Some(hit) = candidates.iter().copied().find(|m| is_app_scenario_mapping(m)) {
            return Some(hit);
        }
        Some(candidates[0])
    }

    /// All modifier-only agent watch chords across enabled mappings.
    pub fn agent_modifier_watch_bindings(&self) -> Vec<String> {
        let mut out = Vec::new();
        for m in self.active_mappings() {
            for chord in agent_modifier_watch_chords(m) {
                if !out.contains(&chord) {
                    out.push(chord);
                }
            }
        }
        out
    }

    /// Find mapping + agent binding for a pressed chord (combo keys on keydown).
    pub fn find_agent_key_dispatch<'a>(
        &'a self,
        pressed_chord: &str,
    ) -> Option<(&'a MappingEntry, &'a AgentBinding)> {
        for m in self.active_mappings() {
            if let Some(b) = find_agent_key_binding_for_chord(m, pressed_chord) {
                if !crate::key_chord::is_modifier_only_chord(pressed_chord) {
                    return Some((m, b));
                }
            }
        }
        None
    }

    /// Find mapping + agent binding for a modifier-only tap on keyup.
    pub fn find_agent_modifier_tap_dispatch<'a>(
        &'a self,
        pressed_chord: &str,
    ) -> Option<(&'a MappingEntry, &'a AgentBinding)> {
        if !crate::key_chord::is_modifier_only_chord(pressed_chord) {
            return None;
        }
        for m in self.active_mappings() {
            if let Some(b) = find_agent_key_binding_for_chord(m, pressed_chord) {
                return Some((m, b));
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
    let raw: serde_json::Value = serde_json::from_str(json).ok()?;
    let mut cfg: VoiceConfig = serde_json::from_value(raw.clone()).ok()?;
    for m in &mut cfg.mappings {
        if m.app_behavior_rules.is_empty() {
            if let Some(prev) = existing.mappings.iter().find(|x| x.id == m.id) {
                if !prev.app_behavior_rules.is_empty() {
                    m.app_behavior_rules = prev.app_behavior_rules.clone();
                }
            }
        }
        // Keep appTargetId when FE clears it but the row still has app rules.
        // Clearing without removing rules used to hide Chrome from「应用场景」
        // while home still showed the named card.
        if m.app_target_id.trim().is_empty() {
            if let Some(prev) = existing.mappings.iter().find(|x| x.id == m.id) {
                if !prev.app_target_id.trim().is_empty() && !m.app_behavior_rules.is_empty() {
                    m.app_target_id = prev.app_target_id.clone();
                }
            }
        }
        // Older FE payloads omitted codexMicroPad and wiped overlay/keymap on every save.
        if m.codex_micro_pad.is_none() {
            if let Some(prev) = existing.mappings.iter().find(|x| x.id == m.id) {
                if prev.codex_micro_pad.is_some() {
                    m.codex_micro_pad = prev.codex_micro_pad.clone();
                }
            }
        }
        // Preserve agent scenario template fields when FE omits them on partial save.
        if let Some(prev) = existing.mappings.iter().find(|x| x.id == m.id) {
            if m.agent_template_id.trim().is_empty() && !prev.agent_template_id.trim().is_empty() {
                m.agent_template_id = prev.agent_template_id.clone();
            }
            if m.agent_provider_id.trim().is_empty() && !prev.agent_provider_id.trim().is_empty() {
                m.agent_provider_id = prev.agent_provider_id.clone();
            }
            if m.agent_bindings.is_empty() && !prev.agent_bindings.is_empty() {
                m.agent_bindings = prev.agent_bindings.clone();
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
        if let Some(prev) = existing.trash.iter().find(|x| x.id == m.id) {
            if m.agent_template_id.trim().is_empty() && !prev.agent_template_id.trim().is_empty() {
                m.agent_template_id = prev.agent_template_id.clone();
            }
            if m.agent_provider_id.trim().is_empty() && !prev.agent_provider_id.trim().is_empty() {
                m.agent_provider_id = prev.agent_provider_id.clone();
            }
            if m.agent_bindings.is_empty() && !prev.agent_bindings.is_empty() {
                m.agent_bindings = prev.agent_bindings.clone();
            }
        }
    }

    // FE saves replace the whole mappings array. A frozen/partial UI state can omit
    // app scenarios (Chrome/Chatbox/Cursor) and permanently wipe them. Keep disk
    // app-scoped rows unless the FE explicitly moved them into trash.
    let incoming_ids: HashSet<&str> = cfg.mappings.iter().map(|m| m.id.as_str()).collect();
    let trash_ids: HashSet<&str> = cfg.trash.iter().map(|m| m.id.as_str()).collect();
    let mut preserved = Vec::new();
    for prev in &existing.mappings {
        if incoming_ids.contains(prev.id.as_str()) || trash_ids.contains(prev.id.as_str()) {
            continue;
        }
        let mut is_app_scene = !prev.app_target_id.trim().is_empty();
        // Survive wiped appTargetId when a concrete process bind remains.
        // Do NOT treat universal rows that only carry preset finish-mode chips as app scenarios.
        if !is_app_scene {
            is_app_scene = prev.app_behavior_rules.iter().any(|r| {
                if r.app_id.trim() == "custom" {
                    return true;
                }
                let Some(spec) = r.app_match.as_ref() else {
                    return false;
                };
                let has_exe = spec.exe_names.iter().any(|n| !n.trim().is_empty());
                let has_path = spec
                    .full_path
                    .as_deref()
                    .is_some_and(|s| !s.trim().is_empty())
                    || spec
                        .path_contains
                        .as_deref()
                        .is_some_and(|s| !s.trim().is_empty());
                let has_title = spec
                    .title_contains
                    .as_deref()
                    .is_some_and(|s| !s.trim().is_empty());
                has_exe || has_path || has_title
            });
        }
        if is_app_scene
            || prev.codex_micro_pad.is_some()
            || !prev.agent_template_id.trim().is_empty()
            || prev.agent_provider_id.trim().eq_ignore_ascii_case("codex")
        {
            preserved.push(prev.clone());
        }
    }
    if !preserved.is_empty() {
        let msg = format!(
            "merge_save_payload: FE omitted {} app mapping(s); preserving: {}",
            preserved.len(),
            preserved
                .iter()
                .map(|m| format!("{}[{}]", m.id, m.app_target_id))
                .collect::<Vec<_>>()
                .join(", ")
        );
        eprintln!("{msg}");
        crate::app_log::early_line("config", &msg);
        cfg.mappings.extend(preserved);
    }

    cfg.voice_vosk = existing.voice_vosk.clone();
    cfg.voice_sapi = existing.voice_sapi.clone();
    cfg.voice_kws = existing.voice_kws.clone();
    cfg.voice_end = existing.voice_end.clone();
    cfg.desired_engine = existing.desired_engine.clone();
    cfg.voice_listening_strategy = existing.voice_listening_strategy.clone();
    if raw.get("voiceWakeAcousticCommands").is_none() {
        cfg.voice_wake_acoustic_commands = existing.voice_wake_acoustic_commands.clone();
    } else {
        cfg.voice_wake_acoustic_commands = normalize_global_acoustic_voice_commands(
            std::mem::take(&mut cfg.voice_wake_acoustic_commands),
        );
        for cmd in &mut cfg.voice_wake_acoustic_commands {
            if cmd.scenario_id.trim().is_empty() {
                cmd.scenario_id = "__voice_wake__".into();
            }
            if cmd.kind.trim().is_empty() || cmd.kind == "scenario-acoustic-activate" {
                cmd.kind = match cmd.scenario_id.as_str() {
                    "__voice_end__" => "voice-end-acoustic".into(),
                    "__voice_cancel__" => "voice-cancel-acoustic".into(),
                    _ => "voice-wake-acoustic".into(),
                };
            }
            cmd.activation_scope = "global".into();
        }
    }
    cfg.start_minimized_to_tray = existing.start_minimized_to_tray;
    // Camera prefs only change via cmd_save_camera_prefs — never let a full mapping
    // save overwrite them with a stale FE snapshot (looked like "restart cleared camera").
    cfg.camera_prefs = existing.camera_prefs.clone();
    cfg.window_layout_seen = existing.window_layout_seen;
    cfg.window_maximized = existing.window_maximized;
    cfg.window_width = existing.window_width;
    cfg.window_height = existing.window_height;
    cfg.window_x = existing.window_x;
    cfg.window_y = existing.window_y;
    Some(cfg)
}

/// Quiet camera save: FE may send `gazeCalibration: null` when the in-memory
/// snapshot was never hydrated. Preserve disk calibration unless the FE explicitly
/// asks to clear it. Also keep a non-empty device id if the payload omits it.
///
/// `has_video_enhancement`: true when the raw JSON included `videoEnhancement`.
/// Field missing → keep existing (old clients / partial payloads). Field present
/// (even all-defaults / enabled:false) → take incoming so intentional resets stick.
///
/// `has_selected_frame_rate`: true when JSON included `selectedFrameRate`.
/// Needed so Auto FPS (`0`) can persist; missing field still restores existing.
pub fn merge_camera_prefs_quiet(
    existing: &CameraPrefs,
    mut incoming: CameraPrefs,
    clear_gaze_calibration: bool,
    has_video_enhancement: bool,
    has_selected_frame_rate: bool,
) -> CameraPrefs {
    if incoming.gaze_calibration.is_none() && !clear_gaze_calibration {
        incoming.gaze_calibration = existing.gaze_calibration.clone();
    }
    if incoming.blink_baseline.is_none() && existing.blink_baseline.is_some() {
        incoming.blink_baseline = existing.blink_baseline.clone();
    }
    if incoming.selected_device_id.trim().is_empty()
        && !existing.selected_device_id.trim().is_empty()
    {
        incoming.selected_device_id = existing.selected_device_id.clone();
    }
    if incoming.selected_width == 0 && existing.selected_width > 0 {
        incoming.selected_width = existing.selected_width;
    }
    if incoming.selected_height == 0 && existing.selected_height > 0 {
        incoming.selected_height = existing.selected_height;
    }
    if !has_selected_frame_rate
        && incoming.selected_frame_rate == 0
        && existing.selected_frame_rate > 0
    {
        incoming.selected_frame_rate = existing.selected_frame_rate;
    }
    if !has_video_enhancement {
        incoming.video_enhancement = existing.video_enhancement.clone();
    }
    incoming
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

/// Watcher-safe load: never substitute `Default` on mid-write / parse failure
/// (that used to look like a full config wipe → vosk restart + mvp_init 假死).
fn try_load_config_for_watcher() -> Option<VoiceConfig> {
    let path = config_path();
    let raw = fs::read_to_string(&path).ok()?;
    if raw.trim().is_empty() {
        return None;
    }
    let mut cfg: VoiceConfig = serde_json::from_str(&raw).ok()?;
    cfg.migrate();
    Some(cfg)
}

/// Epoch-ms until which the config watcher must ignore our own disk writes.
static WATCHER_SUPPRESS_UNTIL_MS: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

fn wall_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Call after any in-process `settings.json` write so the watcher does not echo
/// mvp_init / voice restart (camera quiet save + layout save were 假死 sources).
pub fn note_config_self_write() {
    // Cover bak/tmp/rename bursts + notify debounce. Must be set *before* disk writes.
    let until = wall_now_ms().saturating_add(4500);
    WATCHER_SUPPRESS_UNTIL_MS.store(until, std::sync::atomic::Ordering::SeqCst);
}

fn is_config_watcher_suppressed() -> bool {
    wall_now_ms() < WATCHER_SUPPRESS_UNTIL_MS.load(std::sync::atomic::Ordering::SeqCst)
}

pub fn save_config(cfg: &VoiceConfig) {
    // Suppress watcher *before* any bak/tmp/rename so early Modify events cannot
    // echo mvp_init + Vosk restart (that race 假死'd the UI on layout close).
    note_config_self_write();
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
        // Keep two rolling backups so accidental mapping wipes can be recovered.
        if path.exists() {
            let bak = parent.join("settings.json.bak");
            let bak2 = parent.join("settings.json.bak2");
            let _ = fs::remove_file(&bak2);
            if bak.exists() {
                let _ = fs::rename(&bak, &bak2);
            }
            let _ = fs::copy(&path, &bak);
        }
    }
    let json = serde_json::to_string_pretty(cfg).unwrap();
    // Atomic-ish replace: write temp then swap. Avoids watcher reading a truncated
    // settings.json mid-write (parse fail → Default → voice restart storm).
    let tmp = path.with_extension("json.tmp");
    if fs::write(&tmp, &json).is_ok() {
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        if fs::rename(&tmp, &path).is_err() {
            let _ = fs::copy(&tmp, &path);
            let _ = fs::remove_file(&tmp);
        }
    } else {
        let _ = fs::write(&path, &json);
    }
    // Refresh suppress after write completes (covers slow disks / delayed notify).
    note_config_self_write();
}

pub fn apply_config(state: &AppState, cfg: &VoiceConfig) {
    crate::codex_numpad_layer::sync_hook_cache(cfg);
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.bind_all(&cfg.bindings());
        mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
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

/// Drop fields that the FE already owns locally (window geometry / camera prefs /
/// per-scenario cameraOverride). Watcher reloads that only touch these must not
/// push `mvp_init` — that path races camera MediaPipe + drawer re-render and has
/// 假死'd the UI (layout-save echo / scenario camera tile saves).
fn config_json_without_watcher_noise(cfg: &VoiceConfig) -> serde_json::Value {
    let mut value = serde_json::to_value(cfg).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = value.as_object_mut() {
        for key in [
            "windowLayoutSeen",
            "windowMaximized",
            "windowWidth",
            "windowHeight",
            "windowX",
            "windowY",
            "cameraPrefs",
        ] {
            obj.remove(key);
        }
        for list_key in ["mappings", "trash"] {
            if let Some(arr) = obj.get_mut(list_key).and_then(|v| v.as_array_mut()) {
                for item in arr {
                    if let Some(m) = item.as_object_mut() {
                        m.remove("cameraOverride");
                    }
                }
            }
        }
    }
    value
}

pub(crate) fn is_watcher_noise_only_change(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    config_json_without_watcher_noise(old) == config_json_without_watcher_noise(new)
}

/// Strip per-mapping `codexMicroPad` so we can detect pad-only edits.
fn config_json_without_codex_micro_pad(cfg: &VoiceConfig) -> serde_json::Value {
    let mut value = serde_json::to_value(cfg).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = value.as_object_mut() {
        for list_key in ["mappings", "trash"] {
            if let Some(arr) = obj.get_mut(list_key).and_then(|v| v.as_array_mut()) {
                for item in arr {
                    if let Some(m) = item.as_object_mut() {
                        m.remove("codexMicroPad");
                    }
                }
            }
        }
    }
    value
}

/// True when the only mapping diffs are inside `codexMicroPad` (enable / overlay / keys).
/// Those saves must not push `mvp_init` or remount camera — that path 假死'd the UI.
pub(crate) fn is_codex_micro_pad_only_change(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    let full_old = serde_json::to_value(old).unwrap_or(serde_json::Value::Null);
    let full_new = serde_json::to_value(new).unwrap_or(serde_json::Value::Null);
    if full_old == full_new {
        return false;
    }
    config_json_without_codex_micro_pad(old) == config_json_without_codex_micro_pad(new)
}

/// Strip gesture / finish timing fields so trigger-mode toggles can quiet-save.
fn config_json_without_mapping_gesture_fields(cfg: &VoiceConfig) -> serde_json::Value {
    let mut value = serde_json::to_value(cfg).unwrap_or(serde_json::Value::Null);
    if let Some(obj) = value.as_object_mut() {
        for list_key in ["mappings", "trash"] {
            if let Some(arr) = obj.get_mut(list_key).and_then(|v| v.as_array_mut()) {
                for item in arr {
                    if let Some(m) = item.as_object_mut() {
                        for key in [
                            "triggerMode",
                            "cancelEnabled",
                            "autoEnterEnabled",
                            "intervalMs",
                            "enterDelayMs",
                        ] {
                            m.remove(key);
                        }
                    }
                }
            }
        }
        // Top-level mirrors used by older payloads.
        for key in [
            "cancelEnabled",
            "autoEnterEnabled",
            "intervalMs",
            "enterDelayMs",
        ] {
            obj.remove(key);
        }
    }
    value
}

/// True when only start/finish gesture fields changed (触发方式 / 收尾开关 / 延时).
/// Full `mvp_init` + camera remount used to 假死 the keys panel on every segment click.
pub(crate) fn is_mapping_gesture_only_change(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    let full_old = serde_json::to_value(old).unwrap_or(serde_json::Value::Null);
    let full_new = serde_json::to_value(new).unwrap_or(serde_json::Value::Null);
    if full_old == full_new {
        return false;
    }
    config_json_without_mapping_gesture_fields(old)
        == config_json_without_mapping_gesture_fields(new)
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
                    // Our own quiet/layout/cmd_save writes must not echo mvp_init + vosk restart.
                    if is_config_watcher_suppressed() {
                        crate::app_log::log_line(
                            &state,
                            "config",
                            "config file changed (self-write, skip mvp_init)",
                        );
                        last_emit = std::time::Instant::now();
                        continue;
                    }
                    let Some(mut new_cfg) = try_load_config_for_watcher() else {
                        crate::app_log::log_line(
                            &state,
                            "config",
                            "config file changed (unreadable/partial, skip)",
                        );
                        last_emit = std::time::Instant::now();
                        continue;
                    };
                    new_cfg.normalize();

                    let old_cfg = state.cfg.lock().clone();
                    // Ignore apparent wipes from a bad read — never replace live config with empty.
                    if new_cfg.mappings.is_empty() && !old_cfg.mappings.is_empty() {
                        crate::app_log::log_line(
                            &state,
                            "config",
                            "config file changed (empty mappings vs live, skip)",
                        );
                        last_emit = std::time::Instant::now();
                        continue;
                    }
                    // Compare before prefer_vosk mutation — that helper can rewrite engine
                    // flags and falsely look like a full config change after a camera save.
                    if is_watcher_noise_only_change(&old_cfg, &new_cfg) {
                        {
                            *state.cfg.lock() = new_cfg;
                        }
                        crate::app_log::log_line(
                            &state,
                            "config",
                            "config file changed (layout/camera only, skip mvp_init)",
                        );
                        last_emit = std::time::Instant::now();
                        continue;
                    }
                    let normalized_voice_engine =
                        prefer_vosk_when_both_voice_engines_enabled(&mut new_cfg);
                    {
                        *state.cfg.lock() = new_cfg.clone();
                    }
                    apply_config(&state, &new_cfg);
                    // Voice stop/start must not run on the notify watcher thread: fingerprint
                    // restart used to sync-join Vosk and 假死 the window while FE awaits IPC.
                    let app_voice = app.clone();
                    let state_voice = Arc::clone(&state);
                    let old_voice = old_cfg.clone();
                    let new_voice = new_cfg.clone();
                    let _ = std::thread::Builder::new()
                        .name("voice-config-apply".into())
                        .spawn(move || {
                            crate::voice_bootstrap::apply_voice_config_change(
                                &app_voice,
                                &state_voice,
                                &old_voice,
                                &new_voice,
                            );
                        });
                    // Non-blocking emit only (see emit_to_main_if_available). Never block the
                    // watcher on the UI thread — strategy IPC + watcher used to 假死 together.
                    let payload = ipc::mvp_init_payload(&state, "unchanged");
                    let _ = ipc::emit_app_event(&app, "to_js", &payload);
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
        assert_eq!(cfg.desired_engine, "vosk");
    }

    #[test]
    fn reconcile_voice_engine_flags_prefers_sapi_over_kws() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_sapi.enabled = true;
        cfg.voice_kws.enabled = true;
        assert!(reconcile_voice_engine_flags(&mut cfg));
        assert!(cfg.voice_sapi.enabled);
        assert!(!cfg.voice_kws.enabled);
        assert_eq!(cfg.desired_engine, "sapi");
    }

    #[test]
    fn apply_desired_engine_mirrors_enabled_flags() {
        let mut cfg = VoiceConfig::default();
        apply_desired_engine(&mut cfg, "kws");
        assert_eq!(cfg.desired_engine, "kws");
        assert_eq!(cfg.voice_listening_strategy, "advanced");
        assert!(cfg.voice_kws.enabled);
        assert!(!cfg.voice_vosk.enabled);
        assert!(!cfg.voice_sapi.enabled);
        apply_desired_engine(&mut cfg, "none");
        assert_eq!(cfg.desired_engine, "none");
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn apply_voice_listening_strategy_off_clears_desired_engine() {
        let mut cfg = VoiceConfig::default();
        apply_desired_engine(&mut cfg, "vosk");
        apply_voice_listening_strategy(&mut cfg, "off");
        assert_eq!(cfg.voice_listening_strategy, "off");
        assert_eq!(cfg.desired_engine, "none");
        assert!(!cfg.voice_vosk.enabled);
        assert!(!cfg.voice_sapi.enabled);
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn apply_voice_listening_strategy_sets_desired_engine() {
        let mut cfg = VoiceConfig::default();
        apply_voice_listening_strategy(&mut cfg, "enhanced");
        assert_eq!(cfg.voice_listening_strategy, "enhanced");
        assert_eq!(cfg.desired_engine, "vosk");
        assert!(cfg.voice_vosk.enabled);
        assert!(!cfg.voice_kws.enabled);

        apply_voice_listening_strategy(&mut cfg, "resourceSaver");
        assert_eq!(cfg.voice_listening_strategy, "resourceSaver");
        assert_eq!(cfg.desired_engine, "kws");
        assert!(cfg.voice_kws.enabled);
        assert!(!cfg.voice_vosk.enabled);

        apply_voice_listening_strategy(&mut cfg, "auto");
        assert_eq!(cfg.voice_listening_strategy, "auto");
        assert_eq!(cfg.desired_engine, "kws");
    }

    #[test]
    fn normalize_derives_listening_strategy_from_legacy_engine() {
        let mut cfg = VoiceConfig::default();
        cfg.voice_listening_strategy.clear();
        cfg.desired_engine = "vosk".into();
        cfg.normalize();
        assert_eq!(cfg.voice_listening_strategy, "enhanced");

        cfg.voice_listening_strategy.clear();
        cfg.desired_engine = "kws".into();
        cfg.normalize();
        assert_eq!(cfg.voice_listening_strategy, "advanced");
    }

    #[test]
    fn migrate_v7_to_v8_peels_send_like_from_end_phrases() {
        let mut cfg = VoiceConfig::default();
        cfg.version = 7;
        cfg.voice_end.phrases_zh = vec![
            "结束输入".into(),
            "发出去".into(),
            "发送".into(),
            "就这样".into(),
        ];
        cfg.voice_end.phrases_en = vec!["end dictation".into(), "send it".into(), "submit".into()];
        cfg.voice_end.send_phrases_zh.clear();
        cfg.voice_end.send_phrases_en.clear();
        cfg.voice_end.auto_send_enabled = true;
        cfg.voice_end.send_mode = "confirm".into();
        let scene_id = cfg.active_scene_id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == scene_id) {
            m.voice_override = Some(VoiceOverride {
                end_phrases: Some(PhraseBundle {
                    zh: vec!["情景结束".into(), "提交".into()],
                    en: vec!["send".into(), "wrap up".into()],
                }),
                ..Default::default()
            });
        }
        cfg.migrate();
        assert_eq!(cfg.version, 8);
        assert!(!cfg
            .voice_end
            .phrases_zh
            .iter()
            .any(|p| is_send_like_phrase(p)));
        assert!(!cfg
            .voice_end
            .phrases_en
            .iter()
            .any(|p| is_send_like_phrase(p)));
        assert!(cfg
            .voice_end
            .send_phrases_zh
            .iter()
            .any(|p| normalize_phrase_key(p) == normalize_phrase_key("发出去")));
        assert!(cfg
            .voice_end
            .send_phrases_en
            .iter()
            .any(|p| normalize_phrase_key(p) == "sendit"));
        assert_eq!(cfg.voice_end.send_mode, "auto");
        assert!(cfg.voice_end.auto_send_enabled);
        assert!(cfg
            .voice_end
            .cancel_phrases_zh
            .iter()
            .any(|p| normalize_phrase_key(p) == normalize_phrase_key("撤掉")));
        let ov = cfg
            .mappings
            .iter()
            .find(|m| m.id == scene_id)
            .and_then(|m| m.voice_override.as_ref())
            .expect("override");
        let end = ov.end_phrases.as_ref().expect("end");
        assert!(!end.zh.iter().any(|p| is_send_like_phrase(p)));
        assert!(!end.en.iter().any(|p| is_send_like_phrase(p)));
        let send = ov.send_phrases.as_ref().expect("send");
        assert!(send
            .zh
            .iter()
            .any(|p| normalize_phrase_key(p) == normalize_phrase_key("提交")));
        assert!(send.en.iter().any(|p| normalize_phrase_key(p) == "send"));
    }

    #[test]
    fn migrate_v6_to_v7_derives_desired_from_flags() {
        let mut cfg = VoiceConfig::default();
        cfg.version = 6;
        cfg.desired_engine = "none".into();
        cfg.voice_vosk.enabled = true;
        cfg.migrate();
        assert_eq!(cfg.version, 8);
        assert_eq!(cfg.desired_engine, "vosk");
        assert!(cfg.voice_vosk.enabled);
        assert!(!cfg.voice_sapi.enabled);
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn migrate_v6_to_v7_heals_dual_enabled_flags() {
        let mut cfg = VoiceConfig::default();
        cfg.version = 6;
        cfg.voice_vosk.enabled = true;
        cfg.voice_kws.enabled = true;
        cfg.migrate();
        assert_eq!(cfg.version, 8);
        assert_eq!(cfg.desired_engine, "vosk");
        assert!(cfg.voice_vosk.enabled);
        assert!(!cfg.voice_kws.enabled);
    }

    #[test]
    fn normalize_rejects_invalid_desired_engine() {
        let mut cfg = VoiceConfig::default();
        cfg.desired_engine = "not-a-real-engine".into();
        cfg.voice_sapi.enabled = true;
        cfg.normalize();
        assert_eq!(cfg.desired_engine, "sapi");
        assert!(cfg.voice_sapi.enabled);
    }

    #[test]
    fn merge_save_payload_preserves_camera_prefs_when_omitted() {
        let mut existing = VoiceConfig::default();
        existing.camera_prefs = CameraPrefs {
            enabled: true,
            selected_device_id: "cam-abc".into(),
            preview_enabled: false,
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                triggers: PresenceTriggersPrefs {
                    away: true,
                    shake: true,
                    blink: true,
                    ..Default::default()
                },
                on_away: "privacyScreen".into(),
                on_return: "resumeVoice".into(),
                shake_head: "pressEsc".into(),
                deliberate_blink: "pressCtrlI".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        let json = r#"{"version":8,"mappings":[],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert_eq!(merged.camera_prefs.selected_device_id, "cam-abc");
        assert!(merged.camera_prefs.presence_actions.enabled);
        assert_eq!(
            merged.camera_prefs.presence_actions.deliberate_blink,
            "pressCtrlI"
        );
    }

    #[test]
    fn merge_save_payload_ignores_stale_fe_camera_prefs() {
        let mut existing = VoiceConfig::default();
        existing.camera_prefs = CameraPrefs {
            enabled: true,
            selected_device_id: "cam-keep".into(),
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                deliberate_blink: "pressCtrlI".into(),
                ..PresenceActionsPrefs::default()
            },
            ..Default::default()
        };
        // FE full save with default/empty cameraPrefs must not wipe quiet camera saves.
        let json = r#"{"version":8,"mappings":[],"trash":[],"cameraPrefs":{"enabled":false,"selectedDeviceId":"","previewEnabled":false,"selectedWidth":0,"selectedHeight":0,"selectedFrameRate":0,"gazeCalibration":null,"presenceActions":{"enabled":false,"triggers":{"away":false,"shake":false,"blink":false},"onAway":"none","onReturn":"none","shakeHead":"none","deliberateBlink":"none"}}}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert_eq!(merged.camera_prefs.selected_device_id, "cam-keep");
        assert!(merged.camera_prefs.presence_actions.enabled);
        assert_eq!(
            merged.camera_prefs.presence_actions.deliberate_blink,
            "pressCtrlI"
        );
    }

    #[test]
    fn camera_prefs_serde_preserves_triggers_decoupled_from_actions() {
        // Trigger on + action none must survive quiet camera prefs save (cmd_save_camera_prefs).
        let prefs = CameraPrefs {
            enabled: true,
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                triggers: PresenceTriggersPrefs {
                    away: true,
                    shake: false,
                    blink: true,
                    ..Default::default()
                },
                on_away: "none".into(),
                on_return: "none".into(),
                shake_head: "none".into(),
                deliberate_blink: "none".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&prefs).expect("serialize");
        assert!(json.contains("\"triggers\""));
        let parsed: CameraPrefs = serde_json::from_str(&json).expect("parse");
        assert!(parsed.presence_actions.enabled);
        assert!(parsed.presence_actions.triggers.away);
        assert!(!parsed.presence_actions.triggers.shake);
        assert!(parsed.presence_actions.triggers.blink);
        assert_eq!(parsed.presence_actions.on_away, "none");
    }

    #[test]
    fn camera_prefs_serde_preserves_hand_gesture_bindings() {
        let prefs = CameraPrefs {
            enabled: true,
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                triggers: PresenceTriggersPrefs {
                    open_palm: true,
                    ok_hand: true,
                    fist: false,
                    wave: true,
                    ..Default::default()
                },
                open_palm: "pressEsc".into(),
                ok_hand: "pressCtrlI".into(),
                fist: "none".into(),
                wave: "privacyScreen".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&prefs).expect("serialize");
        assert!(json.contains("\"openPalm\""));
        assert!(json.contains("\"okHand\""));
        let parsed: CameraPrefs = serde_json::from_str(&json).expect("parse");
        assert!(parsed.presence_actions.triggers.open_palm);
        assert!(parsed.presence_actions.triggers.ok_hand);
        assert!(!parsed.presence_actions.triggers.fist);
        assert!(parsed.presence_actions.triggers.wave);
        assert_eq!(parsed.presence_actions.open_palm, "pressEsc");
        assert_eq!(parsed.presence_actions.ok_hand, "pressCtrlI");
        assert_eq!(parsed.presence_actions.wave, "privacyScreen");
    }

    #[test]
    fn merge_camera_prefs_quiet_keeps_gaze_when_incoming_null() {
        let existing = CameraPrefs {
            enabled: true,
            selected_device_id: "cam-1".into(),
            selected_width: 1280,
            selected_height: 720,
            selected_frame_rate: 30,
            gaze_calibration: Some(serde_json::json!({"v":1,"ok":true})),
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                deliberate_blink: "pressCtrlI".into(),
                ..PresenceActionsPrefs::default()
            },
            ..Default::default()
        };
        let incoming = CameraPrefs {
            enabled: true,
            selected_device_id: "".into(),
            gaze_calibration: None,
            presence_actions: PresenceActionsPrefs {
                enabled: true,
                deliberate_blink: "pressCtrlI".into(),
                ..PresenceActionsPrefs::default()
            },
            ..Default::default()
        };
        let merged = merge_camera_prefs_quiet(&existing, incoming, false, false, false);
        assert_eq!(
            merged.gaze_calibration,
            Some(serde_json::json!({"v":1,"ok":true}))
        );
        assert_eq!(merged.selected_device_id, "cam-1");
        assert_eq!(merged.selected_width, 1280);
        assert_eq!(merged.selected_height, 720);
        assert_eq!(merged.selected_frame_rate, 30);
    }

    #[test]
    fn merge_camera_prefs_quiet_clears_gaze_when_flagged() {
        let existing = CameraPrefs {
            gaze_calibration: Some(serde_json::json!({"v":1})),
            ..Default::default()
        };
        let incoming = CameraPrefs {
            gaze_calibration: None,
            ..Default::default()
        };
        let merged = merge_camera_prefs_quiet(&existing, incoming, true, false, false);
        assert!(merged.gaze_calibration.is_none());
    }

    #[test]
    fn merge_camera_prefs_quiet_keeps_video_enhancement_when_field_missing() {
        let existing = CameraPrefs {
            video_enhancement: VideoEnhancementPrefs {
                enabled: true,
                preset: "clear".into(),
                beauty_enabled: true,
                beauty: 40,
                ..VideoEnhancementPrefs::default()
            },
            ..Default::default()
        };
        let incoming = CameraPrefs {
            selected_device_id: "cam-2".into(),
            ..Default::default()
        };
        let merged = merge_camera_prefs_quiet(&existing, incoming, false, false, false);
        assert!(merged.video_enhancement.enabled);
        assert_eq!(merged.video_enhancement.preset, "clear");
        assert_eq!(merged.video_enhancement.beauty, 40);
        assert_eq!(merged.selected_device_id, "cam-2");
    }

    #[test]
    fn merge_camera_prefs_quiet_applies_video_enhancement_when_field_present() {
        let existing = CameraPrefs {
            video_enhancement: VideoEnhancementPrefs {
                enabled: true,
                preset: "clear".into(),
                ..VideoEnhancementPrefs::default()
            },
            ..Default::default()
        };
        let incoming = CameraPrefs {
            video_enhancement: VideoEnhancementPrefs::default(),
            ..Default::default()
        };
        let merged = merge_camera_prefs_quiet(&existing, incoming, false, true, true);
        assert!(!merged.video_enhancement.enabled);
        assert_eq!(merged.video_enhancement.preset, "natural");
    }

    #[test]
    fn merge_camera_prefs_quiet_allows_auto_frame_rate_zero() {
        let existing = CameraPrefs {
            selected_frame_rate: 30,
            ..Default::default()
        };
        let incoming = CameraPrefs {
            selected_frame_rate: 0,
            ..Default::default()
        };
        let merged = merge_camera_prefs_quiet(&existing, incoming, false, false, true);
        assert_eq!(merged.selected_frame_rate, 0);
    }

    #[test]
    fn video_enhancement_serde_defaults_when_omitted() {
        let prefs: CameraPrefs = serde_json::from_str(
            r#"{"enabled":false,"selectedDeviceId":"","previewEnabled":false}"#,
        )
        .expect("parse");
        assert_eq!(prefs.video_enhancement, VideoEnhancementPrefs::default());
    }

    #[test]
    fn camera_override_serde_preserves_trigger_only_partial() {
        let ov = CameraOverride {
            triggers: Some(CameraOverrideTriggers {
                shake: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        };
        assert!(!ov.is_empty());
        let json = serde_json::to_string(&ov).expect("serialize");
        let parsed: CameraOverride = serde_json::from_str(&json).expect("parse");
        assert_eq!(parsed.triggers.as_ref().and_then(|t| t.shake), Some(true));
        assert!(normalize_camera_override(Some(ov)).is_some());
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
        assert_eq!(cfg.version, 8);
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
    fn hotkey_registration_skips_hold_to_talk_agent_chord() {
        let mut m = VoiceConfig::default().mappings[0].clone();
        m.trigger_key.clear();
        m.source_key = "PageDown".into();
        m.agent_bindings.push(AgentBinding {
            slot_id: "pushToTalk".into(),
            action_id: "startDictation".into(),
            trigger_type: "key".into(),
            trigger_binding: "LCtrl+LShift+D".into(),
            enabled: true,
            execution_mode: None,
            activation_scope: "global".into(),
        });
        let bindings = hotkey_registration_bindings(&m);
        assert!(bindings.iter().any(|b| b == "PageDown"));
        assert!(!bindings.iter().any(|b| crate::key_chord::is_hold_to_talk_chord(b)));
    }

    #[test]
    fn mapping_physical_bindings_falls_back_to_source_key() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].trigger_key.clear();
        cfg.mappings[0].source_key = "PageDown".into();
        let bindings = mapping_physical_bindings(&cfg.mappings[0]);
        assert_eq!(bindings, vec!["PageDown".to_string()]);
        cfg.normalize();
        assert_eq!(cfg.mappings[0].trigger_key, "PageDown");
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
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
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
    fn merge_save_payload_preserves_agent_bindings_when_omitted() {
        let mut existing = VoiceConfig::default();
        existing.mappings[0].agent_template_id = "codex-micro-13".into();
        existing.mappings[0].agent_provider_id = "codex".into();
        existing.mappings[0].agent_bindings = vec![AgentBinding {
            slot_id: "cancel".into(),
            action_id: "cancel".into(),
            trigger_type: "key".into(),
            trigger_binding: "Esc".into(),
            enabled: true,
            execution_mode: Some("execute".into()),
            activation_scope: "global".into(),
        }];
        let id = existing.mappings[0].id.clone();
        let json = format!(
            r#"{{"version":8,"mappings":[{{"id":"{id}","label":"x","group":"g","triggerKey":"AutoTrigger","targetKey":"RAlt","enabled":true}}],"trash":[]}}"#
        );
        let merged = merge_save_payload(&existing, &json).expect("merge");
        let row = merged.mappings.iter().find(|m| m.id == id).expect("row");
        assert_eq!(row.agent_template_id, "codex-micro-13");
        assert_eq!(row.agent_provider_id, "codex");
        assert_eq!(row.agent_bindings.len(), 1);
        assert_eq!(row.agent_bindings[0].slot_id, "cancel");
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
    fn merge_save_payload_restores_cleared_app_target_id() {
        let mut existing = VoiceConfig::default();
        let mut chrome = existing.mappings[0].clone();
        chrome.id = "m-chrome".into();
        chrome.app_target_id = "custom".into();
        chrome.group = "Google Chrome 场景".into();
        chrome.app_behavior_rules = vec![AppBehaviorRule {
            rule_id: "rule-1".into(),
            app_id: "custom".into(),
            finish_mode: "confirm".into(),
            note: None,
            summon_phrase: None,
            app_match: Some(AppMatchSpec {
                exe_names: vec!["chrome.exe".into()],
                path_contains: None,
                title_contains: None,
                full_path: Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".into()),
            }),
            display_name: Some("Google Chrome".into()),
        }];
        existing.mappings.push(chrome);
        let json = r#"{"version":8,"mappings":[{"id":"m-chrome","label":"","group":"Google Chrome 场景","triggerKey":"","targetKey":"","enabled":true,"appTargetId":"","appBehaviorRules":[{"ruleId":"rule-1","appId":"custom","finishMode":"confirm","displayName":"Google Chrome","match":{"exeNames":["chrome.exe"],"fullPath":"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"}}]}],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        let row = merged
            .mappings
            .iter()
            .find(|m| m.id == "m-chrome")
            .expect("chrome row");
        assert_eq!(row.app_target_id, "custom");
    }

    #[test]
    fn merge_save_payload_preserves_omitted_app_scenarios() {
        let mut existing = VoiceConfig::default();
        let mut chrome = existing.mappings[0].clone();
        chrome.id = "m-chrome".into();
        chrome.app_target_id = "chrome".into();
        chrome.group = "谷歌浏览器".into();
        existing.mappings.push(chrome);
        let json = r#"{"version":8,"mappings":[{"id":"m-default","label":"默认","group":"默认","triggerKey":"AutoTrigger","targetKey":"RAlt","enabled":true,"appTargetId":"","appBehaviorRules":[]}],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert!(
            merged
                .mappings
                .iter()
                .any(|m| m.id == "m-chrome" && m.app_target_id == "chrome"),
            "omitted app scenario must be preserved from disk"
        );
    }

    #[test]
    fn merge_save_payload_allows_app_scenario_move_to_trash() {
        let mut existing = VoiceConfig::default();
        let mut chrome = existing.mappings[0].clone();
        chrome.id = "m-chrome".into();
        chrome.app_target_id = "chrome".into();
        existing.mappings.push(chrome.clone());
        let json = format!(
            r#"{{"version":8,"mappings":[{{"id":"m-default","label":"默认","group":"默认","triggerKey":"AutoTrigger","targetKey":"RAlt","enabled":true,"appTargetId":"","appBehaviorRules":[]}}],"trash":[{{"id":"m-chrome","label":"","group":"谷歌浏览器","triggerKey":"","targetKey":"","enabled":false,"appTargetId":"chrome","appBehaviorRules":[]}}]}}"#
        );
        let merged = merge_save_payload(&existing, &json).expect("merge");
        assert!(
            !merged.mappings.iter().any(|m| m.id == "m-chrome"),
            "explicit trash must not resurrect app scenario into mappings"
        );
        assert!(merged.trash.iter().any(|m| m.id == "m-chrome"));
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
    fn merge_save_payload_preserves_voice_listening_strategy() {
        let mut existing = VoiceConfig::default();
        existing.voice_listening_strategy = "resourceSaver".into();
        let json = r#"{"version":5,"mappings":[],"trash":[],"voiceListeningStrategy":"auto"}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert_eq!(merged.voice_listening_strategy, "resourceSaver");
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
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
    fn watcher_skips_mvp_init_for_layout_or_camera_only() {
        let mut old = VoiceConfig::default();
        let mut layout_only = old.clone();
        layout_only.window_layout_seen = true;
        layout_only.window_maximized = true;
        layout_only.window_width = 900.0;
        layout_only.window_height = 700.0;
        layout_only.window_x = Some(12.0);
        layout_only.window_y = Some(34.0);
        assert!(is_watcher_noise_only_change(&old, &layout_only));

        let mut camera_only = old.clone();
        camera_only.camera_prefs = CameraPrefs {
            selected_device_id: "cam-1".into(),
            ..CameraPrefs::default()
        };
        assert!(is_watcher_noise_only_change(&old, &camera_only));

        let mut cam_ov_only = old.clone();
        if let Some(m) = cam_ov_only.mappings.first_mut() {
            m.camera_override = Some(CameraOverride {
                on_away: Some("privacyScreen".into()),
                ..CameraOverride::default()
            });
        }
        assert!(is_watcher_noise_only_change(&old, &cam_ov_only));

        old.desired_engine = "vosk".into();
        assert!(!is_watcher_noise_only_change(&old, &layout_only));
    }

    #[test]
    fn quiet_save_for_codex_micro_pad_only() {
        let mut old = VoiceConfig::default();
        if let Some(m) = old.mappings.first_mut() {
            m.codex_micro_pad = Some(crate::codex_numpad_layer::default_codex_micro_pad());
        }
        let mut pad_only = old.clone();
        if let Some(m) = pad_only.mappings.first_mut() {
            if let Some(pad) = m.codex_micro_pad.as_mut() {
                pad.enabled = !pad.enabled;
                pad.overlay_enabled = !pad.overlay_enabled;
            }
        }
        assert!(is_codex_micro_pad_only_change(&old, &pad_only));

        let mut with_label = pad_only.clone();
        if let Some(m) = with_label.mappings.first_mut() {
            m.label = "changed".into();
        }
        assert!(!is_codex_micro_pad_only_change(&old, &with_label));
        assert!(!is_codex_micro_pad_only_change(&old, &old));
    }

    #[test]
    fn quiet_save_for_mapping_gesture_only() {
        let old = VoiceConfig::default();
        let mut gesture_only = old.clone();
        if let Some(m) = gesture_only.mappings.first_mut() {
            m.trigger_mode = crate::config::TriggerMode::Double;
            m.cancel_enabled = !m.cancel_enabled;
            m.auto_enter_enabled = !m.auto_enter_enabled;
            m.interval_ms = m.interval_ms.saturating_add(100);
        }
        assert!(is_mapping_gesture_only_change(&old, &gesture_only));

        let mut with_key = gesture_only.clone();
        if let Some(m) = with_key.mappings.first_mut() {
            m.trigger_key = "F8".into();
        }
        assert!(!is_mapping_gesture_only_change(&old, &with_key));
        assert!(!is_mapping_gesture_only_change(&old, &old));
    }

    #[test]
    fn effective_mapping_applies_app_behavior_rule() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.trigger_mode = TriggerMode::Tap;
        mapping.cancel_enabled = true;
        mapping.auto_enter_enabled = true;
        mapping.app_behavior_rules = vec![test_rule("cursor-chat", "perpress")];
        let effective = effective_mapping_for_trigger(
            &mapping,
            Some(&test_identity(Some("cursor-chat"), "Cursor.exe")),
        );
        assert_eq!(effective.trigger_mode, TriggerMode::PerPress);
        let fallback = effective_mapping_for_trigger(
            &mapping,
            Some(&test_identity(Some("codex-chat"), "Codex.exe")),
        );
        assert_eq!(fallback.trigger_mode, TriggerMode::Tap);
        assert!(fallback.cancel_enabled);
        assert!(fallback.auto_enter_enabled);
    }

    #[test]
    fn global_preset_rules_are_not_app_scenarios() {
        let mut global = VoiceConfig::default().mappings[0].clone();
        global.app_behavior_rules = vec![
            test_rule("cursor-chat", "confirm"),
            test_rule("codex-chat", "confirm"),
        ];
        assert!(!is_app_scenario_mapping(&global));

        let mut codex = global.clone();
        codex.app_target_id = "codex-chat".into();
        codex.agent_template_id = "codex-micro-13".into();
        assert!(is_app_scenario_mapping(&codex));
    }

    #[test]
    fn mapping_shadowed_when_dedicated_app_scenario_owns_foreground() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings[0].trigger_key = "Ctrl+Shift+D".into();
        cfg.mappings[0].target_key = "RAlt".into();
        cfg.mappings[0].app_behavior_rules = vec![test_rule("codex-chat", "confirm")];
        cfg.mappings.push(MappingEntry {
            id: "codex-scene".into(),
            label: String::new(),
            group: "Codex".into(),
            trigger_key: "PageDown".into(),
            target_key: "Ctrl+Shift+D".into(),
            enabled: true,
            order: 1,
            trigger_mode: TriggerMode::LongPress,
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
            app_target_id: "codex-chat".into(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: "codex-micro-13".into(),
            agent_provider_id: "codex".into(),
            agent_bindings: vec![],
            codex_micro_pad: None,
        });
        let fg = test_identity(Some("codex-chat"), "Codex.exe");
        assert!(mapping_shadowed_by_foreground_app_scenario(
            &cfg,
            &cfg.mappings[0],
            &fg
        ));
        assert!(!mapping_shadowed_by_foreground_app_scenario(
            &cfg,
            &cfg.mappings[1],
            &fg
        ));
        let cursor = test_identity(Some("cursor-chat"), "Cursor.exe");
        assert!(!mapping_shadowed_by_foreground_app_scenario(
            &cfg,
            &cfg.mappings[0],
            &cursor
        ));
    }

    #[test]
    fn find_app_scenario_for_foreground_prefers_agent_pack() {
        let mut cfg = VoiceConfig::default();
        let global_id = cfg.mappings[0].id.clone();
        cfg.mappings[0].app_behavior_rules = vec![test_rule("codex-chat", "confirm")];
        cfg.mappings.push(MappingEntry {
            id: "codex-scene".into(),
            label: String::new(),
            group: "Codex".into(),
            trigger_key: String::new(),
            target_key: String::new(),
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
            app_target_id: "codex-chat".into(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: "codex-micro-13".into(),
            agent_provider_id: "codex".into(),
            agent_bindings: vec![AgentBinding {
                slot_id: "pushToTalk".into(),
                action_id: "startDictation".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+Alt+Space".into(),
                enabled: true,
                execution_mode: None,
                activation_scope: "foregroundApp".into(),
            }],
            codex_micro_pad: None,
        });
        let fg = test_identity(Some("codex-chat"), "Codex.exe");
        let hit = find_app_scenario_for_foreground(&cfg, &fg).expect("codex scenario");
        assert_eq!(hit.id, "codex-scene");
        assert_ne!(hit.id, global_id);
        let workflow =
            resolve_foreground_workflow_target(&cfg.mappings[0], &fg).expect("global workflow");
        assert_eq!(workflow, "codex-chat");
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
    fn resolve_mapping_summon_target_custom_uses_rule_ref() {
        let mut mapping = VoiceConfig::default().mappings[0].clone();
        mapping.app_target_id = "custom".into();
        mapping.app_behavior_rules = vec![
            AppBehaviorRule {
                rule_id: "rule-noise".into(),
                app_id: "cursor-chat".into(),
                finish_mode: "manual".into(),
                note: None,
                summon_phrase: None,
                display_name: None,
                app_match: None,
            },
            AppBehaviorRule {
                rule_id: "rule-weixin".into(),
                app_id: "custom".into(),
                finish_mode: "confirm".into(),
                note: None,
                summon_phrase: None,
                display_name: Some("微信".into()),
                app_match: Some(AppMatchSpec {
                    exe_names: vec!["Weixin.exe".into()],
                    path_contains: Some(r"Tencent\Weixin".into()),
                    title_contains: None,
                    full_path: Some(r"C:\Program Files\Tencent\Weixin\Weixin.exe".into()),
                }),
            },
        ];
        assert_eq!(
            resolve_mapping_summon_target(&mapping).as_deref(),
            Some("rule:rule-weixin")
        );
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
    fn summon_matches_wechat_appex_for_weixin_rule() {
        let rule = AppBehaviorRule {
            rule_id: "rule-weixin".into(),
            app_id: "custom".into(),
            finish_mode: "manual".into(),
            note: None,
            summon_phrase: None,
            display_name: Some("微信".into()),
            app_match: Some(AppMatchSpec {
                exe_names: vec!["Weixin.exe".into()],
                path_contains: Some(r"C:\Program Files\Tencent\Weixin".into()),
                title_contains: None,
                full_path: Some(r"C:\Program Files\Tencent\Weixin\Weixin.exe".into()),
            }),
        };
        let chat_ui = AppIdentity {
            pid: 42,
            exe_name: "WeChatAppEx.exe".into(),
            full_path: Some(
                r"C:\Users\me\AppData\Roaming\Tencent\xwechat\xplugin\WeChatAppEx.exe".into(),
            ),
            window_title: "文件传输助手".into(),
            matched_preset_app_id: None,
        };
        assert!(!rule_matches_identity(&rule, &chat_ui));
        assert!(rule_matches_identity_for_summon(&rule, &chat_ui));
        assert!(is_wechat_family_rule(&rule));
        assert!(is_wechat_family_identity(&chat_ui));
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
            aliases: vec![
                "微信语音输入".into(),
                "微信开始输入".into(),
                "第三alias".into(),
            ],
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
        assert!(entries
            .iter()
            .any(|(p, t)| p == "微信输入" && t == "cursor-chat"));
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
        assert!(entries
            .iter()
            .any(|(p, t)| p == "开始编程" && t == "cursor-chat"));
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
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![cmd],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
            codex_micro_pad: None,
        };
        let json = serde_json::to_string(&mapping).expect("serialize");
        let back: MappingEntry = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.acoustic_voice_commands.len(), 1);
        assert_eq!(
            back.acoustic_voice_commands[0].samples[0].feature_frames,
            40
        );
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
    fn merge_save_payload_preserves_voice_wake_acoustic_when_omitted() {
        let mut existing = VoiceConfig::default();
        let mut cmd = sample_acoustic_command("__voice_wake__", "good");
        cmd.scenario_id = "__voice_wake__".into();
        cmd.kind = "voice-wake-acoustic".into();
        existing.voice_wake_acoustic_commands = vec![cmd];
        let json = r#"{"version":8,"mappings":[],"trash":[]}"#;
        let merged = merge_save_payload(&existing, json).expect("merge");
        assert_eq!(merged.voice_wake_acoustic_commands.len(), 1);
        assert_eq!(
            merged.voice_wake_acoustic_commands[0].kind,
            "voice-wake-acoustic"
        );
    }

    #[test]
    fn merge_save_payload_accepts_voice_wake_acoustic_commands() {
        let existing = VoiceConfig::default();
        let mut cmd = sample_acoustic_command("__voice_wake__", "good");
        cmd.scenario_id = "__voice_wake__".into();
        cmd.kind = "voice-wake-acoustic".into();
        let payload = serde_json::json!({
            "version": 8,
            "mappings": [],
            "trash": [],
            "voiceWakeAcousticCommands": [cmd]
        });
        let merged = merge_save_payload(&existing, &payload.to_string()).expect("merge");
        assert_eq!(merged.voice_wake_acoustic_commands.len(), 1);
        assert_eq!(
            merged.voice_wake_acoustic_commands[0].scenario_id,
            "__voice_wake__"
        );
    }

    #[test]
    fn merge_save_payload_keeps_end_and_cancel_acoustic_scenarios() {
        let existing = VoiceConfig::default();
        let mut wake = sample_acoustic_command("__voice_wake__", "good");
        wake.scenario_id = "__voice_wake__".into();
        wake.kind = "voice-wake-acoustic".into();
        let mut end = sample_acoustic_command("__voice_end__", "good");
        end.scenario_id = "__voice_end__".into();
        end.kind = "voice-end-acoustic".into();
        let mut cancel = sample_acoustic_command("__voice_cancel__", "good");
        cancel.scenario_id = "__voice_cancel__".into();
        cancel.kind = "voice-cancel-acoustic".into();
        let payload = serde_json::json!({
            "version": 8,
            "mappings": [],
            "trash": [],
            "voiceWakeAcousticCommands": [wake, end, cancel]
        });
        let merged = merge_save_payload(&existing, &payload.to_string()).expect("merge");
        assert_eq!(merged.voice_wake_acoustic_commands.len(), 3);
        let ids: Vec<_> = merged
            .voice_wake_acoustic_commands
            .iter()
            .map(|c| c.scenario_id.as_str())
            .collect();
        assert!(ids.contains(&"__voice_wake__"));
        assert!(ids.contains(&"__voice_end__"));
        assert!(ids.contains(&"__voice_cancel__"));
    }
}
