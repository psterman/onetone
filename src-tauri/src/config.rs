use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TriggerMode {
    #[default]
    Tap,
    Hold,
    Toggle,
}

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
    /// 按下这些组合键时直接切换到此方案（可多个）。
    #[serde(rename = "switchKeys", default)]
    pub switch_keys: Vec<String>,
    /// 为 true 时不拦截物理启动键，恢复系统原生功能。
    #[serde(rename = "nativeKeyRestore", default)]
    pub native_key_restore: bool,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActionConfig {
    #[serde(default)]
    pub start: String,
    #[serde(default)]
    pub cancel: String,
    #[serde(default)]
    pub send: String,
}

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
    #[serde(default)]
    pub scenes: Option<Vec<SceneConfig>>,
    #[serde(rename = "schemeSwitchKey", default = "default_scheme_switch_key")]
    pub scheme_switch_key: String,
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
    5
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
fn default_debounce_ms() -> u32 {
    80
}
fn default_key_press_duration_ms() -> u32 {
    250
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
        "AudioVolumeDown" | "VolumeDown" | "Volume_Down" | "Audio_Volume_Down" => "Volume_Down".into(),
        "AudioVolumeMute" | "VolumeMute" | "Volume_Mute" | "Audio_Volume_Mute" => "Volume_Mute".into(),
        other => other.to_string(),
    }
}

pub fn is_allowed_trigger(key: &str) -> bool {
    !canonical_trigger(key).trim().is_empty()
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

fn volume_raw_event(hotkey: &str, label: &str) -> RawEvent {
    let (key, code) = match hotkey {
        "Volume_Down" => ("AudioVolumeDown", "AudioVolumeDown"),
        "Volume_Up" => ("AudioVolumeUp", "AudioVolumeUp"),
        "Volume_Mute" => ("AudioVolumeMute", "AudioVolumeMute"),
        other => (other, other),
    };
    RawEvent {
        device: "keyboard".into(),
        key: key.into(),
        code: code.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: label.into(),
        button: None,
    }
}

///     /        ?
pub fn is_peripheral_trigger_key(key: &str) -> bool {
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
            | "RAlt"
            | "RCtrl"
    ) || c.starts_with('F') && c[1..].chars().all(|ch| ch.is_ascii_digit())
}

