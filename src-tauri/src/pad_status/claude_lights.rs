//! Claude Hook multi-agent activity lights (OneTone-built, not official Micro thstatus).
//!
//! SubagentStart/Stop update this store only — never the primary PadStatus slot.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

use crate::pad_status::arbiter::DONE_SETTLE_MS;

pub const CLAUDE_MAIN_KEY: &str = "claude/main";
/// Slightly longer than done settle so failed remains visible before host release.
pub const FAILED_SETTLE_MS: u64 = 1200;
const SHORT_LABEL_MAX: usize = 10;

/// Cap-friendly agent_type short label (Rust/JS must stay in sync).
pub fn short_agent_type(agent_type: &str) -> String {
    let raw = agent_type.trim();
    if raw.is_empty() {
        return "Claude".into();
    }
    let lower = raw.to_ascii_lowercase();
    let mapped = match lower.as_str() {
        "code-reviewer" => "reviewer",
        "test-runner" => "tests",
        "debugger" => "debug",
        _ => "",
    };
    if !mapped.is_empty() {
        return mapped.into();
    }
    // Last segment after / or -
    let seg = raw
        .rsplit(['/', '-'])
        .next()
        .unwrap_or(raw)
        .trim();
    let seg = if seg.is_empty() { raw } else { seg };
    let mut out = String::new();
    for (i, ch) in seg.chars().enumerate() {
        if i >= SHORT_LABEL_MAX {
            break;
        }
        out.push(ch);
    }
    if out.is_empty() {
        "Claude".into()
    } else {
        out
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAgentLightState {
    pub agent_key: String,
    pub agent_id: String,
    pub agent_type: String,
    /// UI status: idle | running | needs_input | done | failed
    pub state: String,
    /// claude_hook | claude_app
    pub source: String,
    pub updated_at: u64,
    /// First-seen time for sticky host assignment order.
    pub first_seen_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event: Option<String>,
    pub confidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sticky_until: Option<u64>,
}

struct ClaudeLightsInner {
    by_key: HashMap<String, ClaudeAgentLightState>,
    /// Sticky microKeyId assignment: agent_key → AG0N (survives stop until released).
    host_by_agent: HashMap<String, String>,
    /// Durable near-window stamp for Soft Pad visibility (survives light settle / Codex overwrite).
    last_activity_at: u64,
    last_activity_source: String,
}

fn store() -> &'static Mutex<ClaudeLightsInner> {
    static STORE: OnceLock<Mutex<ClaudeLightsInner>> = OnceLock::new();
    STORE.get_or_init(|| {
        Mutex::new(ClaudeLightsInner {
            by_key: HashMap::new(),
            host_by_agent: HashMap::new(),
            last_activity_at: 0,
            last_activity_source: String::new(),
        })
    })
}

fn is_claude_activity_source(source: &str) -> bool {
    matches!(source.trim(), "claude_hook" | "claude_app")
}

/// Record Claude Hook/App activity for Soft Pad near-window show (not native / not Codex).
pub fn bump_activity(source: &str, at: u64) {
    if !is_claude_activity_source(source) || at == 0 {
        return;
    }
    let mut g = store().lock().unwrap();
    if at >= g.last_activity_at {
        g.last_activity_at = at;
        g.last_activity_source = source.trim().to_string();
    }
}

/// Age of durable Claude activity stamp; `None` when never set.
pub fn last_activity_age_ms(now: u64) -> Option<u64> {
    let g = store().lock().unwrap();
    if g.last_activity_at == 0 {
        return None;
    }
    Some(now.saturating_sub(g.last_activity_at))
}

/// Last durable Claude activity source (`claude_hook` / `claude_app`) or empty.
pub fn last_activity_source() -> String {
    store().lock().unwrap().last_activity_source.clone()
}

pub fn light_key(agent_id: &str, agent_type: &str) -> String {
    let id = agent_id.trim();
    if !id.is_empty() {
        return id.to_string();
    }
    let ty = agent_type.trim();
    if !ty.is_empty() {
        return ty.to_string();
    }
    CLAUDE_MAIN_KEY.to_string()
}

fn ui_state_from_event(event: &str) -> Option<&'static str> {
    match event.trim() {
        "SubagentStart" => Some("running"),
        "SubagentStop" => Some("done"),
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch" => Some("running"),
        "PermissionRequest" | "Elicitation" | "Notification" => Some("needs_input"),
        "Stop" | "TaskCompleted" => Some("done"),
        "StopFailure" | "PostToolUseFailure" => Some("failed"),
        // SessionStart/End: bump activity only (Soft Pad near-window) — never insert a light.
        "SessionStart" | "SessionEnd" => None,
        _ => None,
    }
}

/// SessionStart bumps Soft Pad near-window; SessionEnd is ignored for activity.
pub fn is_session_start(event: &str) -> bool {
    event.trim() == "SessionStart"
}

pub fn is_session_lifecycle(event: &str) -> bool {
    matches!(event.trim(), "SessionStart" | "SessionEnd")
}

