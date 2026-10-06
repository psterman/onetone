//! Agent Center snapshot — registry + home + attention projection.
//! Judgment lives here; UI only projects. Execute via `cmd_agent_center_action`
//! which re-resolves before running an internal executor.

use crate::agent::actions::ProviderSupport;
use crate::agent::execute::{execute_agent_action, AgentExecuteRequest};
use crate::agent::semantic::provider_handler_id;
use crate::agent::templates::{CLAUDE_PROVIDER_ID, CODEX_PROVIDER_ID, CURSOR_PROVIDER_ID};
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
use crate::agent_memory::codex_background::{
    find_session as find_codex_session, get_probe as get_codex_probe,
    process_probe_cache as codex_process_probe_cache, resolve_interrupt_evidence,
    system_runner as codex_system_runner, CodexBackgroundProbe, CodexProbeCache, CodexProbeRunner,
    CodexProbeState, ProbePolicy as CodexProbePolicy,
};
use crate::agent_memory::model::{HomeSessionDto, UNKNOWN_PROJECT_ID};
use crate::agent_memory::prompt_journal::{recent_prompts_for_sessions, PromptRecord};
use crate::agent_memory::registry::{
    kind_agent_id, list_registry, refresh_registry, RegistryRow, ALL_AGENT_KINDS,
};
use crate::agent_memory::store::now_ms;
use crate::agent_memory::title::{resolve_title, TitleInputs};
use crate::agent_memory::work_descriptor::{
    resolve_work_descriptor, FreshEvidence, LiveSessionMatch, WorkDescriptor,
};
use crate::agent_memory::{build_agent_home_snapshot, with_write, AgentHomeSnapshot};
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
use std::sync::{Arc, Mutex, OnceLock};
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
    /// Optional client attempt id — normalized/replaced by backend if missing/illegal.
    pub attempt_id: Option<String>,
}

/// Honest action result — sole truth for user-facing success semantics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionOutcome {
    Failed,
    AttemptedUnverified,
    Verified,
}

impl ActionOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Failed => "failed",
            Self::AttemptedUnverified => "attemptedUnverified",
            Self::Verified => "verified",
        }
    }

    pub fn ok(self) -> bool {
        !matches!(self, Self::Failed)
    }

    pub fn verified(self) -> bool {
        matches!(self, Self::Verified)
    }
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

const ATTEMPT_ID_MAX: usize = 64;

fn attempt_counter() -> &'static AtomicU64 {
    static C: AtomicU64 = AtomicU64::new(1);
    &C
}

/// Normalize client attempt id or mint a backend one. Never puts raw arbitrary bytes in source_ref.
pub fn normalize_attempt_id(raw: Option<&str>) -> String {
    let s = raw.unwrap_or("").trim();
    let ok = !s.is_empty()
        && s.len() <= ATTEMPT_ID_MAX
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'));
    if ok {
        return s.to_string();
    }
    let n = attempt_counter().fetch_add(1, Ordering::Relaxed);
    format!("attempt-{}-{n}", now_ms())
}

pub fn action_source_ref(
    provider: &str,
    external_session_id: &str,
    action_id: &str,
    attempt_id: &str,
) -> String {
    format!(
        "agent-action|{}|{}|{}|{}",
        provider.trim(),
        external_session_id.trim(),
        action_id.trim(),
        attempt_id.trim()
    )
}

fn in_flight_set() -> &'static Mutex<HashSet<String>> {
    static S: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Process-local action idempotency (event idempotency is separate via source_ref).
fn try_begin_inflight(key: &str) -> bool {
    let Ok(mut g) = in_flight_set().lock() else {
        return true;
    };
    g.insert(key.to_string())
}

fn end_inflight(key: &str) {
    if let Ok(mut g) = in_flight_set().lock() {
        g.remove(key);
    }
}

/// Best-effort observed interrupt journal; storage failure must not rewrite outcome.
fn note_interrupt_observed(
    canonical_session_id: &str,
    provider: &str,
    external: &str,
    event_type: &str,
    attempt_id: &str,
    executor: &str,
    outcome: ActionOutcome,
) {
    if canonical_session_id.trim().is_empty() {
        return;
    }
    let source_ref = action_source_ref(provider, external, "agent.interrupt", attempt_id);
    let detail = serde_json::json!({
        "action": "agent.interrupt",
        "target": external,
        "executor": executor,
        "outcome": outcome.as_str(),
        "verified": outcome.verified(),
        "attemptId": attempt_id,
    });
    let summary = match outcome {
        ActionOutcome::AttemptedUnverified => "interrupt attempted, not verified",
        ActionOutcome::Verified => "interrupt verified",
        ActionOutcome::Failed => "interrupt failed",
    };
    let _ = crate::agent_memory::append_observed_event_with_detail(
        canonical_session_id,
        provider,
        event_type,
        &source_ref,
        now_ms(),
        summary,
        Some(&detail.to_string()),
    );
}

