//! Scheme-B input aim calibrate: coarse marquee → fine click → store client ratios.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

use crate::config::{ComposerAnchor, ComposerPoint, VoiceConfig};
use crate::AppState;

const LABEL: &str = "input_aim_calibrate";

static PENDING_APP: Mutex<String> = Mutex::new(String::new());
static PENDING_SLOT: Mutex<usize> = Mutex::new(0);
static HID_MAIN: Mutex<bool> = Mutex::new(false);

fn set_pending(app_target_id: &str, slot: usize) {
    if let Ok(mut g) = PENDING_APP.lock() {
        *g = app_target_id.trim().to_string();
    }
    if let Ok(mut g) = PENDING_SLOT.lock() {
        *g = slot.min(ComposerAnchor::MAX_SLOTS.saturating_sub(1));
    }
}

fn take_pending() -> (String, usize) {
    let tid = PENDING_APP
        .lock()
        .map(|mut g| std::mem::take(&mut *g))
        .unwrap_or_default();
    let slot = PENDING_SLOT.lock().map(|g| *g).unwrap_or(0);
    (tid, slot)
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
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
    slot: Option<usize>,
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

    let slot = {
        let cfg = state.cfg.lock();
        slot.unwrap_or_else(|| {
            cfg.voice_end
                .composer_anchors
                .get(&tid)
                .map(|a| a.active)
                .unwrap_or(0)
        })
        .min(ComposerAnchor::MAX_SLOTS.saturating_sub(1))
    };

    set_pending(&tid, slot);
    crate::app_log::early_line(
        "input_aim",
        &format!("calibrate_begin_queued app={tid} slot={slot}"),
    );

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
        "appTargetId": tid,
        "slot": slot
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
    let (tid, slot) = take_pending();
    if tid.is_empty() {
        return Err("no_pending".into());
    }
    let sx = screen_x.or(screenX).ok_or("need_screen_x")?;
    let sy = screen_y.or(screenY).ok_or("need_screen_y")?;
    let (x, y) = crate::app_chat_workflow::screen_point_to_client_ratio(&tid, sx, sy)?;
    let point = ComposerPoint { x, y }.clamped();

    let bank = {
        let mut cfg = state.cfg.lock();
        let mut bank = cfg
            .voice_end
            .composer_anchors
            .remove(&tid)
            .unwrap_or_default();
        bank.normalize();
        bank.set_slot(slot, point);
        cfg.voice_end
            .composer_anchors
            .insert(tid.clone(), bank.clone());
        persist_voice_cfg(&cfg)?;
        bank
    };

    close_overlay(&app);
    crate::app_log::early_line(
        "input_aim",
        &format!(
            "calibrate_commit app={tid} slot={slot} x={:.3} y={:.3}",
            point.x, point.y
        ),
    );

    let payload = status_payload(&tid, Some(&bank));
    let _ = crate::ipc::emit_to_main_if_available(
        &app,
        Some(state.inner().as_ref()),
        {
            let mut p = payload.clone();
            p["type"] = serde_json::json!("input_aim_calibrated");
            p["ok"] = serde_json::json!(true);
            p
        },
    );

    Ok(payload)
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_cancel(app: AppHandle) -> Result<serde_json::Value, String> {
    set_pending("", 0);
    close_overlay(&app);
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_clear(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
    slot: Option<usize>,
    #[allow(non_snake_case)] clearAll: Option<bool>,
    clear_all: Option<bool>,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    if tid.is_empty() {
        return Err("need_app_target".into());
    }
    let wipe_all = clear_all.or(clearAll).unwrap_or(false);
    let bank = {
        let mut cfg = state.cfg.lock();
        if wipe_all {
            cfg.voice_end.composer_anchors.remove(&tid);
            persist_voice_cfg(&cfg)?;
            None
        } else {
            let mut bank = cfg
                .voice_end
                .composer_anchors
                .remove(&tid)
                .unwrap_or_default();
            bank.normalize();
            let idx = slot.unwrap_or(bank.active);
            bank.clear_slot(idx);
            if bank.is_empty() {
                persist_voice_cfg(&cfg)?;
                None
            } else {
                cfg.voice_end
                    .composer_anchors
                    .insert(tid.clone(), bank.clone());
                persist_voice_cfg(&cfg)?;
                Some(bank)
            }
        }
    };
    let payload = status_payload(&tid, bank.as_ref());
    let _ = crate::ipc::emit_to_main_if_available(
        &app,
        Some(state.inner().as_ref()),
        {
            let mut p = payload.clone();
            p["type"] = serde_json::json!("input_aim_calibrated");
            p["ok"] = serde_json::json!(true);
            p
        },
    );
    Ok(payload)
}

#[tauri::command]
pub fn cmd_input_aim_calibrate_set_active(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
    slot: Option<usize>,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    if tid.is_empty() {
        return Err("need_app_target".into());
    }
    let slot = slot.unwrap_or(0);
    let bank = {
        let mut cfg = state.cfg.lock();
        let mut bank = cfg
            .voice_end
            .composer_anchors
            .remove(&tid)
            .unwrap_or_default();
        bank.normalize();
        bank.set_active(slot);
        if bank.is_empty() {
            // Keep empty bank so active preference sticks until first calibrate.
            cfg.voice_end
                .composer_anchors
                .insert(tid.clone(), bank.clone());
        } else {
            cfg.voice_end
                .composer_anchors
                .insert(tid.clone(), bank.clone());
        }
        persist_voice_cfg(&cfg)?;
        bank
    };
    let payload = status_payload(&tid, Some(&bank));
    let _ = crate::ipc::emit_to_main_if_available(
        &app,
        Some(state.inner().as_ref()),
        {
            let mut p = payload.clone();
            p["type"] = serde_json::json!("input_aim_calibrated");
            p["ok"] = serde_json::json!(true);
            p
        },
    );
    Ok(payload)
}

fn status_payload(tid: &str, hit: Option<&ComposerAnchor>) -> serde_json::Value {
    let mut bank = hit.cloned().unwrap_or_default();
    bank.normalize();
    let slots: Vec<serde_json::Value> = bank
        .slots
        .iter()
        .map(|s| match s {
            Some(p) => serde_json::json!({ "x": p.x, "y": p.y, "set": true }),
            None => serde_json::json!({ "set": false }),
        })
        .collect();
    let active_pt = bank.active_point();
    serde_json::json!({
        "appTargetId": tid,
        "calibrated": bank.any_set(),
        "active": bank.active,
        "slots": slots,
        "x": active_pt.map(|p| p.x),
        "y": active_pt.map(|p| p.y)
    })
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
    status_payload(&tid, hit)
}

fn persist_voice_cfg(cfg: &VoiceConfig) -> Result<(), String> {
    crate::config::save_config(cfg);
    Ok(())
}
