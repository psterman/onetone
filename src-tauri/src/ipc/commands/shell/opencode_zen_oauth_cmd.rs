use crate::opencode_zen_oauth;
use serde_json::Value;

#[tauri::command]
pub fn cmd_opencode_zen_oauth_start() -> Result<Value, String> {
    opencode_zen_oauth::oauth_start()
}

#[tauri::command]
pub fn cmd_opencode_zen_oauth_poll(pending_id: String) -> Result<Value, String> {
    opencode_zen_oauth::oauth_poll(&pending_id)
}

#[tauri::command]
pub fn cmd_opencode_zen_oauth_cancel(pending_id: Option<String>) -> Result<Value, String> {
    opencode_zen_oauth::oauth_cancel(pending_id.as_deref().unwrap_or(""))
}
