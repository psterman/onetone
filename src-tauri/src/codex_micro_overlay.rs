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
/// Extra strip for status meta under the pad (avoids clipping Chinese glyphs).
const OVERLAY_HEIGHT_FULL: f64 = 540.0;
/// Left NAV rail strip is always reserved in the window so JOY open/close never
/// resizes/repositions the pad (CSS fades the rail in-place).
/// Deprecated: JOY side-rail removed; NAV keys live on the 5-col main pad.
#[allow(dead_code)]
const OVERLAY_WIDTH_MINI: f64 = 156.0;
const OVERLAY_HEIGHT_MINI: f64 = 44.0;
const HIGHLIGHT_MS: u64 = 320;

static ACTIVE_MICRO_KEY: OnceLock<Mutex<String>> = OnceLock::new();
static HIGHLIGHT_UNTIL: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_FOREGROUND_CODEX: OnceLock<ParkingMutex<bool>> = OnceLock::new();
/// Last applied click-through (needs_input pass-through to Codex permission UI).
static LAST_PASS_THROUGH: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static LAST_PASS_RESYNC: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_VISIBLE: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static FG_CONFIRM: OnceLock<ParkingMutex<(bool, u8)>> = OnceLock::new();
/// (status, micro_key_id, since)
static PAD_RUN_STATUS: OnceLock<ParkingMutex<(String, String, Instant)>> = OnceLock::new();
static OVERLAY_MINIMIZED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static OVERLAY_USER_POSITIONED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static OVERLAY_USER_POSITION: OnceLock<ParkingMutex<Option<(i32, i32)>>> = OnceLock::new();
/// Last applied minimized flag. JOY rail no longer changes window size.
static OVERLAY_LAST_GEOM: OnceLock<ParkingMutex<Option<bool>>> = OnceLock::new();

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

#[cfg(test)]
pub(crate) fn test_set_foreground_latch(v: bool) {
    *last_foreground_codex().lock() = v;
}

fn last_pass_through() -> &'static ParkingMutex<bool> {
    LAST_PASS_THROUGH.get_or_init(|| ParkingMutex::new(false))
}

fn last_pass_resync() -> &'static ParkingMutex<Option<Instant>> {
    LAST_PASS_RESYNC.get_or_init(|| ParkingMutex::new(None))
}

/// While Hook asks for permission, keep the pad as a status beacon even if FG
/// briefly leaves the main Codex HWND (in-app permission sheet / child focus).
fn hook_needs_input_hold() -> bool {
    match crate::codex_app_state::fresh_signal() {
        Some((source, status)) => {
            status == "needs_input" && (source == "codex_hook" || source == "codex_app")
        }
        None => false,
    }
}

/// Toggle WS_EX_TRANSPARENT on the overlay HWND (any thread — does not need the UI loop).
/// Used so PermissionRequest can enable click-through even when WebView main is wedged.
pub fn set_overlay_click_through(pass: bool) {
    set_overlay_click_through_impl(pass, false);
}

fn set_overlay_click_through_impl(pass: bool, force: bool) {
    let mut last = last_pass_through().lock();
    if !force && *last == pass {
        return;
    }
    #[cfg(windows)]
    {
        let hwnd = *overlay_hwnd_cache().lock();
        if hwnd == 0 {
            // Do not stamp `last` — otherwise a later identical `pass` becomes a no-op
            // after HWND is finally cached and the style never applies.
            return;
        }
        unsafe {
            use winapi::um::winuser::{
                GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
            };
            let hwnd = hwnd as winapi::shared::windef::HWND;
            let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            // TRANSPARENT alone can be ignored unless LAYERED is also set (WebView2 usually has it).
            let new_style = if pass {
                style | WS_EX_TRANSPARENT as i32 | WS_EX_LAYERED as i32
            } else {
                style & !(WS_EX_TRANSPARENT as i32)
            };
            if new_style != style {
                SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
            }
            let _ = crate::keyboard::show_window_no_activate(hwnd);
        }
        *last = pass;
    }
    #[cfg(not(windows))]
    {
        let _ = pass;
        *last = pass;
    }
}

