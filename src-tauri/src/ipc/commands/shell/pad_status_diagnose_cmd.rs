//! Read-only pad status diagnose — current Core snapshot + recent jsonl rows.

use serde::Serialize;
use tauri::State;
use std::sync::Arc;

use crate::pad_status::{
    self, log_path, plan_hid_output, tail_events, HidOutputIntent, PadStatusLogRow,
};
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadStatusDiagnoseView {
    pub ui_status: String,
    pub state: String,
    pub phase: String,
    pub source: String,
    pub source_legacy: String,
    pub confidence: String,
    pub updated_at: u64,
    pub age_ms: u64,
    pub message: String,
    pub task_id: String,
    pub session_id: String,
    pub last_event: String,
    pub sticky_until: u64,
    pub log_path: String,
    /// Optional HID Output Adapter intent (plan-only; never emits hardware).
    pub hid: HidOutputIntent,
    pub recent: Vec<PadStatusLogRow>,
}

/// Explain current lamp: Core snapshot + last accept/reject events (replay tail).
#[tauri::command]
pub fn cmd_pad_status_diagnose(
    state: State<'_, Arc<AppState>>,
    limit: Option<u32>,
) -> PadStatusDiagnoseView {
    let lim = limit.unwrap_or(48) as usize;
    let pad = pad_status::snapshot();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let lights_on = {
        let cfg = state.cfg.lock();
        crate::codex_micro_overlay::status_lights_enabled(&cfg)
    };
    let hid = plan_hid_output(&pad, lights_on);
    PadStatusDiagnoseView {
        ui_status: pad_status::ui_status_from_pad(&pad),
        state: pad.state.clone(),
        phase: pad.phase.clone().unwrap_or_default(),
        source: pad.source.clone(),
        source_legacy: pad.display_source_label().to_string(),
        confidence: pad.confidence.clone(),
        updated_at: pad.updated_at,
        age_ms: pad.age_ms(now),
        message: pad.message.clone().unwrap_or_default(),
        task_id: pad.task_id.clone().unwrap_or_default(),
        session_id: pad.session_id.clone().unwrap_or_default(),
        last_event: pad.last_event.clone().unwrap_or_default(),
        sticky_until: pad.sticky_until.unwrap_or(0),
        log_path: log_path().display().to_string(),
        hid,
        recent: tail_events(lim),
    }
}
