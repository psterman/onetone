//! Codex Micro always-on-top overlay — compact pad grid when Codex is foreground.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use parking_lot::Mutex as ParkingMutex;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::app_chat_workflow::CODEX_APP_TARGET_ID;
use crate::config::{agent_key_binding_for_slot, CodexMicroPadConfig, MappingEntry, VoiceConfig};
use crate::AppState;

pub const CODEX_MICRO_OVERLAY_LABEL: &str = "codex_micro_overlay";

const OVERLAY_WIDTH: f64 = 432.0;
const OVERLAY_HEIGHT_FULL: f64 = 432.0;
const OVERLAY_WIDTH_MINI: f64 = 148.0;
const OVERLAY_HEIGHT_MINI: f64 = 48.0;
const HIGHLIGHT_MS: u64 = 320;

static ACTIVE_MICRO_KEY: OnceLock<Mutex<String>> = OnceLock::new();
static HIGHLIGHT_UNTIL: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_FOREGROUND_CODEX: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static LAST_VISIBLE: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static FG_CONFIRM: OnceLock<ParkingMutex<(bool, u8)>> = OnceLock::new();
/// (status, micro_key_id, since)
static PAD_RUN_STATUS: OnceLock<ParkingMutex<(String, String, Instant)>> = OnceLock::new();
static OVERLAY_MINIMIZED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static OVERLAY_USER_POSITIONED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static OVERLAY_USER_POSITION: OnceLock<ParkingMutex<Option<(i32, i32)>>> = OnceLock::new();

const STATUS_RUNNING_MS: u64 = 800;
const STATUS_DONE_MS: u64 = 600;
const STATUS_FAILED_MS: u64 = 1200;

fn active_micro_key() -> &'static Mutex<String> {
    ACTIVE_MICRO_KEY.get_or_init(|| Mutex::new(String::new()))
}

fn highlight_until() -> &'static ParkingMutex<Option<Instant>> {
    HIGHLIGHT_UNTIL.get_or_init(|| ParkingMutex::new(None))
}

fn last_foreground_codex() -> &'static ParkingMutex<bool> {
    LAST_FOREGROUND_CODEX.get_or_init(|| ParkingMutex::new(false))
}

fn last_visible() -> &'static ParkingMutex<bool> {
    LAST_VISIBLE.get_or_init(|| ParkingMutex::new(false))
}

fn fg_confirm() -> &'static ParkingMutex<(bool, u8)> {
    FG_CONFIRM.get_or_init(|| ParkingMutex::new((false, 0)))
}

fn overlay_minimized() -> &'static ParkingMutex<bool> {
    OVERLAY_MINIMIZED.get_or_init(|| ParkingMutex::new(false))
}

fn overlay_user_positioned() -> &'static ParkingMutex<bool> {
    OVERLAY_USER_POSITIONED.get_or_init(|| ParkingMutex::new(false))
}

fn overlay_user_position() -> &'static ParkingMutex<Option<(i32, i32)>> {
    OVERLAY_USER_POSITION.get_or_init(|| ParkingMutex::new(None))
}

