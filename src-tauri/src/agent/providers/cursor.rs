//! Thin Cursor adapter — focus + cancel-generation interrupt (C1).
//! Approve/reject stay on Layer1; no Codex fallback.

use std::sync::Arc;

use tauri::{Manager, WebviewWindow};

use crate::agent::actions::{ExecutionMode, ProviderSupport};
use crate::agent::layer1_native::ensure_mapping_target_foreground;
use crate::agent::templates::CURSOR_PROVIDER_ID;
use crate::app_chat_workflow::{self, AppChatWorkflowError, CURSOR_APP_TARGET_ID};
use crate::AppState;

use super::codex::ProviderActionOutcome;

/// Cursor Agent: cancel generation (not composer blur).
const CURSOR_CANCEL_GENERATION_CHORD: &str = "Ctrl+Shift+Backspace";

pub struct CursorProviderAdapter;

impl CursorProviderAdapter {
    pub fn provider_id() -> &'static str {
        CURSOR_PROVIDER_ID
    }

    pub fn supports(action_id: &str) -> ProviderSupport {
        match action_id {
            "focusComposer" | "agent.focus" | "openAgent" => ProviderSupport::Workflow,
            "cancel" | "agent.interrupt" => ProviderSupport::Hotkey,
            _ => ProviderSupport::Unsupported,
        }
    }

    pub fn execute(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        action_id: &str,
        _slot_id: Option<&str>,
        mapping_id: Option<&str>,
        execution_mode: Option<ExecutionMode>,
        _activation_scope: crate::agent::actions::ActivationScope,
    ) -> ProviderActionOutcome {
        if matches!(Self::supports(action_id), ProviderSupport::Unsupported) {
            return ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("cursor does not support {action_id}")),
                ExecutionMode::Execute,
            );
        }

        let mode = execution_mode.unwrap_or(ExecutionMode::Execute);

        if *state.paused.lock() {
            return ProviderActionOutcome::err("paused", None, mode);
        }

        let duration_ms = state.cfg.lock().key_press_duration_ms;

        match action_id {
            "openAgent" | "focusComposer" | "agent.focus" => {
                focus_only(window, duration_ms, mode)
            }
            "cancel" | "agent.interrupt" => guard_target_then_hotkey(
                state,
                window,
                mapping_id,
                CURSOR_CANCEL_GENERATION_CHORD,
                duration_ms,
                mode,
            ),
            _ => ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("no cursor handler for {action_id}")),
                mode,
            ),
        }
    }
}

fn focus_only(
    window: &WebviewWindow,
    duration_ms: u32,
    mode: ExecutionMode,
) -> ProviderActionOutcome {
    #[cfg(not(windows))]
    {
        let _ = (window, duration_ms);
        return ProviderActionOutcome::err("not_running", None, mode);
    }
    #[cfg(windows)]
    {
        let app = window.app_handle();
        match app_chat_workflow::focus_composer_only(&app, CURSOR_APP_TARGET_ID, duration_ms) {
            Ok(()) => ProviderActionOutcome::ok_mode(mode),
            Err(e) => ProviderActionOutcome::err(workflow_reason(e), None, mode),
        }
    }
}

fn guard_target_then_hotkey(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
    chord: &str,
    duration_ms: u32,
    mode: ExecutionMode,
) -> ProviderActionOutcome {
    if let Err(e) = ensure_mapping_target_foreground(state, window, mapping_id, true) {
        return map_layer1_err(e, mode);
    }
    send_hotkey(chord, duration_ms, mode)
}

fn send_hotkey(chord: &str, duration_ms: u32, mode: ExecutionMode) -> ProviderActionOutcome {
    if crate::app_identity::foreground_is_self() {
        return ProviderActionOutcome::err(
            "inject_self_fg",
            Some(format!("refused {chord}: OneTone owns foreground")),
            mode,
        );
    }
    if crate::keyboard::send_chord(chord, duration_ms) {
        ProviderActionOutcome::ok_mode(mode)
    } else {
        ProviderActionOutcome::err(
            "input_failed",
            Some(format!("failed to send {chord}")),
            mode,
        )
    }
}

fn map_layer1_err(
    out: crate::agent::layer1_native::Layer1Outcome,
    mode: ExecutionMode,
) -> ProviderActionOutcome {
    ProviderActionOutcome::err(
        out.reason.as_deref().unwrap_or("failed"),
        out.detail,
        mode,
    )
}

fn workflow_reason(err: AppChatWorkflowError) -> &'static str {
    match err {
        AppChatWorkflowError::NotFound => "not_running",
        AppChatWorkflowError::FocusFailed => "focus_failed",
        AppChatWorkflowError::InputNotFound => "focus_failed",
        AppChatWorkflowError::VoiceFailed => "input_failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_basic_only() {
        assert_ne!(
            CursorProviderAdapter::supports("focusComposer"),
            ProviderSupport::Unsupported
        );
        assert_ne!(
            CursorProviderAdapter::supports("cancel"),
            ProviderSupport::Unsupported
        );
        assert_eq!(
            CursorProviderAdapter::supports("newThread"),
            ProviderSupport::Unsupported
        );
    }
}
