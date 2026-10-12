//! Smart region capture IPC — begin / action / confirm / cancel.
//!
//! Overlay create must NOT run while JS awaits this command (webview create deadlock).
//! Pattern matches `input_aim_calibrate`: return immediately, open on UI thread.

use std::sync::mpsc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::capture::{
    self, apply_action, begin, cancel, cancel_session_only, encode_pending, get_state,
    take_confirmed_pending, CaptureAction, CapturePublicState, EntrySource,
};
use crate::home_tray_snapshot::{request_collect, TrayCollectArgs};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartCaptureBeginArgs {
    pub entry: Option<String>,
    pub monitor_index: Option<u32>,
}

#[tauri::command]
pub fn cmd_smart_capture_begin(
    app: AppHandle,
    args: SmartCaptureBeginArgs,
) -> Result<serde_json::Value, String> {
    let entry = EntrySource::parse(args.entry.as_deref().unwrap_or("hotkey"));
    let monitor_index = args.monitor_index;
    let fg_before = capture::grab::peek_fg_client_rect();

    let app_bg = app.clone();
    let _ = std::thread::Builder::new()
        .name("smart-capture-begin".into())
        .spawn(move || {
            let (tx, rx) = mpsc::channel();
            let app_hide = app_bg.clone();
            let _ = app_bg.run_on_main_thread(move || {
                capture::overlay::hide_shell_chrome(&app_hide);
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_secs(2));
            // Brief settle after main-thread hide — long sleeps cause black flash feel.
            std::thread::sleep(Duration::from_millis(40));

            match begin(entry, monitor_index, fg_before) {
                Ok(state) => {
                    let cover = state.screen_rect;
                    let freeze_url = state
                        .freeze_png_base64
                        .as_ref()
                        .map(|b| format!("data:image/jpeg;base64,{b}"));
                    let app_ui = app_bg.clone();
                    let _ = app_bg.run_on_main_thread(move || {
                        if let Err(e) =
                            capture::overlay::open_overlay(&app_ui, Some(cover), freeze_url.as_deref())
                        {
                            cancel();
                            capture::overlay::restore_shell(&app_ui);
                            let _ = app_ui.emit(
                                "smart_capture_failed",
                                serde_json::json!({ "error": e }),
                            );
                            return;
                        }
                        // Include frame so overlay can paint without a second round-trip.
                        if let Some(s) = get_state(true) {
                            let _ = app_ui.emit("smart_capture_state", &s);
                        }
                    });
                }
                Err(e) => {
                    let app_ui = app_bg.clone();
                    let err = e.clone();
                    let _ = app_bg.run_on_main_thread(move || {
                        capture::overlay::restore_shell(&app_ui);
                        let _ = app_ui.emit(
                            "smart_capture_failed",
                            serde_json::json!({ "error": err }),
                        );
                    });
                }
            }
        })
        .map_err(|e| format!("spawn_begin:{e}"))?;

    Ok(serde_json::json!({
        "ok": true,
        "queued": true,
        "entry": entry.as_str(),
    }))
}

/// Switch active monitor without restoring Home (avoids flash).
#[tauri::command]
pub fn cmd_smart_capture_switch_monitor(
    app: AppHandle,
    monitor_index: u32,
) -> Result<serde_json::Value, String> {
    let entry = get_state(false)
        .map(|s| s.entry)
        .unwrap_or(EntrySource::Hotkey);
    cancel_session_only();
    capture::overlay::close_overlay(&app);

    let app_bg = app.clone();
    let _ = std::thread::Builder::new()
        .name("smart-capture-switch".into())
        .spawn(move || {
            let (tx, rx) = mpsc::channel();
            let app_hide = app_bg.clone();
            let _ = app_bg.run_on_main_thread(move || {
                capture::overlay::hide_shell_chrome(&app_hide);
                let _ = tx.send(());
            });
            let _ = rx.recv_timeout(Duration::from_secs(2));
            std::thread::sleep(Duration::from_millis(40));
            let fg = capture::grab::peek_fg_client_rect();
            match begin(entry, Some(monitor_index), fg) {
                Ok(state) => {
                    let cover = state.screen_rect;
                    let freeze_url = state
                        .freeze_png_base64
                        .as_ref()
                        .map(|b| format!("data:image/jpeg;base64,{b}"));
                    let app_ui = app_bg.clone();
                    let _ = app_bg.run_on_main_thread(move || {
                        if let Err(e) =
                            capture::overlay::open_overlay(&app_ui, Some(cover), freeze_url.as_deref())
                        {
                            cancel();
                            capture::overlay::restore_shell(&app_ui);
                            let _ = app_ui.emit(
                                "smart_capture_failed",
                                serde_json::json!({ "error": e }),
                            );
                            return;
                        }
                        if let Some(s) = get_state(true) {
                            let _ = app_ui.emit("smart_capture_state", &s);
                        }
                    });
                }
                Err(e) => {
                    let app_ui = app_bg.clone();
                    let _ = app_bg.run_on_main_thread(move || {
                        capture::overlay::restore_shell(&app_ui);
                        let _ = app_ui.emit(
                            "smart_capture_failed",
                            serde_json::json!({ "error": e }),
                        );
                    });
                }
            }
        })
        .map_err(|e| format!("spawn_switch:{e}"))?;

    Ok(serde_json::json!({ "ok": true, "queued": true }))
}

#[tauri::command]
pub fn cmd_smart_capture_get_state(include_frame: Option<bool>) -> Option<CapturePublicState> {
    get_state(include_frame.unwrap_or(false))
}

#[tauri::command]
pub fn cmd_smart_capture_action(
    app: AppHandle,
    action: CaptureAction,
) -> Result<CapturePublicState, String> {
    let state = apply_action(action)?;
    let _ = app.emit("smart_capture_state", &state);
    Ok(state)
}

/// Close overlay immediately, encode+inbox+collect on a background thread.
#[tauri::command]
pub fn cmd_smart_capture_confirm(app: AppHandle) -> Result<serde_json::Value, String> {
    let pending = take_confirmed_pending()?;
    capture::overlay::close_overlay(&app);
    capture::overlay::restore_shell(&app);

    let app_bg = app.clone();
    let _ = std::thread::Builder::new()
        .name("smart-capture-save".into())
        .spawn(move || {
            match encode_pending(pending) {
                Ok(mut result) => {
                    if let Some(path) = result.receipt.path.clone() {
                        let collect = request_collect(
                            &app_bg,
                            TrayCollectArgs {
                                kind: "attach".into(),
                                text: None,
                                path: Some(path),
                                name: Some("智能截图.png".into()),
                                id: None,
                                preview_base64: result.preview_base64.clone(),
                            },
                        );
                        if !collect.ok {
                            result.receipt.detail = Some(
                                collect
                                    .error
                                    .unwrap_or_else(|| "collect_queue_failed".into()),
                            );
                            result.receipt.state = crate::capture::HandoffReceiptState::Failed;
                        }
                    }
                    let _ = app_bg.emit("smart_capture_done", &result);
                }
                Err(e) => {
                    let _ = app_bg.emit(
                        "smart_capture_failed",
                        serde_json::json!({ "error": e }),
                    );
                }
            }
        });

    Ok(serde_json::json!({ "ok": true, "queued": true }))
}

#[tauri::command]
pub fn cmd_smart_capture_cancel(app: AppHandle) -> Result<(), String> {
    cancel();
    capture::overlay::close_overlay(&app);
    capture::overlay::restore_shell(&app);
    let _ = app.emit("smart_capture_cancelled", serde_json::json!({ "ok": true }));
    Ok(())
}
