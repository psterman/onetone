//! Provider capability options for Picker (bindable vs executableNow).

use serde::Serialize;

use super::actions::ProviderSupport;
use super::providers::{ClaudeProviderAdapter, CodexProviderAdapter, CursorProviderAdapter};
use super::semantic::{
    all_semantic_metas, channel_allowed, route_disposition, ActionChannel,
    ActionLayer, RouteDisposition,
};
use super::templates::{CLAUDE_PROVIDER_ID, CODEX_PROVIDER_ID, CURSOR_PROVIDER_ID};
use crate::agent_attention::project_needs_input_kind;
use crate::agent_catalog::kind_from_mapping;
use crate::config::VoiceConfig;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionOptionDto {
    pub action_id: String,
    pub bindable: bool,
    pub executable_now: bool,
    pub route_disposition: RouteDisposition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    pub provider_scope: String,
}

/// Resolve provider from mapping — never invent Codex for non-Codex habits.
pub fn provider_from_mapping(cfg: &VoiceConfig, mapping_id: &str) -> Option<String> {
    let m = cfg.find_mapping_by_id(mapping_id.trim())?;
    if let Some(k) = kind_from_mapping(&m.app_target_id, &m.agent_provider_id) {
        return Some(k.as_str().to_string());
    }
    let p = m.agent_provider_id.trim();
    if !p.is_empty() {
        return Some(p.to_string());
    }
    None
}

pub fn resolve_provider_for_request(
    cfg: &VoiceConfig,
    mapping_id: Option<&str>,
    explicit: Option<&str>,
) -> Result<Option<String>, &'static str> {
    let mid = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    let derived = mid.and_then(|id| provider_from_mapping(cfg, id));
    let explicit = explicit.map(str::trim).filter(|s| !s.is_empty());
    match (derived, explicit) {
        (Some(d), Some(e)) if d != e => Err("provider_scope_mismatch"),
        (Some(d), _) => Ok(Some(d)),
        (None, Some(e)) => Ok(Some(e.to_string())),
        (None, None) => {
            // Soft Pad lane fallback
            if let Some((kind, _)) = crate::soft_pad_runtime::applied_lane() {
                return Ok(Some(kind.as_str().to_string()));
            }
            let active = cfg.active_scene_id.trim();
            if !active.is_empty() {
                return Ok(provider_from_mapping(cfg, active));
            }
            Ok(None)
        }
    }
}

fn known_adapter_provider(provider_id: &str) -> bool {
    provider_id == CODEX_PROVIDER_ID
        || provider_id == CLAUDE_PROVIDER_ID
        || provider_id == CURSOR_PROVIDER_ID
}

fn layer2_supported_for_provider(provider_id: &str, canonical: &str) -> bool {
    // Layer1-backed agent actions: bindable for known adapters only.
    if matches!(
        canonical,
        "agent.approve" | "agent.reject" | "agent.respond" | "agent.continue"
    ) {
        return known_adapter_provider(provider_id);
    }
    let handler = super::semantic::provider_handler_id(canonical);
    let support = match provider_id {
        id if id == CODEX_PROVIDER_ID => CodexProviderAdapter::supports(handler),
        id if id == CLAUDE_PROVIDER_ID => ClaudeProviderAdapter::supports(handler),
        id if id == CURSOR_PROVIDER_ID => CursorProviderAdapter::supports(handler),
        _ => ProviderSupport::Unsupported,
    };
    !matches!(support, ProviderSupport::Unsupported)
}

fn available_when_matches(meta_when: &[&str], kind: &str) -> bool {
    if meta_when.is_empty() {
        return true;
    }
    meta_when.iter().any(|w| *w == kind)
}

