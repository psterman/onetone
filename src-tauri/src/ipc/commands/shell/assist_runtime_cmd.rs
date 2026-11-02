use crate::assist_runtime::{
    self, AssistCancelRequest, AssistCancelResponse, AssistReadyStatus, AssistRunRequest,
    AssistRunResponse, CallPolicy,
};
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistModelChatArgs {
    pub messages: Vec<Value>,
    pub max_tokens: Option<u32>,
    pub deadline_ms: Option<u64>,
    pub allow_metered: Option<bool>,
    /// Soft Pad freemodel pick (deepseek / kimi / siliconflow / openrouter).
    pub preferred_provider: Option<String>,
}

#[tauri::command]
pub async fn cmd_assist_model_chat(args: AssistModelChatArgs) -> Result<Value, String> {
    let policy = if args.allow_metered.unwrap_or(false) {
        CallPolicy::AllowMetered
    } else {
        CallPolicy::FreeOnly
    };
    assist_runtime::run_model_chat(
        format!(
            "model-chat-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default()
        ),
        args.messages,
        policy,
        args.max_tokens.unwrap_or(4096),
        args.deadline_ms.unwrap_or(30_000),
        args.preferred_provider,
    )
    .await
}

#[tauri::command]
pub async fn cmd_assist_run(args: AssistRunRequest) -> Result<AssistRunResponse, String> {
    Ok(assist_runtime::run_live(args).await)
}

#[tauri::command]
pub fn cmd_assist_cancel(args: AssistCancelRequest) -> Result<AssistCancelResponse, String> {
    Ok(assist_runtime::cancel_request(&args.request_id))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistReadyArgs {
    pub allow_metered: Option<bool>,
}

#[tauri::command]
pub fn cmd_assist_ready(args: Option<AssistReadyArgs>) -> Result<AssistReadyStatus, String> {
    let allow = args.and_then(|a| a.allow_metered).unwrap_or(false);
    let policy = if allow {
        CallPolicy::AllowMetered
    } else {
        CallPolicy::FreeOnly
    };
    Ok(assist_runtime::ready_status(policy))
}

/// Snapshot for UI — no secrets.
#[tauri::command]
pub fn cmd_assist_status() -> Result<Value, String> {
    let free = assist_runtime::ready_status(CallPolicy::FreeOnly);
    let metered = assist_runtime::ready_status(CallPolicy::AllowMetered);
    Ok(serde_json::json!({
        "taskOrganize": {
            "implemented": free.implemented,
            "readyFreeOnly": free.ready,
            "readyAllowMetered": metered.ready,
            "reasonFreeOnly": free.reason,
            "reasonAllowMetered": metered.reason,
        }
    }))
}
