//! Soft-pad **State Core** — unified status model, arbiter, adapters, light event log.
//!
//! Output adapters (overlay / soft RGB / optional HID) must **only read** snapshots from
//! this module. Do not re-derive lamp colors in overlay or vendor UI paths.

mod adapters;
mod arbiter;
mod log;
mod model;
mod store;

pub use adapters::claude::{
    ingest_claude_event, ingest_claude_payload, ingest_claude_payload_at, map_claude_event_to_state,
    ClaudeHookPayload,
};
pub use adapters::codex::{
    ingest_codex_app_payload, ingest_codex_app_payload_at, map_codex_event_to_state,
};
pub use adapters::hid::{plan_from_pad as plan_hid_output, HidOutputIntent};
pub use adapters::soft_rgb::{rgb_for_pad, rgb_for_ui_status, ui_status_from_pad};
pub use arbiter::{propose, ProposeResult};
pub use log::{log_path, tail_events, PadStatusLogRow};
pub use model::{
    Confidence, PadSource, PadState, PadStatus, PAD_SOURCE_RANK,
};
pub use store::{
    apply_inferred, apply_native_slot, current, fresh_signal, fresh_signal_at, snapshot,
    snapshot_at,
};

#[cfg(test)]
pub use store::{reset_for_test, test_lock};

use crate::codex_app_state::CodexAppStatePayload;

/// Ingest a validated Codex hook/app payload into State Core (and keep legacy view in sync upstream).
pub fn ingest_codex_payload(payload: &CodexAppStatePayload) -> PadStatus {
    if payload.source.trim() == "claude_hook" || payload.source.trim() == "claude_app" {
        return ingest_claude_payload(&ClaudeHookPayload {
            event: payload.event.clone(),
            session_id: payload.session_id.clone(),
            turn_id: payload.turn_id.clone(),
            ts: payload.ts,
        });
    }
    ingest_codex_app_payload(payload)
}
