//! Pure Soft Pad lane resolver. No HWND / HookGate.

use super::model::{
    AgentKind, CandidateDecision, FollowMode, ForegroundEvidence, SelectionReason, FG_EVIDENCE_TTL_MS,
};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct DispatchReadyEntry {
    pub kind: AgentKind,
    pub mapping_id: String,
    pub overlay_enabled: bool,
    pub order: u32,
}

#[derive(Debug, Clone)]
pub struct AppPage {
    pub app_target_id: String,
    pub mapping_id: String,
}

#[derive(Debug, Clone)]
pub struct CandidateInput {
    pub entries: Vec<DispatchReadyEntry>,
    pub user_pin: Option<AgentKind>,
    /// Non-agent app pages (Chrome, …). Agent apps stay in `entries`.
    pub app_pages: Vec<AppPage>,
    /// Baseline habit used when the foreground app has no page of its own.
    pub universal_mapping_id: Option<String>,
    pub foreground: Option<ForegroundEvidence>,
    /// needs_input kinds only; Phase 1 may be empty.
    pub waiting_kinds: Vec<AgentKind>,
    /// Earliest-first waiting timestamps (optional; index-aligned with waiting_kinds when present).
    pub waiting_observed_at: Vec<Instant>,
    pub now: Instant,
    /// Hold current applied kind briefly when multiple waiting (anti-flicker).
    pub current_lane: Option<AgentKind>,
}

impl Default for CandidateInput {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: None,
            waiting_kinds: Vec::new(),
            waiting_observed_at: Vec::new(),
            now: Instant::now(),
            current_lane: None,
        }
    }
}

pub fn resolve_candidate(input: &CandidateInput) -> CandidateDecision {
    let pool = &input.entries;

    // Pinned mode: pin wins everything, including a foreign app.
    if let Some(pin) = input.user_pin {
        if let Some(e) = pick_kind(pool, pin) {
            return CandidateDecision {
                lane_kind: Some(pin),
                mapping_id: Some(e.mapping_id.clone()),
                reason: SelectionReason::UserPin,
                mode: FollowMode::Pinned,
            };
        }
        // Invalid pin → fall through as Auto (caller should clear pin memory separately).
    }

    // Foreign app (Chrome, …): its page, else the universal baseline.
    // Beats another agent's waiting — those keys do not apply in this window.
    if let Some(page) = pick_foreign_page(input) {
        return page;
    }

    if pool.is_empty() {
        return CandidateDecision {
            lane_kind: None,
            mapping_id: None,
            reason: SelectionReason::None,
            mode: if input.user_pin.is_some() {
                FollowMode::Pinned
            } else {
                FollowMode::Auto
            },
        };
    }

    // Auto: needs_input > foreground agent > fallback
    if let Some(kind) = pick_waiting(input) {
        if let Some(e) = pick_kind(pool, kind) {
            return CandidateDecision {
                lane_kind: Some(kind),
                mapping_id: Some(e.mapping_id.clone()),
                reason: SelectionReason::Waiting,
                mode: FollowMode::Auto,
            };
        }
    }

    if let Some(fg) = fresh_foreground(input) {
        if let Some(e) = pick_kind(pool, fg) {
            return CandidateDecision {
                lane_kind: Some(fg),
                mapping_id: Some(e.mapping_id.clone()),
                reason: SelectionReason::Foreground,
                mode: FollowMode::Auto,
            };
        }
    }

    let first = pick_fallback(pool);
    CandidateDecision {
        lane_kind: first.as_ref().map(|e| e.kind),
        mapping_id: first.map(|e| e.mapping_id.clone()),
        reason: if first.is_some() {
            SelectionReason::Fallback
        } else {
            SelectionReason::None
        },
        mode: FollowMode::Auto,
    }
}

fn evidence_fresh(input: &CandidateInput, ev: &ForegroundEvidence) -> bool {
    let age = input.now.saturating_duration_since(ev.observed_at);
    (age.as_millis() as u64) <= FG_EVIDENCE_TTL_MS
}

fn fresh_foreground(input: &CandidateInput) -> Option<AgentKind> {
    let ev = input.foreground.as_ref()?;
    if !evidence_fresh(input, ev) {
        return None;
    }
    ev.agent_kind
}

/// App page for this window, else the universal baseline.
/// A fresh foreign host always resolves here so another agent's keys do not stay live.
/// `None` only when the host is not a foreign app (or the evidence is stale).
fn pick_foreign_page(input: &CandidateInput) -> Option<CandidateDecision> {
    let ev = input.foreground.as_ref()?;
    if !ev.foreign_host || !evidence_fresh(input, ev) {
        return None;
    }
    let mut mid: Option<String> = None;
    if let Some(tid) = ev
        .app_target_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(page) = input.app_pages.iter().find(|p| p.app_target_id == tid) {
            let id = page.mapping_id.trim();
            if !id.is_empty() {
                mid = Some(id.to_string());
            }
        }
    }
    if mid.is_none() {
        mid = input
            .universal_mapping_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
    }
    Some(CandidateDecision {
        lane_kind: None,
        mapping_id: mid.clone(),
        reason: if mid.is_some() {
            SelectionReason::Foreground
        } else {
            SelectionReason::None
        },
        mode: FollowMode::Auto,
    })
}

