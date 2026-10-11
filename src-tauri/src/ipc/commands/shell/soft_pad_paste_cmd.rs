//! Soft Pad paste_only — Ctrl+V to external foreground only.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::app_identity;
use crate::app_log;

static PASTE_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadPasteOnlyResult {
    pub ok: bool,
    pub error: Option<String>,
    pub paste_input_sent: bool,
}

#[tauri::command]
pub fn cmd_soft_pad_paste_only(hold_ms: Option<u32>) -> SoftPadPasteOnlyResult {
    app_log::cursor_send_oplog(
        "paste_attempted",
        serde_json::json!({ "via": "soft_pad_paste_only" }),
    );

    if PASTE_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return SoftPadPasteOnlyResult {
            ok: false,
            error: Some("paste_busy".into()),
            paste_input_sent: false,
        };
    }

    let result = paste_only_inner(hold_ms.unwrap_or(40));
    PASTE_IN_FLIGHT.store(false, Ordering::SeqCst);
    result
}

fn paste_only_inner(hold_ms: u32) -> SoftPadPasteOnlyResult {
    if app_identity::foreground_is_self() {
        app_log::cursor_send_oplog(
            "paste_attempted",
            serde_json::json!({
                "via": "soft_pad_paste_only",
                "error": "no_external_foreground",
                "fgSelf": true,
            }),
        );
        return SoftPadPasteOnlyResult {
            ok: false,
            error: Some("no_external_foreground".into()),
            paste_input_sent: false,
        };
    }

    let fg = app_identity::foreground_app_identity();
    let fg_exe = fg
        .as_ref()
        .map(|i| i.exe_name.clone())
        .unwrap_or_default();

    #[cfg(windows)]
    {
        let hold = hold_ms.max(35);
        let sent = crate::keyboard::send_chord("Ctrl+V", hold);
        app_log::cursor_send_oplog(
            "paste_input_sent",
            serde_json::json!({
                "via": "soft_pad_paste_only",
                "ok": sent,
                "fgExe": fg_exe,
                "holdMs": hold,
            }),
        );
        if sent {
            SoftPadPasteOnlyResult {
                ok: true,
                error: None,
                paste_input_sent: true,
            }
        } else {
            SoftPadPasteOnlyResult {
                ok: false,
                error: Some("send_input_failed".into()),
                paste_input_sent: false,
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (hold_ms, fg_exe);
        SoftPadPasteOnlyResult {
            ok: false,
            error: Some("unsupported_platform".into()),
            paste_input_sent: false,
        }
    }
}
