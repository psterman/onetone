//! Agent Center IPC — snapshot + registry refresh + honest action dispatch.

use crate::agent_install_inventory::collect_inventory;
use crate::agent_memory::{
    self, collect_resolve_hints, execute_agent_center_action, AgentCenterActionArgs,
    AgentCenterActionResult, AgentCenterSnapshot, AgentCenterSnapshotArgs, ProbePolicy,
};
use crate::AppState;
use std::sync::Arc;
use tauri::{AppHandle, State, WebviewWindow};

fn install_rows_from_state(state: &AppState) -> Vec<(String, String, String)> {
    let cfg = state.cfg.lock().clone();
    let inv = collect_inventory(&cfg);
    inv.agents
        .into_iter()
        .map(|a| (a.kind, a.presence, a.confidence))
        .collect()
}

#[tauri::command]
pub fn cmd_agent_center_snapshot(
    state: State<'_, Arc<AppState>>,
    args: Option<AgentCenterSnapshotArgs>,
) -> AgentCenterSnapshot {
    let hint = args
        .and_then(|a| a.project_hint)
        .filter(|s| !s.trim().is_empty())
        .map(std::path::PathBuf::from);
    let hints = collect_resolve_hints(state.inner(), ProbePolicy::Cached);
    let install = if agent_memory::registry_refresh_is_fresh() {
        Vec::new()
    } else {
        install_rows_from_state(state.inner())
    };
    agent_memory::build_agent_center_snapshot_with_hints(hint.as_deref(), &install, false, &hints)
}

#[tauri::command]
pub fn cmd_agent_registry_refresh(
    state: State<'_, Arc<AppState>>,
    args: Option<AgentCenterSnapshotArgs>,
) -> AgentCenterSnapshot {
    let hint = args
        .and_then(|a| a.project_hint)
        .filter(|s| !s.trim().is_empty())
        .map(std::path::PathBuf::from);
    let install = install_rows_from_state(state.inner());
    let hints = collect_resolve_hints(state.inner(), ProbePolicy::ForceFresh);
    agent_memory::refresh_and_snapshot_with_hints(hint.as_deref(), &install, &hints)
}

/// Single action IPC: re-resolves then executes. Never trusts snapshot/frontend executor.
#[tauri::command]
pub fn cmd_agent_center_action(
    _app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    args: AgentCenterActionArgs,
) -> AgentCenterActionResult {
    let hint = args
        .project_hint
        .filter(|s| !s.trim().is_empty())
        .map(std::path::PathBuf::from);
    execute_agent_center_action(
        state.inner(),
        &window,
        args.agent_id.trim(),
        args.action_id.trim(),
        hint.as_deref(),
        args.attempt_id.as_deref(),
    )
}
