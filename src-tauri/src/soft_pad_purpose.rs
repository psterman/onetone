//! Soft Pad purpose (shortcuts | sessions) and per-key roles.
//!
//! Orthogonal to layout_profile / presentation / skin.
//!
//! Product honesty (per AgentKind capabilities):
//! - Top-bar App light ≠ AG multi-lights ≠ press-to-open-session.
//! - `is_navigation_micro_key` is the single dispatch gate for lane navigation.
//! - `can_multi_agent_lights` only decorates a session slot (never clickable subagent AG).
//! - Catalog caps are platform ceiling; per-lane focus/resume still use AgentLane::caps().

use crate::agent_catalog;
use crate::config::CodexMicroPadConfig;
use crate::soft_pad_runtime::AgentKind;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Runtime AG face hint for UI (does not gate dispatch).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgSurface {
    Actions,
    /// Per-key mix of AgentLane + Action navigation keys.
    Mixed,
    /// Legacy deserialize only — treated as Mixed in UI.
    #[serde(alias = "sessionLanes")]
    SessionLanes,
}

impl AgSurface {
    pub fn as_str(self) -> &'static str {
        match self {
            AgSurface::Actions => "actions",
            AgSurface::Mixed | AgSurface::SessionLanes => "mixed",
        }
    }

    pub fn has_navigation_keys(self) -> bool {
        matches!(self, AgSurface::Mixed | AgSurface::SessionLanes)
    }
}

/// Per-mapping AG surface mode. Not layout_profile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SoftPadPurpose {
    #[default]
    Shortcuts,
    Sessions,
}

impl SoftPadPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            SoftPadPurpose::Shortcuts => "shortcuts",
            SoftPadPurpose::Sessions => "sessions",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "sessions" | "session" => SoftPadPurpose::Sessions,
            _ => SoftPadPurpose::Shortcuts,
        }
    }

    pub fn is_sessions(self) -> bool {
        matches!(self, SoftPadPurpose::Sessions)
    }
}

/// UI hint: mixed when any navigation key is configured.
pub fn ag_surface_for(kind: AgentKind, pad: &CodexMicroPadConfig) -> AgSurface {
    if navigation_slots_for(kind, pad).is_empty() {
        AgSurface::Actions
    } else {
        AgSurface::Mixed
    }
}

/// Sub-agent corner decoration only — never grants navigation by itself.
pub fn multi_agent_lights_allowed(kind: AgentKind, pad: &CodexMicroPadConfig) -> bool {
    pad.purpose.is_sessions()
        && agent_catalog::descriptor(kind)
            .capabilities
            .can_multi_agent_lights
        && !navigation_slots_for(kind, pad).is_empty()
}

/// Whether this kind may persist purpose=sessions (IPC / settings gate).
pub fn purpose_sessions_allowed(kind: AgentKind) -> bool {
    agent_catalog::descriptor(kind)
        .capabilities
        .can_observe_session_lanes
}

/// Key purpose for dispatch + lights. Not “status decorate”.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SoftPadKeyRole {
    Action,
    AgentLane,
}

