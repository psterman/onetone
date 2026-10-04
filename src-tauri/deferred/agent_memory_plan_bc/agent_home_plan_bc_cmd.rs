//! Plan B/C agent home IPC — compiled only with `agent-memory-plan-bc` feature.

use crate::agent_memory;
use crate::AppState;
use serde::Deserialize;
use std::sync::Arc;
use tauri::State;

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
    let provider = args
        .provider
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "cursor".into());
    let summary = args.summary.unwrap_or_else(|| args.event_type.clone());
    match agent_memory::append_ui_lifecycle(
        &args.session_id,
        &provider,
        &args.event_type,
        &summary,
    ) {
        Ok(inserted) => serde_json::json!({
            "ok": true,
            "inserted": inserted,
            "sessionId": args.session_id,
            "eventType": args.event_type
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
    let pending = args.pending_questions.as_deref();
    let files = args.changed_files.as_deref();
    match agent_memory::create_checkpoint(
        &args.session_id,
        args.next_action.as_deref(),
        pending,
        files,
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
