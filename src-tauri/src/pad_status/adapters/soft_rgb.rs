//! Soft RGB Output Adapter — maps pad UI status → perimeter glow color.
//!
//! Read-only: never writes State Core. Does not emit fake HID / `v.oai.rgbcfg`.

/// Map a UI-facing light status to soft RGB (matches former overlay FE palette).
/// `idle` / unknown → `None` (no semantic glow).
pub fn rgb_for_ui_status(status: &str) -> Option<(u8, u8, u8)> {
    match status.trim() {
        "running" => Some((48, 83, 254)),
        "needs_input" => Some((255, 106, 0)),
        "done" => Some((0, 255, 76)),
        "failed" | "error" => Some((255, 0, 51)),
        "listening" => Some((0, 163, 255)),
        _ => None,
    }
}

/// Core `PadStatus` → UI status string (error→failed, phase=hold→listening).
pub fn ui_status_from_pad(pad: &crate::pad_status::PadStatus) -> String {
    let mut status = pad.state.clone();
    if status == "error" {
        status = "failed".into();
    }
    if pad.phase.as_deref() == Some("hold") {
        status = "listening".into();
    }
    status
}

pub fn rgb_for_pad(pad: &crate::pad_status::PadStatus) -> Option<(u8, u8, u8)> {
    rgb_for_ui_status(&ui_status_from_pad(pad))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::model::{Confidence, PadSource, PadState, PadStatus};

    #[test]
    fn palette_matches_legacy_fe() {
        assert_eq!(rgb_for_ui_status("running"), Some((48, 83, 254)));
        assert_eq!(rgb_for_ui_status("needs_input"), Some((255, 106, 0)));
        assert_eq!(rgb_for_ui_status("done"), Some((0, 255, 76)));
        assert_eq!(rgb_for_ui_status("failed"), Some((255, 0, 51)));
        assert_eq!(rgb_for_ui_status("error"), Some((255, 0, 51)));
        assert_eq!(rgb_for_ui_status("listening"), Some((0, 163, 255)));
        assert_eq!(rgb_for_ui_status("idle"), None);
    }

    #[test]
    fn hold_phase_maps_to_listening_rgb() {
        let pad = PadStatus {
            state: PadState::Running.as_str().into(),
            phase: Some("hold".into()),
            source: PadSource::Inferred.as_str().into(),
            confidence: Confidence::Low.as_str().into(),
            updated_at: 1,
            agent: None,
            task_id: None,
            session_id: None,
            message: None,
            sticky_until: None,
            last_event: None,
        };
        assert_eq!(ui_status_from_pad(&pad), "listening");
        assert_eq!(rgb_for_pad(&pad), Some((0, 163, 255)));
    }
}
