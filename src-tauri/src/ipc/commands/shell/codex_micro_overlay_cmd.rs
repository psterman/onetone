use std::sync::Arc;

use tauri::{AppHandle, State, WebviewWindow};

use crate::codex_micro_overlay::{self, CodexMicroOverlaySnapshot};
use crate::AppState;

#[tauri::command]
pub fn cmd_codex_micro_overlay_get_state(
    state: tauri::State<Arc<AppState>>,
) -> CodexMicroOverlaySnapshot {
    codex_micro_overlay::build_snapshot(state.inner())
}

/// Labs / acceptance only: inject a Codex Micro RPC JSON object without HID.
/// This proves the OneTone protocol -> overlay light path before a real bridge exists.
#[tauri::command]
pub fn cmd_codex_micro_protocol_inject(
    app: AppHandle,
    state: tauri::State<Arc<AppState>>,
    json: String,
) -> Result<CodexMicroOverlaySnapshot, String> {
    let raw = json.trim();
    if raw.is_empty() {
        return Err("empty_rpc".into());
    }
    if raw.len() > 16 * 1024 {
        return Err("rpc_too_large".into());
    }
    serde_json::from_str::<serde_json::Value>(raw).map_err(|_| "invalid_json".to_string())?;
    crate::codex_micro_vendor::apply_rpc_json(raw);
    codex_micro_overlay::push_state(&app, state.inner());
    Ok(codex_micro_overlay::build_snapshot(state.inner()))
}

/// Labs/验收：启动 127.0.0.1 状态 RPC loopback（默认关闭；不接 hid/rad）。
#[tauri::command]
pub fn cmd_codex_micro_protocol_server_start(
    app: AppHandle,
    state: tauri::State<Arc<AppState>>,
    port: Option<u16>,
) -> Result<crate::codex_micro_protocol_server::ProtocolServerStartResult, String> {
    crate::codex_micro_protocol_server::start(app, Arc::clone(state.inner()), port)
}

/// Labs/验收：停止 loopback HTTP。
#[tauri::command]
pub fn cmd_codex_micro_protocol_server_stop() -> Result<serde_json::Value, String> {
    crate::codex_micro_protocol_server::stop()?;
    Ok(serde_json::json!({ "ok": true }))
}

/// Labs/验收：查询 loopback 是否在跑（正式用户默认 enabled=false）。
#[tauri::command]
pub fn cmd_codex_micro_protocol_server_status(
) -> crate::codex_micro_protocol_server::ProtocolServerStatus {
    crate::codex_micro_protocol_server::status()
}

