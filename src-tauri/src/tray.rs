use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::audio_win::MicMuteState;
use crate::tray_agent_bridge::{read_tray_agent_visual, TrayAgentVisual};
use crate::tray_icon_render;
use crate::config::{mapping_is_complete, MappingEntry, TriggerMode, VoiceConfig};
use crate::ipc;
use crate::AppState;

pub const TRAY_ID: &str = "onetone-tray";
const TRAY_MENU_LABEL: &str = "tray_menu";
const BLUR_GUARD_MS: u64 = 280;
const TRAY_OPEN_DEBOUNCE_MS: u64 = 220;
const TRAY_VISUAL_DEBOUNCE_MS: u64 = 500;

static TRAY_MENU_SHOWN_AT: AtomicU64 = AtomicU64::new(0);
static TRAY_MENU_OPEN_AT: AtomicU64 = AtomicU64::new(0);
static TRAY_MENU_ANCHOR_X: AtomicI32 = AtomicI32::new(0);
static TRAY_MENU_ANCHOR_Y: AtomicI32 = AtomicI32::new(0);
static TRAY_VISUAL_REFRESH_AT: AtomicU64 = AtomicU64::new(0);
static LAST_TRAY_VISUAL_KEY: Mutex<Option<String>> = Mutex::new(None);
static TRAY_OPEN_FG: Mutex<Option<crate::app_identity::AppIdentity>> = Mutex::new(None);
static TRAY_MENU_DISMISS_GEN: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrayMicVisual {
    key: &'static str,
    muted: Option<bool>,
    status_label: String,
    device_label: String,
    available: bool,
    can_toggle: bool,
}

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
    // Drop any stale tray with the same id (force-killed previous process left a ghost icon).
    let _ = app.remove_tray_by_id(TRAY_ID);

    // tray_menu is lazy-created on first right-click (see show_tray_menu).

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
                    position,
                    rect,
                    ..
                } => {
                    if should_open_tray_menu() {
                        let anchor = tray_anchor_from_event(&position, &rect);
                        show_tray_menu(app, Some(anchor));
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

    start_tray_mic_poll(app.clone());
    preload_tray_menu_window(app.clone());
    // Do not refresh_tray_visual_forced here — WASAPI on the setup path 假死'd launch.
    // First paint comes from the poll thread after the event loop is up.

    let _ = state;
    Ok(())
}

/// Hidden preload so first right-click avoids cold webview creation.
fn preload_tray_menu_window(app: AppHandle) {
    std::thread::Builder::new()
        .name("tray-preload".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(400));
            let _ = crate::overlay_window::ensure_overlay_window(
                &app,
                crate::overlay_window::TRAY_MENU,
            );
        })
        .ok();
}

fn start_tray_mic_poll(app: AppHandle) {
    std::thread::Builder::new()
        .name("tray-mic-poll".into())
        .spawn(move || {
            // Defer first paint off tray setup — sync WASAPI enum on the UI thread used to 假死 launch.
            std::thread::sleep(std::time::Duration::from_millis(900));
            refresh_tray_icon_from_poll(&app, true);
            loop {
                std::thread::sleep(std::time::Duration::from_secs(60));
                refresh_tray_icon_from_poll(&app, false);
            }
        })
        .ok();
}

/// Refresh tray icon/tooltip/menu mic presentation (debounced unless forced).
/// Call from IPC / main thread only — must not use `run_on_main_thread` (deadlocks while JS awaits invoke).
pub fn refresh_tray_visual(app: &AppHandle, force: bool) {
    if !force && visual_debounce_active() {
        return;
    }
    mark_visual_refresh();
    refresh_tray_visual_on_main(app);
}

/// Background poll thread → schedule tray APIs on the UI thread.
fn refresh_tray_visual_from_poll(app: &AppHandle, force: bool) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        refresh_tray_visual(&app, force);
    });
}

fn refresh_tray_visual_on_main(app: &AppHandle) {
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        let (mic_key, agent_light) = resolve_tray_icon_inputs(state.inner());
        if let Ok(st) = crate::audio_win::get_default_capture_mute() {
            crate::tray_state::update_tray_mic_cache(&st);
        }
        let _ = update_tray_icon_if_needed(app, mic_key, &agent_light);
        refresh_tray_tooltip(app, state.inner());
    }
}

