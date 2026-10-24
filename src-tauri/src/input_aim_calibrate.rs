//! Scheme-B input aim calibrate: coarse marquee → fine click → store client ratios.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
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

/// Homepage / oral single-point memory uses the active slot.
/// IDE Agent apps default to slot 1 (右下); chat apps to slot 0 (中间).
pub fn default_calibrate_slot(tid: &str, cfg: &VoiceConfig) -> usize {
    let tid = tid.trim();
    if let Some(a) = cfg.voice_end.composer_anchors.get(tid) {
        return a.active.min(ComposerAnchor::MAX_SLOTS.saturating_sub(1));
    }
    if tid == crate::app_chat_workflow::CURSOR_APP_TARGET_ID
        || tid == crate::app_chat_workflow::TRAE_CODE_APP_TARGET_ID
        || tid == crate::app_chat_workflow::QODER_APP_TARGET_ID
    {
        1
    } else {
        0
    }
}

pub fn has_active_composer(cfg: &VoiceConfig, app_target_id: &str) -> bool {
    cfg.voice_end
        .composer_anchors
        .get(app_target_id.trim())
        .and_then(|a| a.active_point())
        .is_some()
}

/// Shared ensure: if the app already has an active memory point, return it;
/// otherwise open calibrate for the home/default slot (unless `force` re-records).
/// Oral arm + homepage handoff both call this — one store, no conflict.
pub fn ensure_composer_aim(
    app: &AppHandle,
    state: &AppState,
    app_target_id: &str,
    force: bool,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id.trim().to_string();
    if tid.is_empty() {
        return Err("need_app_target".into());
    }
    if crate::app_chat_workflow::profile_for(&tid).is_none() {
        return Err("unknown_app".into());
    }
    let (has_active, slot, status) = {
        let cfg = state.cfg.lock();
        let hit = cfg.voice_end.composer_anchors.get(&tid);
        let has = hit.and_then(|a| a.active_point()).is_some();
        let slot = default_calibrate_slot(&tid, &cfg);
        (has, slot, status_payload(&tid, hit))
    };
    if has_active && !force {
        let mut out = status;
        out["ok"] = serde_json::json!(true);
        out["needCalibrate"] = serde_json::json!(false);
        out["hasActive"] = serde_json::json!(true);
        out["slot"] = serde_json::json!(slot);
        return Ok(out);
    }
    if !queue_begin_for_app(app, &tid, slot) {
        return Err("unknown_app".into());
    }
    let mut out = status;
    out["ok"] = serde_json::json!(true);
    out["needCalibrate"] = serde_json::json!(true);
    out["queued"] = serde_json::json!(true);
    out["hasActive"] = serde_json::json!(has_active);
    out["slot"] = serde_json::json!(slot);
    out["force"] = serde_json::json!(force);
    crate::app_log::early_line(
        "input_aim",
        &format!(
            "ensure_composer_aim app={tid} slot={slot} force={force} had_active={has_active}"
        ),
    );
    Ok(out)
}

