//! Resolve click → lane and run focus/resume (Attention → Focus Session).

use super::dispatch_lane::{navigate_lane, LaneDispatchTicket};
use super::model::{AgentLane, LaneState};
use super::nav::{resume_claude_lane, resume_codex_lane};
use super::store::{get_lane, public_lanes_for_page};
use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Recent Attention window for "why the light lit" (ms).
pub const RECENT_ATTENTION_MS: u64 = 5000;
/// Status-host running click debounce (ms).
pub const STATUS_HOST_RUNNING_DEBOUNCE_MS: u64 = 500;

static FOCUS_SESSION_ENABLED: AtomicBool = AtomicBool::new(true);
static RGB_AGGREGATE_ENABLED: AtomicBool = AtomicBool::new(true);
static SESSION_PERSIST_ENABLED: AtomicBool = AtomicBool::new(true);

static CLICK_CHIP: AtomicU64 = AtomicU64::new(0);
static CLICK_STATUS_HOST: AtomicU64 = AtomicU64::new(0);
static CLICK_SOFT_RGB: AtomicU64 = AtomicU64::new(0);
static RESULT_FOCUS_LIVE: AtomicU64 = AtomicU64::new(0);
static RESULT_RESUME: AtomicU64 = AtomicU64::new(0);
static RESULT_FALLBACK_APP: AtomicU64 = AtomicU64::new(0);
static RESULT_NONE: AtomicU64 = AtomicU64::new(0);

static STATUS_HOST_RUNNING_LAST: Mutex<Option<Instant>> = Mutex::new(None);

pub fn set_focus_session_enabled(v: bool) {
    FOCUS_SESSION_ENABLED.store(v, Ordering::Release);
}
pub fn focus_session_enabled() -> bool {
    FOCUS_SESSION_ENABLED.load(Ordering::Acquire)
}
pub fn set_rgb_aggregate_enabled(v: bool) {
    RGB_AGGREGATE_ENABLED.store(v, Ordering::Release);
}
pub fn rgb_aggregate_enabled() -> bool {
    RGB_AGGREGATE_ENABLED.load(Ordering::Acquire)
}
pub fn set_session_persist_enabled(v: bool) {
    SESSION_PERSIST_ENABLED.store(v, Ordering::Release);
}
pub fn session_persist_enabled() -> bool {
    SESSION_PERSIST_ENABLED.load(Ordering::Acquire)
}

pub fn sync_flags_from_config(cfg: &crate::config::VoiceConfig) {
    set_focus_session_enabled(cfg.soft_pad_focus_session_enabled);
    set_rgb_aggregate_enabled(cfg.soft_pad_rgb_aggregate_enabled);
    set_session_persist_enabled(cfg.soft_pad_session_persist_enabled);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FocusClickKind {
    Chip,
    StatusHost,
    SoftRgb,
}

impl FocusClickKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chip => "chip",
            Self::StatusHost => "status_host",
            Self::SoftRgb => "soft_rgb",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSessionKpi {
    pub click_chip: u64,
    pub click_status_host: u64,
    pub click_soft_rgb: u64,
    pub result_focus_live: u64,
    pub result_resume: u64,
    pub result_fallback_app: u64,
    pub result_none: u64,
}

pub fn kpi_snapshot() -> FocusSessionKpi {
    FocusSessionKpi {
        click_chip: CLICK_CHIP.load(Ordering::Relaxed),
        click_status_host: CLICK_STATUS_HOST.load(Ordering::Relaxed),
        click_soft_rgb: CLICK_SOFT_RGB.load(Ordering::Relaxed),
        result_focus_live: RESULT_FOCUS_LIVE.load(Ordering::Relaxed),
        result_resume: RESULT_RESUME.load(Ordering::Relaxed),
        result_fallback_app: RESULT_FALLBACK_APP.load(Ordering::Relaxed),
        result_none: RESULT_NONE.load(Ordering::Relaxed),
    }
}

fn note_click(kind: FocusClickKind) {
    match kind {
        FocusClickKind::Chip => CLICK_CHIP.fetch_add(1, Ordering::Relaxed),
        FocusClickKind::StatusHost => CLICK_STATUS_HOST.fetch_add(1, Ordering::Relaxed),
        FocusClickKind::SoftRgb => CLICK_SOFT_RGB.fetch_add(1, Ordering::Relaxed),
    };
}

fn note_result(result: &str) {
    match result {
        "focus_live" => RESULT_FOCUS_LIVE.fetch_add(1, Ordering::Relaxed),
        "resume" => RESULT_RESUME.fetch_add(1, Ordering::Relaxed),
        "fallback_app" => RESULT_FALLBACK_APP.fetch_add(1, Ordering::Relaxed),
        _ => RESULT_NONE.fetch_add(1, Ordering::Relaxed),
    };
}

/// Attention rank for Soft RGB / lane pick (higher wins).
pub fn ui_status_rank(status: &str) -> u8 {
    match status.trim() {
        "error" | "failed" => 4,
        "needs_input" => 3,
        "running" | "working" | "listening" => 2,
        "done" => 1,
        _ => 0, // idle / offline / empty
    }
}

pub fn lane_state_rank(state: LaneState) -> u8 {
    ui_status_rank(state.ui_status())
}

#[derive(Debug, Clone)]
pub struct FocusTargetHint {
    pub lane_id: Option<String>,
    pub session_id: Option<String>,
}

/// Status-host click gate: idle/offline → pass; running → swallow; attention → intercept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusHostClickGate {
    PassThrough,
    Swallow,
    InterceptFocus,
}

