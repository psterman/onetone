//! Unified agent attention facts for Soft Pad waiting_kinds + status projection.

pub mod bridge;
pub mod model;
pub mod needs_input_kind;
pub mod store;

pub use bridge::{
    clear_onetone_ask, ingest_claude_hook_event, ingest_codex_app_server_event,
    ingest_codex_hook_event, ingest_cursor_hook_event, ingest_lifecycle_hook_event,
    raise_onetone_ask,
};
pub use model::{AttentionCause, AttentionPublicSnapshot, AttentionState, SignalSource};
pub use needs_input_kind::{
    kind_from_attention_cause, project_needs_input_kind, NeedsInputKind, NeedsInputKindSnapshot,
};
pub use store::{
    emit_sound_event, project_waiting_kinds, public_snapshot, raise_needs_input, reset_for_test,
    set_recompute_hook, set_sound_hook, test_lock, RaiseOutcome, MIN_AGENT_TASK_MS,
};