/// Background poll: icon + tooltip only — mic segment patches are event-driven.
fn refresh_tray_icon_from_poll(app: &AppHandle, force: bool) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if !force && visual_debounce_active() {
            return;
        }
        mark_visual_refresh();
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            if let Ok(st) = crate::audio_win::get_default_capture_mute() {
                crate::tray_state::update_tray_mic_cache(&st);
            }
            let (mic_key, agent_light) = resolve_tray_icon_inputs(state.inner());
            let _ = update_tray_icon_if_needed(&app, mic_key, &agent_light);
            refresh_tray_tooltip(&app, state.inner());
        }
    });
}

pub fn refresh_tray_visual_forced(app: &AppHandle) {
    refresh_tray_visual(app, true);
}

pub fn after_mic_state_changed(app: &AppHandle, st: &MicMuteState) {
    crate::tray_state::update_tray_mic_cache(st);
    refresh_tray_visual_forced(app);
    notify_main_mic_state(app, st);
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        crate::tray_state::emit_tray_segment(app, state.inner(), "mic");
    }
}

/// Sync tray hover text with listen / voice / mic state.
pub fn refresh_tray_tooltip(app: &AppHandle, state: &AppState) {
    // Never hold cfg while touching WASAPI — that deadlock'd launch (Responding=false).
    let paused = *state.paused.lock();
    let voice_on = {
        let cfg = state.cfg.lock();
        cfg.voice_vosk.enabled || cfg.voice_sapi.enabled
    };
    let mic_status = resolve_tray_mic_status_label(state);
    let agent = read_tray_agent_visual();
    let tip = if paused {
        format!(
            "一声 · 已暂停（按键与语音均不响应，已释放语音占用） · 麦克风{}",
            mic_status
        )
    } else if agent.light != "idle" && !agent.agent_name.is_empty() {
        format!(
            "一声 · {} {} · 麦克风{}",
            agent.agent_name, agent.status_label, mic_status
        )
    } else if voice_on {
        format!(
            "一声 · 监听中（按键 + 语音唤醒） · 麦克风{}",
            mic_status
        )
    } else {
        format!(
            "一声 · 仅按键（语音已关，省内存） · 麦克风{}",
            mic_status
        )
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tip));
    }
}

fn configure_tray_menu_window(menu_win: &WebviewWindow) -> tauri::Result<()> {
    menu_win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = menu_win.set_shadow(false);
    let _ = menu_win.set_skip_taskbar(true);
    Ok(())
}

pub fn refresh_menu(app: &AppHandle) {
    // ponytail: segment patch only — full reopen caused visible flicker on voice/config churn.
    refresh_menu_data(app);
}

pub fn refresh_menu_data(app: &AppHandle) {
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };
    crate::tray_state::emit_tray_segments(
        app,
        state.inner(),
        &["global", "mic", "channels", "event", "schemes"],
    );
}

pub fn tray_open_foreground() -> Option<crate::app_identity::AppIdentity> {
    TRAY_OPEN_FG.lock().ok().and_then(|g| g.clone())
}

pub fn tray_menu_state_json(state: &AppState) -> String {
    let open_fg = tray_open_foreground();
    serde_json::to_string(&crate::tray_state::assemble_tray_menu_state(
        state,
        open_fg.as_ref(),
    ))
    .unwrap_or_else(|_| "{}".into())
}