pub fn status_host_click_gate(app_status: &str) -> StatusHostClickGate {
    let s = app_status.trim();
    match s {
        "idle" | "offline" | "" => StatusHostClickGate::PassThrough,
        "running" | "listening" | "working" => {
            let mut g = STATUS_HOST_RUNNING_LAST
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            let now = Instant::now();
            if let Some(prev) = *g {
                if now.duration_since(prev) < Duration::from_millis(STATUS_HOST_RUNNING_DEBOUNCE_MS)
                {
                    return StatusHostClickGate::Swallow;
                }
            }
            *g = Some(now);
            StatusHostClickGate::Swallow
        }
        "needs_input" | "error" | "failed" | "done" => StatusHostClickGate::InterceptFocus,
        _ => StatusHostClickGate::PassThrough,
    }
}

fn find_lane_by_session(kind: AgentKind, session_id: &str) -> Option<AgentLane> {
    let sid = session_id.trim();
    if sid.is_empty() {
        return None;
    }
    public_lanes_for_page(kind)
        .into_iter()
        .find(|l| l.key.session_id == sid)
}

fn highest_priority_lane(kind: AgentKind) -> Option<AgentLane> {
    let mut lanes = public_lanes_for_page(kind);
    lanes.sort_by(|a, b| {
        lane_state_rank(b.state)
            .cmp(&lane_state_rank(a.state))
            .then_with(|| b.updated_at.cmp(&a.updated_at))
    });
    lanes.into_iter().next()
}

/// Priority: recent Attention needs_input/error → explicit laneId → sessionId → highest rank.
pub fn resolve_focus_target(
    kind: AgentKind,
    hint: &FocusTargetHint,
) -> Option<LaneDispatchTicket> {
    // 1. Recent Attention session (why the light lit)
    if let Some(session) =
        crate::agent_attention::store::recent_attention_session(kind, RECENT_ATTENTION_MS)
    {
        if let Some(lane) = find_lane_by_session(kind, &session) {
            return Some(ticket_for_lane(kind, &lane));
        }
    }
    // 2. Explicit laneId
    if let Some(id) = hint
        .lane_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(lane) = get_lane(id) {
            if lane.key.provider == kind {
                return Some(ticket_for_lane(kind, &lane));
            }
        }
    }
    // 3. Explicit sessionId
    if let Some(sid) = hint
        .session_id
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if let Some(lane) = find_lane_by_session(kind, sid) {
            return Some(ticket_for_lane(kind, &lane));
        }
    }
    // 4. Highest priority lane
    highest_priority_lane(kind).map(|lane| ticket_for_lane(kind, &lane))
}

