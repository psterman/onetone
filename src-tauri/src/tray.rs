use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::config::{mapping_is_complete, TriggerMode};
use crate::ipc;
use crate::AppState;

pub const TRAY_ID: &str = "onetone-tray";
const TRAY_MENU_LABEL: &str = "tray_menu";
const BLUR_GUARD_MS: u64 = 280;
const TRAY_OPEN_DEBOUNCE_MS: u64 = 220;

static TRAY_MENU_SHOWN_AT: AtomicU64 = AtomicU64::new(0);
static TRAY_MENU_OPEN_AT: AtomicU64 = AtomicU64::new(0);

fn tray_icon() -> tauri::Result<Image<'static>> {
    let bytes = include_bytes!("../icons/tray-32.png");
    let img = image::load_from_memory(bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Image::new_owned(rgba.into_raw(), width, height))
}

pub fn setup(app: &AppHandle, state: Arc<AppState>) -> tauri::Result<()> {
    if let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) {
        configure_tray_menu_window(&menu_win)?;
        let app_for_blur = app.clone();
        menu_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if blur_guard_active() {
                    return;
                }
                hide_tray_menu(&app_for_blur);
            }
        });
    }

    let icon = tray_icon()?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("一声")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    ..
                } => {
                    if should_open_tray_menu() {
                        show_tray_menu(app);
                    }
                }
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    hide_tray_menu(app);
                    show_main_window(app);
                }
                _ => {}
            }
        })
        .build(app)?;

    let _ = state;
    Ok(())
}

fn configure_tray_menu_window(menu_win: &WebviewWindow) -> tauri::Result<()> {
    menu_win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = menu_win.set_shadow(false);
    Ok(())
}

pub fn refresh_menu(app: &AppHandle) {
    let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return;
    };
    if !menu_win.is_visible().unwrap_or(false) {
        return;
    }
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };
    let (cx, cy) = cursor_physical_position();
    open_tray_menu(&menu_win, state.inner(), cx, cy);
}

pub fn tray_menu_init_json(state: &AppState) -> String {
    let cfg = state.cfg.lock().clone();
    let paused = *state.paused.lock();
    let listen_label = if paused {
        "恢复监听（一声已暂停）"
    } else {
        "暂停监听"
    };

    let active_mode = cfg
        .active_mappings()
        .first()
        .map(|m| m.trigger_mode)
        .unwrap_or(TriggerMode::Tap);

    let schemes: Vec<serde_json::Value> = cfg
        .mappings
        .iter()
        .filter(|m| mapping_is_complete(m))
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "label": m.display_label(),
                "enabled": m.enabled,
            })
        })
        .collect();

    let complete_count = schemes.len();
    let payload = serde_json::json!({
        "paused": paused,
        "listenLabel": listen_label,
        "activeMode": mode_id(active_mode),
        "modes": [
            {"id": "hold", "label": "每按即发"},
            {"id": "tap", "label": "智能连按"},
        ],
        "schemes": schemes,
        "canCycle": complete_count > 1,
    });
    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into())
}

pub fn present_tray_menu(
    menu_win: &WebviewWindow,
    width: f64,
    height: f64,
    cursor_x: i32,
    cursor_y: i32,
) -> tauri::Result<()> {
    let w = width.max(220.0);
    let h = height.max(160.0);
    menu_win.set_size(Size::Logical(LogicalSize::new(w, h)))?;

    let pos = compute_tray_menu_position(menu_win, cursor_x, cursor_y, w, h);
    menu_win.set_position(Position::Physical(pos))?;
    mark_tray_menu_shown();
    menu_win.show()?;
    menu_win.set_focus()?;
    Ok(())
}

