use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::config::WorkspaceLayoutConfig;
use crate::workspace_layout::{
    self, WorkspaceApplyResult, WorkspaceSnapshotArgs, WorkspaceWindowView,
};
use crate::AppState;

#[tauri::command]
pub fn cmd_workspace_list_windows(app: AppHandle) -> Result<Vec<WorkspaceWindowView>, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("unsupported_platform".into());
    }
    #[cfg(windows)]
    {
        let topology = crate::gaze_monitor::list_monitors_from_tauri(&app).ok();
        let mut rows = workspace_layout::list_windows();
        if let Some(topo) = topology {
            for row in rows.iter_mut() {
                let center_x = row.x + (row.width / 2) as i32;
                let center_y = row.y + (row.height / 2) as i32;
                if let Some(m) =
                    crate::gaze_monitor::find_monitor_for_point(&topo.monitors, center_x, center_y)
                {
                    row.monitor_id = m.id.clone();
                }
            }
        }
        Ok(rows)
    }
}

#[tauri::command]
pub fn cmd_workspace_list_layouts(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<WorkspaceLayoutConfig>, String> {
    Ok(state.cfg.lock().workspace_layouts.clone())
}

fn snapshot_args(
    name: Option<String>,
    id: Option<String>,
    anchor_app: Option<String>,
    auto_apply: Option<bool>,
    include_hwnds: Option<Vec<String>>,
) -> WorkspaceSnapshotArgs {
    WorkspaceSnapshotArgs {
        name,
        id,
        anchor_app,
        auto_apply,
        include_hwnds,
    }
}

#[tauri::command]
pub fn cmd_workspace_snapshot(
    app: AppHandle,
    name: Option<String>,
    id: Option<String>,
    anchor_app: Option<String>,
    auto_apply: Option<bool>,
    include_hwnds: Option<Vec<String>>,
) -> Result<WorkspaceLayoutConfig, String> {
    #[cfg(not(windows))]
    {
        let _ = (app, name, id, anchor_app, auto_apply, include_hwnds);
        return Err("unsupported_platform".into());
    }
    #[cfg(windows)]
    {
        workspace_layout::snapshot_current_layout(
            &app,
            snapshot_args(name, id, anchor_app, auto_apply, include_hwnds),
        )
    }
}

#[tauri::command]
pub fn cmd_workspace_save(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    name: Option<String>,
    id: Option<String>,
    anchor_app: Option<String>,
    auto_apply: Option<bool>,
    include_hwnds: Option<Vec<String>>,
) -> Result<WorkspaceLayoutConfig, String> {
    #[cfg(not(windows))]
    {
        let _ = (app, name, id, anchor_app, auto_apply, include_hwnds);
        return Err("unsupported_platform".into());
    }
    #[cfg(windows)]
    {
        let snap = workspace_layout::snapshot_current_layout(
            &app,
            snapshot_args(name, id, anchor_app, auto_apply, include_hwnds),
        )?;
        Ok(workspace_layout::upsert_layout(state.inner(), snap))
    }
}

#[tauri::command]
pub fn cmd_workspace_apply(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    layout_id: String,
) -> Result<WorkspaceApplyResult, String> {
    #[cfg(not(windows))]
    {
        let _ = (app, layout_id);
        return Err("unsupported_platform".into());
    }
    #[cfg(windows)]
    {
        workspace_layout::apply_layout_id(&app, state.inner(), &layout_id)
    }
}

#[tauri::command]
pub fn cmd_workspace_apply_current_anchor(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
) -> Result<WorkspaceApplyResult, String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("unsupported_platform".into());
    }
    #[cfg(windows)]
    {
        workspace_layout::apply_for_foreground_anchor(&app, state.inner())
    }
}

#[tauri::command]
pub fn cmd_workspace_delete(
    state: State<'_, Arc<AppState>>,
    layout_id: String,
) -> Result<bool, String> {
    Ok(workspace_layout::delete_layout(state.inner(), &layout_id))
}

#[tauri::command]
pub fn cmd_workspace_set_auto_apply(
    state: State<'_, Arc<AppState>>,
    layout_id: String,
    enabled: bool,
) -> Result<WorkspaceLayoutConfig, String> {
    workspace_layout::set_auto_apply(state.inner(), &layout_id, enabled)
}
