use std::sync::Arc;

use tauri::{State, WebviewWindow};

use crate::agent::{execute_agent_action, AgentExecuteRequest};
use crate::AppState;

#[tauri::command]
pub fn cmd_agent_action_execute(
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    provider_id: String,
    action_id: String,
    mapping_id: Option<String>,
    slot_id: Option<String>,
    execution_mode: Option<String>,
    activation_scope: Option<String>,
) -> serde_json::Value {
    let result = execute_agent_action(
        state.inner(),
        &window,
        AgentExecuteRequest {
            provider_id,
            action_id,
            mapping_id,
            slot_id,
            execution_mode,
            activation_scope,
        },
    );
    serde_json::to_value(result).unwrap_or_else(|_| {
        serde_json::json!({
            "ok": false,
            "reason": "input_failed",
            "detail": "serialize failed",
        })
    })
}