/// Queue scheme-B calibrate for an app (oral first-use / settings). Returns immediately.
pub fn queue_begin_for_app(app: &AppHandle, app_target_id: &str, slot: usize) -> bool {
    let tid = app_target_id.trim();
    if tid.is_empty() || crate::app_chat_workflow::profile_for(tid).is_none() {
        return false;
    }
    let slot = slot.min(ComposerAnchor::MAX_SLOTS.saturating_sub(1));
    set_pending(tid, slot);
    crate::app_log::early_line(
        "input_aim",
        &format!("calibrate_begin_queued app={tid} slot={slot}"),
    );
    let app_bg = app.clone();
    let tid_bg = tid.to_string();
    let _ = std::thread::Builder::new()
        .name("aim-cal-begin".into())
        .spawn(move || {
            if let Err(err) = crate::app_chat_workflow::prepare_target_for_calibrate(&tid_bg) {
                crate::app_log::early_line(
                    "input_aim",
                    &format!("calibrate_prepare_warn app={tid_bg} err={err}"),
                );
            }
            std::thread::sleep(Duration::from_millis(60));
            let app_ui = app_bg.clone();
            let _ = app_bg.run_on_main_thread(move || {
                open_calibrate_overlay(&app_ui);
            });
        });
    true
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
        // Never force Soft Pad interactive — that left a click-blocking slab on Cursor
        // after calibrate. Respect last click-through; recording always punches through.
        let pass = crate::codex_micro_overlay::soft_pad_click_through();
        let _ = pad.set_ignore_cursor_events(pass);
        if pass {
            crate::codex_micro_overlay::set_overlay_click_through(true);
        }
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

/// Drop fullscreen calibrate cover (Cursor monitor) when key capture starts.
pub fn abort_if_open(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_none() {
        return;
    }
    close_overlay(app);
    crate::app_log::early_line("input_aim", "calibrate_abort_for_recording");
}

/// Cover the full virtual desktop so multi-monitor targets stay clickable.
/// Returns (desk, active_monitor) for Esc/tip chrome (never the gap between screens).
fn cover_target_monitor(
    win: &WebviewWindow,
) -> Option<((i32, i32, u32, u32), (i32, i32, u32, u32))> {
    let monitors: Vec<tauri::Monitor> = win.available_monitors().ok().unwrap_or_default();
    let desk = virtual_desktop_union(&monitors).or_else(|| {
        win.primary_monitor()
            .ok()
            .flatten()
            .map(|m| monitor_rect(&m))
    });
    let Some(desk) = desk else {
        #[cfg(windows)]
        {
            use winapi::um::winuser::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
            let w = unsafe { GetSystemMetrics(SM_CXSCREEN) }.max(800) as u32;
            let h = unsafe { GetSystemMetrics(SM_CYSCREEN) }.max(600) as u32;
            let _ = win.set_size(Size::Physical(PhysicalSize::new(w, h)));
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(0, 0)));
        }
        return None;
    };

    let _ = win.set_size(Size::Physical(PhysicalSize::new(desk.2, desk.3)));
    let _ = win.set_position(Position::Physical(PhysicalPosition::new(desk.0, desk.1)));

    let active = monitor_for_point(&monitors, foreground_window_center())
        .or_else(|| monitor_for_point(&monitors, cursor_pos()))
        .map(|m| monitor_rect(&m))
        .unwrap_or(desk);

    inject_active_monitor_chrome(win, desk, active);

    crate::app_log::early_line(
        "input_aim",
        &format!(
            "calibrate_cover_virtual_desktop x={} y={} w={} h={} active=({},{} {}x{})",
            desk.0, desk.1, desk.2, desk.3, active.0, active.1, active.2, active.3
        ),
    );
    Some((desk, active))
}

/// (x, y, w, h) in virtual-desktop physical pixels.
fn monitor_rect(m: &tauri::Monitor) -> (i32, i32, u32, u32) {
    let pos = m.position();
    let size = m.size();
    (pos.x, pos.y, size.width, size.height)
}

fn virtual_desktop_union(monitors: &[tauri::Monitor]) -> Option<(i32, i32, u32, u32)> {
    if monitors.is_empty() {
        return None;
    }
    let mut left = i32::MAX;
    let mut top = i32::MAX;
    let mut right = i32::MIN;
    let mut bottom = i32::MIN;
    for m in monitors {
        let (x, y, w, h) = monitor_rect(m);
        left = left.min(x);
        top = top.min(y);
        right = right.max(x + w as i32);
        bottom = bottom.max(y + h as i32);
    }
    if right <= left || bottom <= top {
        return None;
    }
    Some((left, top, (right - left) as u32, (bottom - top) as u32))
}

fn monitor_for_point(
    monitors: &[tauri::Monitor],
    pt: Option<(i32, i32)>,
) -> Option<&tauri::Monitor> {
    let (cx, cy) = pt?;
    for m in monitors {
        let (x, y, w, h) = monitor_rect(m);
        if cx >= x && cy >= y && cx < x + w as i32 && cy < y + h as i32 {
            return Some(m);
        }
    }
    None
}

fn inject_active_monitor_chrome(
    win: &WebviewWindow,
    desk: (i32, i32, u32, u32),
    active: (i32, i32, u32, u32),
) {
    let js = format!(
        "window.__OT_AIM_DESK__={{x:{dx},y:{dy},w:{dw},h:{dh}}};\
         window.__OT_AIM_ACTIVE__={{x:{ax},y:{ay},w:{aw},h:{ah}}};\
         try{{window.__OT_AIM_PLACE_CHROME__&&window.__OT_AIM_PLACE_CHROME__();}}catch(e){{}}",
        dx = desk.0,
        dy = desk.1,
        dw = desk.2,
        dh = desk.3,
        ax = active.0,
        ay = active.1,
        aw = active.2,
        ah = active.3
    );
    let _ = win.eval(&js);
}

#[cfg(windows)]
fn foreground_window_center() -> Option<(i32, i32)> {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{GetForegroundWindow, GetWindowRect};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return None;
        }
        Some((
            (rect.left + rect.right) / 2,
            (rect.top + rect.bottom) / 2,
        ))
    }
}

#[cfg(not(windows))]
fn foreground_window_center() -> Option<(i32, i32)> {
    None
}

#[cfg(windows)]
fn cursor_pos() -> Option<(i32, i32)> {
    use winapi::shared::windef::POINT;
    use winapi::um::winuser::GetCursorPos;
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) == 0 {
            return None;
        }
        Some((pt.x, pt.y))
    }
}