/// Require two consecutive FG samples before flipping — avoids show/hide thrash 假死.
fn stable_overlay_host(raw: bool) -> bool {
    let mut slot = fg_confirm().lock();
    let (pending, streak) = *slot;
    if pending == raw {
        *slot = (pending, streak.saturating_add(1));
    } else {
        *slot = (raw, 1);
    }
    let (pending, streak) = *slot;
    let mut last = last_foreground_codex().lock();
    if streak >= 2 && *last != pending {
        *last = pending;
    }
    *last
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroOverlayCell {
    pub micro_key_id: String,
    pub label: String,
    pub bound: bool,
    pub sub: String,
    pub ui_icon_id: String,
    pub kind: String,
    /// primary | screen | advanced | none — honest brightness for overlay.
    pub source_kind: String,
    /// idle | running | listening | done | failed
    pub run_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroOverlayRgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroOverlaySnapshot {
    pub visible: bool,
    pub enabled: bool,
    pub bound_count: u32,
    pub active_micro_key_id: String,
    pub pad_status: String,
    pub status_micro_key_id: String,
    pub software_enhance_enabled: bool,
    pub minimized: bool,
    pub rgb: Option<CodexMicroOverlayRgb>,
    pub cells: Vec<CodexMicroOverlayCell>,
}

struct OverlayCellDef {
    micro_key_id: &'static str,
    label_zh: &'static str,
    label_en: &'static str,
    kind: &'static str,
    default_icon: &'static str,
}

const OVERLAY_CELLS: &[OverlayCellDef] = &[
    OverlayCellDef {
        micro_key_id: "ENC",
        label_zh: "旋钮",
        label_en: "Dial",
        kind: "control",
        default_icon: "codex",
    },
    OverlayCellDef {
        micro_key_id: "AG00",
        label_zh: "任务 1",
        label_en: "Agent 1",
        kind: "agent",
        default_icon: "status",
    },
    OverlayCellDef {
        micro_key_id: "AG01",
        label_zh: "任务 2",
        label_en: "Agent 2",
        kind: "agent",
        default_icon: "plan",
    },
    OverlayCellDef {
        micro_key_id: "AG02",
        label_zh: "任务 3",
        label_en: "Agent 3",
        kind: "agent",
        default_icon: "review",
    },
    OverlayCellDef {
        micro_key_id: "JOY",
        label_zh: "摇杆",
        label_en: "Stick",
        kind: "control",
        default_icon: "empty",
    },
    OverlayCellDef {
        micro_key_id: "AG03",
        label_zh: "任务 4",
        label_en: "Agent 4",
        kind: "agent",
        default_icon: "folder",
    },
    OverlayCellDef {
        micro_key_id: "AG04",
        label_zh: "任务 5",
        label_en: "Agent 5",
        kind: "agent",
        default_icon: "agent",
    },
    OverlayCellDef {
        micro_key_id: "AG05",
        label_zh: "任务 6",
        label_en: "Agent 6",
        kind: "agent",
        default_icon: "cloud",
    },
    OverlayCellDef {
        micro_key_id: "ACT06",
        label_zh: "快速",
        label_en: "Fast",
        kind: "command",
        default_icon: "fast",
    },
    OverlayCellDef {
        micro_key_id: "ACT07",
        label_zh: "命令菜单",
        label_en: "Command palette",
        kind: "command",
        default_icon: "palette",
    },
    OverlayCellDef {
        micro_key_id: "ACT08",
        label_zh: "拒绝",
        label_en: "Reject",
        kind: "command",
        default_icon: "reject",
    },
    OverlayCellDef {
        micro_key_id: "ACT09",
        label_zh: "分支",
        label_en: "Fork",
        kind: "command",
        default_icon: "fork",
    },
    OverlayCellDef {
        micro_key_id: "ACT10",
        label_zh: "说话",
        label_en: "Mic",
        kind: "command",
        default_icon: "mic",
    },
    OverlayCellDef {
        micro_key_id: "ACT12",
        label_zh: "发送",
        label_en: "Send",
        kind: "command",
        default_icon: "send",
    },
];

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) else {
        eprintln!("codex_micro_overlay: window label missing — overlay will not show");
        return Ok(());
    };
    cache_overlay_hwnd_from_window(&win);
    win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = win.set_shadow(false);
    let _ = win.set_always_on_top(true);
    Ok(())
}

#[cfg(windows)]
fn codex_is_foreground() -> bool {
    crate::app_identity::foreground_app_target_id()
        .is_some_and(|id| id.trim() == CODEX_APP_TARGET_ID)
}

#[cfg(not(windows))]
fn codex_is_foreground() -> bool {
    false
}

/// True when the Micro overlay webview itself holds foreground (user clicked a keycap).
#[cfg(windows)]
pub fn overlay_is_foreground() -> bool {
    overlay_hwnd_is_foreground()
}

#[cfg(not(windows))]
pub fn overlay_is_foreground() -> bool {
    false
}

/// Overlay fire / screen tap is allowed while Codex was recently foreground (stable latch),
/// Codex is foreground now, or the overlay HWND (or a child) holds focus.
pub fn micro_pad_session_active() -> bool {
  #[cfg(windows)]
  {
    codex_is_foreground() || overlay_is_foreground() || *last_foreground_codex().lock()
  }
  #[cfg(not(windows))]
  {
    false
  }
}

#[cfg(windows)]
fn hwnd_belongs_to_overlay(fg: isize, overlay: isize) -> bool {
    use winapi::shared::windef::HWND;
    use winapi::um::winuser::GetParent;

    if fg == 0 || overlay == 0 {
        return false;
    }
    if fg == overlay {
        return true;
    }
    unsafe {
        let mut cur = fg;
        for _ in 0..32 {
            if cur == overlay {
                return true;
            }
            cur = GetParent(cur as HWND) as isize;
            if cur == 0 {
                break;
            }
        }
    }
    false
}

