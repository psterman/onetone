//! CapabilityResolver — focus / resume / interrupt judgment from evidence bundles.
//! Catalog is a ceiling only; never enables actions alone.

use crate::agent::actions::ProviderSupport;
use crate::agent_memory::claude_background::{ClaudeBackgroundProbe, ClaudeProbeState};
use crate::agent_memory::codex_background::ControlEvidence;
use crate::agent_memory::work_descriptor::{LiveSessionMatch, WorkDescriptor};
use crate::soft_pad_runtime::AgentKind;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedCapability {
    pub id: String,
    pub state: String,
    pub support: String,
    pub supported: bool,
    pub enabled: bool,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Belief strength only: high | medium | low.
    pub confidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fresh_until: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct CapabilityEvidenceBundle<'a> {
    pub kind: Option<AgentKind>,
    /// Platform ceiling from agent_catalog (not runtime evidence).
    pub catalog_can_focus: bool,
    pub catalog_can_resume: bool,
    pub catalog_can_interrupt: bool,
    pub focus_executor_wired: bool,
    pub cursor_mapping_present: bool,
    pub work: Option<&'a WorkDescriptor>,
    /// Codex control evidence only.
    pub control: Option<&'a ControlEvidence>,
    /// Claude background probe only.
    pub claude_background: Option<&'a ClaudeBackgroundProbe>,
    /// Working observation (attention / hook).
    pub working: bool,
    pub obs_value: &'a str,
    pub obs_source: &'a str,
    pub obs_observed_at: u64,
    pub obs_fresh_until: u64,
    pub obs_confidence: &'a str,
    pub evaluated_at_ms: u64,
}

/// Exhaustive ProviderSupport string → enum (six states).
pub fn provider_support_from_str(s: &str) -> ProviderSupport {
    match s {
        "native" => ProviderSupport::Native,
        "workflow" => ProviderSupport::Workflow,
        "hotkey" => ProviderSupport::Hotkey,
        "deepLink" => ProviderSupport::DeepLink,
        "insertOnly" => ProviderSupport::InsertOnly,
        _ => ProviderSupport::Unsupported,
    }
}

pub fn catalog_can_interrupt(kind: Option<AgentKind>) -> bool {
    matches!(
        kind,
        Some(AgentKind::Claude | AgentKind::Codex | AgentKind::Cursor)
    )
}

fn obs_fresh(b: &CapabilityEvidenceBundle<'_>) -> bool {
    if b.obs_fresh_until > 0 {
        return b.obs_fresh_until >= b.evaluated_at_ms;
    }
    if b.obs_observed_at > 0 {
        return b.evaluated_at_ms.saturating_sub(b.obs_observed_at) < 120_000;
    }
    false
}

fn control_fresh(ev: &ControlEvidence, now: u64) -> bool {
    if ev.fresh_until > 0 {
        return ev.fresh_until >= now;
    }
    if ev.verified_at > 0 {
        return now.saturating_sub(ev.verified_at) < 120_000;
    }
    false
}

fn obs_stamp(b: &CapabilityEvidenceBundle<'_>) -> (Option<u64>, Option<u64>) {
    (
        Some(b.obs_observed_at).filter(|&t| t > 0),
        Some(b.obs_fresh_until).filter(|&t| t > 0),
    )
}

fn live_match_reason(m: LiveSessionMatch) -> Option<&'static str> {
    match m {
        LiveSessionMatch::Ambiguous => Some("ambiguous_session"),
        LiveSessionMatch::NotFound => Some("session_not_found"),
        _ => None,
    }
}

