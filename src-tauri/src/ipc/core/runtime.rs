use tauri::{AppHandle, Manager};

use crate::AppState;

use super::emit::{emit_to_js_main_t, emit_to_main_if_available};

const SNAPSHOT_LOG_TAIL: usize = 50;

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

fn build_runtime_payload(
    state: &AppState,
    last_action: &str,
    last_mapping_id: &str,
    sound_cue: Option<&str>,
    msg_type: &str,
) -> RuntimePayload {
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
    RuntimePayload {
        msg_type: msg_type.into(),
        bindings,
        last_action: last_action.into(),
        last_mapping_id: last_mapping_id.into(),
        mapping_count,
        enabled_count,
        timer_active,
        paused,
        sound_cue: sound_cue.map(str::to_string),
    }
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
    let payload = build_runtime_payload(
        state,
        last_action,
        last_mapping_id,
        sound_cue,
        "mvp_runtime",
    );
    emit_to_js_main_t(window, payload);
}

pub fn push_runtime_via_app(
    app: &AppHandle,
    state: &AppState,
    last_action: &str,
    last_mapping_id: &str,
    sound_cue: Option<&str>,
) {
    let payload = build_runtime_payload(
        state,
        last_action,
        last_mapping_id,
        sound_cue,
        "mvp_runtime",
    );
    let json = serde_json::to_value(payload).unwrap_or_default();
    emit_to_main_if_available(app, Some(state), json);
}

pub fn build_runtime_snapshot(app: &AppHandle, state: &AppState) -> serde_json::Value {
    let base = build_runtime_payload(state, "runtime_refresh", "", None, "mvp_runtime_snapshot");
    let logs: Vec<String> = {
        let ring = state.log_ring.lock();
        let start = ring.len().saturating_sub(SNAPSHOT_LOG_TAIL);
        ring.iter().skip(start).cloned().collect()
    };
    let resource_dir = app.path().resource_dir().ok();
    serde_json::json!({
        "type": base.msg_type,
        "bindings": base.bindings,
        "lastAction": base.last_action,
        "lastMappingId": base.last_mapping_id,
        "mappingCount": base.mapping_count,
        "enabledCount": base.enabled_count,
        "timerActive": base.timer_active,
        "paused": base.paused,
        "update": crate::update::snapshot(state),
        "voiceSapi": crate::voice_sapi_runtime::voice_sapi_status(state),
        "voiceVosk": crate::voice_vosk_runtime::voice_vosk_status(state, resource_dir.clone()),
        "voiceKws": crate::voice_kws_runtime::voice_kws_status(state, resource_dir),
        "voiceEnd": crate::voice_end_runtime::voice_end_status(state),
        "voiceSupervisor": crate::voice_bootstrap::supervisor_status_json(state),
        "sendGuardBlockedCount": crate::send_guard::blocked_count(),
        "logs": logs,
        "recentEvents": crate::runtime_event::recent_runtime_events(state, 100),
    })
}