/// Build options for mapping+channel. `bindable` is structural; `executableNow` uses live needsInputKind.
pub fn semantic_action_options(
    cfg: &VoiceConfig,
    mapping_id: &str,
    channel: ActionChannel,
    dictating: bool,
) -> Result<Vec<ActionOptionDto>, &'static str> {
    let provider = provider_from_mapping(cfg, mapping_id);
    let needs = project_needs_input_kind(dictating);
    let kind = needs.kind;

    let mut out = Vec::new();
    for m in all_semantic_metas() {
        if !channel_allowed(m, channel) {
            continue;
        }
        let mut bindable = m.implemented;
        let mut reason: Option<String> = None;
        if !m.implemented {
            bindable = false;
            reason = Some("not_implemented".into());
        } else if m.layer == ActionLayer::AgentControl || m.provider_scope == "providerAdapter" {
            match &provider {
                Some(p) if layer2_supported_for_provider(p, m.id) => {}
                Some(_) => {
                    bindable = false;
                    reason = Some("provider_unsupported".into());
                }
                None => {
                    if m.provider_scope != "none" {
                        bindable = false;
                        reason = Some("no_provider".into());
                    }
                }
            }
        }

        let executable_now = bindable && available_when_matches(m.available_when, kind);
        if bindable && !executable_now && reason.is_none() {
            reason = Some("context_not_available".into());
        }

        out.push(ActionOptionDto {
            action_id: m.id.to_string(),
            bindable,
            executable_now,
            route_disposition: route_disposition(m, channel),
            reason_code: reason,
            provider_id: provider.clone(),
            provider_scope: m.provider_scope.to_string(),
        });
    }
    Ok(out)
}

/// Stable slot id for new semantic bindings.
pub fn semantic_slot_id(channel: ActionChannel, action_id: &str) -> String {
    format!("semantic:{}:{}", channel.as_str(), action_id.trim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::VoiceConfig;

    #[test]
    fn claude_layer2_basic_actions_bindable() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            m.app_target_id = "claude-code".into();
            m.agent_provider_id = "claude".into();
        }
        let opts = semantic_action_options(&cfg, &mid, ActionChannel::Key, false).unwrap();
        let approve = opts.iter().find(|o| o.action_id == "agent.approve").unwrap();
        assert!(approve.bindable, "claude approve should bind");
        let focus = opts.iter().find(|o| o.action_id == "agent.focus").unwrap();
        assert!(focus.bindable, "claude focus should bind");
        let interrupt = opts.iter().find(|o| o.action_id == "agent.interrupt").unwrap();
        assert!(!interrupt.bindable, "claude interrupt unverified");
        assert_eq!(interrupt.reason_code.as_deref(), Some("provider_unsupported"));
        let status = opts.iter().find(|o| o.action_id == "agent.status").unwrap();
        assert!(!status.bindable);
        assert_eq!(status.reason_code.as_deref(), Some("provider_unsupported"));
        let cancel = opts.iter().find(|o| o.action_id == "input.cancel").unwrap();
        assert!(cancel.bindable);
    }

    #[test]
    fn cursor_layer2_basic_actions_bindable() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            m.app_target_id = "cursor-chat".into();
            m.agent_provider_id = "cursor".into();
        }
        let opts = semantic_action_options(&cfg, &mid, ActionChannel::Key, false).unwrap();
        assert!(opts.iter().find(|o| o.action_id == "agent.focus").unwrap().bindable);
        assert!(opts.iter().find(|o| o.action_id == "agent.interrupt").unwrap().bindable);
        assert!(opts.iter().find(|o| o.action_id == "agent.reject").unwrap().bindable);
        let session_new = opts.iter().find(|o| o.action_id == "session.new").unwrap();
        assert!(!session_new.bindable);
        assert_eq!(session_new.reason_code.as_deref(), Some("provider_unsupported"));
    }

    #[test]
    fn respond_continue_bindable_for_claude() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            m.app_target_id = "claude-code".into();
            m.agent_provider_id = "claude".into();
        }
        let opts = semantic_action_options(&cfg, &mid, ActionChannel::SoftPad, false).unwrap();
        assert!(opts.iter().find(|o| o.action_id == "agent.respond").unwrap().bindable);
        assert!(opts.iter().find(|o| o.action_id == "agent.continue").unwrap().bindable);
        assert!(!opts.iter().find(|o| o.action_id == "session.next").unwrap().bindable);
    }

    #[test]
    fn camera_options_send_pending_disposition() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            m.app_target_id = "codex-chat".into();
            m.agent_provider_id = "codex".into();
        }
        let opts = semantic_action_options(&cfg, &mid, ActionChannel::Camera, false).unwrap();
        let send = opts.iter().find(|o| o.action_id == "input.send").unwrap();
        assert!(send.bindable);
        assert!(!send.executable_now); // not dictating
        assert_eq!(send.route_disposition, RouteDisposition::PendingConfirmation);
        let approve = opts.iter().find(|o| o.action_id == "agent.approve").unwrap();
        assert!(approve.bindable);
        assert_eq!(approve.route_disposition, RouteDisposition::PendingConfirmation);
        let cancel = opts.iter().find(|o| o.action_id == "input.cancel").unwrap();
        assert_eq!(cancel.route_disposition, RouteDisposition::Execute);
    }
}
