use std::sync::Arc;

use tauri::AppHandle;

use crate::AppState;

#[tauri::command]
pub fn cmd_scheme_select(
    state: tauri::State<'_, Arc<AppState>>,
    app: AppHandle,
    mapping_id: String,
) {
    crate::ipc::handle_scheme_select(state.inner(), &app, &mapping_id);
}
