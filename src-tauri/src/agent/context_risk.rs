//! Context + risk gates before execute / camera Pending create.

use super::semantic::semantic_meta_by_id;
use crate::agent_attention::NeedsInputKind;

/// Returns reason_code if blocked.
pub fn context_risk_gate(
    canonical: &str,
    channel: &str,
    needs_kind: &str,
    creating_camera_pending: bool,
    completing_pending: bool,
) -> Option<&'static str> {
    match canonical {
        "agent.approve" => {
            if completing_pending {
                return None; // completing matching approve pending
            }
            if needs_kind != NeedsInputKind::WaitingApproval.as_str() {
                return Some("requires_waiting_approval");
            }
            if creating_camera_pending && channel == "camera" {
                return None; // allowed to create pending when waitingApproval
            }
            if channel == "camera" {
                return Some("camera_requires_confirmation");
            }
            None
        }
        "input.send" => {
            if creating_camera_pending && channel == "camera" {
                // B: only dictating — not waitingText
                if needs_kind != NeedsInputKind::Dictating.as_str() {
                    return Some("requires_dictating");
                }
                return None;
            }
            None
        }
        "agent.respond" => {
            // waitingText only — never under waitingApproval.
            if needs_kind != NeedsInputKind::WaitingText.as_str() {
                return Some("requires_waiting_text");
            }
            None
        }
        _ => {
            let _ = semantic_meta_by_id(canonical);
            None
        }
    }
}
