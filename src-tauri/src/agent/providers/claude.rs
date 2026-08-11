//! Thin Claude adapter — focus only (C1); interrupt unverified until real-window proof.
//! Approve/reject stay on Layer1; no Codex fallback.

use std::sync::Arc;

use tauri::{Manager, WebviewWindow};

use crate::agent::actions::{ExecutionMode, ProviderSupport};
use crate::agent::templates::CLAUDE_PROVIDER_ID;
use crate::app_chat_workflow::{self, AppChatWorkflowError, CLAUDE_CODE_APP_TARGET_ID};
use crate::AppState;

use super::codex::ProviderActionOutcome;

pub struct ClaudeProviderAdapter;

impl ClaudeProviderAdapter {
    pub fn provider_id() -> &'static str {
        CLAUDE_PROVIDER_ID
    }

    pub fn supports(action_id: &str) -> ProviderSupport {
        match action_id {
            "focusComposer" | "agent.focus" | "openAgent" => ProviderSupport::Workflow,
            // ponytail: no verified Claude interrupt chord — fail closed in Options/Picker.
            "cancel" | "agent.interrupt" => ProviderSupport::Unsupported,
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
                Some(format!("claude does not support {action_id}")),
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
            _ => ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("no claude handler for {action_id}")),
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
        match app_chat_workflow::focus_composer_only(&app, CLAUDE_CODE_APP_TARGET_ID, duration_ms) {
            Ok(()) => ProviderActionOutcome::ok_mode(mode),
            Err(e) => ProviderActionOutcome::err(workflow_reason(e), None, mode),
        }
    }
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
    fn supports_focus_only_until_interrupt_verified() {
        assert_ne!(
            ClaudeProviderAdapter::supports("focusComposer"),
            ProviderSupport::Unsupported
        );
        assert_eq!(
            ClaudeProviderAdapter::supports("cancel"),
            ProviderSupport::Unsupported
        );
        assert_eq!(
            ClaudeProviderAdapter::supports("agent.interrupt"),
            ProviderSupport::Unsupported
        );
    }
}
