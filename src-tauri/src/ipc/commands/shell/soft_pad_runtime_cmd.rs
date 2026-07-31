//! Soft Pad Runtime Arbiter IPC — pin + snapshot + attention / Cursor gates.

use serde::Serialize;
use tauri::State;

use crate::agent_attention::{self, AttentionPublicSnapshot};
use crate::agent_catalog::{self, AgentCapabilities};
use crate::soft_pad_runtime::{
    get_public_snapshot, request_soft_pad_recompute, set_follow_pin, AgentKind, SoftPadPublicSnapshot,
};
use crate::AppState;
use std::sync::Arc;

#[tauri::command]
pub fn cmd_soft_pad_runtime_snapshot(state: State<'_, Arc<AppState>>) -> SoftPadPublicSnapshot {
    let _ = state;
    get_public_snapshot()
}

#[tauri::command]
pub fn cmd_soft_pad_set_follow(
    state: State<'_, Arc<AppState>>,
    lane: Option<String>,
) -> SoftPadPublicSnapshot {
    let pin = lane
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(AgentKind::from_kind_str);
    set_follow_pin(pin);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    get_public_snapshot()
}

#[tauri::command]
pub fn cmd_agent_attention_snapshot(
    state: State<'_, Arc<AppState>>,
) -> AttentionPublicSnapshot {
    let _ = state;
    agent_attention::public_snapshot()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorCapsView {
    pub capabilities: AgentCapabilities,
    pub honesty_ceiling: &'static str,
}

#[tauri::command]
pub fn cmd_cursor_soft_pad_capabilities(state: State<'_, Arc<AppState>>) -> CursorCapsView {
    let _ = state;
    CursorCapsView {
        capabilities: agent_catalog::cursor_capabilities(),
        honesty_ceiling: "officialLifecycleHooks+desktopAutomation",
    }
}

/// P3: open Cursor waiting only after verified official wait events or OneTone ask.
#[tauri::command]
pub fn cmd_cursor_set_needs_input_gate(
    state: State<'_, Arc<AppState>>,
    enabled: bool,
) -> CursorCapsView {
    agent_catalog::set_cursor_can_observe_needs_input(enabled);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    cmd_cursor_soft_pad_capabilities(state)
}

/// Ingest Cursor Hook lifecycle JSON (install/config via Skills; realtime via this path).
#[tauri::command]
pub fn cmd_cursor_hook_ingest(
    state: State<'_, Arc<AppState>>,
    event: String,
    session_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    agent_attention::ingest_cursor_hook_event(
        event.trim(),
        session_id.as_deref().unwrap_or(""),
    );
    agent_attention::public_snapshot()
}

/// OneTone-originated ask (may enter waiting even when Cursor official gate is closed).
#[tauri::command]
pub fn cmd_onetone_attention_ask(
    state: State<'_, Arc<AppState>>,
    agent: String,
    session_id: Option<String>,
    request_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    if let Some(kind) = AgentKind::from_kind_str(agent.trim()) {
        agent_attention::raise_onetone_ask(
            kind,
            session_id.as_deref().unwrap_or(""),
            request_id.as_deref().unwrap_or(""),
        );
    }
    agent_attention::public_snapshot()
}

#[tauri::command]
pub fn cmd_onetone_attention_clear(
    state: State<'_, Arc<AppState>>,
    agent: String,
    session_id: Option<String>,
    request_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    if let Some(kind) = AgentKind::from_kind_str(agent.trim()) {
        agent_attention::clear_onetone_ask(
            kind,
            session_id.as_deref().unwrap_or(""),
            request_id.as_deref().unwrap_or(""),
        );
    }
    agent_attention::public_snapshot()
}