#[cfg(windows)]
fn overlay_hwnd_is_foreground() -> bool {
    use winapi::um::winuser::GetForegroundWindow;

    let overlay_hwnd = *overlay_hwnd_cache().lock();
    if overlay_hwnd == 0 {
        return false;
    }
    unsafe {
        let fg = GetForegroundWindow() as isize;
        hwnd_belongs_to_overlay(fg, overlay_hwnd)
    }
}

#[cfg(windows)]
static OVERLAY_HWND: OnceLock<ParkingMutex<isize>> = OnceLock::new();

#[cfg(windows)]
fn overlay_hwnd_cache() -> &'static ParkingMutex<isize> {
    OVERLAY_HWND.get_or_init(|| ParkingMutex::new(0))
}

pub fn cache_overlay_hwnd_from_window(win: &WebviewWindow) {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = win.window_handle() {
            if let RawWindowHandle::Win32(platform) = handle.as_raw() {
                *overlay_hwnd_cache().lock() = platform.hwnd.get() as isize;
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = win;
    }
}

/// Return overlay HWND to foreground after hold-to-talk chord press (keeps pointer tracking).
#[cfg(windows)]
pub fn refocus_overlay(app: &AppHandle) {
    let hwnd = *overlay_hwnd_cache().lock();
    if hwnd != 0 {
        let _ = crate::keyboard::focus_window(hwnd as winapi::shared::windef::HWND);
    } else if let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) {
        cache_overlay_hwnd_from_window(&win);
        let hwnd = *overlay_hwnd_cache().lock();
        if hwnd != 0 {
            let _ = crate::keyboard::focus_window(hwnd as winapi::shared::windef::HWND);
        }
    }
}

#[cfg(not(windows))]
pub fn refocus_overlay(_app: &AppHandle) {}

/// Show pad when Codex desktop is focused, or while the user is clicking the pad itself.
#[cfg(windows)]
fn overlay_host_allows_show() -> bool {
    codex_is_foreground() || overlay_hwnd_is_foreground()
}

#[cfg(not(windows))]
fn overlay_host_allows_show() -> bool {
    false
}

fn active_codex_mapping_with_overlay(cfg: &VoiceConfig) -> Option<(&MappingEntry, &CodexMicroPadConfig)> {
    for m in cfg.active_mappings() {
        if m.app_target_id.trim() != CODEX_APP_TARGET_ID {
            continue;
        }
        let pad = m.codex_micro_pad.as_ref()?;
        if !pad.enabled || !pad.overlay_enabled {
            continue;
        }
        return Some((m, pad));
    }
    None
}

fn route_for_micro<'a>(
    pad: &'a CodexMicroPadConfig,
    micro_key_id: &str,
) -> Option<&'a crate::config::CodexMicroPadKeyRoute> {
    pad.keys.iter().find(|k| k.micro_key_id == micro_key_id && k.enabled)
}

fn label_for_cell(def: &OverlayCellDef) -> String {
    // Overlay HTML picks locale from localStorage; send both via zh default.
    def.label_zh.to_string()
}

pub fn build_snapshot(state: &AppState) -> CodexMicroOverlaySnapshot {
    let cfg = state.cfg.lock();
    build_snapshot_from_cfg(&cfg)
}

fn pad_run_status_slot() -> &'static ParkingMutex<(String, String, Instant)> {
    PAD_RUN_STATUS.get_or_init(|| {
        ParkingMutex::new(("idle".into(), String::new(), Instant::now()))
    })
}

/// Record pad run status for overlay / FE sync. Timers resolved in `effective_pad_run_status`.
pub fn note_pad_run_status(status: &str, micro_key_id: &str) {
    let status = status.trim();
    if status.is_empty() {
        return;
    }
    *pad_run_status_slot().lock() = (
        status.to_string(),
        micro_key_id.trim().to_string(),
        Instant::now(),
    );
}