/// While Hook asks for permission, let clicks reach Codex (avoid overlay covering the dialog = 假死感).
fn sync_needs_input_pass_through(win: &WebviewWindow, snap: &CodexMicroOverlaySnapshot) {
    cache_overlay_hwnd_from_window(win);
    let pass = snap.visible
        && snap.app_state_enabled
        && snap.app_status == "needs_input"
        && (snap.app_last_source == "codex_hook"
            || snap.app_last_source == "codex_app"
            || snap.app_last_source == "claude_hook"
            || snap.app_last_source == "claude_app");
    // Force re-apply while holding needs_input — HWND / EXSTYLE can be reset by show/geometry.
    set_overlay_click_through_impl(pass, pass);
    let _ = win.set_ignore_cursor_events(pass);
    if !snap.visible {
        return;
    }
    // During permission wait: do not re-assert always_on_top (keeps ChatGPT approval above pad).
    // Outside that window: keep the beacon pinned.
    if !pass {
        let _ = win.set_always_on_top(true);
        #[cfg(windows)]
        {
            let hwnd = *overlay_hwnd_cache().lock();
            if hwnd != 0 {
                let _ = crate::keyboard::show_window_no_activate(
                    hwnd as winapi::shared::windef::HWND,
                );
            } else {
                let _ = win.show();
            }
        }
        #[cfg(not(windows))]
        {
            let _ = win.show();
        }
    }
    // Side-rail removed — keep latch closed for any legacy readers.
    if pass {
        crate::codex_numpad_layer::set_joy_nav_panel_open(false);
    }
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

fn overlay_last_geom() -> &'static ParkingMutex<Option<bool>> {
    OVERLAY_LAST_GEOM.get_or_init(|| ParkingMutex::new(None))
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
    /// idle | running | listening | needs_input | done | failed
    pub run_status: String,
    /// native | inferred | fallback | codex_hook | codex_app
    /// (`native_micro` is a display alias of `native`; not emitted by P0 merge.)
    pub status_source: String,
    /// Fresh native AG state (empty when not native).
    pub native_run_status: String,
    /// ACT context from State Core: "" | emphasize | dim
    pub context_rank: String,
    /// Short ACT context hint (optional).
    pub context_hint: String,
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
    pub overlay_enabled: bool,
    /// Derived: "codex" when pad.enabled, else "numpad".
    pub pad_mode: String,
    /// Overlay session: JOY left NAV rail open (not persisted).
    pub joy_nav_panel_open: bool,
    /// True when physical arrows are hijacked into NAV_* (Codex FG + pad on + rail open).
    pub joy_arrows_live: bool,
    /// Short context copy for the NAV rail / toast (empty when rail closed).
    pub joy_context_hint: String,
    pub require_num_lock_off: bool,
    pub num_lock_blocking: bool,
    pub bound_count: u32,
    pub active_micro_key_id: String,
    pub pad_status: String,
    pub status_micro_key_id: String,
    /// v1 status-light host: microKeyId with slotId=status (fallback AG00). Not fire latch.
    pub status_light_micro_key_id: String,
    pub software_enhance_enabled: bool,
    pub minimized: bool,
    pub rgb: Option<CodexMicroOverlayRgb>,
    /// connected | stale | fallback (protocol debug).
    pub connection_state: String,
    pub protocol_version: String,
    pub device_status: String,
    /// App/Hook channel (not Micro thstatus): lastEvent / source / status / ageMs.
    pub app_last_event: String,
    pub app_last_source: String,
    pub app_last_seen_at: u64,
    pub app_status: String,
    pub app_age_ms: u64,
    /// Mirror of `codexMicroPad.codexStatusLightsEnabled` on the active Codex mapping.
    pub app_state_enabled: bool,
    /// State Core confidence: high | medium | low
    pub app_confidence: String,
    /// State Core agent id when known: codex | claude (v2 meta).
    pub app_agent: String,
    /// Short human message from State Core (optional).
    pub app_message: String,
    /// State Core task / turn id (optional).
    pub app_task_id: String,
    /// State Core session id (optional).
    pub app_session_id: String,
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
        label_zh: "总开关",
        label_en: "Power",
        kind: "control",
        default_icon: "power",
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
        micro_key_id: "NAV_UP",
        label_zh: "上",
        label_en: "Up",
        kind: "nav",
        default_icon: "navUp",
    },
    OverlayCellDef {
        micro_key_id: "AG00",
        label_zh: "Agent",
        label_en: "Agent",
        kind: "agent",
        default_icon: "agent",
    },
    OverlayCellDef {
        micro_key_id: "AG01",
        label_zh: "Claude",
        label_en: "Claude",
        kind: "agent",
        default_icon: "claude",
    },
    OverlayCellDef {
        micro_key_id: "AG02",
        label_zh: "Codex",
        label_en: "Codex",
        kind: "agent",
        default_icon: "model",
    },
    OverlayCellDef {
        micro_key_id: "PLUS",
        label_zh: "加",
        label_en: "Plus",
        kind: "command",
        default_icon: "plus",
    },
    OverlayCellDef {
        micro_key_id: "NAV_LEFT",
        label_zh: "左",
        label_en: "Left",
        kind: "nav",
        default_icon: "navLeft",
    },
    OverlayCellDef {
        micro_key_id: "AG03",
        label_zh: "权限",
        label_en: "Permissions",
        kind: "agent",
        default_icon: "folder",
    },
    OverlayCellDef {
        micro_key_id: "AG04",
        label_zh: "常用",
        label_en: "Status",
        kind: "agent",
        default_icon: "status",
    },
    OverlayCellDef {
        micro_key_id: "AG05",
        label_zh: "应用",
        label_en: "Apps",
        kind: "agent",
        default_icon: "cloud",
    },
    OverlayCellDef {
        micro_key_id: "NAV_DOWN",
        label_zh: "下",
        label_en: "Down",
        kind: "nav",
        default_icon: "navDown",
    },
    OverlayCellDef {
        micro_key_id: "ACT09",
        label_zh: "上下文",
        label_en: "Context",
        kind: "command",
        default_icon: "fork",
    },
    OverlayCellDef {
        micro_key_id: "UNDO",
        label_zh: "撤销",
        label_en: "Undo",
        kind: "command",
        default_icon: "undo",
    },
    OverlayCellDef {
        micro_key_id: "SEARCH",
        label_zh: "搜索",
        label_en: "Find",
        kind: "command",
        default_icon: "search",
    },
    OverlayCellDef {
        micro_key_id: "ACT12",
        label_zh: "发送",
        label_en: "Send",
        kind: "command",
        default_icon: "send",
    },
    OverlayCellDef {
        micro_key_id: "NAV_RIGHT",
        label_zh: "右",
        label_en: "Right",
        kind: "nav",
        default_icon: "navRight",
    },
    OverlayCellDef {
        micro_key_id: "ACT10",
        label_zh: "说话",
        label_en: "Mic",
        kind: "command",
        default_icon: "mic",
    },
    OverlayCellDef {
        micro_key_id: "DOT",
        label_zh: "小数点",
        label_en: "Dot",
        kind: "command",
        default_icon: "dot",
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

/// Keep the pad visible/clickable after hold-to-talk without stealing Codex focus.
/// Stealing FG via AttachThreadInput/SetForegroundWindow while Ctrl+Shift+D is held
/// redirected the chord away from Codex and deadlocked WebView2 (soft-pad 假死).
#[cfg(windows)]
pub fn refocus_overlay(app: &AppHandle) {
    let hwnd = {
        let cached = *overlay_hwnd_cache().lock();
        if cached != 0 {
            cached
        } else if let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) {
            cache_overlay_hwnd_from_window(&win);
            *overlay_hwnd_cache().lock()
        } else {
            0
        }
    };
    if hwnd == 0 {
        return;
    }
    let _ = crate::keyboard::show_window_no_activate(hwnd as winapi::shared::windef::HWND);
    let _ = app
        .get_webview_window(CODEX_MICRO_OVERLAY_LABEL)
        .map(|win| win.set_always_on_top(true));
}

#[cfg(not(windows))]
pub fn refocus_overlay(_app: &AppHandle) {}

