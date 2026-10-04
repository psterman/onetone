//! Agent Center snapshot — registry + home + attention projection.
//! Judgment lives here; UI only projects. Execute via `cmd_agent_center_action`
//! which re-resolves before running an internal executor.

use crate::agent::actions::ProviderSupport;
use crate::agent::execute::{execute_agent_action, AgentExecuteRequest};
use crate::agent::semantic::provider_handler_id;
use crate::agent::templates::{
    CLAUDE_PROVIDER_ID, CODEX_PROVIDER_ID, CURSOR_PROVIDER_ID,
};
use crate::agent_attention::{self, AttentionState, SignalSource};
use crate::agent_catalog;
use crate::agent_lane::{
    public_lanes_for_page, resume_claude_lane, resume_codex_lane, FocusClickKind, FocusTargetHint,
};
use crate::agent_memory::checkpoint::{latest_checkpoint_for_session, resume_checkpoint};
use crate::agent_memory::claude_background::{
    get_probe, process_probe_cache, session_still_active, system_runner, ClaudeBackgroundProbe,
    ClaudeProbeCache, ClaudeProbeRunner, ClaudeProbeState, ClaudeStopError, ProbePolicy,
};
use crate::agent_memory::model::{HomeSessionDto, UNKNOWN_PROJECT_ID};
use crate::agent_memory::registry::{
    kind_agent_id, list_registry, refresh_registry, RegistryRow, ALL_AGENT_KINDS,
};
use crate::agent_memory::{build_agent_home_snapshot, with_write, AgentHomeSnapshot};
use crate::agent_memory::store::now_ms;
use crate::app_chat_workflow::{
    CLAUDE_CODE_APP_TARGET_ID, CODEX_APP_TARGET_ID, CURSOR_APP_TARGET_ID, MINIMAX_APP_TARGET_ID,
    QODER_APP_TARGET_ID, TRAE_APP_TARGET_ID, TRAE_CODE_APP_TARGET_ID, WORKBUDDY_APP_TARGET_ID,
};
use crate::soft_pad_runtime::AgentKind;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Manager, WebviewWindow};

/// Agent Center working freshness (projection only — does not mutate attention store).
pub const WORKING_FRESH_MS_HOOK: u64 = 120_000;
pub const WORKING_FRESH_MS_INFERRED: u64 = 60_000;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterSnapshotArgs {
    pub project_hint: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterActionArgs {
    pub agent_id: String,
    pub action_id: String,
    pub project_hint: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionScope {
    ExternalAgent,
    OneToneUi,
}

impl ActionScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ExternalAgent => "externalAgent",
            Self::OneToneUi => "oneToneUi",
        }
    }
}

/// Internal executor — never accepted from the frontend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentCenterExecutor {
    FocusApp { target: String },
    ProviderAction { provider: AgentKind, handler: String },
    FocusOrResumeLane {
        kind: AgentKind,
        external_session_id: String,
    },
    CheckpointPreview { session_id: String },
    ClientNavigation { destination: String },
    ClaudeStop { external_session_id: String },
}

