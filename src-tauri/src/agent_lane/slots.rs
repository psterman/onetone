//! Sticky AG slot assignment within a SessionLanes AG surface.

use super::model::{AgentLane, LaneState};
use crate::config::CodexMicroPadConfig;
use crate::soft_pad_purpose::{
    effective_auto_assignable, is_ag_micro_key, is_navigation_micro_key, AssignmentMode,
    SoftPadKeyRole,
};
use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotAssignment {
    pub micro_key_id: String,
    pub lane_id: String,
}

/// Runtime sticky: lane_id -> micro_key_id (not persisted to mapping).
fn sticky() -> &'static Mutex<HashMap<String, String>> {
    static S: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn reset_sticky_for_test() {
    sticky().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

fn assignable_keys(kind: AgentKind, pad: &CodexMicroPadConfig) -> Vec<String> {
    let mut out = Vec::new();
    for r in &pad.keys {
        if !r.enabled {
            continue;
        }
        let mid = r.micro_key_id.trim();
        if !is_ag_micro_key(mid) {
            continue;
        }
        if !is_navigation_micro_key(kind, pad, mid) {
            continue;
        }
        let role = SoftPadKeyRole::AgentLane;
        // Pinned preferences always include the key even if auto_assignable false
        let pinned = pad.pinned_lane_preferences.iter().any(|p| {
            p.micro_key_id.trim() == mid && p.assignment_mode == AssignmentMode::Pinned
        });
        let auto = effective_auto_assignable(kind, pad.purpose, mid, role, r.auto_assignable);
        if auto || pinned {
            out.push(mid.to_string());
        }
    }
    out.sort();
    out
}

fn rank(state: LaneState) -> u8 {
    match state {
        LaneState::NeedsInput => 0,
        LaneState::ErrorUnread => 1,
        LaneState::Working => 2,
        LaneState::DoneUnread => 3,
        _ => 4,
    }
}

pub fn assign_slots(
    kind: AgentKind,
    pad: &CodexMicroPadConfig,
    lanes: &[AgentLane],
) -> (Vec<SlotAssignment>, Vec<String>) {
    let keys = assignable_keys(kind, pad);
    if keys.is_empty() {
        return (
            Vec::new(),
            lanes.iter().map(|l| l.lane_id.clone()).collect(),
        );
    }

    let mut sticky_map = sticky().lock().unwrap_or_else(|e| e.into_inner());
    let mut used_keys: HashSet<String> = HashSet::new();
    let mut assigned: Vec<SlotAssignment> = Vec::new();
    let mut placed: HashSet<String> = HashSet::new();

    // 1) User pinned preferences
    for pref in &pad.pinned_lane_preferences {
        if pref.assignment_mode != AssignmentMode::Pinned {
            continue;
        }
        let mid = pref.micro_key_id.trim();
        if !keys.iter().any(|k| k == mid) || used_keys.contains(mid) {
            continue;
        }
        let Some(sel) = pref.selector.as_ref() else {
            continue;
        };
        if let Some(lane) = lanes.iter().find(|l| {
            (sel.session_id.is_empty() || l.key.session_id == sel.session_id)
                && (sel.workspace.is_empty() || l.key.workspace_id == sel.workspace)
                && (sel.provider.is_empty() || l.key.provider.as_str() == sel.provider)
        }) {
            assigned.push(SlotAssignment {
                micro_key_id: mid.to_string(),
                lane_id: lane.lane_id.clone(),
            });
            used_keys.insert(mid.to_string());
            placed.insert(lane.lane_id.clone());
            sticky_map.insert(lane.lane_id.clone(), mid.to_string());
        }
    }

    // 2) Keep sticky mappings
    for lane in lanes {
        if placed.contains(&lane.lane_id) {
            continue;
        }
        if let Some(host) = sticky_map.get(&lane.lane_id).cloned() {
            if keys.iter().any(|k| k == &host) && !used_keys.contains(&host) {
                assigned.push(SlotAssignment {
                    micro_key_id: host.clone(),
                    lane_id: lane.lane_id.clone(),
                });
                used_keys.insert(host);
                placed.insert(lane.lane_id.clone());
            }
        }
    }

    // 3) Fill remaining by priority (stable: don't reshuffle existing)
    let mut rest: Vec<&AgentLane> = lanes.iter().filter(|l| !placed.contains(&l.lane_id)).collect();
    rest.sort_by(|a, b| {
        rank(a.state)
            .cmp(&rank(b.state))
            .then_with(|| a.first_seen_at.cmp(&b.first_seen_at))
            .then_with(|| a.lane_id.cmp(&b.lane_id))
    });

    for lane in rest {
        let free = keys.iter().find(|k| !used_keys.contains(*k));
        let Some(host) = free else {
            break;
        };
        // needs_input must not evict pinned — already handled by used_keys
        assigned.push(SlotAssignment {
            micro_key_id: host.clone(),
            lane_id: lane.lane_id.clone(),
        });
        sticky_map.insert(lane.lane_id.clone(), host.clone());
        used_keys.insert(host.clone());
        placed.insert(lane.lane_id.clone());
    }

    let overflow: Vec<String> = lanes
        .iter()
        .filter(|l| !placed.contains(&l.lane_id))
        .map(|l| l.lane_id.clone())
        .collect();

    assigned.sort_by(|a, b| a.micro_key_id.cmp(&b.micro_key_id));
    (assigned, overflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::model::{LaneKey, NavigationTarget};
    use crate::config::CodexMicroPadKeyRoute;
    use crate::soft_pad_purpose::SoftPadPurpose;

    fn lane(id: &str, state: LaneState, seen: u64) -> AgentLane {
        AgentLane {
            lane_id: id.into(),
            key: LaneKey {
                provider: AgentKind::Codex,
                workspace_id: "w".into(),
                session_id: id.into(),
            },
            subagent_id: None,
            title: None,
            state,
            source: "test".into(),
            confidence: "high".into(),
            first_seen_at: seen,
            updated_at: seen,
            acknowledged_at: None,
            done_at: None,
            navigation: NavigationTarget {
                cwd: String::new(),
                host_pid: 0,
                terminal_hwnd: 0,
                terminal_title: String::new(),
            },
            subagent_summary: Vec::new(),
            sequence: 1,
        }
    }

    #[test]
    fn overflow_does_not_overwrite_shortcuts() {
        reset_sticky_for_test();
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            ..Default::default()
        };
        // Only 2 assignable AG keys
        for i in 0..2 {
            pad.keys.push(CodexMicroPadKeyRoute {
                micro_key_id: format!("AG{i:02}"),
                key_role: Some(SoftPadKeyRole::AgentLane),
                auto_assignable: Some(true),
                ..Default::default()
            });
        }
        // AG02 action-only
        pad.keys.push(CodexMicroPadKeyRoute {
            micro_key_id: "AG02".into(),
            key_role: Some(SoftPadKeyRole::Action),
            auto_assignable: Some(false),
            slot_id: "commandPalette".into(),
            ..Default::default()
        });
        let lanes = vec![
            lane("a", LaneState::Working, 1),
            lane("b", LaneState::Working, 2),
            lane("c", LaneState::NeedsInput, 3),
        ];
        let (asg, ov) = assign_slots(AgentKind::Codex, &pad, &lanes);
        assert_eq!(asg.len(), 2);
        assert_eq!(ov.len(), 1);
        assert!(!asg.iter().any(|a| a.micro_key_id == "AG02"));
    }

    #[test]
    fn action_only_keys_never_auto_assigned() {
        reset_sticky_for_test();
        let pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Shortcuts,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "AG00".into(),
                slot_id: "commandPalette".into(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let (asg, ov) = assign_slots(AgentKind::Codex, &pad, &[lane("x", LaneState::Working, 1)]);
        assert!(asg.is_empty());
        assert_eq!(ov.len(), 1);
    }

    #[test]
    fn cursor_sessions_assigns_nothing() {
        reset_sticky_for_test();
        let mut pad = CodexMicroPadConfig {
            purpose: SoftPadPurpose::Sessions,
            ..Default::default()
        };
        pad.keys.push(CodexMicroPadKeyRoute {
            micro_key_id: "AG00".into(),
            key_role: Some(SoftPadKeyRole::AgentLane),
            auto_assignable: Some(true),
            ..Default::default()
        });
        let (asg, ov) = assign_slots(AgentKind::Cursor, &pad, &[lane("x", LaneState::Working, 1)]);
        assert!(asg.is_empty());
        assert_eq!(ov.len(), 1);
    }
}
