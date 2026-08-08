//! Lane store: ingest events, TTL settle, public projection.

use super::model::{
    AgentLane, LaneKey, LaneState, NavigationTarget, DONE_VISUAL_TTL_MS, INACTIVE_SLOT_TTL_MS,
};
use crate::soft_pad_runtime::AgentKind;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

struct Inner {
    lanes: HashMap<String, AgentLane>,
    active_subagents: HashMap<String, HashMap<String, LaneState>>,
    seq: u64,
}

fn store() -> &'static Mutex<Inner> {
    static STORE: OnceLock<Mutex<Inner>> = OnceLock::new();
    STORE.get_or_init(|| {
        Mutex::new(Inner {
            lanes: HashMap::new(),
            active_subagents: HashMap::new(),
            seq: 1,
        })
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn reset_for_test() {
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    g.lanes.clear();
    g.active_subagents.clear();
    g.seq = 1;
}

#[derive(Debug, Clone)]
pub struct LaneIngest {
    pub provider: AgentKind,
    pub workspace_id: String,
    pub session_id: String,
    pub subagent_id: Option<String>,
    pub title: Option<String>,
    pub event: String,
    pub source: String,
    pub cwd: String,
    pub host_pid: u32,
    pub terminal_hwnd: u64,
    pub sequence: Option<u64>,
    pub at: Option<u64>,
}

fn map_event(event: &str) -> Option<LaneState> {
    match event.trim() {
        "UserPromptSubmit" | "beforeSubmitPrompt" | "PreToolUse" | "PostToolUse"
        | "turn/started" | "SubagentStart" | "subagentStart" | "working" | "running" => {
            Some(LaneState::Working)
        }
        "PermissionRequest" | "permissionRequest" | "Elicitation" | "needs_input" => {
            Some(LaneState::NeedsInput)
        }
        "Stop" | "stop" | "TaskCompleted" | "turn/completed" | "afterAgentResponse" | "done"
        | "SubagentStop" | "subagentStop" => {
            Some(LaneState::DoneUnread)
        }
        "StopFailure" | "PostToolUseFailure" | "error" | "failed" => Some(LaneState::ErrorUnread),
        "SessionEnd" | "sessionEnd" | "disconnected" => Some(LaneState::Disconnected),
        "SessionStart" | "sessionStart" | "idle" | "interrupted" => Some(LaneState::Idle),
        _ => None,
    }
}

/// Top-level Claude session lane id ignores subagent (aggregate under session).
fn top_lane_id(provider: AgentKind, workspace: &str, session: &str) -> LaneKey {
    LaneKey {
        provider,
        workspace_id: workspace.trim().to_string(),
        session_id: session.trim().to_string(),
    }
}

pub fn ingest_lane_event(ev: LaneIngest) -> Option<String> {
    let Some(new_state) = map_event(&ev.event) else {
        return None;
    };
    let at = ev.at.unwrap_or_else(now_ms);
    let key = top_lane_id(ev.provider, &ev.workspace_id, &ev.session_id);
    let lane_id = key.lane_id();
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    let seq_in = ev.sequence.unwrap_or(0);

    if let Some(existing) = g.lanes.get(&lane_id) {
        if seq_in > 0 && existing.sequence > 0 && seq_in < existing.sequence {
            return Some(lane_id); // reject stale
        }
    }

    g.seq = g.seq.saturating_add(1);
    let seq = if seq_in > 0 { seq_in } else { g.seq };

    let mut entry = g.lanes.remove(&lane_id).unwrap_or_else(|| AgentLane {
        lane_id: lane_id.clone(),
        key: key.clone(),
        subagent_id: None,
        title: None,
        state: LaneState::Idle,
        source: String::new(),
        confidence: "medium".into(),
        first_seen_at: at,
        updated_at: at,
        acknowledged_at: None,
        done_at: None,
        navigation: NavigationTarget {
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            terminal_title: String::new(),
        },
        subagent_summary: Vec::new(),
        sequence: 0,
    });

    entry.sequence = seq;
    entry.updated_at = at;
    entry.source = ev.source;
    // Later lifecycle messages may omit workspace/cwd; retain the best metadata.
    if entry.key.workspace_id.is_empty() && !key.workspace_id.is_empty() {
        entry.key.workspace_id = key.workspace_id.clone();
    }
    if let Some(t) = ev.title {
        if !t.is_empty() {
            entry.title = Some(t);
        }
    }
    if !ev.cwd.is_empty() {
        entry.navigation.cwd = ev.cwd;
    }
    if ev.host_pid != 0 {
        entry.navigation.host_pid = ev.host_pid;
    }
    if ev.terminal_hwnd != 0 {
        entry.navigation.terminal_hwnd = ev.terminal_hwnd;
    }

    if new_state == LaneState::Disconnected {
        entry.navigation.host_pid = 0;
        entry.navigation.terminal_hwnd = 0;
        g.active_subagents.remove(&lane_id);
    }

    // Track active Claude subagents and recompute instead of keeping the
    // highest state forever after SubagentStop.
    if ev.provider == AgentKind::Claude {
        if let Some(sid) = ev.subagent_id.filter(|s| !s.is_empty()) {
            let active = g.active_subagents.entry(lane_id.clone()).or_default();
            if ev.event.trim() == "SubagentStop" {
                active.remove(&sid);
            } else {
                active.insert(sid, new_state);
            }
            let mut labels: Vec<_> = active.keys().cloned().collect();
            labels.sort();
            entry.subagent_summary = labels;
            entry.state = active
                .values()
                .copied()
                .reduce(aggregate_state)
                .unwrap_or(new_state);
        } else {
            entry.state = new_state;
        }
    } else {
        entry.state = new_state;
    }

    if matches!(entry.state, LaneState::DoneUnread | LaneState::ErrorUnread) {
        entry.done_at = Some(at);
        entry.acknowledged_at = None;
    }
    if matches!(entry.state, LaneState::Working | LaneState::NeedsInput) {
        entry.done_at = None;
        entry.acknowledged_at = None;
    }

    g.lanes.insert(lane_id.clone(), entry);

    settle_ttl(&mut g.lanes, at);
    Some(lane_id)
}

fn aggregate_state(cur: LaneState, incoming: LaneState) -> LaneState {
    use LaneState::*;
    let rank = |s: LaneState| match s {
        NeedsInput => 5,
        Working => 4,
        ErrorUnread => 3,
        DoneUnread => 2,
        Idle | DoneAcknowledged | Disconnected => 1,
    };
    if rank(incoming) >= rank(cur) {
        incoming
    } else {
        cur
    }
}

fn settle_ttl(lanes: &mut HashMap<String, AgentLane>, now: u64) {
    let mut drop_ids = Vec::new();
    for (id, lane) in lanes.iter_mut() {
        if lane.state == LaneState::DoneUnread {
            if let Some(done_at) = lane.done_at {
                if now.saturating_sub(done_at) >= DONE_VISUAL_TTL_MS {
                    lane.state = LaneState::Idle;
                }
            }
        }
        if matches!(
            lane.state,
            LaneState::Idle | LaneState::DoneAcknowledged | LaneState::Disconnected
        ) {
            let age = now.saturating_sub(lane.updated_at);
            if age >= INACTIVE_SLOT_TTL_MS && lane.acknowledged_at.is_some()
                || age >= INACTIVE_SLOT_TTL_MS * 2
            {
                drop_ids.push(id.clone());
            }
        }
    }
    for id in drop_ids {
        lanes.remove(&id);
    }
}

pub fn acknowledge_lane(lane_id: &str) -> bool {
    let now = now_ms();
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    let Some(lane) = g.lanes.get_mut(lane_id) else {
        return false;
    };
    lane.acknowledged_at = Some(now);
    if lane.state == LaneState::DoneUnread || lane.state == LaneState::ErrorUnread {
        lane.state = LaneState::DoneAcknowledged;
    }
    lane.updated_at = now;
    true
}

pub fn public_lanes_for_page(provider: AgentKind) -> Vec<AgentLane> {
    let now = now_ms();
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    settle_ttl(&mut g.lanes, now);
    let mut out: Vec<_> = g
        .lanes
        .values()
        .filter(|l| l.key.provider == provider)
        .cloned()
        .collect();
    out.sort_by(|a, b| {
        a.first_seen_at
            .cmp(&b.first_seen_at)
            .then_with(|| a.lane_id.cmp(&b.lane_id))
    });
    out
}

pub fn get_lane(lane_id: &str) -> Option<AgentLane> {
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .lanes
        .get(lane_id)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_two_threads_do_not_overwrite() {
        reset_for_test();
        let a = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t1".into(),
            subagent_id: None,
            title: Some("one".into()),
            event: "working".into(),
            source: "test".into(),
            cwd: "C:/a".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(100),
        })
        .unwrap();
        let b = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t2".into(),
            subagent_id: None,
            title: Some("two".into()),
            event: "needs_input".into(),
            source: "test".into(),
            cwd: "C:/a".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(110),
        })
        .unwrap();
        assert_ne!(a, b);
        let lanes = public_lanes_for_page(AgentKind::Codex);
        assert_eq!(lanes.len(), 2);
        assert!(lanes.iter().any(|l| l.state == LaneState::NeedsInput));
        assert!(lanes.iter().any(|l| l.state == LaneState::Working));
    }

    #[test]
    fn claude_same_agent_id_different_sessions() {
        reset_for_test();
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w1".into(),
            session_id: "s1".into(),
            subagent_id: Some("reviewer".into()),
            title: None,
            event: "SubagentStart".into(),
            source: "claude_hook".into(),
            cwd: "C:/w1".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(1),
        });
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w2".into(),
            session_id: "s2".into(),
            subagent_id: Some("reviewer".into()),
            title: None,
            event: "SubagentStart".into(),
            source: "claude_hook".into(),
            cwd: "C:/w2".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(2),
        });
        assert_eq!(public_lanes_for_page(AgentKind::Claude).len(), 2);
    }

    #[test]
    fn stale_event_cannot_regress_state() {
        reset_for_test();
        let id = ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t".into(),
            subagent_id: None,
            title: None,
            event: "needs_input".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(5),
            at: Some(50),
        })
        .unwrap();
        ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: "w".into(),
            session_id: "t".into(),
            subagent_id: None,
            title: None,
            event: "idle".into(),
            source: "test".into(),
            cwd: String::new(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(3),
            at: Some(60),
        });
        let lane = get_lane(&id).unwrap();
        assert_eq!(lane.state, LaneState::NeedsInput);
    }

    #[test]
    fn done_visual_ttl_does_not_immediately_release_slot() {
        reset_for_test();
        let id = ingest_lane_event(LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "s".into(),
            subagent_id: None,
            title: None,
            event: "done".into(),
            source: "test".into(),
            cwd: "C:/w".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(1000),
        })
        .unwrap();
        // Immediately still present as done_unread
        let lane = get_lane(&id).unwrap();
        assert_eq!(lane.state, LaneState::DoneUnread);
        acknowledge_lane(&id);
        let lane = get_lane(&id).unwrap();
        assert_eq!(lane.state, LaneState::DoneAcknowledged);
        // Still in store (slot TTL not elapsed)
        assert!(get_lane(&id).is_some());
    }

    #[test]
    fn stopped_claude_subagent_is_removed_from_aggregate() {
        reset_for_test();
        let make = |event: &str, at: u64| LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "s".into(),
            subagent_id: Some("reviewer".into()),
            title: None,
            event: event.into(),
            source: "test".into(),
            cwd: "C:/w".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: None,
            at: Some(at),
        };
        let id = ingest_lane_event(make("SubagentStart", 1)).unwrap();
        assert_eq!(get_lane(&id).unwrap().state, LaneState::Working);
        ingest_lane_event(make("SubagentStop", 2));
        let lane = get_lane(&id).unwrap();
        assert!(lane.subagent_summary.is_empty());
        assert_eq!(lane.state, LaneState::DoneUnread);
    }

    #[test]
    fn session_end_clears_live_navigation() {
        reset_for_test();
        let make = |event: &str, hwnd: u64, pid: u32, at: u64| LaneIngest {
            provider: AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "s".into(),
            subagent_id: None,
            title: None,
            event: event.into(),
            source: "test".into(),
            cwd: "C:/w".into(),
            host_pid: pid,
            terminal_hwnd: hwnd,
            sequence: None,
            at: Some(at),
        };
        let id = ingest_lane_event(make("working", 123, 456, 1)).unwrap();
        ingest_lane_event(make("SessionEnd", 0, 0, 2));
        let lane = get_lane(&id).unwrap();
        assert_eq!(lane.navigation.host_pid, 0);
        assert_eq!(lane.navigation.terminal_hwnd, 0);
        assert_eq!(lane.state, LaneState::Disconnected);
    }
}