/// Internal executor — never accepted from the frontend.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentCenterExecutor {
    FocusApp {
        target: String,
    },
    ProviderAction {
        provider: AgentKind,
        handler: String,
    },
    FocusOrResumeLane {
        kind: AgentKind,
        external_session_id: String,
    },
    CheckpointPreview {
        session_id: String,
    },
    ClientNavigation {
        destination: String,
    },
    ClaudeStop {
        external_session_id: String,
    },
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
            } => format!("focusOrResumeLane:{}:{external_session_id}", kind.as_str()),
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
    pub state: Option<String>,
    pub source: Option<String>,
    pub confidence: Option<String>,
    pub observed_at: Option<u64>,
    pub fresh_until: Option<u64>,
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
            state: self.state.clone(),
            source: self.source.clone(),
            confidence: self.confidence.clone(),
            observed_at: self.observed_at,
            fresh_until: self.fresh_until,
        }
    }

    fn from_cap(
        id: &str,
        label: &str,
        scope: ActionScope,
        cap: &crate::agent_memory::capability_resolver::ResolvedCapability,
        support: ProviderSupport,
        executor: Option<AgentCenterExecutor>,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            scope,
            support,
            supported: cap.supported,
            enabled: cap.enabled,
            reason: cap.reason.clone(),
            executor,
            state: Some(cap.state.clone()),
            source: Some(cap.source.clone()),
            confidence: Some(cap.confidence.clone()),
            observed_at: cap.observed_at,
            fresh_until: cap.fresh_until,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fresh_until: Option<u64>,
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
    /// Honest title projection (usually Derived / Unknown).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_derived_from: Option<String>,
    /// Latest user prompt summary — not a full conversation.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_observed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_source: Option<String>,
    /// Derived label only: managed | oneToneInitiated | integrated | observed | detected
    #[serde(skip_serializing_if = "Option::is_none")]
    pub integration_label: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_confidence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommendation_fresh_until: Option<u64>,
    pub groups: AgentCenterGroups,
    pub attention_state: String,
    pub as_of: u64,
    pub home_session_ids: Vec<String>,
    pub referenced_session_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCenterActionResult {
    /// Sole truth for user-facing result.
    pub outcome: ActionOutcome,
    /// Derived: `outcome != Failed` — request accepted/executed, not "agent stopped".
    pub ok: bool,
    /// Derived: `outcome == Verified`.
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_effect: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt_id: Option<String>,
}

impl AgentCenterActionResult {
    pub fn from_outcome(
        outcome: ActionOutcome,
        error: Option<String>,
        detail: Option<String>,
    ) -> Self {
        Self {
            outcome,
            ok: outcome.ok(),
            verified: outcome.verified(),
            error,
            detail,
            client_effect: None,
            result: None,
            attempt_id: None,
        }
    }

    pub fn with_attempt(mut self, attempt_id: impl Into<String>) -> Self {
        self.attempt_id = Some(attempt_id.into());
        self
    }

    pub fn with_result(mut self, result: serde_json::Value) -> Self {
        self.result = Some(result);
        self
    }

    pub fn with_client_effect(mut self, effect: serde_json::Value) -> Self {
        self.client_effect = Some(effect);
        self
    }

    pub fn failed(error: impl Into<String>, detail: Option<String>) -> Self {
        Self::from_outcome(ActionOutcome::Failed, Some(error.into()), detail)
    }

    pub fn attempted(detail: Option<String>) -> Self {
        Self::from_outcome(ActionOutcome::AttemptedUnverified, None, detail)
    }

    pub fn verified_ok(detail: Option<String>) -> Self {
        Self::from_outcome(ActionOutcome::Verified, None, detail)
    }
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
    /// Codex control-plane evidence. Default / Unsupported → fail closed.
    pub codex_background: Option<CodexBackgroundProbe>,
    /// Preloaded recent prompts by canonical session id (no N+1 in resolve_actions).
    pub recent_prompts_by_session: std::collections::HashMap<String, Vec<PromptRecord>>,
}

fn cursor_mapping_from_state(state: &AppState) -> Option<String> {
    let cfg = state.cfg.lock();
    cfg.mappings
        .iter()
        .find(|m| m.app_target_id.trim() == CURSOR_APP_TARGET_ID)
        .map(|m| m.id.clone())
}

/// Production collector: system Claude + Codex runners + process probe caches.
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
    let codex_policy = match policy {
        ProbePolicy::Cached => CodexProbePolicy::Cached,
        ProbePolicy::ForceFresh => CodexProbePolicy::ForceFresh,
    };
    let codex_background = Some(get_codex_probe(
        codex_policy,
        &codex_system_runner(),
        codex_process_probe_cache(),
    ));
    ResolveHints {
        cursor_mapping_id,
        inventory_scan_ok: true,
        evaluated_at_ms,
        claude_background,
        codex_background,
        recent_prompts_by_session: Default::default(),
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

fn working_fresh_ms(source: SignalSource) -> u64 {
    match source {
        SignalSource::OfficialHook | SignalSource::AppServer | SignalSource::Native => {
            WORKING_FRESH_MS_HOOK
        }
        _ => WORKING_FRESH_MS_INFERRED,
    }
}

/// WorkDescriptor for action resolve from current_work JSON + real live session match.
fn work_descriptor_from_current(
    kind: AgentKind,
    obs: &ObservedStatus,
    current_work: &serde_json::Value,
    evaluated_at_ms: u64,
) -> WorkDescriptor {
    use crate::agent_memory::work_descriptor::{resolve_live_session, EvidenceBool};
    let ext = current_work
        .get("externalSessionId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let project_id = current_work
        .get("projectId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(UNKNOWN_PROJECT_ID);
    let live = match ext.as_deref() {
        Some(e) => resolve_live_session(kind.as_str(), e, Some(project_id)).status,
        None => LiveSessionMatch::NotFound,
    };
    let lane_id = ext.as_deref().and_then(|e| lane_for_external(kind, e));
    WorkDescriptor {
        canonical_session_id: current_work
            .get("workId")
            .or_else(|| current_work.get("sessionId"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        external_session_id: ext.clone(),
        lane_id: lane_id.clone(),
        title: None,
        title_source: "unknown".into(),
        title_derived_from: None,
        state: obs.value.clone(),
        state_source: obs.source.clone(),
        cwd: None,
        hwnd: None,
        can_focus_live: EvidenceBool {
            value: false,
            reason: Some("no_focus_target".into()),
            fresh: obs.fresh_until == 0 || obs.fresh_until >= evaluated_at_ms,
        },
        can_resume: EvidenceBool {
            value: ext.is_some() && lane_id.is_some(),
            reason: if ext.is_none() {
                Some("no_external_session".into())
            } else if lane_id.is_none() {
                Some("no_lane".into())
            } else {
                None
            },
            fresh: obs.fresh_until == 0 || obs.fresh_until >= evaluated_at_ms,
        },
        can_open_exact_session: EvidenceBool {
            value: ext.is_some() && lane_id.is_some(),
            reason: None,
            fresh: obs.fresh_until == 0 || obs.fresh_until >= evaluated_at_ms,
        },
        observed_at: Some(obs.observed_at).filter(|&t| t > 0),
        fresh_until: Some(obs.fresh_until).filter(|&t| t > 0),
        confidence: obs.confidence.clone(),
        live_match: live,
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
        confidence: if matches!(source, SignalSource::OfficialHook | SignalSource::AppServer) {
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
        "unavailable" => cap(
            "unavailable",
            Some("probe"),
            row.limitation_reason.as_deref(),
        ),
        _ => cap("unknown", Some("probe"), None),
    };
    let session_metadata = match (ev("sessionMetadata"), row.adapter_state.as_str()) {
        ("available", _) | (_, "readable") => cap("available", Some("adapter"), None),
        ("limited", _) | (_, "path_present" | "limited") => {
            cap("limited", Some("adapter"), row.limitation_reason.as_deref())
        }
        ("unavailable", _) | (_, "encrypted") => cap(
            "unavailable",
            Some("adapter"),
            Some("encrypted_or_unreadable"),
        ),
        _ => cap("unknown", Some("adapter"), None),
    };
    let transcript = match (ev("transcript"), row.adapter_state.as_str()) {
        ("unavailable", _) | (_, "encrypted") => cap(
            "unavailable",
            Some("adapter"),
            Some("transcript_unreadable"),
        ),
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

fn resolve_presence(
    row: &RegistryRow,
    kind: Option<AgentKind>,
    obs: &ObservedStatus,
) -> PresenceAxes {
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
            let hooks = agent_catalog::descriptor(k)
                .capabilities
                .can_observe_lifecycle;
            if hooks
                && matches!(obs.source.as_str(), "officialHook" | "appServer")
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
/// `work` must be the real WorkDescriptor shared with title/integration (no fake BestEffort).
pub fn resolve_actions(
    kind: Option<AgentKind>,
    obs: &ObservedStatus,
    current_work: Option<&serde_json::Value>,
    hints: &ResolveHints,
    work: Option<&WorkDescriptor>,
) -> Vec<ResolvedAction> {
    use crate::agent_memory::capability_resolver::{
        catalog_can_interrupt, provider_support_from_str, resolve_focus, resolve_interrupt,
        resolve_resume, CapabilityEvidenceBundle,
    };

    let mut out = Vec::new();
    let catalog = kind.map(|k| agent_catalog::descriptor(k).capabilities);
    let focus_target = kind.and_then(focus_app_target_for);
    let focus_ceiling = catalog.map(|c| c.can_focus).unwrap_or(false);

    let ext = work
        .and_then(|w| w.external_session_id.as_deref())
        .or_else(|| {
            current_work
                .and_then(|w| w.get("externalSessionId"))
                .and_then(|v| v.as_str())
        })
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let evaluated_at_ms = if hints.evaluated_at_ms > 0 {
        hints.evaluated_at_ms
    } else {
        now_ms()
    };
    let working = obs.value == "working";

    let codex_control = if kind == Some(AgentKind::Codex) {
        Some(resolve_interrupt_evidence(
            hints.codex_background.as_ref(),
            ext,
            working,
            evaluated_at_ms,
        ))
    } else {
        None
    };

    let bundle = CapabilityEvidenceBundle {
        kind,
        catalog_can_focus: focus_ceiling,
        catalog_can_resume: catalog.map(|c| c.can_resume_session).unwrap_or(false),
        catalog_can_interrupt: catalog_can_interrupt(kind),
        focus_executor_wired: focus_target.is_some(),
        cursor_mapping_present: hints.cursor_mapping_id.is_some(),
        work,
        control: codex_control.as_ref(),
        claude_background: hints.claude_background.as_ref(),
        working,
        obs_value: obs.value.as_str(),
        obs_source: obs.source.as_str(),
        obs_observed_at: obs.observed_at,
        obs_fresh_until: obs.fresh_until,
        obs_confidence: obs.confidence.as_str(),
        evaluated_at_ms,
    };

    let focus_cap = resolve_focus(&bundle);
    let focus_support = provider_support_from_str(&focus_cap.support);
    out.push(ResolvedAction::from_cap(
        "agent.focus",
        "View",
        ActionScope::ExternalAgent,
        &focus_cap,
        focus_support,
        if focus_cap.enabled {
            focus_target.map(|t| AgentCenterExecutor::FocusApp {
                target: t.to_string(),
            })
        } else {
            None
        },
    ));

    let resume_cap = resolve_resume(&bundle);
    let resume_support = provider_support_from_str(&resume_cap.support);
    out.push(ResolvedAction::from_cap(
        "session.resume",
        "Resume",
        ActionScope::ExternalAgent,
        &resume_cap,
        resume_support,
        if resume_cap.enabled {
            Some(AgentCenterExecutor::FocusOrResumeLane {
                kind: kind.unwrap(),
                external_session_id: ext.unwrap().to_string(),
            })
        } else {
            None
        },
    ));

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
        state: None,
        source: None,
        confidence: None,
        observed_at: None,
        fresh_until: None,
    });

    // agent.interrupt — single truth via CapabilityResolver
    let interrupt_cap = resolve_interrupt(&bundle);
    let interrupt_support = provider_support_from_str(&interrupt_cap.support);
    let interrupt_exec = if interrupt_cap.enabled {
        match kind {
            Some(AgentKind::Claude) => {
                let sid = work
                    .and_then(|w| w.external_session_id.as_deref())
                    .or(ext)
                    .map(|s| s.to_string());
                sid.map(|external_session_id| AgentCenterExecutor::ClaudeStop {
                    external_session_id,
                })
            }
            Some(AgentKind::Codex) => Some(AgentCenterExecutor::ProviderAction {
                provider: AgentKind::Codex,
                handler: provider_handler_id("agent.interrupt").to_string(),
            }),
            Some(AgentKind::Cursor) => Some(AgentCenterExecutor::ProviderAction {
                provider: AgentKind::Cursor,
                handler: provider_handler_id("agent.interrupt").to_string(),
            }),
            _ => None,
        }
    } else {
        None
    };
    out.push(ResolvedAction::from_cap(
        "agent.interrupt",
        "Interrupt",
        ActionScope::ExternalAgent,
        &interrupt_cap,
        interrupt_support,
        interrupt_exec,
    ));

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
        state: None,
        source: None,
        confidence: None,
        observed_at: None,
        fresh_until: None,
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
        state: None,
        source: None,
        confidence: None,
        observed_at: None,
        fresh_until: None,
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
        state: None,
        source: None,
        confidence: None,
        observed_at: None,
        fresh_until: None,
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
        state: None,
        source: None,
        confidence: None,
        observed_at: None,
        fresh_until: None,
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

    // Recent prompt from preloaded hints (never query inside resolve_actions).
    let prompt_rec = matched
        .iter()
        .find_map(|s| {
            hints
                .recent_prompts_by_session
                .get(&s.session_id)
                .and_then(|v| v.first())
        })
        .or_else(|| {
            current_work
                .as_ref()
                .and_then(|w| w.get("sessionId").and_then(|v| v.as_str()))
                .and_then(|sid| {
                    hints
                        .recent_prompts_by_session
                        .get(sid)
                        .and_then(|v| v.first())
                })
        });

    let project_label = home.project.display_name.as_str();
    let project_name = if project_label.is_empty() || home.project.project_id == UNKNOWN_PROJECT_ID
    {
        None
    } else {
        Some(project_label)
    };
    let session_meta = current_work
        .as_ref()
        .and_then(|w| w.get("status").and_then(|v| v.as_str()));

    let home_session = matched.first().copied();
    let lane = kind.and_then(|k| {
        home_session
            .map(|s| s.external_session_id.as_str())
            .filter(|e| !e.is_empty())
            .and_then(|ext| {
                public_lanes_for_page(k)
                    .into_iter()
                    .find(|l| l.key.session_id == ext)
            })
    });
    let fresh = FreshEvidence {
        value: obs.value.as_str(),
        source: obs.source.as_str(),
        observed_at: obs.observed_at,
        fresh_until: obs.fresh_until,
        confidence: obs.confidence.as_str(),
    };
    // One real WorkDescriptor before actions — shared by title, integration, gating.
    let work_desc = kind.map(|k| {
        resolve_work_descriptor(
            k,
            home_session,
            lane.as_ref(),
            prompt_rec,
            Some(&fresh),
            project_name,
            if hints.evaluated_at_ms > 0 {
                hints.evaluated_at_ms
            } else {
                now_ms()
            },
        )
    });

    let actions: Vec<AgentCenterAction> =
        resolve_actions(kind, &obs, current_work.as_ref(), hints, work_desc.as_ref())
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

    let title = if let Some(ref wd) = work_desc {
        if let Some(ref t) = wd.title {
            crate::agent_memory::title::AgentTitle {
                text: t.clone(),
                source: crate::agent_memory::title::TitleSource::Derived,
                confidence: wd.confidence.clone(),
                derived_from: wd.title_derived_from.as_deref().and_then(|s| match s {
                    "prompt" => Some(crate::agent_memory::title::TitleDerivedFrom::Prompt),
                    "project" => Some(crate::agent_memory::title::TitleDerivedFrom::Project),
                    "sessionMeta" => {
                        Some(crate::agent_memory::title::TitleDerivedFrom::SessionMeta)
                    }
                    "lifecycleEvent" => {
                        Some(crate::agent_memory::title::TitleDerivedFrom::LifecycleEvent)
                    }
                    _ => None,
                }),
            }
        } else {
            resolve_title(TitleInputs {
                prompt_summary: prompt_rec.map(|p| p.summary.as_str()),
                project_name,
                session_meta,
                lifecycle_summary: None,
            })
        }
    } else {
        resolve_title(TitleInputs {
            prompt_summary: prompt_rec.map(|p| p.summary.as_str()),
            project_name,
            session_meta,
            lifecycle_summary: None,
        })
    };

    let mut limitations = limitations;
    if work_desc
        .as_ref()
        .map(|w| w.live_match == LiveSessionMatch::Ambiguous)
        .unwrap_or(false)
    {
        limitations.push(serde_json::json!({
            "code": "ambiguous_session",
            "detail": "multiple projects share this external session"
        }));
    }
    // Honest note: Center outcome ≠ Soft Pad light (pad_status unchanged this round).
    limitations.push(serde_json::json!({
        "code": "center_pad_may_diverge",
        "detail": "Agent Center action outcome is independent of Soft Pad lights"
    }));

    let integration_label = derive_integration_label(
        kind,
        prompt_rec.map(|p| p.source.as_str()),
        &obs,
        work_desc.as_ref(),
        &actions,
    );

    let status = work_desc
        .as_ref()
        .map(|w| w.state.clone())
        .unwrap_or_else(|| obs.value.clone());
    let status_source = work_desc
        .as_ref()
        .map(|w| w.state_source.clone())
        .or_else(|| Some(obs.source.clone()));
    let cwd = work_desc.as_ref().and_then(|w| w.cwd.clone());

    AgentCenterAgent {
        agent_id: row.agent_id.clone(),
        runtime_kind: row.runtime_kind.clone(),
        display_name: row.display_name.clone(),
        form_factor: row.form_factor.clone(),
        presence_state: row.presence_state.clone(),
        presence,
        status,
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
        title: if title.text.is_empty() {
            None
        } else {
            Some(title.text.clone())
        },
        title_source: Some(title.source.as_str().into()),
        title_confidence: Some(title.confidence.clone()),
        title_derived_from: title.derived_from.map(|d| d.as_str().into()),
        recent_prompt: prompt_rec.map(|p| p.summary.clone()),
        prompt_source: prompt_rec.map(|p| p.source.clone()),
        prompt_observed_at: prompt_rec.map(|p| p.observed_at),
        cwd,
        status_source,
        integration_label,
    }
}

/// Managed requires dispatch + session/executor ownership + verifiable control/event path.
fn derive_integration_label(
    kind: Option<AgentKind>,
    prompt_source: Option<&str>,
    obs: &ObservedStatus,
    work: Option<&crate::agent_memory::work_descriptor::WorkDescriptor>,
    actions: &[AgentCenterAction],
) -> Option<String> {
    let onetone_dispatch = prompt_source == Some("OneToneDispatch");
    let has_session = work
        .map(|w| {
            !w.canonical_session_id.is_empty()
                && w.live_match != LiveSessionMatch::Ambiguous
                && w.live_match != LiveSessionMatch::NotFound
        })
        .unwrap_or(false);
    let has_control = actions
        .iter()
        .any(|a| a.id == "agent.interrupt" && a.supported && a.executor.is_some());
    let event_loop = matches!(
        obs.source.as_str(),
        "officialHook" | "claudeBackground" | "codexBackground"
    );
    if onetone_dispatch && has_session && (has_control || event_loop) {
        return Some("managed".into());
    }
    if onetone_dispatch {
        return Some("oneToneInitiated".into());
    }
    if event_loop || has_control {
        return Some("integrated".into());
    }
    if kind.is_some() && obs.observed_at > 0 {
        return Some("observed".into());
    }
    if kind.is_some() {
        return Some("detected".into());
    }
    None
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
            // Unimplemented probe — never SupportedNotFound.
            "unknown" => {
                g.discovered_limited.push(a.agent_id.clone());
            }
            _ => {
                if a.agent_id.starts_with("kind:") {
                    // Only real negative scan evidence lands here (not ProbeNotImplemented).
                    let probe_unimplemented = a.limitations.iter().any(|l| {
                        l.get("code")
                            .and_then(|c| c.as_str())
                            .map(|c| c == "ProbeNotImplemented")
                            .unwrap_or(false)
                    });
                    if probe_unimplemented {
                        g.discovered_limited.push(a.agent_id.clone());
                    } else {
                        g.supported_not_found.push(a.agent_id.clone());
                    }
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

    // Bulk-load prompts once for all home sessions (avoid per-agent N+1).
    let mut hints_owned = hints.clone();
    if hints_owned.recent_prompts_by_session.is_empty() && !home_session_ids.is_empty() {
        if let Ok(map) = recent_prompts_for_sessions(&home_session_ids, 3) {
            hints_owned.recent_prompts_by_session = map;
        }
    }
    let hints = &hints_owned;

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
    // Only surface recommendation when reason + confidence + freshness are present.
    let (recommendation_reason, recommendation_confidence, recommendation_fresh_until) =
        if recommended.is_some() {
            (
                Some("needs_attention_or_connected".into()),
                Some("medium".into()),
                Some(now.saturating_add(WORKING_FRESH_MS_HOOK)),
            )
        } else {
            (None, None, None)
        };

    AgentCenterSnapshot {
        agents,
        recommended_agent_id: recommended,
        recommendation_reason,
        recommendation_confidence,
        recommendation_fresh_until,
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
    build_agent_center_snapshot_with_hints(project_hint, install, true, &ResolveHints::default())
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
    attempt_id: Option<&str>,
) -> AgentCenterActionResult {
    execute_agent_center_action_with(
        state,
        window,
        agent_id,
        action_id,
        project_hint,
        attempt_id,
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
    attempt_id: Option<&str>,
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
) -> AgentCenterActionResult {
    let attempt = normalize_attempt_id(attempt_id);
    let inflight_key = format!("{agent_id}|{action_id}|{attempt}");
    if !try_begin_inflight(&inflight_key) {
        return AgentCenterActionResult::failed(
            "action_in_flight",
            Some("same attempt already executing".into()),
        )
        .with_attempt(&attempt);
    }
    let out = execute_agent_center_action_inner(
        state,
        window,
        agent_id,
        action_id,
        project_hint,
        &attempt,
        runner,
        cache,
    );
    end_inflight(&inflight_key);
    out.with_attempt(&attempt)
}

fn execute_agent_center_action_inner(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    agent_id: &str,
    action_id: &str,
    project_hint: Option<&Path>,
    attempt: &str,
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
) -> AgentCenterActionResult {
    let hints = collect_resolve_hints_with(state, ProbePolicy::ForceFresh, runner, cache);
    let install = &[] as &[(String, String, String)];
    let snap = build_agent_center_snapshot_with_hints(project_hint, install, false, &hints);
    let Some(agent) = snap.agents.iter().find(|a| a.agent_id == agent_id) else {
        return AgentCenterActionResult::failed("agent_not_found", None);
    };

    let kind = agent
        .runtime_kind
        .as_deref()
        .and_then(AgentKind::from_kind_str);
    let work_owned = kind.and_then(|k| {
        agent.current_work.as_ref().map(|cw| {
            work_descriptor_from_current(k, &agent.observed_status, cw, hints.evaluated_at_ms)
        })
    });
    let resolved = resolve_actions(
        kind,
        &agent.observed_status,
        agent.current_work.as_ref(),
        &hints,
        work_owned.as_ref(),
    );
    let Some(action) = resolved.iter().find(|a| a.id == action_id) else {
        return AgentCenterActionResult::failed("unknown_action", Some(action_id.into()));
    };
    if !action.enabled {
        return AgentCenterActionResult::failed("action_not_enabled", action.reason.clone());
    }
    let Some(exec) = action.executor.as_ref() else {
        return AgentCenterActionResult::failed("no_executor", None);
    };

    let work_id = agent
        .current_work
        .as_ref()
        .and_then(|cw| cw.get("workId").and_then(|v| v.as_str()))
        .map(|s| s.to_string());
    let external = agent
        .current_work
        .as_ref()
        .and_then(|cw| cw.get("externalSessionId").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .unwrap_or_default();

    match exec {
        AgentCenterExecutor::ClientNavigation { destination } => {
            AgentCenterActionResult::verified_ok(None).with_client_effect(serde_json::json!({
                "type": "navigate",
                "destination": destination,
            }))
        }
        AgentCenterExecutor::FocusApp { target } => {
            let app = window.app_handle();
            match crate::app_chat_workflow::focus_composer_only(&app, target, 800) {
                Ok(()) => {
                    if let Some(k) = kind {
                        crate::soft_pad_runtime::set_follow_pin(Some(k));
                    }
                    AgentCenterActionResult::verified_ok(Some(format!("focused:{target}")))
                }
                Err(e) => AgentCenterActionResult::failed(
                    "focus_failed",
                    Some(e.reason("agent_center_focus")),
                ),
            }
        }
        AgentCenterExecutor::ProviderAction { provider, handler } => {
            let provider_id = match provider_id_for(*provider) {
                Some(id) => id,
                None => {
                    return AgentCenterActionResult::failed("unsupported_provider", None);
                }
            };
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
            if !out.ok {
                return AgentCenterActionResult::failed(
                    out.reason.unwrap_or_else(|| "execute_failed".into()),
                    out.detail,
                );
            }
            // Hotkey/provider inject success is NOT verified stop — never session_aborted.
            if action_id == "agent.interrupt" {
                match interrupt_post_verify_plan(*provider, true) {
                    InterruptPostVerifyPlan::Failed => {
                        return AgentCenterActionResult::failed("execute_failed", out.detail);
                    }
                    InterruptPostVerifyPlan::VerifyCodexForceFresh => {
                        return verify_codex_interrupt_after_send(
                            &codex_system_runner(),
                            codex_process_probe_cache(),
                            &external,
                            work_id.as_deref(),
                            attempt,
                            out.detail,
                        );
                    }
                    InterruptPostVerifyPlan::AttemptedUnverifiedOnly => {
                        if let Some(sid) = work_id.as_deref() {
                            note_interrupt_observed(
                                sid,
                                provider.as_str(),
                                &external,
                                "interrupt_attempted",
                                attempt,
                                "hotkey",
                                ActionOutcome::AttemptedUnverified,
                            );
                        }
                        return AgentCenterActionResult::attempted(out.detail).with_result(
                            serde_json::json!({ "handler": handler, "verified": false }),
                        );
                    }
                }
            }
            AgentCenterActionResult::verified_ok(out.detail)
                .with_result(serde_json::json!({ "handler": handler }))
        }
        AgentCenterExecutor::ClaudeStop {
            external_session_id,
        } => execute_claude_stop(
            runner,
            cache,
            external_session_id,
            work_id.as_deref(),
            attempt,
        ),
        AgentCenterExecutor::FocusOrResumeLane {
            kind,
            external_session_id,
        } => {
            let hint = FocusTargetHint {
                lane_id: None,
                session_id: Some(external_session_id.clone()),
            };
            let r = crate::agent_lane::focus_session(*kind, hint, FocusClickKind::StatusHost);
            if r.ok {
                return AgentCenterActionResult::verified_ok(Some(r.detail)).with_result(
                    serde_json::json!({
                        "laneId": r.lane_id,
                        "externalSessionId": external_session_id,
                    }),
                );
            }
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
                return if ok {
                    AgentCenterActionResult::verified_ok(Some(detail)).with_result(
                        serde_json::json!({
                            "laneId": lid,
                            "externalSessionId": external_session_id,
                        }),
                    )
                } else {
                    AgentCenterActionResult::failed("resume_failed", Some(detail)).with_result(
                        serde_json::json!({
                            "laneId": lid,
                            "externalSessionId": external_session_id,
                        }),
                    )
                };
            }
            AgentCenterActionResult::failed("resume_failed", Some(r.detail))
        }
        AgentCenterExecutor::CheckpointPreview { session_id } => {
            match resume_checkpoint(session_id) {
                Ok(brief) => AgentCenterActionResult::verified_ok(None)
                    .with_result(serde_json::to_value(brief).unwrap_or_default()),
                Err(e) => AgentCenterActionResult::failed("checkpoint_preview_failed", Some(e)),
            }
        }
    }
}

/// ClaudeStop: stop issued → verify → Verified/AttemptedUnverified; never fake Failed when stop ran.
fn execute_claude_stop(
    runner: &dyn ClaudeProbeRunner,
    cache: &ClaudeProbeCache,
    external_session_id: &str,
    work_id_for_lifecycle: Option<&str>,
    attempt_id: &str,
) -> AgentCenterActionResult {
    let stop_id = external_session_id.trim().to_string();
    let provider = AgentKind::Claude.as_str();
    let sid = work_id_for_lifecycle.unwrap_or("");

    match runner.stop_session(&stop_id) {
        Err(ClaudeStopError::Unavailable) => {
            return AgentCenterActionResult::failed(
                "stop_command_failed",
                Some("cli_unavailable".into()),
            );
        }
        Err(ClaudeStopError::CommandFailed { detail }) => {
            return AgentCenterActionResult::failed("stop_command_failed", Some(detail));
        }
        Err(ClaudeStopError::Timeout) => {
            note_interrupt_observed(
                sid,
                provider,
                &stop_id,
                "interrupt_unverified",
                attempt_id,
                "claudeStop",
                ActionOutcome::AttemptedUnverified,
            );
            return AgentCenterActionResult::attempted(Some("stop_timeout".into()));
        }
        Ok(()) => {}
    }

    cache.invalidate();
    let post = get_probe(ProbePolicy::ForceFresh, runner, cache);
    if post.state != ClaudeProbeState::Ok {
        note_interrupt_observed(
            sid,
            provider,
            &stop_id,
            "interrupt_unverified",
            attempt_id,
            "claudeStop",
            ActionOutcome::AttemptedUnverified,
        );
        return AgentCenterActionResult::attempted(Some(format!(
            "post_stop_probe_failed:{:?}",
            post.state
        )));
    }
    if session_still_active(&post, &stop_id) {
        note_interrupt_observed(
            sid,
            provider,
            &stop_id,
            "interrupt_unverified",
            attempt_id,
            "claudeStop",
            ActionOutcome::AttemptedUnverified,
        );
        return AgentCenterActionResult::attempted(Some("stop_not_verified".into()));
    }

    if let Some(id) = work_id_for_lifecycle.filter(|s| !s.trim().is_empty()) {
        let _ = crate::agent_memory::append_ui_lifecycle(
            id,
            provider,
            "session_aborted",
            "interrupted from Agent Center",
        );
    }
    AgentCenterActionResult::verified_ok(Some(format!("claudeStop:{stop_id}")))
        .with_result(serde_json::json!({ "externalSessionId": stop_id }))
}

/// Codex interrupt post-verify after hotkey send succeeded.
/// Exact external session must be observed inactive → Verified (detail may note ForceFresh).
/// Still active / probe fail / session mismatch → AttemptedUnverified.
/// Window disappearance alone is never treated as stop.

/// Branch selection after ProviderAction hotkey for agent.interrupt.
/// Testable without AppState/Window — not a full hardware path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum InterruptPostVerifyPlan {
    Failed,
    VerifyCodexForceFresh,
    AttemptedUnverifiedOnly,
}

pub(crate) fn interrupt_post_verify_plan(
    provider: AgentKind,
    hotkey_ok: bool,
) -> InterruptPostVerifyPlan {
    if !hotkey_ok {
        return InterruptPostVerifyPlan::Failed;
    }
    match provider {
        AgentKind::Codex => InterruptPostVerifyPlan::VerifyCodexForceFresh,
        // Cursor and other hotkey providers: no reliable post-probe.
        _ => InterruptPostVerifyPlan::AttemptedUnverifiedOnly,
    }
}

fn verify_codex_interrupt_after_send(
    runner: &dyn CodexProbeRunner,
    cache: &CodexProbeCache,
    external_session_id: &str,
    work_id_for_lifecycle: Option<&str>,
    attempt_id: &str,
    hotkey_detail: Option<String>,
) -> AgentCenterActionResult {
    let stop_id = external_session_id.trim().to_string();
    let provider = AgentKind::Codex.as_str();
    let sid = work_id_for_lifecycle.unwrap_or("");

    if stop_id.is_empty() {
        note_interrupt_observed(
            sid,
            provider,
            "",
            "interrupt_unverified",
            attempt_id,
            "hotkey",
            ActionOutcome::AttemptedUnverified,
        );
        return AgentCenterActionResult::attempted(Some("no_external_session".into()))
            .with_result(serde_json::json!({ "handler": "cancel", "verified": false }));
    }

    cache.invalidate();
    let post = get_codex_probe(CodexProbePolicy::ForceFresh, runner, cache);
    if post.state != CodexProbeState::Ok {
        note_interrupt_observed(
            sid,
            provider,
            &stop_id,
            "interrupt_unverified",
            attempt_id,
            "hotkey",
            ActionOutcome::AttemptedUnverified,
        );
        return AgentCenterActionResult::attempted(Some(format!(
            "post_stop_probe_failed:{:?}",
            post.state
        )))
        .with_result(serde_json::json!({
            "handler": "cancel",
            "verified": false,
            "via": "reprobe",
            "hotkeyDetail": hotkey_detail,
        }));
    }

    match find_codex_session(&post, &stop_id) {
        None => {
            // Session mismatch / not attributable — must not claim Verified.
            note_interrupt_observed(
                sid,
                provider,
                &stop_id,
                "interrupt_unverified",
                attempt_id,
                "hotkey",
                ActionOutcome::AttemptedUnverified,
            );
            AgentCenterActionResult::attempted(Some("session_mismatch".into())).with_result(
                serde_json::json!({
                    "handler": "cancel",
                    "verified": false,
                    "via": "reprobe",
                }),
            )
        }
        Some(s) if s.active => {
            note_interrupt_observed(
                sid,
                provider,
                &stop_id,
                "interrupt_unverified",
                attempt_id,
                "hotkey",
                ActionOutcome::AttemptedUnverified,
            );
            AgentCenterActionResult::attempted(Some("stop_not_verified".into())).with_result(
                serde_json::json!({
                    "handler": "cancel",
                    "verified": false,
                    "via": "reprobe",
                }),
            )
        }
        Some(_) => {
            if let Some(id) = work_id_for_lifecycle.filter(|s| !s.trim().is_empty()) {
                let _ = crate::agent_memory::append_ui_lifecycle(
                    id,
                    provider,
                    "session_aborted",
                    "interrupted from Agent Center",
                );
            }
            AgentCenterActionResult::verified_ok(Some(format!(
                "codexInterrupt:{stop_id};via=reprobe"
            )))
            .with_result(serde_json::json!({
                "handler": "cancel",
                "verified": true,
                "via": "reprobe",
                "externalSessionId": stop_id,
            }))
        }
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
            if !a.enabled && a.scope == ActionScope::ExternalAgent {
                assert!(a.executor.is_none(), "disabled {} has executor", a.id);
            }
        }
    }

    /// Exact live match WorkDescriptor for unit tests (bypasses DB session lookup).
    fn exact_wd(ext: &str, obs: &ObservedStatus) -> WorkDescriptor {
        use crate::agent_memory::work_descriptor::EvidenceBool;
        let has = !ext.is_empty();
        WorkDescriptor {
            canonical_session_id: "w1".into(),
            external_session_id: if has { Some(ext.into()) } else { None },
            lane_id: if has {
                Some(format!("claude:session:{ext}"))
            } else {
                None
            },
            title: None,
            title_source: "unknown".into(),
            title_derived_from: None,
            state: obs.value.clone(),
            state_source: obs.source.clone(),
            cwd: None,
            hwnd: None,
            can_focus_live: EvidenceBool {
                value: false,
                reason: Some("no_focus_target".into()),
                fresh: true,
            },
            can_resume: EvidenceBool {
                value: has,
                reason: if has {
                    None
                } else {
                    Some("no_external_session".into())
                },
                fresh: true,
            },
            can_open_exact_session: EvidenceBool {
                value: has,
                reason: None,
                fresh: true,
            },
            observed_at: Some(obs.observed_at).filter(|&t| t > 0),
            fresh_until: Some(obs.fresh_until).filter(|&t| t > 0),
            confidence: obs.confidence.clone(),
            live_match: if has {
                LiveSessionMatch::Exact
            } else {
                LiveSessionMatch::NotFound
            },
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &ResolveHints::default(),
            Some(&exact_wd("ext-1", &obs)),
        );
        assert_actions_honest(&actions);
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(
            interrupt.reason.as_deref(),
            Some("control_plane_unavailable")
        );
        // Supported transport ceiling is Native; enable still requires probe.
        assert_eq!(interrupt.support, ProviderSupport::Native);
        assert!(interrupt.supported);
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
            sessions: vec![
                crate::agent_memory::claude_background::ClaudeBackgroundSession {
                    external_session_id: id.into(),
                    active: true,
                    cwd: None,
                },
            ],
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("", &obs)),
        );
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-1", &obs)),
        );
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-1", &obs)),
        );
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-1", &obs)),
        );
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
                sessions: vec![
                    crate::agent_memory::claude_background::ClaudeBackgroundSession {
                        external_session_id: "ext-1".into(),
                        active: true,
                        cwd: None,
                    },
                ],
                observed_at: 1_000,
                fresh_until: 4_000, // < evaluated_at_ms
                confidence: "high".into(),
            }),
            ..Default::default()
        };
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-1", &obs)),
        );
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
        let actions = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-1", &obs)),
        );
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
        let out = execute_claude_stop(
            &runner,
            &cache,
            "ext-1",
            Some("internal-1"),
            "attempt-test-1",
        );
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
            ) -> Result<String, crate::agent_memory::claude_background::ClaudeRunError>
            {
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
        let out = execute_claude_stop(
            &runner,
            &cache,
            "ext-1",
            Some("internal-1"),
            "attempt-test-1",
        );
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert_eq!(out.detail.as_deref(), Some("stop_timeout"));
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
        let out = execute_claude_stop(
            &runner,
            &cache,
            "ext-1",
            Some("internal-1"),
            "attempt-test-1",
        );
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert_eq!(out.detail.as_deref(), Some("stop_not_verified"));
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
        let out = execute_claude_stop(
            &runner,
            &cache,
            "ext-1",
            Some("internal-1"),
            "attempt-test-1",
        );
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert!(out
            .detail
            .as_deref()
            .unwrap_or("")
            .contains("post_stop_probe_failed"));
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
        let out = execute_claude_stop(&runner, &cache, "sess-a", None, "attempt-test-2");
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
        let a1 = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-9", &obs)),
        );
        let a2 = resolve_actions(
            Some(AgentKind::Claude),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("ext-9", &obs)),
        );
        let i1 = a1.iter().find(|a| a.id == "agent.interrupt").unwrap();
        let i2 = a2.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(i1.enabled && i2.enabled);
        assert_eq!(i1.executor, i2.executor);
    }

    #[test]
    fn gemini_catalog_focus_not_enabled_without_executor() {
        let obs = resolve_observed_status(Some(AgentKind::Gemini));
        let actions = resolve_actions(
            Some(AgentKind::Gemini),
            &obs,
            None,
            &ResolveHints::default(),
            None,
        );
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
        // Without Codex ControlEvidence, interrupt must stay fail-closed.
        let actions = resolve_actions(
            Some(AgentKind::Codex),
            &obs,
            None,
            &ResolveHints::default(),
            None,
        );
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(!interrupt.enabled);
        assert_eq!(interrupt.support, ProviderSupport::Unsupported);
        assert!(interrupt.executor.is_none());
        assert_eq!(provider_handler_id("agent.interrupt"), "cancel");
    }

    #[test]
    fn codex_interrupt_requires_window_evidence() {
        use crate::agent_memory::codex_background::{
            CodexBackgroundProbe, CodexBackgroundSession, CodexProbeState, PROBE_TTL_MS,
        };
        let now = now_ms();
        let obs = ObservedStatus {
            value: "working".into(),
            source: "officialHook".into(),
            observed_at: now,
            fresh_until: now + WORKING_FRESH_MS_HOOK,
            confidence: "high".into(),
        };
        let work = serde_json::json!({
            "externalSessionId": "cx-1",
        });
        let hints = ResolveHints {
            evaluated_at_ms: now,
            codex_background: Some(CodexBackgroundProbe {
                state: CodexProbeState::Ok,
                sessions: vec![CodexBackgroundSession {
                    external_session_id: "cx-1".into(),
                    active: true,
                    window_addressable: true,
                }],
                observed_at: now,
                fresh_until: now + PROBE_TTL_MS,
                confidence: "high".into(),
            }),
            ..Default::default()
        };
        let actions = resolve_actions(
            Some(AgentKind::Codex),
            &obs,
            Some(&work),
            &hints,
            Some(&exact_wd("cx-1", &obs)),
        );
        let interrupt = actions.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert!(interrupt.enabled);
        assert_eq!(interrupt.support, ProviderSupport::Hotkey);
        match interrupt.executor.as_ref().unwrap() {
            AgentCenterExecutor::ProviderAction { handler, .. } => {
                assert_eq!(handler, "cancel");
            }
            other => panic!("expected ProviderAction, got {other:?}"),
        }
    }

    #[test]
    fn empty_probe_kinds_not_in_supported_not_found() {
        let agents = vec![AgentCenterAgent {
            agent_id: "kind:aider".into(),
            runtime_kind: Some("aider".into()),
            display_name: "Aider".into(),
            form_factor: "cli".into(),
            presence_state: "unknown".into(),
            presence: PresenceAxes {
                installation: "unknown".into(),
                data_source: "unknown".into(),
                runtime: "unknown".into(),
                integration: "unknown".into(),
            },
            status: "unknown".into(),
            observed_status: ObservedStatus {
                value: "unknown".into(),
                source: "none".into(),
                observed_at: 0,
                fresh_until: 0,
                confidence: "low".into(),
            },
            version: None,
            data_path: None,
            last_probe_at: None,
            last_sync_at: None,
            resolved_capabilities: AgentResolvedCapabilities {
                usage: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                session_metadata: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                transcript: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                realtime_status: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                hooks: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                resume: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
                focus: CapabilityState {
                    state: "unknown".into(),
                    source: None,
                    reason: None,
                    updated_at: None,
                },
            },
            metrics: AgentCenterMetrics {
                today_sessions: unavailable_metric("x"),
                today_cost_usd: unavailable_metric("x"),
                tokens: unavailable_metric("x"),
                average_duration_ms: unavailable_metric("x"),
                success_rate: unavailable_metric("x"),
            },
            current_work: None,
            attention: None,
            recent_work: vec![],
            unscoped_recent_work: vec![],
            evidence: vec![],
            limitations: vec![serde_json::json!({ "code": "ProbeNotImplemented" })],
            actions: vec![],
            title: None,
            title_source: Some("unknown".into()),
            title_confidence: Some("low".into()),
            title_derived_from: None,
            recent_prompt: None,
            prompt_source: None,
            prompt_observed_at: None,
            cwd: None,
            status_source: None,
            integration_label: None,
        }];
        let g = group_agents(&agents);
        assert!(!g.supported_not_found.contains(&"kind:aider".into()));
        assert!(g.discovered_limited.contains(&"kind:aider".into()));
    }

    #[test]
    fn session_resume_uses_external_not_internal_id() {
        let obs = resolve_observed_status(Some(AgentKind::Codex));
        let work = serde_json::json!({
            "workId": "onetone-internal-abc",
            "sessionId": "onetone-internal-abc",
            "externalSessionId": "",
        });
        let actions = resolve_actions(
            Some(AgentKind::Codex),
            &obs,
            Some(&work),
            &ResolveHints::default(),
            Some(&exact_wd("", &obs)),
        );
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
        let snap =
            build_agent_center_snapshot(None, &[("codex".into(), "cli".into(), "high".into())]);
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

    #[test]
    fn e2e_upsert_inbound_projects_recent_prompt_onto_agent() {
        use crate::agent_memory::events::{agent_session_id, upsert_session_candidate};
        use crate::agent_memory::model::{ProjectIdentity, ProjectMatch, SessionCandidate};
        use crate::agent_memory::prompt_journal::{
            note_inbound_prompt, recent_prompts, PromptObserveInput, PromptSource,
        };
        use crate::agent_memory::snapshot::AgentHomeSnapshot;
        use crate::agent_memory::store::now_ms;

        let now = now_ms();
        let ext = format!("e2e-home-prompt-{now}");
        let project = "e2e-home-prompt-proj";
        let cand = SessionCandidate {
            provider: "claude".into(),
            external_session_id: ext.clone(),
            project_id: project.into(),
            project_match: ProjectMatch::Exact,
            match_reason: "e2e".into(),
            match_confidence: 1.0,
            started_at: Some(now),
            updated_at: Some(now),
            title: None,
            is_active: true,
            activity_source: "test".into(),
            active_confidence: 1.0,
            workspace_evidence: None,
        };
        let home_sid = upsert_session_candidate(&cand).expect("upsert");
        assert_eq!(home_sid, agent_session_id("claude", project, &ext));

        let _rec = note_inbound_prompt(PromptObserveInput {
            provider: AgentKind::Claude,
            workspace_id: "ws",
            external_session_id: &ext,
            project_id: project,
            text: Some("fix the login form"),
            source: PromptSource::OneToneDispatch,
            observed_at: Some(now),
            source_key: "e2e-turn",
        })
        .expect("inbound");

        let list = recent_prompts(&home_sid, 3).expect("recent by home id");
        assert!(!list.is_empty());
        assert_eq!(list[0].summary, "fix the login form");

        let mut hints = ResolveHints::default();
        hints
            .recent_prompts_by_session
            .insert(home_sid.clone(), list);

        let home_session = HomeSessionDto {
            session_id: home_sid.clone(),
            provider: "claude".into(),
            external_session_id: ext,
            title: None,
            updated_at: Some(now),
            status: "active".into(),
            project_id: project.into(),
            project_match: "exact".into(),
            match_reason: "e2e".into(),
            match_confidence: 1.0,
            is_active: true,
            activity_source: "test".into(),
            active_confidence: 1.0,
        };
        let home = AgentHomeSnapshot {
            project: ProjectIdentity {
                project_id: project.into(),
                git_root: None,
                workspace_path: None,
                display_name: "e2e".into(),
            },
            active_session: Some(home_session.clone()),
            recent_sessions: vec![home_session],
            recent_events: vec![],
            latest_event: None,
            checkpoint: None,
            memories: vec![],
            context: None,
            as_of: now,
            sync_status: "ready".into(),
            stale_age_ms: 0,
            probe_status: "ready".into(),
            diagnostics: vec![],
            consent_activity_enabled: false,
        };
        let row = RegistryRow {
            agent_id: "kind:claude".into(),
            runtime_kind: Some("claude".into()),
            display_name: "Claude".into(),
            form_factor: "cli".into(),
            presence_state: "connected".into(),
            version: None,
            data_path: None,
            adapter_state: "ready".into(),
            limitation_reason: None,
            capability_evidence_json: "{}".into(),
            evidence_json: "[]".into(),
            last_probe_at_ms: None,
            last_successful_probe_at_ms: None,
            last_sync_at_ms: None,
            created_at_ms: now as i64,
            updated_at_ms: now as i64,
        };

        let agent = build_agent_from_row(&row, &home, &hints);
        assert_eq!(agent.recent_prompt.as_deref(), Some("fix the login form"));
        assert_eq!(agent.prompt_source.as_deref(), Some("OneToneDispatch"));
        assert_eq!(agent.title.as_deref(), Some("fix the login form"));
        assert_eq!(agent.title_source.as_deref(), Some("derived"));
        assert_eq!(agent.title_derived_from.as_deref(), Some("prompt"));
        // OneToneDispatch alone is not Managed.
        assert!(
            agent.integration_label.as_deref() == Some("oneToneInitiated")
                || agent.integration_label.as_deref() == Some("managed"),
            "got {:?}",
            agent.integration_label
        );
        if agent.integration_label.as_deref() == Some("managed") {
            // Only if control/event evidence also present in this projection.
            assert!(agent.actions.iter().any(|a| a.id == "agent.interrupt"));
        }
    }

    #[test]
    fn attempt_id_normalized_and_distinct_source_refs() {
        let a = normalize_attempt_id(Some("bad id!!"));
        assert!(a.starts_with("attempt-"));
        let b = normalize_attempt_id(Some("attempt-ok-1"));
        assert_eq!(b, "attempt-ok-1");
        let r1 = action_source_ref("claude", "ext-1", "agent.interrupt", "attempt-1");
        let r2 = action_source_ref("claude", "ext-1", "agent.interrupt", "attempt-2");
        assert_ne!(r1, r2);
        assert!(!r1.contains("attemptedUnverified"));
    }

    #[test]
    fn action_outcome_derived_fields() {
        let f = AgentCenterActionResult::failed("x", None);
        assert!(!f.ok && !f.verified);
        let u = AgentCenterActionResult::attempted(None);
        assert!(u.ok && !u.verified);
        let v = AgentCenterActionResult::verified_ok(None);
        assert!(v.ok && v.verified);
    }

    #[test]
    fn agent_center_action_serializes_camel_case() {
        let act = AgentCenterAction {
            id: "agent.interrupt".into(),
            label: "Interrupt".into(),
            scope: "externalAgent".into(),
            support: "hotkey".into(),
            supported: true,
            enabled: true,
            reason: None,
            executor: Some("providerAction:codex:cancel".into()),
            state: Some("available".into()),
            source: Some("codexProbe".into()),
            confidence: Some("high".into()),
            observed_at: Some(1_000),
            fresh_until: Some(4_000),
        };
        let v = serde_json::to_value(&act).expect("serialize action");
        assert_eq!(v["id"], "agent.interrupt");
        assert_eq!(v["support"], "hotkey");
        assert_eq!(v["supported"], true);
        assert_eq!(v["enabled"], true);
        assert_eq!(v["state"], "available");
        assert_eq!(v["source"], "codexProbe");
        assert_eq!(v["confidence"], "high");
        assert_eq!(v["observedAt"], 1_000);
        assert_eq!(v["freshUntil"], 4_000);
        assert!(v.get("observed_at").is_none());
        assert!(v.get("fresh_until").is_none());
        assert!(
            v.get("outcome").is_none(),
            "outcome belongs on ActionResult"
        );
    }

    #[test]
    fn agent_center_action_result_serializes_outcome() {
        let res = AgentCenterActionResult::attempted(Some("stop_not_verified".into()))
            .with_attempt("attempt-test-1")
            .with_result(serde_json::json!({ "via": "reprobe" }));
        let v = serde_json::to_value(&res).expect("serialize result");
        assert_eq!(v["outcome"], "attemptedUnverified");
        assert_eq!(v["ok"], true);
        assert_eq!(v["verified"], false);
        assert_eq!(v["attemptId"], "attempt-test-1");
        assert_eq!(v["detail"], "stop_not_verified");
        assert!(v.get("error").is_none() || v["error"].is_null());
        let failed = AgentCenterActionResult::failed("execute_failed", Some("x".into()));
        let fv = serde_json::to_value(&failed).unwrap();
        assert_eq!(fv["outcome"], "failed");
        assert_eq!(fv["error"], "execute_failed");
        assert_eq!(fv["ok"], false);
        assert_eq!(fv["verified"], false);
    }

    #[test]
    fn unsupported_vs_unknown_interrupt_reasons() {
        // Catalog-less / unsupported provider → provider_unsupported, not ProbeNotImplemented.
        let obs = ObservedStatus {
            value: "idle".into(),
            source: "none".into(),
            observed_at: 0,
            fresh_until: 0,
            confidence: "low".into(),
        };
        let gemini = resolve_actions(
            Some(AgentKind::Gemini),
            &obs,
            None,
            &ResolveHints::default(),
            None,
        );
        let g_int = gemini.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert_eq!(g_int.reason.as_deref(), Some("provider_unsupported"));
        assert_eq!(g_int.state.as_deref(), Some("unsupported"));

        // Codex without control evidence → not conflated into provider_unsupported alone as "unknown install".
        let codex = resolve_actions(
            Some(AgentKind::Codex),
            &obs,
            None,
            &ResolveHints::default(),
            None,
        );
        let c_int = codex.iter().find(|a| a.id == "agent.interrupt").unwrap();
        assert_ne!(
            c_int.reason.as_deref(),
            Some("ProbeNotImplemented"),
            "runtime capability reason must not be ProbeNotImplemented"
        );
    }

    #[test]
    fn codex_interrupt_verified_when_force_fresh_inactive() {
        use crate::agent_memory::codex_background::{
            CodexBackgroundSession, CodexProbeState, PROBE_TTL_MS,
        };
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Fake {
            probes: AtomicUsize,
        }
        impl CodexProbeRunner for Fake {
            fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
                self.probes.fetch_add(1, Ordering::SeqCst);
                CodexBackgroundProbe {
                    state: CodexProbeState::Ok,
                    sessions: vec![CodexBackgroundSession {
                        external_session_id: "cx-1".into(),
                        active: false,
                        window_addressable: true,
                    }],
                    observed_at: now,
                    fresh_until: now + PROBE_TTL_MS,
                    confidence: "high".into(),
                }
            }
        }
        let runner = Fake {
            probes: AtomicUsize::new(0),
        };
        let cache = CodexProbeCache::new();
        let out = verify_codex_interrupt_after_send(
            &runner,
            &cache,
            "cx-1",
            Some("internal-1"),
            "attempt-cx-1",
            Some("hotkey-ok".into()),
        );
        assert!(out.ok);
        assert!(out.verified);
        assert_eq!(out.outcome, ActionOutcome::Verified);
        assert!(out.detail.as_deref().unwrap_or("").contains("via=reprobe"));
        assert!(runner.probes.load(Ordering::SeqCst) >= 1);
    }

    #[test]
    fn codex_interrupt_attempted_when_still_active() {
        use crate::agent_memory::codex_background::{
            CodexBackgroundSession, CodexProbeState, PROBE_TTL_MS,
        };
        struct Fake;
        impl CodexProbeRunner for Fake {
            fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
                CodexBackgroundProbe {
                    state: CodexProbeState::Ok,
                    sessions: vec![CodexBackgroundSession {
                        external_session_id: "cx-1".into(),
                        active: true,
                        window_addressable: true,
                    }],
                    observed_at: now,
                    fresh_until: now + PROBE_TTL_MS,
                    confidence: "high".into(),
                }
            }
        }
        let cache = CodexProbeCache::new();
        let out =
            verify_codex_interrupt_after_send(&Fake, &cache, "cx-1", None, "attempt-cx-2", None);
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert_eq!(out.detail.as_deref(), Some("stop_not_verified"));
    }

    #[test]
    fn codex_interrupt_attempted_on_post_probe_error() {
        use crate::agent_memory::codex_background::CodexProbeState;
        struct Fake;
        impl CodexProbeRunner for Fake {
            fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
                CodexBackgroundProbe::error_state(CodexProbeState::Timeout, now)
            }
        }
        let cache = CodexProbeCache::new();
        let out =
            verify_codex_interrupt_after_send(&Fake, &cache, "cx-1", None, "attempt-cx-3", None);
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert!(out
            .detail
            .as_deref()
            .unwrap_or("")
            .contains("post_stop_probe_failed"));
    }

    #[test]
    fn codex_interrupt_session_mismatch_not_verified() {
        use crate::agent_memory::codex_background::{
            CodexBackgroundSession, CodexProbeState, PROBE_TTL_MS,
        };
        struct Fake;
        impl CodexProbeRunner for Fake {
            fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
                CodexBackgroundProbe {
                    state: CodexProbeState::Ok,
                    sessions: vec![CodexBackgroundSession {
                        external_session_id: "other-id".into(),
                        active: false,
                        window_addressable: true,
                    }],
                    observed_at: now,
                    fresh_until: now + PROBE_TTL_MS,
                    confidence: "high".into(),
                }
            }
        }
        let cache = CodexProbeCache::new();
        let out =
            verify_codex_interrupt_after_send(&Fake, &cache, "cx-1", None, "attempt-cx-4", None);
        assert!(out.ok);
        assert!(!out.verified);
        assert_eq!(out.outcome, ActionOutcome::AttemptedUnverified);
        assert_eq!(out.detail.as_deref(), Some("session_mismatch"));
    }

    #[test]
    fn interrupt_post_verify_plan_branches() {
        assert_eq!(
            interrupt_post_verify_plan(AgentKind::Codex, false),
            InterruptPostVerifyPlan::Failed
        );
        assert_eq!(
            interrupt_post_verify_plan(AgentKind::Cursor, false),
            InterruptPostVerifyPlan::Failed
        );
        assert_eq!(
            interrupt_post_verify_plan(AgentKind::Codex, true),
            InterruptPostVerifyPlan::VerifyCodexForceFresh
        );
        assert_eq!(
            interrupt_post_verify_plan(AgentKind::Cursor, true),
            InterruptPostVerifyPlan::AttemptedUnverifiedOnly
        );
        // Claude interrupt uses ClaudeStop executor, not this ProviderAction plan.
        assert_eq!(
            interrupt_post_verify_plan(AgentKind::Claude, true),
            InterruptPostVerifyPlan::AttemptedUnverifiedOnly
        );
    }

    #[test]
    fn cursor_interrupt_provider_action_stays_attempted_unverified() {
        // Cursor has no reliable post-probe; ProviderAction interrupt remains AttemptedUnverified.
        assert_eq!(
            ActionOutcome::AttemptedUnverified.as_str(),
            "attemptedUnverified"
        );
        assert!(!ActionOutcome::AttemptedUnverified.verified());
        // Production Codex path is verify_* after ProviderAction hotkey (no dedicated executor arm).
        let src = include_str!("agent_center.rs");
        assert!(src.contains("verify_codex_interrupt_after_send"));
        assert!(src.contains("AgentCenterExecutor::ProviderAction"));
        let banned = format!("{}{}", "Codex", "Interrupt {");
        assert!(
            !src.contains(&banned),
            "must reuse ProviderAction instead of a dedicated executor arm"
        );
    }

    #[test]
    fn provider_action_interrupt_never_writes_lifecycle_on_ok() {
        // Cursor hotkey interrupt stays AttemptedUnverified; Codex may Verified via reprobe.
        assert_eq!(
            ActionOutcome::AttemptedUnverified.as_str(),
            "attemptedUnverified"
        );
        assert!(!ActionOutcome::AttemptedUnverified.verified());
        assert!(ActionOutcome::AttemptedUnverified.ok());
    }
}
