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

/// Parse `#RRGGBB` / `RRGGBB` into RGB triple.
pub fn parse_hex_rgb(s: &str) -> Option<(u8, u8, u8)> {
    let t = s.trim().trim_start_matches('#');
    if t.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&t[0..2], 16).ok()?;
    let g = u8::from_str_radix(&t[2..4], 16).ok()?;
    let b = u8::from_str_radix(&t[4..6], 16).ok()?;
    Some((r, g, b))
}

/// Resolve soft RGB with optional ambient override from Soft Pad config.
/// `ambient_mode == "solid"` → fixed color; otherwise status palette.
pub fn rgb_for_ambient(status: &str, ambient_mode: &str, solid_hex: &str) -> Option<(u8, u8, u8)> {
    if ambient_mode.trim().eq_ignore_ascii_case("solid") {
        return parse_hex_rgb(solid_hex);
    }
    rgb_for_ui_status(status)
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

pub fn rgb_for_pad_ambient(
    pad: &crate::pad_status::PadStatus,
    ambient_mode: &str,
    solid_hex: &str,
) -> Option<(u8, u8, u8)> {
    rgb_for_ambient(&ui_status_from_pad(pad), ambient_mode, solid_hex)
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

    #[test]
    fn solid_ambient_overrides_status() {
        assert_eq!(
            rgb_for_ambient("running", "solid", "#112233"),
            Some((0x11, 0x22, 0x33))
        );
        assert_eq!(
            rgb_for_ambient("running", "status", "#112233"),
            Some((48, 83, 254))
        );
        assert_eq!(parse_hex_rgb("aabbcc"), Some((0xaa, 0xbb, 0xcc)));
        assert_eq!(parse_hex_rgb("bad"), None);
    }
}
