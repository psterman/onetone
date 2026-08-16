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

    // Soft Pad LaneStore (per-thread); independent of global PadStatus.
    {
        use crate::agent_lane::store::{ingest_lane_event, LaneIngest};
        use crate::soft_pad_runtime::AgentKind;
        if !incoming_session.is_empty() || !payload.cwd.trim().is_empty() {
            let _ = ingest_lane_event(LaneIngest {
                provider: AgentKind::Codex,
                workspace_id: payload.cwd.clone(),
                session_id: payload.session_id.clone(),
                subagent_id: None,
                title: None,
                event: event.into(),
                source: payload.source.clone(),
                cwd: payload.cwd.clone(),
                host_pid: 0,
                terminal_hwnd: 0,
                sequence: None,
                at: Some(if payload.ts > 0 { payload.ts } else { now }),
            });
        }
    }

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
    let winner = store::apply_candidate_at(cand, now).winner;
    // Dual-write AttentionStore for Soft Pad waiting_kinds (not PadStatus 24h sticky).
    let src = payload.source.trim();
    let is_app_server = src == "codex_app_server" || src == "app_server";
    // Disk session scan (`codex_app`): AppServer lifecycle only — never OfficialHook.
    if is_app_server || src == "codex_app" {
        let attn_event = if src == "codex_app" {
            match event {
                "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch" => "working",
                "Stop" | "TaskCompleted" | "TaskComplete" => "done",
                "StopFailure" | "PostToolUseFailure" => "failed",
                "SessionStart" | "SessionEnd" => "idle",
                other => other,
            }
        } else {
            event
        };
        crate::agent_attention::ingest_codex_app_server_event(
            attn_event,
            incoming_session,
            payload.turn_id.trim(),
        );
    } else {
        crate::agent_attention::ingest_codex_hook_event(
            event,
            incoming_session,
            payload.turn_id.trim(),
        );
    }
    winner
}