#[allow(dead_code)]
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
    let mic = resolve_tray_mic_visual(state);
    let agent = read_tray_agent_visual();
    let agent_light = if paused {
        "paused".to_string()
    } else {
        agent.light.clone()
    };
    // Local derive only when no published protocol (home is source of truth).
    let mut status_token = String::new();
    let mut can_pause = !paused;
    let mut can_resume = paused;
    let mut target_text = String::new();
    let mut repair_text = String::new();
    let mut last_event_text = String::new();
    let (mut status_title, mut status_badge, mut status_tone) =
        tray_status_card(paused, voice_engine, &voice_state, &voice_error, &agent);
    if let Some(proto) = state.runtime_status_protocol.lock().clone() {
        if let Some(tok) = proto.get("statusToken").and_then(|v| v.as_str()) {
            if !tok.is_empty() {
                status_token = tok.to_string();
            }
        }
        let status_text = proto
            .get("statusText")
            .and_then(|v| v.as_str())
            .or_else(|| proto.get("label").and_then(|v| v.as_str()))
            .unwrap_or("");
        if !status_text.is_empty() {
            status_title = status_text.to_string();
        }
        let trigger_text = proto
            .get("triggerText")
            .and_then(|v| v.as_str())
            .or_else(|| proto.get("detail").and_then(|v| v.as_str()))
            .unwrap_or("");
        if !trigger_text.is_empty() {
            status_badge = trigger_text.to_string();
        }
        if let Some(t) = proto.get("targetText").and_then(|v| v.as_str()) {
            target_text = t.to_string();
        }
        if let Some(t) = proto.get("repairText").and_then(|v| v.as_str()) {
            repair_text = t.to_string();
        }
        if let Some(t) = proto.get("lastEventText").and_then(|v| v.as_str()) {
            last_event_text = t.to_string();
        }
        if let Some(b) = proto.get("canPause").and_then(|v| v.as_bool()) {
            can_pause = b;
        }
        if let Some(b) = proto.get("canResume").and_then(|v| v.as_bool()) {
            can_resume = b;
        }
        if status_token.is_empty() {
            status_token = tray_derive_status_token(paused, voice_engine, &voice_state, &voice_error);
        }
        status_tone = match status_token.as_str() {
            "paused" => "paused",
            "error" => "error",
            "needsSetup" => "needs_input",
            "triggered" | "dictating" | "listening" => "normal",
            _ => status_tone,
        };
    } else {
        status_token = tray_derive_status_token(paused, voice_engine, &voice_state, &voice_error);
    }

    let payload = serde_json::json!({
        "paused": paused,
        "canPause": can_pause,
        "canResume": can_resume,
        "activeMode": mode_id(active_mode),
        "triggerKeyLabel": trigger_key_label,
        "triggerModeLabel": trigger_mode_label,
        "activeSchemeLabel": active_scheme_label,
        "engineLabel": engine_label,
        "micLabel": mic.device_label,
        "micKey": mic.key,
        "micMuted": mic.muted,
        "micStatusLabel": mic.status_label,
        "micCanToggle": mic.can_toggle,
        "agentLight": agent_light,
        "agentStatusLabel": agent.status_label,
        "agentName": agent.agent_name,
        "agentSource": agent.source,
        "statusTitle": status_title,
        "statusBadge": status_badge,
        "statusTone": status_tone,
        "statusToken": status_token,
        "statusText": status_title,
        "triggerText": status_badge,
        "targetText": target_text,
        "repairText": repair_text,
        "lastEventText": last_event_text,
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
    anchor_x: i32,
    anchor_y: i32,
) -> tauri::Result<()> {
    let w = width.max(220.0);
    let h = height.max(160.0);
    menu_win.set_size(Size::Logical(LogicalSize::new(w, h)))?;

    let pos = compute_tray_menu_position(menu_win, anchor_x, anchor_y, w, h);
    menu_win.set_position(Position::Physical(pos))?;
    mark_tray_menu_shown();
    menu_win.show()?;
    menu_win.set_focus()?;
    Ok(())
}

pub fn resize_tray_menu(
    menu_win: &WebviewWindow,
    height: f64,
    width: Option<f64>,
) -> tauri::Result<()> {
    const TRAY_SHELL_W: f64 = 316.0;
    const TRAY_CHROME: f64 = 16.0;
    let h = height.clamp(320.0, 680.0);
    let w = width.unwrap_or(TRAY_SHELL_W + TRAY_CHROME).max(220.0);
    menu_win.set_size(Size::Logical(LogicalSize::new(w, h)))?;
    let (ax, ay) = tray_menu_anchor();
    let pos = compute_tray_menu_position(menu_win, ax, ay, w, h);
    menu_win.set_position(Position::Physical(pos))
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
            if *state.paused.lock() || state.listen_silence_until_ms.lock().is_some() {
                ipc::resume_listen(state, app);
            } else {
                ipc::pause_listen(state, app);
            }
        }
        "cycle_scheme" => ipc::handle_scheme_cycle(state, app),
        "silence_until" => {
            let until_eod = payload
                .as_ref()
                .and_then(|p| p.get("untilEod"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if until_eod {
                ipc::silence_listen_until_eod(state, app);
            } else {
                let minutes = payload
                    .as_ref()
                    .and_then(|p| p.get("minutes"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60);
                ipc::silence_listen_minutes(state, app, minutes);
            }
        }
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
            let _ = ipc::perform_test_send(state, app, None, mapping_id, None, false);
        }
        "mic_toggle" => {
            #[cfg(windows)]
            {
                if let Ok(st) = crate::audio_win::get_default_capture_mute() {
                    if st.available {
                        if let Ok(next) = crate::audio_win::set_default_capture_mute(!st.muted) {
                            after_mic_state_changed(app, &next);
                        }
                    }
                }
            }
            #[cfg(not(windows))]
            {
                let _ = (app, state);
            }
        }
        "quit" => exit_app(app),
        "deep_link" => {
            let href = payload
                .as_ref()
                .and_then(|p| p.get("href"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            show_main_window_with_deep_link(app, href);
        }
        _ => {}
    }
}

fn exit_app(app: &AppHandle) {
    crate::graceful_exit(app);
}

fn show_tray_menu(app: &AppHandle, anchor: Option<(i32, i32)>) {
    if let Ok(mut g) = TRAY_OPEN_FG.lock() {
        *g = crate::app_identity::capture_tray_foreground_identity();
    }
    store_tray_menu_anchor(anchor);
    let Ok((menu_win, created)) =
        crate::overlay_window::ensure_overlay_window(app, crate::overlay_window::TRAY_MENU)
    else {
        return;
    };
    if created {
        let _ = configure_tray_menu_window(&menu_win);
        let app_for_blur = app.clone();
        menu_win.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                if blur_guard_active() {
                    return;
                }
                hide_tray_menu(&app_for_blur);
            }
        });
        // First create: wait for HTML to bind, then present (avoid blocking tray callback).
        let app_retry = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            show_tray_menu(&app_retry, None);
        });
        return;
    }
    let Some(state) = app.try_state::<Arc<AppState>>() else {
        return;
    };

    let (ax, ay) = tray_menu_anchor();
    open_tray_menu(&menu_win, state.inner(), ax, ay);

    // ponytail: match registered app scenario after present — never block tray open.
    let app_sync = app.clone();
    let state_sync = Arc::clone(&state);
    std::thread::Builder::new()
        .name("tray-scene-sync".into())
        .spawn(move || {
            sync_active_scene_from_foreground(&app_sync, &state_sync);
        })
        .ok();
}

