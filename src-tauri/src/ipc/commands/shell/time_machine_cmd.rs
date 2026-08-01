//! Time Machine IPC — Git worktree checkpoints.

use tauri::State;

use crate::soft_pad_runtime;
use crate::time_machine::{self, AgentContext, TmCreateResult, TmOp, TmStatus};
use crate::AppState;
use std::sync::Arc;

fn agent_busy() -> bool {
    let snap = soft_pad_runtime::get_public_snapshot();
    !snap.attention_waiting_kinds.is_empty()
}

fn ctx_from(opt: Option<AgentContext>) -> AgentContext {
    opt.unwrap_or_else(AgentContext::unknown)
}

#[tauri::command]
pub async fn cmd_tm_status(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
) -> Result<TmStatus, String> {
    let busy = agent_busy();
    tauri::async_runtime::spawn_blocking(move || time_machine::status(workspace.as_deref(), busy))
        .await
        .map_err(|e| format!("Time Machine 任务失败：{e}"))
}

#[tauri::command]
pub async fn cmd_tm_set_workspace(
    _state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<TmStatus, String> {
    tauri::async_runtime::spawn_blocking(move || time_machine::set_workspace(&path))
        .await
        .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_set_autosave(
    _state: State<'_, Arc<AppState>>,
    enabled: bool,
    interval_min: u32,
) -> Result<TmStatus, String> {
    let busy = agent_busy();
    tauri::async_runtime::spawn_blocking(move || {
        time_machine::set_autosave(enabled, interval_min, busy)
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_pick_workspace(_state: State<'_, Arc<AppState>>) -> Result<TmStatus, String> {
    // Folder dialog is blocking; run off async worker so UI can show「选择中…」.
    let folder = tauri::async_runtime::spawn_blocking(|| {
        crate::data_root::pick_folder_dialog_desc("选择 Time Machine 项目目录（需已是 Git 仓库）")
    })
    .await
    .map_err(|e| format!("选择目录失败：{e}"))?
    .map_err(|e| e)?;
    let Some(folder) = folder else {
        return Err("已取消".into());
    };
    let path = folder.to_string_lossy().to_string();
    tauri::async_runtime::spawn_blocking(move || time_machine::set_workspace(&path))
        .await
        .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_list(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
) -> Result<Vec<TmOp>, String> {
    tauri::async_runtime::spawn_blocking(move || time_machine::list(workspace.as_deref()))
        .await
        .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_create(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
    trigger_source: Option<String>,
    label: Option<String>,
    agent_context: Option<AgentContext>,
) -> Result<TmCreateResult, String> {
    let src = trigger_source.unwrap_or_else(|| "manual".into());
    let ctx = ctx_from(agent_context);
    let busy = agent_busy();
    tauri::async_runtime::spawn_blocking(move || {
        if src == "scheduled" {
            time_machine::run_autosave(workspace.as_deref(), busy, ctx)
        } else {
            time_machine::create(workspace.as_deref(), &src, label, ctx).map(|op| TmCreateResult {
                created: true,
                skipped_reason: None,
                op: Some(op),
            })
        }
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_preview_restore(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
    target_id: String,
) -> Result<time_machine::RestorePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        time_machine::preview_restore(workspace.as_deref(), &target_id)
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_restore(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
    target_id: String,
    confirm_delete_count: u32,
    agent_context: Option<AgentContext>,
) -> Result<time_machine::RestoreResult, String> {
    let busy = agent_busy();
    let ctx = ctx_from(agent_context);
    tauri::async_runtime::spawn_blocking(move || {
        time_machine::restore(
            workspace.as_deref(),
            &target_id,
            confirm_delete_count,
            busy,
            ctx,
        )
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_diff_summary(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
    op_id: String,
) -> Result<time_machine::DiffSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        time_machine::diff_summary(workspace.as_deref(), &op_id)
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}

#[tauri::command]
pub async fn cmd_tm_undo_restore(
    _state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
    restore_op_id: String,
    agent_context: Option<AgentContext>,
) -> Result<time_machine::RestoreResult, String> {
    let ctx = ctx_from(agent_context);
    tauri::async_runtime::spawn_blocking(move || {
        time_machine::undo_restore(workspace.as_deref(), &restore_op_id, ctx)
    })
    .await
    .map_err(|e| format!("Time Machine 任务失败：{e}"))?
}
