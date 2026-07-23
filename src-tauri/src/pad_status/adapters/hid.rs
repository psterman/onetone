//! Optional HID Output Adapter — **plan only**.
//!
//! Maps `PadStatus` → a semantic HID intent for a future real device sink.
//! Hard rules (stoploss):
//! - Never emits fake HID reports
//! - Never writes `v.oai.rgbcfg` / `v.oai.thstatus` / Micro protocol state
//! - Active visual sink remains Soft RGB until a real hardware sink is wired

use serde::Serialize;

use super::soft_rgb::{rgb_for_ui_status, ui_status_from_pad};
use crate::pad_status::PadStatus;

/// Planned HID / device output derived from State Core (read-only).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HidOutputIntent {
    /// Active presentation sink: `soft_rgb` (software) or `none`.
    pub sink: String,
    /// Always `false` until a real hardware sink is explicitly enabled.
    pub emit_enabled: bool,
    pub ui_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub g: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b: Option<u8>,
    /// Operator-facing reason (diagnose / docs).
    pub note: String,
}

/// Build a HID intent from Core. Does not touch vendor protocol.
pub fn plan_from_pad(pad: &PadStatus, lights_on: bool) -> HidOutputIntent {
    let ui_status = ui_status_from_pad(pad);
    let rgb = if lights_on {
        rgb_for_ui_status(&ui_status)
    } else {
        None
    };
    let (r, g, b) = match rgb {
        Some((r, g, b)) => (Some(r), Some(g), Some(b)),
        None => (None, None, None),
    };
    HidOutputIntent {
        sink: if lights_on {
            "soft_rgb".into()
        } else {
            "none".into()
        },
        emit_enabled: false,
        ui_status,
        r,
        g,
        b,
        note: if lights_on {
            "硬件 HID 发射关闭；仅 Soft RGB".into()
        } else {
            "状态灯关闭；无 HID / Soft RGB 输出".into()
        },
    }
}

/// Hardware emit is permanently refused in this build (stoploss).
pub fn try_emit(_intent: &HidOutputIntent) -> Result<(), &'static str> {
    Err("hid_sink_disabled")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pad_status::model::{Confidence, PadSource, PadState, PadStatus};

    fn running_pad() -> PadStatus {
        PadStatus {
            state: PadState::Running.as_str().into(),
            phase: None,
            source: PadSource::Hook.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: 1,
            agent: Some("codex".into()),
            task_id: None,
            session_id: None,
            message: Some("执行中".into()),
            sticky_until: None,
            last_event: Some("UserPromptSubmit".into()),
        }
    }

    #[test]
    fn plan_maps_soft_rgb_when_lights_on() {
        let intent = plan_from_pad(&running_pad(), true);
        assert_eq!(intent.sink, "soft_rgb");
        assert!(!intent.emit_enabled);
        assert_eq!(intent.ui_status, "running");
        assert_eq!((intent.r, intent.g, intent.b), (Some(48), Some(83), Some(254)));
        assert!(intent.note.contains("Soft RGB"));
    }

    #[test]
    fn plan_none_when_lights_off() {
        let intent = plan_from_pad(&running_pad(), false);
        assert_eq!(intent.sink, "none");
        assert!(!intent.emit_enabled);
        assert!(intent.r.is_none());
    }

    #[test]
    fn try_emit_always_refuses() {
        let intent = plan_from_pad(&running_pad(), true);
        assert_eq!(try_emit(&intent), Err("hid_sink_disabled"));
    }
}
