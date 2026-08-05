//! PageSessionState keyed by (AgentKind, mapping_id).

use super::model::PageKey;
use super::slots::{assign_slots, SlotAssignment};
use super::store::public_lanes_for_page;
use crate::config::CodexMicroPadConfig;
use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageSessionState {
    pub page_key: PageKey,
    pub page_revision: u64,
    pub selected_lane_id: Option<String>,
    pub slot_assignments: Vec<SlotAssignment>,
    pub overflow: Vec<String>,
}

struct Inner {
    pages: HashMap<(String, String), PageSessionState>,
}

fn store() -> &'static Mutex<Inner> {
    static STORE: OnceLock<Mutex<Inner>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(Inner { pages: HashMap::new() }))
}

fn map_key(kind: AgentKind, mapping_id: &str) -> (String, String) {
    (kind.as_str().to_string(), mapping_id.to_string())
}

pub fn get_page_state(
    kind: AgentKind,
    mapping_id: &str,
    pad: &CodexMicroPadConfig,
) -> PageSessionState {
    let lanes = public_lanes_for_page(kind);
    let (assignments, overflow) = assign_slots(kind, pad, &lanes);
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    let k = map_key(kind, mapping_id);
    let page = g.pages.entry(k).or_insert_with(|| PageSessionState {
        page_key: PageKey {
            agent_kind: kind,
            mapping_id: mapping_id.to_string(),
        },
        page_revision: 1,
        selected_lane_id: None,
        slot_assignments: Vec::new(),
        overflow: Vec::new(),
    });
    page.slot_assignments = assignments;
    page.overflow = overflow;
    // Keep selected if still present
    if let Some(sel) = page.selected_lane_id.clone() {
        if !page
            .slot_assignments
            .iter()
            .any(|a| a.lane_id == sel)
            && !page.overflow.iter().any(|id| id == &sel)
        {
            page.selected_lane_id = page.slot_assignments.first().map(|a| a.lane_id.clone());
        }
    } else {
        page.selected_lane_id = page.slot_assignments.first().map(|a| a.lane_id.clone());
    }
    page.clone()
}

/// Select lane within page — does NOT bump Soft Pad Applied revision.
pub fn select_lane(kind: AgentKind, mapping_id: &str, lane_id: &str) -> bool {
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    let k = map_key(kind, mapping_id);
    let Some(page) = g.pages.get_mut(&k) else {
        return false;
    };
    page.selected_lane_id = Some(lane_id.to_string());
    page.page_revision = page.page_revision.saturating_add(1);
    true
}

/// Selected lane id for current Applied page (no revision bump).
pub fn selected_lane_id_for_applied() -> Option<String> {
    let (kind, mid) = crate::soft_pad_runtime::applied_lane()?;
    let g = store().lock().unwrap_or_else(|e| e.into_inner());
    g.pages
        .get(&map_key(kind, &mid))
        .and_then(|p| p.selected_lane_id.clone())
}

pub fn reset_for_test() {
    store().lock().unwrap_or_else(|e| e.into_inner()).pages.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::store::{ingest_lane_event, reset_for_test as reset_lanes, LaneIngest};
    use crate::soft_pad_purpose::{SoftPadKeyRole, SoftPadPurpose};
    use crate::config::CodexMicroPadKeyRoute;

    fn sessions_pad() -> CodexMicroPadConfig {
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            ..Default::default()
        };
        for i in 0..6 {
            pad.keys.push(CodexMicroPadKeyRoute {
                micro_key_id: format!("AG{i:02}"),
                key_role: Some(SoftPadKeyRole::AgentLane),
                auto_assignable: Some(true),
                ..Default::default()
            });
        }
        pad
    }

    #[test]
    fn page_state_is_scoped_by_kind_and_mapping_id() {
        reset_lanes();
        reset_for_test();
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "s1".into(),
            subagent_id: None,
            title: None,
            event: "working".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(1),
        });
        let pad = sessions_pad();
        let a = get_page_state(AgentKind::Claude, "map-a", &pad);
        select_lane(AgentKind::Claude, "map-a", a.selected_lane_id.as_deref().unwrap_or(""));
        let b = get_page_state(AgentKind::Claude, "map-b", &pad);
        assert_ne!(a.page_key.mapping_id, b.page_key.mapping_id);
    }

    #[test]
    fn lane_assignment_is_sticky() {
        reset_lanes();
        reset_for_test();
        let pad = sessions_pad();
        let id1 = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t1".into(),
            subagent_id: None,
            title: None,
            event: "working".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(1),
        })
        .unwrap();
        let s1 = get_page_state(AgentKind::Codex, "m", &pad);
        let host1 = s1
            .slot_assignments
            .iter()
            .find(|a| a.lane_id == id1)
            .map(|a| a.micro_key_id.clone())
            .unwrap();
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t2".into(),
            subagent_id: None,
            title: None,
            event: "working".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(2),
        });
        // state change on t1
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t1".into(),
            subagent_id: None,
            title: None,
            event: "needs_input".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(2),
            at: Some(3),
        });
        let s2 = get_page_state(AgentKind::Codex, "m", &pad);
        let host1b = s2
            .slot_assignments
            .iter()
            .find(|a| a.lane_id == id1)
            .map(|a| a.micro_key_id.clone())
            .unwrap();
        assert_eq!(host1, host1b);
    }
}
