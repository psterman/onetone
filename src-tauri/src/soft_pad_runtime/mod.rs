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
pub use platform::last_external_app_target_id;
pub use resolver::{resolve_candidate, CandidateInput, DispatchReadyEntry};
pub use store::{
    applied_lane, get_public_snapshot, get_shadow_decision, note_config_revision_bump,
    request_soft_pad_recompute, set_follow_pin, soft_pad_cutover_enabled, SoftPadRuntimeState,
};

/// FG for oral / dictation side-keys. Soft Pad holding Win32 FG after Esc must
/// still resolve as the last agent (Cursor), not as OneTone-self.
pub fn oral_arm_foreground_identity() -> Option<crate::app_identity::AppIdentity> {
    let live = crate::app_identity::foreground_app_identity();
    if let Some(ref id) = live {
        if !crate::app_identity::is_self_identity(id) {
            return live;
        }
    } else if !crate::app_identity::foreground_is_self() {
        return live;
    }
    let snap = get_public_snapshot();
    let tid = last_external_app_target_id()
        .or_else(|| snap.foreground_kind.map(|k| k.app_target_id().to_string()))
        .or_else(|| {
            snap.applied
                .as_ref()
                .and_then(|a| a.lane_kind.map(|k| k.app_target_id().to_string()))
        })?;
    Some(crate::app_identity::AppIdentity {
        pid: 0,
        exe_name: String::new(),
        full_path: None,
        window_title: String::new(),
        window_class: None,
        matched_preset_app_id: Some(tid),
    })
}
