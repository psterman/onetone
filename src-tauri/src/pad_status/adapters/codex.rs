//! Codex hook / app → PadStatusCandidate.

use crate::codex_app_state::{map_event_to_status, CodexAppStatePayload};
use crate::pad_status::arbiter::DONE_SETTLE_MS;
use crate::pad_status::model::{
    Confidence, PadSource, PadState, PadStatus, PadStatusCandidate,
};
use crate::pad_status::store;

/// Map Codex lifecycle event → core state string.
pub fn map_codex_event_to_state(event: &str) -> Option<&'static str> {
    map_event_to_status(event)
}

pub fn ingest_codex_app_payload(payload: &CodexAppStatePayload) -> PadStatus {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    ingest_codex_app_payload_at(payload, now)
}

pub fn ingest_codex_app_payload_at(payload: &CodexAppStatePayload, now: u64) -> PadStatus {
    let source = PadSource::from_legacy(payload.source.trim());
    let event = payload.event.trim();
    let incoming_session = payload.session_id.trim();

    let cur = store::snapshot_at(now);
    let sticky = matches!(
        cur.state_enum(),
        PadState::NeedsInput | PadState::Running
    );
    let foreign = !incoming_session.is_empty()
        && cur
            .session_id
            .as_ref()
            .map(|s| !s.is_empty() && s != incoming_session)
            .unwrap_or(false);
    if sticky && foreign && matches!(event, "Stop" | "SessionStart") {
        return cur;
    }

    let Some(state_str) = map_codex_event_to_state(event) else {
        return cur;
    };
    let state = PadState::parse(state_str).unwrap_or(PadState::Idle);

    let sticky_until = match state {
        PadState::NeedsInput => Some(now.saturating_add(24 * 60 * 60 * 1000)),
        PadState::Done => Some(now.saturating_add(DONE_SETTLE_MS)),
        _ => None,
    };

    let message = match state {
        PadState::NeedsInput => Some("等待确认".into()),
        PadState::Running => Some("执行中".into()),
        PadState::Done => Some("本回合完成".into()),
        PadState::Error => Some("出现失败".into()),
        _ => None,
    };

    let session_id = if !incoming_session.is_empty() {
        Some(incoming_session.to_string())
    } else {
        cur.session_id.clone()
    };

    let cand = PadStatusCandidate {
        raw_tag: format!("{}:{}", source.as_str(), event),
        status: PadStatus {
            state: state.as_str().into(),
            phase: None,
            source: source.as_str().into(),
            confidence: Confidence::High.as_str().into(),
            updated_at: if payload.ts > 0 { payload.ts } else { now },
            agent: Some("codex".into()),
            task_id: {
                let t = payload.turn_id.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            },
            session_id,
            message,
            sticky_until,
            last_event: Some(event.to_string()),
        },
    };
    store::apply_candidate_at(cand, now).winner
}