impl SoftPadKeyRole {
    pub fn as_str(self) -> &'static str {
        match self {
            SoftPadKeyRole::Action => "action",
            SoftPadKeyRole::AgentLane => "agentLane",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssignmentMode {
    Auto,
    Pinned,
}

impl Default for AssignmentMode {
    fn default() -> Self {
        AssignmentMode::Auto
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneSelector {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub provider: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub workspace: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub session_id: String,
}

/// User-persisted pin preference for a micro key (not runtime assignment).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneSlotPreference {
    #[serde(default)]
    pub micro_key_id: String,
    #[serde(default)]
    pub assignment_mode: AssignmentMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selector: Option<LaneSelector>,
}

pub fn is_ag_micro_key(micro_key_id: &str) -> bool {
    let id = micro_key_id.trim();
    id.len() >= 3 && id.starts_with("AG") && id[2..].chars().all(|c| c.is_ascii_digit())
}

/// Product-recommended navigation keys when user actively enables navigation.
pub fn recommended_navigation_slots(kind: AgentKind) -> &'static [&'static str] {
    match kind {
        AgentKind::Claude => &["AG00", "AG01", "AG02", "AG03"],
        AgentKind::Codex => &["AG00", "AG01"],
        _ => &[],
    }
}

fn stored_key_role(pad: &CodexMicroPadConfig, micro_key_id: &str) -> Option<SoftPadKeyRole> {
    pad.keys
        .iter()
        .find(|k| k.micro_key_id == micro_key_id)
        .and_then(|r| r.key_role)
}

/// Resolve effective key role. Per-key truth — no whole-grid default to AgentLane.
pub fn effective_key_role(
    kind: AgentKind,
    purpose: SoftPadPurpose,
    micro_key_id: &str,
    stored: Option<SoftPadKeyRole>,
) -> SoftPadKeyRole {
    if !is_ag_micro_key(micro_key_id) {
        return SoftPadKeyRole::Action;
    }
    if !purpose.is_sessions() {
        return SoftPadKeyRole::Action;
    }
    if !agent_catalog::descriptor(kind)
        .capabilities
        .can_observe_session_lanes
    {
        return SoftPadKeyRole::Action;
    }
    match stored {
        Some(SoftPadKeyRole::AgentLane) => SoftPadKeyRole::AgentLane,
        Some(SoftPadKeyRole::Action) | None => SoftPadKeyRole::Action,
    }
}

/// Single gate for lane dispatch + overlay lane cells.
pub fn is_navigation_micro_key(
    kind: AgentKind,
    pad: &CodexMicroPadConfig,
    micro_key_id: &str,
) -> bool {
    if kind == AgentKind::Cursor {
        return false;
    }
    effective_key_role(
        kind,
        pad.purpose,
        micro_key_id,
        stored_key_role(pad, micro_key_id),
    ) == SoftPadKeyRole::AgentLane
}

/// Current mapping navigation keys (enabled AG with effective AgentLane role).
pub fn navigation_slots_for(kind: AgentKind, pad: &CodexMicroPadConfig) -> Vec<String> {
    let mut out = Vec::new();
    for r in &pad.keys {
        if !r.enabled {
            continue;
        }
        let mid = r.micro_key_id.trim();
        if is_navigation_micro_key(kind, pad, mid) {
            out.push(mid.to_string());
        }
    }
    out.sort();
    out
}

pub fn effective_auto_assignable(
    kind: AgentKind,
    purpose: SoftPadPurpose,
    micro_key_id: &str,
    key_role: SoftPadKeyRole,
    stored: Option<bool>,
) -> bool {
    if key_role != SoftPadKeyRole::AgentLane {
        return false;
    }
    if !purpose.is_sessions() {
        return false;
    }
    if !agent_catalog::descriptor(kind)
        .capabilities
        .can_observe_session_lanes
    {
        return false;
    }
    if let Some(v) = stored {
        return v;
    }
    is_ag_micro_key(micro_key_id)
}

fn apply_navigation_capability_gate(pad: &mut CodexMicroPadConfig, kind: AgentKind) {
    if !purpose_sessions_allowed(kind) {
        for route in &mut pad.keys {
            if route.key_role == Some(SoftPadKeyRole::AgentLane) {
                route.key_role = Some(SoftPadKeyRole::Action);
            }
        }
        return;
    }
    for route in &mut pad.keys {
        let mid = route.micro_key_id.trim();
        if !is_ag_micro_key(mid) && route.key_role == Some(SoftPadKeyRole::AgentLane) {
            route.key_role = Some(SoftPadKeyRole::Action);
        }
    }
}

/// One-time migration for old whole-grid `purpose=sessions` configs. Idempotent.
pub fn migrate_navigation_layout(pad: &mut CodexMicroPadConfig, kind: AgentKind) -> bool {
    if pad.navigation_layout_migrated {
        let before = pad.keys.clone();
        apply_navigation_capability_gate(pad, kind);
        return before != pad.keys;
    }
    pad.navigation_layout_migrated = true;
    if pad.purpose != SoftPadPurpose::Sessions {
        return false;
    }
    let has_explicit = pad.keys.iter().any(|k| k.key_role.is_some());
    if has_explicit {
        apply_navigation_capability_gate(pad, kind);
        return true;
    }
    let recommended = recommended_navigation_slots(kind);
    let rec_set: HashSet<&str> = recommended.iter().copied().collect();
    for route in &mut pad.keys {
        let mid = route.micro_key_id.trim();
        if !is_ag_micro_key(mid) {
            if route.key_role == Some(SoftPadKeyRole::AgentLane) {
                route.key_role = Some(SoftPadKeyRole::Action);
            }
            continue;
        }
        if rec_set.contains(mid) {
            route.key_role = Some(SoftPadKeyRole::AgentLane);
            route.auto_assignable = Some(true);
        } else {
            route.key_role = Some(SoftPadKeyRole::Action);
            route.auto_assignable = Some(false);
        }
    }
    true
}

/// Atomic write of navigation slot keys (does not touch slot_id or runtime assignments).
pub fn apply_navigation_slots(
    kind: AgentKind,
    pad: &mut CodexMicroPadConfig,
    slots: &[String],
) -> Result<Vec<String>, String> {
    if kind == AgentKind::Cursor && !slots.is_empty() {
        return Err("cursor_no_navigation".into());
    }
    if !purpose_sessions_allowed(kind) && !slots.is_empty() {
        return Err(format!("sessions_not_supported:{}", kind.as_str()));
    }
    let normalized: Vec<String> = slots
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    for s in &normalized {
        if !is_ag_micro_key(s) {
            return Err(format!("not_ag_key:{s}"));
        }
        let found = pad.keys.iter().any(|k| k.enabled && k.micro_key_id == *s);
        if !found {
            return Err(format!("key_not_enabled:{s}"));
        }
    }
    let slot_set: HashSet<&str> = normalized.iter().map(|s| s.as_str()).collect();
    for route in &mut pad.keys {
        if !is_ag_micro_key(&route.micro_key_id) {
            continue;
        }
        if slot_set.contains(route.micro_key_id.as_str()) {
            route.key_role = Some(SoftPadKeyRole::AgentLane);
            if route.auto_assignable.is_none() {
                route.auto_assignable = Some(true);
            }
        } else {
            route.key_role = Some(SoftPadKeyRole::Action);
            route.auto_assignable = Some(false);
        }
    }
    Ok(navigation_slots_for(kind, pad))
}

/// Ensure navigation slots exist when switching to `sessions`.
///
/// If the caller only flips `pad.purpose = Sessions` but leaves AG keys with
/// `key_role=None`, then `navigation_slots_for(...)` would be empty and physical
/// session lights would not project.
///
/// This function seeds `recommended_navigation_slots(kind)` (filtered to enabled
/// AG micro keys) only when the current navigation slot set is empty.
pub fn seed_recommended_navigation_slots_for_sessions_if_missing(
    kind: AgentKind,
    pad: &mut CodexMicroPadConfig,
) -> Result<bool, String> {
    if !pad.purpose.is_sessions() {
        return Ok(false);
    }
    if !navigation_slots_for(kind, pad).is_empty() {
        return Ok(false);
    }

    let recommended = recommended_navigation_slots(kind);
    if recommended.is_empty() {
        return Ok(false);
    }

    let enabled_recommended: Vec<String> = recommended
        .iter()
        .filter(|s| pad.keys.iter().any(|k| k.enabled && k.micro_key_id == **s))
        .map(|s| (*s).to_string())
        .collect();

    if enabled_recommended.is_empty() {
        return Ok(false);
    }

    apply_navigation_slots(kind, pad, &enabled_recommended)?;
    Ok(true)
}

/// Resolve Claude Soft Pad mapping id: Applied Claude lane first, else first enabled claude-code pad.
pub fn claude_session_nav_mapping_id(cfg: &crate::config::VoiceConfig) -> Option<String> {
    use crate::app_identity::CLAUDE_CODE_APP_TARGET_ID;
    if let Some((kind, mid)) = crate::soft_pad_runtime::applied_lane() {
        if kind == AgentKind::Claude {
            return Some(mid);
        }
    }
    cfg.mappings.iter().find_map(|m| {
        if !m.enabled {
            return None;
        }
        if m.app_target_id.trim() != CLAUDE_CODE_APP_TARGET_ID {
            return None;
        }
        m.codex_micro_pad
            .as_ref()
            .filter(|p| p.overlay_enabled || p.enabled)
            .map(|_| m.id.clone())
    })
}

/// Auto-fix: Claude hook is live but mapping stuck on shortcuts with no nav lanes.
pub fn auto_heal_session_nav_mapping(
    cfg: &mut crate::config::VoiceConfig,
    mapping_id: &str,
) -> Result<bool, String> {
    let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
        return Ok(false);
    };
    let kind = crate::agent_catalog::kind_from_mapping(
        m.app_target_id.trim(),
        m.agent_provider_id.trim(),
    )
    .unwrap_or(AgentKind::Codex);
    if !purpose_sessions_allowed(kind) {
        return Ok(false);
    }
    let Some(pad) = m.codex_micro_pad.as_mut() else {
        return Ok(false);
    };
    if pad.purpose.is_sessions() && !navigation_slots_for(kind, pad).is_empty() {
        return Ok(false);
    }
    pad.purpose = SoftPadPurpose::Sessions;
    seed_recommended_navigation_slots_for_sessions_if_missing(kind, pad)?;
    pad.claude_status_lights_enabled = true;
    Ok(true)
}

pub fn auto_heal_claude_session_nav_if_stuck(
    cfg: &mut crate::config::VoiceConfig,
) -> Result<bool, String> {
    let Some(mid) = claude_session_nav_mapping_id(cfg) else {
        return Ok(false);
    };
    auto_heal_session_nav_mapping(cfg, &mid)
}

/// Keys that would lose a custom shortcut when applying recommended navigation slots.
pub fn navigation_slot_conflicts(
    pad: &CodexMicroPadConfig,
    slots: &[&str],
) -> Vec<String> {
    let mut out = Vec::new();
    for s in slots {
        let Some(route) = pad.keys.iter().find(|k| k.enabled && k.micro_key_id == *s) else {
            continue;
        };
        let slot_id = route.slot_id.trim();
        if slot_id.is_empty() || slot_id == "status" {
            continue;
        }
        out.push(s.to_string());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CodexMicroPadConfig, CodexMicroPadKeyRoute};

    #[test]
    fn legacy_config_defaults_to_shortcuts() {
        let json = r#"{"enabled":true,"keys":[{"microKeyId":"AG00","slotId":"commandPalette"}]}"#;
        let pad: CodexMicroPadConfig = serde_json::from_str(json).unwrap();
        assert_eq!(pad.purpose, SoftPadPurpose::Shortcuts);
        assert!(pad.keys[0].key_role.is_none());
        assert_eq!(
            effective_key_role(AgentKind::Codex, pad.purpose, "AG00", pad.keys[0].key_role),
            SoftPadKeyRole::Action
        );
        assert!(!is_navigation_micro_key(AgentKind::Codex, &pad, "AG00"));
    }

    #[test]
    fn sessions_without_stored_role_defaults_action() {
        assert_eq!(
            effective_key_role(AgentKind::Claude, SoftPadPurpose::Sessions, "AG02", None),
            SoftPadKeyRole::Action
        );
        assert!(!is_navigation_micro_key(
            AgentKind::Claude,
            &CodexMicroPadConfig {
                purpose: SoftPadPurpose::Sessions,
                ..Default::default()
            },
            "AG02"
        ));
    }

    #[test]
    fn explicit_agent_lane_is_navigation() {
        let pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "AG02".into(),
                enabled: true,
                key_role: Some(SoftPadKeyRole::AgentLane),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(is_navigation_micro_key(AgentKind::Claude, &pad, "AG02"));
        assert_eq!(
            navigation_slots_for(AgentKind::Claude, &pad),
            vec!["AG02".to_string()]
        );
    }

    #[test]
    fn cursor_forces_action_even_with_stored_agent_lane() {
        let pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "AG00".into(),
                enabled: true,
                key_role: Some(SoftPadKeyRole::AgentLane),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(!is_navigation_micro_key(AgentKind::Cursor, &pad, "AG00"));
        assert!(!purpose_sessions_allowed(AgentKind::Cursor));
    }

    #[test]
    fn old_sessions_migrates_to_recommended_once() {
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            keys: (0..4)
                .map(|i| CodexMicroPadKeyRoute {
                    micro_key_id: format!("AG{i:02}"),
                    enabled: true,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        assert!(migrate_navigation_layout(&mut pad, AgentKind::Claude));
        assert!(pad.navigation_layout_migrated);
        assert_eq!(
            navigation_slots_for(AgentKind::Claude, &pad),
            vec![
                "AG00".to_string(),
                "AG01".to_string(),
                "AG02".to_string(),
                "AG03".to_string()
            ]
        );
        assert!(!migrate_navigation_layout(&mut pad, AgentKind::Claude));
    }

    #[test]
    fn apply_navigation_slots_atomic() {
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            keys: (0..4)
                .map(|i| CodexMicroPadKeyRoute {
                    micro_key_id: format!("AG{i:02}"),
                    enabled: true,
                    slot_id: format!("slot{i}"),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let slots = apply_navigation_slots(
            AgentKind::Codex,
            &mut pad,
            &["AG00".into(), "AG01".into()],
        )
        .unwrap();
        assert_eq!(slots, vec!["AG00".to_string(), "AG01".to_string()]);
        assert_eq!(pad.keys[0].slot_id, "slot0");
        assert_eq!(pad.keys[2].key_role, Some(SoftPadKeyRole::Action));
    }

    #[test]
    fn recommended_slots_match_product() {
        assert_eq!(
            recommended_navigation_slots(AgentKind::Claude),
            &["AG00", "AG01", "AG02", "AG03"]
        );
        assert_eq!(
            recommended_navigation_slots(AgentKind::Codex),
            &["AG00", "AG01"]
        );
        assert!(recommended_navigation_slots(AgentKind::Cursor).is_empty());
    }

    #[test]
    fn seed_navigation_slots_when_sessions_without_key_role() {
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            keys: (0..4)
                .map(|i| CodexMicroPadKeyRoute {
                    micro_key_id: format!("AG{i:02}"),
                    enabled: true,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };

        assert!(navigation_slots_for(AgentKind::Claude, &pad).is_empty());

        let applied = seed_recommended_navigation_slots_for_sessions_if_missing(
            AgentKind::Claude,
            &mut pad,
        )
        .unwrap();
        assert!(applied);

        assert_eq!(
            navigation_slots_for(AgentKind::Claude, &pad),
            vec![
                "AG00".to_string(),
                "AG01".to_string(),
                "AG02".to_string(),
                "AG03".to_string()
            ]
        );

        assert!(pad.keys.iter().all(|k| {
            k.micro_key_id.starts_with("AG")
                && k.key_role == Some(SoftPadKeyRole::AgentLane)
        }));
    }

    #[test]
    fn shortcuts_purpose_blocks_navigation_even_with_stored_lane() {
        let pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Shortcuts,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "AG00".into(),
                enabled: true,
                key_role: Some(SoftPadKeyRole::AgentLane),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert!(!is_navigation_micro_key(AgentKind::Claude, &pad, "AG00"));
    }
}
