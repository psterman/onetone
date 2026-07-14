//! Back-compat re-exports for the Cursor chat workflow.

pub use crate::app_chat_workflow::CURSOR_APP_TARGET_ID;

pub const CURSOR_CHAT_OPEN_KEY: &str = "Ctrl+I";

use std::sync::Arc;

use tauri::WebviewWindow;

use crate::AppState;

pub use crate::app_chat_workflow::AppChatWorkflowError as CursorWorkflowError;

#[cfg(not(windows))]
pub fn run_cursor_workflow(
    _state: &Arc<AppState>,
    _window: &WebviewWindow,
    _mapping_id: &str,
    _open_key: &str,
    _duration_ms: u32,
) -> Result<(), CursorWorkflowError> {
    Err(CursorWorkflowError::NotFound)
}

#[cfg(windows)]
pub fn run_cursor_workflow(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    _open_key: &str,
    duration_ms: u32,
) -> Result<(), CursorWorkflowError> {
    crate::app_chat_workflow::run_for_target_id(
        state,
        window,
        mapping_id,
        CURSOR_APP_TARGET_ID,
        duration_ms,
    )
    .map(|_| ())
    .map_err(|(_, err)| err)
}
