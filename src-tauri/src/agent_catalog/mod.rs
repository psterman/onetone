//! Agent catalog: descriptors, pad faces, capabilities, mapping bindings.
//! Separates product identity from mapping.app_target_id (compat fallback only).

use crate::soft_pad_runtime::AgentKind;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

static CURSOR_NEEDS_INPUT: AtomicBool = AtomicBool::new(false);

/// Honest integration capabilities per agent kind.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCapabilities {
    pub can_focus: bool,
    pub can_send_chord: bool,
    pub can_observe_lifecycle: bool,
    pub can_observe_needs_input: bool,
    pub can_list_sessions: bool,
    pub can_invoke_internal_actions: bool,
    pub official_hid: bool,
}

impl AgentCapabilities {
    pub fn soft_pad_dispatch_ready(self) -> bool {
        self.can_focus && self.can_send_chord
    }
}

#[derive(Debug, Clone)]
pub struct AgentDescriptor {
    pub kind: AgentKind,
    pub app_target_id: &'static str,
    pub windows_process_hints: &'static [&'static str],
    pub macos_bundle_ids: &'static [&'static str],
    pub capabilities: AgentCapabilities,
    pub default_face_id: &'static str,
}

#[derive(Debug, Clone)]
pub struct PadFace {
    pub face_id: &'static str,
    pub version: u32,
    pub agent_kind: AgentKind,
    /// Required caps for this face to be dispatch-ready.
    pub required: AgentCapabilities,
}

#[derive(Debug, Clone)]
pub struct MappingBinding {
    pub mapping_id: String,
    pub agent_kind: AgentKind,
    pub face_id: String,
    pub enabled: bool,
    pub pad_enabled: bool,
}

pub fn cursor_can_observe_needs_input() -> bool {
    CURSOR_NEEDS_INPUT.load(Ordering::Acquire)
}

/// P3 gate: only after verified official waiting events or OneTone ask path.
pub fn set_cursor_can_observe_needs_input(enabled: bool) {
    CURSOR_NEEDS_INPUT.store(enabled, Ordering::Release);
}

pub fn descriptor(kind: AgentKind) -> AgentDescriptor {
    match kind {
        AgentKind::Codex => AgentDescriptor {
            kind,
            app_target_id: "codex-chat",
            windows_process_hints: &["Codex.exe", "ChatGPT.exe"],
            macos_bundle_ids: &[],
            capabilities: AgentCapabilities {
                can_focus: true,
                can_send_chord: true,
                can_observe_lifecycle: true,
                can_observe_needs_input: true,
                can_list_sessions: false,
                can_invoke_internal_actions: false,
                official_hid: false,
            },
            default_face_id: "codex-stock-v1",
        },
        AgentKind::Claude => AgentDescriptor {
            kind,
            app_target_id: "claude-code",
            windows_process_hints: &["Claude.exe"],
            macos_bundle_ids: &["com.anthropic.claudefordesktop"],
            capabilities: AgentCapabilities {
                can_focus: true,
                can_send_chord: true,
                can_observe_lifecycle: true,
                can_observe_needs_input: true,
                can_list_sessions: false,
                can_invoke_internal_actions: false,
                official_hid: false,
            },
            default_face_id: "claude-stock-v1",
        },
        AgentKind::Cursor => AgentDescriptor {
            kind,
            app_target_id: "cursor-chat",
            windows_process_hints: &["Cursor.exe"],
            macos_bundle_ids: &["com.todesktop.230313mzl4w4u92"],
            capabilities: cursor_capabilities(),
            default_face_id: "cursor-chord-v1",
        },
        AgentKind::CopilotCli => AgentDescriptor {
            kind,
            app_target_id: "copilot-cli",
            windows_process_hints: &[],
            macos_bundle_ids: &[],
            capabilities: AgentCapabilities {
                can_focus: false,
                can_send_chord: false,
                can_observe_lifecycle: true,
                can_observe_needs_input: true,
                can_list_sessions: false,
                can_invoke_internal_actions: false,
                official_hid: false,
            },
            default_face_id: "copilot-cli-v1",
        },
    }
}

