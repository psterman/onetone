//! Soft Pad Runtime Arbiter — single primary-lane runtime kernel.
//!
//! Phase naming:
//! - ShadowDecision = resolver output while legacy routes may still run (1A diagnostics)
//! - AppliedDecision = routes have been atomically swapped (1B+)
//!
//! Pure resolver has no HWND / HookGate dependency.

pub mod dispatch;
pub mod model;
pub mod platform;
pub mod resolver;
pub mod store;

pub use dispatch::{
    begin_agent_press_lease, end_agent_press_lease, lookup_agent_ticket_by_micro,
    lookup_agent_ticket_by_physical, ActivePressLease, AgentDispatchTicket, SystemDispatchTicket,
};
pub use model::{
    AgentKind, ApplyError, CandidateDecision, FollowMode, ForegroundEvidence, RuntimeAvailability,
    RuntimeHealth, SelectionReason, ShadowDecision, SoftPadPublicSnapshot, AppliedSoftPadDecision,
};
pub use resolver::{resolve_candidate, CandidateInput, DispatchReadyEntry};
pub use store::{
    get_public_snapshot, get_shadow_decision, note_config_revision_bump, request_soft_pad_recompute,
    set_follow_pin, soft_pad_cutover_enabled, SoftPadRuntimeState,
};
