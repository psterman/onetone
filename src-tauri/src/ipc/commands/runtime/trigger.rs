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
    if *state.recording.lock() {
        crate::ipc::handle_hardware_record_key(state.inner(), &window, key);
        return;
    }
    crate::ipc::handle_physical_key(state.inner(), &window, key);
}
