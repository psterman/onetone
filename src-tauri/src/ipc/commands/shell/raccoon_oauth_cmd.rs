use crate::raccoon_oauth;
use serde_json::Value;

#[tauri::command]
pub fn cmd_raccoon_oauth_start() -> Result<Value, String> {
    raccoon_oauth::oauth_start()
}

#[tauri::command]
pub fn cmd_raccoon_oauth_poll(pending_id: String) -> Result<Value, String> {
    raccoon_oauth::oauth_poll(&pending_id)
}

#[tauri::command]
pub fn cmd_raccoon_oauth_cancel(pending_id: Option<String>) -> Result<Value, String> {
    raccoon_oauth::oauth_cancel(pending_id.as_deref().unwrap_or(""))
}