fn sync_active_scene_from_foreground(app: &AppHandle, state: &Arc<AppState>) {
    let identity = TRAY_OPEN_FG.lock().ok().and_then(|g| g.clone());
    let Some(identity) = identity else {
        return;
    };
    let target_id = {
        let cfg = state.cfg.lock();
        crate::config::find_app_scenario_for_dispatch(&cfg, &identity).map(|m| m.id.clone())
    };
    let Some(target_id) = target_id else {
        return;
    };
    let current = state.cfg.lock().active_scene_id.clone();
    if target_id == current {
        return;
    }
    ipc::handle_scheme_select(state, app, &target_id);
    refresh_menu_data(app);
}

fn tray_anchor_from_event(position: &PhysicalPosition<f64>, rect: &tauri::Rect) -> (i32, i32) {
    use tauri::{Position, Size};
    if let (Position::Physical(p), Size::Physical(s)) = (&rect.position, &rect.size) {
        if s.width > 0 || s.height > 0 {
            return (p.x + s.width as i32, p.y);
        }
    }
    (position.x.round() as i32, position.y.round() as i32)
}

fn store_tray_menu_anchor(anchor: Option<(i32, i32)>) {
    let (ax, ay) = anchor.unwrap_or_else(cursor_physical_position);
    TRAY_MENU_ANCHOR_X.store(ax, Ordering::SeqCst);
    TRAY_MENU_ANCHOR_Y.store(ay, Ordering::SeqCst);
}

fn tray_menu_anchor() -> (i32, i32) {
    (
        TRAY_MENU_ANCHOR_X.load(Ordering::SeqCst),
        TRAY_MENU_ANCHOR_Y.load(Ordering::SeqCst),
    )
}

fn open_tray_menu(menu_win: &WebviewWindow, state: &AppState, anchor_x: i32, anchor_y: i32) {
    let (w, h) = estimate_menu_size(state);
    if present_tray_menu(menu_win, w, h, anchor_x, anchor_y).is_err() {
        return;
    }

    let app = menu_win.app_handle().clone();
    let watch_gen = TRAY_MENU_DISMISS_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    start_tray_menu_dismiss_watch(app.clone(), watch_gen);
    let win = menu_win.clone();
    let _ = app.run_on_main_thread(move || {
        let _ = win.eval("window.__tray_ready__ && window.__tray_ready__();");
    });
}