fn peripheral_raw_event(hotkey: &str) -> RawEvent {
    if is_volume_hotkey(hotkey) {
        let hk = canonical_trigger(hotkey);
        let label = match hk.as_str() {
            "Volume_Down" => "Volume Down",
            "Volume_Up" => "Volume Up",
            "Volume_Mute" => "Volume Mute",
            _ => hotkey,
        };
        return volume_raw_event(&hk, label);
    }
    RawEvent {
        device: "keyboard".into(),
        key: hotkey.into(),
        code: hotkey.into(),
        location: 0,
        event_type: "keydown".into(),
        hotkey: hotkey.into(),
        label: hotkey.into(),
        button: None,
    }
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
        let hotkey = if c == "AutoTrigger" {
            k.to_string()
        } else {
            c
        };
        if !hotkey.is_empty() && !keys.iter().any(|x| x == &hotkey) {
            keys.push(hotkey);
        }
    }
    TriggerSource {
        id: "source_peripheral_mixed".into(),
        label: "      ".into(),
        mode: "single_press".into(),
        grouping: "same_source_group".into(),
        raw_events: keys.iter().map(|k| peripheral_raw_event(k)).collect(),
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

pub fn effective_physical_bindings(m: &MappingEntry) -> Vec<String> {
    if m.native_key_restore {
        return vec![];
    }
    mapping_physical_bindings(m)
}

pub fn mapping_physical_bindings(m: &MappingEntry) -> Vec<String> {
    let tk = canonical_trigger(&m.trigger_key);
    if tk.contains('+') {
        return vec![tk];
    }
    if let Some(src) = &m.trigger_source {
        let from_raw: Vec<String> = src
            .raw_events
            .iter()
            .filter_map(hotkey_from_raw_event)
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
    m.trigger_key = "AutoTrigger".into();
    let extra = if captured.trim().is_empty() || canonical_trigger(captured) == "AutoTrigger" {
        vec![]
    } else {
        vec![captured.to_string()]
    };
    if m.source_key.trim().is_empty() {
        m.source_key = if extra.is_empty() {
            "AutoTrigger".into()
        } else {
            canonical_trigger(&extra[0])
        };
    }
    m.trigger_source = Some(make_peripheral_mixed_source(&extra));
}

impl Default for VoiceConfig {
    fn default() -> Self {
        let id = new_mapping_id();
        Self {
            version: 5,
            mappings: vec![MappingEntry {
                id,
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
            }],
            trash: vec![],
            interval_ms: default_interval_ms(),
            enter_delay_ms: default_enter_delay_ms(),
            cancel_enabled: true,
            auto_enter_enabled: true,
            debounce_ms: default_debounce_ms(),
            key_press_duration_ms: default_key_press_duration_ms(),
            scenes: None,
            scheme_switch_key: String::new(),
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
    (interval, enter_delay, m.cancel_enabled, m.auto_enter_enabled)
}

impl VoiceConfig {
    pub fn migrate(&mut self) {
        if self.version >= 5 && !self.mappings.is_empty() {
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
            });
        }

        self.version = 5;
        self.record_key.clear();
        self.target_key.clear();
        self.trigger_source = None;
        self.actions = None;
        self.normalize();
    }

    pub fn normalize(&mut self) {
        if self.interval_ms < 200 {
            self.interval_ms = 200;
        }
        if self.enter_delay_ms < 1000 {
            self.enter_delay_ms = 1000;
        }
        if self.mappings.is_empty() {
            *self = VoiceConfig::default();
        }
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
            if m.target_key.is_empty() {
                m.target_key = "RAlt".into();
            }
            if m.interval_ms < 200 {
                m.interval_ms = self.interval_ms;
            }
            if m.enter_delay_ms < 1000 {
                m.enter_delay_ms = self.enter_delay_ms;
            }
        }
        self.mappings.sort_by_key(|m| m.order);
    }

    /// 在同一 canonical trigger 的已完成方案间轮换 enabled；返回 (from_id, to_id)。
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
        self.select_scheme(&to_id)
    }

    /// 直接切换到指定方案；返回 (from_id, to_id)。
    pub fn select_scheme(&mut self, target_id: &str) -> Option<(String, String)> {
        let target = self.find_mapping_by_id(target_id)?;
        if !is_mapping_complete(target) {
            return None;
        }
        let from_id = self
            .mappings
            .iter()
            .find(|m| m.enabled && is_mapping_complete(m))
            .map(|m| m.id.clone())
            .unwrap_or_default();
        if from_id == target_id {
            return None;
        }
        let trigger = canonical_trigger(&target.trigger_key);
        for m in &mut self.mappings {
            if m.id != target_id && canonical_trigger(&m.trigger_key) == trigger {
                m.enabled = false;
            }
        }
        self.enable_mapping(target_id);
        Some((from_id, target_id.to_string()))
    }

    /// 所有方案的切换快捷键 (combo, mapping_id)。
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
        let canonical = canonical_trigger(physical_key);
        for m in self.active_mappings() {
            if canonical_trigger(&m.trigger_key) == canonical {
                return Some(m);
            }
            for pb in mapping_physical_bindings(m) {
                if pb == physical_key || pb == canonical {
                    return Some(m);
                }
            }
        }
        None
    }

    pub fn bindings(&self) -> Vec<String> {
        let mut out = Vec::new();
        for m in self.active_mappings() {
            for pb in effective_physical_bindings(m) {
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
                    detail: format!("{other_canonical} is already used by {}", other.display_label()),
                });
            }
            for pb in mapping_physical_bindings(other) {
                if physical.contains(&pb) {
                    conflicts.push(Conflict {
                        kind: ConflictKind::PhysicalKey,
                        other_id: other.id.clone(),
                        detail: format!("physical key {pb} is already used by {}", other.display_label()),
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

pub fn config_path() -> PathBuf {
    let app_path = directories::ProjectDirs::from("com", "oneTone", "oneTone")
        .map(|d| d.config_dir().join("settings.json"));
    if let Some(ref p) = app_path {
        if p.exists() {
            return p.clone();
        }
    }
    if let Some(voice_pilot_dirs) = directories::ProjectDirs::from("com", "VoicePilot", "Voice Pilot") {
        let legacy_vp = voice_pilot_dirs.config_dir().join("settings.json");
        if legacy_vp.exists() {
            if let Some(ref dest) = app_path {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).ok();
                }
                if fs::copy(&legacy_vp, dest).is_ok() {
                    return dest.clone();
                }
            }
            return legacy_vp;
        }
    }
    let legacy = legacy_config_candidates();
    for p in &legacy {
        if p.exists() {
            if let Some(ref dest) = app_path {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent).ok();
                }
                if fs::copy(p, dest).is_ok() {
                    return dest.clone();
                }
            }
            return p.clone();
        }
    }
    app_path.unwrap_or_else(|| PathBuf::from("settings.json"))
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

pub fn start_watcher(state: Arc<AppState>, window: tauri::WebviewWindow) {
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
            loop {
                if rx.recv_timeout(Duration::from_millis(500)).is_ok() {
                    let mut new_cfg = load_config();
                    new_cfg.migrate();
                    apply_config(&state, &new_cfg);
                    *state.cfg.lock() = new_cfg.clone();
                    let conflicts = new_cfg.conflict_report();
                    let payload = serde_json::json!({
                        "config": new_cfg,
                        "conflicts": conflicts,
                    });
                    let json = serde_json::to_string(&payload).unwrap();
                    window
                        .eval(&format!(
                            "window.__vp_bridge__('mvp_init', {json})"
                        ))
                        .ok();
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(cfg.version, 5);
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
        });
        cfg.enable_mapping("b");
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
        assert!(cfg.mappings.iter().find(|m| m.id == "b").unwrap().enabled);
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
            label: "AutoTrigger → F2".into(),
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
        };
        apply_peripheral_autotrigger(&mut m, "Volume_Down");
        let bindings = mapping_physical_bindings(&m);
        assert_eq!(bindings, vec!["Volume_Down".to_string(), "Volume_Up".to_string()]);
    }

    #[test]
    fn select_scheme_by_id() {
        let mut cfg = VoiceConfig::default();
        let id_a = cfg.mappings[0].id.clone();
        cfg.mappings.push(MappingEntry {
            id: "b".into(),
            label: "AutoTrigger → F2".into(),
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
        });
        let result = cfg.select_scheme("b");
        assert!(result.is_some());
        assert!(!cfg.mappings.iter().find(|m| m.id == id_a).unwrap().enabled);
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
}






















