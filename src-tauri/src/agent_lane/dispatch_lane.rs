//! Lane dispatch tickets — looked up BEFORE AgentDispatchTicket.

use super::page::{get_page_state, select_lane};
use super::store::{acknowledge_lane, get_lane};
use crate::codex_numpad_layer::NumpadSourceKey;
use crate::config::CodexMicroPadConfig;
use crate::soft_pad_purpose::is_navigation_micro_key;
use crate::soft_pad_runtime::AgentKind;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct LaneDispatchTicket {
    pub mapping_id: String,
    pub lane_kind: AgentKind,
    pub micro_key_id: String,
    pub lane_id: String,
    pub page_revision: u64,
}

#[derive(Debug, Clone)]
pub struct LanePressLease {
    pub mapping_id: String,
    pub micro_key_id: String,
    pub lane_id: String,
    pub started_at: Instant,
}

static LANE_LEASE: Mutex<Option<LanePressLease>> = Mutex::new(None);

fn pad_and_applied() -> Option<(AgentKind, String, CodexMicroPadConfig)> {
    let (kind, mid) = crate::soft_pad_runtime::applied_lane()?;
    let cfg = crate::config::load_config();
    for m in &cfg.mappings {
        if m.id == mid {
            if let Some(pad) = m.codex_micro_pad.clone() {
                return Some((kind, mid, pad));
            }
        }
    }
    None
}

pub fn lookup_lane_ticket_by_micro(micro_key_id: &str) -> Option<LaneDispatchTicket> {
    let (kind, mid, pad) = pad_and_applied()?;
    if !is_navigation_micro_key(kind, &pad, micro_key_id) {
        return None;
    }
    let page = get_page_state(kind, &mid, &pad);
    let asg = page
        .slot_assignments
        .iter()
        .find(|a| a.micro_key_id == micro_key_id)?;
    Some(LaneDispatchTicket {
        mapping_id: mid,
        lane_kind: kind,
        micro_key_id: micro_key_id.to_string(),
        lane_id: asg.lane_id.clone(),
        page_revision: page.page_revision,
    })
}

pub fn lookup_lane_ticket_by_physical(source: &NumpadSourceKey) -> Option<LaneDispatchTicket> {
    let (kind, mid, pad) = pad_and_applied()?;
    let route = pad.keys.iter().find(|k| {
        k.enabled && k.source_scan == source.scan && k.source_extended == source.extended
    })?;
    if !is_navigation_micro_key(kind, &pad, &route.micro_key_id) {
        return None;
    }
    lookup_lane_ticket_by_micro(&route.micro_key_id)
        .filter(|t| t.mapping_id == mid && t.lane_kind == kind)
}

pub fn physical_lane_micro_key(source: &NumpadSourceKey) -> Option<String> {
    let (kind, _mid, pad) = match pad_and_applied() {
        Some(v) => v,
        None => return None,
    };
    let Some(route) = pad.keys.iter().find(|k| {
        k.enabled && k.source_scan == source.scan && k.source_extended == source.extended
    }) else {
        return None;
    };
    is_navigation_micro_key(kind, &pad, &route.micro_key_id).then(|| route.micro_key_id.clone())
}

pub fn begin_lane_press_lease(ticket: &LaneDispatchTicket) {
    if let Ok(mut g) = LANE_LEASE.lock() {
        *g = Some(LanePressLease {
            mapping_id: ticket.mapping_id.clone(),
            micro_key_id: ticket.micro_key_id.clone(),
            lane_id: ticket.lane_id.clone(),
            started_at: Instant::now(),
        });
    }
}

pub fn end_lane_press_lease(micro_key_id: &str) -> bool {
    let mut g = LANE_LEASE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(lease) = g.as_ref() {
        if lease.micro_key_id == micro_key_id {
            *g = None;
            return true;
        }
    }
    // Applied page may have changed — still clear if same micro key
    if g.as_ref().map(|l| l.micro_key_id.as_str()) == Some(micro_key_id) {
        *g = None;
        return true;
    }
    false
}

pub fn active_lane_lease() -> Option<LanePressLease> {
    LANE_LEASE.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigateLaneResult {
    pub ok: bool,
    pub action: String,
    pub lane_id: String,
    pub detail: String,
}

/// Navigate to lane: acknowledge done, select, focus live or mark resume needed.
pub fn navigate_lane(ticket: &LaneDispatchTicket) -> NavigateLaneResult {
    let Some(lane) = get_lane(&ticket.lane_id) else {
        return NavigateLaneResult {
            ok: false,
            action: "missing".into(),
            lane_id: ticket.lane_id.clone(),
            detail: "lane_not_found".into(),
        };
    };
    select_lane(ticket.lane_kind, &ticket.mapping_id, &ticket.lane_id);
    // Re-resolve hwnd via cwd before trusting stored hint.
    let mut hwnd = lane.navigation.terminal_hwnd;
    if !lane.navigation.cwd.is_empty() {
        if let Some(found) = super::cwd_focus::find_hwnd_for_cwd(&lane.navigation.cwd) {
            hwnd = found;
            super::store::patch_lane_hwnd(&ticket.lane_id, found);
        }
    }
    let caps = {
        let mut live_lane = lane.clone();
        live_lane.navigation.terminal_hwnd = hwnd;
        live_lane.caps()
    };
    if caps.can_focus_live {
        #[cfg(windows)]
        {
            if hwnd != 0 {
                let focused = crate::keyboard::focus_window(hwnd as winapi::shared::windef::HWND);
                if focused {
                    acknowledge_lane(&ticket.lane_id);
                }
                return NavigateLaneResult {
                    ok: focused,
                    action: "focus_live".into(),
                    lane_id: ticket.lane_id.clone(),
                    detail: if focused {
                        "hwnd".into()
                    } else {
                        "focus_failed".into()
                    },
                };
            }
        }
        return NavigateLaneResult {
            ok: true,
            action: "focus_live".into(),
            lane_id: ticket.lane_id.clone(),
            detail: "selected_live".into(),
        };
    }
    if caps.can_resume {
        acknowledge_lane(&ticket.lane_id);
        // Explicit resume is a separate user action in P2; report availability only.
        return NavigateLaneResult {
            ok: true,
            action: "resume_available".into(),
            lane_id: ticket.lane_id.clone(),
            detail: format!("cwd={} session={}", lane.navigation.cwd, lane.key.session_id),
        };
    }
    acknowledge_lane(&ticket.lane_id);
    NavigateLaneResult {
        ok: true,
        action: "selected".into(),
        lane_id: ticket.lane_id.clone(),
        detail: "no_navigation".into(),
    }
}