#[cfg(not(windows))]
fn cursor_pos() -> Option<(i32, i32)> {
    None
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
            crate::app_log::early_line("input_aim", &format!("calibrate_open_fail err={err}"));
            return;
        }
    };

    let _ = crate::overlay_window::configure_transparent_overlay(&win);
    let chrome = cover_target_monitor(&win);
    let _ = win.show();
    assert_overlay_on_top(&win);
    // Re-inject after first paint — early eval can race the document load.
    if let Some((desk, active)) = chrome {
        inject_active_monitor_chrome(&win, desk, active);
    }

    let win2 = win.clone();
    let chrome2 = chrome;
    let _ = std::thread::Builder::new()
        .name("aim-cal-ontop".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_millis(120));
            assert_overlay_on_top(&win2);
            if let Some((desk, active)) = chrome2 {
                inject_active_monitor_chrome(&win2, desk, active);
            }
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

    // Slot 0 = 中间 (chat), slot 1 = 右下 (IDE Agent). Home/oral share this default.
    let slot = {
        let cfg = state.cfg.lock();
        slot.unwrap_or_else(|| default_calibrate_slot(&tid, &cfg))
            .min(ComposerAnchor::MAX_SLOTS.saturating_sub(1))
    };

    if !queue_begin_for_app(&app, &tid, slot) {
        return Err("unknown_app".into());
    }

    Ok(serde_json::json!({
        "ok": true,
        "queued": true,
        "appTargetId": tid,
        "slot": slot
    }))
}

/// Homepage / oral: ensure one active memory point (inherit if set; else open calibrate).
#[tauri::command]
pub fn cmd_input_aim_ensure(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    #[allow(non_snake_case)] appTargetId: Option<String>,
    app_target_id: Option<String>,
    force: Option<bool>,
) -> Result<serde_json::Value, String> {
    let tid = app_target_id
        .or(appTargetId)
        .unwrap_or_default()
        .trim()
        .to_string();
    ensure_composer_aim(&app, state.inner(), &tid, force.unwrap_or(false))
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
    // Cursor Agent is on the right — refuse left/center marks (those are the code editor).
    if tid == crate::app_chat_workflow::CURSOR_APP_TARGET_ID
        && x < crate::app_chat_workflow::CURSOR_AGENT_MIN_X_RATIO
    {
        return Err(format!(
            "cursor_anchor_too_left x={x:.3} — 请圈选右侧 Agent 输入框，不要圈中间代码区"
        ));
    }
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

    // Oral listen may have opened calibrate as first-use init — lock caret now.
    crate::voice_command_session::clear_need_composer_aim();
    if crate::voice_command_session::is_armed() {
        let duration_ms = state.cfg.lock().key_press_duration_ms;
        let app_h = app.clone();
        let tid_h = tid.clone();
        let _ = std::thread::Builder::new()
            .name("oral-aim-focus".into())
            .spawn(move || {
                let _pad = crate::codex_micro_overlay::SoftPadSendPassGuard::engage(&app_h);
                let _ =
                    crate::app_chat_workflow::focus_composer_for_send(&app_h, &tid_h, duration_ms);
            });
    }

    let payload = status_payload(&tid, Some(&bank));
    let _ = crate::ipc::emit_to_main_if_available(&app, Some(state.inner().as_ref()), {
        let mut p = payload.clone();
        p["type"] = serde_json::json!("input_aim_calibrated");
        p["ok"] = serde_json::json!(true);
        p
    });

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
    let _ = crate::ipc::emit_to_main_if_available(&app, Some(state.inner().as_ref()), {
        let mut p = payload.clone();
        p["type"] = serde_json::json!("input_aim_calibrated");
        p["ok"] = serde_json::json!(true);
        p
    });
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
    let _ = crate::ipc::emit_to_main_if_available(&app, Some(state.inner().as_ref()), {
        let mut p = payload.clone();
        p["type"] = serde_json::json!("input_aim_calibrated");
        p["ok"] = serde_json::json!(true);
        p
    });
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
    let (cx, cy) = crate::app_chat_workflow::LAYOUT_CENTER;
    let (rx, ry) = crate::app_chat_workflow::LAYOUT_BOTTOM_RIGHT;
    serde_json::json!({
        "appTargetId": tid,
        // any_set: voice dual-slot UI; hasActive: homepage single-point memory.
        "calibrated": bank.any_set(),
        "hasActive": active_pt.is_some(),
        "active": bank.active,
        "slots": slots,
        "x": active_pt.map(|p| p.x),
        "y": active_pt.map(|p| p.y),
        // Recommended zones for basic calibrate (slot0 中间 / slot1 右下).
        "presets": [
            { "slot": 0, "label": "center", "x": cx, "y": cy },
            { "slot": 1, "label": "bottomRight", "x": rx, "y": ry }
        ]
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
