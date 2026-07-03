use std::sync::Arc;

use crate::AppState;

#[tauri::command]
pub fn cmd_physical_trigger(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    key: String,
) {
    let key = key.trim();
    if key.is_empty() {
        return;
    }
    crate::ipc::handle_physical_key(state.inner(), &window, key);
}
