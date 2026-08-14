//! AgentAttentionStore — raise/clear + waiting_kinds projection for Soft Pad Arbiter.

use super::model::{
    AgentAttentionSignal, AttentionCause, AttentionPublicRow, AttentionPublicSnapshot,
    AttentionState, Confidence, SignalKey, SignalSource, NEEDS_INPUT_WATCHDOG_MS,
};
use crate::soft_pad_runtime::AgentKind;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

static SEQUENCE: AtomicU64 = AtomicU64::new(1);
static STORE: Mutex<Option<AttentionStoreInner>> = Mutex::new(None);
static LAST_WAITING_SIG: Mutex<Vec<AgentKind>> = Mutex::new(Vec::new());
static REVISION: AtomicU64 = AtomicU64::new(0);

static RECOMPUTE_HOOK: Mutex<Option<Arc<dyn Fn() + Send + Sync>>> = Mutex::new(None);
static SOUND_HOOK: Mutex<Option<Arc<dyn Fn(&str, &str) + Send + Sync>>> = Mutex::new(None);
static WORKING_SINCE: Mutex<Option<HashMap<AgentKind, Instant>>> = Mutex::new(None);

pub const MIN_AGENT_TASK_MS: u64 = 3000;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RaiseOutcome {
    pub accepted: bool,
    /// NeedsInput: true only when the SignalKey was newly inserted (not a refresh).
    pub signal_inserted: bool,
    /// Lifecycle: true when previous state != new state.
    pub state_changed: bool,
    pub waiting_set_changed: bool,
}

pub fn set_recompute_hook<F>(hook: F)
where
    F: Fn() + Send + Sync + 'static,
{
    if let Ok(mut g) = RECOMPUTE_HOOK.lock() {
        *g = Some(Arc::new(hook));
    }
}

/// Emit typed sound event id + dedupe key (FE applies when_unseen / categories).
pub fn set_sound_hook<F>(hook: F)
where
    F: Fn(&str, &str) + Send + Sync + 'static,
{
    if let Ok(mut g) = SOUND_HOOK.lock() {
        *g = Some(Arc::new(hook));
    }
}

fn fire_recompute_hook() {
    // Drop RECOMPUTE_HOOK before calling — hook locks cfg; holding both deadlocks
    // against build_snapshot / set_purpose paths.
    let hook = RECOMPUTE_HOOK
        .lock()
        .ok()
        .and_then(|g| g.as_ref().cloned());
    if let Some(hook) = hook {
        hook();
    }
}

fn fire_sound_hook(event_id: &str, dedupe_key: &str) {
    let hook = SOUND_HOOK
        .lock()
        .ok()
        .and_then(|g| g.as_ref().cloned());
    if let Some(hook) = hook {
        hook(event_id, dedupe_key);
    }
}

/// Public emit for non-attention typed events (pad fail, etc.).
pub fn emit_sound_event(event_id: &str, dedupe_key: &str) {
    fire_sound_hook(event_id, dedupe_key);
}

fn note_working(agent: AgentKind) {
    if let Ok(mut g) = WORKING_SINCE.lock() {
        g.get_or_insert_with(HashMap::new)
            .entry(agent)
            .or_insert_with(Instant::now);
    }
}

fn take_task_ms(agent: AgentKind) -> u64 {
    let since = WORKING_SINCE
        .lock()
        .ok()
        .and_then(|mut g| g.as_mut().and_then(|m| m.remove(&agent)));
    match since {
        Some(t) => t.elapsed().as_millis() as u64,
        None => 0,
    }
}

fn clear_working(agent: AgentKind) {
    if let Ok(mut g) = WORKING_SINCE.lock() {
        if let Some(m) = g.as_mut() {
            m.remove(&agent);
        }
    }
}

struct AttentionStoreInner {
    /// Active NeedsInput keyed by agent+session+request.
    signals: HashMap<SignalKey, AgentAttentionSignal>,
    /// Latest non-waiting lifecycle per agent (Working/Idle/Complete/Error) for status bar.
    lifecycle: HashMap<AgentKind, AgentAttentionSignal>,
}

impl Default for AttentionStoreInner {
    fn default() -> Self {
        Self {
            signals: HashMap::new(),
            lifecycle: HashMap::new(),
        }
    }
}

fn now_ms_wall() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn instant_to_wall_approx(observed: Instant, now: Instant) -> u64 {
    let age = now.saturating_duration_since(observed);
    now_ms_wall().saturating_sub(age.as_millis() as u64)
}

