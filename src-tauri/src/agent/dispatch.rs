//! Unified runtime ingress: all key/voice/softPad bindings → route_semantic_action.

use std::sync::Arc;

use tauri::WebviewWindow;

use super::options::provider_from_mapping;
use super::route::{route_semantic_action, SemanticActionRequest, SemanticRouteResult};
use super::semantic::ActionChannel;
use crate::config::AgentBinding;
use crate::AppState;

/// Dispatch a stored agent binding through the semantic router.
pub fn dispatch_semantic_binding(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    binding: &AgentBinding,
    source_channel: ActionChannel,
) -> SemanticRouteResult {
    let provider_id = {
        let cfg = state.cfg.lock();
        provider_from_mapping(&cfg, mapping_id)
    };
    route_semantic_action(
        state,
        window,
        SemanticActionRequest {
            action_id: binding.action_id.clone(),
            source_channel: source_channel.as_str().to_string(),
            mapping_id: Some(mapping_id.to_string()),
            provider_id,
            confirmation_id: None,
            slot_id: if binding.slot_id.trim().is_empty() {
                None
            } else {
                Some(binding.slot_id.clone())
            },
            args: None,
        },
    )
}

/// Convenience when only ids are known (Soft Pad / voice).
pub fn dispatch_semantic_action_ids(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    action_id: &str,
    slot_id: Option<&str>,
    source_channel: ActionChannel,
) -> SemanticRouteResult {
    let provider_id = {
        let cfg = state.cfg.lock();
        provider_from_mapping(&cfg, mapping_id)
    };
    route_semantic_action(
        state,
        window,
        SemanticActionRequest {
            action_id: action_id.to_string(),
            source_channel: source_channel.as_str().to_string(),
            mapping_id: Some(mapping_id.to_string()),
            provider_id,
            confirmation_id: None,
            slot_id: slot_id.map(str::to_string),
            args: None,
        },
    )
}
