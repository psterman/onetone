use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::config::{mapping_is_complete, MappingEntry, TriggerMode, VoiceConfig};
use crate::ipc;
use crate::AppState;

pub const TRAY_ID: &str = "onetone-tray";
const TRAY_MENU_LABEL: &str = "tray_menu";
const BLUR_GUARD_MS: u64 = 280;
const TRAY_OPEN_DEBOUNCE_MS: u64 = 220;

static TRAY_MENU_SHOWN_AT: AtomicU64 = AtomicU64::new(0);
static TRAY_MENU_OPEN_AT: AtomicU64 = AtomicU64::new(0);

fn tray_icon() -> tauri::Result<Image<'static>> {
    // 32px tray asset — crisp at 100%/125% DPI; OS scales down instead of up.
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

/// Sync tray hover text with listen / voice state.
pub fn refresh_tray_tooltip(app: &AppHandle, state: &AppState) {
    let paused = *state.paused.lock();
    let cfg = state.cfg.lock();
    let voice_on = cfg.voice_vosk.enabled || cfg.voice_sapi.enabled;
    let tip = if paused {
        "一声 · 已暂停（按键与语音均不响应，已释放语音占用）"
    } else if voice_on {
        "一声 · 监听中（按键 + 语音唤醒）"
    } else {
        "一声 · 仅按键（语音已关，省内存）"
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tip));
    }
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

    let active_mapping = tray_active_mapping(&cfg);
    let active_mode = active_mapping
        .map(|m| m.trigger_mode)
        .unwrap_or(TriggerMode::Tap);
    let trigger_key_label = active_mapping
        .map(|m| tray_friendly_key(&m.trigger_key))
        .unwrap_or_else(|| "—".into());
    let active_scheme_label = active_mapping
        .map(|m| m.display_label())
        .unwrap_or_else(|| "—".into());
    let trigger_mode_label = tray_mode_label(active_mode).to_string();

    let active_scheme_id = cfg.active_scene_id.clone();

    let schemes: Vec<serde_json::Value> = cfg
        .mappings
        .iter()
        .filter(|m| mapping_is_complete(m))
        .map(|m| {
            serde_json::json!({
                "id": m.id,
                "label": m.display_label(),
                "active": m.id == active_scheme_id,
            })
        })
        .collect();

    let complete_count = schemes.len();

    let voice_engine = tray_voice_engine(&cfg);
    let (voice_state, voice_error) = tray_voice_state_and_error(state, voice_engine);
    let engine_label = tray_engine_label(voice_engine);
    let mic_label = tray_mic_label();
    let (status_title, status_badge, status_tone) =
        tray_status_card(paused, voice_engine, &voice_state, &voice_error);

    let payload = serde_json::json!({
        "paused": paused,
        "activeMode": mode_id(active_mode),
        "triggerKeyLabel": trigger_key_label,
        "triggerModeLabel": trigger_mode_label,
        "activeSchemeLabel": active_scheme_label,
        "engineLabel": engine_label,
        "micLabel": mic_label,
        "statusTitle": status_title,
        "statusBadge": status_badge,
        "statusTone": status_tone,
        "modes": [
            {"id": "perpress", "label": "每按即发"},
            {"id": "tap", "label": "智能连按"},
        ],
        "schemes": schemes,
        "canCycle": complete_count > 1,
        "voiceEngine": voice_engine,
        "voiceState": voice_state,
        "voiceError": voice_error,
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

    match action {
        "show" => show_main_window(app),
        "listen_toggle" => {
            if *state.paused.lock() {
                ipc::resume_listen(state, app);
            } else {
                ipc::pause_listen(state, app);
            }
        }
        "cycle_scheme" => ipc::handle_scheme_cycle(state, app),
        "set_mode" => {
            let mode_key = payload
                .as_ref()
                .and_then(|p| p.get("mode"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if let Some(mode) = parse_mode_id(mode_key) {
                ipc::set_active_trigger_mode(state, app, mode);
            }
        }
        "select_scheme" => {
            let mapping_id = payload
                .as_ref()
                .and_then(|p| p.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !mapping_id.is_empty() {
                ipc::handle_scheme_select(state, app, mapping_id);
            }
        }
        "test_trigger" => {
            let mapping_id = tray_active_mapping_id(state);
            let _ = ipc::perform_test_send(state, app, mapping_id, None);
        }
        "quit" => exit_app(app),
        _ => {}
    }
}

fn exit_app(app: &AppHandle) {
    crate::graceful_exit(app);
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
    let can_cycle = scheme_count > 1;
    let main_rows = 8 + usize::from(can_cycle);
    let scheme_rows = 3 + scheme_count.max(1) + usize::from(can_cycle) + 1;
    let mode_rows = 7;
    let item_rows = main_rows.max(scheme_rows).max(mode_rows);
    let height = 16.0 + 12.0 + 88.0 + item_rows as f64 * 34.0 + 44.0 + 16.0;
    (328.0, height)
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
        crate::window_layout::ensure_on_screen(&window);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            crate::app_log::log_line(state.inner(), "window", "main window shown");
        }
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

fn tray_voice_engine(cfg: &VoiceConfig) -> &'static str {
    if cfg.voice_vosk.enabled {
        "vosk"
    } else if cfg.voice_sapi.enabled {
        "sapi"
    } else if cfg.voice_kws.enabled {
        "kws"
    } else {
        "off"
    }
}

fn tray_voice_state_and_error(state: &AppState, engine: &str) -> (String, String) {
    match engine {
        "vosk" => (
            state.voice_vosk_state.lock().clone(),
            state.voice_vosk_last_error.lock().clone(),
        ),
        "sapi" => (
            state.voice_sapi_state.lock().clone(),
            state.voice_sapi_last_error.lock().clone(),
        ),
        "kws" => (
            state.voice_kws_state.lock().clone(),
            state.voice_kws_last_error.lock().clone(),
        ),
        _ => ("off".into(), String::new()),
    }
}

fn mode_id(mode: TriggerMode) -> &'static str {
    match mode {
        TriggerMode::Tap => "tap",
        TriggerMode::PerPress => "perpress",
        TriggerMode::LongPress => "longpress",
        TriggerMode::Double => "double",
    }
}

fn parse_mode_id(raw: &str) -> Option<TriggerMode> {
    match raw {
        "tap" | "toggle" => Some(TriggerMode::Tap),
        "perpress" | "hold" => Some(TriggerMode::PerPress),
        "longpress" | "long_press" => Some(TriggerMode::LongPress),
        "double" | "doubleclick" => Some(TriggerMode::Double),
        _ => None,
    }
}

fn tray_active_mapping<'a>(cfg: &'a VoiceConfig) -> Option<&'a MappingEntry> {
    if !cfg.active_scene_id.is_empty() {
        if let Some(m) = cfg.find_mapping_by_id(&cfg.active_scene_id) {
            if mapping_is_complete(m) {
                return Some(m);
            }
        }
    }
    cfg.mappings
        .iter()
        .find(|m| m.enabled && mapping_is_complete(m))
        .or_else(|| cfg.mappings.iter().find(|m| mapping_is_complete(m)))
}

