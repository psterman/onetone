//! Codex Micro pad binding diagnose — read-only config integrity checks.
//!
//! Separate from `pad_status` lamp diagnose. Does not mutate mappings.

use serde::Serialize;

use crate::agent::templates::{is_essential_slot, ESSENTIAL_SLOT_IDS};
use crate::app_chat_workflow::CODEX_APP_TARGET_ID;
use crate::codex_numpad_layer::micro_key_routable;
use crate::config::{
    agent_key_binding_for_slot, canonical_trigger, CodexMicroPadConfig, MappingEntry, VoiceConfig,
};
use crate::key_chord::chords_equivalent;

const PRIMARY_MICRO_IDS: &[&str] = &[
    "AG00", "AG01", "AG02", "AG03", "AG04", "AG05", "ACT06", "ACT07", "ACT08", "ACT09", "ACT10",
    "ACT12", "ENC",
];

/// Slots that intentionally use Global focus workflow with an empty key chord.
fn slot_allows_empty_chord(slot: &str) -> bool {
    matches!(slot.trim(), "summonCodex" | "claudeModel")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadBindingIssue {
    pub code: String,
    pub severity: String,
    pub micro_key_id: String,
    pub slot_id: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadBindingKeyRow {
    pub micro_key_id: String,
    pub slot_id: String,
    pub enabled: bool,
    pub routable: bool,
    pub source_scan: u16,
    pub trigger_binding: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadBindingDiagnoseView {
    pub mapping_id: String,
    pub layout_profile: String,
    pub pad_enabled: bool,
    pub ok: bool,
    pub issue_count: u32,
    pub issues: Vec<CodexPadBindingIssue>,
    pub keys: Vec<CodexPadBindingKeyRow>,
}

fn issue(
    code: &str,
    severity: &str,
    micro: &str,
    slot: &str,
    detail: impl Into<String>,
) -> CodexPadBindingIssue {
    CodexPadBindingIssue {
        code: code.into(),
        severity: severity.into(),
        micro_key_id: micro.into(),
        slot_id: slot.into(),
        detail: detail.into(),
    }
}

fn is_beginner(profile: &str) -> bool {
    profile.trim().eq_ignore_ascii_case("beginner")
}

fn route_expected_on(pad: &CodexMicroPadConfig, micro_key_id: &str, slot_id: &str) -> bool {
    if micro_key_id == "JOY" {
        return false;
    }
    if is_beginner(&pad.layout_profile) {
        return !slot_id.is_empty() && is_essential_slot(slot_id);
    }
    true
}

/// Diagnose pad routes + agent key bindings for one mapping (read-only).
pub fn diagnose_codex_pad_bindings(mapping: &MappingEntry) -> CodexPadBindingDiagnoseView {
    let mut issues: Vec<CodexPadBindingIssue> = Vec::new();
    let mut keys: Vec<CodexPadBindingKeyRow> = Vec::new();

    let Some(pad) = mapping.codex_micro_pad.as_ref() else {
        issues.push(issue(
            "missing_pad",
            "error",
            "",
            "",
            "未配置 Codex Micro 小键盘",
        ));
        return CodexPadBindingDiagnoseView {
            mapping_id: mapping.id.clone(),
            layout_profile: String::new(),
            pad_enabled: false,
            ok: false,
            issue_count: issues.len() as u32,
            issues,
            keys,
        };
    };

    let beginner = is_beginner(&pad.layout_profile);

    for id in PRIMARY_MICRO_IDS {
        let route = pad.keys.iter().find(|k| k.micro_key_id == *id);
        let Some(route) = route else {
            if !beginner {
                issues.push(issue(
                    "missing_route",
                    "error",
                    id,
                    "",
                    format!("缺少默认键位路由 {id}"),
                ));
            }
            continue;
        };

        let slot = route.slot_id.trim().to_string();
        let expected = route_expected_on(pad, id, &slot);

        let trigger = if slot.is_empty() {
            String::new()
        } else if let Some(b) = mapping.agent_bindings.iter().find(|b| {
            b.slot_id == slot && b.trigger_type.eq_ignore_ascii_case("key")
        }) {
            b.trigger_binding.trim().to_string()
        } else {
            String::new()
        };
        let routable = if *id == "ENC" {
            route.enabled && slot == "summonCodex"
        } else {
            micro_key_routable(mapping, pad, id)
        };
        keys.push(CodexPadBindingKeyRow {
            micro_key_id: id.to_string(),
            slot_id: slot.clone(),
            enabled: route.enabled,
            routable,
            source_scan: route.source_scan,
            trigger_binding: trigger,
        });

        if *id == "ENC" {
            if slot.is_empty() {
                issues.push(issue(
                    "empty_slot",
                    "error",
                    id,
                    "",
                    "ENC 缺少 slot（应为 summonCodex）",
                ));
            } else if slot != "summonCodex" {
                issues.push(issue(
                    "empty_slot",
                    "warn",
                    id,
                    &slot,
                    "ENC 建议绑定 summonCodex",
                ));
            }
            if route.source_scan != 0 {
                issues.push(issue(
                    "enc_not_screen_only",
                    "warn",
                    id,
                    &slot,
                    "ENC 应为屏幕键（source_scan=0），避免抢占实体 Numpad0",
                ));
            }
            continue;
        }

        if !route.enabled && expected {
            issues.push(issue(
                "route_disabled",
                if beginner { "warn" } else { "error" },
                id,
                &slot,
                format!("{id} 路由已禁用"),
            ));
            continue;
        }
        if !route.enabled {
            continue;
        }

        if slot.is_empty() {
            issues.push(issue(
                "empty_slot",
                "error",
                id,
                "",
                format!("{id} 未绑定 slot"),
            ));
            continue;
        }

        let key_bind = mapping.agent_bindings.iter().find(|b| {
            b.slot_id == slot && b.trigger_type.eq_ignore_ascii_case("key")
        });
        match key_bind {
            None => {
                if expected {
                    issues.push(issue(
                        "missing_key_binding",
                        "error",
                        id,
                        &slot,
                        format!("slot `{slot}` 缺少 key 绑定"),
                    ));
                }
            }
            Some(b) if !b.enabled => {
                if expected {
                    issues.push(issue(
                        "binding_disabled",
                        "error",
                        id,
                        &slot,
                        format!("slot `{slot}` 的 key 绑定已禁用"),
                    ));
                }
            }
            Some(b) if b.trigger_binding.trim().is_empty() => {
                if !slot_allows_empty_chord(&slot) && expected {
                    issues.push(issue(
                        "empty_chord",
                        "error",
                        id,
                        &slot,
                        format!("slot `{slot}` 热键弦为空"),
                    ));
                }
            }
            Some(_) => {}
        }

        if expected && !micro_key_routable(mapping, pad, id) && !slot_allows_empty_chord(&slot) {
            let already = issues.iter().any(|i| {
                i.micro_key_id == *id
                    && matches!(
                        i.code.as_str(),
                        "missing_key_binding" | "empty_chord" | "binding_disabled" | "empty_slot"
                    )
            });
            if !already {
                issues.push(issue(
                    "not_routable",
                    "error",
                    id,
                    &slot,
                    format!("{id} 当前不可触发（路由或绑定不完整）"),
                ));
            }
        }
    }

    if let Some(joy) = pad.keys.iter().find(|k| k.micro_key_id == "JOY") {
        let slot = joy.slot_id.trim().to_string();
        keys.push(CodexPadBindingKeyRow {
            micro_key_id: "JOY".into(),
            slot_id: slot.clone(),
            enabled: joy.enabled,
            routable: true,
            source_scan: joy.source_scan,
            trigger_binding: String::new(),
        });
        if joy.enabled && slot.is_empty() {
            issues.push(issue(
                "joy_unbound",
                "info",
                "JOY",
                "",
                "JOY 未绑定 slot（方向轨仍可用）",
            ));
        }
    }

    let mut scan_map: Vec<(&str, u16, bool)> = Vec::new();
    for r in &pad.keys {
        if !r.enabled || r.source_scan == 0 {
            continue;
        }
        if let Some((other, _, _)) = scan_map
            .iter()
            .find(|(_, s, e)| *s == r.source_scan && *e == r.source_extended)
        {
            issues.push(issue(
                "scan_conflict",
                "error",
                &r.micro_key_id,
                r.slot_id.trim(),
                format!(
                    "与 {} 共享 scan 0x{:02X} ext={}",
                    other,
                    r.source_scan,
                    r.source_extended as u8
                ),
            ));
        } else {
            scan_map.push((r.micro_key_id.as_str(), r.source_scan, r.source_extended));
        }
    }

    let mut slot_owners: Vec<(&str, &str)> = Vec::new();
    for r in &pad.keys {
        if !r.enabled {
            continue;
        }
        let slot = r.slot_id.trim();
        if slot.is_empty() || r.micro_key_id == "JOY" {
            continue;
        }
        if let Some((other, _)) = slot_owners.iter().find(|(_, s)| *s == slot) {
            issues.push(issue(
                "slot_conflict",
                "error",
                &r.micro_key_id,
                slot,
                format!("与 {} 共用 slot `{slot}`", other),
            ));
        } else {
            slot_owners.push((r.micro_key_id.as_str(), slot));
        }
    }

    let key_binds: Vec<_> = mapping
        .agent_bindings
        .iter()
        .filter(|b| {
            b.enabled
                && b.trigger_type.eq_ignore_ascii_case("key")
                && !b.trigger_binding.trim().is_empty()
                && b.slot_id != "summonCodex"
        })
        .collect();
    for (i, a) in key_binds.iter().enumerate() {
        for b in key_binds.iter().skip(i + 1) {
            if a.slot_id == b.slot_id {
                continue;
            }
            if chords_equivalent(a.trigger_binding.trim(), b.trigger_binding.trim()) {
                issues.push(issue(
                    "chord_conflict",
                    "warn",
                    "",
                    &a.slot_id,
                    format!(
                        "热键 `{}` 同时绑定 {} 与 {}",
                        canonical_trigger(a.trigger_binding.trim()),
                        a.slot_id,
                        b.slot_id
                    ),
                ));
            }
        }
    }

    for ess in ESSENTIAL_SLOT_IDS {
        let has_route = pad.keys.iter().any(|r| r.enabled && r.slot_id.trim() == *ess);
        let has_bind = if *ess == "summonCodex" {
            pad.keys.iter().any(|r| {
                r.micro_key_id == "ENC" && r.enabled && r.slot_id.trim() == "summonCodex"
            }) || mapping.agent_bindings.iter().any(|b| {
                b.enabled
                    && b.slot_id == *ess
                    && b.trigger_type.eq_ignore_ascii_case("key")
            })
        } else {
            agent_key_binding_for_slot(mapping, ess).is_some()
        };
        if beginner && (!has_route || !has_bind) {
            issues.push(issue(
                "essential_gap",
                "error",
                "",
                ess,
                format!("入门布局缺少常用能力 `{ess}`"),
            ));
        } else if !beginner && !has_bind && *ess != "summonCodex" {
            let already = issues.iter().any(|i| {
                i.slot_id == *ess
                    && matches!(
                        i.code.as_str(),
                        "missing_key_binding" | "empty_chord" | "essential_gap"
                    )
            });
            if !already && agent_key_binding_for_slot(mapping, ess).is_none() {
                issues.push(issue(
                    "essential_gap",
                    "warn",
                    "",
                    ess,
                    format!("常用 slot `{ess}` 无有效 key 绑定"),
                ));
            }
        }
    }

    let error_count = issues
        .iter()
        .filter(|i| i.severity == "error")
        .count() as u32;
    CodexPadBindingDiagnoseView {
        mapping_id: mapping.id.clone(),
        layout_profile: pad.layout_profile.clone(),
        pad_enabled: pad.enabled,
        ok: error_count == 0,
        issue_count: issues.len() as u32,
        issues,
        keys,
    }
}

/// Resolve mapping (by id or first Codex) and diagnose.
pub fn diagnose_codex_pad_bindings_for_cfg(
    cfg: &VoiceConfig,
    mapping_id: Option<&str>,
) -> CodexPadBindingDiagnoseView {
    let id = mapping_id.map(|s| s.trim()).filter(|s| !s.is_empty());
    let mapping = if let Some(want) = id {
        cfg.mappings.iter().find(|m| m.id == want)
    } else {
        cfg.mappings
            .iter()
            .find(|m| m.enabled && m.app_target_id.trim() == CODEX_APP_TARGET_ID)
            .or_else(|| {
                cfg.mappings
                    .iter()
                    .find(|m| m.app_target_id.trim() == CODEX_APP_TARGET_ID)
            })
    };
    match mapping {
        Some(m) => diagnose_codex_pad_bindings(m),
        None => CodexPadBindingDiagnoseView {
            mapping_id: id.unwrap_or("").to_string(),
            layout_profile: String::new(),
            pad_enabled: false,
            ok: false,
            issue_count: 1,
            issues: vec![issue(
                "missing_mapping",
                "error",
                "",
                "",
                "未找到 Codex 场景映射",
            )],
            keys: vec![],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex_numpad_layer::default_codex_micro_pad;
    use crate::config::{MappingEntry, TriggerMode};

    fn base_mapping() -> MappingEntry {
        MappingEntry {
            id: "codex".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            codex_micro_pad: Some(default_codex_micro_pad()),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            key_mode_enabled: true,
            voice_mode_enabled: true,
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
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: crate::agent::bindings_build::build_codex_micro_13_bindings("zh-CN"),
            time_machine_workspace: String::new(),
        capture_hero_ref: None,
        }
    }

    #[test]
    fn healthy_defaults_ok() {
        let m = base_mapping();
        let view = diagnose_codex_pad_bindings(&m);
        assert!(view.ok, "issues={:?}", view.issues);
        assert!(view.keys.iter().any(|k| k.micro_key_id == "ENC"));
        let enc = view.keys.iter().find(|k| k.micro_key_id == "ENC").unwrap();
        assert!(enc.routable);
        assert!(enc.trigger_binding.is_empty());
    }

    #[test]
    fn empty_chord_on_act10_is_error() {
        let mut m = base_mapping();
        for b in &mut m.agent_bindings {
            if b.slot_id == "pushToTalk" && b.trigger_type == "key" {
                b.trigger_binding.clear();
            }
        }
        let view = diagnose_codex_pad_bindings(&m);
        assert!(!view.ok);
        assert!(view.issues.iter().any(|i| {
            i.code == "empty_chord" && (i.slot_id == "pushToTalk" || i.micro_key_id == "ACT10")
        }));
    }

    #[test]
    fn scan_conflict_detected() {
        let mut m = base_mapping();
        let pad = m.codex_micro_pad.as_mut().unwrap();
        let act10_scan = pad
            .keys
            .iter()
            .find(|k| k.micro_key_id == "ACT10")
            .map(|k| (k.source_scan, k.source_extended))
            .unwrap();
        for k in &mut pad.keys {
            if k.micro_key_id == "ACT06" {
                k.source_scan = act10_scan.0;
                k.source_extended = act10_scan.1;
            }
        }
        let view = diagnose_codex_pad_bindings(&m);
        assert!(view.issues.iter().any(|i| i.code == "scan_conflict"));
    }

    #[test]
    fn enc_scan_nonzero_warns() {
        let mut m = base_mapping();
        let pad = m.codex_micro_pad.as_mut().unwrap();
        for k in &mut pad.keys {
            if k.micro_key_id == "ENC" {
                // Unique non-zero scan so we only hit enc_not_screen_only, not scan_conflict.
                k.source_scan = 0x10;
            }
        }
        let view = diagnose_codex_pad_bindings(&m);
        assert!(view.issues.iter().any(|i| i.code == "enc_not_screen_only"));
        assert!(
            !view.issues.iter().any(|i| i.code == "scan_conflict"),
            "issues={:?}",
            view.issues
        );
        assert!(view.ok, "warn-only should keep ok=true; issues={:?}", view.issues);
    }
}