/// Hide when focus leaves the menu (blur event is unreliable on Windows topmost popups).
fn start_tray_menu_dismiss_watch(app: AppHandle, watch_gen: u64) {
    std::thread::Builder::new()
        .name("tray-dismiss".into())
        .spawn(move || {
            for _ in 0..400 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if TRAY_MENU_DISMISS_GEN.load(Ordering::SeqCst) != watch_gen {
                    return;
                }
                let Some(win) = app.get_webview_window(TRAY_MENU_LABEL) else {
                    return;
                };
                if !win.is_visible().unwrap_or(false) {
                    return;
                }
                if blur_guard_active() {
                    continue;
                }
                if win.is_focused().unwrap_or(false) {
                    continue;
                }
                let app_hide = app.clone();
                let _ = app.run_on_main_thread(move || hide_tray_menu(&app_hide));
                return;
            }
        })
        .ok();
}

fn estimate_menu_size(_state: &AppState) -> (f64, f64) {
    const TRAY_SHELL_W: f64 = 316.0;
    const TRAY_CHROME: f64 = 16.0;
    let cfg = crate::tray_customization::load();
    let mut h = 240.0;
    if crate::tray_customization::block_visible(&cfg, "block:scene") {
        h += 88.0;
    }
    let channel_blocks = [
        "block:channel:voice",
        "block:channel:keys",
        "block:channel:softPad",
        "block:channel:camera",
    ];
    let visible_channels = channel_blocks
        .iter()
        .filter(|id| crate::tray_customization::block_visible(&cfg, id))
        .count();
    if visible_channels > 0 {
        h += 28.0;
        h += visible_channels as f64 * 58.0;
    }
    if visible_channels > 0 {
        h += 12.0;
    }
    if crate::tray_customization::block_visible(&cfg, "block:mic") {
        h += 44.0;
    }
    if crate::tray_customization::block_visible(&cfg, "block:footer") {
        h += 58.0;
    }
    (
        TRAY_SHELL_W + TRAY_CHROME,
        (h + TRAY_CHROME).clamp(320.0, 680.0),
    )
}

fn hide_tray_menu(app: &AppHandle) {
    TRAY_MENU_DISMISS_GEN.fetch_add(1, Ordering::SeqCst);
    if blur_guard_active() {
        return;
    }
    if let Some(menu_win) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = menu_win.hide();
    }
}

fn show_main_window(app: &AppHandle) {
    show_main_window_with_deep_link(app, "main:home");
}

fn show_main_window_with_deep_link(app: &AppHandle, href: &str) {
    if let Some(window) = app.get_webview_window("main") {
        crate::window_layout::ensure_on_screen(&window);
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            crate::app_log::log_line(state.inner(), "window", "main window shown");
        }
        let path = href.strip_prefix("main:").unwrap_or("home");
        let tab = path.split('?').next().unwrap_or(path);
        let script = format!(
            "window.dispatchEvent(new CustomEvent('tray-deep-link',{{detail:{{href:{href:?},tab:{tab:?}}}}}));"
        );
        let _ = window.eval(&script);
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
    anchor_x: i32,
    anchor_y: i32,
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
    let mut x = anchor_x - menu_w + margin;
    let mut y = anchor_y - menu_h - margin;

    if y < work_y + margin {
        y = anchor_y + margin;
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

fn resolve_tray_mic_visual(state: &AppState) -> TrayMicVisual {
    if *state.paused.lock() {
        let mut base = read_system_mic_visual_light();
        base.key = "paused";
        base.status_label = "已暂停".into();
        return base;
    }
    if *state.recording.lock() {
        let mut base = read_system_mic_visual_light();
        base.key = "recording";
        base.status_label = "录音中".into();
        return base;
    }
    read_system_mic_visual_light()
}

/// Tooltip / poll path: mute status only — never enumerate devices (that WASAPI walk 假死'd UI).
fn resolve_tray_mic_status_label(state: &AppState) -> String {
    if *state.paused.lock() {
        return "已暂停".into();
    }
    if *state.recording.lock() {
        return "录音中".into();
    }
    match read_system_mic_key() {
        "muted" => "已静音".into(),
        "ready" => "开麦中".into(),
        _ => "不可用".into(),
    }
}

fn resolve_tray_icon_inputs(state: &AppState) -> (&'static str, String) {
    let mic_key = if *state.paused.lock() {
        "paused"
    } else if *state.recording.lock() {
        "recording"
    } else {
        read_system_mic_key()
    };
    let agent_light = if mic_key == "muted" || mic_key == "paused" {
        "idle".to_string()
    } else {
        read_tray_agent_visual().light
    };
    (mic_key, agent_light)
}

fn read_system_mic_key() -> &'static str {
    #[cfg(windows)]
    {
        match crate::audio_win::get_default_capture_mute() {
            Ok(st) if st.available => {
                if st.muted {
                    "muted"
                } else {
                    "ready"
                }
            }
            Ok(_) | Err(_) => "missing",
        }
    }
    #[cfg(not(windows))]
    {
        "missing"
    }
}

fn visual_cache_key(mic_key: &str, agent_light: &str) -> String {
    format!("{mic_key}:{agent_light}")
}

/// Light mic visual for tray menu/tooltip — mute probe only, no device enumeration.
fn read_system_mic_visual_light() -> TrayMicVisual {
    #[cfg(windows)]
    {
        match crate::audio_win::get_default_capture_mute() {
            Ok(st) if st.available => {
                if st.muted {
                    TrayMicVisual {
                        key: "muted",
                        muted: Some(true),
                        status_label: "已静音".into(),
                        device_label: "默认".into(),
                        available: true,
                        can_toggle: true,
                    }
                } else {
                    TrayMicVisual {
                        key: "ready",
                        muted: Some(false),
                        status_label: "开麦中".into(),
                        device_label: "默认".into(),
                        available: true,
                        can_toggle: true,
                    }
                }
            }
            Ok(_) | Err(_) => TrayMicVisual {
                key: "missing",
                muted: None,
                status_label: "不可用".into(),
                device_label: "默认".into(),
                available: false,
                can_toggle: false,
            },
        }
    }
    #[cfg(not(windows))]
    {
        TrayMicVisual {
            key: "missing",
            muted: None,
            status_label: "不可用".into(),
            device_label: "默认".into(),
            available: false,
            can_toggle: false,
        }
    }
}

fn read_system_mic_visual() -> TrayMicVisual {
    let mut base = read_system_mic_visual_light();
    #[cfg(windows)]
    {
        base.device_label = tray_default_mic_device_label();
    }
    base
}

fn tray_default_mic_device_label() -> String {
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

fn notify_main_mic_state(app: &AppHandle, st: &MicMuteState) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("mic_tray_state", st);
    }
}