fn ticket_for_lane(kind: AgentKind, lane: &AgentLane) -> LaneDispatchTicket {
    let mapping_id = crate::soft_pad_runtime::applied_lane()
        .map(|(_, mid)| mid)
        .unwrap_or_default();
    LaneDispatchTicket {
        mapping_id,
        lane_kind: kind,
        micro_key_id: String::new(),
        lane_id: lane.lane_id.clone(),
        page_revision: 0,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSessionResult {
    pub ok: bool,
    pub result: String,
    pub lane_id: String,
    pub detail: String,
    pub click_kind: String,
}

fn resume_for_lane(lane_id: &str, kind: AgentKind) -> (bool, String) {
    let r = match kind {
        AgentKind::Claude => resume_claude_lane(lane_id),
        AgentKind::Codex => resume_codex_lane(lane_id),
        _ => {
            return (
                false,
                "unsupported_provider_resume".into(),
            );
        }
    };
    (r.ok, r.detail)
}

/// Focus live (cwd scan / hwnd) then auto-resume when needed.
pub fn focus_session(
    kind: AgentKind,
    hint: FocusTargetHint,
    click: FocusClickKind,
) -> FocusSessionResult {
    note_click(click);
    if !focus_session_enabled() {
        note_result("fallback_app");
        return FocusSessionResult {
            ok: false,
            result: "fallback_app".into(),
            lane_id: String::new(),
            detail: "flag_disabled".into(),
            click_kind: click.as_str().into(),
        };
    }
    let Some(ticket) = resolve_focus_target(kind, &hint) else {
        note_result("fallback_app");
        return FocusSessionResult {
            ok: false,
            result: "fallback_app".into(),
            lane_id: String::new(),
            detail: "no_lane".into(),
            click_kind: click.as_str().into(),
        };
    };

    // Enrich focus: try cwd window match before navigate
    if let Some(lane) = get_lane(&ticket.lane_id) {
        if !lane.navigation.cwd.is_empty() {
            if let Some(hwnd) = super::cwd_focus::find_hwnd_for_cwd(&lane.navigation.cwd) {
                super::store::patch_lane_hwnd(&ticket.lane_id, hwnd);
            }
        }
    }

    let nav = navigate_lane(&ticket);
    if nav.action == "focus_live" && nav.ok {
        note_result("focus_live");
        return FocusSessionResult {
            ok: true,
            result: "focus_live".into(),
            lane_id: ticket.lane_id,
            detail: nav.detail,
            click_kind: click.as_str().into(),
        };
    }
    if nav.action == "resume_available" || (nav.action == "focus_live" && !nav.ok) {
        let (ok, detail) = resume_for_lane(&ticket.lane_id, kind);
        note_result(if ok { "resume" } else { "none" });
        return FocusSessionResult {
            ok,
            result: if ok { "resume".into() } else { "none".into() },
            lane_id: ticket.lane_id,
            detail,
            click_kind: click.as_str().into(),
        };
    }
    if nav.action == "selected" || nav.action == "missing" {
        let lane = get_lane(&ticket.lane_id);
        if lane
            .as_ref()
            .map(|l| !l.navigation.cwd.is_empty() && !l.key.session_id.is_empty())
            .unwrap_or(false)
        {
            let (ok, detail) = resume_for_lane(&ticket.lane_id, kind);
            note_result(if ok { "resume" } else { "none" });
            return FocusSessionResult {
                ok,
                result: if ok { "resume".into() } else { "none".into() },
                lane_id: ticket.lane_id,
                detail,
                click_kind: click.as_str().into(),
            };
        }
    }
    note_result("none");
    FocusSessionResult {
        ok: nav.ok,
        result: "none".into(),
        lane_id: ticket.lane_id,
        detail: nav.detail,
        click_kind: click.as_str().into(),
    }
}

/// Aggregate Soft RGB status: error veto, then max rank across PadStatus + enabled lanes.
pub fn ambient_ui_status(pad_ui: &str, enabled_kinds: &[AgentKind]) -> String {
    if !rgb_aggregate_enabled() {
        return if pad_ui.trim().is_empty() {
            "idle".into()
        } else {
            pad_ui.to_string()
        };
    }
    let mut best_rank = ui_status_rank(pad_ui);
    let mut best_status = if pad_ui.trim().is_empty() {
        "idle".to_string()
    } else {
        pad_ui.to_string()
    };
    let mut best_updated: u64 = 0;

    if best_rank >= 4 {
        return "error".into();
    }

    for kind in enabled_kinds {
        for lane in public_lanes_for_page(*kind) {
            let st = lane.state.ui_status();
            let r = ui_status_rank(st);
            if r >= 4 {
                return "error".into();
            }
            if r > best_rank || (r == best_rank && lane.updated_at > best_updated) {
                best_rank = r;
                best_status = st.to_string();
                best_updated = lane.updated_at;
            }
        }
    }
    // Normalize failed → error for Soft RGB palette
    if best_status == "failed" {
        "error".into()
    } else {
        best_status
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::store::{ingest_lane_event, reset_for_test, LaneIngest};

    #[test]
    fn resolve_prefers_explicit_lane_over_rank_when_no_recent_attention() {
        reset_for_test();
        crate::agent_attention::store::reset_for_test();
        let _ = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "s-high".into(),
            subagent_id: None,
            title: None,
            event: "error".into(),
            source: "test".into(),
            cwd: "C:/a".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(100),
        });
        let low = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "s-low".into(),
            subagent_id: None,
            title: None,
            event: "working".into(),
            source: "test".into(),
            cwd: "C:/b".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(2),
            at: Some(200),
        })
        .unwrap();
        let t = resolve_focus_target(
            AgentKind::Codex,
            &FocusTargetHint {
                lane_id: Some(low.clone()),
                session_id: None,
            },
        )
        .unwrap();
        assert_eq!(t.lane_id, low);
    }

    #[test]
    fn status_host_gate_rules() {
        assert_eq!(
            status_host_click_gate("idle"),
            StatusHostClickGate::PassThrough
        );
        assert_eq!(
            status_host_click_gate("needs_input"),
            StatusHostClickGate::InterceptFocus
        );
        assert_eq!(
            status_host_click_gate("running"),
            StatusHostClickGate::Swallow
        );
    }

    #[test]
    fn ambient_error_veto() {
        reset_for_test();
        let _ = ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "e1".into(),
            subagent_id: None,
            title: None,
            event: "error".into(),
            source: "test".into(),
            cwd: "C:/e".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(1),
        });
        set_rgb_aggregate_enabled(true);
        let s = ambient_ui_status("needs_input", &[AgentKind::Claude]);
        assert_eq!(s, "error");
    }
}
