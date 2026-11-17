use std::sync::Arc;

use tauri::{State, WebviewWindow};

use crate::ipc::runtime_dispatch::fire_codex_micro_pad_key;
use crate::AppState;

/// M2: screen / overlay keycap fire — microKeyId + phase (down|up|tap).
#[tauri::command]
pub fn cmd_codex_micro_pad_fire(
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
    micro_key_id: String,
    phase: String,
) -> serde_json::Value {
    let phase = phase.trim().to_ascii_lowercase();
    let key_down = match phase.as_str() {
        "down" | "tap" => true,
        "up" => false,
        _ => {
            return serde_json::json!({ "ok": false, "reason": "invalid_phase" });
        }
    };
    // Overlay / settings UI already highlights locally; avoid double emit to main bus on tap.
    let emit_pad_event = phase == "down" || phase == "up";
    if key_down {
        crate::app_log::log_line(
            state.inner().as_ref(),
            "voice_command",
            &format!(
                "pad_fire_cmd key={} phase={} win={}",
                micro_key_id.trim(),
                phase,
                window.label()
            ),
        );
    }
    fire_codex_micro_pad_key(
        state.inner(),
        &window,
        &micro_key_id,
        key_down,
        emit_pad_event,
    )
}