fn with_store<R>(f: impl FnOnce(&mut AttentionStoreInner) -> R) -> R {
    let mut g = STORE.lock().unwrap_or_else(|e| e.into_inner());
    if g.is_none() {
        *g = Some(AttentionStoreInner::default());
    }
    f(g.as_mut().unwrap())
}

fn next_seq() -> u64 {
    SEQUENCE.fetch_add(1, Ordering::AcqRel)
}

fn prune_expired(inner: &mut AttentionStoreInner, now: Instant) -> bool {
    let before = inner.signals.len();
    inner.signals.retain(|_, s| match s.expires_at {
        Some(exp) => exp > now,
        None => true,
    });
    before != inner.signals.len()
}

/// Project waiting agents: NeedsInput + source eligible, earliest-first by observed_at.
pub fn project_waiting_kinds() -> (Vec<AgentKind>, Vec<Instant>) {
    let now = Instant::now();
    with_store(|inner| {
        prune_expired(inner, now);
        let mut rows: Vec<&AgentAttentionSignal> = inner
            .signals
            .values()
            .filter(|s| {
                s.state == AttentionState::NeedsInput
                    && s.source.can_enter_waiting()
                    && signal_allows_waiting(s)
            })
            .collect();
        rows.sort_by(|a, b| {
            a.observed_at
                .cmp(&b.observed_at)
                .then_with(|| a.sequence.cmp(&b.sequence))
        });
        // One entry per agent (earliest wins).
        let mut seen = Vec::new();
        let mut kinds = Vec::new();
        let mut ats = Vec::new();
        for s in rows {
            if seen.contains(&s.agent) {
                continue;
            }
            seen.push(s.agent);
            kinds.push(s.agent);
            ats.push(s.observed_at);
        }
        (kinds, ats)
    })
}

fn signal_allows_waiting(s: &AgentAttentionSignal) -> bool {
    match s.agent {
        AgentKind::Claude
        | AgentKind::Codex
        | AgentKind::CopilotCli
        | AgentKind::WorkBuddy
        | AgentKind::Trae
        | AgentKind::Qoder => true,
        AgentKind::Cursor | AgentKind::MiniMax => {
            // Official Cursor waiting only when gated open; OneTone ask always allowed.
            s.source == SignalSource::OneToneAsk
                || crate::agent_catalog::cursor_can_observe_needs_input()
        }
    }
}

fn agent_allows_waiting_row(agent: AgentKind, source: SignalSource) -> bool {
    match agent {
        AgentKind::Claude
        | AgentKind::Codex
        | AgentKind::CopilotCli
        | AgentKind::WorkBuddy
        | AgentKind::Trae
        | AgentKind::Qoder => true,
        AgentKind::Cursor | AgentKind::MiniMax => {
            source == SignalSource::OneToneAsk
                || crate::agent_catalog::cursor_can_observe_needs_input()
        }
    }
}

fn notify_if_waiting_changed() {
    let (kinds, _) = project_waiting_kinds();
    let changed = {
        let mut last = LAST_WAITING_SIG
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if *last == kinds {
            false
        } else {
            *last = kinds;
            true
        }
    };
    if changed {
        REVISION.fetch_add(1, Ordering::AcqRel);
        fire_recompute_hook();
    }
}

