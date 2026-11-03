use crate::loomy_oauth;
use serde_json::Value;

#[tauri::command]
pub fn cmd_loomy_sms_send(phone: String) -> Result<Value, String> {
    loomy_oauth::sms_send(&phone)
}

#[tauri::command]
pub fn cmd_loomy_sms_login(phone: String, code: String, msgid: String) -> Result<Value, String> {
    loomy_oauth::sms_login(&phone, &code, &msgid)
}
