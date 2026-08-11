use std::sync::Arc;

use tauri::{State, WebviewWindow};

use crate::agent::binding_view::project_action_bindings_for_mapping;
use crate::agent::route::{route_semantic_action, SemanticActionRequest};
use crate::agent::semantic::public_catalog_dto;
use crate::agent::{execute_agent_action, AgentExecuteRequest};
use crate::agent_attention::project_needs_input_kind;
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

/// Rust-authoritative semantic action catalog (FE must not long-term hand-mirror).
#[tauri::command]
pub fn cmd_semantic_action_catalog() -> serde_json::Value {
    serde_json::to_value(public_catalog_dto()).unwrap_or_else(|_| {
        serde_json::json!({ "version": 0, "entries": [], "error": "serialize failed" })
    })
}

#[tauri::command]
pub fn cmd_semantic_action_route(
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    action_id: String,
    source_channel: String,
    mapping_id: Option<String>,
    provider_id: Option<String>,
    confirmation_id: Option<String>,
    slot_id: Option<String>,
    args: Option<serde_json::Value>,
) -> serde_json::Value {
    let result = route_semantic_action(
        state.inner(),
        &window,
        SemanticActionRequest {
            action_id,
            source_channel,
            mapping_id,
            provider_id,
            confirmation_id,
            slot_id,
            args,
        },
    );
    serde_json::to_value(result).unwrap_or_else(|_| {
        serde_json::json!({
            "status": "failed",
            "reasonCode": "serialize_failed",
        })
    })
}

/// Read-only binding projection for selectedMappingId (HABIT: do not pass activeSceneId by mistake).
#[tauri::command]
pub fn cmd_action_binding_views(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
) -> serde_json::Value {
    let cfg = state.cfg.lock();
    let views = project_action_bindings_for_mapping(&cfg, mapping_id.trim());
    serde_json::to_value(views).unwrap_or_else(|_| serde_json::json!([]))
}

#[tauri::command]
pub fn cmd_needs_input_kind(state: State<'_, Arc<AppState>>) -> serde_json::Value {
    let dictating = crate::voice_end_runtime::session_state(state.inner()) == "dictating";
    let snap = project_needs_input_kind(dictating);
    serde_json::to_value(snap).unwrap_or_else(|_| {
        serde_json::json!({
            "kind": "none",
            "dictating": false,
            "featureDynamicContextActions": false,
        })
    })
}

#[tauri::command]
pub fn cmd_semantic_action_options(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    channel: String,
) -> serde_json::Value {
    let Some(ch) = crate::agent::ActionChannel::parse(&channel) else {
        return serde_json::json!({ "error": "invalid_channel", "entries": [] });
    };
    let dictating = crate::voice_end_runtime::session_state(state.inner()) == "dictating";
    let cfg = state.cfg.lock();
    match crate::agent::options::semantic_action_options(&cfg, mapping_id.trim(), ch, dictating) {
        Ok(entries) => serde_json::to_value(serde_json::json!({ "entries": entries }))
            .unwrap_or_else(|_| serde_json::json!({ "entries": [] })),
        Err(code) => serde_json::json!({ "error": code, "entries": [] }),
    }
}

#[tauri::command]
pub fn cmd_semantic_pending_snapshot(mapping_id: Option<String>) -> serde_json::Value {
    let rows = crate::agent::pending_confirm::list_public(mapping_id.as_deref());
    serde_json::to_value(rows).unwrap_or_else(|_| serde_json::json!([]))
}

#[tauri::command]
pub fn cmd_semantic_confirmation_cancel(confirmation_id: String) -> serde_json::Value {
    match crate::agent::pending_confirm::cancel(&confirmation_id) {
        Ok(row) => serde_json::json!({
            "status": "cancelled",
            "confirmationId": row.id,
            "actionId": row.action_id,
        }),
        Err(code) => serde_json::json!({
            "status": "unavailable",
            "reasonCode": code,
        }),
    }
}
