//! Priority + TTL + transition constraints.

use super::log;
use super::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};

/// Non-sticky sources expire after this window (hook/app sticky states use stickyUntil / implicit sticky).
pub const STALE_MS: u64 = 3000;
pub const DONE_SETTLE_MS: u64 = 600;

#[derive(Debug, Clone)]
pub struct ProposeResult {
    pub accepted: bool,
    pub winner: PadStatus,
    pub reject_reason: Option<&'static str>,
}

/// Apply settle: done → idle after DONE_SETTLE_MS (mutates copy for read paths).
pub fn settle(status: &mut PadStatus, now: u64) {
    if status.state_enum() == PadState::Done {
        if let Some(until) = status.sticky_until {
            if now >= until {
                status.state = PadState::Idle.as_str().into();
                status.phase = None;
                status.sticky_until = None;
                status.message = None;
            }
        } else if status.updated_at > 0
            && now.saturating_sub(status.updated_at) >= DONE_SETTLE_MS
        {
            status.state = PadState::Idle.as_str().into();
            status.phase = None;
            status.message = None;
        }
    }
}

fn transition_allowed(current: &PadStatus, cand: &PadStatus, now: u64) -> Result<(), &'static str> {
    let from = current.state_enum();
    let to = cand.state_enum();
    if current.updated_at == 0 {
        return Ok(());
    }

    // Low-confidence must not clear sticky needs_input / running.
    if current.is_sticky_active(now)
        && matches!(from, PadState::NeedsInput | PadState::Running)
        && matches!(to, PadState::Idle | PadState::Done | PadState::Offline)
        && cand.confidence_enum() == Confidence::Low
    {
        return Err("low_confidence_vs_sticky");
    }

    // offline → done is usually nonsense
    if from == PadState::Offline && to == PadState::Done {
        return Err("offline_to_done");
    }

    // done → running requires newer timestamp
    if from == PadState::Done && to == PadState::Running && cand.updated_at <= current.updated_at {
        return Err("stale_done_to_running");
    }

    // Same state, older or equal update from lower/equal source with lower confidence → skip noise
    if from == to
        && cand.updated_at < current.updated_at
        && cand.source_enum().rank() <= current.source_enum().rank()
    {
        return Err("stale_same_state");
    }

    Ok(())
}

fn beats_current(current: &PadStatus, cand: &PadStatus, now: u64) -> Result<(), &'static str> {
    transition_allowed(current, cand, now)?;

    let cr = current.source_enum().rank();
    let nr = cand.source_enum().rank();

    if nr > cr {
        return Ok(());
    }
    if nr < cr {
        // Higher priority sticky holds against lower priority unless sticky expired
        if current.is_sticky_active(now) {
            return Err("priority_sticky");
        }
        // Allow lower priority only if current is stale (non-sticky)
        if current.updated_at > 0 && now.saturating_sub(current.updated_at) <= STALE_MS {
            return Err("priority");
        }
        return Ok(());
    }

    // Same source rank: newer wins
    if cand.updated_at >= current.updated_at {
        Ok(())
    } else {
        Err("older_timestamp")
    }
}

/// Propose a candidate against `current`. Returns whether store should update.
pub fn propose(current: &PadStatus, candidate: &PadStatusCandidate, now: u64) -> ProposeResult {
    let mut cur = current.clone();
    settle(&mut cur, now);

    let mut cand = candidate.status.clone();
    if cand.updated_at == 0 {
        cand.updated_at = now;
    }

    match beats_current(&cur, &cand, now) {
        Ok(()) => {
            log::append_event(
                &candidate.raw_tag,
                &cand,
                true,
                None,
            );
            ProposeResult {
                accepted: true,
                winner: cand,
                reject_reason: None,
            }
        }
        Err(reason) => {
            log::append_event(
                &candidate.raw_tag,
                &cand,
                false,
                Some(reason),
            );
            ProposeResult {
                accepted: false,
                winner: cur,
                reject_reason: Some(reason),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base(state: PadState, source: PadSource, conf: Confidence, at: u64) -> PadStatus {
        PadStatus {
            state: state.as_str().into(),
            phase: None,
            source: source.as_str().into(),
            confidence: conf.as_str().into(),
            updated_at: at,
            agent: Some("codex".into()),
            task_id: None,
            session_id: None,
            message: None,
            sticky_until: None,
            last_event: None,
        }
    }

    #[test]
    fn low_inferred_idle_cannot_clear_hook_needs_input() {
        let current = base(
            PadState::NeedsInput,
            PadSource::Hook,
            Confidence::High,
            1000,
        );
        let cand = PadStatusCandidate {
            status: base(PadState::Idle, PadSource::Inferred, Confidence::Low, 2000),
            raw_tag: "inferred:idle".into(),
        };
        let r = propose(&current, &cand, 2500);
        assert!(!r.accepted);
        assert_eq!(r.reject_reason, Some("low_confidence_vs_sticky"));
    }

    #[test]
    fn hook_running_beats_inferred() {
        let current = base(PadState::Idle, PadSource::Inferred, Confidence::Low, 1000);
        let cand = PadStatusCandidate {
            status: base(PadState::Running, PadSource::Hook, Confidence::High, 2000),
            raw_tag: "hook:UserPromptSubmit".into(),
        };
        let r = propose(&current, &cand, 2100);
        assert!(r.accepted);
        assert_eq!(r.winner.state, "running");
    }

    #[test]
    fn offline_to_done_rejected() {
        let current = base(PadState::Offline, PadSource::Native, Confidence::Medium, 1000);
        let cand = PadStatusCandidate {
            status: base(PadState::Done, PadSource::Inferred, Confidence::Low, 2000),
            raw_tag: "bad".into(),
        };
        let r = propose(&current, &cand, 2100);
        assert!(!r.accepted);
        assert_eq!(r.reject_reason, Some("offline_to_done"));
    }
}
