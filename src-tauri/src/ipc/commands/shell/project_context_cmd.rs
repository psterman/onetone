use crate::project_context::{
    self, CancelArgs, CloseArgs, ContextError, OpenArgs, QueryArgs, QueryResult, ScopeDto,
};
use serde::Serialize;
use tauri::Window;

fn map_err(e: ContextError) -> String {
    e.as_str().into()
}

fn window_label(window: &Window) -> String {
    window.label().to_string()
}

/// Folder dialog is blocking (PowerShell WinForms). Run off the IPC thread
/// and drop always-on-top so the picker is visible — same pattern as cmd_pick_path.
#[tauri::command]
pub async fn cmd_project_context_open(
    app: tauri::AppHandle,
    window: Window,
    args: OpenArgs,
) -> Result<ScopeDto, String> {
    let label = window_label(&window);
    let restored = super::prefs::suspend_topmost_for_native_dialog(&app);
    let result = tauri::async_runtime::spawn_blocking(move || {
        project_context::open_with_dialog(&label, &args).map_err(map_err)
    })
    .await
    .map_err(|e| format!("project_context_open task failed: {e}"));
    super::prefs::restore_topmost_for_native_dialog(&app, restored);
    result?
}

#[tauri::command]
pub fn cmd_project_context_close(
    window: Window,
    args: CloseArgs,
) -> Result<serde_json::Value, String> {
    let closed =
        project_context::close(&window_label(&window), &args.scope_id).map_err(map_err)?;
    Ok(serde_json::json!({ "closed": closed }))
}

#[tauri::command]
pub fn cmd_project_context_query(window: Window, args: QueryArgs) -> Result<QueryResult, String> {
    project_context::run_query(&window_label(&window), &args).map_err(map_err)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelState {
    pub state: String,
}

#[tauri::command]
pub fn cmd_project_context_cancel(
    window: Window,
    args: CancelArgs,
) -> Result<CancelState, String> {
    let state = project_context::cancel_request(
        &window_label(&window),
        &args.scope_id,
        &args.request_id,
    )
    .map_err(map_err)?;
    Ok(CancelState {
        state: state.into(),
    })
}
