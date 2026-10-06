//! Agent home IPC — Plan A snapshot, Plan B lifecycle, Plan C checkpoint/memory/context/MCP-ready.

use crate::agent_memory::{self, AgentHomeSnapshot, LIFECYCLE_SUMMARY_MAX};
use crate::AppState;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentHomeSnapshotArgs {
    pub project_hint: Option<String>,
}

#[tauri::command]
pub fn cmd_agent_home_snapshot(
    state: State<'_, Arc<AppState>>,
    args: Option<AgentHomeSnapshotArgs>,
) -> AgentHomeSnapshot {
    let _ = state;
    let hint = args
        .and_then(|a| a.project_hint)
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from);
    agent_memory::home_snapshot(hint.as_deref())
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionEventsArgs {
    pub session_id: String,
    pub limit: Option<u32>,
    pub before: Option<u64>,
}

#[tauri::command]
pub fn cmd_agent_session_events(
    state: State<'_, Arc<AppState>>,
    args: AgentSessionEventsArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let lim = args.limit.unwrap_or(50).min(200) as usize;
    let (events, complete) = agent_memory::list_session_events(&args.session_id, lim, args.before);
    serde_json::json!({
        "sessionId": args.session_id,
        "events": events,
        "complete": complete
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLifecycleArgs {
    pub session_id: String,
    pub provider: Option<String>,
    pub event_type: String,
    pub summary: Option<String>,
}

#[tauri::command]
pub fn cmd_agent_lifecycle_event(
    state: State<'_, Arc<AppState>>,
    args: AgentLifecycleArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let session_id = args.session_id.trim();
    if session_id.is_empty() {
        return serde_json::json!({ "ok": false, "error": "session_id required" });
    }
    if agent_memory::status_for_lifecycle_event(&args.event_type).is_none() {
        return serde_json::json!({
            "ok": false,
            "error": format!("unknown lifecycle event_type: {}", args.event_type),
            "sessionId": session_id
        });
    }
    let provider = args
        .provider
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "cursor".into());
    let mut summary = args.summary.unwrap_or_else(|| args.event_type.clone());
    if summary.chars().count() > LIFECYCLE_SUMMARY_MAX {
        summary = summary.chars().take(LIFECYCLE_SUMMARY_MAX).collect();
    }
    match agent_memory::append_ui_lifecycle(session_id, &provider, &args.event_type, &summary) {
        Ok(inserted) => serde_json::json!({
            "ok": true,
            "inserted": inserted,
            "sessionId": session_id,
            "eventType": args.event_type
        }),
        Err(e) => serde_json::json!({
            "ok": false,
            "error": e,
            "sessionId": session_id
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCheckpointResumeArgs {
    pub session_id: String,
}

#[tauri::command]
pub fn cmd_agent_checkpoint_resume(
    state: State<'_, Arc<AppState>>,
    args: AgentCheckpointResumeArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    match agent_memory::resume_checkpoint(&args.session_id) {
        Ok(brief) => serde_json::json!({
            "ok": true,
            "sessionId": args.session_id,
            "brief": brief
        }),
        Err(e) => serde_json::json!({
            "ok": false,
            "error": e,
            "sessionId": args.session_id
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCheckpointCreateArgs {
    pub session_id: String,
    pub next_action: Option<String>,
    pub pending_questions: Option<Vec<String>>,
    pub changed_files: Option<Vec<String>>,
}

#[tauri::command]
pub fn cmd_agent_checkpoint_create(
    state: State<'_, Arc<AppState>>,
    args: AgentCheckpointCreateArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    match agent_memory::create_checkpoint(
        &args.session_id,
        args.next_action.as_deref(),
        args.pending_questions.as_deref(),
        args.changed_files.as_deref(),
    ) {
        Ok(ckpt) => serde_json::json!({ "ok": true, "checkpoint": ckpt }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryQueryArgs {
    pub project_id: String,
    pub query: Option<String>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn cmd_agent_memory_query(
    state: State<'_, Arc<AppState>>,
    args: AgentMemoryQueryArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let lim = args.limit.unwrap_or(12).min(50) as usize;
    let q = args.query.unwrap_or_default();
    match agent_memory::query_memory(&args.project_id, &q, lim) {
        Ok(rows) => serde_json::json!({
            "ok": true,
            "projectId": args.project_id,
            "memories": rows
        }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMemoryUpsertArgs {
    pub project_id: String,
    pub session_id: Option<String>,
    pub memory_type: String,
    pub content: String,
    pub source_event_id: Option<String>,
    pub confidence: Option<f32>,
    pub supersedes_id: Option<String>,
    pub user_authored: Option<bool>,
}

#[tauri::command]
pub fn cmd_agent_memory_upsert(
    state: State<'_, Arc<AppState>>,
    args: AgentMemoryUpsertArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    match agent_memory::upsert_memory(
        &args.project_id,
        args.session_id.as_deref(),
        &args.memory_type,
        &args.content,
        args.source_event_id.as_deref(),
        args.confidence,
        args.supersedes_id.as_deref(),
        args.user_authored.unwrap_or(false),
    ) {
        Ok(row) => serde_json::json!({ "ok": true, "memory": row }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextArgs {
    pub project_id: String,
    pub query: Option<String>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn cmd_agent_context_for_provider(
    state: State<'_, Arc<AppState>>,
    args: AgentContextArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let lim = args.limit.unwrap_or(8).min(30) as usize;
    agent_memory::context_for_provider(&args.project_id, args.query.as_deref(), lim)
}

// --- MCP-ready read-only tools (Phase C4) ---

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpProjectContextArgs {
    pub project_id: Option<String>,
    pub project_root: Option<String>,
}

#[tauri::command]
pub fn cmd_agent_mcp_project_context(
    state: State<'_, Arc<AppState>>,
    args: Option<McpProjectContextArgs>,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let args = args.unwrap_or_default();
    let root = args
        .project_root
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from);
    agent_memory::tool_project_context(args.project_id.as_deref(), root.as_deref())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpMemorySearchArgs {
    pub project_id: String,
    pub query: String,
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn cmd_agent_mcp_memory_search(
    state: State<'_, Arc<AppState>>,
    args: McpMemorySearchArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    agent_memory::tool_memory_search(&args.project_id, &args.query, args.limit)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSessionHistoryArgs {
    pub session_id: String,
    pub limit: Option<u32>,
    pub before: Option<u64>,
}

#[tauri::command]
pub fn cmd_agent_mcp_session_history(
    state: State<'_, Arc<AppState>>,
    args: McpSessionHistoryArgs,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    agent_memory::tool_session_history(&args.session_id, args.limit, args.before)
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct McpCheckpointPreviewArgs {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
}

#[tauri::command]
pub fn cmd_agent_mcp_checkpoint_preview(
    state: State<'_, Arc<AppState>>,
    args: Option<McpCheckpointPreviewArgs>,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let args = args.unwrap_or_default();
    agent_memory::tool_checkpoint_preview(args.session_id.as_deref(), args.project_id.as_deref())
}

// --- Home Focus (user-facing projection) ---

#[tauri::command]
pub fn cmd_home_focus_snapshot(state: State<'_, Arc<AppState>>) -> agent_memory::HomeFocusSnapshot {
    let _ = state;
    agent_memory::build_home_focus_snapshot()
}

#[tauri::command]
pub fn cmd_home_focus_retry(state: State<'_, Arc<AppState>>) -> serde_json::Value {
    let _ = state;
    agent_memory::enqueue_home_focus_retry()
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HomeConfirmProjectArgs {
    pub project_root: Option<String>,
    pub project_id: Option<String>,
}

#[tauri::command]
pub fn cmd_home_confirm_project(
    state: State<'_, Arc<AppState>>,
    args: Option<HomeConfirmProjectArgs>,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let args = args.unwrap_or_default();
    match agent_memory::confirm_project(args.project_root.as_deref(), args.project_id.as_deref()) {
        Ok(p) => serde_json::json!({ "ok": true, "project": p }),
        Err(e) => serde_json::json!({ "ok": false, "error": e }),
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HomeListProjectsArgs {
    pub limit: Option<u32>,
}

#[tauri::command]
pub fn cmd_home_list_known_projects(
    state: State<'_, Arc<AppState>>,
    args: Option<HomeListProjectsArgs>,
) -> serde_json::Value {
    let _ = state;
    agent_memory::ensure_started();
    let lim = args.and_then(|a| a.limit).unwrap_or(20) as usize;
    let projects = agent_memory::list_known_projects(lim);
    serde_json::json!({ "ok": true, "projects": projects })
}
