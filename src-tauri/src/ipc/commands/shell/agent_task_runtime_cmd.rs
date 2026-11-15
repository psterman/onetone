//! IPC for Agent Task Runtime.

use crate::agent_task_runtime::{
    self, ApprovePatchRequest, ConfirmPlanRequest, StartTaskRequest, SubmitUserInputRequest,
    TaskDto, TaskEventDto, TaskIdRequest,
};
use crate::agent_task_runtime::{
    StartTeamRequest, TeamAdvanceRequest, TeamArtifactRequest, TeamConfirmPlanRequest,
    TeamDispatchRequest, TeamEventsRequest, TeamIdRequest, TeamNodeStatusRequest,
    TeamParentTaskRequest, TeamTaskCreateRequest, TeamTaskIdRequest, TeamTaskListRequest,
};
use serde::Deserialize;
use crate::team_protocol_server::{TeamBridgeStartRequest, TeamBridgeStartResult, TeamBridgeStatus};

#[tauri::command]
pub fn cmd_agent_team_bridge_start(args: TeamBridgeStartRequest) -> Result<TeamBridgeStartResult, String> {
    crate::team_protocol_server::start(args)
}

#[tauri::command]
pub fn cmd_agent_team_bridge_stop() -> Result<serde_json::Value, String> {
    crate::team_protocol_server::stop()?;
    Ok(serde_json::json!({"ok": true}))
}

#[tauri::command]
pub fn cmd_agent_team_bridge_status() -> TeamBridgeStatus {
    crate::team_protocol_server::status()
}

#[tauri::command]
pub fn cmd_agent_task_start(args: StartTaskRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_start(args)
}

#[tauri::command]
pub fn cmd_agent_task_confirm_plan(args: ConfirmPlanRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_confirm_plan(args)
}

#[tauri::command]
pub fn cmd_agent_task_status(args: TaskIdRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_status(&args.task_id)
}

#[tauri::command]
pub fn cmd_agent_task_events(args: TaskIdRequest) -> Result<Vec<TaskEventDto>, String> {
    agent_task_runtime::api_events(&args.task_id)
}

#[tauri::command]
pub fn cmd_agent_task_cancel(args: TaskIdRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_cancel(&args.task_id)
}

#[tauri::command]
pub fn cmd_agent_task_approve_patch(args: ApprovePatchRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_approve(args)
}

#[tauri::command]
pub fn cmd_agent_task_reject_patch(args: ApprovePatchRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_reject(args)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitUserInputArgs {
    pub task_id: String,
    pub text: String,
}

#[tauri::command]
pub fn cmd_agent_task_submit_user_input(args: SubmitUserInputArgs) -> Result<TaskDto, String> {
    agent_task_runtime::api_submit_user_input(SubmitUserInputRequest {
        task_id: args.task_id,
        text: args.text,
    })
}

#[tauri::command]
pub fn cmd_agent_task_resume(args: TaskIdRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_resume(&args.task_id)
}

#[tauri::command]
pub fn cmd_agent_task_abandon(args: TaskIdRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_abandon(&args.task_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFakeArgs {
    pub task_id: String,
    /// JSON array of tool-call JSON strings. Empty means finish-only driver.
    #[serde(default)]
    pub steps: Vec<String>,
}

#[tauri::command]
pub async fn cmd_agent_task_drive_fake(args: DriveFakeArgs) -> Result<TaskDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut driver = agent_task_runtime::FakeDriver {
            steps: args.steps,
            idx: 0,
        };
        agent_task_runtime::api_drive_fake(&args.task_id, &mut driver)
    })
    .await
    .map_err(|e| format!("drive_join: {e}"))?
}

#[tauri::command]
pub async fn cmd_agent_task_drive_deepseek(args: TaskIdRequest) -> Result<TaskDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        agent_task_runtime::api_drive_deepseek(&args.task_id)
    })
    .await
    .map_err(|e| format!("drive_join: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveArgs {
    pub task_id: String,
    /// Soft Pad id or `workbuddy`. Empty uses selectedDefault from ready().
    #[serde(default)]
    pub provider: Option<String>,
    /// Cap tool turns per IPC call so the UI can breathe (default: until idle).
    #[serde(default)]
    pub max_steps: Option<u32>,
}

/// Async + spawn_blocking: sync drive froze the UI on step 0 while HTTP ran.
#[tauri::command]
pub async fn cmd_agent_task_drive(args: DriveArgs) -> Result<TaskDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let provider = args
            .provider
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .or_else(|| {
                agent_task_runtime::provider_ready_snapshot()
                    .get("selectedDefault")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .ok_or_else(|| "no_provider".to_string())?;
        agent_task_runtime::api_drive(&args.task_id, &provider, args.max_steps)
    })
    .await
    .map_err(|e| format!("drive_join: {e}"))?
}