/// Raise or refresh a NeedsInput / lifecycle signal. Out-of-order sequences are ignored.
pub fn raise(mut signal: AgentAttentionSignal) -> RaiseOutcome {
    let now = Instant::now();
    if signal.sequence == 0 {
        signal.sequence = next_seq();
    }
    if signal.state == AttentionState::NeedsInput && signal.expires_at.is_none() {
        signal.expires_at = Some(now + Duration::from_millis(NEEDS_INPUT_WATCHDOG_MS));
    }

    let emit_snapshot = signal.clone();
    let waiting_before = project_waiting_kinds().0;
    let outcome = with_store(|inner| {
        prune_expired(inner, now);
        if signal.state == AttentionState::NeedsInput {
            if !signal.source.can_enter_waiting() {
                let prev_state = inner.lifecycle.get(&signal.agent).map(|s| s.state);
                let state_changed = prev_state != Some(signal.state);
                inner.lifecycle.insert(signal.agent, signal);
                return RaiseOutcome {
                    accepted: true,
                    signal_inserted: false,
                    state_changed,
                    waiting_set_changed: false,
                };
            }
            let key = signal.key();
            if let Some(prev) = inner.signals.get(&key) {
                if signal.sequence < prev.sequence {
                    return RaiseOutcome::default();
                }
                inner.signals.insert(key, signal);
                return RaiseOutcome {
                    accepted: true,
                    signal_inserted: false,
                    state_changed: false,
                    waiting_set_changed: false,
                };
            }
            inner.signals.insert(key, signal);
            RaiseOutcome {
                accepted: true,
                signal_inserted: true,
                state_changed: false,
                waiting_set_changed: false,
            }
        } else {
            if matches!(
                signal.state,
                AttentionState::Complete | AttentionState::Idle | AttentionState::Error
            ) {
                clear_matching_locked(
                    inner,
                    signal.agent,
                    signal.session_id.as_deref(),
                    signal.request_id.as_deref(),
                );
            }
            if let Some(prev) = inner.lifecycle.get(&signal.agent) {
                if signal.sequence < prev.sequence {
                    return RaiseOutcome::default();
                }
            }
            let prev_state = inner.lifecycle.get(&signal.agent).map(|s| s.state);
            let state_changed = prev_state != Some(signal.state);
            let agent = signal.agent;
            let new_state = signal.state;
            inner.lifecycle.insert(signal.agent, signal);
            if new_state == AttentionState::Working && state_changed {
                note_working(agent);
            }
            RaiseOutcome {
                accepted: true,
                signal_inserted: false,
                state_changed,
                waiting_set_changed: false,
            }
        }
    });

    let waiting_after = project_waiting_kinds().0;
    let outcome = RaiseOutcome {
        waiting_set_changed: waiting_before != waiting_after,
        ..outcome
    };

    if outcome.accepted {
        notify_if_waiting_changed();
        maybe_emit_from_signal(&emit_snapshot, &outcome);
    }
    outcome
}

fn maybe_emit_from_signal(signal: &AgentAttentionSignal, outcome: &RaiseOutcome) {
    if !outcome.accepted {
        return;
    }
    let agent = signal.agent.as_str();
    let sid = signal.session_id.as_deref().unwrap_or("");
    let rid = signal.request_id.as_deref().unwrap_or("");
    let dedupe = format!("{agent}|{sid}|{rid}|{}", signal.state.as_str());

    match signal.state {
        AttentionState::NeedsInput if outcome.signal_inserted => {
            fire_sound_hook("agent.needs_input", &dedupe);
        }
        AttentionState::Error if outcome.state_changed => {
            clear_working(signal.agent);
            fire_sound_hook("agent.failed", &dedupe);
        }
        AttentionState::Complete if outcome.state_changed => {
            let task_ms = take_task_ms(signal.agent);
            if task_ms >= MIN_AGENT_TASK_MS {
                fire_sound_hook("agent.completed", &dedupe);
            }
        }
        AttentionState::Idle if outcome.state_changed => {
            clear_working(signal.agent);
        }
        _ => {}
    }
}

fn clear_matching_locked(
    inner: &mut AttentionStoreInner,
    agent: AgentKind,
    session_id: Option<&str>,
    request_id: Option<&str>,
) -> usize {
    let sess = session_id.map(str::trim).filter(|s| !s.is_empty());
    let req = request_id.map(str::trim).filter(|s| !s.is_empty());
    let before = inner.signals.len();
    inner.signals.retain(|k, s| {
        if s.agent != agent {
            return true;
        }
        if let Some(r) = req {
            return k.request_id != r;
        }
        if let Some(sid) = sess {
            return k.session_id != sid;
        }
        // Degraded Stop: clear all NeedsInput for agent.
        false
    });
    before.saturating_sub(inner.signals.len())
}

/// Clear NeedsInput by request_id (preferred), else session, else all for agent.
pub fn clear(
    agent: AgentKind,
    session_id: Option<&str>,
    request_id: Option<&str>,
) -> usize {
    let n = with_store(|inner| {
        prune_expired(inner, Instant::now());
        clear_matching_locked(inner, agent, session_id, request_id)
    });
    if n > 0 {
        notify_if_waiting_changed();
    }
    n
}

