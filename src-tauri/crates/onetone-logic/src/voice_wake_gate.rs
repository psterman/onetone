//! Pure wake / wrong-foreground gate (Q15 / R7). No AppState — unit-testable.

/// R7: empty `app_target_id` = global dictation — never refuse.
/// App scene + `allow_bring_up` off + FG ≠ target → refuse (toast on FE).
pub fn should_refuse_wake_wrong_fg(
    app_target_id: &str,
    allow_bring_up: bool,
    fg_target_id: Option<&str>,
) -> bool {
    let tid = app_target_id.trim();
    if tid.is_empty() {
        return false;
    }
    if allow_bring_up {
        return false;
    }
    match fg_target_id.map(str::trim).filter(|s| !s.is_empty()) {
        Some(fg) => fg != tid,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn global_never_refuses() {
        assert!(!should_refuse_wake_wrong_fg("", false, Some("cursor-chat")));
        assert!(!should_refuse_wake_wrong_fg("  ", false, None));
    }

    #[test]
    fn app_scene_refuses_when_allow_off() {
        assert!(should_refuse_wake_wrong_fg(
            "cursor-chat",
            false,
            Some("chrome")
        ));
        assert!(should_refuse_wake_wrong_fg("cursor-chat", false, None));
        assert!(!should_refuse_wake_wrong_fg(
            "cursor-chat",
            false,
            Some("cursor-chat")
        ));
    }

    #[test]
    fn allow_bring_up_skips_refuse() {
        assert!(!should_refuse_wake_wrong_fg(
            "cursor-chat",
            true,
            Some("chrome")
        ));
    }
}