fn effective_pad_run_status() -> (String, String) {
    let (status, micro, since) = pad_run_status_slot().lock().clone();
    let elapsed = since.elapsed().as_millis() as u64;
    match status.as_str() {
        "listening" => (status, micro),
        "running" if elapsed >= STATUS_RUNNING_MS => {
            // Auto-advance running → done, then idle on next reads.
            *pad_run_status_slot().lock() =
                ("done".into(), micro.clone(), Instant::now());
            ("done".into(), micro)
        }
        "done" if elapsed >= STATUS_DONE_MS => {
            *pad_run_status_slot().lock() = ("idle".into(), String::new(), Instant::now());
            ("idle".into(), String::new())
        }
        "failed" if elapsed >= STATUS_FAILED_MS => {
            *pad_run_status_slot().lock() = ("idle".into(), String::new(), Instant::now());
            ("idle".into(), String::new())
        }
        _ => (status, micro),
    }
}

fn source_kind_for_route(
    micro_key_id: &str,
    route: Option<&crate::config::CodexMicroPadKeyRoute>,
) -> &'static str {
    let Some(r) = route else {
        return if micro_key_id == "JOY" || micro_key_id.starts_with("NAV_") {
            "advanced"
        } else {
            "none"
        };
    };
    let slot = r.slot_id.trim();
    let advanced = r.advanced
        || micro_key_id.starts_with("NAV_")
        || micro_key_id == "ENC_CW"
        || micro_key_id == "ENC_CC";
    if advanced {
        return "advanced";
    }
    if r.source_scan > 0 && !slot.is_empty() {
        return "primary";
    }
    if !slot.is_empty() {
        return "screen";
    }
    if micro_key_id == "JOY" {
        return "advanced";
    }
    "none"
}