fn visual_debounce_active() -> bool {
    let last = TRAY_VISUAL_REFRESH_AT.load(Ordering::SeqCst);
    if last == 0 {
        return false;
    }
    now_millis().saturating_sub(last) < TRAY_VISUAL_DEBOUNCE_MS
}

fn mark_visual_refresh() {
    TRAY_VISUAL_REFRESH_AT.store(now_millis(), Ordering::SeqCst);
}

fn update_tray_icon_if_needed(
    app: &AppHandle,
    mic_key: &str,
    agent_light: &str,
) -> tauri::Result<()> {
    let cache_key = visual_cache_key(mic_key, agent_light);
    let mut last = LAST_TRAY_VISUAL_KEY.lock().unwrap_or_else(|e| e.into_inner());
    if last.as_deref() == Some(cache_key.as_str()) {
        return Ok(());
    }
    *last = Some(cache_key);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_icon(Some(tray_icon_render::tray_icon_image(
            mic_key,
            agent_light,
        )))?;
    }
    Ok(())
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

fn tray_derive_status_token(
    paused: bool,
    engine: &str,
    voice_state: &str,
    voice_error: &str,
) -> String {
    if paused {
        return "paused".into();
    }
    if voice_state == "error" || !voice_error.trim().is_empty() {
        return "error".into();
    }
    if engine == "off" {
        return "needsSetup".into();
    }
    match voice_state {
        "triggered" => "triggered".into(),
        "listening" | "cooldown" => "listening".into(),
        "stopped" => "idle".into(),
        _ => "listening".into(),
    }
}

fn tray_status_card(
    paused: bool,
    engine: &str,
    voice_state: &str,
    voice_error: &str,
    agent: &TrayAgentVisual,
) -> (String, String, &'static str) {
    if paused {
        return ("已暂停".into(), "暂停".into(), "paused");
    }
    if agent.light != "idle" && agent_priority(&agent.light) > 0 {
        let title = if agent.agent_name.is_empty() {
            format!("Agent {}", agent.status_label)
        } else {
            format!("{} {}", agent.agent_name, agent.status_label)
        };
        let tone = match agent.light.as_str() {
            "failed" => "error",
            "needs_input" => "needs_input",
            _ => "agent",
        };
        return (title, agent.status_label.clone(), tone);
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

fn agent_priority(light: &str) -> u8 {
    match light.trim() {
        "failed" => 60,
        "needs_input" => 50,
        "running" => 40,
        "listening" => 30,
        "done" => 20,
        _ => 0,
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