pub fn handle_tray_action(
    app: &AppHandle,
    state: &Arc<AppState>,
    action: &str,
    payload: Option<serde_json::Value>,
) {
    hide_tray_menu(app);

    let Some(window) = app.get_webview_window("main") else {
        if action == "quit" {
            app.exit(0);
        }
        return;
    };

    match action {
        "show" => show_main_window(app),
        "listen_toggle" => {
            if *state.paused.lock() {
                ipc::resume_listen(state, &window);
            } else {
                ipc::pause_listen(state, &window);
            }
        }
        "cycle_scheme" => ipc::handle_scheme_cycle(state, &window),
        "set_mode" => {
            let mode_key = payload
                .as_ref()
                .and_then(|p| p.get("mode"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if let Some(mode) = parse_mode_id(mode_key) {
                ipc::set_active_trigger_mode(state, &window, mode);
            }
        }
        "select_scheme" => {
            let mapping_id = payload
                .as_ref()
                .and_then(|p| p.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !mapping_id.is_empty() {
                ipc::handle_scheme_select(state, &window, mapping_id);
            }
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn show_tray_menu(app: &AppHandle) {
    let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return;
    };
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };

    let (cx, cy) = cursor_physical_position();
    open_tray_menu(&menu_win, state.inner(), cx, cy);
}

fn open_tray_menu(menu_win: &WebviewWindow, state: &AppState, cursor_x: i32, cursor_y: i32) {
    let (w, h) = estimate_menu_size(state);
    if present_tray_menu(menu_win, w, h, cursor_x, cursor_y).is_err() {
        return;
    }

    let json = tray_menu_init_json(state);
    let script = format!("window.__tray_init__({json});");
    if menu_win.eval(&script).is_err() {
        let win = menu_win.clone();
        let json_retry = json.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = win.eval(&format!("window.__tray_init__({json_retry});"));
        });
    }
}

fn estimate_menu_size(state: &AppState) -> (f64, f64) {
    let cfg = state.cfg.lock();
    let scheme_count = cfg
        .mappings
        .iter()
        .filter(|m| mapping_is_complete(m))
        .count();
    let scheme_rows = if scheme_count == 0 {
        1
    } else {
        scheme_count + usize::from(scheme_count > 1)
    };
    let item_rows = 2 + 3 + scheme_rows + 1;
    let height = 16.0 + 12.0 + item_rows as f64 * 36.0 + 44.0 + 55.0;
    (264.0, height)
}

fn hide_tray_menu(app: &AppHandle) {
    if blur_guard_active() {
        return;
    }
    if let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = menu_win.hide();
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn mark_tray_menu_shown() {
    TRAY_MENU_SHOWN_AT.store(now_millis(), Ordering::SeqCst);
}

fn blur_guard_active() -> bool {
    let shown = TRAY_MENU_SHOWN_AT.load(Ordering::SeqCst);
    if shown == 0 {
        return false;
    }
    now_millis().saturating_sub(shown) < BLUR_GUARD_MS
}

fn should_open_tray_menu() -> bool {
    let now = now_millis();
    let last = TRAY_MENU_OPEN_AT.load(Ordering::SeqCst);
    if now.saturating_sub(last) < TRAY_OPEN_DEBOUNCE_MS {
        return false;
    }
    TRAY_MENU_OPEN_AT.store(now, Ordering::SeqCst);
    true
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn compute_tray_menu_position(
    menu_win: &WebviewWindow,
    cursor_x: i32,
    cursor_y: i32,
    width_logical: f64,
    height_logical: f64,
) -> PhysicalPosition<i32> {
    let scale = menu_win.scale_factor().unwrap_or(1.0);
    let menu_w = (width_logical * scale).round() as i32;
    let menu_h = (height_logical * scale).round() as i32;

    let monitor = menu_win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| menu_win.primary_monitor().ok().flatten());

    let (work_x, work_y, work_right, work_bottom) = if let Some(m) = monitor {
        let pos = m.position();
        let size = m.size();
        (
            pos.x,
            pos.y,
            pos.x + size.width as i32,
            pos.y + size.height as i32,
        )
    } else {
        (0, 0, 1920, 1080)
    };

    let margin = (8.0 * scale).round() as i32;
    let mut x = cursor_x - menu_w + margin;
    let mut y = cursor_y - menu_h - margin;

    if y < work_y + margin {
        y = cursor_y + margin;
    }
    if y + menu_h > work_bottom - margin {
        y = work_bottom - menu_h - margin;
    }

    x = x.max(work_x + margin).min(work_right - menu_w - margin);
    y = y.max(work_y + margin).min(work_bottom - menu_h - margin);

    PhysicalPosition::new(x, y)
}

fn mode_id(mode: TriggerMode) -> &'static str {
    match mode {
        TriggerMode::Tap | TriggerMode::Toggle => "tap",
        TriggerMode::Hold => "hold",
        TriggerMode::LongPress => "longpress",
        TriggerMode::Double => "double",
    }
}

fn parse_mode_id(raw: &str) -> Option<TriggerMode> {
    match raw {
        "tap" | "toggle" => Some(TriggerMode::Tap),
        "hold" => Some(TriggerMode::Hold),
        "longpress" | "long_press" => Some(TriggerMode::LongPress),
        "double" | "doubleclick" => Some(TriggerMode::Double),
        _ => None,
    }
}

#[cfg(windows)]
fn cursor_physical_position() -> (i32, i32) {
    use winapi::shared::windef::POINT;
    use winapi::um::winuser::GetCursorPos;
    unsafe {
        let mut pt = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pt);
        (pt.x, pt.y)
    }
}

#[cfg(not(windows))]
fn cursor_physical_position() -> (i32, i32) {
    (100, 100)
}
