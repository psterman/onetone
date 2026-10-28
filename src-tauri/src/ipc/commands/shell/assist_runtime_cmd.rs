use crate::assist_runtime::{
    self, AssistCancelRequest, AssistCancelResponse, AssistReadyStatus, AssistRunRequest,
    AssistRunResponse, CallPolicy,
};
use serde::Deserialize;
use serde_json::Value;

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