pub fn public_snapshot() -> AttentionPublicSnapshot {
    let now = Instant::now();
    let (waiting, _) = project_waiting_kinds();
    with_store(|inner| {
        prune_expired(inner, now);
        let mut rows = Vec::new();
        for s in inner.signals.values().chain(inner.lifecycle.values()) {
            rows.push(AttentionPublicRow {
                agent: s.agent.as_str().to_string(),
                session_id: s.session_id.clone(),
                request_id: s.request_id.clone(),
                state: s.state,
                cause: s.cause,
                source: s.source,
                confidence: s.confidence,
                sequence: s.sequence,
                observed_at_ms: instant_to_wall_approx(s.observed_at, now),
                expires_at_ms: s.expires_at.map(|e| {
                    let left = e.saturating_duration_since(now);
                    now_ms_wall().saturating_add(left.as_millis() as u64)
                }),
                waiting_eligible: s.state == AttentionState::NeedsInput
                    && s.source.can_enter_waiting()
                    && agent_allows_waiting_row(s.agent, s.source),
            });
        }
        rows.sort_by(|a, b| a.sequence.cmp(&b.sequence));
        AttentionPublicSnapshot {
            revision: REVISION.load(Ordering::Acquire),
            waiting_kinds: waiting.iter().map(|k| k.as_str().to_string()).collect(),
            rows,
        }
    })
}

/// Primary attention state for an agent (NeedsInput preferred, else lifecycle).
/// Session id from NeedsInput/Error Attention observed within `within_ms` (wall clock via Instant age).
pub fn recent_attention_session(agent: AgentKind, within_ms: u64) -> Option<String> {
    let now = Instant::now();
    let window = Duration::from_millis(within_ms);
    with_store(|inner| {
        prune_expired(inner, now);
        let mut best: Option<(Instant, String)> = None;
        for s in inner.signals.values().chain(inner.lifecycle.values()) {
            if s.agent != agent {
                continue;
            }
            if !matches!(s.state, AttentionState::NeedsInput | AttentionState::Error) {
                continue;
            }
            let Some(sid) = s.session_id.as_ref().map(|x| x.trim()).filter(|x| !x.is_empty()) else {
                continue;
            };
            if now.saturating_duration_since(s.observed_at) > window {
                continue;
            }
            match &best {
                None => best = Some((s.observed_at, sid.to_string())),
                Some((t, _)) if s.observed_at >= *t => {
                    best = Some((s.observed_at, sid.to_string()));
                }
                _ => {}
            }
        }
        best.map(|(_, sid)| sid)
    })
}

pub fn primary_state_for(agent: AgentKind) -> Option<AttentionState> {
    let now = Instant::now();
    with_store(|inner| {
        prune_expired(inner, now);
        if inner.signals.values().any(|s| {
            s.agent == agent
                && s.state == AttentionState::NeedsInput
                && s.source.can_enter_waiting()
                && signal_allows_waiting(s)
        }) {
            return Some(AttentionState::NeedsInput);
        }
        inner.lifecycle.get(&agent).map(|s| s.state)
    })
}

static TEST_LOCK: Mutex<()> = Mutex::new(());

pub fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn reset_for_test() {
    with_store(|inner| {
        inner.signals.clear();
        inner.lifecycle.clear();
    });
    if let Ok(mut g) = LAST_WAITING_SIG.lock() {
        g.clear();
    }
    if let Ok(mut g) = WORKING_SINCE.lock() {
        *g = None;
    }
    REVISION.store(0, Ordering::Release);
    SEQUENCE.store(1, Ordering::Release);
}

/// Helper: build NeedsInput raise from official hook.
pub fn raise_needs_input(
    agent: AgentKind,
    session_id: Option<&str>,
    request_id: Option<&str>,
    cause: AttentionCause,
    source: SignalSource,
) {
    let now = Instant::now();
    raise(AgentAttentionSignal {
        agent,
        session_id: session_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        request_id: request_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        state: AttentionState::NeedsInput,
        cause,
        source,
        confidence: Confidence::High,
        sequence: next_seq(),
        observed_at: now,
        expires_at: Some(now + Duration::from_millis(NEEDS_INPUT_WATCHDOG_MS)),
    });
}