fn is_subagent_event(event: &str) -> bool {
    matches!(event.trim(), "SubagentStart" | "SubagentStop")
}

/// Whether this Claude event should update primary PadStatus (not Subagent* / Session*).
pub fn affects_primary_pad_status(event: &str) -> bool {
    !is_subagent_event(event)
        && !is_session_lifecycle(event)
        && ui_state_from_event(event).is_some()
}

/// Apply Claude Hook event into the multi-light store. Never writes primary PadStatus.
/// SessionStart/End do not insert lights (caller should bump_activity for SessionStart).
pub fn apply_claude_light(
    event: &str,
    agent_id: &str,
    agent_type: &str,
    source_label: &str,
    session_id: &str,
    turn_id: &str,
    ts: u64,
    now: u64,
) {
    if is_session_lifecycle(event) {
        return;
    }
    let Some(state) = ui_state_from_event(event) else {
        return;
    };
    let key = light_key(agent_id, agent_type);
    let at = if ts > 0 { ts } else { now };
    let src = if source_label.trim() == "claude_app" {
        "claude_app"
    } else {
        "claude_hook"
    };
    let sticky_until = match state {
        "needs_input" => Some(at.saturating_add(24 * 60 * 60 * 1000)),
        "done" => Some(at.saturating_add(DONE_SETTLE_MS)),
        "failed" => Some(at.saturating_add(FAILED_SETTLE_MS)),
        _ => None,
    };
    let message = match state {
        "needs_input" => Some("等待确认".into()),
        "running" => Some("执行中".into()),
        "done" => Some("本回合完成".into()),
        "failed" => Some("出现失败".into()),
        _ => None,
    };

    let mut g = store().lock().unwrap();
    if at >= g.last_activity_at {
        g.last_activity_at = at;
        g.last_activity_source = src.to_string();
    }
    let first_seen = g
        .by_key
        .get(&key)
        .map(|e| e.first_seen_at)
        .unwrap_or(at);
    let entry = ClaudeAgentLightState {
        agent_key: key.clone(),
        agent_id: agent_id.trim().to_string(),
        agent_type: agent_type.trim().to_string(),
        state: state.into(),
        source: src.into(),
        updated_at: at,
        first_seen_at: first_seen,
        task_id: {
            let t = turn_id.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        },
        session_id: {
            let s = session_id.trim();
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        },
        message,
        last_event: Some(event.trim().to_string()),
        confidence: "high".into(),
        sticky_until,
    };
    g.by_key.insert(key, entry);
}

/// Settle done/failed→idle and drop idle entries; release sticky hosts for removed keys.
pub fn settle_at(now: u64) {
    let mut g = store().lock().unwrap();
    let mut remove = Vec::new();
    for (k, e) in g.by_key.iter_mut() {
        let settle_ms = match e.state.as_str() {
            "done" => Some(DONE_SETTLE_MS),
            "failed" => Some(FAILED_SETTLE_MS),
            _ => None,
        };
        if let Some(default_ms) = settle_ms {
            let base = e
                .sticky_until
                .unwrap_or(e.updated_at.saturating_add(default_ms));
            if now >= base {
                e.state = "idle".into();
                e.updated_at = now;
                remove.push(k.clone());
            }
        } else if e.state == "idle" {
            remove.push(k.clone());
        }
    }
    for k in remove {
        g.by_key.remove(&k);
        g.host_by_agent.remove(&k);
    }
}

pub fn snapshot_active(now: u64) -> Vec<ClaudeAgentLightState> {
    settle_at(now);
    let g = store().lock().unwrap();
    let mut out: Vec<_> = g
        .by_key
        .values()
        .filter(|e| e.state != "idle")
        .cloned()
        .collect();
    out.sort_by(|a, b| {
        a.first_seen_at
            .cmp(&b.first_seen_at)
            .then_with(|| a.agent_key.cmp(&b.agent_key))
    });
    out
}

/// Sticky host map for assignment (agent_key → microKeyId).
pub fn host_assignments() -> HashMap<String, String> {
    store().lock().unwrap().host_by_agent.clone()
}

pub fn set_host_assignment(agent_key: &str, micro_key_id: &str) {
    let mut g = store().lock().unwrap();
    g.host_by_agent
        .insert(agent_key.to_string(), micro_key_id.to_string());
}

pub fn clear_host_assignment(agent_key: &str) {
    store().lock().unwrap().host_by_agent.remove(agent_key);
}

/// Clear all Claude activity lights and sticky hosts (diagnose / test inject only).
pub fn clear_all() {
    let mut g = store().lock().unwrap();
    g.by_key.clear();
    g.host_by_agent.clear();
    g.last_activity_at = 0;
    g.last_activity_source.clear();
}

#[cfg(test)]
pub fn reset_for_test() {
    let mut g = store().lock().unwrap();
    g.by_key.clear();
    g.host_by_agent.clear();
    g.last_activity_at = 0;
    g.last_activity_source.clear();
}