/// Show pad when Codex desktop is focused, or while the user is clicking the pad itself,
/// or while Hook permission wait is active (dialog focus must not hide the beacon).
#[cfg(windows)]
fn overlay_host_allows_show() -> bool {
    codex_is_foreground() || overlay_hwnd_is_foreground() || hook_needs_input_hold()
}

#[cfg(not(windows))]
fn overlay_host_allows_show() -> bool {
    false
}

/// True when any Codex mapping has `codexStatusLightsEnabled` (status-bridge switch).
pub fn status_lights_enabled(cfg: &VoiceConfig) -> bool {
    cfg.mappings.iter().any(|m| {
        m.app_target_id.trim() == CODEX_APP_TARGET_ID
            && m.codex_micro_pad
                .as_ref()
                .map(|p| p.codex_status_lights_enabled)
                .unwrap_or(false)
    })
}

/// Overlay visibility depends only on `overlay_enabled` (not `pad.enabled`).
/// Numpad mode (`pad.enabled=false`) still shows the floating pad.
fn active_codex_mapping_with_overlay(cfg: &VoiceConfig) -> Option<(&MappingEntry, &CodexMicroPadConfig)> {
    for m in cfg.active_mappings() {
        if m.app_target_id.trim() != CODEX_APP_TARGET_ID {
            continue;
        }
        let pad = m.codex_micro_pad.as_ref()?;
        if !pad.overlay_enabled {
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

fn overlay_layout_has_micro_key(micro_key_id: &str) -> bool {
    OVERLAY_CELLS
        .iter()
        .any(|c| c.micro_key_id == micro_key_id)
}

/// Resolve which Soft Pad key shows the single State Core status light (v1).
/// Prefers enabled `slotId == "status"`; else fallback `AG00` if in overlay layout; else empty
/// (ring / Soft RGB only — do not force another key).
pub fn resolve_status_light_micro_key_id(pad: &CodexMicroPadConfig) -> String {
    resolve_status_light_micro_key_id_impl(&pad.keys, overlay_layout_has_micro_key)
}

fn resolve_status_light_micro_key_id_impl(
    keys: &[crate::config::CodexMicroPadKeyRoute],
    in_layout: impl Fn(&str) -> bool,
) -> String {
    if let Some(r) = keys
        .iter()
        .find(|k| k.enabled && k.slot_id.trim() == "status")
    {
        let id = r.micro_key_id.trim();
        if !id.is_empty() {
            if in_layout(id) {
                return id.to_string();
            }
            return String::new();
        }
    }
    if in_layout("AG00") {
        return "AG00".into();
    }
    String::new()
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
    // Feed State Core as low-confidence inferred (must not clear sticky hook needs_input).
    let phase = if status == "listening" {
        Some("hold")
    } else {
        None
    };
    let _ = crate::pad_status::apply_inferred(status, phase, None);
}

#[cfg(test)]
fn reset_pad_run_status_for_test() {
    *pad_run_status_slot().lock() = ("idle".into(), String::new(), Instant::now());
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
    // Permission wait also forces show — in-app approval UI can steal FG from the main Codex HWND.
    let show = *last_foreground_codex().lock() || hook_needs_input_hold();
    let (pad_status, status_micro) = effective_pad_run_status();
    let vendor = crate::codex_micro_vendor::protocol_snapshot();
    let app_state_enabled = status_lights_enabled(cfg);
    let (
        app_last_event,
        app_last_source,
        app_last_seen_at,
        app_status,
        app_age_ms,
        app_confidence,
        app_agent,
        app_message,
        app_task_id,
        app_session_id,
    ) = app_fields_from_pad_core();
    let vendor_rgb = vendor.rgb.as_ref().map(|c| CodexMicroOverlayRgb {
        r: c.r,
        g: c.g,
        b: c.b,
    });
    let rgb = resolve_overlay_rgb(app_state_enabled, &app_status, &pad_status, vendor_rgb);
    let minimized = *overlay_minimized().lock();
    let Some((mapping, pad)) = active_codex_mapping_with_overlay(cfg) else {
        // Labs / loopback: still expose status merge on cells when protocol or app-state is live,
        // even if Codex Micro overlay mapping is not configured yet.
        let status_light_micro_key_id =
            resolve_status_light_micro_key_id_impl(&[], overlay_layout_has_micro_key);
        let cells = protocol_status_cells_if_active(
            &pad_status,
            &status_micro,
            &vendor,
            app_state_enabled,
            &status_light_micro_key_id,
        );
        return CodexMicroOverlaySnapshot {
            visible: false,
            enabled: false,
            overlay_enabled: false,
            pad_mode: "numpad".into(),
            joy_nav_panel_open: false,
            joy_arrows_live: false,
            joy_context_hint: String::new(),
            require_num_lock_off: false,
            num_lock_blocking: false,
            bound_count: 0,
            active_micro_key_id: String::new(),
            pad_status,
            status_micro_key_id: status_micro,
            status_light_micro_key_id,
            software_enhance_enabled: false,
            minimized,
            rgb,
            connection_state: vendor.connection_state.clone(),
            protocol_version: vendor.version.clone(),
            device_status: vendor.device_status.clone(),
            app_last_event,
            app_last_source,
            app_last_seen_at,
            app_status,
            app_age_ms,
            app_state_enabled,
            app_confidence,
            app_agent,
            app_message,
            app_task_id,
            app_session_id,
            cells,
        };
    };

    let status_light_micro_key_id = resolve_status_light_micro_key_id(pad);
    let mut bound_count = 0u32;
    let mut cells = Vec::with_capacity(OVERLAY_CELLS.len());
    for def in OVERLAY_CELLS {
        let route = route_for_micro(pad, def.micro_key_id);
        let slot_id = route.and_then(|r| {
            let s = r.slot_id.trim();
            if s.is_empty() { None } else { Some(s) }
        });
        let bound = if def.micro_key_id == "JOY" || def.micro_key_id == "ENC" {
            true
        } else {
            crate::codex_numpad_layer::micro_key_routable(mapping, pad, def.micro_key_id)
        };
        if bound {
            bound_count += 1;
        }
        let mut sub = String::new();
        if let Some(slot) = slot_id {
            if let Some(insert) = crate::agent::templates::slot_by_id(slot)
                .and_then(|s| s.insert_text)
            {
                sub = format!("插入 {insert}");
            } else if slot == "summonCodex" {
                sub = "召唤".into();
            } else if let Some(b) = agent_key_binding_for_slot(mapping, slot) {
                let chord = b.trigger_binding.trim();
                if !chord.is_empty() {
                    sub = chord.to_string();
                }
            }
        }
        let ui_icon_id = route
            .map(|r| r.ui_icon_id.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| def.default_icon.to_string());
        let source_kind = source_kind_for_route(def.micro_key_id, route).to_string();
        let (run_status, status_source, native_run_status) = resolve_cell_run_status(
            def.micro_key_id,
            &pad_status,
            &status_micro,
            &vendor,
            app_state_enabled,
            &status_light_micro_key_id,
        );
        let context_status = act_context_status(app_state_enabled, &app_status, &pad_status);
        let (context_rank, context_hint) =
            act_context_for(def.micro_key_id, &context_status);
        if !context_hint.is_empty() {
            if sub.is_empty() {
                sub = context_hint.clone();
            } else if !sub.contains(&context_hint) {
                sub = format!("{sub} · {context_hint}");
            }
        }
        cells.push(CodexMicroOverlayCell {
            micro_key_id: def.micro_key_id.to_string(),
            label: label_for_cell(def),
            bound,
            sub,
            ui_icon_id,
            kind: def.kind.to_string(),
            source_kind,
            run_status,
            status_source,
            native_run_status,
            context_rank,
            context_hint,
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

    let pad_mode = if pad.enabled {
        "codex".to_string()
    } else {
        "numpad".to_string()
    };
    // Recompute with actual pad.enabled (early helper used mapping probe only).
    let (joy_nav_panel_open, joy_arrows_live, joy_context_hint) = joy_context_fields(pad.enabled);
    let readiness = crate::codex_numpad_layer::readiness_snapshot(cfg);
    CodexMicroOverlaySnapshot {
        visible: show && pad.overlay_enabled,
        enabled: pad.enabled,
        overlay_enabled: pad.overlay_enabled,
        pad_mode,
        joy_nav_panel_open,
        joy_arrows_live,
        joy_context_hint,
        require_num_lock_off: pad.require_num_lock_off,
        num_lock_blocking: readiness.num_lock_blocking,
        bound_count,
        active_micro_key_id: active,
        pad_status,
        status_micro_key_id: status_micro,
        status_light_micro_key_id,
        software_enhance_enabled: pad.software_enhance_enabled,
        minimized,
        rgb,
        connection_state: vendor.connection_state.clone(),
        protocol_version: vendor.version.clone(),
        device_status: vendor.device_status.clone(),
        app_last_event,
        app_last_source,
        app_last_seen_at,
        app_status,
        app_age_ms,
        app_state_enabled,
        app_confidence,
        app_agent,
        app_message,
        app_task_id,
        app_session_id,
        cells,
    }
}

/// When overlay mapping is off but Codex protocol or app-state is live, still emit status cells.
fn protocol_status_cells_if_active(
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
) -> Vec<CodexMicroOverlayCell> {
    let app_live = app_state_enabled
        && (crate::pad_status::fresh_signal().is_some()
            || crate::pad_status::current()
                .last_event
                .as_ref()
                .map(|e| !e.is_empty())
                .unwrap_or(false));
    if vendor.connection_state == "fallback" && !vendor.ever_native && !app_live {
        return vec![];
    }
    build_protocol_status_cells(
        pad_status,
        status_micro,
        vendor,
        app_state_enabled,
        status_light_micro_key_id,
    )
}

fn build_protocol_status_cells(
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
) -> Vec<CodexMicroOverlayCell> {
    let app_status = crate::pad_status::ui_status_from_pad(&crate::pad_status::snapshot());
    let context_status = act_context_status(app_state_enabled, &app_status, pad_status);
    OVERLAY_CELLS
        .iter()
        .map(|def| {
            let (run_status, status_source, native_run_status) = resolve_cell_run_status(
                def.micro_key_id,
                pad_status,
                status_micro,
                vendor,
                app_state_enabled,
                status_light_micro_key_id,
            );
            let (context_rank, context_hint) =
                act_context_for(def.micro_key_id, &context_status);
            CodexMicroOverlayCell {
                micro_key_id: def.micro_key_id.to_string(),
                label: label_for_cell(def),
                bound: false,
                sub: context_hint.clone(),
                ui_icon_id: def.default_icon.to_string(),
                kind: def.kind.to_string(),
                source_kind: "none".into(),
                run_status,
                status_source,
                native_run_status,
                context_rank,
                context_hint,
            }
        })
        .collect()
}

/// Pick the UI status that drives ACT emphasize/dim (lights Core first, else local pad run).
fn act_context_status(app_state_enabled: bool, app_status: &str, pad_run: &str) -> String {
    if app_state_enabled {
        let st = app_status.trim();
        if !st.is_empty() && st != "idle" {
            return st.to_string();
        }
    }
    match pad_run.trim() {
        "listening" | "running" | "failed" | "needs_input" | "done" => pad_run.trim().to_string(),
        _ => "idle".into(),
    }
}

/// Visual ACT context only — does not block fire.
fn act_context_for(micro_key_id: &str, ui_status: &str) -> (String, String) {
    let id = micro_key_id.trim();
    if !id.starts_with("ACT") {
        return (String::new(), String::new());
    }
    match ui_status {
        "needs_input" => match id {
            "ACT12" => ("emphasize".into(), "确认".into()),
            "ACT08" => ("emphasize".into(), "拒绝".into()),
            "ACT06" | "ACT07" | "ACT10" => ("dim".into(), String::new()),
            _ => (String::new(), String::new()),
        },
        "running" => match id {
            "ACT08" => ("emphasize".into(), "可取消".into()),
            "ACT12" => ("dim".into(), String::new()),
            _ => (String::new(), String::new()),
        },
        "listening" => match id {
            "ACT10" => ("emphasize".into(), "听写中".into()),
            "ACT06" | "ACT07" | "ACT12" => ("dim".into(), String::new()),
            _ => (String::new(), String::new()),
        },
        "failed" => match id {
            "ACT08" => ("emphasize".into(), "取消".into()),
            _ => (String::new(), String::new()),
        },
        _ => (String::new(), String::new()),
    }
}

/// When status lights are on, the resolved status-light host reads **only** pad_status State Core.
/// Other AG: native-first, else idle/fallback. Non-AG: inferred only.
/// Core host branch runs before non-AG early-return so ACT*/NAV* can host the lamp.
fn resolve_cell_run_status(
    micro_key_id: &str,
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
) -> (String, String, String) {
    let inferred = if !status_micro.is_empty() && status_micro == micro_key_id {
        pad_status.to_string()
    } else {
        "idle".into()
    };

    let native_for = |id: &str| -> String {
        let Some(idx) = crate::codex_micro_vendor::agent_slot_index(id) else {
            return String::new();
        };
        if crate::codex_micro_vendor::native_fresh(vendor) {
            vendor.agent_slots[idx]
                .as_ref()
                .map(|s| s.state.clone())
                .unwrap_or_default()
        } else {
            String::new()
        }
    };

    // Status-lights path: host lamp is exclusively pad_status (no local re-judge).
    if app_state_enabled
        && !status_light_micro_key_id.is_empty()
        && micro_key_id == status_light_micro_key_id
    {
        let native = native_for(micro_key_id);
        let pad = crate::pad_status::snapshot();
        if pad.updated_at > 0 {
            let ui = crate::pad_status::ui_status_from_pad(&pad);
            let src = pad.display_source_label().to_string();
            return (ui, src, native);
        }
    }

    let Some(idx) = crate::codex_micro_vendor::agent_slot_index(micro_key_id) else {
        return (inferred, "inferred".into(), String::new());
    };

    let fresh = crate::codex_micro_vendor::native_fresh(vendor);
    if fresh {
        if let Some(slot) = vendor.agent_slots[idx].as_ref() {
            let st = slot.state.clone();
            return (st.clone(), "native".into(), st);
        }
    }

    if inferred != "idle" {
        return (inferred, "inferred".into(), String::new());
    }
    ("idle".into(), "fallback".into(), String::new())
}

fn app_fields_from_pad_core(
) -> (
    String,
    String,
    u64,
    String,
    u64,
    String,
    String,
    String,
    String,
    String,
) {
    // Do not inject native AG0 into State Core on every snapshot — status-lights
    // path must keep Hook as status-host truth when lights are on (native still wins
    // via resolve_cell_run_status when lights are off).
    let pad = crate::pad_status::snapshot();
    let status = crate::pad_status::ui_status_from_pad(&pad);
    (
        pad.last_event.clone().unwrap_or_default(),
        pad.display_source_label().to_string(),
        pad.updated_at,
        status,
        pad.age_ms(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        ),
        pad.confidence.clone(),
        pad.agent.clone().unwrap_or_default(),
        pad.message.clone().unwrap_or_default(),
        pad.task_id.clone().unwrap_or_default(),
        pad.session_id.clone().unwrap_or_default(),
    )
}

/// Soft RGB Output Adapter: status-lights → Core UI status; else local pad run, then vendor rgbcfg.
fn resolve_overlay_rgb(
    app_state_enabled: bool,
    app_status: &str,
    pad_run_status: &str,
    vendor_rgb: Option<CodexMicroOverlayRgb>,
) -> Option<CodexMicroOverlayRgb> {
    let semantic = if app_state_enabled {
        crate::pad_status::rgb_for_ui_status(app_status)
    } else {
        crate::pad_status::rgb_for_ui_status(pad_run_status)
    };
    if let Some((r, g, b)) = semantic {
        return Some(CodexMicroOverlayRgb { r, g, b });
    }
    if app_state_enabled {
        // Status-lights mode: never keep sticky vendor mint when idle.
        return None;
    }
    vendor_rgb
}

/// Deprecated joyNavPanelOpen always false; joy_arrows_live = pad_active && Codex FG.
fn joy_context_fields(pad_enabled: bool) -> (bool, bool, String) {
    let _ = pad_enabled;
    let live = crate::codex_numpad_layer::pad_should_capture_arrows();
    let hint = if live {
        "方向键已接入".into()
    } else if crate::codex_numpad_layer::pad_mapping_active() {
        "切到 Codex 前台后方向键生效".into()
    } else {
        String::new()
    };
    (false, live, hint)
}

/// Prefer the enabled Codex scenario that drives the overlay; fall back to any Codex mapping.
fn codex_mapping_index_for_pad_toggle(cfg: &VoiceConfig) -> Option<usize> {
    let active = cfg.mappings.iter().position(|m| {
        m.enabled
            && m.app_target_id.trim() == CODEX_APP_TARGET_ID
            && m.codex_micro_pad
                .as_ref()
                .map(|p| p.overlay_enabled)
                .unwrap_or(true)
    });
    if active.is_some() {
        return active;
    }
    cfg.mappings
        .iter()
        .position(|m| m.enabled && m.app_target_id.trim() == CODEX_APP_TARGET_ID)
        .or_else(|| {
            cfg.mappings
                .iter()
                .position(|m| m.app_target_id.trim() == CODEX_APP_TARGET_ID)
        })
}

/// Toggle Codex ↔ numpad mode (`pad.enabled` only). Does not hide the overlay.
/// Disk save runs off the cfg lock — sync pretty-print + bak under lock used to 假死
/// the UI when the mode switch was clicked several times quickly.
pub fn toggle_pad_mode(app: &AppHandle, state: &AppState) -> Result<String, String> {
    let mode;
    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(idx) = codex_mapping_index_for_pad_toggle(&cfg) else {
            return Err("no_mapping".into());
        };
        // Enabling pad mode on a dormant mapping also re-enables the scenario,
        // otherwise sync_hook_cache skips it and the switch looks ON but keys stay dead.
        if !cfg.mappings[idx].enabled {
            cfg.mappings[idx].enabled = true;
        }
        let pad = cfg.mappings[idx]
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        pad.enabled = !pad.enabled;
        if !pad.overlay_enabled {
            pad.overlay_enabled = true;
        }
        if !pad.enabled {
            crate::codex_numpad_layer::set_joy_nav_panel_open(false);
        }
        mode = if pad.enabled {
            "codex".to_string()
        } else {
            "numpad".to_string()
        };
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }
    let _ = std::thread::Builder::new()
        .name("codex-pad-mode-save".into())
        .spawn(move || {
            crate::config::save_config(&cfg_to_save);
        });
    push_state(app, state);
    Ok(mode)
}

/// Legacy no-op: side-rail removed. Always returns false so old FE does not open a rail.
pub fn toggle_joy_nav_panel(app: &AppHandle, state: &AppState) -> Result<bool, String> {
    crate::codex_numpad_layer::set_joy_nav_panel_open(false);
    push_state(app, state);
    Ok(false)
}

/// Legacy ENC master toggle (kept for compatibility). Prefer `toggle_pad_mode`.
pub fn toggle_pad_master(app: &AppHandle, state: &AppState) -> Result<bool, String> {
    let mode = toggle_pad_mode(app, state)?;
    Ok(mode == "codex")
}

/// Toggle NumLock routing mode (legacy; settings-page only). Kept for compatibility.
pub fn toggle_pad_num_mode(app: &AppHandle, state: &AppState) -> Result<bool, String> {
    let require_off;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg
            .mappings
            .iter_mut()
            .find(|m| m.app_target_id.trim() == crate::app_chat_workflow::CODEX_APP_TARGET_ID)
        else {
            return Err("no_mapping".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        pad.require_num_lock_off = !pad.require_num_lock_off;
        require_off = pad.require_num_lock_off;
        crate::config::save_config(&cfg);
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
    }
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let _ = crate::keyboard::send_chord("NumLock", duration_ms);
    push_state(app, state);
    Ok(require_off)
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
            // Always refresh HWND before pass-through — status-only pushes used to skip this.
            cache_overlay_hwnd_from_window(&win);
            if visible && reposition {
                // Geometry may no-op (mode switch), but we must still show after Codex FG
                // returns — skipping show when geom was unchanged left the pad hidden.
                let _ = apply_overlay_geometry(&win, &payload);
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
            // Permission wait: click-through so Codex dialog stays usable (avoids 假死感).
            if visible {
                sync_needs_input_pass_through(&win, &payload);
            } else {
                set_overlay_click_through(false);
                let _ = win.set_ignore_cursor_events(false);
            }
            let _ = win.emit("codex_micro_overlay_state", &payload);
        });
}

fn overlay_logical_size(minimized: bool, _joy_open: bool) -> (f64, f64) {
    if minimized {
        (OVERLAY_WIDTH_MINI, OVERLAY_HEIGHT_MINI)
    } else {
        // NAV keys live on the 5-col main pad — no side-rail width reserve.
        (OVERLAY_WIDTH, OVERLAY_HEIGHT_FULL)
    }
}

/// Resize overlay only when minimized toggles. JOY open/close must not move the window.
fn apply_overlay_geometry(win: &WebviewWindow, snapshot: &CodexMicroOverlaySnapshot) -> bool {
    let minimized = snapshot.minimized;
    let (logical_w, logical_h) = overlay_logical_size(minimized, snapshot.joy_nav_panel_open);
    let prev = *overlay_last_geom().lock();

    if prev == Some(minimized) {
        return false;
    }

    if *overlay_user_positioned().lock() {
        if let Some((x, y)) = *overlay_user_position().lock() {
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
        }
    } else {
        position_overlay(win);
    }
    let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));
    *overlay_last_geom().lock() = Some(minimized);
    true
}

/// Keep the main keyboard's screen position stable while width changes (minimize path helpers).
#[allow(dead_code)]
fn resize_overlay_anchored(win: &WebviewWindow, logical_w: f64, logical_h: f64) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let target_w = (logical_w * scale).round() as i32;

    let Ok(pos) = win.outer_position() else {
        let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));
        return;
    };
    let Ok(size) = win.outer_size() else {
        let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));
        return;
    };

    let new_x = anchored_origin_x(pos.x, size.width, target_w);
    let new_y = pos.y;

    let _ = win.set_position(Position::Physical(PhysicalPosition::new(new_x, new_y)));
    let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));

    if *overlay_user_positioned().lock() {
        *overlay_user_position().lock() = Some((new_x, new_y));
    }
}

