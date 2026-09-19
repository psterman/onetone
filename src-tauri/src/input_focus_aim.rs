//! Shared input-focus aim (前置对准输入框).
//!
//! Voice / Keys / Soft Pad / Camera inject paths should call [`aim_input_focus`]
//! before typing — not each invent window-click logic.
//!
//! Phase0: strategy enum + orchestrate existing `focus_composer_for_send`.
//! Phase1 (after field tests): true no-click probe, richer hotkeys, recorded controls.
//!
//! Stability contract: fail-closed when aim is required and fails (never type into
//! the wrong control). Not a promise of 100% aim success.

use tauri::AppHandle;

/// User-selectable aim strategy (MD §7). Default [`InputAimStrategy::None`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputAimStrategy {
    /// Assume caret already in the box — skip aim. Novice default.
    None,
    /// Continue only if editable; Phase0 uses composer focus path (fail-closed).
    Probe,
    /// App profile focus hotkey then probe (Phase0: same as Auto via composer path).
    Hotkey,
    /// UIA / accessibility best-edit focus.
    Smart,
    /// Relative-window composer click.
    Click,
    /// Probe → (safe) hotkey → smart/click chain.
    Auto,
}

impl InputAimStrategy {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "none" | "off" | "skip" => Self::None,
            "probe" => Self::Probe,
            "hotkey" | "key" => Self::Hotkey,
            "smart" | "uia" => Self::Smart,
            "click" => Self::Click,
            _ => Self::Auto,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Probe => "probe",
            Self::Hotkey => "hotkey",
            Self::Smart => "smart",
            Self::Click => "click",
            Self::Auto => "auto",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AimError {
    /// No AppChatProfile for this app — cannot aim composer.
    NoProfile,
    /// Probe/aim could not confirm an editable composer.
    NotEditable,
    FocusFailed,
    UnsupportedPlatform,
}

impl AimError {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NoProfile => "no_profile",
            Self::NotEditable => "not_editable",
            Self::FocusFailed => "focus_failed",
            Self::UnsupportedPlatform => "unsupported_platform",
        }
    }
}

/// Aim keyboard focus at the app's primary chat/composer input.
///
/// Shared entry for voice prompt inject, Soft Pad / key `run_mapping_target_sequence`,
/// and (later) camera macros.
pub fn aim_input_focus(
    app: &AppHandle,
    app_target_id: &str,
    strategy: InputAimStrategy,
    duration_ms: u32,
) -> Result<(), AimError> {
    let tid = app_target_id.trim();
    if tid.is_empty() {
        // Global / no-app scene: nothing to aim.
        return Ok(());
    }
    if strategy == InputAimStrategy::None {
        return Ok(());
    }
    if crate::app_chat_workflow::profile_for(tid).is_none() {
        return Err(AimError::NoProfile);
    }

    #[cfg(windows)]
    {
        // Phase0: all non-None strategies reuse focus_composer_for_send (relative
        // click + UIA verify). Cursor field matrix decides Phase1 splits
        // (true probe-without-click, safe hotkey-only, etc.).
        let _ = strategy;
        crate::app_chat_workflow::focus_composer_for_send(app, tid, duration_ms)
            .map_err(|_| AimError::FocusFailed)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, duration_ms, strategy);
        Err(AimError::UnsupportedPlatform)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_defaults_to_auto() {
        assert_eq!(InputAimStrategy::parse(""), InputAimStrategy::Auto);
        assert_eq!(InputAimStrategy::parse("AUTO"), InputAimStrategy::Auto);
        assert_eq!(InputAimStrategy::parse("none"), InputAimStrategy::None);
        assert_eq!(InputAimStrategy::parse("probe"), InputAimStrategy::Probe);
        assert_eq!(InputAimStrategy::parse("smart").as_str(), "smart");
    }
}
