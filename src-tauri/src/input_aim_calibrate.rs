//! Scheme-B input aim calibrate: coarse marquee → fine click → store client ratios.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::config::{ComposerAnchor, VoiceConfig};
use crate::AppState;

const LABEL: &str = "input_aim_calibrate";

static PENDING_APP: Mutex<String> = Mutex::new(String::new());
static HID_MAIN: Mutex<bool> = Mutex::new(false);

fn set_pending(app_target_id: &str) {
    if let Ok(mut g) = PENDING_APP.lock() {
        *g = app_target_id.trim().to_string();
    }
}

fn take_pending() -> String {
    PENDING_APP
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or_default()
}

fn hide_main_for_calibrate(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
        if let Ok(mut g) = HID_MAIN.lock() {
            *g = true;
        }
    }
    if let Some(pad) = app.get_webview_window("codex_micro_overlay") {
        let _ = pad.set_ignore_cursor_events(true);
    }
}

fn restore_main_after_calibrate(app: &AppHandle) {
    let hid = HID_MAIN
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or(false);
    if hid {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
        }
    }
    if let Some(pad) = app.get_webview_window("codex_micro_overlay") {
        let _ = pad.set_ignore_cursor_events(false);
    }
}

fn close_overlay_window_only(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
        let _ = win.close();
    }
}

fn close_overlay(app: &AppHandle) {
    close_overlay_window_only(app);
    restore_main_after_calibrate(app);
}

fn cover_primary_monitor(win: &WebviewWindow) {
    let mon = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());
    if let Some(mon) = mon {
        let size = mon.size();
        let pos = mon.position();
        let _ = win.set_size(Size::Physical(PhysicalSize::new(size.width, size.height)));
        let _ = win.set_position(Position::Physical(PhysicalPosition::new(pos.x, pos.y)));
        return;
    }
    #[cfg(windows)]
    {
        use winapi::um::winuser::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
        let w = unsafe { GetSystemMetrics(SM_CXSCREEN) }.max(800) as u32;
        let h = unsafe { GetSystemMetrics(SM_CYSCREEN) }.max(600) as u32;
        let _ = win.set_size(Size::Physical(PhysicalSize::new(w, h)));
        let _ = win.set_position(Position::Physical(PhysicalPosition::new(0, 0)));
    }
}

fn assert_overlay_on_top(win: &WebviewWindow) {
    let _ = win.set_ignore_cursor_events(false);
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
}

/// Open the calibrate overlay. Must run on the UI thread, and only AFTER the IPC
/// invoke has returned — creating a webview while JS awaits this command deadlocks.
fn open_calibrate_overlay(app: &AppHandle) {
    crate::app_log::early_line("input_aim", "calibrate_open_start");
    close_overlay_window_only(app);
    hide_main_for_calibrate(app);

    let win = match WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::App("input-aim-calibrate.html".into()),
    )
    .title("")
    .inner_size(1280.0, 800.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .build()
    {
        Ok(w) => w,
        Err(err) => {
            restore_main_after_calibrate(app);
            crate::app_log::early_line(
                "input_aim",
                &format!("calibrate_open_fail err={err}"),
            );
            return;
        }
    };

    let _ = crate::overlay_window::configure_transparent_overlay(&win);
    cover_primary_monitor(&win);
    let _ = win.show();
    assert_overlay_on_top(&win);

    let win2 = win.clone();
    let _ = std::thread::Builder::new()
        .name("aim-cal-ontop".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_millis(120));
            assert_overlay_on_top(&win2);
            std::thread::sleep(Duration::from_millis(180));
            assert_overlay_on_top(&win2);
        });

    crate::app_log::early_line("input_aim", "calibrate_open_ok");
}

/// Queue overlay open: return immediately so JS unblocks, then create window on UI thread.
#[tauri::command]
pub fn cmd_input_aim_calibrate_begin(
    app: AppHandle,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    if tid.is_empty() {
        return Err("need_app_target".into());
    }
    if crate::app_chat_workflow::profile_for(&tid).is_none() {
        return Err("unknown_app".into());
    }

    set_pending(&tid);
    crate::app_log::early_line("input_aim", &format!("calibrate_begin_queued app={tid}"));

    let app_bg = app.clone();
    let tid_bg = tid.clone();
    let _ = std::thread::Builder::new()
        .name("aim-cal-begin".into())
        .spawn(move || {
            // Bring target forward off the IPC path (may sleep / launch).
            if let Err(err) = crate::app_chat_workflow::prepare_target_for_calibrate(&tid_bg) {
                crate::app_log::early_line(
                    "input_aim",
                    &format!("calibrate_prepare_warn app={tid_bg} err={err}"),
                );
            }
            // Let the invoke return + JS resume before touching WebView creation.
            std::thread::sleep(Duration::from_millis(60));
            let app_ui = app_bg.clone();
            let _ = app_bg.run_on_main_thread(move || {
                open_calibrate_overlay(&app_ui);
            });
        });

    Ok(serde_json::json!({
        "ok": true,
        "queued": true,
        "appTargetId": tid
    }))
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_commit(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] screenX: Option<i32>,
    screen_x: Option<i32>,
    #[allow(non_snake_case)] screenY: Option<i32>,
    screen_y: Option<i32>,
) -> Result<serde_json::Value, String> {
    let tid = take_pending();
    if tid.is_empty() {
        return Err("no_pending".into());
    }
    let sx = screen_x.or(screenX).ok_or("need_screen_x")?;
    let sy = screen_y.or(screenY).ok_or("need_screen_y")?;
    let (x, y) = crate::app_chat_workflow::screen_point_to_client_ratio(&tid, sx, sy)?;
    let anchor = ComposerAnchor { x, y }.clamped();

    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end
            .composer_anchors
            .insert(tid.clone(), anchor);
        persist_voice_cfg(&cfg)?;
    }

    close_overlay(&app);
    crate::app_log::early_line(
        "input_aim",
        &format!("calibrate_commit app={tid} x={:.3} y={:.3}", anchor.x, anchor.y),
    );

    Ok(serde_json::json!({
        "ok": true,
        "appTargetId": tid,
        "x": anchor.x,
        "y": anchor.y
    }))
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_cancel(app: AppHandle) -> Result<serde_json::Value, String> {
    set_pending("");
    close_overlay(&app);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_clear(
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    if tid.is_empty() {
        return Err("need_app_target".into());
    }
    let mut cfg = state.cfg.lock();
    cfg.voice_end.composer_anchors.remove(&tid);
    persist_voice_cfg(&cfg)?;
    Ok(serde_json::json!({ "ok": true, "appTargetId": tid }))
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_status(
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
) -> serde_json::Value {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    let cfg = state.cfg.lock();
    let hit = cfg.voice_end.composer_anchors.get(&tid);
    serde_json::json!({
        "appTargetId": tid,
        "calibrated": hit.is_some(),
        "x": hit.map(|a| a.x),
        "y": hit.map(|a| a.y)
    })
}

fn persist_voice_cfg(cfg: &VoiceConfig) -> Result<(), String> {
    crate::config::save_config(cfg);
    Ok(())
}