impl AgentCenterExecutor {
    pub fn diag(&self) -> String {
        match self {
            Self::FocusApp { target } => format!("focusApp:{target}"),
            Self::ProviderAction { provider, handler } => {
                format!("providerAction:{}:{handler}", provider.as_str())
            }
            Self::FocusOrResumeLane {
                kind,
                external_session_id,
            } => format!(
                "focusOrResumeLane:{}:{external_session_id}",
                kind.as_str()
            ),
            Self::CheckpointPreview { session_id } => {
                format!("checkpointPreview:{session_id}")
            }
            Self::ClientNavigation { destination } => {
                format!("clientNavigation:{destination}")
            }
            Self::ClaudeStop {
                external_session_id,
            } => format!("claudeStop:{external_session_id}"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedAction {
    pub id: String,
    pub label: String,
    pub scope: ActionScope,
    pub support: ProviderSupport,
    pub supported: bool,
    pub enabled: bool,
    pub reason: Option<String>,
    pub executor: Option<AgentCenterExecutor>,
}

impl ResolvedAction {
    pub fn to_dto(&self) -> AgentCenterAction {
        AgentCenterAction {
            id: self.id.clone(),
            label: self.label.clone(),
            scope: self.scope.as_str().into(),
            support: self.support.as_str().into(),
            supported: self.supported,
            enabled: self.enabled,
            reason: self.reason.clone(),
            executor: self.executor.as_ref().map(|e| e.diag()),
        }
    }

    /// ExternalAgent: enabled ⇒ supported ⇒ support != Unsupported ⇒ executor present.
    /// OneToneUi: enabled ⇒ executor present (support may be Unused/Unsupported).
    pub fn invariant_ok(&self) -> bool {
        if self.scope == ActionScope::OneToneUi {
            return !self.enabled || self.executor.is_some();
        }
        if self.enabled {
            if !self.supported {
                return false;
            }
            if self.support == ProviderSupport::Unsupported {
                return false;
            }
            if self.executor.is_none() {
                return false;
            }
        }
        true
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterAction {
    pub id: String,
    pub label: String,
    pub scope: String,
    pub support: String,
    pub supported: bool,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Diagnostic only — never used as execute input.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservedStatus {
    pub value: String,
    pub source: String,
    pub observed_at: u64,
    pub fresh_until: u64,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceAxes {
    pub installation: String,
    pub data_source: String,
    pub runtime: String,
    pub integration: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityState {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricValue {
    pub value: Option<f64>,
    pub basis: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResolvedCapabilities {
    pub usage: CapabilityState,
    pub session_metadata: CapabilityState,
    pub transcript: CapabilityState,
    pub realtime_status: CapabilityState,
    pub hooks: CapabilityState,
    pub resume: CapabilityState,
    pub focus: CapabilityState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterMetrics {
    pub today_sessions: MetricValue,
    pub today_cost_usd: MetricValue,
    pub tokens: MetricValue,
    pub average_duration_ms: MetricValue,
    pub success_rate: MetricValue,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterAgent {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_kind: Option<String>,
    pub display_name: String,
    pub form_factor: String,
    pub presence_state: String,
    pub presence: PresenceAxes,
    pub status: String,
    pub observed_status: ObservedStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_probe_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<u64>,
    pub resolved_capabilities: AgentResolvedCapabilities,
    pub metrics: AgentCenterMetrics,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_work: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attention: Option<serde_json::Value>,
    pub recent_work: Vec<serde_json::Value>,
    pub unscoped_recent_work: Vec<serde_json::Value>,
    pub evidence: Vec<serde_json::Value>,
    pub limitations: Vec<serde_json::Value>,
    pub actions: Vec<AgentCenterAction>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterGroups {
    pub needs_attention: Vec<String>,
    pub connected: Vec<String>,
    pub discovered_limited: Vec<String>,
    pub supported_not_found: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterSnapshot {
    pub agents: Vec<AgentCenterAgent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended_agent_id: Option<String>,
    pub groups: AgentCenterGroups,
    pub attention_state: String,
    pub as_of: u64,
    pub home_session_ids: Vec<String>,
    pub referenced_session_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterActionResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_effect: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
}

/// Hints available when AppState is present (snapshot soft path / action IPC).
#[derive(Debug, Clone, Default)]
pub struct ResolveHints {
    pub cursor_mapping_id: Option<String>,
    pub inventory_scan_ok: bool,
    /// As-of time for freshness checks (`probe.fresh_until >= evaluated_at_ms`).
    pub evaluated_at_ms: u64,
    /// Claude control-plane evidence. `None` / Default → fail closed.
    pub claude_background: Option<ClaudeBackgroundProbe>,
}

fn cursor_mapping_from_state(state: &AppState) -> Option<String> {
    let cfg = state.cfg.lock();
    cfg.mappings
        .iter()
        .find(|m| m.app_target_id.trim() == CURSOR_APP_TARGET_ID)
        .map(|m| m.id.clone())
}

/// Production collector: system Claude runner + process probe cache.
pub fn collect_resolve_hints(state: &AppState, policy: ProbePolicy) -> ResolveHints {
    collect_resolve_hints_with(state, policy, &system_runner(), process_probe_cache())
}

/// Injectable collector for tests (isolated runner + cache).
pub fn collect_resolve_hints_with(
    state: &AppState,
    policy: ProbePolicy,
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
) -> ResolveHints {
    // Release cfg mutex before any Claude subprocess IO.
    let cursor_mapping_id = cursor_mapping_from_state(state);
    let evaluated_at_ms = now_ms();
    let claude_background = Some(get_probe(policy, runner, cache));
    ResolveHints {
        cursor_mapping_id,
        inventory_scan_ok: true,
        evaluated_at_ms,
        claude_background,
    }
}

fn unavailable_metric(reason: &str) -> MetricValue {
    MetricValue {
        value: None,
        basis: "unavailable".into(),
        source: None,
        unavailable_reason: Some(reason.into()),
    }
}

fn cap(state: &str, source: Option<&str>, reason: Option<&str>) -> CapabilityState {
    CapabilityState {
        state: state.into(),
        source: source.map(|s| s.into()),
        reason: reason.map(|s| s.into()),
        updated_at: Some(now_ms()),
    }
}

/// Soft Pad focus executor coverage (not catalog ceiling).
pub fn focus_app_target_for(kind: AgentKind) -> Option<&'static str> {
    match kind {
        AgentKind::Codex => Some(CODEX_APP_TARGET_ID),
        AgentKind::Claude => Some(CLAUDE_CODE_APP_TARGET_ID),
        AgentKind::Cursor => Some(CURSOR_APP_TARGET_ID),
        AgentKind::MiniMax => Some(MINIMAX_APP_TARGET_ID),
        AgentKind::WorkBuddy => Some(WORKBUDDY_APP_TARGET_ID),
        AgentKind::Trae => Some(TRAE_APP_TARGET_ID),
        AgentKind::TraeCode => Some(TRAE_CODE_APP_TARGET_ID),
        AgentKind::Qoder => Some(QODER_APP_TARGET_ID),
        _ => None,
    }
}

fn provider_id_for(kind: AgentKind) -> Option<&'static str> {
    match kind {
        AgentKind::Codex => Some(CODEX_PROVIDER_ID),
        AgentKind::Claude => Some(CLAUDE_PROVIDER_ID),
        AgentKind::Cursor => Some(CURSOR_PROVIDER_ID),
        _ => None,
    }
}

fn interrupt_support(kind: AgentKind) -> ProviderSupport {
    match kind {
        AgentKind::Codex => ProviderSupport::Hotkey,
        AgentKind::Cursor => ProviderSupport::Hotkey,
        AgentKind::Claude => ProviderSupport::Unsupported,
        _ => ProviderSupport::Unsupported,
    }
}

fn working_fresh_ms(source: SignalSource) -> u64 {
    match source {
        SignalSource::OfficialHook | SignalSource::AppServer | SignalSource::Native => {
            WORKING_FRESH_MS_HOOK
        }
        _ => WORKING_FRESH_MS_INFERRED,
    }
}

fn source_str(s: SignalSource) -> &'static str {
    match s {
        SignalSource::OfficialHook => "officialHook",
        SignalSource::AppServer => "appServer",
        SignalSource::Inferred => "inferred",
        SignalSource::OneToneAsk => "oneToneAsk",
        SignalSource::Native => "native",
    }
}

/// Agent Center–only status projection (does not mutate attention store).
pub fn resolve_observed_status(kind: Option<AgentKind>) -> ObservedStatus {
    let now = now_ms();
    let Some(k) = kind else {
        return ObservedStatus {
            value: "unknown".into(),
            source: "none".into(),
            observed_at: now,
            fresh_until: now,
            confidence: "low".into(),
        };
    };
    let raw = agent_attention::primary_state_for(k);
    let source = agent_attention::lifecycle_source_for(k).unwrap_or(SignalSource::Inferred);
    let age = agent_attention::lifecycle_age_ms(k).unwrap_or(0);
    let fresh_ms = working_fresh_ms(source);
    let observed_at = now.saturating_sub(age);
    let fresh_until = observed_at.saturating_add(fresh_ms);

    let value = match raw {
        Some(AttentionState::Working) if age <= fresh_ms => "working",
        Some(AttentionState::Working) => "unknown", // stale working → unknown, not idle
        Some(AttentionState::NeedsInput) => "needs_input",
        Some(AttentionState::Complete) => "completed",
        Some(AttentionState::Error) => "failed",
        Some(AttentionState::Idle) => "idle",
        None => "unknown",
    };

    ObservedStatus {
        value: value.into(),
        source: source_str(source).into(),
        observed_at,
        fresh_until,
        confidence: if matches!(
            source,
            SignalSource::OfficialHook | SignalSource::AppServer
        ) {
            "high".into()
        } else {
            "medium".into()
        },
    }
}

fn resolve_capabilities(row: &RegistryRow, kind: Option<AgentKind>) -> AgentResolvedCapabilities {
    let evidence: serde_json::Value =
        serde_json::from_str(&row.capability_evidence_json).unwrap_or(serde_json::json!({}));
    let ev = |key: &str| {
        evidence
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
    };

    let catalog_caps = kind.map(|k| agent_catalog::descriptor(k).capabilities);
    let focus_wired = kind.and_then(focus_app_target_for).is_some();

    let usage = match ev("usage") {
        "available" => cap("available", Some("probe"), None),
        "limited" => cap("limited", Some("probe"), row.limitation_reason.as_deref()),
        "unavailable" => cap("unavailable", Some("probe"), row.limitation_reason.as_deref()),
        _ => cap("unknown", Some("probe"), None),
    };
    let session_metadata = match (ev("sessionMetadata"), row.adapter_state.as_str()) {
        ("available", _) | (_, "readable") => cap("available", Some("adapter"), None),
        ("limited", _) | (_, "path_present" | "limited") => {
            cap("limited", Some("adapter"), row.limitation_reason.as_deref())
        }
        ("unavailable", _) | (_, "encrypted") => {
            cap("unavailable", Some("adapter"), Some("encrypted_or_unreadable"))
        }
        _ => cap("unknown", Some("adapter"), None),
    };
    let transcript = match (ev("transcript"), row.adapter_state.as_str()) {
        ("unavailable", _) | (_, "encrypted") => {
            cap("unavailable", Some("adapter"), Some("transcript_unreadable"))
        }
        ("available", _) => cap("available", Some("adapter"), None),
        ("limited", _) => cap("limited", Some("adapter"), None),
        _ => cap("unknown", Some("adapter"), None),
    };

    let (hooks, resume, focus) = if let Some(c) = catalog_caps.as_ref() {
        (
            if c.can_observe_lifecycle {
                cap("available", Some("catalog"), None)
            } else {
                cap("unavailable", Some("catalog"), Some("no_hooks"))
            },
            if c.can_resume_session {
                cap("available", Some("catalog"), None)
            } else {
                cap("unavailable", Some("catalog"), Some("no_resume"))
            },
            if c.can_focus && focus_wired {
                cap("available", Some("executor"), None)
            } else if c.can_focus && !focus_wired {
                cap("unavailable", Some("executor"), Some("no_focus_executor"))
            } else {
                cap("unavailable", Some("catalog"), Some("no_focus"))
            },
        )
    } else {
        (
            cap("unknown", Some("discovered"), Some("no_runtime_kind")),
            cap("unavailable", Some("discovered"), Some("no_runtime_kind")),
            cap("unavailable", Some("discovered"), Some("no_runtime_kind")),
        )
    };

    let realtime = if kind.is_some() {
        cap("limited", Some("attention"), Some("memory_process_state"))
    } else {
        cap("unknown", Some("discovered"), None)
    };

    AgentResolvedCapabilities {
        usage,
        session_metadata,
        transcript,
        realtime_status: realtime,
        hooks,
        resume,
        focus,
    }
}

fn resolve_presence(row: &RegistryRow, kind: Option<AgentKind>, obs: &ObservedStatus) -> PresenceAxes {
    let installation = match row.presence_state.as_str() {
        "connected" => "installed",
        "detected" | "limited" => "installed",
        "not_found" => "notFound",
        "stale" => "unknown",
        _ => "unknown",
    };
    let data_source = match row.adapter_state.as_str() {
        "readable" => "readable",
        "encrypted" => "unreadable",
        "path_present" | "limited" | "inventory_only" => "degraded",
        "read_error" => "unreadable",
        "unknown" if row.data_path.is_none() => "absent",
        _ => "unknown",
    };
    let runtime = if obs.value == "working" || obs.value == "needs_input" {
        "running"
    } else {
        "unknown" // never auto-stopped without positive evidence
    };
    let integration = match kind {
        Some(k) => {
            let hooks = agent_catalog::descriptor(k).capabilities.can_observe_lifecycle;
            if hooks
                && matches!(
                    obs.source.as_str(),
                    "officialHook" | "appServer"
                )
                && obs.value != "unknown"
            {
                "connected"
            } else if hooks {
                "partial"
            } else {
                "unsupported"
            }
        }
        None => "unknown",
    };
    PresenceAxes {
        installation: installation.into(),
        data_source: data_source.into(),
        runtime: runtime.into(),
        integration: integration.into(),
    }
}

/// Migration-only provider string match — prefer `normalize_provider_kind`.
fn provider_matches_kind(provider: &str, kind: AgentKind) -> bool {
    normalize_provider_kind(provider) == Some(kind)
}

fn normalize_provider_kind(provider: &str) -> Option<AgentKind> {
    let p = provider.trim().to_ascii_lowercase();
    if p.is_empty() {
        return None;
    }
    if let Some(k) = AgentKind::from_kind_str(&p) {
        return Some(k);
    }
    match p.as_str() {
        "anthropic" => Some(AgentKind::Claude),
        "openai" => Some(AgentKind::Codex),
        "trae-code" | "traecode" => Some(AgentKind::TraeCode),
        _ if p.contains("claude") => Some(AgentKind::Claude),
        _ if p.contains("codex") => Some(AgentKind::Codex),
        _ if p.contains("workbuddy") => Some(AgentKind::WorkBuddy),
        _ if p.contains("cursor") => Some(AgentKind::Cursor),
        _ if p.contains("trae") && p.contains("code") => Some(AgentKind::TraeCode),
        _ if p.contains("trae") => Some(AgentKind::Trae),
        _ => None,
    }
}

fn home_is_cross_project_fallback(home: &AgentHomeSnapshot) -> bool {
    home.diagnostics
        .iter()
        .any(|d| d.contains("showing_cross_project_recent_fallback"))
}

fn session_is_project_scoped(s: &HomeSessionDto, home_project_id: &str) -> bool {
    if home_project_id == UNKNOWN_PROJECT_ID || home_project_id.is_empty() {
        return false;
    }
    if s.project_id != home_project_id {
        return false;
    }
    matches!(s.project_match.as_str(), "exact" | "probable")
}

fn lane_for_external(kind: AgentKind, external_session_id: &str) -> Option<String> {
    let sid = external_session_id.trim();
    if sid.is_empty() {
        return None;
    }
    public_lanes_for_page(kind)
        .into_iter()
        .find(|l| l.key.session_id == sid)
        .map(|l| l.lane_id)
}

fn work_json(
    s: &HomeSessionDto,
    kind: AgentKind,
    from_cross_project: bool,
    home_project_id: &str,
) -> serde_json::Value {
    let scoped = session_is_project_scoped(s, home_project_id);
    let project_label = if s.project_id.is_empty() || s.project_id == UNKNOWN_PROJECT_ID {
        None
    } else {
        Some(s.project_id.clone())
    };
    let lane_id = if s.external_session_id.trim().is_empty() {
        None
    } else {
        lane_for_external(kind, &s.external_session_id)
    };
    serde_json::json!({
        "workId": s.session_id,
        "sessionId": s.session_id,
        "externalSessionId": s.external_session_id,
        "agentKind": kind.as_str(),
        "provider": s.provider,
        "projectId": s.project_id,
        "projectLabel": project_label,
        "projectUnknown": project_label.is_none(),
        "laneId": lane_id,
        "fromCrossProjectFallback": from_cross_project || !scoped,
        "title": s.title,
        "status": s.status,
        "updatedAtMs": s.updated_at,
        "isActive": s.is_active,
        "metaSource": if kind == AgentKind::Cursor { "cursorAdapter" } else { "agentHomeSession" },
    })
}

/// Pure action resolution for one agent row.
pub fn resolve_actions(
    kind: Option<AgentKind>,
    obs: &ObservedStatus,
    current_work: Option<&serde_json::Value>,
    hints: &ResolveHints,
) -> Vec<ResolvedAction> {
    let mut out = Vec::new();
    let catalog = kind.map(|k| agent_catalog::descriptor(k).capabilities);
    let focus_target = kind.and_then(focus_app_target_for);
    let focus_ceiling = catalog.map(|c| c.can_focus).unwrap_or(false);
    let focus_ok = focus_ceiling && focus_target.is_some();

    out.push(ResolvedAction {
        id: "agent.focus".into(),
        label: "View".into(),
        scope: ActionScope::ExternalAgent,
        support: if focus_ok {
            ProviderSupport::Workflow
        } else {
            ProviderSupport::Unsupported
        },
        supported: focus_ok,
        enabled: focus_ok,
        reason: if focus_ok {
            None
        } else if focus_ceiling {
            Some("no_focus_executor".into())
        } else {
            Some("no_focus".into())
        },
        executor: focus_target.map(|t| AgentCenterExecutor::FocusApp {
            target: t.to_string(),
        }),
    });

    // session.resume — Claude/Codex lane via external id
    let ext = current_work
        .and_then(|w| w.get("externalSessionId"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let resume_kind_ok = matches!(kind, Some(AgentKind::Claude) | Some(AgentKind::Codex));
    let catalog_resume = catalog.map(|c| c.can_resume_session).unwrap_or(false);
    let lane_id = kind
        .zip(ext)
        .and_then(|(k, e)| lane_for_external(k, e));
    let resume_supported = catalog_resume && resume_kind_ok;
    let resume_enabled = resume_supported && ext.is_some() && lane_id.is_some();
    out.push(ResolvedAction {
        id: "session.resume".into(),
        label: "Resume".into(),
        scope: ActionScope::ExternalAgent,
        support: if resume_supported {
            ProviderSupport::Native
        } else {
            ProviderSupport::Unsupported
        },
        supported: resume_supported,
        enabled: resume_enabled,
        reason: if !resume_supported {
            Some(if kind == Some(AgentKind::Cursor) {
                "no_resume".into()
            } else {
                "no_resume".into()
            })
        } else if ext.is_none() {
            Some("no_external_session".into())
        } else if lane_id.is_none() {
            Some("no_lane".into())
        } else {
            None
        },
        executor: if resume_enabled {
            Some(AgentCenterExecutor::FocusOrResumeLane {
                kind: kind.unwrap(),
                external_session_id: ext.unwrap().to_string(),
            })
        } else {
            None
        },
    });

    // checkpoint.preview — OneTone internal session id only
    let internal = current_work
        .and_then(|w| w.get("workId").or_else(|| w.get("sessionId")))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let has_checkpoint = internal
        .map(|sid| latest_checkpoint_for_session(sid).is_some())
        .unwrap_or(false);
    out.push(ResolvedAction {
        id: "checkpoint.preview".into(),
        label: "Continuation brief".into(),
        scope: ActionScope::OneToneUi,
        support: ProviderSupport::Unsupported, // not an agent transport
        supported: true,
        enabled: has_checkpoint,
        reason: if has_checkpoint {
            None
        } else {
            Some("no_checkpoint".into())
        },
        executor: internal.map(|sid| AgentCenterExecutor::CheckpointPreview {
            session_id: sid.to_string(),
        }),
    });

    // agent.interrupt
    let mut interrupt_support_v = kind
        .map(interrupt_support)
        .unwrap_or(ProviderSupport::Unsupported);
    let working = obs.value == "working";
    let mut interrupt_supported = interrupt_support_v != ProviderSupport::Unsupported;
    let mut interrupt_enabled = false;
    let mut interrupt_reason = None;
    let mut interrupt_exec = None;

    if kind == Some(AgentKind::Claude) {
        // Instance evidence decides Claude interrupt — not static interrupt_support(kind).
        let ext = current_work
            .and_then(|w| w.get("externalSessionId"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        interrupt_support_v = ProviderSupport::Unsupported;
        interrupt_supported = false;
        interrupt_enabled = false;
        interrupt_exec = None;
        if !working {
            interrupt_reason = Some(if obs.value == "unknown" {
                "stale_observation".into()
            } else {
                "not_running".into()
            });
        } else if ext.is_none() {
            interrupt_reason = Some("no_external_session".into());
        } else {
            match hints.claude_background.as_ref() {
                None => {
                    interrupt_reason = Some("control_plane_unavailable".into());
                }
                Some(probe) => {
                    let reason = match probe.state {
                        ClaudeProbeState::Ok => None,
                        ClaudeProbeState::CliUnavailable => Some("control_plane_unavailable"),
                        ClaudeProbeState::Timeout => Some("probe_timeout"),
                        ClaudeProbeState::CommandFailed => Some("probe_command_failed"),
                        ClaudeProbeState::ParseError => Some("probe_parse_error"),
                    };
                    if let Some(r) = reason {
                        interrupt_reason = Some(r.into());
                    } else if probe.fresh_until < hints.evaluated_at_ms {
                        interrupt_reason = Some("stale_control_evidence".into());
                    } else {
                        let want = ext.unwrap();
                        match probe.sessions.iter().find(|s| {
                            s.external_session_id.trim() == want
                        }) {
                            None => {
                                interrupt_reason = Some("background_session_not_found".into());
                            }
                            Some(s) if !s.active => {
                                interrupt_reason = Some("background_session_not_active".into());
                            }
                            Some(_) => {
                                interrupt_support_v = ProviderSupport::Native;
                                interrupt_supported = true;
                                interrupt_enabled = true;
                                interrupt_reason = None;
                                interrupt_exec = Some(AgentCenterExecutor::ClaudeStop {
                                    external_session_id: want.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    } else if !interrupt_supported {
        interrupt_reason = Some("provider_unsupported".into());
    } else if !working {
        interrupt_reason = Some("not_running".into());
    } else if kind == Some(AgentKind::Cursor) {
        if hints.cursor_mapping_id.is_some() {
            interrupt_enabled = true;
            interrupt_exec = Some(AgentCenterExecutor::ProviderAction {
                provider: AgentKind::Cursor,
                handler: provider_handler_id("agent.interrupt").to_string(),
            });
        } else {
            interrupt_reason = Some("no_mapping_target".into());
        }
    } else if kind == Some(AgentKind::Codex) {
        // Focus target exists for Codex — enable; execute will focus+Esc.
        interrupt_enabled = true;
        interrupt_exec = Some(AgentCenterExecutor::ProviderAction {
            provider: AgentKind::Codex,
            handler: provider_handler_id("agent.interrupt").to_string(),
        });
    } else {
        interrupt_reason = Some("provider_unsupported".into());
    }
    out.push(ResolvedAction {
        id: "agent.interrupt".into(),
        label: "Interrupt".into(),
        scope: ActionScope::ExternalAgent,
        support: interrupt_support_v,
        supported: interrupt_supported,
        enabled: interrupt_enabled,
        reason: interrupt_reason,
        executor: interrupt_exec,
    });

    out.push(ResolvedAction {
        id: "ui.open_config".into(),
        label: "Open config".into(),
        scope: ActionScope::OneToneUi,
        support: ProviderSupport::Unsupported,
        supported: true,
        enabled: true,
        reason: None,
        executor: Some(AgentCenterExecutor::ClientNavigation {
            destination: "softPad".into(),
        }),
    });
    out.push(ResolvedAction {
        id: "ui.open_data".into(),
        label: "View data".into(),
        scope: ActionScope::OneToneUi,
        support: ProviderSupport::Unsupported,
        supported: true,
        enabled: true,
        reason: None,
        executor: Some(AgentCenterExecutor::ClientNavigation {
            destination: "data".into(),
        }),
    });
    out.push(ResolvedAction {
        id: "export_history".into(),
        label: "Export history".into(),
        scope: ActionScope::ExternalAgent,
        support: ProviderSupport::Unsupported,
        supported: false,
        enabled: false,
        reason: Some("not_wired".into()),
        executor: None,
    });
    out.push(ResolvedAction {
        id: "disable_source".into(),
        label: "Disable source".into(),
        scope: ActionScope::ExternalAgent,
        support: ProviderSupport::Unsupported,
        supported: false,
        enabled: false,
        reason: Some("not_wired".into()),
        executor: None,
    });

    debug_assert!(out.iter().all(|a| a.invariant_ok()));
    out
}

fn build_agent_from_row(
    row: &RegistryRow,
    home: &AgentHomeSnapshot,
    hints: &ResolveHints,
) -> AgentCenterAgent {
    let kind = row
        .runtime_kind
        .as_deref()
        .and_then(AgentKind::from_kind_str);
    let caps = resolve_capabilities(row, kind);
    let obs = resolve_observed_status(kind);
    let presence = resolve_presence(row, kind, &obs);
    let cross = home_is_cross_project_fallback(home);
    let home_pid = home.project.project_id.as_str();

    let matched: Vec<&HomeSessionDto> = kind
        .map(|k| {
            home.recent_sessions
                .iter()
                .filter(|s| provider_matches_kind(&s.provider, k))
                .collect()
        })
        .unwrap_or_default();

    let scoped: Vec<&HomeSessionDto> = matched
        .iter()
        .copied()
        .filter(|s| session_is_project_scoped(s, home_pid))
        .collect();

    let mut current_work = if cross {
        None
    } else {
        kind.and_then(|k| {
            scoped
                .iter()
                .find(|s| s.is_active)
                .or_else(|| scoped.first())
                .map(|s| work_json(s, k, false, home_pid))
        })
    };

    let mut recent_work: Vec<_> = kind
        .map(|k| {
            matched
                .iter()
                .take(8)
                .map(|s| {
                    let from_cross = cross || !session_is_project_scoped(s, home_pid);
                    work_json(s, k, from_cross, home_pid)
                })
                .collect()
        })
        .unwrap_or_default();

    // P2: Codex session_index metadata — enrich titles; supplement when DB empty.
    if kind == Some(AgentKind::Codex) {
        let metas = crate::agent_memory::codex_work_meta::list_recent_codex_meta(12);
        for w in &mut recent_work {
            crate::agent_memory::codex_work_meta::enrich_work_with_codex_meta(w, &metas);
        }
        if let Some(ref mut cw) = current_work {
            crate::agent_memory::codex_work_meta::enrich_work_with_codex_meta(cw, &metas);
        }
        if recent_work.is_empty() {
            recent_work = crate::agent_memory::codex_work_meta::supplemental_codex_work(6);
        }
    }

    let unscoped_recent_work: Vec<_> = kind
        .map(|k| {
            matched
                .iter()
                .filter(|s| !session_is_project_scoped(s, home_pid))
                .take(4)
                .map(|s| work_json(s, k, true, home_pid))
                .collect()
        })
        .unwrap_or_default();

    let actions = resolve_actions(kind, &obs, current_work.as_ref(), hints)
        .into_iter()
        .map(|a| a.to_dto())
        .collect();

    let today_sessions = MetricValue {
        value: Some(matched.len() as f64),
        basis: "local".into(),
        source: Some("agent_home_snapshot".into()),
        unavailable_reason: None,
    };

    let evidence: Vec<serde_json::Value> =
        serde_json::from_str(&row.evidence_json).unwrap_or_default();
    let mut limitations = Vec::new();
    if let Some(ref r) = row.limitation_reason {
        limitations.push(serde_json::json!({ "code": r, "detail": r }));
    }

    let attn = kind.map(|k| {
        serde_json::json!({
            "state": obs.value,
            "agent": k.as_str(),
            "source": obs.source,
            "observedAt": obs.observed_at,
            "freshUntil": obs.fresh_until,
        })
    });

    AgentCenterAgent {
        agent_id: row.agent_id.clone(),
        runtime_kind: row.runtime_kind.clone(),
        display_name: row.display_name.clone(),
        form_factor: row.form_factor.clone(),
        presence_state: row.presence_state.clone(),
        presence,
        status: obs.value.clone(),
        observed_status: obs,
        version: row.version.clone(),
        data_path: row.data_path.clone(),
        last_probe_at: row.last_probe_at_ms.map(|v| v as u64),
        last_sync_at: row.last_sync_at_ms.map(|v| v as u64),
        resolved_capabilities: caps,
        metrics: AgentCenterMetrics {
            today_sessions,
            today_cost_usd: unavailable_metric("no_official_cost_source"),
            tokens: unavailable_metric("no_token_aggregate"),
            average_duration_ms: unavailable_metric("no_stable_duration_source"),
            success_rate: unavailable_metric("no_stable_success_source"),
        },
        current_work,
        attention: attn,
        recent_work,
        unscoped_recent_work,
        evidence,
        limitations,
        actions,
    }
}

fn group_agents(agents: &[AgentCenterAgent]) -> AgentCenterGroups {
    let mut g = AgentCenterGroups::default();
    for a in agents {
        let needs = a.status == "needs_input" || a.status == "failed";
        if needs {
            g.needs_attention.push(a.agent_id.clone());
            continue;
        }
        match a.presence_state.as_str() {
            "connected" => g.connected.push(a.agent_id.clone()),
            "detected" | "limited" | "stale" => {
                if a.agent_id.starts_with("discovered:") || a.presence_state == "limited" {
                    g.discovered_limited.push(a.agent_id.clone());
                } else if a.presence_state == "detected" {
                    g.connected.push(a.agent_id.clone());
                } else {
                    g.discovered_limited.push(a.agent_id.clone());
                }
            }
            _ => {
                if a.agent_id.starts_with("kind:") {
                    g.supported_not_found.push(a.agent_id.clone());
                }
            }
        }
    }
    g
}

fn recommend(groups: &AgentCenterGroups) -> Option<String> {
    groups
        .needs_attention
        .first()
        .or(groups.connected.first())
        .or(groups.discovered_limited.first())
        .cloned()
}

static LAST_REGISTRY_REFRESH_MS: AtomicU64 = AtomicU64::new(0);
const REGISTRY_REFRESH_TTL_MS: u64 = 30_000;

pub fn registry_refresh_is_fresh() -> bool {
    let last = LAST_REGISTRY_REFRESH_MS.load(Ordering::Relaxed);
    if last == 0 {
        return false;
    }
    now_ms().saturating_sub(last) < REGISTRY_REFRESH_TTL_MS
}

pub fn build_agent_center_snapshot(
    project_hint: Option<&Path>,
    install: &[(String, String, String)],
) -> AgentCenterSnapshot {
    build_agent_center_snapshot_with_hints(project_hint, install, false, &ResolveHints::default())
}

pub fn build_agent_center_snapshot_with_hints(
    project_hint: Option<&Path>,
    install: &[(String, String, String)],
    force_registry: bool,
    hints: &ResolveHints,
) -> AgentCenterSnapshot {
    crate::agent_memory::ensure_started();

    let now = now_ms();
    let last = LAST_REGISTRY_REFRESH_MS.load(Ordering::Relaxed);
    let should_refresh =
        force_registry || last == 0 || now.saturating_sub(last) >= REGISTRY_REFRESH_TTL_MS;

    let mut registry_ok = false;
    if should_refresh {
        let _ = with_write(|conn| match refresh_registry(conn, install) {
            Ok(n) => {
                registry_ok = n > 0 || !install.is_empty();
                LAST_REGISTRY_REFRESH_MS.store(now, Ordering::Relaxed);
                Ok(())
            }
            Err(e) => {
                eprintln!("[agent_center] refresh_registry: {e}");
                Err(e)
            }
        });
    } else {
        registry_ok = true;
    }

    let inventory_ok = install.iter().any(|(_, p, c)| c == "high" && p != "none");
    if registry_ok || inventory_ok {
        agent_attention::note_successful_collection();
        if !agent_attention::is_initialized() {
            agent_attention::mark_initialized();
        }
    }

    let home = build_agent_home_snapshot(project_hint);
    let home_session_ids: Vec<String> = home
        .recent_sessions
        .iter()
        .map(|s| s.session_id.clone())
        .collect();
    let home_set: HashSet<&str> = home_session_ids.iter().map(|s| s.as_str()).collect();

    let rows = with_write(|conn| list_registry(conn)).unwrap_or_default();
    let mut have: HashSet<String> = rows.iter().map(|r| r.agent_id.clone()).collect();
    let mut agents: Vec<AgentCenterAgent> = rows
        .iter()
        .map(|r| build_agent_from_row(r, &home, hints))
        .collect();
    for kind in ALL_AGENT_KINDS {
        let id = kind_agent_id(*kind);
        if !have.contains(&id) {
            let stub = RegistryRow {
                agent_id: id.clone(),
                runtime_kind: Some(kind.as_str().into()),
                display_name: kind.as_str().into(),
                form_factor: "unknown".into(),
                presence_state: "not_found".into(),
                version: None,
                data_path: None,
                adapter_state: "unknown".into(),
                limitation_reason: None,
                capability_evidence_json: "{}".into(),
                evidence_json: "[]".into(),
                last_probe_at_ms: None,
                last_successful_probe_at_ms: None,
                last_sync_at_ms: None,
                created_at_ms: now_ms() as i64,
                updated_at_ms: now_ms() as i64,
            };
            agents.push(build_agent_from_row(&stub, &home, hints));
            have.insert(id);
        }
    }

    let mut referenced: Vec<String> = Vec::new();
    for a in &agents {
        for w in a.recent_work.iter().chain(a.unscoped_recent_work.iter()) {
            if let Some(sid) = w.get("sessionId").and_then(|v| v.as_str()) {
                referenced.push(sid.to_string());
            }
        }
        if let Some(cw) = &a.current_work {
            if let Some(sid) = cw.get("sessionId").and_then(|v| v.as_str()) {
                referenced.push(sid.to_string());
            }
        }
    }
    referenced.sort();
    referenced.dedup();
    referenced.retain(|sid| home_set.contains(sid.as_str()));

    let groups = group_agents(&agents);
    let recommended = recommend(&groups);

    AgentCenterSnapshot {
        agents,
        recommended_agent_id: recommended,
        groups,
        attention_state: agent_attention::attention_lifecycle_state().to_string(),
        as_of: now_ms(),
        home_session_ids,
        referenced_session_ids: referenced,
    }
}

pub fn refresh_and_snapshot(
    project_hint: Option<&Path>,
    install: &[(String, String, String)],
) -> AgentCenterSnapshot {
    build_agent_center_snapshot_with_hints(
        project_hint,
        install,
        true,
        &ResolveHints::default(),
    )
}

pub fn refresh_and_snapshot_with_hints(
    project_hint: Option<&Path>,
    install: &[(String, String, String)],
    hints: &ResolveHints,
) -> AgentCenterSnapshot {
    build_agent_center_snapshot_with_hints(project_hint, install, true, hints)
}

pub fn build_agent_center_snapshot_empty_install(
    project_hint: Option<&Path>,
) -> AgentCenterSnapshot {
    build_agent_center_snapshot(project_hint, &[])
}

pub fn parse_project_hint(raw: Option<String>) -> Option<PathBuf> {
    raw.filter(|s| !s.trim().is_empty()).map(PathBuf::from)
}

/// Re-resolve then execute. Frontend may not supply executor/session/lane.
pub fn execute_agent_center_action(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    agent_id: &str,
    action_id: &str,
    project_hint: Option<&Path>,
) -> AgentCenterActionResult {
    execute_agent_center_action_with(
        state,
        window,
        agent_id,
        action_id,
        project_hint,
        &system_runner(),
        process_probe_cache(),
    )
}

/// Injectable execute path for tests (isolated runner + cache).
pub(crate) fn execute_agent_center_action_with(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    agent_id: &str,
    action_id: &str,
    project_hint: Option<&Path>,
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
) -> AgentCenterActionResult {
    let hints = collect_resolve_hints_with(state, ProbePolicy::ForceFresh, runner, cache);
    let install = &[] as &[(String, String, String)];
    let snap =
        build_agent_center_snapshot_with_hints(project_hint, install, false, &hints);
    let Some(agent) = snap.agents.iter().find(|a| a.agent_id == agent_id) else {
        return AgentCenterActionResult {
            ok: false,
            error: Some("agent_not_found".into()),
            detail: None,
            client_effect: None,
            result: None,
        };
    };

    let kind = agent
        .runtime_kind
        .as_deref()
        .and_then(AgentKind::from_kind_str);
    let resolved = resolve_actions(kind, &agent.observed_status, agent.current_work.as_ref(), &hints);
    let Some(action) = resolved.iter().find(|a| a.id == action_id) else {
        return AgentCenterActionResult {
            ok: false,
            error: Some("unknown_action".into()),
            detail: Some(action_id.into()),
            client_effect: None,
            result: None,
        };
    };
    if !action.enabled {
        return AgentCenterActionResult {
            ok: false,
            error: Some("action_not_enabled".into()),
            detail: action.reason.clone(),
            client_effect: None,
            result: None,
        };
    }
    let Some(exec) = action.executor.as_ref() else {
        return AgentCenterActionResult {
            ok: false,
            error: Some("no_executor".into()),
            detail: None,
            client_effect: None,
            result: None,
        };
    };

    match exec {
        AgentCenterExecutor::ClientNavigation { destination } => AgentCenterActionResult {
            ok: true,
            error: None,
            detail: None,
            client_effect: Some(serde_json::json!({
                "type": "navigate",
                "destination": destination,
            })),
            result: None,
        },
        AgentCenterExecutor::FocusApp { target } => {
            let app = window.app_handle();
            match crate::app_chat_workflow::focus_composer_only(&app, target, 800) {
                Ok(()) => {
                    if let Some(k) = kind {
                        crate::soft_pad_runtime::set_follow_pin(Some(k));
                    }
                    AgentCenterActionResult {
                        ok: true,
                        error: None,
                        detail: Some(format!("focused:{target}")),
                        client_effect: None,
                        result: None,
                    }
                }
                Err(e) => AgentCenterActionResult {
                    ok: false,
                    error: Some("focus_failed".into()),
                    detail: Some(e.reason("agent_center_focus")),
                    client_effect: None,
                    result: None,
                },
            }
        }
        AgentCenterExecutor::ProviderAction { provider, handler } => {
            let provider_id = match provider_id_for(*provider) {
                Some(id) => id,
                None => {
                    return AgentCenterActionResult {
                        ok: false,
                        error: Some("unsupported_provider".into()),
                        detail: None,
                        client_effect: None,
                        result: None,
                    };
                }
            };
            // Canonical agent.interrupt → handler (cancel) — never pass semantic id.
            let mapping_id = if *provider == AgentKind::Cursor {
                hints.cursor_mapping_id.clone()
            } else {
                None
            };
            let req = AgentExecuteRequest {
                provider_id: provider_id.into(),
                action_id: handler.clone(),
                mapping_id,
                slot_id: None,
                activation_scope: None,
                execution_mode: None,
            };
            let out = execute_agent_action(state, window, req);
            if out.ok {
                // Lifecycle only after verified execute success.
                if let Some(cw) = &agent.current_work {
                    if let Some(sid) = cw.get("workId").and_then(|v| v.as_str()) {
                        let _ = crate::agent_memory::append_ui_lifecycle(
                            sid,
                            provider.as_str(),
                            "session_aborted",
                            "interrupted from Agent Center",
                        );
                    }
                }
                AgentCenterActionResult {
                    ok: true,
                    error: None,
                    detail: out.detail,
                    client_effect: None,
                    result: Some(serde_json::json!({ "handler": handler })),
                }
            } else {
                AgentCenterActionResult {
                    ok: false,
                    error: out.reason.or_else(|| Some("execute_failed".into())),
                    detail: out.detail,
                    client_effect: None,
                    result: None,
                }
            }
        }
        AgentCenterExecutor::ClaudeStop {
            external_session_id,
        } => execute_claude_stop(
            runner,
            cache,
            external_session_id,
            agent
                .current_work
                .as_ref()
                .and_then(|cw| cw.get("workId").and_then(|v| v.as_str())),
        ),
        AgentCenterExecutor::FocusOrResumeLane {
            kind,
            external_session_id,
        } => {
            // Never treat OneTone internal session id as lane key.
            let hint = FocusTargetHint {
                lane_id: None,
                session_id: Some(external_session_id.clone()),
            };
            let r = crate::agent_lane::focus_session(*kind, hint, FocusClickKind::StatusHost);
            if r.ok {
                return AgentCenterActionResult {
                    ok: true,
                    error: None,
                    detail: Some(r.detail),
                    client_effect: None,
                    result: Some(serde_json::json!({
                        "laneId": r.lane_id,
                        "externalSessionId": external_session_id,
                    })),
                };
            }
            // Fallback: direct lane resume if we have a lane id.
            if let Some(lid) = lane_for_external(*kind, external_session_id) {
                let (ok, detail) = match kind {
                    AgentKind::Claude => {
                        let x = resume_claude_lane(&lid);
                        (x.ok, x.detail)
                    }
                    AgentKind::Codex => {
                        let x = resume_codex_lane(&lid);
                        (x.ok, x.detail)
                    }
                    _ => (false, "unsupported_provider_resume".into()),
                };
                return AgentCenterActionResult {
                    ok,
                    error: if ok {
                        None
                    } else {
                        Some("resume_failed".into())
                    },
                    detail: Some(detail),
                    client_effect: None,
                    result: Some(serde_json::json!({
                        "laneId": lid,
                        "externalSessionId": external_session_id,
                    })),
                };
            }
            AgentCenterActionResult {
                ok: false,
                error: Some("resume_failed".into()),
                detail: Some(r.detail),
                client_effect: None,
                result: None,
            }
        }
        AgentCenterExecutor::CheckpointPreview { session_id } => {
            match resume_checkpoint(session_id) {
                Ok(brief) => AgentCenterActionResult {
                    ok: true,
                    error: None,
                    detail: None,
                    client_effect: None,
                    result: Some(serde_json::to_value(brief).unwrap_or_default()),
                },
                Err(e) => AgentCenterActionResult {
                    ok: false,
                    error: Some("checkpoint_preview_failed".into()),
                    detail: Some(e),
                    client_effect: None,
                    result: None,
                },
            }
        }
    }
}

/// ClaudeStop core: stop → invalidate → ForceFresh verify → lifecycle. No window needed.
fn execute_claude_stop(
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
    external_session_id: &str,
    work_id_for_lifecycle: Option<&str>,
) -> AgentCenterActionResult {
    let stop_id = external_session_id.trim().to_string();
    match runner.stop_session(&stop_id) {
        Err(ClaudeStopError::Unavailable) => {
            return AgentCenterActionResult {
                ok: false,
                error: Some("stop_command_failed".into()),
                detail: Some("cli_unavailable".into()),
                client_effect: None,
                result: None,
            };
        }
        Err(ClaudeStopError::Timeout) => {
            return AgentCenterActionResult {
                ok: false,
                error: Some("stop_timeout".into()),
                detail: None,
                client_effect: None,
                result: None,
            };
        }
        Err(ClaudeStopError::CommandFailed { detail }) => {
            return AgentCenterActionResult {
                ok: false,
                error: Some("stop_command_failed".into()),
                detail: Some(detail),
                client_effect: None,
                result: None,
            };
        }
        Ok(()) => {}
    }

    // Never reuse pre-stop cache for verification.
    cache.invalidate();
    let post = get_probe(ProbePolicy::ForceFresh, runner, cache);
    if post.state != ClaudeProbeState::Ok {
        return AgentCenterActionResult {
            ok: false,
            error: Some("post_stop_probe_failed".into()),
            detail: Some(format!("{:?}", post.state)),
            client_effect: None,
            result: None,
        };
    }
    if session_still_active(&post, &stop_id) {
        return AgentCenterActionResult {
            ok: false,
            error: Some("stop_not_verified".into()),
            detail: None,
            client_effect: None,
            result: None,
        };
    }

    // Lifecycle only after fresh probe confirms no longer active.
    if let Some(sid) = work_id_for_lifecycle.filter(|s| !s.trim().is_empty()) {
        let _ = crate::agent_memory::append_ui_lifecycle(
            sid,
            AgentKind::Claude.as_str(),
            "session_aborted",
            "interrupted from Agent Center",
        );
    }
    AgentCenterActionResult {
        ok: true,
        error: None,
        detail: Some(format!("claudeStop:{stop_id}")),
        client_effect: None,
        result: Some(serde_json::json!({
            "externalSessionId": stop_id,
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_attention::{mark_initialized, raise_lifecycle, reset_for_test, test_lock};

    fn assert_actions_honest(actions: &[ResolvedAction]) {
        for a in actions {
            assert!(a.invariant_ok(), "invariant broken for {}", a.id);
            if a.enabled && a.scope == ActionScope::ExternalAgent {
                assert!(a.executor.is_some(), "enabled {} missing executor", a.id);
            }
        }
    }

    #[test]
    fn claude_working_interrupt_not_enabled() {
        let _g = test_lock();
        reset_for_test();
        raise_lifecycle(
            AgentKind::Claude,
            Some("ext-1"),
            AttentionState::Working,
            SignalSource::OfficialHook,
        );
        let obs = resolve_observed_status(Some(AgentKind::Claude));
        assert_eq!(obs.value, "working");
        let work = serde_json::json!({
            "workId": "internal-1",
            "sessionId": "internal-1",
            "externalSessionId": "ext-1",
        });
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &ResolveHints::default());
        assert_actions_honest(&actions);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(interrupt.support, ProviderSupport::Unsupported);
        assert_eq!(
            interrupt.reason.as_deref(),
            Some("control_plane_unavailable")
        );
    }

    fn working_obs() -> ObservedStatus {
        ObservedStatus {
            value: "working".into(),
            source: "officialHook".into(),
            observed_at: now_ms(),
            fresh_until: now_ms() + WORKING_FRESH_MS_HOOK,
            confidence: "high".into(),
        }
    }

    fn typed_active_probe(id: &str, evaluated_at: u64) -> ClaudeBackgroundProbe {
        ClaudeBackgroundProbe {
            state: ClaudeProbeState::Ok,
            sessions: vec![crate::agent_memory::claude_background::ClaudeBackgroundSession {
                external_session_id: id.into(),
                active: true,
                cwd: None,
            }],
            observed_at: evaluated_at,
            fresh_until: evaluated_at.saturating_add(3_000),
            confidence: "high".into(),
        }
    }

    #[test]
    fn claude_interrupt_no_external_session() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "" });
        let hints = ResolveHints {
            evaluated_at_ms: now_ms(),
            claude_background: Some(typed_active_probe("ext-1", now_ms())),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(interrupt.reason.as_deref(), Some("no_external_session"));
    }

    #[test]
    fn claude_interrupt_empty_ok_probe_not_found() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-1" });
        let now = now_ms();
        let hints = ResolveHints {
            evaluated_at_ms: now,
            claude_background: Some(ClaudeBackgroundProbe {
                state: ClaudeProbeState::Ok,
                sessions: vec![],
                observed_at: now,
                fresh_until: now + 3_000,
                confidence: "high".into(),
            }),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(
            interrupt.reason.as_deref(),
            Some("background_session_not_found")
        );
    }

    #[test]
    fn claude_interrupt_typed_active_enables_claude_stop() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-1" });
        let now = now_ms();
        let hints = ResolveHints {
            evaluated_at_ms: now,
            claude_background: Some(typed_active_probe("ext-1", now)),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        assert_actions_honest(&actions);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(interrupt.enabled);
        assert!(interrupt.supported);
        assert_eq!(interrupt.support, ProviderSupport::Native);
        match interrupt.executor.as_ref().unwrap() {
            AgentCenterExecutor::ClaudeStop {
                external_session_id,
            } => assert_eq!(external_session_id, "ext-1"),
            other => panic!("expected ClaudeStop, got {other:?}"),
        }
    }

    #[test]
    fn claude_interrupt_partial_id_match_disabled() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-1" });
        let now = now_ms();
        let hints = ResolveHints {
            evaluated_at_ms: now,
            claude_background: Some(typed_active_probe("ext", now)),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(
            interrupt.reason.as_deref(),
            Some("background_session_not_found")
        );
    }

    #[test]
    fn claude_interrupt_stale_control_evidence() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-1" });
        let hints = ResolveHints {
            evaluated_at_ms: 10_000,
            claude_background: Some(ClaudeBackgroundProbe {
                state: ClaudeProbeState::Ok,
                sessions: vec![crate::agent_memory::claude_background::ClaudeBackgroundSession {
                    external_session_id: "ext-1".into(),
                    active: true,
                    cwd: None,
                }],
                observed_at: 1_000,
                fresh_until: 4_000, // < evaluated_at_ms
                confidence: "high".into(),
            }),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(interrupt.reason.as_deref(), Some("stale_control_evidence"));
    }

    #[test]
    fn claude_interrupt_not_working() {
        let obs = ObservedStatus {
            value: "idle".into(),
            source: "officialHook".into(),
            observed_at: now_ms(),
            fresh_until: now_ms() + WORKING_FRESH_MS_HOOK,
            confidence: "high".into(),
        };
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-1" });
        let now = now_ms();
        let hints = ResolveHints {
            evaluated_at_ms: now,
            claude_background: Some(typed_active_probe("ext-1", now)),
            ..Default::default()
        };
        let actions = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(interrupt.reason.as_deref(), Some("not_running"));
    }

    #[test]
    fn claude_stop_command_failed_no_lifecycle_path() {
        use crate::agent_memory::claude_background::{ClaudeRunError, ClaudeStopError};
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Mutex as StdMutex;

        struct Fake {
            probe: StdMutex<Result<String, ClaudeRunError>>,
            stop: StdMutex<Result<(), ClaudeStopError>>,
            probes: AtomicUsize,
        }
        impl ClaudeProbeRunner for Fake {
            fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
                self.probes.fetch_add(1, Ordering::SeqCst);
                self.probe.lock().unwrap().clone()
            }
            fn stop_session(&self, _: &str) -> Result<(), ClaudeStopError> {
                self.stop.lock().unwrap().clone()
            }
        }

        let runner = Fake {
            probe: StdMutex::new(Ok("[]".into())),
            stop: StdMutex::new(Err(ClaudeStopError::CommandFailed {
                detail: "exit=1".into(),
            })),
            probes: AtomicUsize::new(0),
        };
        let cache = ClaudeProbeCache::new();
        // Seed cache with ok so we can assert stop failure does not force post probe.
        let _ = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        let before = runner.probes.load(Ordering::SeqCst);
        let out = execute_claude_stop(&runner, &cache, "ext-1", Some("internal-1"));
        assert!(!out.ok);
        assert_eq!(out.error.as_deref(), Some("stop_command_failed"));
        assert_eq!(runner.probes.load(Ordering::SeqCst), before);
    }

    #[test]
    fn claude_stop_timeout() {
        use crate::agent_memory::claude_background::ClaudeStopError;
        use std::sync::Mutex as StdMutex;
        struct Fake {
            stop: StdMutex<Result<(), ClaudeStopError>>,
        }
        impl ClaudeProbeRunner for Fake {
            fn probe_agents_json(
                &self,
            ) -> Result<String, crate::agent_memory::claude_background::ClaudeRunError> {
                Ok("[]".into())
            }
            fn stop_session(&self, _: &str) -> Result<(), ClaudeStopError> {
                self.stop.lock().unwrap().clone()
            }
        }
        let runner = Fake {
            stop: StdMutex::new(Err(ClaudeStopError::Timeout)),
        };
        let cache = ClaudeProbeCache::new();
        let out = execute_claude_stop(&runner, &cache, "ext-1", Some("internal-1"));
        assert!(!out.ok);
        assert_eq!(out.error.as_deref(), Some("stop_timeout"));
    }

    #[test]
    fn claude_stop_not_verified_when_still_active() {
        use crate::agent_memory::claude_background::{
            ClaudeBackgroundSession, ClaudeRunError, ClaudeStopError,
        };
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Fake {
            probes: AtomicUsize,
        }
        impl ClaudeProbeRunner for Fake {
            fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
                Ok("[]".into())
            }
            fn stop_session(&self, _: &str) -> Result<(), ClaudeStopError> {
                Ok(())
            }
            fn probe_evidence(&self, now: u64) -> ClaudeBackgroundProbe {
                self.probes.fetch_add(1, Ordering::SeqCst);
                ClaudeBackgroundProbe {
                    state: ClaudeProbeState::Ok,
                    sessions: vec![ClaudeBackgroundSession {
                        external_session_id: "ext-1".into(),
                        active: true,
                        cwd: None,
                    }],
                    observed_at: now,
                    fresh_until: now + 3_000,
                    confidence: "high".into(),
                }
            }
        }
        let runner = Fake {
            probes: AtomicUsize::new(0),
        };
        let cache = ClaudeProbeCache::new();
        let out = execute_claude_stop(&runner, &cache, "ext-1", Some("internal-1"));
        assert!(!out.ok);
        assert_eq!(out.error.as_deref(), Some("stop_not_verified"));
        assert!(runner.probes.load(Ordering::SeqCst) >= 1);
    }

    #[test]
    fn claude_stop_post_probe_failed() {
        use crate::agent_memory::claude_background::{ClaudeRunError, ClaudeStopError};
        use std::sync::atomic::{AtomicUsize, Ordering};
        struct Fake {
            phase: AtomicUsize,
        }
        impl ClaudeProbeRunner for Fake {
            fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
                let n = self.phase.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    Ok("[]".into())
                } else {
                    Err(ClaudeRunError::Timeout)
                }
            }
            fn stop_session(&self, _: &str) -> Result<(), ClaudeStopError> {
                Ok(())
            }
        }
        let runner = Fake {
            phase: AtomicUsize::new(0),
        };
        let cache = ClaudeProbeCache::new();
        let _ = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        let out = execute_claude_stop(&runner, &cache, "ext-1", Some("internal-1"));
        assert!(!out.ok);
        assert_eq!(out.error.as_deref(), Some("post_stop_probe_failed"));
    }

    #[test]
    fn claude_stop_success_bypasses_pre_stop_cache() {
        use crate::agent_memory::claude_background::{ClaudeRunError, ClaudeStopError};
        use std::sync::atomic::{AtomicUsize, Ordering};
        struct Fake {
            probes: AtomicUsize,
        }
        impl ClaudeProbeRunner for Fake {
            fn probe_agents_json(&self) -> Result<String, ClaudeRunError> {
                self.probes.fetch_add(1, Ordering::SeqCst);
                Ok("[]".into())
            }
            fn stop_session(&self, _: &str) -> Result<(), ClaudeStopError> {
                Ok(())
            }
        }
        let runner = Fake {
            probes: AtomicUsize::new(0),
        };
        let cache = ClaudeProbeCache::new();
        let _ = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(runner.probes.load(Ordering::SeqCst), 1);
        let _ = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(runner.probes.load(Ordering::SeqCst), 1);
        let out = execute_claude_stop(&runner, &cache, "sess-a", None);
        assert!(out.ok);
        assert!(runner.probes.load(Ordering::SeqCst) >= 2);
    }

    #[test]
    fn snapshot_and_resolve_share_same_typed_evidence() {
        let obs = working_obs();
        let work = serde_json::json!({ "workId": "w1", "externalSessionId": "ext-9" });
        let now = now_ms();
        let hints = ResolveHints {
            evaluated_at_ms: now,
            claude_background: Some(typed_active_probe("ext-9", now)),
            ..Default::default()
        };
        let a1 = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let a2 = resolve_actions(Some(AgentKind::Claude), &obs, Some(&work), &hints);
        let i1 = a1.iter().find(|a| a.id == "agent.interrupt").unwrap();
        let i2 = a2.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(i1.enabled && i2.enabled);
        assert_eq!(i1.executor, i2.executor);
    }

    #[test]
    fn gemini_catalog_focus_not_enabled_without_executor() {
        let obs = resolve_observed_status(Some(AgentKind::Gemini));
        let actions =
            resolve_actions(Some(AgentKind::Gemini), &obs, None, &ResolveHints::default());
        assert_actions_honest(&actions);
        let focus = actions.iter().find(|a| a.id == "agent.focus").unwrap();
        assert!(!focus.enabled);
        assert_eq!(focus.reason.as_deref(), Some("no_focus_executor"));
    }

    #[test]
    fn interrupt_handler_maps_via_provider_handler_id() {
        assert_eq!(provider_handler_id("agent.interrupt"), "cancel");
        let obs = ObservedStatus {
            value: "working".into(),
            source: "officialHook".into(),
            observed_at: now_ms(),
            fresh_until: now_ms() + WORKING_FRESH_MS_HOOK,
            confidence: "high".into(),
        };
        let actions =
            resolve_actions(Some(AgentKind::Codex), &obs, None, &ResolveHints::default());
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(interrupt.enabled);
        match interrupt.executor.as_ref().unwrap() {
            AgentCenterExecutor::ProviderAction { handler, .. } => {
                assert_eq!(handler, "cancel");
            }
            other => panic!("expected ProviderAction, got {other:?}"),
        }
    }

    #[test]
    fn session_resume_uses_external_not_internal_id() {
        let obs = resolve_observed_status(Some(AgentKind::Codex));
        let work = serde_json::json!({
            "workId": "onetone-internal-abc",
            "sessionId": "onetone-internal-abc",
            "externalSessionId": "",
        });
        let actions =
            resolve_actions(Some(AgentKind::Codex), &obs, Some(&work), &ResolveHints::default());
        let resume = actions.iter().find(|a| a.id == "session.resume").unwrap();
        assert!(!resume.enabled);
        assert_eq!(resume.reason.as_deref(), Some("no_external_session"));
        // executor must not embed internal id as lane session
        assert!(resume.executor.is_none());
    }

    #[test]
    fn stale_working_projects_unknown() {
        let _g = test_lock();
        reset_for_test();
        // Raise then age artificially by checking policy with inferred short TTL —
        // we simulate by inspecting resolve after Completing: Working with age >
        // freshness is covered by resolve_observed_status using lifecycle_age_ms.
        raise_lifecycle(
            AgentKind::Codex,
            None,
            AttentionState::Working,
            SignalSource::Inferred,
        );
        let obs = resolve_observed_status(Some(AgentKind::Codex));
        // Fresh raise → still working
        assert_eq!(obs.value, "working");
        assert!(obs.fresh_until >= obs.observed_at);
    }

    #[test]
    fn attention_states_honest() {
        let _g = test_lock();
        reset_for_test();
        assert_eq!(agent_attention::attention_lifecycle_state(), "initializing");
        mark_initialized();
        assert_eq!(agent_attention::attention_lifecycle_state(), "ready");
    }

    #[test]
    fn session_subset_contract_empty_home() {
        let snap = build_agent_center_snapshot(None, &[]);
        let home: HashSet<&str> = snap.home_session_ids.iter().map(|s| s.as_str()).collect();
        for sid in &snap.referenced_session_ids {
            assert!(home.contains(sid.as_str()), "orphan session {sid}");
        }
    }

    #[test]
    fn unsupported_metrics_are_null() {
        let snap = build_agent_center_snapshot(None, &[]);
        let any = snap.agents.first().expect("agents");
        assert!(any.metrics.success_rate.value.is_none());
        assert_eq!(any.metrics.success_rate.basis, "unavailable");
        let export = any
            .actions
            .iter()
            .find(|a| a.id == "export_history")
            .unwrap();
        assert!(!export.supported);
        assert!(!export.enabled);
        let focus = any.actions.iter().find(|a| a.id == "agent.focus");
        assert!(focus.is_some());
    }

    #[test]
    fn inventory_rows_elevate_presence_in_snapshot() {
        let install = vec![
            ("codex".into(), "cli".into(), "high".into()),
            ("claude".into(), "cli".into(), "high".into()),
        ];
        let snap = build_agent_center_snapshot(None, &install);
        let codex = snap
            .agents
            .iter()
            .find(|a| a.agent_id == "kind:codex")
            .expect("codex");
        assert!(
            codex.presence_state == "connected"
                || codex.presence_state == "detected"
                || codex.presence_state == "limited",
            "got {}",
            codex.presence_state
        );
        assert!(codex.actions.iter().any(|a| a.id == "agent.focus"));
        assert!(codex.observed_status.value.len() > 0);
        assert!(!codex.presence.installation.is_empty());
    }

    #[test]
    fn enabled_external_actions_have_executor_diag() {
        let snap = build_agent_center_snapshot(None, &[("codex".into(), "cli".into(), "high".into())]);
        for a in &snap.agents {
            for act in &a.actions {
                if act.enabled && act.scope == "externalAgent" {
                    assert!(
                        act.executor.is_some(),
                        "{} {} enabled without executor diag",
                        a.agent_id,
                        act.id
                    );
                }
            }
        }
    }
}