fn pick_waiting(input: &CandidateInput) -> Option<AgentKind> {
    let waiting: Vec<AgentKind> = input
        .waiting_kinds
        .iter()
        .copied()
        .filter(|k| input.entries.iter().any(|e| e.kind == *k))
        .collect();
    if waiting.is_empty() {
        return None;
    }
    // Intentional Soft Pad FG (e.g. open Cursor) beats another agent's waiting.
    // Waiting still wins when FG is the waiting agent, or FG is not a Soft Pad host.
    if let Some(fg) = fresh_foreground(input) {
        if input.entries.iter().any(|e| e.kind == fg) && !waiting.contains(&fg) {
            return None;
        }
    }
    // Current primary also waiting → keep.
    if let Some(cur) = input.current_lane {
        if waiting.contains(&cur) {
            return Some(cur);
        }
    }
    // Foreground among waiting.
    if let Some(fg) = fresh_foreground(input) {
        if waiting.contains(&fg) {
            return Some(fg);
        }
    }
    // Earliest waiting (list order = earliest-first contract).
    waiting.first().copied()
}

fn pick_kind(pool: &[DispatchReadyEntry], kind: AgentKind) -> Option<&DispatchReadyEntry> {
    let mut hits: Vec<&DispatchReadyEntry> = pool.iter().filter(|e| e.kind == kind).collect();
    if hits.is_empty() {
        return None;
    }
    hits.sort_by(|a, b| {
        b.overlay_enabled
            .cmp(&a.overlay_enabled)
            .then_with(|| a.order.cmp(&b.order))
            .then_with(|| a.mapping_id.cmp(&b.mapping_id))
    });
    Some(hits[0])
}

