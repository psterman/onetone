//! Codex control-plane evidence — isomorphic to Claude background probe.
//!
//! Production has no verified Codex CLI JSON schema yet. System runner always
//! fail-closes (Unsupported / CliUnavailable). Injected runners enable unit tests
//! of cache / policy / ControlEvidence gating without inventing CLI fields.

use crate::agent::actions::ProviderSupport;
use crate::agent_memory::store::now_ms;
use std::sync::{Mutex, OnceLock};

pub const PROBE_TTL_MS: u64 = 3_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbePolicy {
    Cached,
    ForceFresh,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexProbeState {
    Ok,
    CliUnavailable,
    Timeout,
    CommandFailed,
    ParseError,
    /// No verified control surface — honest default for production.
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexBackgroundSession {
    pub external_session_id: String,
    pub active: bool,
    /// Window / focus target verified for this instance (required for enabled).
    pub window_addressable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexBackgroundProbe {
    pub state: CodexProbeState,
    pub sessions: Vec<CodexBackgroundSession>,
    pub observed_at: u64,
    pub fresh_until: u64,
    pub confidence: String,
}

impl CodexBackgroundProbe {
    pub fn error_state(state: CodexProbeState, observed_at: u64) -> Self {
        Self {
            state,
            sessions: Vec::new(),
            observed_at,
            fresh_until: observed_at.saturating_add(PROBE_TTL_MS),
            confidence: "low".into(),
        }
    }

    pub fn unsupported(now: u64) -> Self {
        Self::error_state(CodexProbeState::Unsupported, now)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlEvidence {
    pub action: String,
    /// Mechanism ceiling (`Hotkey` max without Native window protocol).
    pub support: ProviderSupport,
    pub target_external_session_id: Option<String>,
    pub verified_at: u64,
    pub fresh_until: u64,
    pub reason: Option<String>,
    /// Capability semantic: Emulated only when session+window evidence present.
    pub capability: String,
    /// Belief strength only: high | medium | low (never equals capability).
    pub confidence: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexRunError {
    Unavailable,
    Timeout,
    CommandFailed { detail: String },
    Unsupported,
}

pub trait CodexProbeRunner: Send + Sync {
    fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe;
}

/// Production runner — no invented CLI schema; always Unsupported.
pub struct SystemCodexRunner;

impl CodexProbeRunner for SystemCodexRunner {
    fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
        CodexBackgroundProbe::unsupported(now)
    }
}

pub struct CodexProbeCache {
    inner: Mutex<Option<CodexBackgroundProbe>>,
}

impl CodexProbeCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    pub fn invalidate(&self) {
        if let Ok(mut g) = self.inner.lock() {
            *g = None;
        }
    }

    fn peek_fresh(&self, now: u64) -> Option<CodexBackgroundProbe> {
        let g = self.inner.lock().ok()?;
        let p = g.as_ref()?;
        if p.fresh_until >= now {
            Some(p.clone())
        } else {
            None
        }
    }

    fn store(&self, probe: CodexBackgroundProbe) {
        if let Ok(mut g) = self.inner.lock() {
            *g = Some(probe);
        }
    }
}

impl Default for CodexProbeCache {
    fn default() -> Self {
        Self::new()
    }
}

fn process_cache() -> &'static CodexProbeCache {
    static CACHE: OnceLock<CodexProbeCache> = OnceLock::new();
    CACHE.get_or_init(CodexProbeCache::new)
}

pub fn system_runner() -> SystemCodexRunner {
    SystemCodexRunner
}

pub fn process_probe_cache() -> &'static CodexProbeCache {
    process_cache()
}

pub fn get_probe(
    policy: ProbePolicy,
    runner: &dyn CodexProbeRunner,
    cache: &CodexProbeCache,
) -> CodexBackgroundProbe {
    let now = now_ms();
    if matches!(policy, ProbePolicy::Cached) {
        if let Some(hit) = cache.peek_fresh(now) {
            return hit;
        }
    }
    let probe = runner.probe_evidence(now);
    cache.store(probe.clone());
    probe
}

/// Exact external session id + active. Window disappearance alone is not "stopped".
pub fn session_still_active(probe: &CodexBackgroundProbe, external_session_id: &str) -> bool {
    if probe.state != CodexProbeState::Ok {
        return false;
    }
    let want = external_session_id.trim();
    if want.is_empty() {
        return false;
    }
    probe
        .sessions
        .iter()
        .any(|s| s.external_session_id.trim() == want && s.active)
}

/// Find exact session row (active or not). Missing id is a mismatch, not Verified.
pub fn find_session<'a>(
    probe: &'a CodexBackgroundProbe,
    external_session_id: &str,
) -> Option<&'a CodexBackgroundSession> {
    if probe.state != CodexProbeState::Ok {
        return None;
    }
    let want = external_session_id.trim();
    if want.is_empty() {
        return None;
    }
    probe
        .sessions
        .iter()
        .find(|s| s.external_session_id.trim() == want)
}

