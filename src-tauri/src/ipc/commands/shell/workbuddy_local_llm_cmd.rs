use crate::workbuddy_local_llm;
use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub fn cmd_workbuddy_local_accounts_list() -> Result<Value, String> {
    Ok(workbuddy_local_llm::snapshot_for_ui())
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_add(
    label: Option<String>,
    key: String,
) -> Result<Value, String> {
    let meta = workbuddy_local_llm::add_account(label.as_deref().unwrap_or(""), &key)?;
    Ok(serde_json::json!({
        "ok": true,
        "account": meta,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_remove(id: String) -> Result<Value, String> {
    workbuddy_local_llm::remove_account(&id)?;
    Ok(serde_json::json!({
        "ok": true,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_set_default(id: String) -> Result<Value, String> {
    workbuddy_local_llm::set_default(&id)?;
    Ok(serde_json::json!({
        "ok": true,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_set_enabled(
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    workbuddy_local_llm::set_enabled(&id, enabled)?;
    Ok(serde_json::json!({
        "ok": true,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_set_model(
    id: String,
    model: String,
) -> Result<Value, String> {
    workbuddy_local_llm::set_selected_model(&id, &model)?;
    Ok(serde_json::json!({
        "ok": true,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_verify(id: String) -> Result<Value, String> {
    let meta = workbuddy_local_llm::verify_account(&id)?;
    Ok(serde_json::json!({
        "ok": true,
        "account": meta,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[tauri::command]
pub fn cmd_workbuddy_local_account_refresh_models(id: String) -> Result<Value, String> {
    let meta = workbuddy_local_llm::refresh_models(&id)?;
    Ok(serde_json::json!({
        "ok": true,
        "account": meta,
        "snapshot": workbuddy_local_llm::snapshot_for_ui(),
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyChatArgs {
    pub account_id: Option<String>,
    pub model: Option<String>,
    pub messages: Vec<Value>,
    pub max_tokens: Option<u32>,
}

#[tauri::command]
pub fn cmd_workbuddy_local_chat(args: WorkbuddyChatArgs) -> Result<Value, String> {
    workbuddy_local_llm::chat_once(
        args.account_id.as_deref(),
        args.model.as_deref(),
        &args.messages,
        args.max_tokens,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyChatStartArgs {
    pub account_id: Option<String>,
    pub model: Option<String>,
    pub messages: Vec<Value>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyChatWindowOpenArgs {
    pub seed: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyChatCancelArgs {
    pub run_id: Option<String>,
}

#[tauri::command]
pub fn cmd_workbuddy_local_chat_start(
    app: AppHandle,
    args: WorkbuddyChatStartArgs,
) -> Result<Value, String> {
    workbuddy_local_llm::chat_stream_start(
        &app,
        args.account_id.as_deref(),
        args.model.as_deref(),
        &args.messages,
        args.max_tokens,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyChatPollArgs {
    pub run_id: Option<String>,
}

#[tauri::command]
pub fn cmd_workbuddy_local_chat_cancel(args: Option<WorkbuddyChatCancelArgs>) -> Result<Value, String> {
    let run_id = args.and_then(|a| a.run_id);
    workbuddy_local_llm::chat_stream_cancel(run_id.as_deref())
}

#[tauri::command]
pub fn cmd_workbuddy_local_chat_poll(args: Option<WorkbuddyChatPollArgs>) -> Result<Value, String> {
    let run_id = args.and_then(|a| a.run_id);
    workbuddy_local_llm::chat_stream_poll(run_id.as_deref())
}

#[tauri::command]
pub fn cmd_workbuddy_local_chat_window_open(
    app: AppHandle,
    args: Option<WorkbuddyChatWindowOpenArgs>,
) -> Result<Value, String> {
    let seed = args.and_then(|a| a.seed);
    workbuddy_local_llm::open_chat_window(&app, seed)
}

#[tauri::command]
pub fn cmd_workbuddy_local_oauth_start(region: Option<String>) -> Result<Value, String> {
    workbuddy_local_llm::oauth_start(region.as_deref())
}

#[tauri::command]
pub fn cmd_workbuddy_local_oauth_poll(pending_id: String) -> Result<Value, String> {
    workbuddy_local_llm::oauth_poll(&pending_id)
}

#[tauri::command]
pub fn cmd_workbuddy_local_oauth_cancel(pending_id: Option<String>) -> Result<Value, String> {
    workbuddy_local_llm::oauth_cancel(pending_id.as_deref().unwrap_or(""))
}