fn build_snapshot_from_cfg(cfg: &VoiceConfig) -> CodexMicroOverlaySnapshot {
    // Use stable host latch (same as maybe_tick) so show/hide doesn't thrash on a raw FG blip.
    let show = *last_foreground_codex().lock();
    let (pad_status, status_micro) = effective_pad_run_status();
    let vendor = crate::codex_micro_vendor::protocol_snapshot();
    let rgb = vendor.rgb.as_ref().map(|c| CodexMicroOverlayRgb {
        r: c.r,
        g: c.g,
        b: c.b,
    });
    let minimized = *overlay_minimized().lock();
    let Some((mapping, pad)) = active_codex_mapping_with_overlay(cfg) else {
        return CodexMicroOverlaySnapshot {
            visible: false,
            enabled: false,
            bound_count: 0,
            active_micro_key_id: String::new(),
            pad_status,
            status_micro_key_id: status_micro,
            software_enhance_enabled: false,
            minimized,
            rgb,
            cells: vec![],
        };
    };

    let mut bound_count = 0u32;
    let mut cells = Vec::with_capacity(OVERLAY_CELLS.len());
    for def in OVERLAY_CELLS {
        let route = route_for_micro(pad, def.micro_key_id);
        let slot_id = route.and_then(|r| {
            let s = r.slot_id.trim();
            if s.is_empty() { None } else { Some(s) }
        });
        let bound = crate::codex_numpad_layer::micro_key_routable(mapping, pad, def.micro_key_id);
        if bound {
            bound_count += 1;
        }
        let mut sub = String::new();
        if let Some(slot) = slot_id {
            if let Some(insert) = crate::agent::templates::slot_by_id(slot)
                .and_then(|s| s.insert_text)
            {
                sub = format!("插入 {insert}");
            } else if let Some(b) = agent_key_binding_for_slot(mapping, slot) {
                sub = b.trigger_binding.clone();
            }
        }
        let ui_icon_id = route
            .map(|r| r.ui_icon_id.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| def.default_icon.to_string());
        let source_kind = source_kind_for_route(def.micro_key_id, route).to_string();
        let run_status = if !status_micro.is_empty() && status_micro == def.micro_key_id {
            pad_status.clone()
        } else {
            "idle".into()
        };
        cells.push(CodexMicroOverlayCell {
            micro_key_id: def.micro_key_id.to_string(),
            label: label_for_cell(def),
            bound,
            sub,
            ui_icon_id,
            kind: def.kind.to_string(),
            source_kind,
            run_status,
        });
    }

    let active = {
        let key = active_micro_key().lock().unwrap().clone();
        if key.is_empty() {
            String::new()
        } else if let Some(until) = *highlight_until().lock() {
            if Instant::now() < until {
                key
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    };

    CodexMicroOverlaySnapshot {
        visible: show && pad.enabled && pad.overlay_enabled,
        enabled: pad.enabled,
        bound_count,
        active_micro_key_id: active,
        pad_status,
        status_micro_key_id: status_micro,
        software_enhance_enabled: pad.software_enhance_enabled,
        minimized,
        rgb,
        cells,
    }
}

pub fn set_overlay_minimized(minimized: bool) {
    *overlay_minimized().lock() = minimized;
}

pub fn snap_overlay_position(win: &WebviewWindow) {
    if let Ok(pos) = win.outer_position() {
        *overlay_user_position().lock() = Some((pos.x, pos.y));
        *overlay_user_positioned().lock() = true;
    }
}

pub fn start_overlay_drag(win: &WebviewWindow) -> Result<(), String> {
    win.start_dragging().map_err(|e| e.to_string())
}

pub fn note_micro_key(micro_key_id: &str, key_down: bool) {
    if key_down {
        *active_micro_key().lock().unwrap() = micro_key_id.trim().to_string();
        *highlight_until().lock() = Some(Instant::now() + Duration::from_millis(HIGHLIGHT_MS));
    } else if active_micro_key().lock().unwrap().as_str() == micro_key_id.trim() {
        *active_micro_key().lock().unwrap() = String::new();
        *highlight_until().lock() = None;
    }
}

pub fn push_state(app: &AppHandle, state: &AppState) {
    push_state_impl(app, state, true);
}

/// Status-only refresh — skip reposition/resize (hold-to-talk must not thrash overlay layout).
pub fn push_overlay_status(app: &AppHandle, state: &AppState) {
    push_state_impl(app, state, false);
}

fn push_state_impl(app: &AppHandle, state: &AppState, reposition: bool) {
    let snapshot = build_snapshot(state);
    let visible = snapshot.visible;
    {
        *last_visible().lock() = visible;
    }
    let payload = snapshot;
    let app_clone = app.clone();

    let _ = std::thread::Builder::new()
        .name("codex-micro-overlay-push".into())
        .spawn(move || {
            let Some(win) = app_clone.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) else {
                return;
            };
            if reposition {
                cache_overlay_hwnd_from_window(&win);
            }
            if visible && reposition {
                position_overlay(&win);
                let minimized = payload.minimized;
                let (w, h) = if minimized {
                    (OVERLAY_WIDTH_MINI, OVERLAY_HEIGHT_MINI)
                } else {
                    (OVERLAY_WIDTH, OVERLAY_HEIGHT_FULL)
                };
                let _ = win.set_size(Size::Logical(LogicalSize::new(w, h)));
                let _ = win.set_always_on_top(true);
                #[cfg(windows)]
                {
                    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                    if let Ok(handle) = win.window_handle() {
                        if let RawWindowHandle::Win32(platform) = handle.as_raw() {
                            let hwnd = platform.hwnd.get() as winapi::shared::windef::HWND;
                            let _ = crate::keyboard::show_window_no_activate(hwnd);
                        } else {
                            let _ = win.show();
                        }
                    } else {
                        let _ = win.show();
                    }
                }
                #[cfg(not(windows))]
                {
                    let _ = win.show();
                }
            } else if !visible {
                let _ = win.hide();
            }
            let _ = win.emit("codex_micro_overlay_state", &payload);
        });
}

fn position_overlay(win: &WebviewWindow) {
    if *overlay_user_positioned().lock() {
        if let Some((x, y)) = *overlay_user_position().lock() {
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
            return;
        }
    }

    let minimized = *overlay_minimized().lock();
    let (logical_w, logical_h) = if minimized {
        (OVERLAY_WIDTH_MINI, OVERLAY_HEIGHT_MINI)
    } else {
        (OVERLAY_WIDTH, OVERLAY_HEIGHT_FULL)
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let w = (logical_w * scale).round() as i32;
    let h = (logical_h * scale).round() as i32;
    let margin = (12.0 * scale).round() as i32;

    let monitor = monitor_for_codex(win)
        .or_else(|| win.current_monitor().ok().flatten())
        .or_else(|| win.primary_monitor().ok().flatten());

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

    let x = (work_right - w - margin).max(work_x + margin);
    let y = (work_bottom - h - margin).max(work_y + margin);

    let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

/// Prefer the monitor that hosts the Codex desktop window.
fn monitor_for_codex(win: &WebviewWindow) -> Option<tauri::Monitor> {
    let (cx, cy) = codex_window_center()?;
    let monitors = win.available_monitors().ok()?;
    for m in monitors {
        let pos = m.position();
        let size = m.size();
        let right = pos.x + size.width as i32;
        let bottom = pos.y + size.height as i32;
        if cx >= pos.x && cy >= pos.y && cx < right && cy < bottom {
            return Some(m);
        }
    }
    None
}

#[cfg(windows)]
fn codex_window_center() -> Option<(i32, i32)> {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{GetForegroundWindow, GetWindowRect};

    // Overlay only shows while Codex is FG — use the foreground HWND (O(1)).
    // Avoid EnumWindows + per-process identity probes (was a 假死 risk on ticks).
    if !codex_is_foreground() {
        return None;
    }
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
        let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
        if area <= 0 {
            return None;
        }
        Some((
            (rect.left + rect.right) / 2,
            (rect.top + rect.bottom) / 2,
        ))
    }
}

#[cfg(not(windows))]
fn codex_window_center() -> Option<(i32, i32)> {
    None
}

/// Hide overlay and persist `overlayEnabled = false` on the active Codex pad.
pub fn dismiss_overlay(app: &AppHandle, state: &AppState) -> bool {
    *overlay_minimized().lock() = false;
    let mut changed = false;
    {
        let mut cfg = state.cfg.lock();
        for m in cfg.mappings.iter_mut() {
            if m.app_target_id.trim() != CODEX_APP_TARGET_ID {
                continue;
            }
            let Some(pad) = m.codex_micro_pad.as_mut() else {
                continue;
            };
            if !pad.overlay_enabled {
                continue;
            }
            pad.overlay_enabled = false;
            changed = true;
        }
        if changed {
            crate::config::save_config(&cfg);
            crate::codex_numpad_layer::sync_hook_cache(&cfg);
        }
    }
    if changed {
        push_state(app, state);
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.emit(
                "to_js",
                &serde_json::json!({ "type": "codex_micro_overlay_dismissed" }),
            );
        }
    }
    changed
}

pub fn maybe_tick(app: &AppHandle, state: &AppState) {
    let was_fg = *last_foreground_codex().lock();
    let host_ok = stable_overlay_host(overlay_host_allows_show());
    let is_fg = *last_foreground_codex().lock();

    if is_fg {
        let result = {
            let mut cfg = state.cfg.lock();
            let blocker = crate::codex_numpad_layer::readiness_snapshot(&cfg).blocker;
            let should_ensure = !was_fg
                || blocker == "no_routes"
                || blocker == "pad_off"
                || blocker == "no_mapping";
            if !should_ensure {
                None
            } else {
                let result = crate::codex_numpad_layer::ensure_codex_pad_ready(&mut cfg, "zh-CN");
                if result.changed {
                    crate::config::save_config(&cfg);
                    crate::codex_numpad_layer::sync_hook_cache(&cfg);
                }
                Some(result)
            }
        };
        if let Some(result) = result {
            if result.changed {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.emit(
                        "to_js",
                        &serde_json::json!({
                            "type": "codex_micro_pad_ready",
                            "readiness": result.readiness,
                            "mappingId": result.mapping_id,
                            "codexMicroPad": result.codex_micro_pad,
                            "agentBindings": result.agent_bindings,
                        }),
                    );
                }
            }
        }
    }

    let highlight_expired = highlight_until()
        .lock()
        .is_some_and(|until| Instant::now() >= until);
    if highlight_expired {
        *highlight_until().lock() = None;
        active_micro_key().lock().unwrap().clear();
    }

    let desired_visible = {
        let cfg = state.cfg.lock();
        active_codex_mapping_with_overlay(&cfg).is_some() && host_ok
    };
    let vis_changed = *last_visible().lock() != desired_visible;

    if vis_changed {
        let raw = overlay_host_allows_show();
        let fg = crate::app_identity::foreground_app_identity();
        let detail = format!(
            "overlay visible={} host_ok={} raw_host={} fg_exe={} fg_title={:?} fg_preset={:?} path={:?}",
            desired_visible,
            host_ok,
            raw,
            fg.as_ref().map(|i| i.exe_name.as_str()).unwrap_or(""),
            fg.as_ref().map(|i| i.window_title.as_str()).unwrap_or(""),
            fg.as_ref().and_then(|i| i.matched_preset_app_id.as_deref()),
            fg.as_ref().and_then(|i| i.full_path.as_deref()).unwrap_or(""),
        );
        crate::app_log::log_line(state, "codex_overlay", &detail);
    }

    if vis_changed || highlight_expired {
        push_state(app, state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{MappingEntry, TriggerMode, VoiceConfig};

    fn codex_mapping(pad: CodexMicroPadConfig) -> MappingEntry {
        MappingEntry {
            id: "codex".into(),
            label: String::new(),
            group: "默认".into(),
            app_target_id: CODEX_APP_TARGET_ID.into(),
            codex_micro_pad: Some(pad),
            trigger_key: "F1".into(),
            target_key: "RAlt".into(),
            enabled: true,
            order: 0,
            trigger_mode: TriggerMode::Tap,
            trigger_source: None,
            source_key: String::new(),
            source_time: String::new(),
            interval_ms: 1200,
            enter_delay_ms: 5000,
            cancel_enabled: true,
            auto_enter_enabled: true,
            switch_keys: vec![],
            native_key_restore: false,
            trigger_device: String::new(),
            long_press_ms: 500,
            double_click_ms: 400,
            ime_preset_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: None,
            camera_override: None,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
            agent_template_id: String::new(),
            agent_provider_id: String::new(),
            agent_bindings: vec![],
        }
    }

    #[test]
    fn overlay_hidden_without_overlay_flag() {
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: false,
            layout_profile: String::new(),
            software_enhance_enabled: false,
            keys: vec![],
        })];
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.visible);
        assert!(snap.cells.is_empty());
    }

    #[test]
    fn overlay_sub_prefers_insert_text_and_act07_is_command_palette() {
        use crate::config::{AgentBinding, CodexMicroPadKeyRoute};

        let mut mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            keys: vec![
                CodexMicroPadKeyRoute {
                    micro_key_id: "AG01".into(),
                    source_scan: 0x48,
                    source_extended: false,
                    slot_id: "plan".into(),
                    ui_icon_id: String::new(),
                    enabled: true,
                    advanced: false,
                },
                CodexMicroPadKeyRoute {
                    micro_key_id: "ACT07".into(),
                    source_scan: 0x35,
                    source_extended: true,
                    slot_id: "commandPalette".into(),
                    ui_icon_id: "palette".into(),
                    enabled: true,
                    advanced: false,
                },
            ],
        });
        mapping.agent_bindings = vec![
            AgentBinding {
                slot_id: "plan".into(),
                action_id: "plan".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+Alt+P".into(),
                enabled: true,
                execution_mode: Some("insertOnly".into()),
                activation_scope: "foregroundApp".into(),
            },
            AgentBinding {
                slot_id: "commandPalette".into(),
                action_id: "commandPalette".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+K".into(),
                enabled: true,
                execution_mode: Some("execute".into()),
                activation_scope: "foregroundApp".into(),
            },
        ];
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping];
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.cells.is_empty());

        let plan = snap.cells.iter().find(|c| c.micro_key_id == "AG01").unwrap();
        assert!(plan.bound);
        assert_eq!(plan.sub, "插入 /plan");
        assert_ne!(plan.sub, "Ctrl+Alt+P");
        assert_eq!(plan.source_kind, "primary");

        let act07 = snap.cells.iter().find(|c| c.micro_key_id == "ACT07").unwrap();
        assert_eq!(act07.label, "命令菜单");
        assert_eq!(act07.sub, "Ctrl+K");
        assert_eq!(act07.source_kind, "primary");

        let joy = snap.cells.iter().find(|c| c.micro_key_id == "JOY").unwrap();
        assert_eq!(joy.source_kind, "advanced");
        assert_eq!(snap.pad_status, "idle");
    }

    #[test]
    fn overlay_source_kind_marks_screen_enc() {
        use crate::config::CodexMicroPadKeyRoute;

        let mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "ENC".into(),
                source_scan: 0,
                source_extended: false,
                slot_id: "summonCodex".into(),
                ui_icon_id: "codex".into(),
                enabled: true,
                advanced: false,
            }],
        });
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping];
        let snap = build_snapshot_from_cfg(&cfg);
        let enc = snap.cells.iter().find(|c| c.micro_key_id == "ENC").unwrap();
        assert!(enc.bound);
        assert_eq!(enc.source_kind, "screen");
    }
}
