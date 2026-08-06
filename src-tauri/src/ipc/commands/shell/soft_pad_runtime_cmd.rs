//! Soft Pad Runtime Arbiter IPC — pin + snapshot + attention / Cursor gates.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::agent_attention::{self, AttentionPublicSnapshot};
use crate::agent_catalog::{self, AgentCapabilities};
use crate::soft_pad_runtime::{
    get_public_snapshot, request_soft_pad_recompute, set_follow_pin, AgentKind, SoftPadPublicSnapshot,
};
use crate::AppState;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadAgentLightsSetResult {
    pub ok: bool,
    pub agent: String,
    pub enabled: bool,
    pub loopback_enabled: bool,
    pub loopback_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[tauri::command]
pub fn cmd_soft_pad_runtime_snapshot(state: State<'_, Arc<AppState>>) -> SoftPadPublicSnapshot {
    let _ = state;
    get_public_snapshot()
}

/// Soft Pad follow pin removed from product — always clear and recompute as Auto.
#[tauri::command]
pub fn cmd_soft_pad_set_follow(
    state: State<'_, Arc<AppState>>,
    lane: Option<String>,
) -> SoftPadPublicSnapshot {
    let _ = lane;
    set_follow_pin(None);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    get_public_snapshot()
}

#[tauri::command]
pub fn cmd_agent_attention_snapshot(
    state: State<'_, Arc<AppState>>,
) -> AttentionPublicSnapshot {
    let _ = state;
    agent_attention::public_snapshot()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorCapsView {
    pub capabilities: AgentCapabilities,
    pub honesty_ceiling: &'static str,
}

#[tauri::command]
pub fn cmd_cursor_soft_pad_capabilities(state: State<'_, Arc<AppState>>) -> CursorCapsView {
    let _ = state;
    CursorCapsView {
        capabilities: agent_catalog::cursor_capabilities(),
        honesty_ceiling: "officialLifecycleHooks+desktopAutomation",
    }
}

/// P3: open Cursor waiting only after verified official wait events or OneTone ask.
#[tauri::command]
pub fn cmd_cursor_set_needs_input_gate(
    state: State<'_, Arc<AppState>>,
    enabled: bool,
) -> CursorCapsView {
    agent_catalog::set_cursor_can_observe_needs_input(enabled);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    cmd_cursor_soft_pad_capabilities(state)
}

/// Ingest Cursor Hook lifecycle JSON (install/config via Skills; realtime via this path).
#[tauri::command]
pub fn cmd_cursor_hook_ingest(
    state: State<'_, Arc<AppState>>,
    event: String,
    session_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    agent_attention::ingest_cursor_hook_event(
        event.trim(),
        session_id.as_deref().unwrap_or(""),
    );
    agent_attention::public_snapshot()
}

/// Read-only Cursor Hook setup probe — never writes `~/.cursor` or project hooks.
/// `workspace` must be user-selected / Soft Pad scene-bound; empty = user scope only.
#[tauri::command]
pub fn cmd_cursor_hook_setup_status(
    state: State<'_, Arc<AppState>>,
    workspace: Option<String>,
) -> crate::cursor_hook_setup::CursorHookSetupStatus {
    let _ = state;
    let ws = workspace
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from);
    crate::cursor_hook_setup::setup_status(ws.as_deref())
}

/// OneTone-originated ask (may enter waiting even when Cursor official gate is closed).
#[tauri::command]
pub fn cmd_onetone_attention_ask(
    state: State<'_, Arc<AppState>>,
    agent: String,
    session_id: Option<String>,
    request_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    if let Some(kind) = AgentKind::from_kind_str(agent.trim()) {
        agent_attention::raise_onetone_ask(
            kind,
            session_id.as_deref().unwrap_or(""),
            request_id.as_deref().unwrap_or(""),
        );
    }
    agent_attention::public_snapshot()
}

#[tauri::command]
pub fn cmd_onetone_attention_clear(
    state: State<'_, Arc<AppState>>,
    agent: String,
    session_id: Option<String>,
    request_id: Option<String>,
) -> AttentionPublicSnapshot {
    let _ = state;
    if let Some(kind) = AgentKind::from_kind_str(agent.trim()) {
        agent_attention::clear_onetone_ask(
            kind,
            session_id.as_deref().unwrap_or(""),
            request_id.as_deref().unwrap_or(""),
        );
    }
    agent_attention::public_snapshot()
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadLanePageView {
    pub purpose: String,
    pub applied_agent: String,
    pub ag_surface: String,
    pub navigation_slots: Vec<String>,
    pub navigation_overflow: u32,
    pub multi_agent_lights: bool,
    pub page: crate::agent_lane::PageSessionState,
    pub lanes: Vec<crate::agent_lane::AgentLane>,
}

/// Page session + lanes for Applied mapping (does not bump Applied revision).
#[tauri::command]
pub fn cmd_soft_pad_lane_page(
    state: State<'_, Arc<AppState>>,
) -> Result<SoftPadLanePageView, String> {
    use crate::soft_pad_purpose::{ag_surface_for, multi_agent_lights_allowed, navigation_slots_for};
    let cfg = state.cfg.lock().clone();
    let (kind, mid) = crate::soft_pad_runtime::applied_lane()
        .ok_or_else(|| "no_applied_lane".to_string())?;
    let pad = cfg
        .mappings
        .iter()
        .find(|m| m.id == mid)
        .and_then(|m| m.codex_micro_pad.clone())
        .ok_or_else(|| "no_pad".to_string())?;
    let page = crate::agent_lane::get_page_state(kind, &mid, &pad);
    let lanes = crate::agent_lane::public_lanes_for_page(kind);
    let navigation_slots = navigation_slots_for(kind, &pad);
    let navigation_overflow = lanes.len().saturating_sub(navigation_slots.len()) as u32;
    let surface = ag_surface_for(kind, &pad);
    Ok(SoftPadLanePageView {
        purpose: pad.purpose.as_str().to_string(),
        applied_agent: kind.as_str().to_string(),
        ag_surface: surface.as_str().to_string(),
        navigation_slots,
        navigation_overflow,
        multi_agent_lights: multi_agent_lights_allowed(kind, &pad),
        page,
        lanes,
    })
}

/// Persist Soft Pad top-bar agent light switch: `codex` | `claude` | `cursor` | shell hook kinds.
/// Codex or shell hook on → also ensure loopback (same as `cmd_codex_status_lights_set`).
/// Disk write runs off the IPC thread — sync save used to 假死 Soft Pad toggles.
#[tauri::command]
pub fn cmd_soft_pad_agent_lights_set(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    agent: String,
    enabled: bool,
) -> Result<SoftPadAgentLightsSetResult, String> {
    let mapping_id = mapping_id.trim().to_string();
    let agent = agent.trim().to_ascii_lowercase();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    if !matches!(
        agent.as_str(),
        "codex" | "claude" | "cursor" | "workbuddy" | "trae" | "qoder"
    ) {
        return Err("bad_agent".into());
    }

    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        match agent.as_str() {
            "codex" => pad.codex_status_lights_enabled = enabled,
            "claude" => pad.claude_status_lights_enabled = enabled,
            "cursor" => pad.cursor_status_lights_enabled = enabled,
            "workbuddy" => pad.workbuddy_status_lights_enabled = enabled,
            "trae" => pad.trae_status_lights_enabled = enabled,
            "qoder" => pad.qoder_status_lights_enabled = enabled,
            _ => {}
        }
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    let needs_loopback = enabled
        && matches!(
            agent.as_str(),
            "codex" | "workbuddy" | "trae" | "qoder"
        );
    let mut loopback_error: Option<String> = None;
    if needs_loopback {
        match crate::codex_micro_protocol_server::start(app.clone(), Arc::clone(state.inner()), None)
        {
            Ok(_) => {}
            Err(e) => {
                let lower = e.to_ascii_lowercase();
                loopback_error = Some(if lower.contains("address already in use")
                    || lower.contains("only one usage of each socket")
                    || lower.contains("os error 10048")
                    || lower.contains("port_in_use")
                {
                    "port_in_use".into()
                } else if lower.contains("bind")
                    || lower.contains("permission")
                    || lower.contains("os error")
                {
                    "bind_failed".into()
                } else if e.trim().is_empty() {
                    "bind_failed".into()
                } else {
                    e.clone()
                });
                crate::app_log::log_line(
                    state.inner(),
                    "config",
                    &format!("cmd_soft_pad_agent_lights_set ensure_loopback_failed: {e}"),
                );
            }
        }
    }

    let srv = crate::codex_micro_protocol_server::status();
    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("soft-pad-agent-lights".into())
        .spawn(move || {
            crate::config::save_config(&cfg_to_save);
            crate::codex_micro_overlay::push_state(&app, &state_bg);
        });

    Ok(SoftPadAgentLightsSetResult {
        ok: loopback_error.is_none(),
        agent,
        enabled,
        loopback_enabled: srv.enabled,
        loopback_url: srv.url.clone(),
        error: loopback_error,
    })
}

#[tauri::command]
pub fn cmd_soft_pad_set_purpose(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    purpose: String,
) -> Result<String, String> {
    use crate::soft_pad_purpose::{purpose_sessions_allowed, SoftPadPurpose};
    let want = SoftPadPurpose::from_str_loose(&purpose);
    {
        let mut cfg = state.cfg.lock();
        let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let kind = crate::agent_catalog::kind_from_mapping(
            m.app_target_id.trim(),
            m.agent_provider_id.trim(),
        )
        .unwrap_or(AgentKind::Codex);
        if want.is_sessions() && !purpose_sessions_allowed(kind) {
            return Err(format!(
                "sessions_not_supported:{}",
                kind.as_str()
            ));
        }
        let Some(pad) = m.codex_micro_pad.as_mut() else {
            return Err("no_pad".into());
        };
        // sessions must not seed Codex ACT into other agents — only flip purpose.
        pad.purpose = want;
        if want.is_sessions() {
            // Backend guard-rail: if callers only flip `purpose=sessions` but never
            // seeded AG navigation roles, then `navigation_slots_for(...)` stays empty
            // and physical session lights will not project.
            let _ = crate::soft_pad_purpose::
                seed_recommended_navigation_slots_for_sessions_if_missing(kind, pad)?;
        }
    }
    let cfg = state.cfg.lock().clone();
    crate::config::save_config(&cfg);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    Ok(want.as_str().to_string())
}

/// Atomically set which AG keys are navigation lanes (empty = all AG back to actions).
#[tauri::command]
pub fn cmd_soft_pad_set_navigation_slots(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    slots: Vec<String>,
) -> Result<Vec<String>, String> {
    use crate::soft_pad_purpose::apply_navigation_slots;
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    let applied_slots;
    {
        let mut cfg = state.cfg.lock();
        let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let kind = crate::agent_catalog::kind_from_mapping(
            m.app_target_id.trim(),
            m.agent_provider_id.trim(),
        )
        .unwrap_or(AgentKind::Codex);
        let Some(pad) = m.codex_micro_pad.as_mut() else {
            return Err("no_pad".into());
        };
        if pad.purpose != crate::soft_pad_purpose::SoftPadPurpose::Sessions && !slots.is_empty() {
            return Err("purpose_must_be_sessions".into());
        }
        applied_slots = apply_navigation_slots(kind, pad, &slots)?;
    }
    let cfg = state.cfg.lock().clone();
    crate::config::save_config(&cfg);
    {
        let cfg = state.cfg.lock();
        request_soft_pad_recompute(&cfg);
    }
    Ok(applied_slots)
}

#[tauri::command]
pub fn cmd_soft_pad_resume_lane(
    state: State<'_, Arc<AppState>>,
    lane_id: String,
) -> Result<crate::agent_lane::nav::ResumeLaneResult, String> {
    let _ = state;
    let Some(lane) = crate::agent_lane::store::get_lane(&lane_id) else {
        return Err("lane_not_found".into());
    };
    Ok(match lane.key.provider {
        AgentKind::Claude => crate::agent_lane::resume_claude_lane(&lane_id),
        AgentKind::Codex => crate::agent_lane::resume_codex_lane(&lane_id),
        _ => crate::agent_lane::nav::ResumeLaneResult {
            ok: false,
            detail: "unsupported_provider".into(),
        },
    })
}

/// Test/diagnose: inject a synthetic lane without App Server.
#[tauri::command]
pub fn cmd_soft_pad_inject_lane(
    state: State<'_, Arc<AppState>>,
    provider: String,
    session_id: String,
    workspace: Option<String>,
    event: Option<String>,
) -> Result<String, String> {
    if !cfg!(debug_assertions) {
        return Err("diagnostic_only".into());
    }
    let _ = state;
    let kind = AgentKind::from_kind_str(provider.trim()).ok_or("bad_provider")?;
    let id = crate::agent_lane::ingest_lane_event(crate::agent_lane::store::LaneIngest {
        provider: kind,
        workspace_id: workspace.unwrap_or_default(),
        session_id,
        subagent_id: None,
        title: None,
        event: event.unwrap_or_else(|| "working".into()),
        source: "inject".into(),
        cwd: String::new(),
        host_pid: 0,
        terminal_hwnd: 0,
        sequence: None,
        at: None,
    })
    .ok_or_else(|| "ingest_failed".to_string())?;
    Ok(id)
}
