//! Tray snapshot IPC — main publishes, Soft Pad gets / dismisses carry / requests collect.

use serde_json::Value;
use tauri::AppHandle;

use crate::home_tray_snapshot::{
    dismiss_carry, drain_pending_collect, get_snapshot, publish_snapshot, request_collect,
    write_inbox_base64, write_inbox_bytes, TrayCarryDismissResult, TrayCollectArgs,
    TrayCollectResult, TrayPublishResult,
};

#[tauri::command]
pub fn cmd_tray_snapshot_publish(
    app: AppHandle,
    snapshot: Value,
) -> Result<TrayPublishResult, String> {
    if !snapshot.is_object() {
        return Err("snapshot must be an object".into());
    }
    let ver = snapshot
        .get("schemaVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if ver != 1 {
        return Err(format!("unsupported schemaVersion={ver}"));
    }
    Ok(publish_snapshot(&app, snapshot))
}

#[tauri::command]
pub fn cmd_tray_snapshot_get() -> Value {
    get_snapshot()
}

#[tauri::command]
pub fn cmd_tray_carry_dismiss(app: AppHandle) -> TrayCarryDismissResult {
    dismiss_carry(&app)
}

#[tauri::command]
pub fn cmd_tray_collect_from_soft_pad(
    app: AppHandle,
    kind: String,
    text: Option<String>,
    path: Option<String>,
    name: Option<String>,
    id: Option<String>,
) -> TrayCollectResult {
    request_collect(
        &app,
        TrayCollectArgs {
            kind,
            text,
            path,
            name,
            id,
            preview_base64: None,
        },
    )
}

#[tauri::command]
pub fn cmd_tray_collect_drain() -> Vec<Value> {
    drain_pending_collect()
}

/// Soft Pad paste/drop image blob → disk path under data_root/tray/inbox.
#[tauri::command]
pub fn cmd_tray_inbox_write(
    name: Option<String>,
    bytes_base64: String,
) -> Result<String, String> {
    write_inbox_base64(name, &bytes_base64)
}

/// Read Windows clipboard image (PNG / CF_DIB) → inbox path for home paste cards.
/// WebView clipboard.read() often cannot see screenshots; this is the reliable path.
#[tauri::command]
pub fn cmd_clipboard_read_image() -> Result<String, String> {
    #[cfg(windows)]
    {
        let png = crate::clipboard_image::read_clipboard_image_png()?;
        write_inbox_bytes(Some("clipboard.png".into()), &png)
    }
    #[cfg(not(windows))]
    {
        Err("unsupported".into())
    }
}
