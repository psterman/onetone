mod keyboard;
mod send_key;

use std::sync::Arc;

use crate::AppState;

pub fn dispatch_trigger_action(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    duration_ms: u32,
    source_key: &str,
    action: crate::state::Action,
) {
    use crate::state;
    match action {
        state::Action::SendKey { key } => {
            send_key::dispatch_send_key(state, window, mapping_id, duration_ms, source_key, &key)
        }
        state::Action::SendEsc => keyboard::dispatch_send_esc(state.as_ref(), window, mapping_id),
        state::Action::ScheduleEnter { delay_ms, token } => {
            keyboard::dispatch_schedule_enter(state, window, mapping_id, delay_ms, token)
        }
        state::Action::SendEnter => {
            keyboard::dispatch_send_enter(state.as_ref(), window, mapping_id)
        }
        state::Action::None => {}
    }
}