#[cfg(test)]
pub fn test_set_last_activity_at(at: u64, source: &str) {
    let mut g = store().lock().unwrap();
    g.last_activity_at = at;
    g.last_activity_source = if is_claude_activity_source(source) {
        source.trim().to_string()
    } else if at == 0 {
        String::new()
    } else {
        "claude_hook".into()
    };
}

#[cfg(test)]
pub fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subagent_start_stop_only_store() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light(
            "SubagentStart",
            "a1",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            100,
            100,
        );
        let snap = snapshot_active(100);
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].state, "running");
        assert_eq!(snap[0].agent_key, "a1");

        apply_claude_light(
            "SubagentStop",
            "a1",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            200,
            200,
        );
        let mid = snapshot_active(200);
        assert_eq!(mid.len(), 1);
        assert_eq!(mid[0].state, "done");

        let after = snapshot_active(200 + DONE_SETTLE_MS);
        assert!(after.is_empty());
    }

    #[test]
    fn missing_agent_goes_to_main() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light(
            "UserPromptSubmit",
            "",
            "",
            "claude_hook",
            "s",
            "",
            1,
            1,
        );
        let snap = snapshot_active(1);
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].agent_key, CLAUDE_MAIN_KEY);
    }

    #[test]
    fn two_agents_simultaneous() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light("SubagentStart", "a", "rev", "claude_hook", "", "", 1, 1);
        apply_claude_light("SubagentStart", "b", "test", "claude_hook", "", "", 2, 2);
        let snap = snapshot_active(2);
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].agent_key, "a");
        assert_eq!(snap[1].agent_key, "b");
    }

    #[test]
    fn permission_request_sticky_past_done_ttl() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light(
            "PermissionRequest",
            "a1",
            "review",
            "claude_hook",
            "s",
            "t",
            100,
            100,
        );
        let mid = snapshot_active(100 + DONE_SETTLE_MS + 50);
        assert_eq!(mid.len(), 1);
        assert_eq!(mid[0].state, "needs_input");
    }

    #[test]
    fn failed_ttl_removes_entry_and_host() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light(
            "StopFailure",
            "fail-agent",
            "review",
            "claude_hook",
            "s",
            "t",
            100,
            100,
        );
        set_host_assignment("fail-agent", "AG02");
        assert_eq!(
            host_assignments().get("fail-agent").map(String::as_str),
            Some("AG02")
        );
        let mid = snapshot_active(100 + 500);
        assert_eq!(mid.len(), 1);
        assert_eq!(mid[0].state, "failed");
        assert!(host_assignments().contains_key("fail-agent"));

        let after = snapshot_active(100 + FAILED_SETTLE_MS);
        assert!(after.is_empty());
        assert!(!host_assignments().contains_key("fail-agent"));
    }

    #[test]
    fn done_ttl_removes_entry_and_host() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light(
            "SubagentStop",
            "done-agent",
            "review",
            "claude_hook",
            "s",
            "t",
            100,
            100,
        );
        set_host_assignment("done-agent", "AG03");
        let after = snapshot_active(100 + DONE_SETTLE_MS);
        assert!(after.is_empty());
        assert!(!host_assignments().contains_key("done-agent"));
    }

    #[test]
    fn subagent_stop_only_clears_matching_agent() {
        let _g = test_lock();
        reset_for_test();
        apply_claude_light("SubagentStart", "a", "rev", "claude_hook", "", "", 1, 1);
        apply_claude_light("SubagentStart", "b", "test", "claude_hook", "", "", 2, 2);
        apply_claude_light("SubagentStop", "a", "rev", "claude_hook", "", "", 3, 3);
        let snap = snapshot_active(3);
        assert_eq!(snap.len(), 2);
        let a = snap.iter().find(|e| e.agent_key == "a").unwrap();
        let b = snap.iter().find(|e| e.agent_key == "b").unwrap();
        assert_eq!(a.state, "done");
        assert_eq!(b.state, "running");
    }

    #[test]
    fn short_agent_type_mappings() {
        assert_eq!(short_agent_type("code-reviewer"), "reviewer");
        assert_eq!(short_agent_type("test-runner"), "tests");
        assert_eq!(short_agent_type("debugger"), "debug");
        assert_eq!(short_agent_type(""), "Claude");
        assert_eq!(short_agent_type("team/explorer"), "explorer");
        assert_eq!(short_agent_type("very-long-agent-name"), "name");
    }

    #[test]
    fn last_activity_stamp_from_apply_and_clear() {
        let _g = test_lock();
        reset_for_test();
        assert!(last_activity_age_ms(100).is_none());
        apply_claude_light(
            "SubagentStart",
            "a1",
            "rev",
            "claude_hook",
            "s",
            "t",
            50,
            50,
        );
        assert_eq!(last_activity_age_ms(150), Some(100));
        assert_eq!(last_activity_source(), "claude_hook");
        clear_all();
        assert!(last_activity_age_ms(200).is_none());
    }
}