/// Resolve interrupt ControlEvidence. support and enabled are separated.
///
/// Enabled only when:
/// - probe.state == Ok
/// - exact external_session_id match
/// - session.active
/// - window_addressable
/// - evidence fresh vs evaluated_at
/// - agent observed working
pub fn resolve_interrupt_evidence(
    probe: Option<&CodexBackgroundProbe>,
    external_session_id: Option<&str>,
    working: bool,
    evaluated_at_ms: u64,
) -> ControlEvidence {
    let unsupported = |reason: &str| ControlEvidence {
        action: "agent.interrupt".into(),
        support: ProviderSupport::Unsupported,
        target_external_session_id: None,
        verified_at: evaluated_at_ms,
        fresh_until: evaluated_at_ms,
        reason: Some(reason.into()),
        capability: "unsupported".into(),
        confidence: "low".into(),
        enabled: false,
    };

    if !working {
        return unsupported("not_running");
    }

    let Some(probe) = probe else {
        return unsupported("control_plane_unavailable");
    };

    let reason = match probe.state {
        CodexProbeState::Ok => None,
        CodexProbeState::CliUnavailable => Some("control_plane_unavailable"),
        CodexProbeState::Timeout => Some("probe_timeout"),
        CodexProbeState::CommandFailed => Some("probe_command_failed"),
        CodexProbeState::ParseError => Some("probe_parse_error"),
        CodexProbeState::Unsupported => Some("provider_unsupported"),
    };
    if let Some(r) = reason {
        return unsupported(r);
    }
    if probe.fresh_until < evaluated_at_ms {
        return unsupported("stale_control_evidence");
    }

    let want = external_session_id.map(str::trim).filter(|s| !s.is_empty());
    let Some(want) = want else {
        return unsupported("no_external_session");
    };

    match probe
        .sessions
        .iter()
        .find(|s| s.external_session_id.trim() == want)
    {
        None => unsupported("background_session_not_found"),
        Some(s) if !s.active => unsupported("background_session_not_active"),
        Some(s) if !s.window_addressable => ControlEvidence {
            // Session known but no window — Hotkey ceiling, capability unknown, not enabled.
            action: "agent.interrupt".into(),
            support: ProviderSupport::Hotkey,
            target_external_session_id: None,
            verified_at: probe.observed_at,
            fresh_until: probe.fresh_until,
            reason: Some("no_window_target".into()),
            capability: "unknown".into(),
            confidence: probe.confidence.clone(),
            enabled: false,
        },
        Some(_) => ControlEvidence {
            action: "agent.interrupt".into(),
            support: ProviderSupport::Hotkey,
            target_external_session_id: Some(want.to_string()),
            verified_at: probe.observed_at,
            fresh_until: probe.fresh_until,
            reason: None,
            capability: "emulated".into(),
            confidence: probe.confidence.clone(),
            enabled: true,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex as StdMutex;

    struct FakeRunner {
        state: StdMutex<CodexProbeState>,
        calls: AtomicUsize,
    }

    impl CodexProbeRunner for FakeRunner {
        fn probe_evidence(&self, now: u64) -> CodexBackgroundProbe {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let state = *self.state.lock().unwrap();
            CodexBackgroundProbe {
                state,
                sessions: Vec::new(),
                observed_at: now,
                fresh_until: now.saturating_add(PROBE_TTL_MS),
                confidence: "low".into(),
            }
        }
    }

    fn ok_active(id: &str, window: bool, now: u64) -> CodexBackgroundProbe {
        CodexBackgroundProbe {
            state: CodexProbeState::Ok,
            sessions: vec![CodexBackgroundSession {
                external_session_id: id.into(),
                active: true,
                window_addressable: window,
            }],
            observed_at: now,
            fresh_until: now + PROBE_TTL_MS,
            confidence: "high".into(),
        }
    }

    #[test]
    fn system_runner_unsupported() {
        let p = SystemCodexRunner.probe_evidence(100);
        assert_eq!(p.state, CodexProbeState::Unsupported);
        assert!(p.sessions.is_empty());
    }

    #[test]
    fn cached_avoids_repeat_force_fresh_reruns() {
        let runner = FakeRunner {
            state: StdMutex::new(CodexProbeState::Unsupported),
            calls: AtomicUsize::new(0),
        };
        let cache = CodexProbeCache::new();
        let _ = get_probe(ProbePolicy::Cached, &runner, &cache);
        let _ = get_probe(ProbePolicy::Cached, &runner, &cache);
        assert_eq!(runner.calls.load(Ordering::SeqCst), 1);
        let _ = get_probe(ProbePolicy::ForceFresh, &runner, &cache);
        assert_eq!(runner.calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn empty_and_error_states_fail_closed() {
        let now = now_ms();
        let ev = resolve_interrupt_evidence(
            Some(&CodexBackgroundProbe {
                state: CodexProbeState::Ok,
                sessions: vec![],
                observed_at: now,
                fresh_until: now + PROBE_TTL_MS,
                confidence: "high".into(),
            }),
            Some("x"),
            true,
            now,
        );
        assert!(!ev.enabled);
        assert!(ev.target_external_session_id.is_none());

        for st in [
            CodexProbeState::Timeout,
            CodexProbeState::CliUnavailable,
            CodexProbeState::CommandFailed,
            CodexProbeState::ParseError,
            CodexProbeState::Unsupported,
        ] {
            let ev = resolve_interrupt_evidence(
                Some(&CodexBackgroundProbe::error_state(st, now)),
                Some("x"),
                true,
                now,
            );
            assert!(!ev.enabled);
            assert_eq!(ev.support, ProviderSupport::Unsupported);
            assert!(ev.target_external_session_id.is_none());
        }
    }

    #[test]
    fn working_alone_not_emulated_enabled() {
        let now = now_ms();
        let ev = resolve_interrupt_evidence(None, Some("x"), true, now);
        assert!(!ev.enabled);
        assert_ne!(ev.capability, "emulated");
        assert_eq!(ev.support, ProviderSupport::Unsupported);
    }

    #[test]
    fn active_exact_id_without_window_not_enabled() {
        let now = now_ms();
        let probe = ok_active("ext-1", false, now);
        let ev = resolve_interrupt_evidence(Some(&probe), Some("ext-1"), true, now);
        assert!(!ev.enabled);
        assert_eq!(ev.support, ProviderSupport::Hotkey);
        assert_eq!(ev.capability, "unknown");
        assert!(ev.target_external_session_id.is_none());
        assert_eq!(ev.reason.as_deref(), Some("no_window_target"));
    }

    #[test]
    fn active_exact_id_with_window_emulated_enabled() {
        let now = now_ms();
        let probe = ok_active("ext-1", true, now);
        let ev = resolve_interrupt_evidence(Some(&probe), Some("ext-1"), true, now);
        assert!(ev.enabled);
        assert_eq!(ev.support, ProviderSupport::Hotkey);
        assert_eq!(ev.capability, "emulated");
        assert_eq!(ev.target_external_session_id.as_deref(), Some("ext-1"));
    }

    #[test]
    fn unsupported_produces_no_target() {
        let now = now_ms();
        let ev = resolve_interrupt_evidence(
            Some(&CodexBackgroundProbe::unsupported(now)),
            Some("ext"),
            true,
            now,
        );
        assert!(ev.target_external_session_id.is_none());
        assert!(!ev.enabled);
    }

    #[test]
    fn session_still_active_exact_match_only() {
        let now = now_ms();
        let probe = ok_active("abc-123", true, now);
        assert!(session_still_active(&probe, "abc-123"));
        assert!(session_still_active(&probe, "  abc-123  "));
        assert!(!session_still_active(&probe, "abc"));
        assert!(!session_still_active(&probe, "abc-1234"));
        let inactive = CodexBackgroundProbe {
            state: CodexProbeState::Ok,
            sessions: vec![CodexBackgroundSession {
                external_session_id: "abc-123".into(),
                active: false,
                window_addressable: true,
            }],
            observed_at: now,
            fresh_until: now + PROBE_TTL_MS,
            confidence: "high".into(),
        };
        assert!(!session_still_active(&inactive, "abc-123"));
        assert!(find_session(&inactive, "abc-123").is_some());
        assert!(find_session(&probe, "missing").is_none());
    }
}