#[tauri::command]
pub fn cmd_agent_task_ready() -> Result<serde_json::Value, String> {
    Ok(agent_task_runtime::provider_ready_snapshot())
}

#[tauri::command]
pub fn cmd_agent_team_start(args: StartTeamRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_start(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_snapshot(args: TeamIdRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_snapshot(&args.team_id)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_agent_team_tick(args: TeamIdRequest) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let value = agent_task_runtime::api_team_tick(&args.team_id)?;
        serde_json::to_value(value).map_err(|e| e.to_string())
    }).await.map_err(|e| format!("team_tick_join: {e}"))?
}

#[tauri::command]
pub fn cmd_agent_team_reconcile(args: TeamIdRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_reconcile_only(&args.team_id)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_resume(args: TeamIdRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_resume(&args.team_id)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_cancel(args: TeamIdRequest) -> Result<serde_json::Value, String> {
    agent_task_runtime::api_team_cancel_children(&args.team_id)?;
    Ok(serde_json::json!({"teamId": args.team_id, "status": "cancelled"}))
}

#[tauri::command]
pub fn cmd_agent_team_recover_all() -> Result<serde_json::Value, String> {
    let count = agent_task_runtime::api_team_recover_all()?;
    Ok(serde_json::json!({"recovered": count}))
}

#[tauri::command]
pub fn cmd_agent_team_by_parent(args: TeamParentTaskRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_snapshot_by_parent(&args.parent_task_id)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_task_get(args: TeamTaskIdRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_task_get(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_task_create(args: TeamTaskCreateRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_task_create(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_task_list(args: TeamTaskListRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_task_list(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_node_status(args: TeamNodeStatusRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_set_node_status(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_confirm_plan(args: TeamConfirmPlanRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_confirm_plan(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_agent_team_dispatch_read_only(args: TeamDispatchRequest) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let value = agent_task_runtime::api_team_dispatch_read_only(args)?;
        serde_json::to_value(value).map_err(|e| e.to_string())
    }).await.map_err(|e| format!("team_dispatch_join: {e}"))?
}

#[tauri::command]
pub async fn cmd_agent_team_advance(args: TeamAdvanceRequest) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let value = agent_task_runtime::api_team_advance(args)?;
        serde_json::to_value(value).map_err(|e| e.to_string())
    }).await.map_err(|e| format!("team_advance_join: {e}"))?
}

#[tauri::command]
pub fn cmd_agent_team_add_artifact(args: TeamArtifactRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_add_artifact(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_team_events(args: TeamEventsRequest) -> Result<serde_json::Value, String> {
    let value = agent_task_runtime::api_team_events(args)?;
    serde_json::to_value(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_agent_task_ensure_verify_sandbox() -> Result<serde_json::Value, String> {
    agent_task_runtime::ensure_verify_sandbox()
}

#[tauri::command]
pub fn cmd_agent_task_ensure_chat_scratch() -> Result<serde_json::Value, String> {
    agent_task_runtime::ensure_chat_scratch()
}

#[tauri::command]
pub fn cmd_agent_task_approve_deliver(args: ApprovePatchRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_approve_deliver(args)
}

#[tauri::command]
pub fn cmd_agent_task_reject_deliver(args: ApprovePatchRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_reject_deliver(args)
}

#[tauri::command]
pub fn cmd_agent_task_evaluate_verify(args: TaskIdRequest) -> Result<serde_json::Value, String> {
    agent_task_runtime::evaluate_verify(&args.task_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeWorkbuddyArgs {
    #[serde(default)]
    pub force: bool,
}

/// Live native tools/tool_choice probe — only pass unlocks WorkBuddy as ATR edit provider.
#[tauri::command]
pub async fn cmd_agent_task_probe_workbuddy(
    args: Option<ProbeWorkbuddyArgs>,
) -> Result<serde_json::Value, String> {
    let force = args.map(|a| a.force).unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || agent_task_runtime::probe_workbuddy_edit(force))
        .await
        .map_err(|e| format!("probe_join: {e}"))?
}
