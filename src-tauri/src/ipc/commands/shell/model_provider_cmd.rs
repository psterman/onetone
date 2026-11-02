use crate::model_provider::{self, ModelChatRequest, ModelProviderConfig};
use serde::Deserialize;
use serde_json::Value;

#[tauri::command]
pub fn cmd_model_provider_snapshot() -> Result<Vec<Value>, String> {
    model_provider::snapshot()
}

#[tauri::command]
pub fn cmd_model_provider_upsert(args: ModelProviderConfig) -> Result<Vec<Value>, String> {
    model_provider::upsert(args)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderIdArgs {
    pub provider_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderKeyArgs {
    pub provider_id: String,
    pub api_key: String,
}

#[tauri::command]
pub fn cmd_model_provider_remove(args: ProviderIdArgs) -> Result<Vec<Value>, String> {
    model_provider::remove(&args.provider_id)
}

#[tauri::command]
pub fn cmd_model_provider_set_key(args: ProviderKeyArgs) -> Result<(), String> {
    model_provider::set_key(&args.provider_id, &args.api_key)
}

#[tauri::command]
pub async fn cmd_model_provider_chat(args: ModelChatRequest) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || model_provider::chat(args))
        .await
        .map_err(|e| e.to_string())?
}
