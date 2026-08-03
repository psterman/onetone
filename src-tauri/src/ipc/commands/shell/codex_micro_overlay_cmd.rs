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
    };
    let kind = kind.trim().to_ascii_lowercase();
    let target = match kind.as_str() {
        "codex" => CODEX_APP_TARGET_ID,
        "claude" => CLAUDE_CODE_APP_TARGET_ID,
        "cursor" => CURSOR_APP_TARGET_ID,
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
