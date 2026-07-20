//! Unified agent action execute entry (provider-agnostic router).

use std::sync::Arc;

use serde::Deserialize;
use tauri::WebviewWindow;

use crate::agent::actions::{action_by_id, ActivationScope, ExecutionMode};
use crate::agent::providers::CodexProviderAdapter;
use crate::agent::templates::{slot_by_id, CODEX_PROVIDER_ID};
use crate::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExecuteRequest {
    pub provider_id: String,
    pub action_id: String,
    #[serde(default)]
    pub mapping_id: Option<String>,
    #[serde(default)]
    pub slot_id: Option<String>,
    #[serde(default)]
    pub execution_mode: Option<String>,
    #[serde(default)]
    pub activation_scope: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExecuteResult {
    pub ok: bool,
    pub provider_id: String,
    pub action_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_mode: Option<String>,
}

impl AgentExecuteResult {
    fn fail(
        provider_id: &str,
        action_id: &str,
        slot_id: Option<String>,
        reason: &str,
        detail: impl Into<Option<String>>,
        mode: Option<String>,
    ) -> Self {
        Self {
            ok: false,
            provider_id: provider_id.to_string(),
            action_id: action_id.to_string(),
            slot_id,
            reason: Some(reason.to_string()),
            detail: detail.into(),
            execution_mode: mode,
        }
    }
}

pub fn execute_agent_action(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    req: AgentExecuteRequest,
) -> AgentExecuteResult {
    let provider_id = req.provider_id.trim().to_string();
    let action_id = req.action_id.trim().to_string();
    let slot_id = req
        .slot_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    if provider_id.is_empty() {
        return AgentExecuteResult::fail(
            "",
            &action_id,
            slot_id,
            "unsupported_provider",
            Some("empty providerId".into()),
            None,
        );
    }

    let mode = req
        .execution_mode
        .as_deref()
        .and_then(ExecutionMode::parse)
        .or_else(|| action_by_id(&action_id).map(|a| a.default_execution_mode));

    let scope = req
        .activation_scope
        .as_deref()
        .and_then(ActivationScope::parse)
        .or_else(|| {
            slot_id
                .as_deref()
                .and_then(slot_by_id)
                .map(|s| s.activation_scope)
        })
        .or_else(|| action_by_id(&action_id).map(|a| a.default_activation_scope))
        .unwrap_or(ActivationScope::ForegroundApp);

    // Resolve overrides from mapping agentBindings when mappingId present.
    let (resolved_scope, resolved_mode) = resolve_from_mapping(
        state,
        req.mapping_id.as_deref(),
        slot_id.as_deref(),
        &action_id,
        scope,
        mode,
    );

    if action_by_id(&action_id).is_none() {
        return AgentExecuteResult::fail(
            &provider_id,
            &action_id,
            slot_id,
            "unsupported_action",
            Some(format!("unknown action {action_id}")),
            resolved_mode.map(|m| m.as_str().to_string()),
        );
    }

    match provider_id.as_str() {
        id if id == CODEX_PROVIDER_ID => {
            let out = CodexProviderAdapter::execute(
                state,
                window,
                &action_id,
                slot_id.as_deref(),
                resolved_mode,
                resolved_scope,
            );
            AgentExecuteResult {
                ok: out.ok,
                provider_id,
                action_id,
                slot_id,
                reason: out.reason,
                detail: out.detail,
                execution_mode: Some(out.execution_mode),
            }
        }
        _ => AgentExecuteResult::fail(
            &provider_id,
            &action_id,
            slot_id,
            "unsupported_provider",
            Some(format!("unknown provider {provider_id}")),
            resolved_mode.map(|m| m.as_str().to_string()),
        ),
    }
}

fn resolve_from_mapping(
    state: &Arc<AppState>,
    mapping_id: Option<&str>,
    slot_id: Option<&str>,
    action_id: &str,
    default_scope: ActivationScope,
    default_mode: Option<ExecutionMode>,
) -> (ActivationScope, Option<ExecutionMode>) {
    let Some(mid) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return (default_scope, default_mode);
    };
    let cfg = state.cfg.lock();
    let Some(m) = cfg.find_mapping_by_id(mid) else {
        return (default_scope, default_mode);
    };
    let binding = m.agent_bindings.iter().find(|b| {
        if let Some(sid) = slot_id {
            b.slot_id == sid
        } else {
            b.action_id == action_id
        }
    });
    let Some(b) = binding else {
        return (default_scope, default_mode);
    };
    let scope = ActivationScope::parse(&b.activation_scope).unwrap_or(default_scope);
    let mode = b
        .execution_mode
        .as_deref()
        .and_then(ExecutionMode::parse)
        .or(default_mode);
    (scope, mode)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_provider_result() {
        // Request shape only — execute needs window; unit-test fail helper.
        let r = AgentExecuteResult::fail(
            "nope",
            "openAgent",
            None,
            "unsupported_provider",
            None,
            None,
        );
        assert!(!r.ok);
        assert_eq!(r.reason.as_deref(), Some("unsupported_provider"));
    }
}
