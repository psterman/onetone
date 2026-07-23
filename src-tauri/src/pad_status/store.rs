//! Global PadStatus store — sole truth for overlay / AG00 lights.

use std::sync::{Mutex, OnceLock};

use super::arbiter::{self, ProposeResult};
use super::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};

fn store() -> &'static Mutex<PadStatus> {
    static STORE: OnceLock<Mutex<PadStatus>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(PadStatus::default()))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn snapshot() -> PadStatus {
    snapshot_at(now_ms())
}

pub fn snapshot_at(now: u64) -> PadStatus {
    let mut g = store().lock().unwrap();
    arbiter::settle(&mut g, now);
    g.clone()
}

/// Raw store read without settle (for “ever received an event” checks).
pub fn current() -> PadStatus {
    store().lock().unwrap().clone()
}

/// Fresh high-signal status for overlay merge: `(legacy_source, core_state)`.
/// Sticky needs_input / running ignore STALE_MS; others expire after arbiter::STALE_MS.
pub fn fresh_signal() -> Option<(String, String)> {
    fresh_signal_at(now_ms())
}

pub fn fresh_signal_at(now: u64) -> Option<(String, String)> {
    let pad = snapshot_at(now);
    if pad.updated_at == 0 {
        return None;
    }
    let sticky = pad.is_sticky_active(now)
        || matches!(pad.state.as_str(), "needs_input" | "running");
    if !sticky {
        let age = now.saturating_sub(pad.updated_at);
        if age > arbiter::STALE_MS {
            return None;
        }
    }
    Some((
        pad.display_source_label().to_string(),
        pad.state.clone(),
    ))
}

/// Apply a candidate through the arbiter; returns the post-arbiter snapshot.
pub fn apply_candidate(candidate: PadStatusCandidate) -> ProposeResult {
    apply_candidate_at(candidate, now_ms())
}

pub fn apply_candidate_at(candidate: PadStatusCandidate, now: u64) -> ProposeResult {
    let mut g = store().lock().unwrap();
    let mut candidate = candidate;
    if candidate.status.updated_at == 0 {
        candidate.status.updated_at = now;
    }
    let result = arbiter::propose(&g, &candidate, now);
    if result.accepted {
        *g = result.winner.clone();
    } else {
        arbiter::settle(&mut g, now);
    }
    ProposeResult {
        accepted: result.accepted,
        winner: g.clone(),
        reject_reason: result.reject_reason,
    }
}

/// Local key-run inferred status (overlay / pad fire).
pub fn apply_inferred(state: &str, phase: Option<&str>, message: Option<&str>) -> PadStatus {
    let now = now_ms();
    let st = PadState::parse(state).unwrap_or(PadState::Idle);
    let phase = phase
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .or_else(|| {
            if state.trim() == "listening" {
                Some("hold".into())
            } else {
                None
            }
        });
    let cand = PadStatusCandidate {
        raw_tag: format!("inferred:{}", st.as_str()),
        status: PadStatus {
            state: st.as_str().into(),
            phase,
            source: PadSource::Inferred.as_str().into(),
            confidence: Confidence::Low.as_str().into(),
            updated_at: now,
            agent: None,
            task_id: None,
            session_id: None,
            message: message.map(|m| m.to_string()),
            sticky_until: None,
            last_event: None,
        },
    };
    apply_candidate(cand).winner
}

/// Fresh native AG0 (or pad-level) slot from vendor protocol.
pub fn apply_native_slot(state: &str, agent: Option<&str>) -> PadStatus {
    let now = now_ms();
    let st = PadState::parse(state).unwrap_or(PadState::Idle);
    let cand = PadStatusCandidate {
        raw_tag: format!("native:{}", st.as_str()),
        status: PadStatus {
            state: st.as_str().into(),
            phase: None,
            source: PadSource::Native.as_str().into(),
            confidence: Confidence::Medium.as_str().into(),
            updated_at: now,
            agent: agent.map(|a| a.to_string()).or_else(|| Some("codex".into())),
            task_id: None,
            session_id: None,
            message: None,
            sticky_until: None,
            last_event: None,
        },
    };
    apply_candidate(cand).winner
}

#[cfg(test)]
pub fn reset_for_test() {
    let mut g = store().lock().unwrap();
    *g = PadStatus::default();
}

#[cfg(test)]
pub fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}
