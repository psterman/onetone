//! Codex App Server → AgentLaneStore bridge (long-lived ingest helpers).
//! Full sidecar lives alongside agent_usage; this module maps thread events into lanes.

use crate::agent_lane::store::{ingest_lane_event, LaneIngest};
use crate::soft_pad_runtime::AgentKind;
use serde_json::Value;

/// Map an App Server JSON-RPC notification/response fragment into a lane ingest.
pub fn ingest_app_server_message(message: &Value) -> bool {
    let method = message
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let params = message.get("params").cloned().unwrap_or(Value::Null);

    let (event, thread_id, cwd) = match method {
        "thread/status/changed" => {
            let tid = params
                .get("threadId")
                .or_else(|| params.get("thread_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let status = params.get("status").cloned().unwrap_or(Value::Null);
            let ty = status
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("idle");
            let event = match ty {
                "active" => {
                    let flags = status
                        .get("activeFlags")
                        .or_else(|| status.get("active_flags"))
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();
                    let waiting = flags.iter().any(|f| {
                        f.as_str()
                            .map(|s| s.contains("waiting") || s.contains("Approval"))
                            .unwrap_or(false)
                    });
                    if waiting {
                        "needs_input"
                    } else {
                        "working"
                    }
                }
                "systemError" => "error",
                "idle" => "idle",
                _ => "idle",
            };
            (event, tid, String::new())
        }
        "turn/started" => {
            let tid = params
                .pointer("/turn/threadId")
                .or_else(|| params.get("threadId"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ("working", tid, String::new())
        }
        "turn/completed" => {
            let tid = params
                .pointer("/turn/threadId")
                .or_else(|| params.get("threadId"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let st = params
                .pointer("/turn/status")
                .and_then(|v| v.as_str())
                .unwrap_or("completed");
            let event = if st == "completed" { "done" } else { "error" };
            (event, tid, String::new())
        }
        "thread/started" => {
            let tid = params
                .pointer("/thread/id")
                .or_else(|| params.get("threadId"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cwd = params
                .pointer("/thread/cwd")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ("working", tid, cwd)
        }
        _ => return false,
    };

    if thread_id.is_empty() {
        return false;
    }
    ingest_lane_event(LaneIngest {
        provider: AgentKind::Codex,
        workspace_id: cwd.clone(),
        session_id: thread_id,
        subagent_id: None,
        title: None,
        event: event.into(),
        source: "codex_app_server".into(),
        cwd,
        host_pid: 0,
        terminal_hwnd: 0,
        sequence: None,
        at: None,
    })
    .is_some()
}

/// After account/usage reads, optionally list threads once (best-effort discovery).
pub fn discover_threads_from_list_result(result: &Value) -> usize {
    let threads = result
        .get("threads")
        .or_else(|| result.get("data"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut n = 0;
    for t in threads {
        let tid = t
            .get("id")
            .or_else(|| t.get("threadId"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if tid.is_empty() {
            continue;
        }
        let cwd = t
            .get("cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let status = t.get("status").cloned().unwrap_or(Value::Null);
        let ty = status
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("idle");
        let event = match ty {
            "active" => "working",
            "systemError" => "error",
            _ => "idle",
        };
        if ingest_lane_event(LaneIngest {
            provider: AgentKind::Codex,
            workspace_id: cwd.clone(),
            session_id: tid.into(),
            subagent_id: None,
            title: t
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            event: event.into(),
            source: "codex_app_server".into(),
            cwd,
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: None,
            at: None,
        })
        .is_some()
        {
            n += 1;
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::store::{public_lanes_for_page, reset_for_test};

    #[test]
    fn app_server_status_changed_creates_lane() {
        reset_for_test();
        let msg = serde_json::json!({
            "method": "thread/status/changed",
            "params": {
                "threadId": "thr_1",
                "status": { "type": "active", "activeFlags": ["waitingOnApproval"] }
            }
        });
        assert!(ingest_app_server_message(&msg));
        let lanes = public_lanes_for_page(AgentKind::Codex);
        assert_eq!(lanes.len(), 1);
        assert_eq!(lanes[0].state.as_str(), "needs_input");
    }

    #[test]
    fn started_with_cwd_then_status_without_cwd_updates_same_lane() {
        reset_for_test();
        assert!(ingest_app_server_message(&serde_json::json!({
            "method": "thread/started",
            "params": { "thread": { "id": "thr_same", "cwd": "C:/repo" } }
        })));
        assert!(ingest_app_server_message(&serde_json::json!({
            "method": "thread/status/changed",
            "params": {
                "threadId": "thr_same",
                "status": { "type": "active", "activeFlags": ["waitingOnApproval"] }
            }
        })));
        let lanes = public_lanes_for_page(AgentKind::Codex);
        assert_eq!(lanes.len(), 1);
        assert_eq!(lanes[0].navigation.cwd, "C:/repo");
        assert_eq!(lanes[0].state.as_str(), "needs_input");
    }
}