/// Soft-dismiss floating pad for this FG session (do not persist overlayEnabled=false).
#[tauri::command]
pub async fn cmd_codex_micro_overlay_dismiss(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    // push_state / HWND work must not run as a sync command on the UI thread.
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        codex_micro_overlay::dismiss_overlay(&app, &state)
    })
    .await
    .map_err(|e| format!("overlay dismiss failed: {e}"))
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_start_drag(window: WebviewWindow) -> Result<(), String> {
    codex_micro_overlay::start_overlay_drag(&window)
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_snap_position(window: WebviewWindow) {
    codex_micro_overlay::snap_overlay_position(&window);
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_set_minimized(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    minimized: bool,
) {
    codex_micro_overlay::set_overlay_minimized_persist(&app, state.inner(), minimized);
    codex_micro_overlay::push_state(&app, state.inner());
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_master(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_pad_master(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_num_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_pad_num_mode(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_pad_mode(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<String, String> {
    codex_micro_overlay::toggle_pad_mode(&app, state.inner())
}

#[tauri::command]
pub fn cmd_codex_micro_overlay_toggle_joy_panel(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    codex_micro_overlay::toggle_joy_nav_panel(&app, state.inner())
}

/// Soft Pad agent chip: focus / open Codex, Claude Code, or Cursor composer.
#[tauri::command]
pub async fn cmd_soft_pad_focus_agent(app: AppHandle, kind: String) -> Result<serde_json::Value, String> {
    use crate::app_chat_workflow::{
        self, CLAUDE_CODE_APP_TARGET_ID, CODEX_APP_TARGET_ID, CURSOR_APP_TARGET_ID,
        MINIMAX_APP_TARGET_ID, QODER_APP_TARGET_ID, TRAE_APP_TARGET_ID, WORKBUDDY_APP_TARGET_ID,
    };
    let kind = kind.trim().to_ascii_lowercase();
    let target = match kind.as_str() {
        "codex" => CODEX_APP_TARGET_ID,
        "claude" => CLAUDE_CODE_APP_TARGET_ID,
        "cursor" => CURSOR_APP_TARGET_ID,
        "minimax" => MINIMAX_APP_TARGET_ID,
        "workbuddy" => WORKBUDDY_APP_TARGET_ID,
        "trae" => TRAE_APP_TARGET_ID,
        "qoder" => QODER_APP_TARGET_ID,
        _ => return Err("unknown_agent".into()),
    };
    let target_owned = target.to_string();
    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        app_chat_workflow::focus_composer_only(&app2, &target_owned, 800)
    })
    .await
    .map_err(|e| format!("soft_pad_focus_join:{e}"))?;
    match result {
        Ok(()) => Ok(serde_json::json!({ "ok": true, "appTargetId": target, "kind": kind })),
        Err(err) => Err(err.reason("soft_pad_focus")),
    }
}

/// Chip / status host / Soft RGB → focus exact session (lane), else fallback app.
#[tauri::command]
pub async fn cmd_soft_pad_focus_session(
    app: AppHandle,
    kind: String,
    lane_id: Option<String>,
    session_id: Option<String>,
    click_kind: Option<String>,
) -> Result<serde_json::Value, String> {
    use crate::agent_lane::{
        focus_session, FocusClickKind, FocusTargetHint,
    };
    use crate::soft_pad_runtime::AgentKind;

    let kind_l = kind.trim().to_ascii_lowercase();
    let agent = AgentKind::from_kind_str(&kind_l).ok_or_else(|| "unknown_agent".to_string())?;
    let click = match click_kind
        .as_deref()
        .unwrap_or("chip")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "status_host" | "status-host" => FocusClickKind::StatusHost,
        "soft_rgb" | "soft-rgb" | "rgb" => FocusClickKind::SoftRgb,
        _ => FocusClickKind::Chip,
    };
    let hint = FocusTargetHint {
        lane_id,
        session_id,
    };
    let app2 = app.clone();
    let kind_owned = kind_l.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let r = focus_session(agent, hint, click);
        if r.result == "fallback_app" {
            let target = match kind_owned.as_str() {
                "codex" => crate::app_chat_workflow::CODEX_APP_TARGET_ID,
                "claude" => crate::app_chat_workflow::CLAUDE_CODE_APP_TARGET_ID,
                "cursor" => crate::app_chat_workflow::CURSOR_APP_TARGET_ID,
                "minimax" => crate::app_chat_workflow::MINIMAX_APP_TARGET_ID,
                "workbuddy" => crate::app_chat_workflow::WORKBUDDY_APP_TARGET_ID,
                "trae" => crate::app_chat_workflow::TRAE_APP_TARGET_ID,
                "qoder" => crate::app_chat_workflow::QODER_APP_TARGET_ID,
                _ => "",
            };
            if !target.is_empty() {
                let _ = crate::app_chat_workflow::focus_composer_only(&app2, target, 800);
            }
        }
        r
    })
    .await
    .map_err(|e| format!("focus_session_join:{e}"))?;

    Ok(serde_json::json!({
        "ok": result.ok,
        "result": result.result,
        "laneId": result.lane_id,
        "detail": result.detail,
        "clickKind": result.click_kind,
    }))
}

/// Status-host key gate for overlay (idle pass / running swallow / attention intercept).
#[tauri::command]
pub fn cmd_soft_pad_status_host_gate(app_status: String) -> serde_json::Value {
    use crate::agent_lane::{status_host_click_gate, StatusHostClickGate};
    let gate = status_host_click_gate(&app_status);
    let action = match gate {
        StatusHostClickGate::PassThrough => "pass",
        StatusHostClickGate::Swallow => "swallow",
        StatusHostClickGate::InterceptFocus => "intercept",
    };
    serde_json::json!({ "action": action, "appStatus": app_status })
}
