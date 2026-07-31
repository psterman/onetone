//! Unified agent attention facts for Soft Pad waiting_kinds + status projection.

pub mod bridge;
pub mod model;
pub mod store;

pub use bridge::{
    clear_onetone_ask, ingest_claude_hook_event, ingest_codex_app_server_event,
    ingest_codex_hook_event, ingest_cursor_hook_event, raise_onetone_ask,
};
pub use model::{AttentionCause, AttentionPublicSnapshot, AttentionState, SignalSource};
pub use store::{
    project_waiting_kinds, public_snapshot, raise_needs_input, set_recompute_hook,
};
