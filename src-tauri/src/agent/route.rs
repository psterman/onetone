//! Unified semantic action router (channel → risk → execute / pending).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

use super::context_risk::context_risk_gate;
use super::execute::{execute_agent_action, AgentExecuteRequest, AgentExecuteResult};
use super::layer1_native::{
    execute_agent_approve, execute_agent_continue, execute_agent_reject, execute_agent_respond,
    execute_layer1, is_layer1_native,
};
use super::options::resolve_provider_for_request;
use super::pending_confirm;
use super::semantic::{
    channel_allowed, is_known_action_id, provider_handler_id, resolve_canonical_action_id,
    route_disposition, semantic_meta_by_id, ActionChannel, FinishPolicy, RouteDisposition,
};
use crate::agent_attention::project_needs_input_kind;
use crate::voice_end_runtime;
use crate::AppState;

static CONFIRMATION_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RouteStatus {
    Executed,
    PendingConfirmation,
    Unavailable,
    Unsupported,
    Failed,
    Cancelled,
}

impl RouteStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Executed => "executed",
            Self::PendingConfirmation => "pendingConfirmation",
            Self::Unavailable => "unavailable",
            Self::Unsupported => "unsupported",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticActionRequest {
    pub action_id: String,
    #[serde(default)]
    pub source_channel: String,
    #[serde(default)]
    pub mapping_id: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub confirmation_id: Option<String>,
    #[serde(default)]
    pub slot_id: Option<String>,
    #[serde(default)]
    pub args: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticRouteResult {
    pub status: &'static str,
    pub action_id: String,
    pub source_channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ok: Option<bool>,
}

impl SemanticRouteResult {
    fn base(
        status: RouteStatus,
        action_id: impl Into<String>,
        source_channel: impl Into<String>,
        mapping_id: Option<String>,
        provider_id: Option<String>,
    ) -> Self {
        Self {
            status: status.as_str(),
            action_id: action_id.into(),
            source_channel: source_channel.into(),
            mapping_id,
            provider_id,
            reason_code: None,
            confirmation_id: None,
            detail: None,
            ok: None,
        }
    }

    fn with_reason(mut self, code: &str, detail: Option<String>) -> Self {
        self.reason_code = Some(code.to_string());
        self.detail = detail;
        self
    }
}

fn finish_policy_from_state(state: &AppState) -> FinishPolicy {
    let mode = state.cfg.lock().voice_end.send_mode.clone();
    FinishPolicy::from_send_mode(&mode)
}

fn next_confirmation_id() -> String {
    let n = CONFIRMATION_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("confirm-{n}")
}

pub fn camera_pending_eligible(channel: ActionChannel, canonical: &str) -> bool {
    if channel != ActionChannel::Camera {
        return false;
    }
    let Some(meta) = semantic_meta_by_id(canonical) else {
        return false;
    };
    route_disposition(meta, ActionChannel::Camera) == RouteDisposition::PendingConfirmation
}

fn needs_kind_now(state: &AppState) -> String {
    let dictating = voice_end_runtime::session_state(state) == "dictating";
    project_needs_input_kind(dictating).kind.to_string()
}

/// Authoritative ingress for all channels.
pub fn route_semantic_action(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    req: SemanticActionRequest,
) -> SemanticRouteResult {
    let result = route_semantic_action_inner(state, window, req, false);
    log_route_result(state, &result);
    result
}

fn log_route_result(state: &AppState, r: &SemanticRouteResult) {
    // Lightweight reliability log — no user text / prompts / paths.
    let msg = format!(
        "actionId={} channel={} providerId={} status={} reasonCode={}",
        r.action_id,
        r.source_channel,
        r.provider_id.as_deref().unwrap_or(""),
        r.status,
        r.reason_code.as_deref().unwrap_or(""),
    );
    crate::app_log::log_line(state, "semantic_route", &msg);
}

fn route_semantic_action_inner(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    req: SemanticActionRequest,
    completing_pending: bool,
) -> SemanticRouteResult {
    let source_raw = req.source_channel.clone();
    let mapping_id = req
        .mapping_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let provider_id = {
        let cfg = state.cfg.lock();
        match resolve_provider_for_request(
            &cfg,
            mapping_id.as_deref(),
            req.provider_id.as_deref(),
        ) {
            Ok(p) => p,
            Err(code) => {
                return SemanticRouteResult::base(
                    RouteStatus::Unavailable,
                    req.action_id.trim(),
                    source_raw,
                    mapping_id,
                    None,
                )
                .with_reason(code, None);
            }
        }
    };

    let Some(channel) = ActionChannel::parse(&req.source_channel) else {
        return SemanticRouteResult::base(
            RouteStatus::Unavailable,
            req.action_id.trim(),
            source_raw,
            mapping_id,
            provider_id,
        )
        .with_reason(
            "invalid_channel",
            Some("sourceChannel must be key|voice|camera|softPad".into()),
        );
    };

    // Explicit confirmationId: actionId must match; mismatch does not refresh TTL.
    if let Some(cid) = req
        .confirmation_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let finish = finish_policy_from_state(state);
        let req_canonical = resolve_canonical_action_id(req.action_id.trim(), finish);
        match pending_confirm::take_valid_if_action_matches(
            cid,
            channel.as_str(),
            &req_canonical,
        ) {
            Ok(pending) => {
                let exec_req = SemanticActionRequest {
                    action_id: pending.action_id.clone(),
                    source_channel: channel.as_str().to_string(),
                    mapping_id: pending.mapping_id.or(mapping_id),
                    provider_id: pending.provider_id.or(provider_id),
                    confirmation_id: None,
                    slot_id: req.slot_id.clone(),
                    args: req.args.clone(),
                };
                return route_semantic_action_inner(state, window, exec_req, true);
            }
            Err(code) => {
                return SemanticRouteResult::base(
                    RouteStatus::Unavailable,
                    req.action_id.trim(),
                    channel.as_str(),
                    mapping_id,
                    provider_id,
                )
                .with_reason(code, None);
            }
        }
    }

    let finish = finish_policy_from_state(state);
    let raw_action = req.action_id.trim().to_string();
    let canonical = resolve_canonical_action_id(&raw_action, finish);

    // Auto-match pending (key/voice/softPad) before normal execute.
    if !completing_pending && channel != ActionChannel::Camera {
        match pending_confirm::take_unique_match(
            &canonical,
            channel.as_str(),
            mapping_id.as_deref(),
            provider_id.as_deref(),
        ) {
            Ok(Some(pending)) => {
                let exec_req = SemanticActionRequest {
                    action_id: pending.action_id,
                    source_channel: channel.as_str().to_string(),
                    mapping_id: pending.mapping_id.or(mapping_id),
                    provider_id: pending.provider_id.or(provider_id),
                    confirmation_id: None,
                    slot_id: req.slot_id.clone(),
                    args: req.args.clone(),
                };
                return route_semantic_action_inner(state, window, exec_req, true);
            }
            Err("confirmation_ambiguous") => {
                return SemanticRouteResult::base(
                    RouteStatus::Unavailable,
                    canonical,
                    channel.as_str(),
                    mapping_id,
                    provider_id,
                )
                .with_reason("confirmation_ambiguous", None);
            }
            Ok(None) | Err(_) => {}
        }
    }

    if semantic_meta_by_id(&canonical).is_none()
        && !is_known_action_id(&canonical)
        && !is_known_action_id(provider_handler_id(&canonical))
    {
        return SemanticRouteResult::base(
            RouteStatus::Unsupported,
            canonical,
            channel.as_str(),
            mapping_id,
            provider_id,
        )
        .with_reason("unsupported_action", None);
    }

    let kind = needs_kind_now(state);

    // agent.reject: cancel matching approve pending first (no Esc from cancel path).
    if canonical == "agent.reject" && !completing_pending {
        let _ = pending_confirm::cancel_unique_match(
            "agent.approve",
            mapping_id.as_deref(),
            provider_id.as_deref(),
        );
    }

    // Camera pending create with ContextRiskGate.
    if camera_pending_eligible(channel, &canonical) {
        if let Some(code) = context_risk_gate(
            &canonical,
            channel.as_str(),
            &kind,
            true,
            false,
        ) {
            return SemanticRouteResult::base(
                RouteStatus::Unavailable,
                canonical,
                channel.as_str(),
                mapping_id,
                provider_id,
            )
            .with_reason(code, None);
        }
        // Require full scope for pending so auto-match can work.
        let Some(pid) = provider_id.clone() else {
            return SemanticRouteResult::base(
                RouteStatus::Unavailable,
                canonical,
                channel.as_str(),
                mapping_id,
                None,
            )
            .with_reason("no_provider", Some("camera pending needs provider".into()));
        };
        if mapping_id.is_none() {
            return SemanticRouteResult::base(
                RouteStatus::Unavailable,
                canonical,
                channel.as_str(),
                None,
                Some(pid),
            )
            .with_reason("no_mapping", Some("camera pending needs mappingId".into()));
        }
        let confirmation_id = next_confirmation_id();
        pending_confirm::insert_pending(
            confirmation_id.clone(),
            canonical.clone(),
            channel.as_str().to_string(),
            mapping_id.clone(),
            Some(pid.clone()),
        );
        return SemanticRouteResult {
            status: RouteStatus::PendingConfirmation.as_str(),
            action_id: canonical,
            source_channel: channel.as_str().to_string(),
            mapping_id,
            provider_id: Some(pid),
            reason_code: Some("camera_requires_confirmation".into()),
            confirmation_id: Some(confirmation_id),
            detail: Some("camera cannot complete send/approve alone".into()),
            ok: None,
        };
    }

    if let Some(code) =
        context_risk_gate(&canonical, channel.as_str(), &kind, false, completing_pending)
    {
        return SemanticRouteResult::base(
            RouteStatus::Unavailable,
            canonical,
            channel.as_str(),
            mapping_id,
            provider_id,
        )
        .with_reason(code, None);
    }

    if let Some(meta) = semantic_meta_by_id(&canonical) {
        if !meta.implemented {
            let detail = format!("{canonical} not implemented");
            return SemanticRouteResult::base(
                RouteStatus::Unsupported,
                canonical,
                channel.as_str(),
                mapping_id,
                provider_id,
            )
            .with_reason("not_implemented", Some(detail));
        }
        if !channel_allowed(meta, channel) {
            let detail = format!("{} cannot bind {}", channel.as_str(), canonical);
            return SemanticRouteResult::base(
                RouteStatus::Unavailable,
                canonical,
                channel.as_str(),
                mapping_id,
                provider_id,
            )
            .with_reason("channel_not_allowed", Some(detail));
        }
    }

    let provider_str = provider_id.clone().unwrap_or_default();

    if is_layer1_native(&canonical) {
        let out = execute_layer1(
            state,
            window,
            &raw_action,
            &canonical,
            mapping_id.as_deref(),
        );
        return map_layer_outcome(out, &canonical, channel.as_str(), mapping_id, &provider_str);
    }

    if canonical == "agent.approve" {
        let out = execute_agent_approve(state, mapping_id.as_deref());
        return map_layer_outcome(out, &canonical, channel.as_str(), mapping_id, &provider_str);
    }

    if canonical == "agent.reject" {
        let out = execute_agent_reject(state, mapping_id.as_deref());
        return map_layer_outcome(out, &canonical, channel.as_str(), mapping_id, &provider_str);
    }

    if canonical == "agent.respond" {
        let out = execute_agent_respond(state, window, mapping_id.as_deref());
        return map_layer_outcome(out, &canonical, channel.as_str(), mapping_id, &provider_str);
    }

    if canonical == "agent.continue" {
        let out = execute_agent_continue(state, window, mapping_id.as_deref());
        return map_layer_outcome(out, &canonical, channel.as_str(), mapping_id, &provider_str);
    }

    // Require provider for adapter-scoped actions.
    if provider_str.is_empty() && semantic_meta_by_id(&canonical).is_some_and(|m| m.provider_scope != "none")
    {
        return SemanticRouteResult::base(
            RouteStatus::Unavailable,
            canonical,
            channel.as_str(),
            mapping_id,
            None,
        )
        .with_reason("no_provider", None);
    }

    let handler = provider_handler_id(&canonical).to_string();
    let exec = execute_agent_action(
        state,
        window,
        AgentExecuteRequest {
            provider_id: provider_str.clone(),
            action_id: handler,
            mapping_id: mapping_id.clone(),
            slot_id: req.slot_id.clone(),
            execution_mode: None,
            activation_scope: None,
        },
    );

    map_execute_result(exec, &canonical, channel.as_str(), mapping_id, &provider_str)
}