/// Physical X so the right edge of the window stays fixed when width changes.
fn anchored_origin_x(old_x: i32, old_width: u32, target_width: i32) -> i32 {
    let dw = target_width - old_width as i32;
    old_x - dw
}

fn position_overlay(win: &WebviewWindow) {
    if *overlay_user_positioned().lock() {
        if let Some((x, y)) = *overlay_user_position().lock() {
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
            return;
        }
    }

    let minimized = *overlay_minimized().lock();
    let joy_open = crate::codex_numpad_layer::joy_nav_panel_open()
        && crate::codex_numpad_layer::pad_mapping_active();
    let (logical_w, logical_h) = overlay_logical_size(minimized, joy_open);
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
/// Next time Codex becomes foreground, `ensure_codex_pad_ready` re-enables the overlay.
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
                || blocker == "no_mapping";
            // Note: "pad_off" is intentional numpad mode — do not auto-re-enable.
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
        active_codex_mapping_with_overlay(&cfg).is_some() && (host_ok || hook_needs_input_hold())
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
    } else if hook_needs_input_hold() {
        // Re-assert click-through ~1Hz while permission wait is sticky (HWND/EXSTYLE can reset).
        let mut last = last_pass_resync().lock();
        let now = Instant::now();
        if last.map(|t| now.duration_since(t) >= Duration::from_millis(1000)).unwrap_or(true) {
            *last = Some(now);
            drop(last);
            push_overlay_status(app, state);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{MappingEntry, TriggerMode, VoiceConfig};

    /// Isolate global vendor / app / pad_status / local inferred run status.
    fn isolate_status_globals() -> (
        std::sync::MutexGuard<'static, ()>,
        std::sync::MutexGuard<'static, ()>,
        std::sync::MutexGuard<'static, ()>,
    ) {
        let g = crate::codex_micro_vendor::test_protocol_lock();
        let app = crate::codex_app_state::test_store_lock();
        let pad = crate::pad_status::test_lock();
        crate::codex_micro_vendor::reset_protocol_state();
        crate::codex_app_state::reset_for_test();
        crate::pad_status::reset_for_test();
        reset_pad_run_status_for_test();
        (g, app, pad)
    }

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
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: false,
            layout_profile: String::new(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.visible);
        assert!(snap.cells.is_empty());
    }

    #[test]
    fn protocol_status_cells_without_overlay_mapping() {
        let _iso = isolate_status_globals();
        let raw = r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"},{"i":1,"s":"needs_input"}]}}"#;
        let _ = crate::codex_micro_vendor::apply_rpc_json(raw);
        let cfg = VoiceConfig::default();
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.connection_state, "connected");
        assert!(!snap.cells.is_empty());
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        let ag01 = snap.cells.iter().find(|c| c.micro_key_id == "AG01").unwrap();
        assert_eq!(ag00.status_source, "native");
        assert_eq!(ag00.run_status, "running");
        assert_eq!(ag01.status_source, "native");
        assert_eq!(ag01.run_status, "needs_input");
    }

    #[test]
    fn anchored_origin_keeps_right_edge() {
        // Expand 432 → 584 (+152): origin shifts left by 152.
        assert_eq!(anchored_origin_x(1000, 432, 584), 848);
        // Collapse 584 → 432 (-152): origin shifts right by 152.
        assert_eq!(anchored_origin_x(848, 584, 432), 1000);
        // No change.
        assert_eq!(anchored_origin_x(100, 432, 432), 100);
    }

    #[test]
    fn overlay_visible_in_numpad_mode_when_overlay_enabled() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: false,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible, "numpad mode must keep overlay visible");
        assert!(!snap.enabled);
        assert_eq!(snap.pad_mode, "numpad");
        assert!(!snap.joy_nav_panel_open);
        assert!(!snap.cells.is_empty());
    }

    #[test]
    fn overlay_sub_prefers_insert_text_and_act07_is_command_palette() {
        let _iso = isolate_status_globals();
        use crate::config::{AgentBinding, CodexMicroPadKeyRoute};

        let mut mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
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
        let _iso = isolate_status_globals();
        use crate::config::CodexMicroPadKeyRoute;

        let mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
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

    #[test]
    fn overlay_ag_fresh_native_wins() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":1,"s":"running"}]}}"#,
        );
        note_pad_run_status("listening", "AG01");
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let ag01 = snap.cells.iter().find(|c| c.micro_key_id == "AG01").unwrap();
        assert_eq!(ag01.run_status, "running");
        assert_eq!(ag01.status_source, "native");
        assert_eq!(ag01.native_run_status, "running");
        let act = snap.cells.iter().find(|c| c.micro_key_id == "ACT06").unwrap();
        assert_eq!(act.status_source, "inferred");
        assert_eq!(act.run_status, "idle");
        assert_eq!(snap.connection_state, "connected");
    }

    #[test]
    fn overlay_status_light_fallback_ag00_when_no_status_slot() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"s"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.app_state_enabled);
        assert_eq!(snap.app_last_source, "codex_hook");
        assert_eq!(snap.app_last_event, "UserPromptSubmit");
        assert_eq!(snap.app_status, "running");
        assert!(snap.app_last_seen_at > 0);
        assert_eq!(snap.status_light_micro_key_id, "AG00");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_eq!(ag00.status_source, "codex_hook");
        assert_eq!(ag00.run_status, "running");
        let ag01 = snap.cells.iter().find(|c| c.micro_key_id == "AG01").unwrap();
        assert_ne!(ag01.status_source, "codex_hook");
    }

    #[test]
    fn overlay_ag_ignores_hook_merge_when_status_lights_off() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"s"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.app_state_enabled);
        assert_eq!(snap.app_last_source, "codex_hook");
        assert_eq!(snap.app_last_event, "UserPromptSubmit");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_ne!(ag00.status_source, "codex_hook");
    }

    #[test]
    fn overlay_ag_stale_falls_back_to_inferred_or_fallback() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"needs_input"}]}}"#,
        );
        // Force stale native (far in the past).
        crate::codex_micro_vendor::test_force_last_update_ms(1);
        note_pad_run_status("running", "AG00");
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_eq!(ag00.run_status, "running");
        assert_eq!(ag00.status_source, "inferred");
        assert!(ag00.native_run_status.is_empty());

        // Clear local status → fallback idle.
        note_pad_run_status("idle", "");
        let snap2 = build_snapshot_from_cfg(&cfg);
        let ag00b = snap2.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_eq!(ag00b.run_status, "idle");
        assert_eq!(ag00b.status_source, "fallback");
    }

    #[test]
    fn overlay_status_lights_prefer_hook_over_native_on_fallback_host() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"}]}}"#,
        );
        let _ = crate::codex_app_state::apply_raw_json(
            r#"{"source":"codex_hook","event":"PermissionRequest","sessionId":"s"}"#,
        )
        .unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "needs_input");
        assert_eq!(snap.status_light_micro_key_id, "AG00");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_eq!(ag00.status_source, "codex_hook");
        assert_eq!(ag00.run_status, "needs_input");
        let rgb = snap.rgb.expect("soft rgb for needs_input");
        assert_eq!((rgb.r, rgb.g, rgb.b), (255, 106, 0));
        assert_eq!(snap.app_message, "等待确认");
        assert_eq!(snap.app_session_id, "s");
        assert!(snap.app_task_id.is_empty());
    }

    fn status_route(micro: &str) -> crate::config::CodexMicroPadKeyRoute {
        crate::config::CodexMicroPadKeyRoute {
            micro_key_id: micro.into(),
            source_scan: 0x4C,
            source_extended: false,
            slot_id: "status".into(),
            ui_icon_id: "status".into(),
            enabled: true,
            advanced: false,
        }
    }

    #[test]
    fn resolve_status_light_prefers_status_slot_then_ag00_then_empty() {
        use crate::config::CodexMicroPadKeyRoute;
        let with_status = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![status_route("AG05")],
        };
        assert_eq!(resolve_status_light_micro_key_id(&with_status), "AG05");

        let empty = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![],
        };
        assert_eq!(resolve_status_light_micro_key_id(&empty), "AG00");

        let no_layout = resolve_status_light_micro_key_id_impl(&[], |_| false);
        assert_eq!(no_layout, "");

        let status_off_layout = resolve_status_light_micro_key_id_impl(
            &[CodexMicroPadKeyRoute {
                micro_key_id: "GHOST".into(),
                source_scan: 0,
                source_extended: false,
                slot_id: "status".into(),
                ui_icon_id: String::new(),
                enabled: true,
                advanced: false,
            }],
            |id| id != "GHOST",
        );
        assert_eq!(status_off_layout, "");
    }

    #[test]
    fn overlay_status_lights_follow_status_slot_to_ag05() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"s"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![status_route("AG05")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "AG05");
        let ag05 = snap.cells.iter().find(|c| c.micro_key_id == "AG05").unwrap();
        assert_eq!(ag05.status_source, "codex_hook");
        assert_eq!(ag05.run_status, "running");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_ne!(ag00.status_source, "codex_hook");
        assert_ne!(ag00.run_status, "running");
    }

    #[test]
    fn overlay_status_lights_follow_status_slot_to_act09() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"codex_hook","event":"PermissionRequest","sessionId":"s"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![status_route("ACT09")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "ACT09");
        let act09 = snap.cells.iter().find(|c| c.micro_key_id == "ACT09").unwrap();
        assert_eq!(act09.status_source, "codex_hook");
        assert_eq!(act09.run_status, "needs_input");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_ne!(ag00.status_source, "codex_hook");
    }

    #[test]
    fn overlay_status_lights_host_ignores_core_when_lights_off() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"s"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![status_route("AG05")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "AG05");
        assert!(!snap.app_state_enabled);
        let ag05 = snap.cells.iter().find(|c| c.micro_key_id == "AG05").unwrap();
        assert_ne!(ag05.status_source, "codex_hook");
    }

    #[test]
    fn overlay_claude_hook_sets_app_agent_and_claude_source_on_host() {
        let _iso = isolate_status_globals();
        let raw = r#"{"source":"claude_hook","event":"UserPromptSubmit","sessionId":"cs"}"#;
        let _ = crate::codex_app_state::apply_raw_json(raw).unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![status_route("AG04")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_agent, "claude");
        assert_eq!(snap.app_last_source, "claude_hook");
        assert_eq!(snap.status_light_micro_key_id, "AG04");
        let host = snap.cells.iter().find(|c| c.micro_key_id == "AG04").unwrap();
        assert_eq!(host.status_source, "claude_hook");
        assert_eq!(host.run_status, "running");
        let ag00 = snap.cells.iter().find(|c| c.micro_key_id == "AG00").unwrap();
        assert_ne!(ag00.status_source, "claude_hook");
    }

    #[test]
    fn overlay_status_lights_ignore_vendor_rgb_when_idle() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.rgbcfg","p":{"r":12,"g":34,"b":56}}"#,
        );
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "idle");
        assert!(snap.rgb.is_none(), "status lights idle must not keep vendor mint");
    }

    #[test]
    fn overlay_stays_visible_during_hook_needs_input_without_fg() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_app_state::apply_raw_json(
            r#"{"source":"codex_hook","event":"PermissionRequest","sessionId":"s"}"#,
        )
        .unwrap();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            keys: vec![],
        })];
        // Permission sheet stole FG — latch false, but pad must remain as status beacon.
        test_set_foreground_latch(false);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible, "needs_input must keep overlay visible without FG");
        assert_eq!(snap.app_status, "needs_input");
    }

    #[test]
    fn overlay_snapshot_carries_rgb_and_protocol_debug() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.rgbcfg","p":{"r":12,"g":34,"b":56}}"#,
        );
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"sys.version","p":{"v":"9.9.9"}}"#,
        );
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"device.status","p":{"s":"ok"}}"#,
        );
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let rgb = snap.rgb.expect("rgb");
        assert_eq!((rgb.r, rgb.g, rgb.b), (12, 34, 56));
        assert_eq!(snap.protocol_version, "9.9.9");
        assert!(!snap.device_status.is_empty());
    }

    #[test]
    fn joy_arrows_live_follows_pad_active_not_rail() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            keys: vec![],
        })];
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        crate::codex_numpad_layer::set_joy_nav_panel_open(true);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.joy_nav_panel_open, "side-rail deprecated → always false");
        assert!(!snap.joy_arrows_live, "no real Codex FG → arrows not live");
        assert!(
            snap.joy_context_hint.contains("前台") || snap.joy_context_hint.contains("方向"),
            "hint={}",
            snap.joy_context_hint
        );
    }

    #[test]
    fn act_context_needs_input_emphasizes_confirm_reject() {
        let (rank12, hint12) = act_context_for("ACT12", "needs_input");
        assert_eq!(rank12, "emphasize");
        assert_eq!(hint12, "确认");
        let (rank08, hint08) = act_context_for("ACT08", "needs_input");
        assert_eq!(rank08, "emphasize");
        assert_eq!(hint08, "拒绝");
        let (rank10, _) = act_context_for("ACT10", "needs_input");
        assert_eq!(rank10, "dim");
        let (rank_ag, _) = act_context_for("AG00", "needs_input");
        assert!(rank_ag.is_empty());
    }

    #[test]
    fn act_context_running_and_listening() {
        assert_eq!(act_context_for("ACT08", "running").0, "emphasize");
        assert_eq!(act_context_for("ACT12", "running").0, "dim");
        assert_eq!(act_context_for("ACT10", "listening").0, "emphasize");
        assert!(act_context_for("ACT08", "idle").0.is_empty());
    }

    #[test]
    fn act_context_status_prefers_app_when_lights_on() {
        assert_eq!(
            act_context_status(true, "needs_input", "running"),
            "needs_input"
        );
        assert_eq!(act_context_status(true, "idle", "listening"), "listening");
        assert_eq!(act_context_status(false, "needs_input", "running"), "running");
    }
}
