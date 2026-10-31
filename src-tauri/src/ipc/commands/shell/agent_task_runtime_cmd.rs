//! IPC for Agent Task Runtime.

use crate::agent_task_runtime::{
    self, ApprovePatchRequest, StartTaskRequest, SubmitUserInputRequest, TaskDto, TaskEventDto,
    TaskIdRequest,
};
use serde::Deserialize;

#[tauri::command]
pub fn cmd_agent_task_start(args: StartTaskRequest) -> Result<TaskDto, String> {
    agent_task_runtime::api_start(args)
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
pub fn cmd_agent_task_ensure_verify_sandbox() -> Result<serde_json::Value, String> {
    agent_task_runtime::ensure_verify_sandbox()
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