fn map_layer_outcome(
    out: super::layer1_native::Layer1Outcome,
    canonical: &str,
    channel: &str,
    mapping_id: Option<String>,
    provider_id: &str,
) -> SemanticRouteResult {
    if out.ok {
        SemanticRouteResult {
            status: RouteStatus::Executed.as_str(),
            action_id: canonical.to_string(),
            source_channel: channel.to_string(),
            mapping_id,
            provider_id: if provider_id.is_empty() {
                None
            } else {
                Some(provider_id.to_string())
            },
            reason_code: None,
            confirmation_id: None,
            detail: out.detail,
            ok: Some(true),
        }
    } else {
        let reason = out.reason.unwrap_or_else(|| "failed".into());
        let status = if reason == "not_implemented" {
            RouteStatus::Unsupported
        } else {
            RouteStatus::Failed
        };
        SemanticRouteResult {
            status: status.as_str(),
            action_id: canonical.to_string(),
            source_channel: channel.to_string(),
            mapping_id,
            provider_id: if provider_id.is_empty() {
                None
            } else {
                Some(provider_id.to_string())
            },
            reason_code: Some(reason),
            confirmation_id: None,
            detail: out.detail,
            ok: Some(false),
        }
    }
}

fn map_execute_result(
    exec: AgentExecuteResult,
    canonical: &str,
    channel: &str,
    mapping_id: Option<String>,
    provider_id: &str,
) -> SemanticRouteResult {
    if exec.ok {
        SemanticRouteResult {
            status: RouteStatus::Executed.as_str(),
            action_id: canonical.to_string(),
            source_channel: channel.to_string(),
            mapping_id,
            provider_id: Some(provider_id.to_string()),
            reason_code: None,
            confirmation_id: None,
            detail: exec.detail,
            ok: Some(true),
        }
    } else {
        let reason = exec.reason.unwrap_or_else(|| "failed".into());
        let status = if reason == "unsupported_action" || reason == "unsupported_provider" {
            RouteStatus::Unsupported
        } else {
            RouteStatus::Failed
        };
        SemanticRouteResult {
            status: status.as_str(),
            action_id: canonical.to_string(),
            source_channel: channel.to_string(),
            mapping_id,
            provider_id: Some(provider_id.to_string()),
            reason_code: Some(reason),
            confirmation_id: None,
            detail: exec.detail,
            ok: Some(false),
        }
    }
}
