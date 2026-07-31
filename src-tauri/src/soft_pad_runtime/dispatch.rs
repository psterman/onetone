//! Dispatch tickets and press leases.

use crate::codex_numpad_layer::{CodexNumpadRouteSnapshot, NumpadSourceKey};
use crate::soft_pad_runtime::model::AgentKind;
use crate::soft_pad_runtime::store;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct AgentDispatchTicket {
    pub revision: u64,
    pub lane_kind: AgentKind,
    pub mapping_id: String,
    pub route: CodexNumpadRouteSnapshot,
}

#[derive(Debug, Clone)]
pub struct SystemDispatchTicket {
    pub micro_key_id: String,
    pub kind: SystemKeyKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemKeyKind {
    EncSummon,
    NpDigitMode,
}

#[derive(Debug, Clone)]
pub struct ActivePressLease {
    pub revision: u64,
    pub mapping_id: String,
    pub micro_key_id: String,
    pub route: CodexNumpadRouteSnapshot,
    pub started_at: Instant,
}

static PRESS_LEASE: Mutex<Option<ActivePressLease>> = Mutex::new(None);

pub fn lookup_agent_ticket_by_micro(micro_key_id: &str) -> Option<AgentDispatchTicket> {
    store::with_runtime(|rt| {
        let applied = rt.applied.as_ref()?;
        let lane = applied.public.lane_kind?;
        let mapping_id = applied.public.mapping_id.as_ref()?.clone();
        let route = rt.agent_routes_by_micro.get(micro_key_id)?.clone();
        if route.mapping_id != mapping_id {
            return None;
        }
        Some(AgentDispatchTicket {
            revision: applied.public.revision,
            lane_kind: lane,
            mapping_id,
            route,
        })
    })
}

pub fn lookup_agent_ticket_by_physical(source: &NumpadSourceKey) -> Option<AgentDispatchTicket> {
    store::with_runtime(|rt| {
        let applied = rt.applied.as_ref()?;
        let lane = applied.public.lane_kind?;
        let mapping_id = applied.public.mapping_id.as_ref()?.clone();
        let route = rt.agent_routes.get(&source.id())?.clone();
        if route.mapping_id != mapping_id {
            return None;
        }
        Some(AgentDispatchTicket {
            revision: applied.public.revision,
            lane_kind: lane,
            mapping_id,
            route,
        })
    })
}

pub fn begin_agent_press_lease(ticket: &AgentDispatchTicket) {
    if let Ok(mut g) = PRESS_LEASE.lock() {
        *g = Some(ActivePressLease {
            revision: ticket.revision,
            mapping_id: ticket.mapping_id.clone(),
            micro_key_id: ticket.route.micro_key_id.clone(),
            route: ticket.route.clone(),
            started_at: Instant::now(),
        });
    }
}

/// Always release the lease that owns this micro key, even if Applied revision changed.
pub fn end_agent_press_lease(micro_key_id: &str) -> Option<ActivePressLease> {
    let mut g = PRESS_LEASE.lock().ok()?;
    let held = g.as_ref()?;
    if held.micro_key_id != micro_key_id {
        return None;
    }
    g.take()
}

pub fn peek_press_lease() -> Option<ActivePressLease> {
    PRESS_LEASE.lock().ok()?.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_route(mapping_id: &str, micro: &str) -> CodexNumpadRouteSnapshot {
        CodexNumpadRouteSnapshot {
            mapping_id: mapping_id.into(),
            slot_id: "s".into(),
            action_id: "a".into(),
            provider_id: "codex".into(),
            trigger_binding: "Ctrl+A".into(),
            micro_key_id: micro.into(),
            is_hold: true,
        }
    }

    #[test]
    fn key_up_releases_lease_after_revision_change() {
        let t10 = AgentDispatchTicket {
            revision: 10,
            lane_kind: AgentKind::Codex,
            mapping_id: "m1".into(),
            route: sample_route("m1", "AG00"),
        };
        begin_agent_press_lease(&t10);
        // Simulate Applied moving to rev 11 — lease must still clear on key-up.
        let ended = end_agent_press_lease("AG00");
        assert!(ended.is_some());
        assert_eq!(ended.unwrap().revision, 10);
        assert!(peek_press_lease().is_none());
    }
}