pub fn cursor_capabilities() -> AgentCapabilities {
    AgentCapabilities {
        can_focus: true,
        can_send_chord: true,
        can_observe_lifecycle: true,
        can_observe_needs_input: cursor_can_observe_needs_input(),
        can_list_sessions: false,
        can_invoke_internal_actions: false,
        official_hid: false,
    }
}

pub fn pad_face(face_id: &str) -> Option<PadFace> {
    match face_id.trim() {
        "codex-stock-v1" => Some(PadFace {
            face_id: "codex-stock-v1",
            version: 1,
            agent_kind: AgentKind::Codex,
            required: descriptor(AgentKind::Codex).capabilities,
        }),
        "claude-stock-v1" => Some(PadFace {
            face_id: "claude-stock-v1",
            version: 1,
            agent_kind: AgentKind::Claude,
            required: descriptor(AgentKind::Claude).capabilities,
        }),
        "cursor-chord-v1" => Some(PadFace {
            face_id: "cursor-chord-v1",
            version: 1,
            agent_kind: AgentKind::Cursor,
            required: AgentCapabilities {
                can_focus: true,
                can_send_chord: true,
                can_observe_lifecycle: false,
                can_observe_needs_input: false,
                can_list_sessions: false,
                can_invoke_internal_actions: false,
                official_hid: false,
            },
        }),
        _ => None,
    }
}

pub fn default_face_id_for(kind: AgentKind) -> &'static str {
    descriptor(kind).default_face_id
}

/// Resolve agent kind from mapping: prefer explicit agent_provider / catalog, fallback app_target_id.
pub fn kind_from_mapping(app_target_id: &str, agent_provider_id: &str) -> Option<AgentKind> {
    if let Some(k) = AgentKind::from_kind_str(agent_provider_id) {
        return Some(k);
    }
    AgentKind::from_app_target(app_target_id)
}

/// faceCompatible: face exists for kind and required caps ⊆ live caps (soft_pad dispatch subset).
pub fn face_compatible(kind: AgentKind, face_id: &str) -> bool {
    let caps = descriptor(kind).capabilities;
    if !caps.soft_pad_dispatch_ready() {
        return false;
    }
    let fid = face_id.trim();
    if fid.is_empty() {
        return true;
    }
    match pad_face(fid) {
        Some(face) => face.agent_kind == kind,
        // User/custom face id: allow when caps ready.
        None => true,
    }
}

/// Mapping is Soft Pad dispatch-ready under Catalog rules.
pub fn mapping_dispatch_ready(
    enabled: bool,
    pad_enabled: bool,
    app_target_id: &str,
    agent_provider_id: &str,
    face_id: Option<&str>,
) -> Option<(AgentKind, MappingBinding)> {
    if !enabled || !pad_enabled {
        return None;
    }
    let kind = kind_from_mapping(app_target_id, agent_provider_id)?;
    let caps = descriptor(kind).capabilities;
    if !caps.soft_pad_dispatch_ready() {
        return None;
    }
    let fid = face_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_face_id_for(kind));
    if !face_compatible(kind, fid) {
        return None;
    }
    Some((
        kind,
        MappingBinding {
            mapping_id: String::new(),
            agent_kind: kind,
            face_id: fid.to_string(),
            enabled,
            pad_enabled,
        },
    ))
}

/// Honesty tier labels (contract).
pub const HONESTY_TIERS: &[&str] = &[
    "officialAppServer",
    "officialLifecycleHooks",
    "desktopAutomation",
    "inferredStatus",
    "officialNativeHardware",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_dispatch_ready_without_needs_input() {
        set_cursor_can_observe_needs_input(false);
        let caps = cursor_capabilities();
        assert!(caps.soft_pad_dispatch_ready());
        assert!(!caps.can_observe_needs_input);
    }

    #[test]
    fn cursor_mapping_enters_pool() {
        let r = mapping_dispatch_ready(true, true, "cursor-chat", "", Some("cursor-chord-v1"));
        assert!(r.is_some());
        assert_eq!(r.unwrap().0, AgentKind::Cursor);
    }

    #[test]
    fn copilot_cli_not_desktop_dispatch() {
        let r = mapping_dispatch_ready(true, true, "copilot-cli", "copilotCli", None);
        assert!(r.is_none());
    }
}