fn tray_active_mapping_id(state: &AppState) -> Option<String> {
    let cfg = state.cfg.lock();
    tray_active_mapping(&cfg).map(|m| m.id.clone())
}

fn tray_friendly_key(key: &str) -> String {
    let k = key.trim();
    match k {
        "Volume_Down" | "VolumeDown" => "音量键".into(),
        "Volume_Up" | "VolumeUp" => "音量+".into(),
        "Volume_Mute" | "VolumeMute" => "静音键".into(),
        "AutoTrigger" => "自动".into(),
        "RAlt" | "Right Alt" | "RALT" => "右 Alt".into(),
        "LAlt" | "Left Alt" | "LALT" => "左 Alt".into(),
        "RCtrl" | "Right Ctrl" => "右 Ctrl".into(),
        "LCtrl" | "Left Ctrl" => "左 Ctrl".into(),
        "RShift" | "Right Shift" => "右 Shift".into(),
        "LShift" | "Left Shift" => "左 Shift".into(),
        _ => k.replace('_', " "),
    }
}

fn tray_mode_label(mode: TriggerMode) -> &'static str {
    match mode {
        TriggerMode::Tap => "智能连按",
        TriggerMode::PerPress => "每按即发",
        TriggerMode::LongPress => "长按",
        TriggerMode::Double => "双击",
    }
}

fn tray_engine_label(engine: &str) -> &'static str {
    match engine {
        "vosk" => "Vosk",
        "sapi" => "SAPI",
        _ => "关闭",
    }
}

fn tray_mic_label() -> String {
    #[cfg(windows)]
    {
        if let Ok(devices) = crate::audio_win::list_input_devices() {
            if let Some(d) = devices.iter().find(|d| d.is_default) {
                return truncate_label(&d.name, 18);
            }
            if let Some(d) = devices.first() {
                return truncate_label(&d.name, 18);
            }
        }
    }
    "默认".into()
}

fn truncate_label(s: &str, max_chars: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max_chars {
        return t.to_string();
    }
    t.chars()
        .take(max_chars.saturating_sub(1))
        .collect::<String>()
        + "…"
}

fn tray_status_card(
    paused: bool,
    engine: &str,
    voice_state: &str,
    voice_error: &str,
) -> (String, String, &'static str) {
    if paused {
        return ("已暂停".into(), "暂停".into(), "paused");
    }
    if engine == "off" {
        return ("仅按键".into(), "就绪".into(), "normal");
    }
    if voice_state == "error" || !voice_error.trim().is_empty() {
        return ("监听异常".into(), "出错".into(), "error");
    }
    match voice_state {
        "starting" | "stopping" => ("启动中".into(), "启动中".into(), "normal"),
        "listening" | "cooldown" | "triggered" => ("监听中".into(), "就绪".into(), "normal"),
        "stopped" => ("语音已停止".into(), "停止".into(), "normal"),
        _ => ("监听中".into(), "就绪".into(), "normal"),
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
