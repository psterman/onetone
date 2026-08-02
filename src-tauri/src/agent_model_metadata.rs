//! Best-effort model labels for the three Soft Pad agent chips.
//!
//! This is deliberately separate from `PadStatus`: lifecycle arbitration has one
//! winner, while the minimized strip presents one durable row per agent.

use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelMetadata {
    pub model: String,
    pub confidence: String,
    pub session_id: String,
    pub updated_at: u64,
}

fn store() -> &'static Mutex<HashMap<AgentKind, AgentModelMetadata>> {
    static STORE: OnceLock<Mutex<HashMap<AgentKind, AgentModelMetadata>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn ingest_hook_model(
    agent: AgentKind,
    event: &str,
    session_id: &str,
    raw_model: &str,
    updated_at: u64,
) {
    let raw = raw_model.trim();
    if agent == AgentKind::Claude && event.trim() != "SessionStart" {
        return;
    }
    if raw.is_empty() {
        if agent == AgentKind::Claude && event.trim() == "SessionStart" {
            store()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&AgentKind::Claude);
        }
        return;
    }
    let (model, confidence) = match agent {
        AgentKind::Codex => (raw.to_string(), "high"),
        // Claude only promises the session-start model. A later /model change is invisible.
        AgentKind::Claude => (raw.to_string(), "low"),
        // Cursor may report the router rather than its resolved model.
        AgentKind::Cursor if raw.eq_ignore_ascii_case("default") => ("Auto".into(), "low"),
        AgentKind::Cursor => (raw.to_string(), "medium"),
        AgentKind::CopilotCli => return,
    };
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    g.insert(
        agent,
        AgentModelMetadata {
            model,
            confidence: confidence.into(),
            session_id: session_id.trim().to_string(),
            updated_at,
        },
    );
}

pub fn snapshot(agent: AgentKind) -> AgentModelMetadata {
    store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&agent)
        .cloned()
        .unwrap_or_default()
}

#[cfg(test)]
pub fn reset_for_test() {
    store().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cursor_default_is_honest_auto() {
        reset_for_test();
        ingest_hook_model(AgentKind::Cursor, "beforeSubmitPrompt", "c1", "default", 7);
        let got = snapshot(AgentKind::Cursor);
        assert_eq!(got.model, "Auto");
        assert_eq!(got.confidence, "low");
    }

    #[test]
    fn claude_only_accepts_session_start_model() {
        reset_for_test();
        ingest_hook_model(AgentKind::Claude, "SessionStart", "s1", "claude-sonnet", 1);
        ingest_hook_model(AgentKind::Claude, "Stop", "s1", "claude-opus", 2);
        assert_eq!(snapshot(AgentKind::Claude).model, "claude-sonnet");
        ingest_hook_model(AgentKind::Claude, "SessionStart", "s2", "", 3);
        assert!(snapshot(AgentKind::Claude).model.is_empty());
    }
}
