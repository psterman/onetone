//! Plan C Phase 4: read-only query surface (MCP-ready IPC).
//! No writes, no SQL passthrough, project-scoped limits.

use crate::agent_memory::checkpoint::{latest_checkpoint_for_project, latest_checkpoint_for_session};
use crate::agent_memory::context::project_context;
use crate::agent_memory::memory::query_memory;
use crate::agent_memory::session_events::list_session_events;
use crate::agent_memory::UNKNOWN_PROJECT_ID;
use std::path::Path;

const MAX_QUERY_CHARS: usize = 200;
const MAX_LIMIT: usize = 30;

fn reject_sqlish(q: &str) -> Result<(), String> {
    let lower = q.to_ascii_lowercase();
    for bad in ["select ", "insert ", "update ", "delete ", "drop ", ";", "--", "/*"] {
        if lower.contains(bad) {
            return Err("sql_rejected".into());
        }
    }
    Ok(())
}

fn clamp_query(q: &str) -> Result<String, String> {
    reject_sqlish(q)?;
    if q.chars().count() > MAX_QUERY_CHARS {
        return Err(format!("query too long (max {MAX_QUERY_CHARS})"));
    }
    Ok(q.trim().to_string())
}

/// MCP tool: agent_project_context
pub fn tool_project_context(project_id: Option<&str>, project_root: Option<&Path>) -> serde_json::Value {
    let ctx = if let Some(root) = project_root {
        project_context(Some(root), 8)
    } else {
        project_context(None, 8)
    };
    let pid = project_id.unwrap_or(ctx.project.project_id.as_str());
    if pid == UNKNOWN_PROJECT_ID {
        return serde_json::json!({
            "ok": true,
            "tool": "agent_project_context",
            "projectId": pid,
            "unknown": true,
            "context": ctx,
        });
    }
    // If caller asked for a specific project_id, reject cross-project mix.
    if let Some(want) = project_id {
        if want != ctx.project.project_id && want != UNKNOWN_PROJECT_ID {
            return serde_json::json!({
                "ok": false,
                "tool": "agent_project_context",
                "error": "project_mismatch",
                "requested": want,
                "resolved": ctx.project.project_id,
            });
        }
    }
    serde_json::json!({
        "ok": true,
        "tool": "agent_project_context",
        "projectId": ctx.project.project_id,
        "unknown": false,
        "context": ctx,
    })
}

/// MCP tool: agent_memory_search
pub fn tool_memory_search(project_id: &str, query: &str, limit: Option<u32>) -> serde_json::Value {
    if project_id.trim().is_empty() || project_id == UNKNOWN_PROJECT_ID {
        return serde_json::json!({
            "ok": false,
            "tool": "agent_memory_search",
            "error": "unknown_project"
        });
    }
    let q = match clamp_query(query) {
        Ok(q) => q,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "tool": "agent_memory_search",
                "error": e
            })
        }
    };
    let lim = limit.unwrap_or(8).min(MAX_LIMIT as u32) as usize;
    match query_memory(project_id, &q, lim) {
        Ok(rows) => serde_json::json!({
            "ok": true,
            "tool": "agent_memory_search",
            "projectId": project_id,
            "memories": rows,
            "scope": "project"
        }),
        Err(e) => serde_json::json!({
            "ok": false,
            "tool": "agent_memory_search",
            "error": e
        }),
    }
}

/// MCP tool: agent_session_history
pub fn tool_session_history(
    session_id: &str,
    limit: Option<u32>,
    before: Option<u64>,
) -> serde_json::Value {
    if session_id.trim().is_empty() {
        return serde_json::json!({
            "ok": false,
            "tool": "agent_session_history",
            "error": "session_id required"
        });
    }
    let lim = limit.unwrap_or(50).min(200) as usize;
    let (events, complete) = list_session_events(session_id, lim, before);
    serde_json::json!({
        "ok": true,
        "tool": "agent_session_history",
        "sessionId": session_id,
        "events": events,
        "complete": complete,
        "readonly": true
    })
}

/// MCP tool: agent_checkpoint_preview
pub fn tool_checkpoint_preview(
    session_id: Option<&str>,
    project_id: Option<&str>,
) -> serde_json::Value {
    let ckpt = if let Some(sid) = session_id.filter(|s| !s.trim().is_empty()) {
        latest_checkpoint_for_session(sid)
    } else if let Some(pid) = project_id.filter(|s| !s.trim().is_empty() && *s != UNKNOWN_PROJECT_ID)
    {
        latest_checkpoint_for_project(pid)
    } else {
        None
    };
    match ckpt {
        Some(c) => serde_json::json!({
            "ok": true,
            "tool": "agent_checkpoint_preview",
            "checkpoint": c,
            "readonly": true,
            "executes": false
        }),
        None => serde_json::json!({
            "ok": true,
            "tool": "agent_checkpoint_preview",
            "checkpoint": null,
            "readonly": true
        }),
    }
}
