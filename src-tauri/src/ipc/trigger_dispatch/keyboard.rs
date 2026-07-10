use std::sync::Arc;

use tauri::Manager;

use crate::ipc::core::push_runtime;
use crate::AppState;
use crate::{keyboard, state};

pub(super) fn dispatch_send_esc(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
) {
    let app = window.app_handle();
    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        if crate::voice_end_runtime::is_in_trigger_cancel_window(state.as_ref(), mapping_id) {
            crate::voice_end_runtime::cancel_dictation_after_trigger_key(state, &app);
            push_runtime(state.as_ref(), window, "esc", mapping_id);
        }
        return;
    }
    keyboard::send_escape();
    push_runtime(state.as_ref(), window, "esc", mapping_id);
}

pub(super) fn dispatch_send_enter(
    state: &AppState,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
) {
    keyboard::send_enter();
    push_runtime(state, window, "enter", mapping_id);
}

pub(super) fn dispatch_schedule_enter(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    delay_ms: u32,
    token: u64,
) {
    let s3 = Arc::clone(state);
    let w3 = window.clone();
    let mid = mapping_id.to_string();
    let d = delay_ms;
    let timer_token = token;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(d as u64)).await;
        let action = s3
            .machine_pool
            .lock()
            .get_or_create(&mid)
            .on_enter_timer(timer_token);
        if matches!(action, state::Action::SendEnter) {
            keyboard::send_enter();
            push_runtime(&s3, &w3, "enter", &mid);
        }
    });
    push_runtime(state.as_ref(), window, "enter_scheduled", mapping_id);
}
