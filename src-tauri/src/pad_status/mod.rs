//! Soft-pad **State Core** — unified status model, arbiter, adapters, light event log.
//!
//! Output adapters (overlay / soft RGB / optional HID) must **only read** snapshots from
//! this module. Do not re-derive lamp colors in overlay or vendor UI paths.

mod adapters;
mod arbiter;
pub mod claude_lights;
mod log;
mod model;
mod store;

pub use adapters::claude::{
    ingest_claude_event, ingest_claude_payload, ingest_claude_payload_at,
    map_claude_event_to_state, ClaudeHookPayload,
};
pub use adapters::codex::{
    ingest_codex_app_payload, ingest_codex_app_payload_at, map_codex_event_to_state,
};
pub use adapters::hid::{plan_from_pad as plan_hid_output, HidOutputIntent};
pub use adapters::soft_rgb::{rgb_for_pad, rgb_for_ui_status, ui_status_from_pad};
pub use arbiter::{propose, ProposeResult};
pub use claude_lights::{short_agent_type, ClaudeAgentLightState, CLAUDE_MAIN_KEY};
pub use log::{log_path, tail_events, PadStatusLogRow};
pub use model::{Confidence, PadSource, PadState, PadStatus, PAD_SOURCE_RANK};
pub use store::{
    apply_inferred, apply_native_slot, current, fresh_signal, fresh_signal_at, snapshot,
    snapshot_at,
};

#[cfg(test)]
pub use store::{reset_for_test, test_lock};

use crate::codex_app_state::CodexAppStatePayload;

/// Ingest a validated Codex/Claude/Cursor hook/app payload into the appropriate state core.
pub fn ingest_codex_payload(payload: &CodexAppStatePayload) -> PadStatus {
    let source = payload.source.trim();
    let agent = match source {
        "codex_hook" | "codex_app" => Some(crate::soft_pad_runtime::AgentKind::Codex),
        "claude_hook" | "claude_app" => Some(crate::soft_pad_runtime::AgentKind::Claude),
        "cursor_hook" => Some(crate::soft_pad_runtime::AgentKind::Cursor),
        _ => None,
    };
    if let Some(agent) = agent {
        crate::agent_model_metadata::ingest_hook_model(
            agent,
            &payload.event,
            &payload.session_id,
            &payload.model,
            payload.ts,
        );
    }

    if source == "cursor_hook" {
        crate::agent_attention::ingest_cursor_hook_event(&payload.event, &payload.session_id);
        return snapshot();
    }

    if source == "claude_hook" || source == "claude_app" {
        return ingest_claude_payload(&ClaudeHookPayload {
            event: payload.event.clone(),
            session_id: payload.session_id.clone(),
            turn_id: payload.turn_id.clone(),
            agent_id: payload.agent_id.clone(),
            agent_type: payload.agent_type.clone(),
            ts: payload.ts,
            source: payload.source.clone(),
        });
    }
    ingest_codex_app_payload(payload)
}
