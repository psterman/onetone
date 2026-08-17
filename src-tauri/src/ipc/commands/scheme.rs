use std::sync::Arc;

use tauri::AppHandle;

use crate::AppState;

#[tauri::command]
pub async fn cmd_scheme_select(
    state: tauri::State<'_, Arc<AppState>>,
    app: AppHandle,
    mapping_id: String,
) -> Result<(), String> {
    // Hotkey rebind + voice fingerprint must not run on the UI/IPC pump —
    // sync cmd_scheme_select 假死'd homepage scene chips.
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        crate::ipc::handle_scheme_select(&state, &app, &mapping_id);
    })
    .await
    .map_err(|e| format!("scheme_select join: {e}"))
}
