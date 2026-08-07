//! Soft RGB Output Adapter — maps pad UI status → perimeter glow color.
//!
//! Read-only: never writes State Core. Does not emit fake HID / `v.oai.rgbcfg`.

use crate::config::SoftPadStatusColors;

/// Built-in status palettes (hex without `#`).
fn preset_hex(preset: &str, status: &str) -> Option<&'static str> {
    let p = preset.trim().to_ascii_lowercase();
    let table: &[(&str, &str)] = match p.as_str() {
        "cool" => &[
            ("running", "3B82F6"),
            ("needs_input", "06B6D4"),
            ("done", "22D3EE"),
            ("failed", "F43F5E"),
            ("listening", "60A5FA"),
        ],
        "warm" => &[
            ("running", "F59E0B"),
            ("needs_input", "F97316"),
            ("done", "84CC16"),
            ("failed", "EF4444"),
            ("listening", "FB923C"),
        ],
        "highcontrast" | "high_contrast" => &[
            ("running", "0055FF"),
            ("needs_input", "FF8800"),
            ("done", "00FF66"),
            ("failed", "FF0033"),
            ("listening", "00CCFF"),
        ],
        _ => &[
            // default — legacy FE palette
            ("running", "3053FE"),
            ("needs_input", "FF6A00"),
            ("done", "00FF4C"),
            ("failed", "FF0033"),
            ("listening", "00A3FF"),
        ],
    };
    let key = match status.trim() {
        "error" => "failed",
        other => other,
    };
    table
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, hex)| *hex)
}

fn override_hex<'a>(colors: Option<&'a SoftPadStatusColors>, status: &str) -> Option<&'a str> {
    let c = colors?;
    let key = match status.trim() {
        "error" => "failed",
        other => other,
    };
    let raw = match key {
        "running" => c.running.as_str(),
        "needs_input" => c.needs_input.as_str(),
        "done" => c.done.as_str(),
        "failed" => c.failed.as_str(),
        "listening" => c.listening.as_str(),
        _ => "",
    };
    let t = raw.trim();
    if t.is_empty() {
        None
    } else {
        Some(t)
    }
}

/// Map a UI-facing light status to soft RGB (matches former overlay FE palette).
/// `idle` / unknown → `None` (no semantic glow).
pub fn rgb_for_ui_status(status: &str) -> Option<(u8, u8, u8)> {
    rgb_for_ui_status_with_palette(status, "default", None)
}

/// Resolve status RGB with optional preset + per-status hex overrides.
pub fn rgb_for_ui_status_with_palette(
    status: &str,
    preset: &str,
    overrides: Option<&SoftPadStatusColors>,
) -> Option<(u8, u8, u8)> {
    if let Some(hex) = override_hex(overrides, status) {
        return parse_hex_rgb(hex);
    }
    let hex = preset_hex(preset, status)?;
    parse_hex_rgb(hex)
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

/// Scale RGB by opacity percent (0–100). Soft RGB has no alpha channel.
pub fn apply_rgb_opacity(rgb: (u8, u8, u8), opacity: u8) -> (u8, u8, u8) {
    let o = u16::from(opacity.min(100));
    (
        ((u16::from(rgb.0) * o) / 100) as u8,
        ((u16::from(rgb.1) * o) / 100) as u8,
        ((u16::from(rgb.2) * o) / 100) as u8,
    )
}

/// Resolve soft RGB with optional ambient override from Soft Pad config.
/// `ambient_mode == "solid"` → fixed color; otherwise status palette.
pub fn rgb_for_ambient(status: &str, ambient_mode: &str, solid_hex: &str) -> Option<(u8, u8, u8)> {
    rgb_for_ambient_full(status, ambient_mode, solid_hex, 100, "default", None)
}

/// Ambient RGB with opacity + status palette (used by overlay / Soft RGB protocol).
pub fn rgb_for_ambient_full(
    status: &str,
    ambient_mode: &str,
    solid_hex: &str,
    opacity: u8,
    preset: &str,
    overrides: Option<&SoftPadStatusColors>,
) -> Option<(u8, u8, u8)> {
    let rgb = if ambient_mode.trim().eq_ignore_ascii_case("solid") {
        parse_hex_rgb(solid_hex)?
    } else {
        rgb_for_ui_status_with_palette(status, preset, overrides)?
    };
    Some(apply_rgb_opacity(rgb, opacity))
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

    #[test]
    fn opacity_scales_rgb() {
        assert_eq!(
            apply_rgb_opacity((100, 200, 50), 50),
            (50, 100, 25)
        );
        assert_eq!(
            rgb_for_ambient_full("running", "solid", "#640000", 50, "default", None),
            Some((50, 0, 0))
        );
    }

    #[test]
    fn cool_preset_and_override() {
        assert_eq!(
            rgb_for_ui_status_with_palette("running", "cool", None),
            Some((0x3B, 0x82, 0xF6))
        );
        let ov = SoftPadStatusColors {
            running: "#010203".into(),
            ..Default::default()
        };
        assert_eq!(
            rgb_for_ui_status_with_palette("running", "cool", Some(&ov)),
            Some((1, 2, 3))
        );
    }
}
