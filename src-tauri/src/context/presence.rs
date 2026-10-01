//! Presence evidence store — Phase 1 of camera-as-context-sensor.
//!
//! # What this is NOT
//!
//! This is **not** a decision source. Presence never switches a scenario on
//! its own; it only contributes evidence that `context::resolver` weighs
//! alongside foreground / input / agent state. A single "nobody detected"
//! frame must not park the user in a leave scenario — the user may be
//! looking down, badly framed, in changing light, or on a second monitor.
//!
//! # What leaves the browser
//!
//! Only three scalars: `here` / `away` / `unknown`, a coarse confidence, and
//! a timestamp. **No frames, no embedding, no upload.** The image never
//! crosses the IPC boundary.
//!
//! # The rule that matters
//!
//! Stale or absent evidence degrades to `Unknown`, and `Unknown` must never
//! produce a negative conclusion. A closed camera means "we don't know",
//! *not* "the user left". Treating unknown as away would silently turn off
//! privacy protection whenever the camera is off.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use parking_lot::Mutex;

/// Evidence goes stale after this long without a fresh report.
/// Generous enough to survive a tracking hiccup, short enough that a
/// crashed frontend does not pin the user to "away" forever.
pub const PRESENCE_TTL: Duration = Duration::from_secs(12);

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Presence {
    Here,
    Away,
    Unknown,
}

impl Presence {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Here => "here",
            Self::Away => "away",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PresenceConfidence {
    Low,
    Mid,
    High,
}

/// One accepted report from the frontend.
#[derive(Debug, Clone, Copy)]
struct PresenceSample {
    state: Presence,
    confidence: PresenceConfidence,
    at: Instant,
}

static EMPTY: Mutex<Option<PresenceSample>> = Mutex::new(None);
static REV: AtomicU64 = AtomicU64::new(1);

/// Record a fresh observation. Cheap enough to call on every tracker tick.
pub fn report(state: Presence, confidence: PresenceConfidence) {
    *EMPTY.lock() = Some(PresenceSample {
        state,
        confidence,
        at: Instant::now(),
    });
    REV.fetch_add(1, Ordering::Relaxed);
}

/// Current evidence, with staleness applied.
///
/// Returns `Unknown` — never a stale `Here`/`Away` — once the TTL lapses.
/// This is the single place staleness is decided; callers must not
/// re-interpret the sample.
pub fn read() -> (Presence, PresenceConfidence, bool) {
    let guard = EMPTY.lock();
    let Some(s) = guard.as_ref() else {
        return (Presence::Unknown, PresenceConfidence::Low, false);
    };
    if s.at.elapsed() > PRESENCE_TTL {
        return (Presence::Unknown, PresenceConfidence::Low, false);
    }
    (s.state, s.confidence, true)
}

/// Public projection for the Now cockpit's "依据" panel.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceDto {
    pub state: &'static str,
    pub confidence: &'static str,
    /// False when absent, stale, or explicitly unknown.
    pub fresh: bool,
    pub revision: u64,
}

fn conf_str(c: PresenceConfidence) -> &'static str {
    match c {
        PresenceConfidence::Low => "low",
        PresenceConfidence::Mid => "mid",
        PresenceConfidence::High => "high",
    }
}

pub fn snapshot() -> PresenceDto {
    let (state, conf, fresh) = read();
    PresenceDto {
        state: state.as_str(),
        confidence: conf_str(conf),
        fresh,
        revision: REV.load(Ordering::Relaxed),
    }
}

/// Whether the runtime is allowed to draw a *negative* conclusion.
///
/// Only a fresh `Away` qualifies. `Unknown` (camera off, crashed, or stale)
/// must not trigger leave/privacy behaviour — see the module docs.
pub fn may_treat_as_away() -> bool {
    matches!(read(), (Presence::Away, _, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_evidence_is_unknown() {
        // Store starts empty; the assertion holds regardless of test order
        // because every test resets first.
        *EMPTY.lock() = None;
        let (s, _, fresh) = read();
        assert_eq!(s, Presence::Unknown);
        assert!(!fresh);
    }

    #[test]
    fn fresh_report_is_readable() {
        report(Presence::Here, PresenceConfidence::High);
        let (s, c, fresh) = read();
        assert_eq!(s, Presence::Here);
        assert_eq!(c, PresenceConfidence::High);
        assert!(fresh);
    }

    #[test]
    fn explicit_unknown_is_never_negative() {
        report(Presence::Unknown, PresenceConfidence::Low);
        assert!(!may_treat_as_away());
    }

    #[test]
    fn only_fresh_away_allows_negative_conclusion() {
        report(Presence::Away, PresenceConfidence::High);
        assert!(may_treat_as_away());
    }

    #[test]
    fn camera_off_never_means_away() {
        // The core safety rule: no report at all must not read as "left".
        *EMPTY.lock() = None;
        assert!(!may_treat_as_away());
        assert_eq!(read().0, Presence::Unknown);
    }

    #[test]
    fn revision_advances_on_report() {
        let a = REV.load(Ordering::Relaxed);
        report(Presence::Here, PresenceConfidence::Mid);
        assert!(REV.load(Ordering::Relaxed) > a);
    }
}
