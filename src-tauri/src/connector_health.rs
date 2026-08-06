//! Soft Pad connector health — observation-channel health per agent+capability.
//!
//! `capability=lifecycle` describes whether the lifecycle **observation channel** is healthy,
//! not the agent AttentionState (idle/running/needs_input/done/failed). Status dots read
//! AttentionStore; rail/tooltip health badges read this module.

use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityKind {
    /// Observation-channel health for lifecycle hooks (not AttentionState).
    Lifecycle,
    Model,
    Usage,
}

impl CapabilityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lifecycle => "lifecycle",
            Self::Model => "model",
            Self::Usage => "usage",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthState {
    Disabled,
    NotConfigured,
    ConfiguredWaiting,
    Live,
    Stale,
    Error,
    Unsupported,
}

impl HealthState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::NotConfigured => "not_configured",
            Self::ConfiguredWaiting => "configured_waiting",
            Self::Live => "live",
            Self::Stale => "stale",
            Self::Error => "error",
            Self::Unsupported => "unsupported",
        }
    }

    /// Priority for actionable-problem aggregation (lower = more urgent).
    /// `unsupported` must not outrank healthier capabilities when mixed.
    fn aggregate_rank(self) -> u8 {
        match self {
            Self::Error => 0,
            Self::Stale => 1,
            Self::NotConfigured => 2,
            Self::ConfiguredWaiting => 3,
            Self::Live => 4,
            Self::Disabled => 5,
            Self::Unsupported => 6,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueState {
    Present,
    Absent,
    NotReported,
    Unsupported,
}

impl ValueState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Present => "present",
            Self::Absent => "absent",
            Self::NotReported => "not_reported",
            Self::Unsupported => "unsupported",
        }
    }

    pub fn is_present(self) -> bool {
        matches!(self, Self::Present)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityHealth {
    pub agent: String,
    pub capability: String,
    pub state: String,
    pub value_state: String,
    pub value_present: bool,
    pub reason_code: String,
    pub short_reason: String,
    pub last_attempt_at: u64,
    pub last_success_at: u64,
    pub source: String,
    pub configured_scopes: Vec<String>,
    pub effective_scope: String,
    pub conflicts: Vec<String>,
}

impl CapabilityHealth {
    pub fn new(agent: AgentKind, capability: CapabilityKind) -> Self {
        Self {
            agent: agent.as_str().to_string(),
            capability: capability.as_str().to_string(),
            state: HealthState::NotConfigured.as_str().into(),
            value_state: ValueState::Absent.as_str().into(),
            value_present: false,
            reason_code: "config_missing".into(),
            short_reason: String::new(),
            last_attempt_at: 0,
            last_success_at: 0,
            source: String::new(),
            configured_scopes: Vec::new(),
            effective_scope: String::new(),
            conflicts: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClassifyInput {
    pub user_disabled: bool,
    pub configured: bool,
    pub unsupported_by_provider: bool,
    pub had_success: bool,
    pub attempt_ok: bool,
    pub waiting_first: bool,
}

/// Pure transition rules for channel health (not value presence).
pub fn classify_health_state(input: ClassifyInput) -> HealthState {
    if input.user_disabled {
        return HealthState::Disabled;
    }
    if input.unsupported_by_provider {
        return HealthState::Unsupported;
    }
    if !input.configured {
        return HealthState::NotConfigured;
    }
    if input.waiting_first && !input.had_success {
        return HealthState::ConfiguredWaiting;
    }
    if input.attempt_ok {
        return HealthState::Live;
    }
    if input.had_success {
        return HealthState::Stale;
    }
    HealthState::Error
}

/// Headline = highest-priority actionable problem across capabilities.
/// `unsupported` alone can surface; mixed with healthier states it loses.
pub fn aggregate_actionable_state(states: &[HealthState]) -> Option<HealthState> {
    if states.is_empty() {
        return None;
    }
    let non_unsupported: Vec<HealthState> = states
        .iter()
        .copied()
        .filter(|s| *s != HealthState::Unsupported)
        .collect();
    let pool = if non_unsupported.is_empty() {
        states
    } else {
        &non_unsupported
    };
    pool.iter()
        .copied()
        .min_by_key(|s| s.aggregate_rank())
}

pub fn actionable_badge_label(state: HealthState, agent: AgentKind) -> &'static str {
    match state {
        HealthState::Error => "出错",
        HealthState::Stale => "数据陈旧",
        HealthState::NotConfigured => match agent {
            AgentKind::Claude => "用量未配置",
            AgentKind::Cursor => "未配置",
            _ => "未配置",
        },
        HealthState::ConfiguredWaiting => "等待首次数据",
        HealthState::Live => match agent {
            AgentKind::Cursor => "活动可观察",
            _ => "正常",
        },
        HealthState::Disabled => "已关闭",
        HealthState::Unsupported => "不支持",
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct HealthKey {
    agent: AgentKind,
    capability: CapabilityKind,
}

fn store() -> &'static Mutex<HashMap<HealthKey, CapabilityHealth>> {
    static STORE: OnceLock<Mutex<HashMap<HealthKey, CapabilityHealth>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get(agent: AgentKind, capability: CapabilityKind) -> CapabilityHealth {
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&HealthKey { agent, capability })
        .cloned()
        .unwrap_or_else(|| CapabilityHealth::new(agent, capability))
}

pub fn set(row: CapabilityHealth) {
    let Ok(agent) = parse_agent(&row.agent) else {
        return;
    };
    let Ok(capability) = parse_capability(&row.capability) else {
        return;
    };
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(HealthKey { agent, capability }, row);
}

pub fn upsert(
    agent: AgentKind,
    capability: CapabilityKind,
    state: HealthState,
    value_state: ValueState,
    reason_code: &str,
    short_reason: &str,
    source: &str,
    now_ms: u64,
    mark_success: bool,
) {
    let mut row = get(agent, capability);
    row.state = state.as_str().into();
    row.value_state = value_state.as_str().into();
    row.value_present = value_state.is_present();
    row.reason_code = reason_code.into();
    row.short_reason = short_reason.into();
    row.source = source.into();
    row.last_attempt_at = now_ms;
    if mark_success {
        row.last_success_at = now_ms;
    }
    set(row);
}

/// Test pulse must never call this with mark_success for formal health.
pub fn snapshot_agent(agent: AgentKind) -> Vec<CapabilityHealth> {
    [
        CapabilityKind::Lifecycle,
        CapabilityKind::Model,
        CapabilityKind::Usage,
    ]
    .into_iter()
    .map(|c| get(agent, c))
    .collect()
}

pub fn headline_for_agent(agent: AgentKind) -> (HealthState, &'static str) {
    let states: Vec<HealthState> = snapshot_agent(agent)
        .iter()
        .filter_map(|h| parse_health_state(&h.state).ok())
        .collect();
    let state = aggregate_actionable_state(&states).unwrap_or(HealthState::NotConfigured);
    (state, actionable_badge_label(state, agent))
}

fn parse_agent(s: &str) -> Result<AgentKind, ()> {
    AgentKind::from_kind_str(s).ok_or(())
}

fn parse_capability(s: &str) -> Result<CapabilityKind, ()> {
    match s {
        "lifecycle" => Ok(CapabilityKind::Lifecycle),
        "model" => Ok(CapabilityKind::Model),
        "usage" => Ok(CapabilityKind::Usage),
        _ => Err(()),
    }
}

fn parse_health_state(s: &str) -> Result<HealthState, ()> {
    match s {
        "disabled" => Ok(HealthState::Disabled),
        "not_configured" => Ok(HealthState::NotConfigured),
        "configured_waiting" => Ok(HealthState::ConfiguredWaiting),
        "live" => Ok(HealthState::Live),
        "stale" => Ok(HealthState::Stale),
        "error" => Ok(HealthState::Error),
        "unsupported" => Ok(HealthState::Unsupported),
        _ => Err(()),
    }
}

#[cfg(test)]
pub fn reset_for_test() {
    store().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_disabled_stale_waiting_error() {
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: true,
                configured: true,
                unsupported_by_provider: false,
                had_success: true,
                attempt_ok: false,
                waiting_first: false,
            }),
            HealthState::Disabled
        );
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: false,
                configured: true,
                unsupported_by_provider: false,
                had_success: true,
                attempt_ok: false,
                waiting_first: false,
            }),
            HealthState::Stale
        );
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: false,
                configured: true,
                unsupported_by_provider: false,
                had_success: false,
                attempt_ok: false,
                waiting_first: true,
            }),
            HealthState::ConfiguredWaiting
        );
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: false,
                configured: true,
                unsupported_by_provider: false,
                had_success: false,
                attempt_ok: false,
                waiting_first: false,
            }),
            HealthState::Error
        );
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: false,
                configured: false,
                unsupported_by_provider: false,
                had_success: false,
                attempt_ok: false,
                waiting_first: false,
            }),
            HealthState::NotConfigured
        );
        assert_eq!(
            classify_health_state(ClassifyInput {
                user_disabled: false,
                configured: true,
                unsupported_by_provider: true,
                had_success: false,
                attempt_ok: false,
                waiting_first: false,
            }),
            HealthState::Unsupported
        );
    }

    #[test]
    fn aggregate_skips_unsupported_when_mixed() {
        assert_eq!(
            aggregate_actionable_state(&[HealthState::Live, HealthState::Unsupported]),
            Some(HealthState::Live)
        );
        assert_eq!(
            aggregate_actionable_state(&[
                HealthState::Live,
                HealthState::NotConfigured,
                HealthState::Unsupported
            ]),
            Some(HealthState::NotConfigured)
        );
        assert_eq!(
            aggregate_actionable_state(&[HealthState::Unsupported]),
            Some(HealthState::Unsupported)
        );
        assert_eq!(
            aggregate_actionable_state(&[HealthState::Error, HealthState::Stale]),
            Some(HealthState::Error)
        );
    }

    #[test]
    fn live_channel_can_have_absent_value() {
        reset_for_test();
        upsert(
            AgentKind::Cursor,
            CapabilityKind::Model,
            HealthState::Live,
            ValueState::NotReported,
            "waiting_first_event",
            "Hook 已送达但未报告模型",
            "cursor_hook",
            100,
            true,
        );
        let row = get(AgentKind::Cursor, CapabilityKind::Model);
        assert_eq!(row.state, "live");
        assert_eq!(row.value_state, "not_reported");
        assert!(!row.value_present);
    }

    #[test]
    fn upsert_success_updates_last_success_at() {
        reset_for_test();
        upsert(
            AgentKind::Codex,
            CapabilityKind::Usage,
            HealthState::Live,
            ValueState::Present,
            "",
            "",
            "codex_app_server",
            50,
            true,
        );
        upsert(
            AgentKind::Codex,
            CapabilityKind::Usage,
            HealthState::Stale,
            ValueState::Present,
            "export_timeout",
            "刷新失败",
            "codex_app_server",
            90,
            false,
        );
        let row = get(AgentKind::Codex, CapabilityKind::Usage);
        assert_eq!(row.state, "stale");
        assert_eq!(row.last_success_at, 50);
        assert_eq!(row.last_attempt_at, 90);
    }
}