pub fn resolve_interrupt(b: &CapabilityEvidenceBundle<'_>) -> ResolvedCapability {
    let base = ResolvedCapability {
        id: "agent.interrupt".into(),
        state: "unknown".into(),
        support: ProviderSupport::Unsupported.as_str().into(),
        supported: false,
        enabled: false,
        source: b.obs_source.into(),
        reason: Some("provider_unsupported".into()),
        confidence: "low".into(),
        observed_at: None,
        fresh_until: None,
    };

    match b.kind {
        Some(AgentKind::Claude) => resolve_interrupt_claude(b, base),
        Some(AgentKind::Cursor) => resolve_interrupt_cursor(b, base),
        Some(AgentKind::Codex) => resolve_interrupt_codex(b, base),
        Some(_) => {
            if b.catalog_can_interrupt {
                ResolvedCapability {
                    state: "unavailable".into(),
                    reason: Some("no_instance_evidence".into()),
                    ..base
                }
            } else {
                ResolvedCapability {
                    state: "unsupported".into(),
                    reason: Some("provider_unsupported".into()),
                    confidence: "high".into(),
                    ..base
                }
            }
        }
        None => base,
    }
}

fn resolve_interrupt_claude(
    b: &CapabilityEvidenceBundle<'_>,
    base: ResolvedCapability,
) -> ResolvedCapability {
    let support = ProviderSupport::Native;
    let supported = true;
    let (obs_at, fresh_until) = obs_stamp(b);

    if b.obs_value == "unknown" {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("stale_observation".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }
    if !b.working {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("not_running".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }
    if !obs_fresh(b) {
        return ResolvedCapability {
            state: "stale".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("evidence_stale".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }

    let ext_ok = b
        .work
        .and_then(|w| w.external_session_id.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some();
    if !ext_ok {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("no_external_session".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }

    if let Some(w) = b.work {
        if let Some(r) = live_match_reason(w.live_match) {
            return ResolvedCapability {
                state: "unavailable".into(),
                support: support.as_str().into(),
                supported,
                enabled: false,
                source: b.obs_source.into(),
                reason: Some(r.into()),
                confidence: b.obs_confidence.into(),
                observed_at: obs_at,
                fresh_until,
                ..base
            };
        }
    }

    let Some(probe) = b.claude_background else {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "claudeBackground".into(),
            reason: Some("control_plane_unavailable".into()),
            confidence: "low".into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    };

    let probe_reason = match probe.state {
        ClaudeProbeState::Ok => None,
        ClaudeProbeState::CliUnavailable => Some("control_plane_unavailable"),
        ClaudeProbeState::Timeout => Some("probe_timeout"),
        ClaudeProbeState::CommandFailed => Some("probe_command_failed"),
        ClaudeProbeState::ParseError => Some("probe_parse_error"),
    };
    if let Some(r) = probe_reason {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "claudeBackground".into(),
            reason: Some(r.into()),
            confidence: probe.confidence.clone(),
            observed_at: Some(probe.observed_at).filter(|&t| t > 0),
            fresh_until: Some(probe.fresh_until).filter(|&t| t > 0),
            ..base
        };
    }
    if probe.fresh_until < b.evaluated_at_ms {
        return ResolvedCapability {
            state: "stale".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "claudeBackground".into(),
            reason: Some("stale_control_evidence".into()),
            confidence: probe.confidence.clone(),
            observed_at: Some(probe.observed_at).filter(|&t| t > 0),
            fresh_until: Some(probe.fresh_until).filter(|&t| t > 0),
            ..base
        };
    }

    let want = b
        .work
        .and_then(|w| w.external_session_id.as_deref())
        .map(str::trim)
        .unwrap_or("");
    match probe
        .sessions
        .iter()
        .find(|s| s.external_session_id.trim() == want)
    {
        None => ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "claudeBackground".into(),
            reason: Some("background_session_not_found".into()),
            confidence: probe.confidence.clone(),
            observed_at: Some(probe.observed_at).filter(|&t| t > 0),
            fresh_until: Some(probe.fresh_until).filter(|&t| t > 0),
            ..base
        },
        Some(s) if !s.active => ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "claudeBackground".into(),
            reason: Some("background_session_not_active".into()),
            confidence: probe.confidence.clone(),
            observed_at: Some(probe.observed_at).filter(|&t| t > 0),
            fresh_until: Some(probe.fresh_until).filter(|&t| t > 0),
            ..base
        },
        Some(_) => ResolvedCapability {
            state: "available".into(),
            support: support.as_str().into(),
            supported,
            enabled: true,
            source: "claudeBackground".into(),
            reason: None,
            confidence: probe.confidence.clone(),
            observed_at: Some(probe.observed_at).filter(|&t| t > 0),
            fresh_until: Some(probe.fresh_until).filter(|&t| t > 0),
            ..base
        },
    }
}

fn resolve_interrupt_cursor(
    b: &CapabilityEvidenceBundle<'_>,
    base: ResolvedCapability,
) -> ResolvedCapability {
    let support = ProviderSupport::Hotkey;
    let supported = true;
    let (obs_at, fresh_until) = obs_stamp(b);

    if !b.working {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("not_running".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }
    if !obs_fresh(b) {
        return ResolvedCapability {
            state: "stale".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("evidence_stale".into()),
            confidence: b.obs_confidence.into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }
    if !b.cursor_mapping_present {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "cursorMapping".into(),
            reason: Some("no_mapping_target".into()),
            confidence: "low".into(),
            observed_at: obs_at,
            fresh_until,
            ..base
        };
    }
    ResolvedCapability {
        state: "available".into(),
        support: support.as_str().into(),
        supported,
        enabled: true,
        source: "cursorMapping".into(),
        reason: None,
        confidence: b.obs_confidence.into(),
        observed_at: obs_at,
        fresh_until,
        ..base
    }
}

fn resolve_interrupt_codex(
    b: &CapabilityEvidenceBundle<'_>,
    base: ResolvedCapability,
) -> ResolvedCapability {
    let Some(ev) = b.control else {
        return ResolvedCapability {
            state: "unknown".into(),
            support: ProviderSupport::Unsupported.as_str().into(),
            supported: false,
            enabled: false,
            source: "codexBackground".into(),
            reason: Some("control_plane_unavailable".into()),
            confidence: "low".into(),
            ..base
        };
    };
    let support = ev.support;
    let supported = support != ProviderSupport::Unsupported;
    let conf = if ev.confidence.is_empty() {
        "low".into()
    } else {
        ev.confidence.clone()
    };
    if !control_fresh(ev, b.evaluated_at_ms) {
        return ResolvedCapability {
            state: "stale".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "codexBackground".into(),
            reason: Some("evidence_stale".into()),
            confidence: conf,
            observed_at: Some(ev.verified_at).filter(|&t| t > 0),
            fresh_until: Some(ev.fresh_until).filter(|&t| t > 0),
            ..base
        };
    }
    if !ev.enabled {
        return ResolvedCapability {
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported,
            enabled: false,
            source: "codexBackground".into(),
            reason: Some(
                ev.reason
                    .clone()
                    .unwrap_or_else(|| "control_plane_unavailable".into()),
            ),
            confidence: conf,
            observed_at: Some(ev.verified_at).filter(|&t| t > 0),
            fresh_until: Some(ev.fresh_until).filter(|&t| t > 0),
            ..base
        };
    }
    ResolvedCapability {
        state: "available".into(),
        support: support.as_str().into(),
        supported: true,
        enabled: true,
        source: "codexBackground".into(),
        reason: None,
        confidence: conf,
        observed_at: Some(ev.verified_at).filter(|&t| t > 0),
        fresh_until: Some(ev.fresh_until).filter(|&t| t > 0),
        ..base
    }
}

pub fn resolve_focus(b: &CapabilityEvidenceBundle<'_>) -> ResolvedCapability {
    let support = if b.catalog_can_focus && b.focus_executor_wired {
        ProviderSupport::Workflow
    } else {
        ProviderSupport::Unsupported
    };
    if !b.catalog_can_focus {
        return ResolvedCapability {
            id: "agent.focus".into(),
            state: "unsupported".into(),
            support: support.as_str().into(),
            supported: false,
            enabled: false,
            source: "catalog".into(),
            reason: Some("no_focus".into()),
            confidence: "high".into(),
            observed_at: None,
            fresh_until: None,
        };
    }
    if !b.focus_executor_wired {
        return ResolvedCapability {
            id: "agent.focus".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: false,
            enabled: false,
            source: "focusExecutor".into(),
            reason: Some("no_focus_executor".into()),
            confidence: "high".into(),
            observed_at: None,
            fresh_until: None,
        };
    }
    let ambiguous = b
        .work
        .map(|w| w.live_match == LiveSessionMatch::Ambiguous)
        .unwrap_or(false);
    if ambiguous {
        return ResolvedCapability {
            id: "agent.focus".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("ambiguous_session".into()),
            confidence: "medium".into(),
            observed_at: b.work.and_then(|w| w.observed_at),
            fresh_until: b.work.and_then(|w| w.fresh_until),
        };
    }
    ResolvedCapability {
        id: "agent.focus".into(),
        state: "available".into(),
        support: support.as_str().into(),
        supported: true,
        enabled: true,
        source: "focusExecutor".into(),
        reason: None,
        confidence: "high".into(),
        observed_at: None,
        fresh_until: None,
    }
}

pub fn resolve_resume(b: &CapabilityEvidenceBundle<'_>) -> ResolvedCapability {
    let kind_ok = matches!(b.kind, Some(AgentKind::Claude) | Some(AgentKind::Codex));
    let supported = b.catalog_can_resume && kind_ok;
    let support = if supported {
        ProviderSupport::Native
    } else {
        ProviderSupport::Unsupported
    };
    if !supported {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unsupported".into(),
            support: support.as_str().into(),
            supported: false,
            enabled: false,
            source: "catalog".into(),
            reason: Some("no_resume".into()),
            confidence: "high".into(),
            observed_at: None,
            fresh_until: None,
        };
    }
    let Some(work) = b.work else {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("no_external_session".into()),
            confidence: "low".into(),
            observed_at: None,
            fresh_until: None,
        };
    };
    if work.external_session_id.as_deref().unwrap_or("").is_empty() {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("no_external_session".into()),
            confidence: "low".into(),
            observed_at: work.observed_at,
            fresh_until: work.fresh_until,
        };
    }
    if work.live_match == LiveSessionMatch::Ambiguous {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("ambiguous_session".into()),
            confidence: "medium".into(),
            observed_at: work.observed_at,
            fresh_until: work.fresh_until,
        };
    }
    if work.live_match == LiveSessionMatch::NotFound {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("session_not_found".into()),
            confidence: "medium".into(),
            observed_at: work.observed_at,
            fresh_until: work.fresh_until,
        };
    }
    if work.lane_id.is_none() || !work.can_resume.value {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "unavailable".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: "laneTarget".into(),
            reason: work
                .can_resume
                .reason
                .clone()
                .or_else(|| Some("no_lane".into())),
            confidence: work.confidence.clone(),
            observed_at: work.observed_at,
            fresh_until: work.fresh_until,
        };
    }
    if !work.can_resume.fresh {
        return ResolvedCapability {
            id: "session.resume".into(),
            state: "stale".into(),
            support: support.as_str().into(),
            supported: true,
            enabled: false,
            source: b.obs_source.into(),
            reason: Some("evidence_stale".into()),
            confidence: work.confidence.clone(),
            observed_at: work.observed_at,
            fresh_until: work.fresh_until,
        };
    }
    ResolvedCapability {
        id: "session.resume".into(),
        state: "available".into(),
        support: support.as_str().into(),
        supported: true,
        enabled: true,
        source: "laneTarget".into(),
        reason: None,
        confidence: work.confidence.clone(),
        observed_at: work.observed_at,
        fresh_until: work.fresh_until,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_memory::claude_background::ClaudeBackgroundSession;
    use crate::agent_memory::work_descriptor::{EvidenceBool, WorkDescriptor};

    fn empty_work() -> WorkDescriptor {
        WorkDescriptor {
            canonical_session_id: "sid".into(),
            external_session_id: Some("ext-1".into()),
            lane_id: Some("claude:session:ext-1".into()),
            title: None,
            title_source: "unknown".into(),
            title_derived_from: None,
            state: "working".into(),
            state_source: "obs".into(),
            cwd: Some("/tmp".into()),
            hwnd: Some(1),
            can_focus_live: EvidenceBool {
                value: true,
                reason: None,
                fresh: true,
            },
            can_resume: EvidenceBool {
                value: true,
                reason: None,
                fresh: true,
            },
            can_open_exact_session: EvidenceBool {
                value: true,
                reason: None,
                fresh: true,
            },
            observed_at: Some(100),
            fresh_until: Some(200_000),
            confidence: "high".into(),
            live_match: LiveSessionMatch::Exact,
        }
    }

    fn base_bundle<'a>(
        kind: Option<AgentKind>,
        work: Option<&'a WorkDescriptor>,
        control: Option<&'a ControlEvidence>,
        claude_background: Option<&'a ClaudeBackgroundProbe>,
    ) -> CapabilityEvidenceBundle<'a> {
        CapabilityEvidenceBundle {
            kind,
            catalog_can_focus: true,
            catalog_can_resume: true,
            catalog_can_interrupt: catalog_can_interrupt(kind),
            focus_executor_wired: true,
            cursor_mapping_present: false,
            work,
            control,
            claude_background,
            working: true,
            obs_value: "working",
            obs_source: "officialHook",
            obs_observed_at: 100,
            obs_fresh_until: 200_000,
            obs_confidence: "high",
            evaluated_at_ms: 150,
        }
    }

    fn active_probe(id: &str, now: u64) -> ClaudeBackgroundProbe {
        ClaudeBackgroundProbe {
            state: ClaudeProbeState::Ok,
            sessions: vec![ClaudeBackgroundSession {
                external_session_id: id.into(),
                active: true,
                cwd: None,
            }],
            observed_at: now,
            fresh_until: now + 3_000,
            confidence: "high".into(),
        }
    }

    #[test]
    fn provider_support_from_str_covers_six_states() {
        assert_eq!(provider_support_from_str("native"), ProviderSupport::Native);
        assert_eq!(
            provider_support_from_str("workflow"),
            ProviderSupport::Workflow
        );
        assert_eq!(provider_support_from_str("hotkey"), ProviderSupport::Hotkey);
        assert_eq!(
            provider_support_from_str("deepLink"),
            ProviderSupport::DeepLink
        );
        assert_eq!(
            provider_support_from_str("insertOnly"),
            ProviderSupport::InsertOnly
        );
        assert_eq!(
            provider_support_from_str("unsupported"),
            ProviderSupport::Unsupported
        );
        assert_eq!(
            provider_support_from_str("bogus"),
            ProviderSupport::Unsupported
        );
    }

    // --- Golden cases 1–14 Claude ---

    #[test]
    fn golden_claude_1_unknown_observation() {
        let work = empty_work();
        let mut b = base_bundle(Some(AgentKind::Claude), Some(&work), None, None);
        b.obs_value = "unknown";
        b.working = false;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("stale_observation"));
    }

    #[test]
    fn golden_claude_2_not_working() {
        let work = empty_work();
        let mut b = base_bundle(Some(AgentKind::Claude), Some(&work), None, None);
        b.working = false;
        b.obs_value = "idle";
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("not_running"));
    }

    #[test]
    fn golden_claude_3_observation_stale() {
        let work = empty_work();
        let probe = active_probe("ext-1", 150);
        let mut b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        b.obs_fresh_until = 50;
        b.obs_observed_at = 1;
        b.evaluated_at_ms = 200_000;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("evidence_stale"));
    }

    #[test]
    fn golden_claude_4_no_external_session() {
        let mut work = empty_work();
        work.external_session_id = None;
        let probe = active_probe("ext-1", 150);
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_external_session"));
    }

    #[test]
    fn golden_claude_5_ambiguous_session() {
        let mut work = empty_work();
        work.live_match = LiveSessionMatch::Ambiguous;
        let probe = active_probe("ext-1", 150);
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("ambiguous_session"));
    }

    #[test]
    fn golden_claude_session_not_found_distinct() {
        let mut work = empty_work();
        work.live_match = LiveSessionMatch::NotFound;
        let probe = active_probe("ext-1", 150);
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("session_not_found"));
    }

    #[test]
    fn golden_claude_6_no_background_probe() {
        let work = empty_work();
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, None);
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("control_plane_unavailable"));
        assert_eq!(r.source, "claudeBackground");
    }

    #[test]
    fn golden_claude_7_to_10_probe_states() {
        let work = empty_work();
        for (state, reason) in [
            (
                ClaudeProbeState::CliUnavailable,
                "control_plane_unavailable",
            ),
            (ClaudeProbeState::Timeout, "probe_timeout"),
            (ClaudeProbeState::CommandFailed, "probe_command_failed"),
            (ClaudeProbeState::ParseError, "probe_parse_error"),
        ] {
            let probe = ClaudeBackgroundProbe {
                state,
                sessions: vec![],
                observed_at: 150,
                fresh_until: 3_150,
                confidence: "low".into(),
            };
            let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
            let r = resolve_interrupt(&b);
            assert!(!r.enabled, "{reason}");
            assert_eq!(r.reason.as_deref(), Some(reason));
        }
    }

    #[test]
    fn golden_claude_11_stale_probe() {
        let work = empty_work();
        let probe = ClaudeBackgroundProbe {
            state: ClaudeProbeState::Ok,
            sessions: vec![ClaudeBackgroundSession {
                external_session_id: "ext-1".into(),
                active: true,
                cwd: None,
            }],
            observed_at: 10,
            fresh_until: 100,
            confidence: "high".into(),
        };
        let mut b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        b.evaluated_at_ms = 200;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("stale_control_evidence"));
    }

    #[test]
    fn golden_claude_12_session_mismatch() {
        let work = empty_work();
        let probe = active_probe("other", 150);
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("background_session_not_found"));
    }

    #[test]
    fn golden_claude_13_session_inactive() {
        let work = empty_work();
        let probe = ClaudeBackgroundProbe {
            state: ClaudeProbeState::Ok,
            sessions: vec![ClaudeBackgroundSession {
                external_session_id: "ext-1".into(),
                active: false,
                cwd: None,
            }],
            observed_at: 150,
            fresh_until: 3_150,
            confidence: "high".into(),
        };
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("background_session_not_active"));
    }

    #[test]
    fn golden_claude_14_ok_fresh_exact_active() {
        let work = empty_work();
        let probe = active_probe("ext-1", 150);
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, Some(&probe));
        let r = resolve_interrupt(&b);
        assert!(r.enabled);
        assert_eq!(r.support, "native");
        assert_eq!(r.state, "available");
        assert!(r.reason.is_none());
        assert_eq!(r.source, "claudeBackground");
        assert_eq!(r.confidence, "high");
    }

    // --- Cursor 15–18 ---

    #[test]
    fn golden_cursor_15_not_running() {
        let mut b = base_bundle(Some(AgentKind::Cursor), None, None, None);
        b.working = false;
        b.obs_value = "idle";
        b.cursor_mapping_present = true;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("not_running"));
    }

    #[test]
    fn golden_cursor_16_stale() {
        let mut b = base_bundle(Some(AgentKind::Cursor), None, None, None);
        b.cursor_mapping_present = true;
        b.obs_fresh_until = 10;
        b.evaluated_at_ms = 200_000;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("evidence_stale"));
    }

    #[test]
    fn golden_cursor_17_no_mapping() {
        let b = base_bundle(Some(AgentKind::Cursor), None, None, None);
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_mapping_target"));
    }

    #[test]
    fn golden_cursor_18_enabled_hotkey() {
        let mut b = base_bundle(Some(AgentKind::Cursor), None, None, None);
        b.cursor_mapping_present = true;
        let r = resolve_interrupt(&b);
        assert!(r.enabled);
        assert_eq!(r.support, "hotkey");
        assert_eq!(r.source, "cursorMapping");
    }

    // --- Codex 20–24 ---

    #[test]
    fn golden_codex_20_missing_control() {
        let b = base_bundle(Some(AgentKind::Codex), None, None, None);
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("control_plane_unavailable"));
        assert_ne!(r.confidence, "emulated");
    }

    #[test]
    fn golden_codex_21_stale_evidence() {
        let ev = ControlEvidence {
            action: "agent.interrupt".into(),
            support: ProviderSupport::Hotkey,
            target_external_session_id: Some("ext-1".into()),
            verified_at: 1,
            fresh_until: 10,
            reason: None,
            capability: "emulated".into(),
            confidence: "high".into(),
            enabled: true,
        };
        let mut b = base_bundle(Some(AgentKind::Codex), None, Some(&ev), None);
        b.evaluated_at_ms = 50_000;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("evidence_stale"));
        assert_eq!(r.confidence, "high");
    }

    #[test]
    fn golden_codex_23_no_window_target() {
        let ev = ControlEvidence {
            action: "agent.interrupt".into(),
            support: ProviderSupport::Hotkey,
            target_external_session_id: None,
            verified_at: 100,
            fresh_until: 200_000,
            reason: Some("no_window_target".into()),
            capability: "unknown".into(),
            confidence: "medium".into(),
            enabled: false,
        };
        let b = base_bundle(Some(AgentKind::Codex), None, Some(&ev), None);
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_window_target"));
        assert_eq!(r.support, "hotkey");
    }

    #[test]
    fn golden_codex_24_enabled_hotkey_emulated_not_confidence() {
        let ev = ControlEvidence {
            action: "agent.interrupt".into(),
            support: ProviderSupport::Hotkey,
            target_external_session_id: Some("ext-1".into()),
            verified_at: 100,
            fresh_until: 200_000,
            reason: None,
            capability: "emulated".into(),
            confidence: "high".into(),
            enabled: true,
        };
        let b = base_bundle(Some(AgentKind::Codex), None, Some(&ev), None);
        let r = resolve_interrupt(&b);
        assert!(r.enabled);
        assert_eq!(r.support, "hotkey");
        assert_eq!(r.source, "codexBackground");
        assert_eq!(r.confidence, "high");
        assert_ne!(r.confidence, "emulated");
    }

    // --- Other 26–29 ---

    #[test]
    fn golden_26_unsupported_provider() {
        let b = base_bundle(Some(AgentKind::Gemini), None, None, None);
        assert!(!b.catalog_can_interrupt);
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("provider_unsupported"));
    }

    #[test]
    fn golden_27_ceiling_true_without_instance() {
        let mut b = base_bundle(Some(AgentKind::Aider), None, None, None);
        b.catalog_can_interrupt = true;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_instance_evidence"));
    }

    #[test]
    fn golden_28_focus_baseline() {
        let mut b = base_bundle(Some(AgentKind::Claude), None, None, None);
        b.focus_executor_wired = false;
        let r = resolve_focus(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_focus_executor"));
    }

    #[test]
    fn golden_29_resume_baseline() {
        let mut work = empty_work();
        work.lane_id = None;
        work.can_resume.value = false;
        work.can_resume.reason = Some("no_lane".into());
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, None);
        let r = resolve_resume(&b);
        assert!(r.supported);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_lane"));
    }

    #[test]
    fn catalog_true_without_instance_does_not_enable_interrupt() {
        let mut b = base_bundle(Some(AgentKind::Aider), None, None, None);
        b.catalog_can_interrupt = true;
        let r = resolve_interrupt(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_instance_evidence"));
    }

    #[test]
    fn resume_requires_exact_lane_target() {
        let mut work = empty_work();
        work.lane_id = None;
        work.can_resume.value = false;
        work.can_resume.reason = Some("no_lane".into());
        let b = base_bundle(Some(AgentKind::Claude), Some(&work), None, None);
        let r = resolve_resume(&b);
        assert!(r.supported);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_lane"));
    }

    #[test]
    fn focus_catalog_only_not_enough_without_executor() {
        let mut b = base_bundle(Some(AgentKind::Claude), None, None, None);
        b.focus_executor_wired = false;
        b.working = false;
        b.obs_value = "idle";
        b.obs_observed_at = 0;
        b.obs_fresh_until = 0;
        b.obs_confidence = "low";
        let r = resolve_focus(&b);
        assert!(!r.enabled);
        assert_eq!(r.reason.as_deref(), Some("no_focus_executor"));
    }
}
