//! Codex provider adapter — reuses app_chat_workflow matching (Codex.exe + OpenAI.Codex).

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::agent::actions::{action_by_id, ActivationScope, ExecutionMode, ProviderSupport};
use crate::agent::insert_text;
use crate::agent::templates::{slot_by_id, CODEX_PROVIDER_ID};
use crate::app_chat_workflow::{self, AppChatWorkflowError, CODEX_APP_TARGET_ID};
use crate::AppState;

#[derive(Debug, Clone)]
pub struct ProviderActionOutcome {
    pub ok: bool,
    pub reason: Option<String>,
    pub detail: Option<String>,
    pub execution_mode: String,
}

impl ProviderActionOutcome {
    fn ok_mode(mode: ExecutionMode) -> Self {
        Self {
            ok: true,
            reason: None,
            detail: None,
            execution_mode: mode.as_str().to_string(),
        }
    }

    fn err(reason: &str, detail: impl Into<Option<String>>, mode: ExecutionMode) -> Self {
        Self {
            ok: false,
            reason: Some(reason.to_string()),
            detail: detail.into(),
            execution_mode: mode.as_str().to_string(),
        }
    }
}

pub struct CodexProviderAdapter;

impl CodexProviderAdapter {
    pub fn provider_id() -> &'static str {
        CODEX_PROVIDER_ID
    }

    pub fn supports(action_id: &str) -> ProviderSupport {
        action_by_id(action_id)
            .map(|a| a.codex_support)
            .unwrap_or(ProviderSupport::Unsupported)
    }

    pub fn execute(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        action_id: &str,
        slot_id: Option<&str>,
        execution_mode: Option<ExecutionMode>,
        activation_scope: ActivationScope,
    ) -> ProviderActionOutcome {
        let Some(action) = action_by_id(action_id) else {
            return ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("unknown action {action_id}")),
                ExecutionMode::Execute,
            );
        };
        if action.codex_support == ProviderSupport::Unsupported {
            return ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("codex does not support {action_id}")),
                action.default_execution_mode,
            );
        }

        let mode = execution_mode.unwrap_or(action.default_execution_mode);

        if *state.paused.lock() {
            return ProviderActionOutcome::err("paused", None, mode);
        }

        if activation_scope == ActivationScope::ForegroundApp {
            let fg = app_chat_workflow::foreground_app_target_id();
            if fg.as_deref() != Some(CODEX_APP_TARGET_ID) {
                return ProviderActionOutcome::err(
                    "wrong_app_context",
                    Some("Codex is not the foreground app".into()),
                    mode,
                );
            }
        }

        let duration_ms = state.cfg.lock().key_press_duration_ms;
        let mapping_id = String::new();

        match action_id {
            "openAgent" | "focusComposer" => Self::focus_only(state, window, duration_ms, mode),
            "startDictation" => {
                Self::start_dictation(state, window, &mapping_id, duration_ms, mode)
            }
            "stopOrSendDictation" => Self::stop_or_send(state, window, mode),
            "cancel" => Self::send_hotkey("Esc", duration_ms, mode),
            "newThread" => Self::focus_then_hotkey(state, window, "Ctrl+N", duration_ms, mode),
            "quickChat" => Self::focus_then_hotkey(state, window, "Ctrl+Alt+N", duration_ms, mode),
            "commandPalette" => Self::focus_then_hotkey(state, window, "Ctrl+K", duration_ms, mode),
            "status" | "plan" | "review" | "permissions" | "switchAgent" | "appsOrPlugins" => {
                let text = slot_id
                    .and_then(slot_by_id)
                    .and_then(|s| s.insert_text)
                    .or_else(|| default_slash(action_id))
                    .unwrap_or("");
                Self::insert_slash(state, window, text, duration_ms, mode)
            }
            _ => ProviderActionOutcome::err(
                "unsupported_action",
                Some(format!("no codex handler for {action_id}")),
                mode,
            ),
        }
    }

    fn focus_only(
        _state: &Arc<AppState>,
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
            match focus_codex_composer(window, duration_ms) {
                Ok(()) => ProviderActionOutcome::ok_mode(mode),
                Err(e) => map_workflow_err(e, mode),
            }
        }
    }

    fn start_dictation(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        mapping_id: &str,
        duration_ms: u32,
        mode: ExecutionMode,
    ) -> ProviderActionOutcome {
        match app_chat_workflow::run_for_target_id(
            state,
            window,
            mapping_id,
            CODEX_APP_TARGET_ID,
            duration_ms,
        ) {
            Ok(_) => ProviderActionOutcome::ok_mode(mode),
            Err((prefix, err)) => ProviderActionOutcome::err(
                workflow_reason(err),
                Some(format!("{prefix}_{}", workflow_reason(err))),
                mode,
            ),
        }
    }

    fn stop_or_send(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        mode: ExecutionMode,
    ) -> ProviderActionOutcome {
        let app = window.app_handle();
        if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
            crate::voice_end_runtime::handle_trigger_press_while_dictating(state, &app, "");
            return ProviderActionOutcome::ok_mode(mode);
        }
        // Not dictating: send commit key as a soft "send" attempt.
        let (commit_key, duration_ms) = {
            let cfg = state.cfg.lock();
            (cfg.voice_end.commit_key.clone(), cfg.key_press_duration_ms)
        };
        if commit_key.trim().is_empty() {
            return Self::send_hotkey("Enter", duration_ms, mode);
        }
        Self::send_hotkey(&commit_key, duration_ms, mode)
    }

    fn send_hotkey(chord: &str, duration_ms: u32, mode: ExecutionMode) -> ProviderActionOutcome {
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

    fn focus_then_hotkey(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        chord: &str,
        duration_ms: u32,
        mode: ExecutionMode,
    ) -> ProviderActionOutcome {
        let focus = Self::focus_only(state, window, duration_ms, mode);
        if !focus.ok {
            return focus;
        }
        std::thread::sleep(Duration::from_millis(80));
        Self::send_hotkey(chord, duration_ms, mode)
    }

    fn insert_slash(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        text: &str,
        duration_ms: u32,
        mode: ExecutionMode,
    ) -> ProviderActionOutcome {
        let focus = Self::focus_only(state, window, duration_ms, mode);
        if !focus.ok {
            return focus;
        }
        std::thread::sleep(Duration::from_millis(100));
        // Force insertOnly — never Enter.
        let mode = ExecutionMode::InsertOnly;
        match insert_text::insert_text_no_enter(text, duration_ms) {
            Ok(()) => ProviderActionOutcome::ok_mode(mode),
            Err(e) => ProviderActionOutcome::err(e.as_reason(), Some(format!("{e:?}")), mode),
        }
    }
}

fn default_slash(action_id: &str) -> Option<&'static str> {
    match action_id {
        "status" => Some("/status"),
        "plan" => Some("/plan"),
        "review" => Some("/review"),
        "permissions" => Some("/permissions"),
        "switchAgent" => Some("/agent"),
        "appsOrPlugins" => Some("/apps"),
        _ => None,
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

fn map_workflow_err(err: AppChatWorkflowError, mode: ExecutionMode) -> ProviderActionOutcome {
    ProviderActionOutcome::err(workflow_reason(err), None, mode)
}

#[cfg(windows)]
fn focus_codex_composer(
    window: &WebviewWindow,
    duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    let app = window.app_handle();
    app_chat_workflow::focus_composer_only(&app, CODEX_APP_TARGET_ID, duration_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsupported_action_id() {
        // Pure catalog check — no window needed for supports().
        assert_eq!(
            CodexProviderAdapter::supports("nope"),
            ProviderSupport::Unsupported
        );
        assert_ne!(
            CodexProviderAdapter::supports("openAgent"),
            ProviderSupport::Unsupported
        );
    }
}
