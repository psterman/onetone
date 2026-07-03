use std::sync::Arc;

use crate::AppState;

#[tauri::command]
pub async fn cmd_update_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<crate::update::UpdateUiState, String> {
    crate::update::check_once(app, state.inner().clone(), false).await
}

#[tauri::command]
pub async fn cmd_update_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<crate::update::UpdateUiState, String> {
    crate::update::install_latest(app, state.inner().clone()).await
}