fn pick_fallback(pool: &[DispatchReadyEntry]) -> Option<&DispatchReadyEntry> {
    let mut hits: Vec<&DispatchReadyEntry> = pool.iter().collect();
    hits.sort_by(|a, b| {
        b.overlay_enabled
            .cmp(&a.overlay_enabled)
            .then_with(|| a.order.cmp(&b.order))
            .then_with(|| a.mapping_id.cmp(&b.mapping_id))
    });
    hits.first().copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn entry(kind: AgentKind, id: &str, order: u32, overlay: bool) -> DispatchReadyEntry {
        DispatchReadyEntry {
            kind,
            mapping_id: id.into(),
            overlay_enabled: overlay,
            order,
        }
    }

    #[test]
    fn pin_beats_waiting_and_foreground() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Codex, "m-codex", 0, true),
                entry(AgentKind::Claude, "m-claude", 1, true),
            ],
            user_pin: Some(AgentKind::Claude),
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: Some(ForegroundEvidence {
                agent_kind: Some(AgentKind::Codex),
                app_target_id: None,
                foreign_host: false,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![AgentKind::Codex],
            waiting_observed_at: vec![],
            now,
            current_lane: None,
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Claude));
        assert_eq!(c.reason, SelectionReason::UserPin);
        assert_eq!(c.mode, FollowMode::Pinned);
    }

    #[test]
    fn auto_foreground() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Codex, "m-codex", 0, true),
                entry(AgentKind::Claude, "m-claude", 1, true),
            ],
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: Some(ForegroundEvidence {
                agent_kind: Some(AgentKind::Claude),
                app_target_id: None,
                foreign_host: false,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![],
            waiting_observed_at: vec![],
            now,
            current_lane: None,
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Claude));
        assert_eq!(c.reason, SelectionReason::Foreground);
    }

    #[test]
    fn stale_foreground_ignored() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Codex, "m-codex", 0, true),
                entry(AgentKind::Claude, "m-claude", 1, true),
            ],
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: Some(ForegroundEvidence {
                agent_kind: Some(AgentKind::Claude),
                app_target_id: None,
                foreign_host: false,
                observed_at: now - Duration::from_millis(FG_EVIDENCE_TTL_MS + 1000),
                sequence: 1,
            }),
            waiting_kinds: vec![],
            waiting_observed_at: vec![],
            now,
            current_lane: None,
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Codex));
        assert_eq!(c.reason, SelectionReason::Fallback);
    }

    #[test]
    fn invalid_pin_falls_to_auto() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![entry(AgentKind::Codex, "m-codex", 0, true)],
            user_pin: Some(AgentKind::Claude),
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: None,
            waiting_kinds: vec![],
            waiting_observed_at: vec![],
            now,
            current_lane: None,
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Codex));
        assert_eq!(c.reason, SelectionReason::Fallback);
        assert_eq!(c.mode, FollowMode::Auto);
    }

    #[test]
    fn waiting_prefers_current_if_also_waiting() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Codex, "m-codex", 0, true),
                entry(AgentKind::Claude, "m-claude", 1, true),
            ],
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: None,
            waiting_kinds: vec![AgentKind::Codex, AgentKind::Claude],
            waiting_observed_at: vec![],
            now,
            current_lane: Some(AgentKind::Claude),
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Claude));
        assert_eq!(c.reason, SelectionReason::Waiting);
    }

    #[test]
    fn soft_pad_fg_beats_other_agent_waiting() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Claude, "m-claude", 0, true),
                entry(AgentKind::Cursor, "m-cursor", 1, true),
            ],
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: Some(ForegroundEvidence {
                agent_kind: Some(AgentKind::Cursor),
                app_target_id: None,
                foreign_host: false,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![AgentKind::Claude],
            waiting_observed_at: vec![],
            now,
            current_lane: Some(AgentKind::Claude),
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Cursor));
        assert_eq!(c.mapping_id.as_deref(), Some("m-cursor"));
        assert_eq!(c.reason, SelectionReason::Foreground);
    }

    #[test]
    fn waiting_still_wins_when_fg_is_that_agent() {
        let now = Instant::now();
        let input = CandidateInput {
            entries: vec![
                entry(AgentKind::Claude, "m-claude", 0, true),
                entry(AgentKind::Cursor, "m-cursor", 1, true),
            ],
            user_pin: None,
            app_pages: Vec::new(),
            universal_mapping_id: None,
            foreground: Some(ForegroundEvidence {
                agent_kind: Some(AgentKind::Claude),
                app_target_id: None,
                foreign_host: false,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![AgentKind::Claude],
            waiting_observed_at: vec![],
            now,
            current_lane: Some(AgentKind::Cursor),
        };
        let c = resolve_candidate(&input);
        assert_eq!(c.lane_kind, Some(AgentKind::Claude));
        assert_eq!(c.reason, SelectionReason::Waiting);
    }

    #[test]
    fn empty_pool_none() {
        let c = resolve_candidate(&CandidateInput {
            now: Instant::now(),
            ..Default::default()
        });
        assert_eq!(c.lane_kind, None);
        assert_eq!(c.reason, SelectionReason::None);
    }

    #[test]
    fn lane_null_iff_reason_none() {
        let c = resolve_candidate(&CandidateInput {
            now: Instant::now(),
            ..Default::default()
        });
        assert_eq!(c.lane_kind.is_none(), c.reason == SelectionReason::None);
        assert!(c.mapping_id.is_none());
    }

    #[test]
    fn foreign_host_uses_universal_and_beats_waiting() {
        let now = Instant::now();
        let c = resolve_candidate(&CandidateInput {
            entries: vec![entry(AgentKind::Cursor, "m-cursor", 0, true)],
            universal_mapping_id: Some("m-base".into()),
            foreground: Some(ForegroundEvidence {
                agent_kind: None,
                app_target_id: None,
                foreign_host: true,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![AgentKind::Cursor],
            now,
            current_lane: Some(AgentKind::Cursor),
            ..Default::default()
        });
        assert_eq!(c.lane_kind, None);
        assert_eq!(c.mapping_id.as_deref(), Some("m-base"));
        assert_eq!(c.reason, SelectionReason::Foreground);
    }

    #[test]
    fn foreign_host_prefers_app_page_over_universal() {
        let now = Instant::now();
        let c = resolve_candidate(&CandidateInput {
            entries: vec![entry(AgentKind::Cursor, "m-cursor", 0, true)],
            app_pages: vec![AppPage {
                app_target_id: "chrome".into(),
                mapping_id: "m-chrome".into(),
            }],
            universal_mapping_id: Some("m-base".into()),
            foreground: Some(ForegroundEvidence {
                agent_kind: None,
                app_target_id: Some("chrome".into()),
                foreign_host: true,
                observed_at: now,
                sequence: 1,
            }),
            now,
            ..Default::default()
        });
        assert_eq!(c.mapping_id.as_deref(), Some("m-chrome"));
        assert_eq!(c.reason, SelectionReason::Foreground);
    }

    #[test]
    fn foreign_host_without_page_drops_agent_keys() {
        let now = Instant::now();
        let c = resolve_candidate(&CandidateInput {
            entries: vec![entry(AgentKind::Cursor, "m-cursor", 0, true)],
            foreground: Some(ForegroundEvidence {
                agent_kind: None,
                app_target_id: None,
                foreign_host: true,
                observed_at: now,
                sequence: 1,
            }),
            waiting_kinds: vec![AgentKind::Cursor],
            now,
            current_lane: Some(AgentKind::Cursor),
            ..Default::default()
        });
        assert_eq!(c.lane_kind, None);
        assert!(c.mapping_id.is_none());
        assert_eq!(c.reason, SelectionReason::None);
    }
}
