use crate::AppState;

use super::emit::emit_to_js_main_t;

#[derive(Clone, serde::Serialize)]
struct RuntimePayload {
    #[serde(rename = "type")]
    msg_type: String,
    bindings: String,
    #[serde(rename = "lastAction")]
    last_action: String,
    #[serde(rename = "lastMappingId")]
    last_mapping_id: String,
    #[serde(rename = "mappingCount")]
    mapping_count: u32,
    #[serde(rename = "enabledCount")]
    enabled_count: u32,
    #[serde(rename = "timerActive")]
    timer_active: bool,
    paused: bool,
    #[serde(rename = "soundCue", skip_serializing_if = "Option::is_none")]
    sound_cue: Option<String>,
}

pub fn push_runtime(
    state: &AppState,
    window: &tauri::WebviewWindow,
    last_action: &str,
    last_mapping_id: &str,
) {
    push_runtime_with_cue(state, window, last_action, last_mapping_id, None);
}

pub fn push_runtime_with_cue(
    state: &AppState,
    window: &tauri::WebviewWindow,
    last_action: &str,
    last_mapping_id: &str,
    sound_cue: Option<&str>,
) {
    let (bindings, mapping_count, enabled_count, paused) = {
        let cfg = state.cfg.lock();
        let paused = *state.paused.lock();
        let enabled_count = cfg.mappings.iter().filter(|m| m.enabled).count() as u32;
        (
            cfg.bindings().join(", "),
            cfg.mappings.len() as u32,
            enabled_count,
            paused,
        )
    };
    let timer_active = state.machine_pool.lock().any_timer_active();
    let payload = RuntimePayload {
        msg_type: "mvp_runtime".into(),
        bindings,
        last_action: last_action.into(),
        last_mapping_id: last_mapping_id.into(),
        mapping_count,
        enabled_count,
        timer_active,
        paused,
        sound_cue: sound_cue.map(str::to_string),
    };
    emit_to_js_main_t(window, payload);
}