pub fn raise_lifecycle(
    agent: AgentKind,
    session_id: Option<&str>,
    state: AttentionState,
    source: SignalSource,
) {
    let now = Instant::now();
    raise(AgentAttentionSignal {
        agent,
        session_id: session_id
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        request_id: None,
        state,
        cause: AttentionCause::Lifecycle,
        source,
        confidence: Confidence::High,
        sequence: next_seq(),
        observed_at: now,
        expires_at: None,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raise_clear_projects_waiting() {
        let _g = test_lock();
        reset_for_test();
        raise_needs_input(
            AgentKind::Claude,
            Some("s1"),
            Some("r1"),
            AttentionCause::Permission,
            SignalSource::OfficialHook,
        );
        let (w, _) = project_waiting_kinds();
        assert_eq!(w, vec![AgentKind::Claude]);
        clear(AgentKind::Claude, Some("s1"), Some("r1"));
        let (w2, _) = project_waiting_kinds();
        assert!(w2.is_empty());
    }

    #[test]
    fn inferred_never_enters_waiting() {
        let _g = test_lock();
        reset_for_test();
        raise_needs_input(
            AgentKind::Codex,
            Some("s"),
            Some("r"),
            AttentionCause::Permission,
            SignalSource::Inferred,
        );
        let (w, _) = project_waiting_kinds();
        assert!(w.is_empty());
    }

    #[test]
    fn cursor_onetone_ask_enters_waiting() {
        let _g = test_lock();
        reset_for_test();
        crate::agent_catalog::set_cursor_can_observe_needs_input(false);
        crate::agent_attention::raise_onetone_ask(AgentKind::Cursor, "s", "ask-1");
        let (w, _) = project_waiting_kinds();
        assert_eq!(w, vec![AgentKind::Cursor]);
    }

    #[test]
    fn cursor_waiting_gated_by_capability() {
        let _g = test_lock();
        reset_for_test();
        crate::agent_catalog::set_cursor_can_observe_needs_input(false);
        raise_needs_input(
            AgentKind::Cursor,
            Some("s"),
            Some("r"),
            AttentionCause::Permission,
            SignalSource::OfficialHook,
        );
        let (w, _) = project_waiting_kinds();
        assert!(w.is_empty());
    }

    #[test]
    fn earliest_agent_wins_projection_order() {
        let _g = test_lock();
        reset_for_test();
        raise_needs_input(
            AgentKind::Codex,
            Some("a"),
            Some("1"),
            AttentionCause::Permission,
            SignalSource::OfficialHook,
        );
        std::thread::sleep(Duration::from_millis(5));
        raise_needs_input(
            AgentKind::Claude,
            Some("b"),
            Some("2"),
            AttentionCause::Elicitation,
            SignalSource::OfficialHook,
        );
        let (w, _) = project_waiting_kinds();
        assert_eq!(w.first().copied(), Some(AgentKind::Codex));
        assert_eq!(w.len(), 2);
    }

    #[test]
    fn raise_needs_input_insert_vs_refresh_edge() {
        let _g = test_lock();
        reset_for_test();
        let o1 = raise(AgentAttentionSignal {
            agent: AgentKind::Claude,
            session_id: Some("s".into()),
            request_id: Some("r1".into()),
            state: AttentionState::NeedsInput,
            cause: AttentionCause::Permission,
            source: SignalSource::OfficialHook,
            confidence: Confidence::High,
            sequence: 1,
            observed_at: Instant::now(),
            expires_at: None,
        });
        assert!(o1.accepted);
        assert!(o1.signal_inserted);
        assert!(!o1.state_changed);

        let o2 = raise(AgentAttentionSignal {
            agent: AgentKind::Claude,
            session_id: Some("s".into()),
            request_id: Some("r1".into()),
            state: AttentionState::NeedsInput,
            cause: AttentionCause::Permission,
            source: SignalSource::OfficialHook,
            confidence: Confidence::High,
            sequence: 2,
            observed_at: Instant::now(),
            expires_at: None,
        });
        assert!(o2.accepted);
        assert!(!o2.signal_inserted);
    }

    #[test]
    fn raise_complete_requires_state_change() {
        let _g = test_lock();
        reset_for_test();
        let o1 = raise(AgentAttentionSignal {
            agent: AgentKind::Codex,
            session_id: Some("s".into()),
            request_id: None,
            state: AttentionState::Working,
            cause: AttentionCause::Lifecycle,
            source: SignalSource::OfficialHook,
            confidence: Confidence::High,
            sequence: 1,
            observed_at: Instant::now(),
            expires_at: None,
        });
        assert!(o1.state_changed);

        let o2 = raise(AgentAttentionSignal {
            agent: AgentKind::Codex,
            session_id: Some("s".into()),
            request_id: None,
            state: AttentionState::Complete,
            cause: AttentionCause::Lifecycle,
            source: SignalSource::OfficialHook,
            confidence: Confidence::High,
            sequence: 2,
            observed_at: Instant::now(),
            expires_at: None,
        });
        assert!(o2.state_changed);

        let o3 = raise(AgentAttentionSignal {
            agent: AgentKind::Codex,
            session_id: Some("s".into()),
            request_id: None,
            state: AttentionState::Complete,
            cause: AttentionCause::Lifecycle,
            source: SignalSource::OfficialHook,
            confidence: Confidence::High,
            sequence: 3,
            observed_at: Instant::now(),
            expires_at: None,
        });
        assert!(o3.accepted);
        assert!(!o3.state_changed);
    }
}
