//! Codex Micro always-on-top overlay ? compact pad grid when Codex is foreground.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
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
/// Pad chassis (400) + usage caption + light-gate / nav CTA + root pad.
/// Keep ahead of content: short windows clip the bottom caption/gate (flat cut).
const OVERLAY_HEIGHT_FULL: f64 = 680.0;
/// Left NAV rail strip is always reserved in the window so JOY open/close never
/// resizes/repositions the pad (CSS fades the rail in-place).
/// Deprecated: JOY side-rail removed; NAV keys live on the 5-col main pad.
#[allow(dead_code)]
/// 6 agent chips + usage pill (`Cu · N次`) + expand/close; 240px crushed the pill to "C.".
const OVERLAY_WIDTH_MINI: f64 = 320.0;
const OVERLAY_HEIGHT_MINI: f64 = 44.0;
/// Extra band for Cursor beginner listen hint under mini bar.
const OVERLAY_HEIGHT_MINI_LISTEN: f64 = 68.0;
const HIGHLIGHT_MS: u64 = 900;

static ACTIVE_MICRO_KEY: OnceLock<Mutex<String>> = OnceLock::new();
static HIGHLIGHT_UNTIL: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_FOREGROUND_CODEX: OnceLock<ParkingMutex<bool>> = OnceLock::new();
/// Last applied click-through (needs_input pass-through to Codex permission UI).
static LAST_PASS_THROUGH: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static LAST_PASS_RESYNC: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_VISIBLE: OnceLock<ParkingMutex<bool>> = OnceLock::new();
/// Last time Soft Pad was allowed to show for a real agent/hold reason (not overlay FG steal).
static LAST_AGENT_SHOW_REASON_AT: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static FG_CONFIRM: OnceLock<ParkingMutex<(bool, u8)>> = OnceLock::new();
/// When Soft Pad was showing and host raw goes false, delay hide to ride out Alt-Tab FG gaps.
static HIDE_GRACE_SINCE: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
/// Hide grace while FG briefly leaves Soft Pad agents (Alt-Tab / Cursor switch).
const OVERLAY_HIDE_GRACE_MS: u64 = 500;
/// (status, micro_key_id, since)
static PAD_RUN_STATUS: OnceLock<ParkingMutex<(String, String, Instant)>> = OnceLock::new();
static OVERLAY_MINIMIZED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
/// Mapping id whose `presentation` was last synced into `OVERLAY_MINIMIZED`.
/// Re-sync only on mapping switch — never every snapshot (that fights expand/minimize).
static OVERLAY_PRESENTATION_MAPPING_ID: OnceLock<ParkingMutex<String>> = OnceLock::new();
static OVERLAY_USER_POSITIONED: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static OVERLAY_USER_POSITION: OnceLock<ParkingMutex<Option<(i32, i32)>>> = OnceLock::new();
/// Last applied (minimized, logical_w, logical_h). Width must participate so mini widen
/// actually resizes; do not fight outer_size 1–2px DPI drift every tick (that 假死's mini).
static OVERLAY_LAST_GEOM: OnceLock<ParkingMutex<Option<(bool, i32, i32)>>> = OnceLock::new();
/// Soft dismiss (X / settings open): hide until Soft Pad agent FG/process or settings close.
/// Does not persist overlay_enabled=false (settings "不显示浮窗" owns that durable flag).
static OVERLAY_SESSION_DISMISSED: OnceLock<ParkingMutex<bool>> = OnceLock::new();

const STATUS_RUNNING_MS: u64 = 800;
const STATUS_DONE_MS: u64 = 600;
const STATUS_FAILED_MS: u64 = 1200;
/// Soft Pad stays host-visible while Claude Hook/App activity is within this window.
pub const CLAUDE_ACTIVITY_SHOW_MS: u64 = 5 * 60 * 1000;

#[cfg(test)]
static TEST_FORCE_CODEX_FG: OnceLock<ParkingMutex<Option<bool>>> = OnceLock::new();
#[cfg(test)]
static TEST_FORCE_CLAUDE_FG: OnceLock<ParkingMutex<Option<bool>>> = OnceLock::new();

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
fn test_force_codex_fg() -> &'static ParkingMutex<Option<bool>> {
    TEST_FORCE_CODEX_FG.get_or_init(|| ParkingMutex::new(None))
}

#[cfg(test)]
fn test_force_claude_fg() -> &'static ParkingMutex<Option<bool>> {
    TEST_FORCE_CLAUDE_FG.get_or_init(|| ParkingMutex::new(None))
}

#[cfg(test)]
pub(crate) fn test_set_foreground_latch(v: bool) {
    *last_foreground_codex().lock() = v;
    *fg_confirm().lock() = (v, 2);
    *hide_grace_since().lock() = None;
    *test_force_codex_fg().lock() = Some(v);
}

#[cfg(test)]
pub(crate) fn test_set_claude_foreground(v: bool) {
    *test_force_claude_fg().lock() = Some(v);
}

#[cfg(test)]
pub(crate) fn test_clear_fg_overrides() {
    *test_force_codex_fg().lock() = None;
    *test_force_claude_fg().lock() = None;
    *fg_confirm().lock() = (false, 0);
    *last_foreground_codex().lock() = false;
    *hide_grace_since().lock() = None;
}

/// Prime single-sample debounce so the next snapshot/tick sees a stable host.
#[cfg(test)]
pub(crate) fn test_prime_visible_host() {
    let _ = overlay_should_be_visible_host();
    let _ = overlay_should_be_visible_host();
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
            status == "needs_input"
                && (source == "codex_hook" || source == "codex_app" || source == "cursor_hook")
        }
        None => false,
    }
}

fn overlay_runtime_gate_flags(state: &AppState) -> (bool, bool, bool, bool) {
    let setup_open = *state.setup_interaction_active.lock();
    let settings_open = *state.settings_drawer_open.lock();
    let verify_active = state.trigger_verify_listen.lock().is_some();
    let recording_active = *state.recording.lock();
    (setup_open, settings_open, verify_active, recording_active)
}

/// Pure gate reason — unit-tested without a full AppState.
pub(crate) fn overlay_runtime_gate_reason_flags(
    setup_open: bool,
    settings_open: bool,
    verify_active: bool,
    recording_active: bool,
) -> Option<&'static str> {
    if setup_open {
        Some("setup_open")
    } else if settings_open {
        Some("settings_open")
    } else if verify_active {
        Some("verify_active")
    } else if recording_active {
        Some("recording_active")
    } else {
        None
    }
}

fn overlay_runtime_gate_reason(state: &AppState) -> Option<&'static str> {
    let (setup_open, settings_open, verify_active, recording_active) =
        overlay_runtime_gate_flags(state);
    overlay_runtime_gate_reason_flags(setup_open, settings_open, verify_active, recording_active)
}

/// Toggle WS_EX_TRANSPARENT on the overlay HWND (any thread ? does not need the UI loop).
/// Used so PermissionRequest can enable click-through even when WebView main is wedged.
pub fn set_overlay_click_through(pass: bool) {
    set_overlay_click_through_impl(pass, false);
}

/// Soft Pad must stay clickable without becoming the foreground window.
/// Without WS_EX_NOACTIVATE, pad clicks steal FG from Codex; SendInput then lands in the
/// overlay WebView2 (Ctrl+F/N) and freezes the pad.
#[cfg(windows)]
pub fn apply_overlay_no_activate() {
    let hwnd = *overlay_hwnd_cache().lock();
    if hwnd == 0 {
        return;
    }
    unsafe {
        use winapi::um::winuser::{
            GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_NOACTIVATE,
        };
        let hwnd = hwnd as winapi::shared::windef::HWND;
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let new_style = style | WS_EX_NOACTIVATE as i32 | WS_EX_LAYERED as i32;
        if new_style != style {
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style);
        }
        let _ = crate::keyboard::show_window_no_activate(hwnd);
    }
}

#[cfg(not(windows))]
pub fn apply_overlay_no_activate() {}

/// Temporarily punch Soft Pad so screen/client clicks reach Cursor Composer under it.
/// Restores previous pass-through + WebView ignore-cursor on drop.
pub struct SoftPadSendPassGuard {
    app: AppHandle,
    restore_pass: bool,
}

impl SoftPadSendPassGuard {
    pub fn engage(app: &AppHandle) -> Self {
        let restore_pass = *last_pass_through().lock();
        set_overlay_click_through_impl(true, true);
        if let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) {
            let _ = win.set_ignore_cursor_events(true);
        }
        Self {
            app: app.clone(),
            restore_pass,
        }
    }
}

impl Drop for SoftPadSendPassGuard {
    fn drop(&mut self) {
        set_overlay_click_through_impl(self.restore_pass, true);
        if let Some(win) = self.app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) {
            let _ = win.set_ignore_cursor_events(self.restore_pass);
        }
    }
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
            // Do not stamp `last` ? otherwise a later identical `pass` becomes a no-op
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
            apply_overlay_no_activate();
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

/// Punch-through only while the sticky agent's own window owns FG.
/// Applied lane alone is wrong: sticky Codex needs_input keeps Applied on Codex while the
/// user is in Cursor/explorer ? pad would stay click-through and undraggable.
fn soft_pad_pass_through_decision(
    visible: bool,
    app_state_enabled: bool,
    app_status: &str,
    app_last_source: &str,
    codex_fg: bool,
    claude_fg: bool,
) -> bool {
    if !visible || !app_state_enabled || app_status != "needs_input" {
        return false;
    }
    match app_last_source {
        "codex_hook" | "codex_app" => codex_fg,
        "claude_hook" | "claude_app" => claude_fg,
        _ => false,
    }
}

fn soft_pad_pass_through_for_needs_input(snap: &CodexMicroOverlaySnapshot) -> bool {
    soft_pad_pass_through_decision(
        snap.visible,
        snap.app_state_enabled,
        &snap.app_status,
        &snap.app_last_source,
        codex_is_foreground(),
        claude_is_foreground(),
    )
}

/// While Hook asks for permission, let clicks reach that agent's dialog.
fn sync_needs_input_pass_through(win: &WebviewWindow, snap: &CodexMicroOverlaySnapshot) {
    cache_overlay_hwnd_from_window(win);
    let pass = soft_pad_pass_through_for_needs_input(snap);
    // Force re-apply while holding needs_input ? HWND / EXSTYLE can be reset by show/geometry.
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
                let _ =
                    crate::keyboard::show_window_no_activate(hwnd as winapi::shared::windef::HWND);
            } else {
                let _ = win.show();
            }
        }
        #[cfg(not(windows))]
        {
            let _ = win.show();
        }
    }
    // Side-rail removed ? keep latch closed for any legacy readers.
    if pass {
        crate::codex_numpad_layer::set_joy_nav_panel_open(false);
    }
}

pub fn soft_pad_overlay_visible() -> bool {
    *last_visible().lock()
}

fn last_visible() -> &'static ParkingMutex<bool> {
    LAST_VISIBLE.get_or_init(|| ParkingMutex::new(false))
}

fn fg_confirm() -> &'static ParkingMutex<(bool, u8)> {
    FG_CONFIRM.get_or_init(|| ParkingMutex::new((false, 0)))
}

fn hide_grace_since() -> &'static ParkingMutex<Option<Instant>> {
    HIDE_GRACE_SINCE.get_or_init(|| ParkingMutex::new(None))
}

fn overlay_minimized() -> &'static ParkingMutex<bool> {
    OVERLAY_MINIMIZED.get_or_init(|| ParkingMutex::new(false))
}

fn overlay_presentation_mapping_id() -> &'static ParkingMutex<String> {
    OVERLAY_PRESENTATION_MAPPING_ID.get_or_init(|| ParkingMutex::new(String::new()))
}

/// Runtime mini/full: keep user expand/minimize across snapshot ticks **and** Soft Pad
/// mapping / FG switches. `pad.presentation` only seeds the first attach — otherwise
/// focusing MiniMax (presentation still mini) collapsed a user-expanded pad into a
/// ~44px window while chrome briefly stayed full (−/×), which looked like a broken strip.
fn resolve_minimized_on_mapping_change(
    mapping_id: &str,
    pad_is_mini: bool,
    last_mapping_id: &mut String,
    runtime_minimized: &mut bool,
) -> bool {
    if last_mapping_id.is_empty() {
        last_mapping_id.push_str(mapping_id);
        *runtime_minimized = pad_is_mini;
    } else if last_mapping_id.as_str() != mapping_id {
        last_mapping_id.clear();
        last_mapping_id.push_str(mapping_id);
    }
    *runtime_minimized
}

fn sync_minimized_for_mapping(mapping_id: &str, pad: &CodexMicroPadConfig) -> bool {
    let mut runtime = overlay_minimized().lock();
    let mut last_mid = overlay_presentation_mapping_id().lock();
    let before = last_mid.clone();
    let out = resolve_minimized_on_mapping_change(
        mapping_id,
        presentation_is_mini(pad),
        &mut last_mid,
        &mut runtime,
    );
    if before.as_str() != last_mid.as_str() {
        crate::pad_status::invalidate_hook_configured_cache();
    }
    out
}

fn overlay_user_positioned() -> &'static ParkingMutex<bool> {
    OVERLAY_USER_POSITIONED.get_or_init(|| ParkingMutex::new(false))
}

fn overlay_user_position() -> &'static ParkingMutex<Option<(i32, i32)>> {
    OVERLAY_USER_POSITION.get_or_init(|| ParkingMutex::new(None))
}

fn overlay_last_geom() -> &'static ParkingMutex<Option<(bool, i32, i32)>> {
    OVERLAY_LAST_GEOM.get_or_init(|| ParkingMutex::new(None))
}

fn overlay_session_dismissed() -> &'static ParkingMutex<bool> {
    OVERLAY_SESSION_DISMISSED.get_or_init(|| ParkingMutex::new(false))
}

/// Clear soft-dismiss latch (e.g. user chose durable "不显示浮窗" in settings).
pub fn clear_overlay_session_dismissed() {
    *overlay_session_dismissed().lock() = false;
}

fn is_overlay_session_dismissed() -> bool {
    *overlay_session_dismissed().lock()
}

/// Require two consecutive FG samples before *showing*; delay *hide* with grace so
/// Alt-Tab / Cursor FG handoff does not flash Soft Pad off then on.
fn stable_overlay_host(raw: bool) -> bool {
    stable_overlay_host_at(raw, Instant::now(), onetone_main_is_foreground())
}

/// Pure host latch — unit-tested with injected clock / OneTone gate.
fn stable_overlay_host_at(raw: bool, now: Instant, force_hide_onetone: bool) -> bool {
    // Instant hide when OneTone settings hold FG — never grace over the settings UI.
    if !raw && force_hide_onetone {
        *fg_confirm().lock() = (false, 2);
        *last_foreground_codex().lock() = false;
        *hide_grace_since().lock() = None;
        return false;
    }
    let mut slot = fg_confirm().lock();
    let (pending, streak) = *slot;
    if pending == raw {
        *slot = (pending, streak.saturating_add(1));
    } else {
        *slot = (raw, 1);
    }
    let (pending, streak) = *slot;
    drop(slot);

    let mut last = last_foreground_codex().lock();
    if pending {
        *hide_grace_since().lock() = None;
        if streak >= 2 {
            *last = true;
        }
        return *last;
    }

    // raw false
    if !*last {
        *hide_grace_since().lock() = None;
        return false;
    }

    // Was showing — hold through brief FG gaps.
    let mut since = hide_grace_since().lock();
    match *since {
        None => {
            *since = Some(now);
            true
        }
        Some(t) if now.duration_since(t) < Duration::from_millis(OVERLAY_HIDE_GRACE_MS) => true,
        Some(_) => {
            *since = None;
            *last = false;
            false
        }
    }
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
    /// Bound capability slot (plan / switchAgent / commandPalette / …).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub slot_id: String,
    /// primary | screen | advanced | none ? honest brightness for overlay.
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
    /// action | agentLane — Soft Pad purpose role for this key (AG only meaningful).
    pub key_role: String,
    /// Bound top-level session lane id when agSurface=sessionLanes (empty if unassigned).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub lane_id: String,
    /// Active subagent count for this session slot (decoration only).
    #[serde(default, skip_serializing_if = "is_zero_u32")]
    pub subagent_count: u32,
}

fn is_zero_u32(v: &u32) -> bool {
    *v == 0
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
    /// Host-side reason (not final visible): codex_foreground | overlay_foreground |
    /// needs_input | claude_foreground | claude_activity | hidden.
    /// `hidden` only when raw host is fully false; may be `claude_activity` while visible=false
    /// if overlay_enabled is off.
    pub visible_reason: String,
    pub enabled: bool,
    pub overlay_enabled: bool,
    /// Derived: "codex" when pad.enabled, else "numpad".
    pub pad_mode: String,
    /// Overlay session: JOY left NAV rail open (not persisted).
    pub joy_nav_panel_open: bool,
    /// True when physical arrows are hijacked into bound NAV_* (capturePhysicalArrows + slot).
    pub joy_arrows_live: bool,
    /// Short context copy for the NAV rail / toast (empty when rail closed).
    pub joy_context_hint: String,
    pub require_num_lock_off: bool,
    pub num_lock_blocking: bool,
    /// When false, overlay hides the left NAV column (showNavigationPad).
    /// Does not control physical arrow capture — see capture path / joy_arrows_live.
    #[serde(rename = "showNavigationPad", alias = "navKeysEnabled")]
    pub nav_keys_enabled: bool,
    /// Soft Pad grid columns: 5 with NAV, 4 when showNavigationPad is false (codex mode).
    pub layout_columns: u32,
    pub bound_count: u32,
    pub active_micro_key_id: String,
    pub pad_status: String,
    pub status_micro_key_id: String,
    /// v1 status-light host: microKeyId with slotId=status (fallback AG00). Not fire latch.
    pub status_light_micro_key_id: String,
    pub software_enhance_enabled: bool,
    pub minimized: bool,
    /// Soft Pad visual skin (normalized): default | glass-light | hybrid-pro | vibe-light | vibe-dark.
    pub skin: String,
    /// shortcuts | sessions — stored user purpose for this Applied mapping.
    pub purpose: String,
    /// Active Soft Pad mapping id (empty when no overlay mapping).
    pub mapping_id: String,
    /// Applied Soft Pad agent kind: codex | claude | cursor | … (empty if none).
    pub applied_agent: String,
    /// Explicit enable-nav CTA target (empty when CTA should hide).
    /// Prefer this over guessing from applied_agent — Claude Hook may light ambient
    /// while overlay mapping is still Codex.
    pub nav_cta_mapping_id: String,
    pub nav_cta_agent: String,
    pub nav_cta_slots: Vec<String>,
    /// Runtime AG face hint: actions | mixed (legacy sessionLanes deserializes as mixed).
    pub ag_surface: String,
    /// Configured navigation micro keys for Applied mapping.
    pub navigation_slots: Vec<String>,
    /// Lanes beyond navigation slot count (Hub overflow).
    pub navigation_overflow: u32,
    /// Sub-agent corner decoration allowed (Claude SessionLanes only).
    pub multi_agent_lights: bool,
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
    /// Soft RGB / chassis data-light aggregate (error veto + cross-lane rank). Status host still uses app_status.
    #[serde(default)]
    pub ambient_status: String,
    /// breathing | slow | flash | empty — Soft RGB / overlay pulse hint.
    #[serde(default)]
    pub rgb_pulse: String,
    pub app_age_ms: u64,
    /// Mirror of `codexMicroPad.codexStatusLightsEnabled` on the active Codex mapping.
    pub app_state_enabled: bool,
    /// State Core confidence: high | medium | low
    pub app_confidence: String,
    /// State Core agent id when known: codex | claude (v2 meta).
    pub app_agent: String,
    /// Windows FG preset agent kind (codex | claude | minimax | …) for chip sort / focus.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub foreground_agent: String,
    /// Short human message from State Core (optional).
    pub app_message: String,
    /// State Core task / turn id (optional).
    pub app_task_id: String,
    /// State Core session id (optional).
    pub app_session_id: String,
    /// Fixed Codex / Claude / Cursor rows for the minimized strip.
    pub agents: Vec<CodexMicroAgentSnapshot>,
    /// Claude Hook multi-lights (OneTone-built; not native thstatus).
    pub agent_lights: Vec<crate::pad_status::ClaudeAgentLightState>,
    /// When AG pool is full: short overflow hint (empty if none). Kept for FE compat.
    pub agent_lights_overflow: String,
    /// Structured overflow agents (diagnose / tooling; overlay should not render loudly).
    pub agent_lights_overflow_items: Vec<ClaudeOverflowItem>,
    /// Copy-only: which Claude agent waits for confirm when primary context is idle.
    pub claude_waiting_hint: String,
    /// Ordered pass/fail gates for AG session lights + status host (overlay diagnose panel).
    pub ag_light_gates: Vec<AgLightGate>,
    pub cells: Vec<CodexMicroOverlayCell>,
    /// Cursor beginner face: show 4 action icons in mini bar (Windows v0).
    #[serde(default)]
    pub cursor_beginner_mode: bool,
    #[serde(default)]
    pub cursor_probe_ok: bool,
    #[serde(default)]
    pub cursor_beginner_armed: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub cursor_beginner_probe_message: String,
    #[serde(default)]
    pub cursor_beginner_slots: Vec<crate::cursor_beginner::BeginnerSlotSnapshot>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub cursor_beginner_arm_hint: String,
    /// Scheme A panel: short send/cancel flow under the listen hint.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub cursor_beginner_flow_hint: String,
    /// Live Vosk partial (mirrors diagnostic / home).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub voice_heard_partial: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub voice_heard_final: String,
    #[serde(default)]
    pub voice_heard_matched: bool,
    /// SoftPad Hub 方案 A：听写激活窗开着（与 Agent 灯分离）。
    #[serde(default)]
    pub activation_hub_active: bool,
    /// Epoch ms when dictating session started (0 if inactive).
    #[serde(default)]
    pub activation_hub_started_at_ms: u64,
    /// Dictation timeout budget for mini countdown.
    #[serde(default)]
    pub activation_hub_timeout_ms: u64,
    /// Soft Pad uncommon voice pending (3s countdown confirm).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pending_confirm: Option<crate::soft_pad_voice_pending::SoftPadVoicePendingPublic>,
}

/// One checklist row for overlay AG / status-light diagnose.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgLightGate {
    pub id: String,
    pub ok: bool,
    pub label: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroAgentSnapshot {
    pub kind: String,
    pub state: String,
    pub model: String,
    pub model_confidence: String,
    pub usage: crate::agent_usage::AgentUsageSnapshot,
    pub health: Vec<crate::connector_health::CapabilityHealth>,
    pub headline_state: String,
    pub headline_label: String,
    pub updated_at: u64,
    /// User toggle for this agent row (shell kinds hidden in overlay when false).
    pub lights_enabled: bool,
    /// Shell three: Soft Pad Hook installed (`onetoneConfigured`). None = N/A.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hook_configured: Option<bool>,
    /// Signal trust — not task state. fresh | stale | unconfigured | corrupt
    #[serde(default)]
    pub signal_health: String,
}

/// Unhosted Claude agent when AG pool is exhausted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeOverflowItem {
    pub agent_key: String,
    pub agent_id: String,
    pub agent_type: String,
    pub short_label: String,
    pub state: String,
    /// pool_full | status_host | layout
    pub reason: String,
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
        label_zh: "快速对话",
        label_en: "Quick chat",
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
        label_zh: "取消",
        label_en: "Cancel",
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
        label_zh: "命令菜单",
        label_en: "Command",
        kind: "agent",
        default_icon: "palette",
    },
    OverlayCellDef {
        micro_key_id: "AG01",
        label_zh: "新建对话",
        label_en: "New chat",
        kind: "agent",
        default_icon: "fork",
    },
    OverlayCellDef {
        micro_key_id: "AG02",
        label_zh: "快速对话",
        label_en: "Quick chat",
        kind: "agent",
        default_icon: "fast",
    },
    OverlayCellDef {
        micro_key_id: "PLUS",
        label_zh: "加号",
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
        label_zh: "查找",
        label_en: "Find",
        kind: "agent",
        default_icon: "search",
    },
    OverlayCellDef {
        micro_key_id: "AG04",
        label_zh: "发送",
        label_en: "Send",
        kind: "agent",
        default_icon: "send",
    },
    OverlayCellDef {
        micro_key_id: "AG05",
        label_zh: "取消",
        label_en: "Cancel",
        kind: "agent",
        default_icon: "reject",
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
        label_zh: "新建对话",
        label_en: "New",
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
        label_zh: "查找",
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
        label_zh: "语音输入",
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
    // Window is lazy-created on first visible apply_overlay_payload.
    bump_window_generation();
    ensure_overlay_scheduler();
    let _ = app;
    Ok(())
}

fn configure_codex_overlay_window(win: &WebviewWindow) -> tauri::Result<()> {
    cache_overlay_hwnd_from_window(win);
    win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = win.set_shadow(false);
    let _ = win.set_always_on_top(true);
    apply_overlay_no_activate();
    Ok(())
}

// --- Single overlay push scheduler: latest snapshot + trailing flush ---

static WINDOW_GEN: AtomicU64 = AtomicU64::new(1);
static SCHED_STARTED: AtomicBool = AtomicBool::new(false);
static SCHED_PENDING: AtomicBool = AtomicBool::new(false);
static SCHED_WAKE: OnceLock<(Mutex<()>, Condvar)> = OnceLock::new();
/// Job is (app, reposition, gen) — snapshot built on scheduler so Hook HTTP
/// threads never stack `build_snapshot` + `cfg` under Claude SessionStart floods.
static SCHED_LATEST: OnceLock<ParkingMutex<Option<(AppHandle, bool, u64)>>> = OnceLock::new();

fn bump_window_generation() {
    WINDOW_GEN.fetch_add(1, Ordering::SeqCst);
}

pub fn window_generation() -> u64 {
    WINDOW_GEN.load(Ordering::SeqCst)
}

fn sched_wake() -> &'static (Mutex<()>, Condvar) {
    SCHED_WAKE.get_or_init(|| (Mutex::new(()), Condvar::new()))
}

fn sched_latest() -> &'static ParkingMutex<Option<(AppHandle, bool, u64)>> {
    SCHED_LATEST.get_or_init(|| ParkingMutex::new(None))
}

fn ensure_overlay_scheduler() {
    if SCHED_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("codex-overlay-sched".into())
        .spawn(move || overlay_scheduler_loop());
}

fn overlay_scheduler_loop() {
    let (lock, cv) = sched_wake();
    loop {
        {
            let guard = lock.lock().unwrap_or_else(|e| e.into_inner());
            let (_g, _) = cv
                .wait_timeout(guard, Duration::from_millis(100))
                .unwrap_or_else(|e| e.into_inner());
        }
        while SCHED_PENDING.swap(false, Ordering::SeqCst) {
            let job = sched_latest().lock().take();
            let Some((app, reposition, gen)) = job else {
                continue;
            };
            if gen != window_generation() {
                continue;
            }
            let Some(state) = app.try_state::<std::sync::Arc<AppState>>() else {
                continue;
            };
            let snapshot = build_snapshot(state.inner().as_ref());
            *last_visible().lock() = snapshot.visible;
            apply_overlay_payload(&app, &snapshot, reposition, gen);
        }
    }
}

/// Coalesced push: enqueue only; scheduler builds the latest snapshot once.
pub fn request_overlay_push(app: &AppHandle, _state: &AppState, reposition: bool) {
    ensure_overlay_scheduler();
    let gen = window_generation();
    {
        let mut slot = sched_latest().lock();
        let reposition = match slot.as_ref() {
            Some((_, prev_repos, _)) => *prev_repos || reposition,
            None => reposition,
        };
        *slot = Some((app.clone(), reposition, gen));
    }
    SCHED_PENDING.store(true, Ordering::SeqCst);
    let (lock, cv) = sched_wake();
    let _guard = lock.lock();
    cv.notify_one();
}

#[cfg(windows)]
fn codex_is_foreground() -> bool {
    #[cfg(test)]
    if let Some(v) = *test_force_codex_fg().lock() {
        return v;
    }
    crate::app_identity::foreground_effective_app_target_id()
        .is_some_and(|id| id.trim() == CODEX_APP_TARGET_ID)
}

#[cfg(not(windows))]
fn codex_is_foreground() -> bool {
    #[cfg(test)]
    if let Some(v) = *test_force_codex_fg().lock() {
        return v;
    }
    false
}

#[cfg(windows)]
fn claude_is_foreground() -> bool {
    #[cfg(test)]
    if let Some(v) = *test_force_claude_fg().lock() {
        return v;
    }
    crate::app_identity::foreground_effective_app_target_id()
        .is_some_and(|id| id.trim() == crate::app_identity::CLAUDE_CODE_APP_TARGET_ID)
}

#[cfg(not(windows))]
fn claude_is_foreground() -> bool {
    #[cfg(test)]
    if let Some(v) = *test_force_claude_fg().lock() {
        return v;
    }
    false
}

#[cfg(windows)]
fn cursor_is_foreground() -> bool {
    // Same effective FG path as Codex/Claude Soft Pad hosts (preset + terminal-cli).
    crate::app_identity::foreground_effective_app_target_id()
        .is_some_and(|id| id.trim() == crate::app_identity::CURSOR_APP_TARGET_ID)
}

#[cfg(not(windows))]
fn cursor_is_foreground() -> bool {
    false
}

/// Soft Pad agent app currently in foreground (any Soft Pad AgentKind host).
pub fn soft_pad_agent_is_foreground() -> bool {
    // Codex/Claude keep test FG overrides via helpers; Cursor uses effective FG.
    if codex_is_foreground() || claude_is_foreground() || cursor_is_foreground() {
        return true;
    }
    #[cfg(windows)]
    {
        use crate::soft_pad_runtime::AgentKind;
        crate::app_identity::foreground_effective_app_target_id().is_some_and(|id| {
            matches!(
                AgentKind::from_app_target(id.trim()),
                Some(
                    AgentKind::MiniMax
                        | AgentKind::WorkBuddy
                        | AgentKind::Trae
                        | AgentKind::TraeCode
                        | AgentKind::Windsurf
                        | AgentKind::Qoder
                        | AgentKind::CopilotCli
                        | AgentKind::CopilotVscode
                        | AgentKind::Gemini
                        | AgentKind::Cline
                        | AgentKind::Roo
                        | AgentKind::OpenCode
                        | AgentKind::Aider
                )
            )
        })
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Inject legality: Applied Soft Pad target owns FG and OneTone does not.
/// Visibility / sticky hosts / overlay identity must NEVER authorize SendInput alone.
pub fn soft_pad_inject_legal(target_app_id: &str) -> bool {
    let tid = target_app_id.trim();
    if tid.is_empty() {
        return false;
    }
    if crate::app_identity::foreground_is_self() {
        return false;
    }
    crate::app_identity::foreground_effective_app_target_id().is_some_and(|id| id.trim() == tid)
}

/// Focus the Soft Pad target, then re-check inject legality.
pub fn ensure_soft_pad_inject_ready(target_app_id: &str) -> bool {
    crate::keyboard::track_foreground_for_send();
    let _ = crate::app_chat_workflow::quick_focus_app_target_for_hold(target_app_id);
    soft_pad_inject_legal(target_app_id)
}

/// Resolve Soft Pad inject target without AppState (route mapping → Applied → FG agent → Codex).
/// Route mapping wins: Soft Pad UI is FG-first while Applied can lag on a waiting agent.
pub fn soft_pad_inject_target_fallback(mapping_app_target: Option<&str>) -> String {
    if let Some(tid) = mapping_app_target.map(str::trim).filter(|s| !s.is_empty()) {
        return tid.to_string();
    }
    if let Some((kind, _)) = crate::soft_pad_runtime::applied_lane() {
        return kind.app_target_id().to_string();
    }
    if let Some(tid) = crate::app_identity::foreground_effective_app_target_id() {
        if crate::soft_pad_runtime::AgentKind::from_app_target(&tid).is_some() {
            return tid;
        }
    }
    CODEX_APP_TARGET_ID.to_string()
}

/// Route for a Soft Pad key from the **visible** overlay mapping (FG-first), not Applied.
pub fn resolve_overlay_pad_micro_route(
    cfg: &VoiceConfig,
    micro_key_id: &str,
) -> Option<crate::codex_numpad_layer::CodexNumpadRouteSnapshot> {
    let mid = micro_key_id.trim();
    if mid.is_empty() {
        return None;
    }
    let (mapping, pad) = active_codex_mapping_with_overlay(cfg)?;
    let route = pad
        .keys
        .iter()
        .find(|k| k.enabled && k.micro_key_id.trim() == mid)?;
    let slot = route.slot_id.trim();
    if slot.is_empty() {
        return None;
    }
    let binding = agent_key_binding_for_slot(mapping, slot);
    let trigger = binding
        .map(|b| b.trigger_binding.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            crate::agent::bindings_build::default_key_for_scenario(
                mapping.app_target_id.trim(),
                slot,
            )
            .to_string()
        });
    if trigger.is_empty() {
        return None;
    }
    let action_id = binding
        .map(|b| b.action_id.clone())
        .unwrap_or_else(|| {
            crate::agent::templates::slot_by_id(slot)
                .map(|s| s.action_id.to_string())
                .unwrap_or_default()
        });
    if action_id.is_empty() {
        return None;
    }
    let slot_id = binding
        .map(|b| b.slot_id.clone())
        .unwrap_or_else(|| slot.to_string());
    let provider = if mapping.agent_provider_id.trim().is_empty() {
        "codex".to_string()
    } else {
        mapping.agent_provider_id.clone()
    };
    let is_hold = action_id == "startDictation" || slot_id.eq_ignore_ascii_case("pushToTalk");
    Some(crate::codex_numpad_layer::CodexNumpadRouteSnapshot {
        mapping_id: mapping.id.clone(),
        slot_id,
        action_id,
        provider_id: provider,
        trigger_binding: trigger,
        micro_key_id: route.micro_key_id.clone(),
        is_hold,
    })
}

/// Session for physical swallow / micro fire: agent FG or overlay HWND FG only.
/// Sticky visibility latch must NOT keep session active (that authorized inject into self).
pub fn micro_pad_session_active() -> bool {
    #[cfg(windows)]
    {
        soft_pad_agent_is_foreground() || overlay_is_foreground()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Claude Hook/App near-window (or active lights) keeps Soft Pad host-visible.
/// Primary source: durable `claude_lights` stamp ? not sole reliance on primary PadStatus.
pub fn claude_activity_hold() -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    claude_activity_hold_at(now)
}

pub(crate) fn claude_activity_hold_at(now: u64) -> bool {
    if let Some(age) = crate::pad_status::claude_lights::last_activity_age_ms(now) {
        if age <= CLAUDE_ACTIVITY_SHOW_MS {
            return true;
        }
    }
    if !crate::pad_status::claude_lights::snapshot_active(now).is_empty() {
        return true;
    }
    let pad = crate::pad_status::snapshot_at(now);
    let src = pad.display_source_label();
    if (src == "claude_hook" || src == "claude_app") && pad.updated_at > 0 {
        return now.saturating_sub(pad.updated_at) <= CLAUDE_ACTIVITY_SHOW_MS;
    }
    false
}

/// Age used by diagnose for Claude Soft Pad hold (0 when no durable activity).
pub fn claude_activity_age_ms_for_diagnose(now: u64) -> u64 {
    crate::pad_status::claude_lights::last_activity_age_ms(now).unwrap_or(0)
}

/// Host-side reason (not final visible). `hidden` only when raw host is fully false.
pub fn overlay_visible_reason() -> String {
    // OneTone ???????? Soft Pad??????????? / ??????
    if onetone_main_is_foreground() {
        return "hidden".into();
    }
    if codex_is_foreground() {
        return "codex_foreground".into();
    }
    if cursor_is_foreground() {
        return "cursor_foreground".into();
    }
    if overlay_hwnd_is_foreground() {
        return "overlay_foreground".into();
    }
    if hook_needs_input_hold() {
        return "needs_input".into();
    }
    if claude_is_foreground() {
        return "claude_foreground".into();
    }
    if claude_activity_hold() {
        return "claude_activity".into();
    }
    #[cfg(windows)]
    if let Some(id) = crate::app_identity::foreground_effective_app_target_id() {
        if let Some(kind) = crate::soft_pad_runtime::AgentKind::from_app_target(id.trim()) {
            if !matches!(
                kind,
                crate::soft_pad_runtime::AgentKind::Codex
                    | crate::soft_pad_runtime::AgentKind::Claude
                    | crate::soft_pad_runtime::AgentKind::Cursor
            ) {
                return format!("{}_foreground", kind.as_str());
            }
        }
    }
    if crate::app_identity::soft_pad_agent_process_running() {
        return "agent_process".into();
    }
    "hidden".into()
}

/// Soft Pad must not cover OneTone settings while the user is configuring.
fn onetone_main_is_foreground() -> bool {
    // Main settings webview (not the floating overlay) holds FG.
    if crate::app_identity::foreground_is_self() && !overlay_hwnd_is_foreground() {
        return true;
    }
    false
}

fn last_agent_show_reason_at() -> &'static ParkingMutex<Option<Instant>> {
    LAST_AGENT_SHOW_REASON_AT.get_or_init(|| ParkingMutex::new(None))
}

fn note_agent_show_reason() {
    *last_agent_show_reason_at().lock() = Some(Instant::now());
}

fn clear_agent_show_reason() {
    *last_agent_show_reason_at().lock() = None;
}

/// How long overlay may keep FG after a real agent/hold show (clicking keycaps).
const OVERLAY_KEEP_AFTER_AGENT_MS: u64 = 4_000;

fn agent_show_reason_recent() -> bool {
    last_agent_show_reason_at()
        .lock()
        .map(|at| at.elapsed() <= Duration::from_millis(OVERLAY_KEEP_AFTER_AGENT_MS))
        .unwrap_or(false)
}

fn overlay_host_allows_show_raw() -> bool {
    if onetone_main_is_foreground() {
        clear_agent_show_reason();
        return false;
    }
    // Overlay self-FG alone never authorizes show over OneTone settings — only after a
    // real agent/hold show, and never while the main process holds a settings gate
    // (gated in build_snapshot / maybe_tick via settings_drawer_open).
    if soft_pad_agent_is_foreground()
        || hook_needs_input_hold()
        || claude_activity_hold()
        || crate::app_identity::soft_pad_agent_process_running()
    {
        note_agent_show_reason();
        return true;
    }
    // Overlay self-FG: keep only after a real agent/hold show. Naked focus-steal from
    // OneTone main used to leave the pad always-on-top forever (不响应 / 假死).
    if overlay_hwnd_is_foreground()
        && *last_visible().lock()
        && !is_overlay_session_dismissed()
        && agent_show_reason_recent()
    {
        return true;
    }
    false
}

/// Single debounce entry ? callers must not wrap again with `stable_overlay_host`.
fn overlay_should_be_visible_host() -> bool {
    stable_overlay_host(overlay_host_allows_show_raw())
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
/// redirected the chord away from Codex and deadlocked WebView2 (soft-pad ??).
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

/// True when any Soft Pad mapping has agent status-lights enabled (Codex / Claude / Cursor / …).
pub fn status_lights_enabled(cfg: &VoiceConfig) -> bool {
    use crate::soft_pad_runtime::AgentKind;
    [
        AgentKind::Codex,
        AgentKind::Claude,
        AgentKind::Cursor,
        AgentKind::CopilotCli,
        AgentKind::CopilotVscode,
        AgentKind::Gemini,
        AgentKind::Cline,
        AgentKind::Roo,
        AgentKind::OpenCode,
        AgentKind::Aider,
        AgentKind::WorkBuddy,
        AgentKind::Trae,
        AgentKind::TraeCode,
        AgentKind::Windsurf,
        AgentKind::Qoder,
        AgentKind::MiniMax,
    ]
    .iter()
    .any(|kind| agent_status_light_enabled(cfg, *kind))
}

/// Ambient mode + solid hex + opacity + palette for Soft RGB protocol (from active overlay pad).
/// Returns `None` for soft RGB when `ambient_enabled` is false.
pub fn active_ambient_for_soft_rgb(
    cfg: &VoiceConfig,
) -> (
    String,
    String,
    u8,
    String,
    crate::config::SoftPadStatusColors,
    bool,
) {
    active_codex_mapping_with_overlay(cfg)
        .map(|(_, p)| {
            (
                p.ambient_mode.clone(),
                p.ambient_solid_rgb.clone(),
                p.ambient_opacity,
                p.key_light_preset.clone(),
                p.status_colors.clone(),
                p.ambient_enabled,
            )
        })
        .unwrap_or_else(|| {
            (
                "status".into(),
                String::new(),
                100,
                "default".into(),
                crate::config::SoftPadStatusColors::default(),
                true,
            )
        })
}

/// Last Soft Pad agent that owned a real app FG (not OneTone / Soft Pad overlay).
/// Third field pins Hub/set_layout mappingId so overlay matches the edited Soft Pad.
/// Soft Pad overlay clicks must not fall back to Codex Soft Pad while Cursor is the work surface.
fn last_soft_pad_surface(
) -> &'static ParkingMutex<Option<(String, crate::soft_pad_runtime::AgentKind, Option<String>)>> {
    static SLOT: OnceLock<
        ParkingMutex<Option<(String, crate::soft_pad_runtime::AgentKind, Option<String>)>>,
    > = OnceLock::new();
    SLOT.get_or_init(|| ParkingMutex::new(None))
}

fn note_soft_pad_surface(
    tid: &str,
    kind: crate::soft_pad_runtime::AgentKind,
    mapping_id: Option<&str>,
) {
    let tid = tid.trim();
    if tid.is_empty() {
        return;
    }
    let explicit = mapping_id
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mut slot = last_soft_pad_surface().lock();
    let mid = match explicit {
        Some(m) => Some(m),
        None => match &*slot {
            // FG refresh without mid: keep Hub-pinned mapping for the same app.
            Some((prev_tid, _, prev_mid)) if prev_tid == tid => prev_mid.clone(),
            _ => None,
        },
    };
    *slot = Some((tid.to_string(), kind, mid));
}

/// Chip / focus Soft Pad agent: sticky Soft Pad surface so overlay FG keeps Cursor Soft Pad.
pub fn note_soft_pad_surface_for_agent(kind: crate::soft_pad_runtime::AgentKind) {
    note_soft_pad_surface(kind.app_target_id(), kind, None);
}

/// Hub scheme select / quiet set_layout: pin exact mapping under the Soft Pad agent.
pub fn note_soft_pad_surface_for_mapping(
    mapping_id: &str,
    kind: crate::soft_pad_runtime::AgentKind,
) {
    let mid = mapping_id.trim();
    if mid.is_empty() {
        return;
    }
    note_soft_pad_surface(kind.app_target_id(), kind, Some(mid));
}

/// Soft Pad surface owner: live Soft Pad agent FG, else sticky last Soft Pad agent.
/// When Soft Pad overlay / OneTone owns FG, keep the sticky agent so Cursor Soft Pad
/// does not snap back to Codex Soft Pad session chrome.
fn soft_pad_surface_owner() -> Option<(String, crate::soft_pad_runtime::AgentKind)> {
    if !crate::app_identity::foreground_is_self() {
        if let Some(tid) = crate::app_identity::foreground_effective_app_target_id() {
            if let Some(kind) = crate::soft_pad_runtime::AgentKind::from_app_target(tid.trim()) {
                note_soft_pad_surface(&tid, kind, None);
                return Some((tid, kind));
            }
        }
    }
    last_soft_pad_surface()
        .lock()
        .as_ref()
        .map(|(tid, kind, _)| (tid.clone(), *kind))
}

fn sticky_mapping_id_for_tid(tid: &str) -> Option<String> {
    let tid = tid.trim();
    last_soft_pad_surface()
        .lock()
        .as_ref()
        .and_then(|(t, _, mid)| {
            if t.trim() == tid {
                mid.clone()
            } else {
                None
            }
        })
}

fn mapping_for_soft_pad_target<'a>(
    cfg: &'a VoiceConfig,
    tid: &str,
) -> Option<(&'a MappingEntry, &'a CodexMicroPadConfig)> {
    let tid = tid.trim();
    // Prefer Hub/set_layout pinned mappingId when it still matches this app target.
    if let Some(mid) = sticky_mapping_id_for_tid(tid) {
        if let Some(m) = cfg.mappings.iter().find(|m| {
            m.enabled && m.id == mid && m.app_target_id.trim() == tid
        }) {
            if let Some(pad) = m.codex_micro_pad.as_ref() {
                return Some((m, pad));
            }
        }
    }
    let mut fallback: Option<(&MappingEntry, &CodexMicroPadConfig)> = None;
    for m in &cfg.mappings {
        if !m.enabled || m.app_target_id.trim() != tid {
            continue;
        }
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        if pad.overlay_enabled {
            return Some((m, pad));
        }
        if fallback.is_none() {
            fallback = Some((m, pad));
        }
    }
    fallback
}

/// Overlay visibility depends only on `overlay_enabled` (not `pad.enabled`).
/// Prefers FG Soft Pad agent mapping, then Applied lane, then baseline, then Codex.
/// FG-first: opening Cursor/Claude/Codex must show that agent's mini even if
/// Applied still lags on another agent's waiting.
/// When a Soft Pad agent is FG but its overlay is off / missing, still prefer that
/// agent's Soft Pad (do **not** steal Codex Soft Pad).
/// When Soft Pad overlay owns FG, keep sticky Soft Pad agent surface.
/// When `soft_pad_force_open`, fall back to any Soft Pad agent with overlay
/// (OneTone home FG otherwise yields None and force appears broken).
fn active_codex_mapping_with_overlay(
    cfg: &VoiceConfig,
) -> Option<(&MappingEntry, &CodexMicroPadConfig)> {
    // Beginner MVP: Cursor habit / FG / alive → cursor-chat Soft Pad (not sticky Codex).
    if crate::cursor_beginner::should_prefer_cursor_soft_pad(cfg) {
        if let Some(hit) = mapping_for_soft_pad_target(
            cfg,
            crate::app_chat_workflow::CURSOR_APP_TARGET_ID,
        ) {
            return Some(hit);
        }
        if crate::cursor_beginner::cursor_habit_active(cfg)
            || crate::cursor_beginner::cursor_is_foreground()
        {
            return None;
        }
    }
    if let Some((tid, _)) = soft_pad_surface_owner() {
        if let Some(hit) = mapping_for_soft_pad_target(cfg, &tid) {
            return Some(hit);
        }
        // Soft Pad agent owns the surface — never show another agent's Soft Pad.
        return None;
    }

    if let Some((_, mid)) = crate::soft_pad_runtime::applied_lane() {
        for m in &cfg.mappings {
            if m.enabled && m.id == mid {
                if let Some(pad) = m.codex_micro_pad.as_ref() {
                    if pad.overlay_enabled {
                        return Some((m, pad));
                    }
                }
            }
        }
    }

    if let Some(hit) = crate::codex_numpad_layer::baseline_fallback_overlay_candidate(cfg) {
        return Some(hit);
    }

    for m in &cfg.mappings {
        if !m.enabled || m.app_target_id.trim() != CODEX_APP_TARGET_ID {
            continue;
        }
        if let Some(pad) = m.codex_micro_pad.as_ref() {
            if pad.overlay_enabled {
                return Some((m, pad));
            }
        }
    }

    if cfg.soft_pad_force_open {
        return force_soft_pad_overlay_candidate(cfg);
    }
    None
}

/// Any Soft Pad agent mapping with overlay — prefer pad.enabled.
fn force_soft_pad_overlay_candidate(
    cfg: &VoiceConfig,
) -> Option<(&MappingEntry, &CodexMicroPadConfig)> {
    let mut fallback: Option<(&MappingEntry, &CodexMicroPadConfig)> = None;
    for m in &cfg.mappings {
        if !m.enabled {
            continue;
        }
        if crate::soft_pad_runtime::AgentKind::from_app_target(m.app_target_id.trim()).is_none() {
            continue;
        }
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        if !pad.overlay_enabled {
            continue;
        }
        if pad.enabled {
            return Some((m, pad));
        }
        if fallback.is_none() {
            fallback = Some((m, pad));
        }
    }
    fallback
}

/// Home force-open: turn on overlay for a Soft Pad agent mapping (prefer pad on).
/// Returns true when an overlay-capable Soft Pad mapping exists afterward.
pub fn ensure_force_soft_pad_ready(cfg: &mut VoiceConfig) -> bool {
    if force_soft_pad_overlay_candidate(cfg).is_some() {
        return true;
    }

    // Prefer already-enabled Soft Pad (pad switch on) — just flip overlay.
    for m in cfg.mappings.iter_mut() {
        if !m.enabled {
            continue;
        }
        if crate::soft_pad_runtime::AgentKind::from_app_target(m.app_target_id.trim()).is_none() {
            continue;
        }
        if let Some(pad) = m.codex_micro_pad.as_mut() {
            if pad.enabled {
                pad.overlay_enabled = true;
                return true;
            }
        }
    }

    // Any Soft Pad agent scenario: enable pad + overlay.
    for m in cfg.mappings.iter_mut() {
        if !m.enabled {
            continue;
        }
        if crate::soft_pad_runtime::AgentKind::from_app_target(m.app_target_id.trim()).is_none() {
            continue;
        }
        let pad = m
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        pad.enabled = true;
        pad.overlay_enabled = true;
        return true;
    }

    // Last resort: heal Codex Soft Pad then force overlay on.
    let _ = crate::codex_numpad_layer::ensure_codex_pad_ready(cfg, "zh-CN");
    for m in cfg.mappings.iter_mut() {
        if !m.enabled || m.app_target_id.trim() != CODEX_APP_TARGET_ID {
            continue;
        }
        let pad = m
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        pad.enabled = true;
        pad.overlay_enabled = true;
        return true;
    }
    false
}

fn route_for_micro<'a>(
    pad: &'a CodexMicroPadConfig,
    micro_key_id: &str,
) -> Option<&'a crate::config::CodexMicroPadKeyRoute> {
    pad.keys
        .iter()
        .find(|k| k.micro_key_id == micro_key_id && k.enabled)
}

fn overlay_layout_has_micro_key(micro_key_id: &str) -> bool {
    OVERLAY_CELLS.iter().any(|c| c.micro_key_id == micro_key_id)
}

/// Resolve which Soft Pad key shows the single State Core status light (v1).
/// Prefers enabled `slotId == "status"`; else fallback `AG00` if in overlay layout; else empty.
/// Stock Soft Pad has no status route ? light hosts on AG00 while that key still fires commandPalette.
/// (ring / Soft RGB only ? do not force another key).
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

const CLAUDE_AG_POOL: &[&str] = &["AG01", "AG00", "AG02", "AG03", "AG05", "AG04"];

/// Claude main light host: enabled `claudeModel` slot, else AG01 if in layout.
/// Transition: shared stock maps AG01 to Codex `newThread` ? Claude light may sit on that key until Claude-specific defaults land.
pub fn resolve_claude_main_light_micro_key_id(pad: &CodexMicroPadConfig) -> String {
    if let Some(r) = pad
        .keys
        .iter()
        .find(|k| k.enabled && k.slot_id.trim() == "claudeModel")
    {
        let id = r.micro_key_id.trim();
        if !id.is_empty() && overlay_layout_has_micro_key(id) {
            return id.to_string();
        }
    }
    if overlay_layout_has_micro_key("AG01") {
        return "AG01".into();
    }
    String::new()
}

/// Claude multi-AG subagent decoration only when Applied page is Claude + SessionLanes.
pub fn claude_multi_ag_lights_allowed(mapping: &MappingEntry, pad: &CodexMicroPadConfig) -> bool {
    use crate::soft_pad_purpose::multi_agent_lights_allowed;
    use crate::soft_pad_runtime::AgentKind;
    let kind = match crate::soft_pad_runtime::applied_lane() {
        Some((kind, mid)) if mid == mapping.id => kind,
        _ => match AgentKind::from_app_target(mapping.app_target_id.trim()) {
            Some(AgentKind::Claude) => AgentKind::Claude,
            _ => return false,
        },
    };
    kind == AgentKind::Claude && multi_agent_lights_allowed(kind, pad)
}

/// Applied Claude page for this mapping (purpose-agnostic).
fn claude_light_page_matches(mapping: &MappingEntry) -> bool {
    use crate::soft_pad_runtime::AgentKind;
    // Cursor has no session lanes — never show Claude/Codex agent lights.
    if AgentKind::from_app_target(mapping.app_target_id.trim()) == Some(AgentKind::Cursor) {
        return false;
    }
    // Applied lane always wins — only show Claude lights on the matching mapping.
    if let Some((kind, mid)) = crate::soft_pad_runtime::applied_lane() {
        return kind == AgentKind::Claude && mid == mapping.id;
    }
    // No applied lane: show on the Claude-targeted mapping, OR on any mapping when Claude
    // hook/app is currently live (Claude CLI can run while any foreground is active).
    if AgentKind::from_app_target(mapping.app_target_id.trim()) == Some(AgentKind::Claude) {
        return true;
    }
    // Claude hook is live — project onto whichever mapping overlay is currently showing.
    let pad = crate::pad_status::snapshot();
    let src = pad.display_source_label();
    (src == "claude_hook" || src == "claude_app") && pad.updated_at > 0
}

fn short_mapping_id(id: &str) -> String {
    let id = id.trim();
    if id.len() <= 14 {
        return id.to_string();
    }
    format!("{}…{}", &id[..8], &id[id.len().saturating_sub(4)..])
}

/// Checklist: why AG session / status lights are dark. Order = first fail is the blockage.
fn build_ag_light_gates(
    cfg: &VoiceConfig,
    mapping: Option<&MappingEntry>,
    pad: Option<&CodexMicroPadConfig>,
    applied_agent: &str,
    purpose: &str,
    navigation_slots: &[String],
    multi_agent_lights: bool,
    status_light_micro_key_id: &str,
    cells: &[CodexMicroOverlayCell],
    nav_cta_mapping_id: &str,
    nav_cta_agent: &str,
    app_agent: &str,
    app_last_source: &str,
    app_status: &str,
) -> Vec<AgLightGate> {
    use crate::soft_pad_purpose::navigation_slots_for;
    use crate::soft_pad_runtime::AgentKind;

    let claude_live = app_agent.eq_ignore_ascii_case("claude")
        || app_last_source.contains("claude_hook")
        || app_last_source.contains("claude_app");
    let applied_claude = applied_agent.eq_ignore_ascii_case("claude");
    let mapping_claude = mapping
        .map(|m| AgentKind::from_app_target(m.app_target_id.trim()) == Some(AgentKind::Claude))
        .unwrap_or(false);
    // Claude-only checklist — hide on MiniMax/Codex Soft Pad (was showing「6 项未过」).
    if !claude_live && !applied_claude && !mapping_claude {
        return Vec::new();
    }
    let status = app_status.trim();
    // After OneTone restart, pad sticky may be empty while LaneStore / activity still prove Claude.
    let lane_n_preview = crate::agent_lane::store::public_lanes_for_page(AgentKind::Claude).len();
    let activity_hold = claude_activity_hold();
    let hook_busy = (claude_live && !status.is_empty() && status != "idle")
        || activity_hold
        || lane_n_preview > 0;

    let mut gates = Vec::with_capacity(8);
    gates.push(AgLightGate {
        id: "hook".into(),
        ok: hook_busy,
        label: "Claude Hook 有状态".into(),
        detail: if claude_live && !status.is_empty() && status != "idle" {
            format!(
                "{} · {}",
                status,
                if app_last_source.is_empty() {
                    "—"
                } else {
                    app_last_source
                }
            )
        } else if activity_hold {
            "近窗活动仍在（Pad 主状态可能被 inferred 覆盖）".into()
        } else if lane_n_preview > 0 {
            format!("LaneStore {lane_n_preview} 条 · 等下一次 PermissionRequest 刷新主状态")
        } else {
            "未收到 claude_hook / claude_app（重启会清空内存；在 Claude 里再触发一次确认）"
                .into()
        },
    });

    gates.push(AgLightGate {
        id: "applied".into(),
        ok: applied_claude,
        label: "Applied Soft Pad = Claude".into(),
        detail: if applied_agent.trim().is_empty() {
            "无 Applied（灯只画在 Applied 映射上）".into()
        } else if applied_claude {
            mapping
                .map(|m| format!("mapping {}", short_mapping_id(&m.id)))
                .unwrap_or_else(|| "Claude".into())
        } else {
            format!(
                "当前 Applied={} · AG 会话灯不会画在别的 Agent 盘上",
                applied_agent
            )
        },
    });

    // Purpose/slots: Applied Claude pad, else CTA/Claude mapping from config.
    let (purpose_ok, purpose_detail, slots_ok, slots_detail) = if applied_claude {
        let slots = navigation_slots;
        (
            purpose.eq_ignore_ascii_case("sessions"),
            format!("purpose={purpose}"),
            !slots.is_empty(),
            if slots.is_empty() {
                "navigationSlots=[]".into()
            } else {
                slots.join(",")
            },
        )
    } else {
        let target_id = nav_cta_mapping_id.trim();
        let hit = cfg.mappings.iter().find(|m| {
            if !target_id.is_empty() {
                return m.id == target_id;
            }
            crate::agent_catalog::kind_from_mapping(
                m.app_target_id.trim(),
                m.agent_provider_id.trim(),
            ) == Some(AgentKind::Claude)
                && m.codex_micro_pad.is_some()
        });
        match hit.and_then(|m| m.codex_micro_pad.as_ref().map(|p| (m, p))) {
            Some((m, p)) => {
                let slots = navigation_slots_for(AgentKind::Claude, p);
                (
                    p.purpose.is_sessions(),
                    format!(
                        "Claude mapping {} · purpose={}",
                        short_mapping_id(&m.id),
                        p.purpose.as_str()
                    ),
                    !slots.is_empty(),
                    if slots.is_empty() {
                        format!(
                            "navigationSlots=[]{}",
                            if !nav_cta_agent.is_empty() {
                                " · 可用下方 CTA 启用"
                            } else {
                                ""
                            }
                        )
                    } else {
                        slots.join(",")
                    },
                )
            }
            None => (
                false,
                "找不到 Claude Soft Pad 映射".into(),
                false,
                "无导航槽".into(),
            ),
        }
    };

    gates.push(AgLightGate {
        id: "purpose".into(),
        ok: purpose_ok,
        label: "purpose = sessions".into(),
        detail: purpose_detail,
    });
    gates.push(AgLightGate {
        id: "nav_slots".into(),
        ok: slots_ok,
        label: "导航槽 AG00–03".into(),
        detail: slots_detail,
    });

    let lane_n = lane_n_preview;
    gates.push(AgLightGate {
        id: "lanes".into(),
        ok: lane_n > 0,
        label: "LaneStore 有 Claude 会话".into(),
        detail: if lane_n > 0 {
            format!("{lane_n} 条")
        } else {
            "0（Hook SessionStart 后应有）".into()
        },
    });

    let lane_cells: Vec<_> = cells
        .iter()
        .filter(|c| !c.lane_id.is_empty())
        .map(|c| c.micro_key_id.as_str())
        .collect();
    let role_lane = cells.iter().any(|c| c.key_role == "agentLane");
    gates.push(AgLightGate {
        id: "projected".into(),
        ok: applied_claude && purpose_ok && slots_ok && !lane_cells.is_empty(),
        label: "AG 格子已投影会话".into(),
        detail: if !applied_claude {
            "需先 Applied=Claude".into()
        } else if !purpose_ok || !slots_ok {
            "需先 sessions + 导航槽".into()
        } else if lane_cells.is_empty() {
            if role_lane {
                "keyRole=agentLane 但无 lane_id".into()
            } else {
                "无 agentLane 键".into()
            }
        } else {
            lane_cells.join(",")
        },
    });

    let active_lane_cells: Vec<_> = cells
        .iter()
        .filter(|c| {
            !c.lane_id.is_empty()
                && !c.run_status.trim().is_empty()
                && c.run_status != "idle"
        })
        .map(|c| format!("{}={}", c.micro_key_id, c.run_status))
        .collect();
    gates.push(AgLightGate {
        id: "lane_active".into(),
        ok: !active_lane_cells.is_empty(),
        label: "已分配会话有非 idle 灯态".into(),
        detail: if active_lane_cells.is_empty() {
            "有 lane_id 但状态仍为 idle（AG 只会显示灰色槽点）".into()
        } else {
            active_lane_cells.join(",")
        },
    });

    let status_host = status_light_micro_key_id.trim();
    let status_cell = cells.iter().find(|c| c.micro_key_id == status_host);
    let status_lit = status_cell
        .map(|c| {
            let st = c.run_status.trim();
            !st.is_empty() && st != "idle"
        })
        .unwrap_or(false);
    gates.push(AgLightGate {
        id: "status_host".into(),
        ok: !status_host.is_empty() && (status_lit || multi_agent_lights),
        label: "状态单灯宿主".into(),
        detail: if status_host.is_empty() {
            "无 status host".into()
        } else {
            let st = status_cell
                .map(|c| c.run_status.as_str())
                .unwrap_or("—");
            format!(
                "{status_host}={st}{}",
                if multi_agent_lights {
                    " · multiLights"
                } else {
                    ""
                }
            )
        },
    });

    let _ = pad; // reserved: pad-level flags already folded into purpose/slots
    gates
}

/// Cursor never supports session/thread nav slots. Hide CTA when overlay, Applied,
/// live FG, or pad status agent is already Cursor — even if the serving pad is still Codex.
fn nav_cta_suppressed_for_cursor(
    overlay_kind: Option<crate::soft_pad_runtime::AgentKind>,
    app_agent: &str,
) -> bool {
    use crate::soft_pad_runtime::AgentKind;
    if overlay_kind == Some(AgentKind::Cursor) {
        return true;
    }
    if crate::soft_pad_runtime::applied_lane().is_some_and(|(k, _)| k == AgentKind::Cursor) {
        return true;
    }
    if app_agent.eq_ignore_ascii_case("cursor") {
        return true;
    }
    crate::app_identity::foreground_effective_app_target_id()
        .is_some_and(|id| id.trim() == crate::app_identity::CURSOR_APP_TARGET_ID)
}

/// Resolve Soft Pad overlay CTA for enabling session navigation.
/// Never auto-writes roles — only advertises an explicit enable target.
fn resolve_nav_enable_cta(
    cfg: &VoiceConfig,
    overlay_mapping: Option<&MappingEntry>,
    overlay_pad: Option<&CodexMicroPadConfig>,
    overlay_kind: Option<crate::soft_pad_runtime::AgentKind>,
    app_agent: &str,
    app_source: &str,
) -> (String, String, Vec<String>) {
    use crate::soft_pad_purpose::{
        navigation_slots_for, purpose_sessions_allowed, recommended_navigation_slots,
    };
    use crate::soft_pad_runtime::AgentKind;

    if nav_cta_suppressed_for_cursor(overlay_kind, app_agent) {
        return (String::new(), String::new(), Vec::new());
    }

    fn slots_for(kind: AgentKind, pad: &CodexMicroPadConfig) -> Vec<String> {
        recommended_navigation_slots(kind)
            .iter()
            .filter(|s| pad.keys.iter().any(|k| k.enabled && k.micro_key_id == **s))
            .map(|s| (*s).to_string())
            .collect()
    }

    fn candidate(
        mapping: &MappingEntry,
        pad: &CodexMicroPadConfig,
        kind: AgentKind,
    ) -> Option<(String, String, Vec<String>)> {
        if !purpose_sessions_allowed(kind) {
            return None;
        }
        if pad.purpose.is_sessions() {
            return None;
        }
        if !navigation_slots_for(kind, pad).is_empty() {
            return None;
        }
        let slots = slots_for(kind, pad);
        if slots.is_empty() {
            return None;
        }
        Some((mapping.id.clone(), kind.as_str().to_string(), slots))
    }

    if let (Some(mapping), Some(pad), Some(kind)) = (overlay_mapping, overlay_pad, overlay_kind) {
        if let Some(hit) = candidate(mapping, pad, kind) {
            return hit;
        }
    }

    let claude_live = app_agent.eq_ignore_ascii_case("claude")
        || app_source.contains("claude_hook")
        || app_source.contains("claude_app");
    if claude_live {
        for m in &cfg.mappings {
            if !m.enabled {
                continue;
            }
            let Some(pad) = m.codex_micro_pad.as_ref() else {
                continue;
            };
            if !pad.overlay_enabled && !pad.enabled {
                continue;
            }
            let Some(kind) = crate::agent_catalog::kind_from_mapping(
                m.app_target_id.trim(),
                m.agent_provider_id.trim(),
            ) else {
                continue;
            };
            if kind != AgentKind::Claude {
                continue;
            }
            if let Some(hit) = candidate(m, pad, kind) {
                return hit;
            }
        }
    }

    (String::new(), String::new(), Vec::new())
}

/// shortcuts: only the main Claude light on the main host — never multi-AG cover.
fn resolve_claude_main_light_host_only(
    pad: &CodexMicroPadConfig,
    lights: &[crate::pad_status::ClaudeAgentLightState],
) -> Vec<(String, crate::pad_status::ClaudeAgentLightState)> {
    let main_host = resolve_claude_main_light_micro_key_id(pad);
    if main_host.is_empty() {
        return Vec::new();
    }
    lights
        .iter()
        .find(|l| {
            l.agent_key == crate::pad_status::CLAUDE_MAIN_KEY && l.state != "idle"
        })
        .map(|l| vec![(main_host, l.clone())])
        .unwrap_or_default()
}

/// Sticky Claude agent ? microKey hosts. Excludes Codex status host. No hash reshuffle.
/// Returns (assigned host?light, short overflow summary, structured overflow items).
pub fn resolve_claude_agent_light_hosts(
    pad: &CodexMicroPadConfig,
    lights: &[crate::pad_status::ClaudeAgentLightState],
) -> (
    Vec<(String, crate::pad_status::ClaudeAgentLightState)>,
    String,
    Vec<ClaudeOverflowItem>,
) {
    let status_host = resolve_status_light_micro_key_id(pad);
    let main_host = resolve_claude_main_light_micro_key_id(pad);

    // Explicit agent_light_id bindings on routes.
    let mut explicit: Vec<(String, String)> = Vec::new();
    for r in &pad.keys {
        if !r.enabled {
            continue;
        }
        let bind = r.agent_light_id.trim();
        if bind.is_empty() {
            continue;
        }
        let mid = r.micro_key_id.trim();
        if mid.is_empty() || !overlay_layout_has_micro_key(mid) {
            continue;
        }
        if mid == status_host {
            continue;
        }
        explicit.push((bind.to_string(), mid.to_string()));
    }

    let mut used: std::collections::HashSet<String> = std::collections::HashSet::new();
    if !status_host.is_empty() {
        used.insert(status_host.clone());
    }
    let mut assigned: Vec<(String, crate::pad_status::ClaudeAgentLightState)> = Vec::new();
    let mut overflow_items: Vec<ClaudeOverflowItem> = Vec::new();

    let mut ordered = lights.to_vec();
    ordered.sort_by(|a, b| {
        a.first_seen_at
            .cmp(&b.first_seen_at)
            .then_with(|| a.agent_key.cmp(&b.agent_key))
    });

    let pool: Vec<String> = CLAUDE_AG_POOL
        .iter()
        .copied()
        .filter(|id| overlay_layout_has_micro_key(id) && *id != status_host.as_str())
        .map(|s| s.to_string())
        .collect();

    let sticky = crate::pad_status::claude_lights::host_assignments();

    for light in ordered {
        if light.state == "idle" {
            continue;
        }
        let key = light.agent_key.clone();
        let is_main = key == crate::pad_status::CLAUDE_MAIN_KEY;

        // 1) explicit route binding
        let mut host = explicit
            .iter()
            .find(|(bind, _)| {
                bind == &key
                    || (!light.agent_id.is_empty() && bind == &light.agent_id)
                    || (!light.agent_type.is_empty() && bind == &light.agent_type)
            })
            .map(|(_, m)| m.clone());

        // 2) main ? claudeModel host
        if host.is_none() && is_main && !main_host.is_empty() {
            host = Some(main_host.clone());
        }

        // 3) sticky reuse
        if host.is_none() {
            if let Some(prev) = sticky.get(&key) {
                if pool.iter().any(|p| p == prev) && !used.contains(prev) {
                    host = Some(prev.clone());
                }
            }
        }

        // 4) first free in pool (skip main_host if already used for main)
        if host.is_none() {
            for p in &pool {
                if used.contains(p) {
                    continue;
                }
                // Prefer not to steal main_host for a subagent when main is active
                if !is_main && p == &main_host {
                    let main_active = lights.iter().any(|l| {
                        l.agent_key == crate::pad_status::CLAUDE_MAIN_KEY && l.state != "idle"
                    });
                    if main_active {
                        continue;
                    }
                }
                host = Some(p.clone());
                break;
            }
        }

        let push_overflow = |items: &mut Vec<ClaudeOverflowItem>,
                             light: &crate::pad_status::ClaudeAgentLightState,
                             reason: &str| {
            items.push(ClaudeOverflowItem {
                agent_key: light.agent_key.clone(),
                agent_id: light.agent_id.clone(),
                agent_type: light.agent_type.clone(),
                short_label: crate::pad_status::short_agent_type(&light.agent_type),
                state: light.state.clone(),
                reason: reason.to_string(),
            });
        };

        match host {
            Some(h) => {
                if used.contains(&h) {
                    let conflict = assigned
                        .iter()
                        .find(|(m, l)| m == &h && l.agent_key != key)
                        .is_some();
                    if conflict {
                        push_overflow(&mut overflow_items, &light, "pool_full");
                        continue;
                    }
                }
                used.insert(h.clone());
                crate::pad_status::claude_lights::set_host_assignment(&key, &h);
                assigned.push((h, light));
            }
            None => {
                push_overflow(&mut overflow_items, &light, "pool_full");
            }
        }
    }

    let overflow_summary = if overflow_items.is_empty() {
        String::new()
    } else {
        format!("+{} Claude agents", overflow_items.len())
    };
    (assigned, overflow_summary, overflow_items)
}

fn claude_host_map_for_cell(
    hosts: &[(String, crate::pad_status::ClaudeAgentLightState)],
    micro_key_id: &str,
) -> Option<crate::pad_status::ClaudeAgentLightState> {
    hosts
        .iter()
        .find(|(k, _)| k == micro_key_id)
        .map(|(_, l)| l.clone())
}

fn label_for_cell(def: &OverlayCellDef) -> String {
    // Overlay HTML picks locale from localStorage; send both via zh default.
    def.label_zh.to_string()
}

/// Caption for a bound Soft Pad slot — matches Hub names (Cursor Plan ≠ Codex /plan).
fn overlay_slot_caption(app_target_id: &str, slot_id: &str) -> Option<String> {
    let slot = slot_id.trim();
    if slot.is_empty() {
        return None;
    }
    let app = app_target_id.trim();
    if app == crate::app_chat_workflow::CURSOR_APP_TARGET_ID {
        match slot {
            "summonCodex" => return Some("聚焦 Cursor".into()),
            "pushToTalk" => return Some("语音输入".into()),
            "cancel" => return Some("取消生成".into()),
            "plan" => return Some("Plan 模式".into()),
            "switchAgent" => return Some("Agent 模式".into()),
            _ => {}
        }
    }
    crate::agent::templates::slot_by_id(slot).map(|s| s.label_zh.to_string())
}

/// Claude-lit AG keys prefer compressed agent_type short name; else slot/route caption.
fn label_for_overlay_cell(
    def: &OverlayCellDef,
    claude_light: Option<&crate::pad_status::ClaudeAgentLightState>,
) -> String {
    if let Some(light) = claude_light {
        return crate::pad_status::short_agent_type(&light.agent_type);
    }
    label_for_cell(def)
}

/// Claude needs_input only fills ACT emphasize when primary context is idle.
fn effective_act_context(context_status: &str, claude_needs_input: bool) -> String {
    if claude_needs_input && context_status.trim() == "idle" {
        "needs_input".into()
    } else {
        context_status.to_string()
    }
}

/// Copy-only waiting hint; does not drive Soft RGB or cell lamp color.
fn claude_waiting_hint_for(
    claude_hosts: &[(String, crate::pad_status::ClaudeAgentLightState)],
    context_status: &str,
) -> String {
    if context_status.trim() != "idle" {
        return String::new();
    }
    let mut waiting: Vec<&crate::pad_status::ClaudeAgentLightState> = claude_hosts
        .iter()
        .map(|(_, l)| l)
        .filter(|l| l.state == "needs_input")
        .collect();
    if !waiting.is_empty() {
        waiting.sort_by(|a, b| {
            a.first_seen_at
                .cmp(&b.first_seen_at)
                .then_with(|| a.agent_key.cmp(&b.agent_key))
        });
        let short = crate::pad_status::short_agent_type(&waiting[0].agent_type);
        return format!("{short} 等待确认");
    }
    // shortcuts / no multi-AG hosts: still surface primary Claude pad waiting.
    let pad = crate::pad_status::snapshot();
    if pad.agent.as_deref() == Some("claude") {
        let ui = crate::pad_status::ui_status_from_pad(&pad);
        if ui == "needs_input" {
            return "Claude 等待确认".into();
        }
    }
    String::new()
}

pub fn build_snapshot(state: &AppState) -> CodexMicroOverlaySnapshot {
    {
        let mut cfg = state.cfg.lock();
        if crate::cursor_beginner::should_prefer_cursor_soft_pad(&cfg) {
            if crate::cursor_beginner::ensure_beginner_overlay_ready(&mut cfg) {
                crate::codex_numpad_layer::sync_hook_cache(&cfg);
            }
        }
    }
    // Clone under a short lock — host FG / process-tree must not run while holding cfg
    // (Hook floods + maybe_tick contending on cfg was freezing the UI).
    let cfg = state.cfg.lock().clone();
    let mut snapshot = build_snapshot_from_cfg(&cfg);
    apply_voice_heard(&mut snapshot, state);
    apply_activation_hub(&mut snapshot, state, &cfg);
    snapshot.pending_confirm = crate::soft_pad_voice_pending::public_snapshot();
    if let Some(reason) = overlay_runtime_gate_reason(state) {
        snapshot.visible = false;
        snapshot.visible_reason = reason.to_string();
    }
    snapshot
}

fn apply_activation_hub(
    snapshot: &mut CodexMicroOverlaySnapshot,
    state: &AppState,
    cfg: &VoiceConfig,
) {
    let dictating = crate::voice_end_runtime::session_state(state) == "dictating";
    snapshot.activation_hub_active = dictating;
    if !dictating {
        snapshot.activation_hub_started_at_ms = 0;
        snapshot.activation_hub_timeout_ms = 0;
        return;
    }
    let started_ms = match *state.voice_session_started_at.lock() {
        Some(t) => {
            let elapsed = t.elapsed().as_millis() as u64;
            now_epoch_ms().saturating_sub(elapsed)
        }
        None => now_epoch_ms(),
    };
    snapshot.activation_hub_started_at_ms = started_ms;
    let timeout = cfg.voice_end.dictation_timeout_ms.max(5_000);
    snapshot.activation_hub_timeout_ms = timeout as u64;
}

fn now_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn apply_voice_heard(snapshot: &mut CodexMicroOverlaySnapshot, state: &AppState) {
    let partial = state.voice_vosk_last_partial.lock().clone();
    let final_text = state.voice_vosk_last_final.lock().clone();
    snapshot.voice_heard_partial = partial.clone();
    snapshot.voice_heard_final = final_text.clone();
    let heard = if !partial.trim().is_empty() {
        partial
    } else {
        final_text
    };
    let heard = heard.trim();
    let phrase_hit = !heard.is_empty()
        && (crate::cursor_beginner::matches_beginner_phrase(heard).is_some()
            || crate::cursor_beginner::is_disarm_phrase(heard)
            || crate::cursor_beginner::is_arm_phrase(heard));
    snapshot.voice_heard_matched = !state.voice_vosk_last_trigger.lock().trim().is_empty()
        || (phrase_hit && snapshot.cursor_beginner_armed);
}

fn pad_run_status_slot() -> &'static ParkingMutex<(String, String, Instant)> {
    PAD_RUN_STATUS.get_or_init(|| ParkingMutex::new(("idle".into(), String::new(), Instant::now())))
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
    if status == "failed" {
        crate::agent_attention::emit_sound_event(
            "pad.dispatch_failed",
            &format!("pad|{}", micro_key_id.trim()),
        );
    }
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
            // Auto-advance running ? done, then idle on next reads.
            *pad_run_status_slot().lock() = ("done".into(), micro.clone(), Instant::now());
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
    // Single debounced host helper (same as maybe_tick) ? do not re-derive from latch alone.
    let show = overlay_should_be_visible_host();
    let visible_reason = overlay_visible_reason();
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
    sync_minimax_inferred_lifecycle(cfg);
    let ambient_status = {
        use crate::soft_pad_runtime::AgentKind;
        let kinds: Vec<AgentKind> = [
            AgentKind::Codex,
            AgentKind::Claude,
            AgentKind::Cursor,
            AgentKind::CopilotCli,
            AgentKind::CopilotVscode,
            AgentKind::Gemini,
            AgentKind::Cline,
            AgentKind::Roo,
            AgentKind::OpenCode,
            AgentKind::Aider,
            AgentKind::WorkBuddy,
            AgentKind::Trae,
            AgentKind::TraeCode,
            AgentKind::Windsurf,
            AgentKind::Qoder,
            AgentKind::MiniMax,
        ]
        .into_iter()
        .filter(|k| agent_status_light_enabled(cfg, *k))
        .collect();
        crate::agent_lane::ambient_ui_status(&app_status, &kinds)
    };
    let foreground_agent = foreground_agent_kind();
    let vendor_rgb = vendor.rgb.as_ref().map(|c| CodexMicroOverlayRgb {
        r: c.r,
        g: c.g,
        b: c.b,
    });
    let (ambient_mode, ambient_solid, ambient_opacity, key_preset, status_colors, ambient_enabled) =
        active_codex_mapping_with_overlay(cfg)
            .map(|(_, p)| {
                (
                    p.ambient_mode.clone(),
                    p.ambient_solid_rgb.clone(),
                    p.ambient_opacity,
                    p.key_light_preset.clone(),
                    p.status_colors.clone(),
                    p.ambient_enabled,
                )
            })
            .unwrap_or_else(|| {
                (
                    "status".into(),
                    String::new(),
                    100,
                    "default".into(),
                    crate::config::SoftPadStatusColors::default(),
                    true,
                )
            });
    let rgb = resolve_overlay_rgb(
        app_state_enabled,
        &ambient_status,
        &pad_status,
        vendor_rgb,
        &ambient_mode,
        &ambient_solid,
        ambient_opacity,
        &key_preset,
        &status_colors,
        ambient_enabled,
    );
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let claude_active = crate::pad_status::claude_lights::snapshot_active(now_ms);

    let Some((mapping, pad)) = active_codex_mapping_with_overlay(cfg) else {
        let minimized = *overlay_minimized().lock();
        // Labs / loopback: still expose status merge on cells when protocol or app-state is live,
        // even if Codex Micro overlay mapping is not configured yet.
        let status_light_micro_key_id =
            resolve_status_light_micro_key_id_impl(&[], overlay_layout_has_micro_key);
        let empty_pad = CodexMicroPadConfig {
            enabled: false,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: false,
            layout_profile: String::new(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: app_state_enabled,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        };
        let (claude_hosts, agent_lights_overflow, agent_lights_overflow_items) =
            (Vec::new(), String::new(), Vec::new());
        let agent_lights: Vec<crate::pad_status::ClaudeAgentLightState> = Vec::new();
        let _ = (&empty_pad, &claude_active);
        let context_status = act_context_status(app_state_enabled, &app_status, &pad_status);
        let claude_waiting_hint = claude_waiting_hint_for(&claude_hosts, &context_status);
        let cells = protocol_status_cells_if_active(
            &pad_status,
            &status_micro,
            &vendor,
            app_state_enabled,
            &status_light_micro_key_id,
            &claude_hosts,
        );
        let (nav_cta_mapping_id, nav_cta_agent, nav_cta_slots) = resolve_nav_enable_cta(
            cfg,
            None,
            None,
            None,
            &app_agent,
            &app_last_source,
        );
        let ag_light_gates = build_ag_light_gates(
            cfg,
            None,
            None,
            "",
            crate::soft_pad_purpose::SoftPadPurpose::Shortcuts.as_str(),
            &[],
            false,
            &status_light_micro_key_id,
            &cells,
            &nav_cta_mapping_id,
            &nav_cta_agent,
            &app_agent,
            &app_last_source,
            &app_status,
        );
        return CodexMicroOverlaySnapshot {
            visible: false,
            visible_reason,
            enabled: false,
            overlay_enabled: false,
            pad_mode: "numpad".into(),
            joy_nav_panel_open: false,
            joy_arrows_live: false,
            joy_context_hint: String::new(),
            require_num_lock_off: false,
            num_lock_blocking: false,
            nav_keys_enabled: true,
            layout_columns: 5,
            bound_count: 0,
            active_micro_key_id: String::new(),
            pad_status,
            status_micro_key_id: status_micro,
            status_light_micro_key_id,
            software_enhance_enabled: false,
            minimized,
            skin: normalize_skin("").to_string(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts.as_str().to_string(),
            mapping_id: String::new(),
            applied_agent: String::new(),
            nav_cta_mapping_id,
            nav_cta_agent,
            nav_cta_slots,
            ag_surface: crate::soft_pad_purpose::AgSurface::Actions.as_str().to_string(),
            navigation_slots: Vec::new(),
            navigation_overflow: 0,
            multi_agent_lights: false,
            rgb,
            connection_state: vendor.connection_state.clone(),
            protocol_version: vendor.version.clone(),
            device_status: vendor.device_status.clone(),
            app_last_event,
            app_last_source,
            app_last_seen_at,
            app_status: app_status.clone(),
            ambient_status: ambient_status.clone(),
            rgb_pulse: rgb_pulse_for(&ambient_status),
            app_age_ms,
            app_state_enabled,
            app_confidence,
            app_agent,
            foreground_agent: foreground_agent.clone(),
            app_message,
            app_task_id,
            app_session_id,
            agents: agent_chip_snapshots(cfg),
            agent_lights,
            agent_lights_overflow,
            agent_lights_overflow_items,
            claude_waiting_hint,
            ag_light_gates,
            cells,
            cursor_beginner_mode: crate::cursor_beginner::beginner_mode_active(cfg),
            cursor_probe_ok: crate::cursor_beginner::probe_ok(),
            cursor_beginner_armed: crate::cursor_beginner::effective_armed(cfg),
            cursor_beginner_probe_message: if crate::cursor_beginner::probe_ok() {
                String::new()
            } else {
                crate::cursor_beginner::PROBE_FAIL_MSG.into()
            },
            cursor_beginner_slots: crate::cursor_beginner::build_slot_snapshots(
                crate::cursor_beginner::probe_ok(),
            ),
            cursor_beginner_arm_hint: crate::cursor_beginner::arm_hint(cfg),
            cursor_beginner_flow_hint: crate::cursor_beginner::flow_hint(cfg),
            voice_heard_partial: String::new(),
            voice_heard_final: String::new(),
            voice_heard_matched: false,
            activation_hub_active: false,
            activation_hub_started_at_ms: 0,
            activation_hub_timeout_ms: 0,
            pending_confirm: None,
        };
    };

    let mut status_light_micro_key_id = resolve_status_light_micro_key_id(pad);
    // Runtime expand/minimize is sticky; pad.presentation only seeds on mapping switch.
    let minimized = sync_minimized_for_mapping(&mapping.id, pad);
    let applied_kind = crate::soft_pad_runtime::applied_lane()
        .map(|(k, mid)| {
            if mid == mapping.id {
                Some(k)
            } else {
                None
            }
        })
        .flatten()
        .or_else(|| {
            crate::agent_catalog::kind_from_mapping(
                mapping.app_target_id.trim(),
                mapping.agent_provider_id.trim(),
            )
        });
    let applied_agent = applied_kind
        .map(|k| k.as_str().to_string())
        .unwrap_or_default();
    let ag_surface = applied_kind
        .map(|k| crate::soft_pad_purpose::ag_surface_for(k, pad))
        .unwrap_or(crate::soft_pad_purpose::AgSurface::Actions);
    let navigation_slots = applied_kind
        .map(|k| crate::soft_pad_purpose::navigation_slots_for(k, pad))
        .unwrap_or_default();
    if let Some(kind) = applied_kind {
        let explicit_status_host = pad
            .keys
            .iter()
            .any(|k| k.enabled && k.slot_id.trim() == "status");
        if !explicit_status_host
            && !status_light_micro_key_id.is_empty()
            && crate::soft_pad_purpose::is_navigation_micro_key(kind, pad, &status_light_micro_key_id)
        {
            // Keep app status host on an Action key in mixed nav mode.
            for candidate in ["AG04", "AG05", "ACT12", "ACT08"] {
                if overlay_layout_has_micro_key(candidate)
                    && !crate::soft_pad_purpose::is_navigation_micro_key(kind, pad, candidate)
                {
                    status_light_micro_key_id = candidate.to_string();
                    break;
                }
            }
        }
        // Cursor has no session-lane AG lights — hosting status on AG00 looks like Codex AG1/AG2.
        if kind == crate::soft_pad_runtime::AgentKind::Cursor
            && !explicit_status_host
            && status_light_micro_key_id.starts_with("AG")
        {
            for candidate in ["ACT09", "ACT08", "ACT12", "ENC"] {
                if overlay_layout_has_micro_key(candidate) {
                    status_light_micro_key_id = candidate.to_string();
                    break;
                }
            }
        }
    }
    let multi_agent_lights = applied_kind
        .map(|k| crate::soft_pad_purpose::multi_agent_lights_allowed(k, pad))
        .unwrap_or(false);
    let navigation_overflow = if let Some(kind) = applied_kind {
        let lane_count = crate::agent_lane::store::public_lanes_for_page(kind).len();
        lane_count.saturating_sub(navigation_slots.len()) as u32
    } else {
        0
    };

    let (nav_cta_mapping_id, nav_cta_agent, nav_cta_slots) = resolve_nav_enable_cta(
        cfg,
        Some(mapping),
        Some(pad),
        applied_kind,
        &app_agent,
        &app_last_source,
    );

    // Mixed navigation: lane badges come from slot assignments — never CLAUDE_AG_POOL hosts.
    let has_nav_keys = !navigation_slots.is_empty();
    let claude_main_light = claude_active
        .iter()
        .find(|l| l.agent_key == crate::pad_status::CLAUDE_MAIN_KEY && l.state != "idle")
        .cloned();

    let (claude_hosts, agent_lights_overflow, agent_lights_overflow_items) =
        if claude_light_page_matches(mapping) {
            // In mixed navigation, AG01/AG02… may be navigation lanes and are suppressed by
            // nav_lane UI rules. Re-host Claude main light to status host so it still flashes.
            let hosts = if has_nav_keys
                && !status_light_micro_key_id.is_empty()
                && claude_main_light.is_some()
            {
                vec![(
                    status_light_micro_key_id.clone(),
                    claude_main_light.unwrap(),
                )]
            } else {
                resolve_claude_main_light_host_only(pad, &claude_active)
            };
            (hosts, String::new(), Vec::new())
        } else {
            (Vec::new(), String::new(), Vec::new())
        };
    let agent_lights: Vec<_> = if multi_agent_lights {
        // Expose active subagent lights for diagnose; they do not own AG click hosts.
        claude_active.clone()
    } else {
        claude_hosts.iter().map(|(_, l)| l.clone()).collect()
    };
    let lane_by_micro: std::collections::HashMap<String, crate::agent_lane::model::AgentLane> =
        if let Some(kind) = applied_kind {
            if has_nav_keys {
                let page = crate::agent_lane::page::get_page_state(kind, &mapping.id, pad);
                let lanes = crate::agent_lane::store::public_lanes_for_page(kind);
                page.slot_assignments
                    .into_iter()
                    .filter_map(|a| {
                        lanes
                            .iter()
                            .find(|l| l.lane_id == a.lane_id)
                            .cloned()
                            .map(|lane| (a.micro_key_id, lane))
                    })
                    .collect()
            } else {
                std::collections::HashMap::new()
            }
        } else {
            std::collections::HashMap::new()
        };
    let claude_needs_input = claude_hosts.iter().any(|(_, l)| l.state == "needs_input")
        || lane_by_micro
            .values()
            .any(|l| l.state == crate::agent_lane::model::LaneState::NeedsInput);
    let context_status_for_hint = act_context_status(app_state_enabled, &app_status, &pad_status);
    let claude_waiting_hint = claude_waiting_hint_for(&claude_hosts, &context_status_for_hint);
    let mut bound_count = 0u32;
    let mut cells = Vec::with_capacity(OVERLAY_CELLS.len());
    for def in OVERLAY_CELLS {
        let route = route_for_micro(pad, def.micro_key_id);
        let slot_id = route.and_then(|r| {
            let s = r.slot_id.trim();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        });
        let mut key_role = match applied_kind {
            Some(kind) => crate::soft_pad_purpose::effective_key_role(
                kind,
                pad.purpose,
                def.micro_key_id,
                route.and_then(|r| r.key_role),
            ),
            None => crate::soft_pad_purpose::SoftPadKeyRole::Action,
        };
        // Cursor has no session AG lamps — always action keys.
        if applied_kind == Some(crate::soft_pad_runtime::AgentKind::Cursor) {
            key_role = crate::soft_pad_purpose::SoftPadKeyRole::Action;
        }
        let nav_lane = applied_kind
            .map(|kind| crate::soft_pad_purpose::is_navigation_micro_key(kind, pad, def.micro_key_id))
            .unwrap_or(false);
        // Session lanes / status host have no chord binding — still must paint lights.
        // Without bound, overlay FE adds is-route-disabled and greys needs_input away.
        let bound = def.micro_key_id == "JOY"
            || def.micro_key_id == "ENC"
            || nav_lane
            || def.micro_key_id == status_light_micro_key_id
            || crate::codex_numpad_layer::micro_key_routable(mapping, pad, def.micro_key_id);
        if bound {
            bound_count += 1;
        }
        let mut sub = String::new();
        if let Some(slot) = slot_id {
            let app_tid = mapping.app_target_id.trim();
            // Cursor plan/agent are composerMode chords, not Codex slash insert.
            let cursor_composer = app_tid == crate::app_chat_workflow::CURSOR_APP_TARGET_ID
                && matches!(slot, "plan" | "switchAgent");
            if !cursor_composer {
                if let Some(insert) =
                    crate::agent::templates::slot_by_id(slot).and_then(|s| s.insert_text)
                {
                    sub = format!("插入 {insert}");
                }
            }
            if sub.is_empty() {
                if slot == "summonCodex" {
                    sub = "召唤".into();
                } else if let Some(b) = agent_key_binding_for_slot(mapping, slot) {
                    let chord = b.trigger_binding.trim();
                    if !chord.is_empty() {
                        sub = chord.to_string();
                    }
                }
            }
            if sub.is_empty() {
                let d = crate::agent::bindings_build::default_key_for_scenario(app_tid, slot);
                if !d.is_empty() {
                    sub = d.to_string();
                }
            }
        }
        let mut ui_icon_id = route
            .map(|r| r.ui_icon_id.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| def.default_icon.to_string());
        let source_kind = source_kind_for_route(def.micro_key_id, route).to_string();
        // Navigation AG: show as lane slots (Micro-like), not shortcut icons — avoids light/action clash.
        if nav_lane {
            ui_icon_id = "lane".into();
        }
        let route_slot = route.map(|r| r.slot_id.trim()).unwrap_or("");
        // Plan/Agent capability glyphs — replace leftover palette/fork from prior slots.
        if matches!(route_slot, "plan" | "switchAgent") {
            let want = if route_slot == "plan" {
                "plan"
            } else {
                "agent"
            };
            if crate::codex_numpad_layer::soft_pad_icon_is_leftover(
                &ui_icon_id,
                def.micro_key_id,
                route_slot,
            ) {
                ui_icon_id = want.into();
            }
        } else if let Some(want) =
            crate::codex_numpad_layer::migrate_cursor_weak_slot_icon(route_slot, &ui_icon_id)
        {
            // Keep overlay == settings: apply weak-default migrate even before config save.
            ui_icon_id = want.into();
        } else if applied_kind == Some(crate::soft_pad_runtime::AgentKind::Cursor)
            && def.micro_key_id.starts_with("AG")
            && matches!(ui_icon_id.as_str(), "agent" | "lane" | "claude" | "")
        {
            // Cursor Soft Pad: strip Codex session-lane icons on AG* only (not Plan/Agent slots).
            ui_icon_id = match def.micro_key_id {
                "AG01" => "messagePlus".into(),
                "AG00" => "command".into(),
                "AG02" => "sparkles".into(),
                "AG03" => "search".into(),
                "AG04" => "send".into(),
                "AG05" => "reject".into(),
                _ => def.default_icon.to_string(),
            };
        }
        let lane = lane_by_micro.get(def.micro_key_id);
        let claude_light = if nav_lane {
            None
        } else {
            claude_host_map_for_cell(&claude_hosts, def.micro_key_id)
        };
        let (mut run_status, mut status_source, native_run_status) = resolve_cell_run_status(
            def.micro_key_id,
            &pad_status,
            &status_micro,
            &vendor,
            app_state_enabled,
            &status_light_micro_key_id,
            claude_light.as_ref(),
            allow_codex_native_ag_lights(applied_kind, &app_agent),
        );
        let mut lane_id = String::new();
        let mut subagent_count = 0u32;
        if let Some(lane) = lane {
            lane_id = lane.lane_id.clone();
            run_status = lane.state.ui_status().to_string();
            status_source = "agent_lane".into();
            // The status strip and AG lanes are separate Hook projections. Reconcile
            // only the same live Claude session so a missed lifecycle alias cannot
            // leave its assigned physical slot grey while the strip is visibly busy.
            if run_status == "idle"
                && applied_kind == Some(crate::soft_pad_runtime::AgentKind::Claude)
                && app_agent.eq_ignore_ascii_case("claude")
                && !app_session_id.trim().is_empty()
                && lane.key.session_id == app_session_id
                && !app_status.trim().is_empty()
                && app_status != "idle"
            {
                run_status = app_status.clone();
                status_source = "agent_lane_reconciled".into();
            }
            if multi_agent_lights {
                subagent_count = lane.subagent_summary.len() as u32;
            }
        }
        let context_status = act_context_status(app_state_enabled, &app_status, &pad_status);
        let effective_context = effective_act_context(&context_status, claude_needs_input);
        let (context_rank, context_hint) = act_context_for(def.micro_key_id, &effective_context);
        let mut label = label_for_overlay_cell(def, claude_light.as_ref());
        if claude_light.is_none() {
            if let Some(slot) = slot_id {
                if let Some(cap) = overlay_slot_caption(mapping.app_target_id.trim(), slot) {
                    label = cap;
                }
            }
        }
        if nav_lane {
            if let Some(lane) = lane {
                label = lane
                    .title
                    .clone()
                    .filter(|t| !t.trim().is_empty())
                    .unwrap_or_else(|| {
                        let sid = lane.key.session_id.trim();
                        if sid.is_empty() {
                            format!("会话 {}", def.micro_key_id.trim_start_matches("AG"))
                        } else if sid.len() > 10 {
                            format!("{}…", &sid[..8])
                        } else {
                            sid.to_string()
                        }
                    });
                if multi_agent_lights && !lane.subagent_summary.is_empty() {
                    let n = lane.subagent_summary.len();
                    sub = if n == 1 {
                        crate::pad_status::short_agent_type(&lane.subagent_summary[0])
                    } else {
                        format!("+{n} 子代理")
                    };
                } else if sub.is_empty() {
                    sub = "会话槽".into();
                }
            } else if let Some(ag_idx) = def.micro_key_id.strip_prefix("AG") {
                label = format!("会话 {ag_idx}");
                if sub.is_empty() {
                    sub = "未分配".into();
                }
            }
        } else if !context_hint.is_empty() {
            if sub.is_empty() {
                sub = context_hint.clone();
            } else if !sub.contains(&context_hint) {
                sub = format!("{sub} · {context_hint}");
            }
        }
        let mut cell_kind = def.kind.to_string();
        let mut out_lane_id = lane_id;
        let mut out_subagent = subagent_count;
        let mut out_run = run_status;
        let mut out_src = status_source;
        let mut out_native = native_run_status;
        if applied_kind == Some(crate::soft_pad_runtime::AgentKind::Cursor) {
            if cell_kind == "agent" {
                cell_kind = "command".into();
            }
            out_lane_id.clear();
            out_subagent = 0;
            // Never paint Codex/Claude AG session lights on Cursor Soft Pad AG* keys.
            if def.micro_key_id.starts_with("AG") {
                if out_src == "native"
                    || out_src == "native_micro"
                    || out_src == "agent_lane"
                    || out_src == "agent_lane_reconciled"
                {
                    out_run = "idle".into();
                    out_src = "inferred".into();
                    out_native.clear();
                }
            }
            if sub == "会话槽" || sub.starts_with("会话 ") {
                sub.clear();
            }
        }
        cells.push(CodexMicroOverlayCell {
            micro_key_id: def.micro_key_id.to_string(),
            label,
            bound,
            sub,
            ui_icon_id,
            kind: cell_kind,
            slot_id: route_slot.to_string(),
            source_kind,
            run_status: out_run,
            status_source: out_src,
            native_run_status: out_native,
            context_rank,
            context_hint,
            key_role: key_role.as_str().to_string(),
            lane_id: out_lane_id,
            subagent_count: out_subagent,
        });
    }
    // NAV column is optional: keep routes in config, hide cells when navKeysEnabled is off.
    if !pad.nav_keys_enabled {
        cells.retain(|c| !c.micro_key_id.starts_with("NAV_"));
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
    // "保持在最前" (require_foreground=false): stay visible while Soft Pad is enabled,
    // except over OneTone (main or focus-steal race). Still not "hijack any app" for key dispatch.
    // Home `softPadForceOpen` bypasses FG / OneTone-main host gates (settings drawer still gated).
    let host_ok = if cfg.soft_pad_force_open {
        true
    } else if !pad.require_foreground {
        if crate::app_identity::foreground_is_self() {
            // Never treat OneTone process as "other app" for keep-on-top.
            // Overlay self-FG while settings are open is forced off in build_snapshot gate.
            if onetone_main_is_foreground() {
                false
            } else if soft_pad_agent_is_foreground()
                || hook_needs_input_hold()
                || claude_activity_hold()
            {
                true
            } else if overlay_hwnd_is_foreground() {
                // Do not keep float solely because the pad stole FG from OneTone main.
                *last_visible().lock()
                    && !is_overlay_session_dismissed()
                    && agent_show_reason_recent()
                    && !onetone_main_is_foreground()
            } else {
                false
            }
        } else if soft_pad_agent_is_foreground()
            || hook_needs_input_hold()
            || claude_activity_hold()
        {
            true
        } else if overlay_hwnd_is_foreground() {
            *last_visible().lock()
                && !is_overlay_session_dismissed()
                && agent_show_reason_recent()
        } else {
            // Other app focused — keep-on-top.
            true
        }
    } else {
        show
    };
    let session_ok = cfg.soft_pad_force_open || !is_overlay_session_dismissed();
    let ag_light_gates = build_ag_light_gates(
        cfg,
        Some(mapping),
        Some(pad),
        &applied_agent,
        pad.purpose.as_str(),
        &navigation_slots,
        multi_agent_lights,
        &status_light_micro_key_id,
        &cells,
        &nav_cta_mapping_id,
        &nav_cta_agent,
        &app_agent,
        &app_last_source,
        &app_status,
    );
    CodexMicroOverlaySnapshot {
        visible: host_ok
            && session_ok
            && (pad.overlay_enabled
                || soft_pad_surface_owner()
                    .is_some_and(|(tid, _)| tid.trim() == mapping.app_target_id.trim())),
        visible_reason,
        enabled: pad.enabled,
        overlay_enabled: pad.overlay_enabled,
        pad_mode,
        joy_nav_panel_open,
        joy_arrows_live,
        joy_context_hint,
        require_num_lock_off: pad.require_num_lock_off,
        num_lock_blocking: readiness.num_lock_blocking,
        nav_keys_enabled: pad.nav_keys_enabled,
        layout_columns: if pad.nav_keys_enabled { 5 } else { 4 },
        bound_count,
        active_micro_key_id: active,
        pad_status,
        status_micro_key_id: status_micro,
        status_light_micro_key_id,
        software_enhance_enabled: pad.software_enhance_enabled,
        minimized,
        skin: normalize_skin(&pad.skin).to_string(),
        purpose: pad.purpose.as_str().to_string(),
        mapping_id: mapping.id.clone(),
        applied_agent,
        nav_cta_mapping_id,
        nav_cta_agent,
        nav_cta_slots,
        ag_surface: ag_surface.as_str().to_string(),
        navigation_slots,
        navigation_overflow,
        multi_agent_lights,
        rgb,
        connection_state: vendor.connection_state.clone(),
        protocol_version: vendor.version.clone(),
        device_status: vendor.device_status.clone(),
        app_last_event,
        app_last_source,
        app_last_seen_at,
        app_status: app_status.clone(),
        ambient_status: ambient_status.clone(),
        rgb_pulse: rgb_pulse_for(&ambient_status),
        app_age_ms,
        app_state_enabled,
        app_confidence,
        app_agent,
        foreground_agent,
        app_message,
        app_task_id,
        app_session_id,
        agents: agent_chip_snapshots(cfg),
        agent_lights,
        agent_lights_overflow,
        agent_lights_overflow_items,
        claude_waiting_hint,
        ag_light_gates,
        cells,
        cursor_beginner_mode: crate::cursor_beginner::beginner_mode_active(cfg),
        cursor_probe_ok: crate::cursor_beginner::probe_ok(),
        cursor_beginner_armed: crate::cursor_beginner::effective_armed(cfg),
        cursor_beginner_probe_message: if crate::cursor_beginner::probe_ok() {
            String::new()
        } else {
            crate::cursor_beginner::PROBE_FAIL_MSG.into()
        },
        cursor_beginner_slots: crate::cursor_beginner::build_slot_snapshots(
            crate::cursor_beginner::probe_ok(),
        ),
        cursor_beginner_arm_hint: crate::cursor_beginner::arm_hint(cfg),
        cursor_beginner_flow_hint: crate::cursor_beginner::flow_hint(cfg),
        voice_heard_partial: String::new(),
        voice_heard_final: String::new(),
        voice_heard_matched: false,
        activation_hub_active: false,
        activation_hub_started_at_ms: 0,
        activation_hub_timeout_ms: 0,
        pending_confirm: None,
    }
}

/// When overlay mapping is off but Codex protocol or app-state is live, still emit status cells.
fn protocol_status_cells_if_active(
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
    claude_hosts: &[(String, crate::pad_status::ClaudeAgentLightState)],
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
        claude_hosts,
    )
}

fn build_protocol_status_cells(
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
    claude_hosts: &[(String, crate::pad_status::ClaudeAgentLightState)],
) -> Vec<CodexMicroOverlayCell> {
    let app_status = crate::pad_status::ui_status_from_pad(&crate::pad_status::snapshot());
    let allow_native = allow_codex_native_ag_lights(None, "");
    let context_status = act_context_status(app_state_enabled, &app_status, pad_status);
    let claude_needs_input = claude_hosts.iter().any(|(_, l)| l.state == "needs_input");
    let effective_context = effective_act_context(&context_status, claude_needs_input);
    OVERLAY_CELLS
        .iter()
        .map(|def| {
            let claude_light = claude_host_map_for_cell(claude_hosts, def.micro_key_id);
            let (run_status, status_source, native_run_status) = resolve_cell_run_status(
                def.micro_key_id,
                pad_status,
                status_micro,
                vendor,
                app_state_enabled,
                status_light_micro_key_id,
                claude_light.as_ref(),
                allow_native,
            );
            let (context_rank, context_hint) =
                act_context_for(def.micro_key_id, &effective_context);
            CodexMicroOverlayCell {
                micro_key_id: def.micro_key_id.to_string(),
                label: label_for_overlay_cell(def, claude_light.as_ref()),
                // Status / Claude host keys must paint even without a mapping chord.
                bound: def.micro_key_id == status_light_micro_key_id || claude_light.is_some(),
                sub: context_hint.clone(),
                ui_icon_id: def.default_icon.to_string(),
                kind: def.kind.to_string(),
                slot_id: String::new(),
                source_kind: "none".into(),
                run_status,
                status_source,
                native_run_status,
                context_rank,
                context_hint,
                key_role: "action".into(),
                lane_id: String::new(),
                subagent_count: 0,
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

/// Visual ACT context only ? does not block fire.
fn act_context_for(micro_key_id: &str, ui_status: &str) -> (String, String) {
    let id = micro_key_id.trim();
    if !id.starts_with("ACT") {
        return (String::new(), String::new());
    }
    match ui_status {
        "needs_input" => match id {
            "ACT12" => ("emphasize".into(), "确认 / 继续".into()),
            "ACT08" => ("emphasize".into(), "拒绝 / 取消".into()),
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

/// Codex Micro `thstatus` AG lights only belong on a Codex Soft Pad surface.
fn allow_codex_native_ag_lights(
    overlay_kind: Option<crate::soft_pad_runtime::AgentKind>,
    app_agent: &str,
) -> bool {
    use crate::soft_pad_runtime::AgentKind;
    match overlay_kind {
        Some(AgentKind::Codex) => true,
        Some(_) => false,
        None => {
            // No overlay mapping (protocol probe): allow unless Cursor/other Soft Pad agent owns FG.
            if app_agent.eq_ignore_ascii_case("cursor") {
                return false;
            }
            match crate::app_identity::foreground_effective_app_target_id()
                .as_deref()
                .and_then(|id| AgentKind::from_app_target(id.trim()))
            {
                Some(AgentKind::Codex) | None => true,
                Some(_) => false,
            }
        }
    }
}

/// Cell paint priority: fresh native > Claude agent host > Codex status host > inferred.
fn resolve_cell_run_status(
    micro_key_id: &str,
    pad_status: &str,
    status_micro: &str,
    vendor: &crate::codex_micro_vendor::CodexMicroProtocolState,
    app_state_enabled: bool,
    status_light_micro_key_id: &str,
    claude_light: Option<&crate::pad_status::ClaudeAgentLightState>,
    allow_native_ag: bool,
) -> (String, String, String) {
    let inferred = if !status_micro.is_empty() && status_micro == micro_key_id {
        pad_status.to_string()
    } else {
        "idle".into()
    };

    let idx = crate::codex_micro_vendor::agent_slot_index(micro_key_id);
    let native = if allow_native_ag {
        if let Some(i) = idx {
            if crate::codex_micro_vendor::native_fresh(vendor) {
                vendor.agent_slots[i]
                    .as_ref()
                    .map(|s| s.state.clone())
                    .unwrap_or_default()
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    // 1) Fresh native AG thstatus wins on this key (Codex Soft Pad only).
    if allow_native_ag {
        if let Some(i) = idx {
            if crate::codex_micro_vendor::native_fresh(vendor) {
                if let Some(slot) = vendor.agent_slots[i].as_ref() {
                    let st = slot.state.clone();
                    return (st.clone(), "native".into(), st);
                }
            }
        }
    }

    // 2) Claude agent light host.
    if let Some(cl) = claude_light {
        if cl.state != "idle" {
            return (cl.state.clone(), cl.source.clone(), native);
        }
    }

    // 3) Codex PadStatus host — Codex Soft Pad only (never paint AG "session" lights on Cursor).
    if allow_native_ag
        && app_state_enabled
        && !status_light_micro_key_id.is_empty()
        && micro_key_id == status_light_micro_key_id
    {
        let pad = crate::pad_status::snapshot();
        if pad.updated_at > 0 {
            let ui = crate::pad_status::ui_status_from_pad(&pad);
            let src = pad.display_source_label().to_string();
            return (ui, src, native);
        }
    }

    // Non-AG without Claude/Codex host: inferred only.
    if idx.is_none() {
        return (inferred, "inferred".into(), String::new());
    }

    if inferred != "idle" {
        return (inferred, "inferred".into(), String::new());
    }
    ("idle".into(), "fallback".into(), String::new())
}

fn foreground_agent_kind() -> String {
    crate::app_identity::foreground_effective_app_target_id()
        .and_then(|id| crate::soft_pad_runtime::AgentKind::from_app_target(id.trim()))
        .map(|k| k.as_str().to_string())
        .unwrap_or_default()
}

fn rgb_pulse_for(status: &str) -> String {
    match status.trim() {
        "running" | "working" | "listening" => "breathing".into(),
        "needs_input" => "slow".into(),
        "error" | "failed" => "flash".into(),
        _ => String::new(),
    }
}

fn app_fields_from_pad_core() -> (
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
    // Do not inject native AG0 into State Core on every snapshot ? status-lights
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

/// MiniMax has no lifecycle hooks — never invent Working from process.
/// Clear any leftover inferred Working so the chip stays a steady quota lamp.
fn sync_minimax_inferred_lifecycle(cfg: &VoiceConfig) {
    use crate::agent_attention::store::{self, raise_lifecycle};
    use crate::agent_attention::{AttentionState, SignalSource};
    use crate::soft_pad_runtime::AgentKind;

    let _ = cfg; // lights gate unused — no process→running impersonation
    let prev = store::primary_state_for(AgentKind::MiniMax);
    let prev_src = store::lifecycle_source_for(AgentKind::MiniMax);
    if prev == Some(AttentionState::Working) && prev_src == Some(SignalSource::Inferred) {
        raise_lifecycle(
            AgentKind::MiniMax,
            None,
            AttentionState::Idle,
            SignalSource::Inferred,
        );
    }
}

fn agent_status_light_enabled(cfg: &VoiceConfig, kind: crate::soft_pad_runtime::AgentKind) -> bool {
    use crate::soft_pad_runtime::AgentKind;
    cfg.mappings.iter().any(|m| {
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            return false;
        };
        match kind {
            AgentKind::Codex => pad.codex_status_lights_enabled,
            AgentKind::Claude => pad.claude_status_lights_enabled,
            AgentKind::Cursor => pad.cursor_status_lights_enabled,
            AgentKind::WorkBuddy => pad.workbuddy_status_lights_enabled,
            AgentKind::Trae => pad.trae_status_lights_enabled,
            AgentKind::TraeCode => pad.trae_code_status_lights_enabled,
            AgentKind::Windsurf => pad.windsurf_status_lights_enabled,
            AgentKind::Qoder => pad.qoder_status_lights_enabled,
            AgentKind::MiniMax => pad.minimax_status_lights_enabled,
            AgentKind::CopilotCli => pad.copilot_status_lights_enabled,
            AgentKind::CopilotVscode => pad.copilot_vscode_status_lights_enabled,
            AgentKind::Gemini => pad.gemini_status_lights_enabled,
            AgentKind::Cline => pad.cline_status_lights_enabled,
            AgentKind::Roo => pad.roo_status_lights_enabled,
            AgentKind::OpenCode => pad.opencode_status_lights_enabled,
            AgentKind::Aider => pad.aider_status_lights_enabled,
        }
    })
}

fn agent_chip_snapshots(cfg: &VoiceConfig) -> Vec<CodexMicroAgentSnapshot> {
    use crate::agent_attention::AttentionState;
    use crate::soft_pad_runtime::AgentKind;

    sync_minimax_inferred_lifecycle(cfg);
    crate::pad_status::sync_shell_inferred_lifecycle();
    let public = crate::agent_attention::public_snapshot();
    [
        AgentKind::Codex,
        AgentKind::Claude,
        AgentKind::Cursor,
        AgentKind::CopilotCli,
        AgentKind::CopilotVscode,
        AgentKind::Gemini,
        AgentKind::Cline,
        AgentKind::Roo,
        AgentKind::OpenCode,
        AgentKind::Aider,
        AgentKind::MiniMax,
        AgentKind::WorkBuddy,
        AgentKind::Trae,
        AgentKind::TraeCode,
        AgentKind::Windsurf,
        AgentKind::Qoder,
    ]
        .into_iter()
        .map(|kind| {
            let lights_on = agent_status_light_enabled(cfg, kind);
            // ponytail: Claude has a dedicated hook source (claude_hook / pad_status).
            // Chips should reflect real attention state regardless of lights_on so the
            // top-bar and pad agent bar stay in sync with CLI lifecycle. Codex and Cursor
            // retain the gate — they have no always-on hook equivalent.
            let raw_state = match crate::agent_attention::store::primary_state_for(kind) {
                Some(AttentionState::NeedsInput) => "needs_input",
                Some(AttentionState::Working) => "running",
                Some(AttentionState::Complete) => "done",
                Some(AttentionState::Error) => "failed",
                Some(AttentionState::Idle) | None => "idle",
            };
            let state = if kind == AgentKind::MiniMax {
                // Quota lamp only — never report running/done from process guess.
                "idle"
            } else if matches!(kind, AgentKind::WorkBuddy | AgentKind::Qoder) {
                // Hook-only motion lamp — process/mtime must not impersonate Cursor running.
                // Trae Work + Trae Code use Cursor-style inferred activity (OfficialHook still wins).
                match crate::agent_attention::store::lifecycle_source_for(kind) {
                    Some(crate::agent_attention::SignalSource::OfficialHook) => raw_state,
                    _ => "idle",
                }
            } else if kind == AgentKind::Claude {
                // For Claude: show real state when hook is live (pad_status has a recent
                // entry for claude_hook or claude_app), even if the lights toggle is off.
                let pad = crate::pad_status::snapshot();
                let source = pad.display_source_label();
                let hook_live = (source == "claude_hook" || source == "claude_app")
                    && pad.updated_at > 0;
                if hook_live || lights_on {
                    raw_state
                } else {
                    "idle"
                }
            } else if !lights_on {
                "idle"
            } else {
                raw_state
            };
            let metadata = crate::agent_model_metadata::snapshot(kind);
            let usage = crate::agent_usage::snapshot(kind);
            let health = crate::connector_health::snapshot_agent(kind);
            let (headline, headline_label) = crate::connector_health::headline_for_agent(kind);
            let updated_at = public
                .rows
                .iter()
                .filter(|row| row.agent == kind.as_str())
                .map(|row| row.observed_at_ms)
                .max()
                .unwrap_or(0)
                .max(metadata.updated_at)
                .max(usage.updated_at);
            let hook_configured = match kind {
                AgentKind::WorkBuddy | AgentKind::TraeCode | AgentKind::Qoder => {
                    crate::pad_status::shell_hook_configured(kind)
                }
                AgentKind::Trae | AgentKind::Windsurf => crate::pad_status::shell_hook_configured(kind),
                _ => None,
            };
            let signal_health = compute_signal_health(kind, hook_configured.as_ref(), state);
            CodexMicroAgentSnapshot {
                kind: kind.as_str().to_string(),
                state: state.to_string(),
                model: metadata.model,
                model_confidence: metadata.confidence,
                usage,
                health,
                headline_state: headline.as_str().to_string(),
                headline_label: headline_label.to_string(),
                updated_at,
                lights_enabled: lights_on,
                hook_configured,
                signal_health: signal_health.to_string(),
            }
        })
        .collect()
}

fn compute_signal_health(
    kind: crate::soft_pad_runtime::AgentKind,
    hook_configured: Option<&bool>,
    chip_state: &str,
) -> &'static str {
    use crate::pad_status::STALE_MS;
    use crate::soft_pad_runtime::AgentKind;

    if matches!(
        kind,
        AgentKind::WorkBuddy | AgentKind::Trae | AgentKind::TraeCode | AgentKind::Windsurf | AgentKind::Qoder
    ) && hook_configured == Some(&false)
    {
        return "unconfigured";
    }
    if kind == AgentKind::Codex && crate::pad_status::session_scan_corrupt() {
        return "corrupt";
    }
    // Active waiting/running is inherently fresh.
    if matches!(chip_state, "needs_input" | "running") {
        return "fresh";
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let pad = crate::pad_status::snapshot();
    let pad_for_agent = pad
        .agent
        .as_deref()
        .map(|a| a.eq_ignore_ascii_case(kind.as_str()))
        .unwrap_or(false);
    if pad_for_agent && pad.updated_at > 0 {
        let age = now.saturating_sub(pad.updated_at);
        if age > STALE_MS {
            return "stale";
        }
    }
    if let Some(age) = crate::agent_attention::store::lifecycle_age_ms(kind) {
        if age > STALE_MS {
            return "stale";
        }
    }
    "fresh"
}

/// Soft RGB Output Adapter: status-lights ? Core UI status; else local pad run, then vendor rgbcfg.
/// When `ambient_enabled` is false, no Soft RGB. When `ambient_mode == "solid"`, use fixed hex.
fn resolve_overlay_rgb(
    app_state_enabled: bool,
    app_status: &str,
    pad_run_status: &str,
    vendor_rgb: Option<CodexMicroOverlayRgb>,
    ambient_mode: &str,
    ambient_solid: &str,
    ambient_opacity: u8,
    key_preset: &str,
    status_colors: &crate::config::SoftPadStatusColors,
    ambient_enabled: bool,
) -> Option<CodexMicroOverlayRgb> {
    if !ambient_enabled {
        return None;
    }
    if ambient_mode.trim().eq_ignore_ascii_case("solid") {
        if let Some(rgb) =
            crate::pad_status::rgb_for_ambient_full(
                app_status,
                "solid",
                ambient_solid,
                ambient_opacity,
                key_preset,
                Some(status_colors),
            )
        {
            return Some(CodexMicroOverlayRgb {
                r: rgb.0,
                g: rgb.1,
                b: rgb.2,
            });
        }
    }
    let status = if app_state_enabled {
        app_status
    } else {
        pad_run_status
    };
    if let Some(rgb) = crate::pad_status::rgb_for_ambient_full(
        status,
        "status",
        "",
        ambient_opacity,
        key_preset,
        Some(status_colors),
    ) {
        return Some(CodexMicroOverlayRgb {
            r: rgb.0,
            g: rgb.1,
            b: rgb.2,
        });
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
        "hidden".into()
    } else if crate::codex_numpad_layer::pad_mapping_active() {
        "hidden".into()
    } else {
        "hidden".into()
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

/// Toggle Codex ? numpad mode (`pad.enabled` only). Does not hide the overlay.
/// Disk save runs off the cfg lock ? sync pretty-print + bak under lock used to ??
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

pub fn overlay_runtime_minimized() -> bool {
    *overlay_minimized().lock()
}

/// Set overlay mini/full chrome and persist `presentation` on the active overlay mapping.
pub fn set_overlay_minimized_persist(app: &AppHandle, state: &AppState, minimized: bool) {
    *overlay_minimized().lock() = minimized;
    crate::cursor_beginner::on_minimized_changed(state, app, minimized);
    // Invalidate geom cache so the next push always resizes mini↔full (do not wait on DPI drift).
    *overlay_last_geom().lock() = None;
    let presentation = if minimized { "mini" } else { "full" };
    let dirty = {
        let mut cfg = state.cfg.lock();
        if let Some(pad) = active_codex_mapping_with_overlay_mut(&mut cfg) {
            if pad.presentation != presentation {
                pad.presentation = presentation.into();
                true
            } else {
                false
            }
        } else {
            false
        }
    };
    if dirty {
        // Clone then save — never hold cfg across disk I/O (watcher / scheduler can need the lock).
        let cfg = state.cfg.lock().clone();
        crate::config::save_config(&cfg);
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
    }
}

fn active_codex_mapping_with_overlay_mut(
    cfg: &mut VoiceConfig,
) -> Option<&mut CodexMicroPadConfig> {
    // Same order as active_codex_mapping_with_overlay: surface owner → Applied → baseline → Codex.
    let surface_tid = soft_pad_surface_owner().map(|(tid, _)| tid);
    let prefer_id = crate::soft_pad_runtime::applied_lane().map(|(_, mid)| mid);

    let idx = if let Some(tid) = surface_tid.as_deref() {
        cfg.mappings
            .iter()
            .position(|m| {
                m.enabled
                    && m.app_target_id.trim() == tid.trim()
                    && m.codex_micro_pad
                        .as_ref()
                        .map(|p| p.overlay_enabled)
                        .unwrap_or(false)
            })
            .or_else(|| {
                cfg.mappings.iter().position(|m| {
                    m.enabled
                        && m.app_target_id.trim() == tid.trim()
                        && m.codex_micro_pad.is_some()
                })
            })
    } else {
        prefer_id
            .as_ref()
            .and_then(|mid| {
                cfg.mappings.iter().position(|m| {
                    m.enabled
                        && m.id == *mid
                        && m.codex_micro_pad
                            .as_ref()
                            .map(|p| p.overlay_enabled)
                            .unwrap_or(false)
                })
            })
            .or_else(|| {
                cfg.mappings.iter().position(|m| {
                    m.enabled
                        && m.app_target_id.trim() == CODEX_APP_TARGET_ID
                        && m.codex_micro_pad
                            .as_ref()
                            .map(|p| p.overlay_enabled)
                            .unwrap_or(false)
                })
            })
    }?;
    cfg.mappings.get_mut(idx)?.codex_micro_pad.as_mut()
}

pub fn normalize_presentation(raw: &str) -> &'static str {
    if raw.trim().eq_ignore_ascii_case("mini") {
        "mini"
    } else {
        "full"
    }
}

pub fn presentation_is_mini(pad: &CodexMicroPadConfig) -> bool {
    normalize_presentation(&pad.presentation) == "mini"
}

/// Soft Pad visual skins. Unknown / empty ? `"default"`.
pub fn normalize_skin(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "glass-light" => "glass-light",
        "hybrid-pro" => "hybrid-pro",
        "vibe-light" => "vibe-light",
        // Legacy / theme-auto id ? persist as vibe-light; dark UI is CSS-driven.
        "vibe-dark" => "vibe-light",
        "default" | "" => "default",
        _ => "default",
    }
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
    request_overlay_push(app, state, true);
    crate::tray_state::emit_tray_segment(app, state, "channels");
}

/// Status-only refresh ? skip reposition/resize (hold-to-talk must not thrash overlay layout).
pub fn push_overlay_status(app: &AppHandle, state: &AppState) {
    request_overlay_push(app, state, false);
}

fn apply_overlay_payload(
    app: &AppHandle,
    payload: &CodexMicroOverlaySnapshot,
    reposition: bool,
    gen: u64,
) {
    if gen != window_generation() {
        return;
    }
    let visible = payload.visible;
    if visible {
        match crate::overlay_window::ensure_overlay_window(
            app,
            crate::overlay_window::CODEX_MICRO_OVERLAY,
        ) {
            Ok((_win, created)) => {
                if created {
                    // Invalidate concurrent scheduler jobs that raced without a window.
                    bump_window_generation();
                    if let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) {
                        let _ = configure_codex_overlay_window(&win);
                    }
                    // Allow overlay HTML to bind listeners before first emit.
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }
            Err(err) => {
                crate::app_log::sync_emergency_line(
                    "codex_overlay",
                    &format!("codex_micro_overlay: lazy create failed: {err}"),
                );
                return;
            }
        }
    }
    let Some(win) = app.get_webview_window(CODEX_MICRO_OVERLAY_LABEL) else {
        return;
    };
    // After lazy create we bumped generation; still apply *this* payload (it caused create).
    // Stale concurrent jobs already returned at the top check.
    cache_overlay_hwnd_from_window(&win);
    let already_visible = win.is_visible().unwrap_or(false);
    if visible {
        // Status-only pushes still reconcile mini↔full outer size (mapping presentation
        // can flip while visible; skipping resize left a 680px window around a 44px bar).
        let _ = apply_overlay_geometry(&win, payload);
        if reposition {
            let _ = win.set_always_on_top(true);
            let _ = win.set_skip_taskbar(true);
            // Already-on Soft Pad: geometry only — re-show causes FG flash on mapping switch.
            if !already_visible {
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
                apply_overlay_no_activate();
            }
            #[cfg(not(windows))]
            {
                let _ = win.show();
            }
            }
        }
    } else if !visible {
        let _ = win.hide();
    }
    if visible {
        sync_needs_input_pass_through(&win, payload);
    } else {
        // Hidden: punch through so a failed hide cannot steal clicks from settings.
        set_overlay_click_through(true);
        let _ = win.set_ignore_cursor_events(true);
    }
    let _ = win.emit("codex_micro_overlay_state", payload);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "to_js",
            &serde_json::json!({
                "type": "soft_pad_overlay_visibility",
                "visible": visible,
            }),
        );
    }
}

fn overlay_logical_size(minimized: bool, _joy_open: bool, listen_band: bool) -> (f64, f64) {
    if minimized {
        let h = if listen_band {
            OVERLAY_HEIGHT_MINI_LISTEN
        } else {
            OVERLAY_HEIGHT_MINI
        };
        (OVERLAY_WIDTH_MINI, h)
    } else {
        // NAV keys live on the 5-col main pad ? no side-rail width reserve.
        (OVERLAY_WIDTH, OVERLAY_HEIGHT_FULL)
    }
}

/// Resize overlay when minimized or full height budget changes.
fn apply_overlay_geometry(win: &WebviewWindow, snapshot: &CodexMicroOverlaySnapshot) -> bool {
    let minimized = snapshot.minimized;
    let listen_band = snapshot.minimized
        && ((snapshot.cursor_beginner_mode && snapshot.cursor_beginner_armed)
            || snapshot.activation_hub_active);
    let (logical_w, logical_h) =
        overlay_logical_size(minimized, snapshot.joy_nav_panel_open, listen_band);
    let width_key = logical_w.round() as i32;
    let height_key = logical_h.round() as i32;
    let want = (minimized, width_key, height_key);
    let prev = *overlay_last_geom().lock();
    let scale = win.scale_factor().unwrap_or(1.0);
    let target_w = (logical_w * scale).round() as u32;
    let target_h = (logical_h * scale).round() as u32;
    let outer = win.outer_size().ok().map(|s| (s.width, s.height));
    if !overlay_geom_needs_apply(prev, want, outer, (target_w, target_h)) {
        return false;
    }

    if *overlay_user_positioned().lock() {
        if let Some((x, y)) = *overlay_user_position().lock() {
            let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
        }
        let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));
    } else if prev.map(|(m, _, _)| m) != Some(minimized) {
        // mini↔full: keep the pad's visual anchor instead of jumping left/right.
        resize_overlay_anchored(win, logical_w, logical_h);
    } else {
        position_overlay(win);
        let _ = win.set_size(Size::Logical(LogicalSize::new(logical_w, logical_h)));
    }
    // Only cache when outer roughly matches — failed/async set_size must retry next tick.
    let outer_after = win.outer_size().ok().map(|s| (s.width, s.height));
    let ok = match outer_after {
        Some((w, h)) => w.abs_diff(target_w) <= 48 && h.abs_diff(target_h) <= 48,
        None => true,
    };
    if ok {
        *overlay_last_geom().lock() = Some(want);
    } else {
        *overlay_last_geom().lock() = None;
    }
    true
}

/// Keep the main keyboard's screen position stable while width changes.
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

/// Whether geometry must be re-applied. Key change always applies; same key only
/// recovers when outer size is grossly wrong (not 1–2px DPI drift).
fn overlay_geom_needs_apply(
    prev: Option<(bool, i32, i32)>,
    want: (bool, i32, i32),
    outer: Option<(u32, u32)>,
    target: (u32, u32),
) -> bool {
    if prev != Some(want) {
        return true;
    }
    match outer {
        Some((w, h)) => w.abs_diff(target.0) > 48 || h.abs_diff(target.1) > 48,
        None => false,
    }
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
    let (logical_w, logical_h) = overlay_logical_size(minimized, joy_open, false);
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

    // Overlay only shows while Codex is FG ? use the foreground HWND (O(1)).
    // Avoid EnumWindows + per-process identity probes (was a ?? risk on ticks).
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
        Some(((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2))
    }
}

#[cfg(not(windows))]
fn codex_window_center() -> Option<(i32, i32)> {
    None
}

/// Hide overlay for this session (settings open / Soft Pad X).
/// Does not persist overlay_enabled=false — that is settings "不显示浮窗".
/// Cleared when settings close, Soft Pad agent FG, or agent process is running.
pub fn dismiss_overlay(app: &AppHandle, state: &AppState) -> bool {
    *overlay_minimized().lock() = false;
    *overlay_session_dismissed().lock() = true;
    push_state(app, state);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "to_js",
            &serde_json::json!({ "type": "codex_micro_overlay_dismissed" }),
        );
    }
    true
}

pub fn maybe_tick(app: &AppHandle, state: &Arc<AppState>) {
    let was_fg = *last_foreground_codex().lock();
    let gate_reason = overlay_runtime_gate_reason(state);
    let force_open = state.cfg.lock().soft_pad_force_open;
    // Home force-open bypasses OneTone-main / FG host latch; settings/setup/recording still gate.
    let host_ok = gate_reason.is_none() && (force_open || overlay_should_be_visible_host());
    let is_fg = *last_foreground_codex().lock();

    if force_open && is_overlay_session_dismissed() && gate_reason.is_none() {
        *overlay_session_dismissed().lock() = false;
    }

    // Claude FG: nudge DeepSeek cash-balance refresh (5min poll alone is too cold for Soft Pad).
    if claude_is_foreground() {
        static LAST_DS_KICK: std::sync::OnceLock<parking_lot::Mutex<std::time::Instant>> =
            std::sync::OnceLock::new();
        let slot = LAST_DS_KICK.get_or_init(|| {
            parking_lot::Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(120))
        });
        let mut last = slot.lock();
        if last.elapsed() >= std::time::Duration::from_secs(45) {
            *last = std::time::Instant::now();
            drop(last);
            crate::agent_usage::kick_deepseek_balance_refresh();
        }
    }

    // Soft Pad lane follows live FG (cached terminal-CLI probe; do not re-walk process tree here).
    // Throttle recompute: at most once per second when FG kind changes.
    {
        static LAST_RECOMPUTE: std::sync::OnceLock<parking_lot::Mutex<(Option<crate::soft_pad_runtime::AgentKind>, std::time::Instant)>> =
            std::sync::OnceLock::new();
        let slot = LAST_RECOMPUTE.get_or_init(|| {
            parking_lot::Mutex::new((None, std::time::Instant::now() - std::time::Duration::from_secs(2)))
        });
        let fg_kind = crate::app_identity::foreground_effective_app_target_id()
            .as_deref()
            .and_then(crate::soft_pad_runtime::AgentKind::from_app_target);
        let mut g = slot.lock();
        let (prev_kind, last_at) = *g;
        if prev_kind != fg_kind && last_at.elapsed() >= std::time::Duration::from_millis(1000) {
            *g = (fg_kind, std::time::Instant::now());
            drop(g);
            let cfg = state.cfg.lock().clone();
            crate::soft_pad_runtime::request_soft_pad_recompute(&cfg);
        }
    }

    let agent_process = crate::app_identity::soft_pad_agent_process_running();
    let agent_fg = soft_pad_agent_is_foreground();
    // Clear soft dismiss whenever a Soft Pad agent is FG (rising or steady) or process
    // is alive — do not wait for the host latch (`is_fg`), which lags two ticks and
    // used to leave Soft Pad hidden after settings until restart.
    if is_overlay_session_dismissed()
        && (agent_fg || agent_process)
        && gate_reason.is_none()
    {
        *overlay_session_dismissed().lock() = false;
    }

    // Cursor FG: auto arm on enter, disarm on leave (beginner listen mode).
    #[cfg(windows)]
    {
        static LAST_CURSOR_FG: std::sync::OnceLock<parking_lot::Mutex<bool>> =
            std::sync::OnceLock::new();
        let slot = LAST_CURSOR_FG.get_or_init(|| parking_lot::Mutex::new(false));
        let cursor_fg = cursor_is_foreground();
        let prev_cursor_fg = *slot.lock();
        let overlay_fg = overlay_hwnd_is_foreground();
        if cursor_fg != prev_cursor_fg {
            *slot.lock() = cursor_fg;
            crate::cursor_beginner::note_cursor_fg_change(cursor_fg, overlay_fg);
            if cursor_fg {
                if crate::cursor_beginner::probe_ok()
                    && !crate::app_identity::foreground_is_self()
                    && gate_reason.is_none()
                {
                    clear_overlay_session_dismissed();
                    let mut cfg = state.cfg.lock();
                    let changed = crate::cursor_beginner::ensure_beginner_overlay_ready(&mut cfg);
                    if changed {
                        crate::codex_numpad_layer::sync_hook_cache(&cfg);
                        let snap = cfg.clone();
                        drop(cfg);
                        crate::soft_pad_runtime::request_soft_pad_recompute(&snap);
                        let _ = std::thread::Builder::new()
                            .name("cursor-beginner-ensure-save".into())
                            .spawn(move || {
                                crate::config::save_config(&snap);
                            });
                    } else {
                        drop(cfg);
                    }
                    crate::cursor_beginner::arm(state, app, false);
                    // One enqueue only: changed+first used to sync-activate twice on the
                    // 250ms maybe_tick tokio worker and storm vosk → UI_HB_STALL_5S.
                    static KWS_BEGINNER_RELOAD: std::sync::OnceLock<std::sync::atomic::AtomicBool> =
                        std::sync::OnceLock::new();
                    let reloaded = KWS_BEGINNER_RELOAD.get_or_init(|| {
                        std::sync::atomic::AtomicBool::new(false)
                    });
                    let first = !reloaded.swap(true, std::sync::atomic::Ordering::Relaxed);
                    if changed || first {
                        crate::voice_supervisor::enqueue_activate(
                            app.clone(),
                            Arc::clone(state),
                            "force:kws_grammar_reload",
                        );
                    }
                }
            } else if prev_cursor_fg && !overlay_fg {
                // Only disarm when a real other app (not our overlay) takes focus.
                crate::cursor_beginner::disarm(state, app);
            }
        } else if !cursor_fg && overlay_fg {
            // Keep latch aware while overlay holds Win32 FG over Cursor.
            crate::cursor_beginner::note_cursor_fg_change(false, true);
        }
    }

    if is_fg || agent_process || agent_fg {
        // Cursor beginner: heal pad when Cursor habit selected (incl. OneTone home FG).
        let (cursor_heal, cursor_habit) = {
            let cfg = state.cfg.lock();
            (
                crate::cursor_beginner::should_prefer_cursor_soft_pad(&cfg),
                crate::cursor_beginner::cursor_habit_active(&cfg),
            )
        };
        if cursor_heal
            && (!crate::app_identity::foreground_is_self() || cursor_habit)
            && gate_reason.is_none()
        {
            static LAST_CURSOR_ENSURE: std::sync::OnceLock<parking_lot::Mutex<std::time::Instant>> =
                std::sync::OnceLock::new();
            let slot = LAST_CURSOR_ENSURE.get_or_init(|| {
                parking_lot::Mutex::new(
                    std::time::Instant::now() - std::time::Duration::from_secs(10),
                )
            });
            let mut last = slot.lock();
            if last.elapsed() >= std::time::Duration::from_secs(2) {
                *last = std::time::Instant::now();
                drop(last);
                let mut cfg = state.cfg.lock();
                if crate::cursor_beginner::ensure_beginner_overlay_ready(&mut cfg) {
                    crate::codex_numpad_layer::sync_hook_cache(&cfg);
                    let snap = cfg.clone();
                    drop(cfg);
                    crate::soft_pad_runtime::request_soft_pad_recompute(&snap);
                    // Soft-pad chrome heal only. Do NOT force-activate Vosk here —
                    // every-2s force:kws_grammar_reload thrash left homepage
                    // "listening" with flat mic bars and no partials.
                    let _ = std::thread::Builder::new()
                        .name("cursor-beginner-ensure-save".into())
                        .spawn(move || {
                            crate::config::save_config(&snap);
                        });
                }
            }
        }
        // Auto-ensure Soft Pad routes when a supported agent is FG or its process is running.
        // Skip while OneTone itself is FG (home / settings): Cursor.exe alive used to
        // take cfg.lock every 250ms for readiness+heal, which 假死'd the homepage.
        let result = if (agent_fg || agent_process)
            && !crate::app_identity::foreground_is_self()
        {
            let mut cfg = state.cfg.lock();
            let blocker = crate::codex_numpad_layer::readiness_snapshot(&cfg).blocker;
            let needs_mapping = blocker == "no_routes" || blocker == "no_mapping";
            let fg_tid = crate::app_identity::foreground_effective_app_target_id();
            let fg_needs_heal = agent_fg
                && fg_tid.as_ref().is_some_and(|tid| {
                    cfg.mappings.iter().any(|m| {
                        m.enabled
                            && m.app_target_id.trim() == tid.trim()
                            && crate::codex_numpad_layer::mapping_pad_routes_need_heal(m)
                    })
                });
            // FG rising edge, process-only when mapping missing, or FG mapping has empty preset chords.
            let should_ensure = needs_mapping || (agent_fg && !was_fg) || fg_needs_heal;
            // Note: "pad_off" is intentional numpad mode ? do not auto-re-enable.
            if !should_ensure {
                None
            } else {
                let prefer = if agent_fg {
                    fg_tid.as_deref()
                } else {
                    None
                };
                let result = crate::codex_numpad_layer::ensure_codex_pad_ready_for(
                    &mut cfg,
                    "zh-CN",
                    prefer,
                );
                let ensure_cursor_keys = result.changed
                    && result.mapping_id.as_ref().is_some_and(|mid| {
                        cfg.mappings.iter().any(|m| {
                            m.id == *mid
                                && m.app_target_id.trim()
                                    == crate::app_chat_workflow::CURSOR_APP_TARGET_ID
                        })
                    });
                let cfg_to_save = if result.changed {
                    crate::codex_numpad_layer::sync_hook_cache(&cfg);
                    Some(cfg.clone())
                } else {
                    None
                };
                drop(cfg);
                // Never save_config under cfg.lock — pretty-print + bak 假死 IPC/HB.
                if let Some(snap) = cfg_to_save {
                    let _ = std::thread::Builder::new()
                        .name("codex-pad-ensure-save".into())
                        .spawn(move || {
                            crate::config::save_config(&snap);
                        });
                }
                if ensure_cursor_keys {
                    crate::cursor_keybindings_setup::ensure_composer_mode_keybindings_quiet();
                }
                Some(result)
            }
        } else {
            None
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
        let force = cfg.soft_pad_force_open;
        active_codex_mapping_with_overlay(&cfg).is_some()
            && host_ok
            && (force || !is_overlay_session_dismissed())
    };
    let vis_changed = {
        let mut last = last_visible().lock();
        if *last == desired_visible {
            false
        } else {
            *last = desired_visible;
            true
        }
    };

    if vis_changed {
        let raw = overlay_host_allows_show_raw();
        let fg = crate::app_identity::foreground_app_identity();
        let (setup_open, settings_open, verify_active, recording_active) =
            overlay_runtime_gate_flags(state);
        let reason = gate_reason
            .map(str::to_string)
            .unwrap_or_else(overlay_visible_reason);
        let detail = format!(
            "overlay visible={} host_ok={} raw_host={} reason={} setup_open={} settings_open={} verify_active={} recording_active={} fg_exe={} fg_title={:?} fg_preset={:?} path={:?}",
            desired_visible,
            host_ok,
            raw,
            reason,
            setup_open,
            settings_open,
            verify_active,
            recording_active,
            fg.as_ref().map(|i| i.exe_name.as_str()).unwrap_or(""),
            fg.as_ref().map(|i| i.window_title.as_str()).unwrap_or(""),
            fg.as_ref().and_then(|i| i.matched_preset_app_id.as_deref()),
            fg.as_ref().and_then(|i| i.full_path.as_deref()).unwrap_or(""),
        );
        crate::app_log::log_line(state, "codex_overlay", &detail);
    }

    if vis_changed {
        push_state(app, state);
    } else if highlight_expired {
        // Clear press highlight without geometry/AOT thrash (was Soft Pad ??).
        push_overlay_status(app, state);
    } else if hook_needs_input_hold() {
        // Re-sync pass-through ~1Hz while sticky needs_input may still be set ? but only
        // when the serving lane matches (Cursor FG clears punch-through).
        let mut last = last_pass_resync().lock();
        let now = Instant::now();
        if last
            .map(|t| now.duration_since(t) >= Duration::from_millis(1000))
            .unwrap_or(true)
        {
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

    #[test]
    fn settings_open_gate_hides_overlay() {
        assert_eq!(
            overlay_runtime_gate_reason_flags(false, true, false, false),
            Some("settings_open")
        );
        assert_eq!(
            overlay_runtime_gate_reason_flags(true, true, false, false),
            Some("setup_open")
        );
        assert_eq!(
            overlay_runtime_gate_reason_flags(false, false, false, false),
            None
        );
    }

    #[test]
    fn force_open_picks_non_codex_soft_pad_when_onetone_fg() {
        let _iso = isolate_status_globals();
        test_clear_fg_overrides();
        // OneTone FG: normal picker returns None without Codex overlay.
        let mut pad = crate::codex_numpad_layer::default_codex_micro_pad();
        pad.enabled = true;
        pad.overlay_enabled = false;
        let mut m = codex_mapping(pad);
        m.id = "minimax-map".into();
        m.app_target_id = "minimax-chat".into();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![m];
        cfg.soft_pad_force_open = false;
        assert!(active_codex_mapping_with_overlay(&cfg).is_none());

        assert!(ensure_force_soft_pad_ready(&mut cfg));
        cfg.soft_pad_force_open = true;
        let picked = active_codex_mapping_with_overlay(&cfg).expect("force picks Soft Pad");
        assert_eq!(picked.0.app_target_id, "minimax-chat");
        assert!(picked.1.overlay_enabled);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible, "force open must show Soft Pad without agent FG");
        test_clear_fg_overrides();
    }

    #[test]
    fn host_hide_grace_holds_then_releases() {
        test_clear_fg_overrides();
        let t0 = Instant::now();
        // Show: need two true ticks.
        assert!(!stable_overlay_host_at(true, t0, false));
        assert!(stable_overlay_host_at(true, t0, false));
        // Brief raw false — still showing.
        assert!(stable_overlay_host_at(false, t0, false));
        assert!(stable_overlay_host_at(
            false,
            t0 + Duration::from_millis(200),
            false
        ));
        // After grace — hide.
        assert!(!stable_overlay_host_at(
            false,
            t0 + Duration::from_millis(OVERLAY_HIDE_GRACE_MS + 20),
            false
        ));
        test_clear_fg_overrides();
    }

    #[test]
    fn host_hide_grace_cancelled_by_raw_true() {
        test_clear_fg_overrides();
        let t0 = Instant::now();
        assert!(!stable_overlay_host_at(true, t0, false));
        assert!(stable_overlay_host_at(true, t0, false));
        assert!(stable_overlay_host_at(false, t0, false));
        // FG returns during grace — stay / reconfirm show.
        assert!(stable_overlay_host_at(
            true,
            t0 + Duration::from_millis(100),
            false
        ));
        assert!(*last_foreground_codex().lock());
        assert!(hide_grace_since().lock().is_none());
        test_clear_fg_overrides();
    }

    #[test]
    fn host_onetone_force_hide_skips_grace() {
        test_clear_fg_overrides();
        let t0 = Instant::now();
        assert!(!stable_overlay_host_at(true, t0, false));
        assert!(stable_overlay_host_at(true, t0, false));
        assert!(!stable_overlay_host_at(false, t0, true));
        assert!(!*last_foreground_codex().lock());
        test_clear_fg_overrides();
    }

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
        crate::pad_status::claude_lights::reset_for_test();
        crate::agent_attention::reset_for_test();
        crate::agent_model_metadata::reset_for_test();
        crate::agent_usage::reset_for_test();
        reset_pad_run_status_for_test();
        test_clear_fg_overrides();
        (g, app, pad)
    }

    #[test]
    fn nav_cta_hidden_when_cursor_context_even_if_codex_pad() {
        use crate::config::CodexMicroPadKeyRoute;
        use crate::soft_pad_runtime::AgentKind;

        let pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: String::new(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![
                CodexMicroPadKeyRoute {
                    micro_key_id: "AG00".into(),
                    enabled: true,
                    ..Default::default()
                },
                CodexMicroPadKeyRoute {
                    micro_key_id: "AG01".into(),
                    enabled: true,
                    ..Default::default()
                },
            ],
        };
        let mapping = codex_mapping(pad.clone());
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping.clone()];

        let (mid, agent, slots) = resolve_nav_enable_cta(
            &cfg,
            Some(&mapping),
            Some(&pad),
            Some(AgentKind::Codex),
            "codex",
            "",
        );
        // Skip positive assert when live FG is Cursor (dev machine may have Cursor focused).
        if !nav_cta_suppressed_for_cursor(Some(AgentKind::Codex), "codex") {
            assert_eq!(agent, "codex");
            assert!(!mid.is_empty());
            assert_eq!(slots, vec!["AG00".to_string(), "AG01".to_string()]);
        }

        let (_, agent_cursor_kind, slots_cursor_kind) = resolve_nav_enable_cta(
            &cfg,
            Some(&mapping),
            Some(&pad),
            Some(AgentKind::Cursor),
            "codex",
            "",
        );
        assert!(agent_cursor_kind.is_empty());
        assert!(slots_cursor_kind.is_empty());

        let (_, agent_cursor_app, slots_cursor_app) = resolve_nav_enable_cta(
            &cfg,
            Some(&mapping),
            Some(&pad),
            Some(AgentKind::Codex),
            "cursor",
            "",
        );
        assert!(agent_cursor_app.is_empty());
        assert!(slots_cursor_app.is_empty());
    }

    #[test]
    fn codex_native_ag_lights_gated_to_codex_soft_pad() {
        use crate::soft_pad_runtime::AgentKind;
        assert!(allow_codex_native_ag_lights(Some(AgentKind::Codex), "codex"));
        assert!(allow_codex_native_ag_lights(Some(AgentKind::Codex), "cursor"));
        assert!(!allow_codex_native_ag_lights(Some(AgentKind::Cursor), "codex"));
        assert!(!allow_codex_native_ag_lights(Some(AgentKind::Cursor), "cursor"));
        assert!(!allow_codex_native_ag_lights(Some(AgentKind::Claude), ""));
        assert!(!allow_codex_native_ag_lights(None, "cursor"));
    }

    #[test]
    fn settings_dismiss_clears_when_cleared_explicitly() {
        *overlay_session_dismissed().lock() = true;
        assert!(is_overlay_session_dismissed());
        clear_overlay_session_dismissed();
        assert!(!is_overlay_session_dismissed());
    }

    #[test]
    fn cursor_soft_pad_ignores_codex_thstatus_ag_lights() {
        let _iso = isolate_status_globals();
        test_clear_fg_overrides();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"},{"i":1,"s":"needs_input"}]}}"#,
        );
        let mut pad = crate::codex_numpad_layer::default_codex_micro_pad();
        pad.enabled = true;
        pad.overlay_enabled = true;
        let mut mapping = codex_mapping(pad);
        mapping.id = "cursor-map".into();
        mapping.app_target_id = crate::app_identity::CURSOR_APP_TARGET_ID.into();
        mapping.agent_provider_id = "cursor".into();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping];
        cfg.soft_pad_force_open = true;
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.applied_agent, "cursor");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .expect("AG00");
        let ag01 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG01")
            .expect("AG01");
        assert_ne!(ag00.status_source, "native");
        assert_ne!(ag01.status_source, "native");
        assert!(ag00.native_run_status.is_empty());
        assert!(ag01.native_run_status.is_empty());
        assert_eq!(ag00.run_status, "idle");
        assert_eq!(ag01.run_status, "idle");
        assert!(
            !snap.status_light_micro_key_id.starts_with("AG"),
            "Cursor Soft Pad must not host status on AG*: {}",
            snap.status_light_micro_key_id
        );
        assert!(
            !matches!(ag00.ui_icon_id.as_str(), "agent" | "lane" | "claude"),
            "AG00 icon must not be Codex session chrome: {}",
            ag00.ui_icon_id
        );
        assert!(
            !matches!(ag01.ui_icon_id.as_str(), "agent" | "lane" | "claude"),
            "AG01 icon must not be Codex session chrome: {}",
            ag01.ui_icon_id
        );
        assert_eq!(ag00.key_role, "action");
        assert_eq!(ag01.key_role, "action");
        assert_eq!(ag00.kind, "command");
        assert_eq!(ag01.kind, "command");
        assert!(ag00.lane_id.is_empty());
        assert!(ag01.lane_id.is_empty());
    }

    #[test]
    fn claude_multi_ag_lights_require_sessions_purpose() {
        let mut pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: String::new(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        };
        let mut mapping = codex_mapping(pad.clone());
        mapping.id = "claude-map".into();
        mapping.app_target_id = "claude-code".into();
        assert!(
            !claude_multi_ag_lights_allowed(&mapping, &pad),
            "shortcuts must block Claude AG multi-lights"
        );
        pad.purpose = crate::soft_pad_purpose::SoftPadPurpose::Sessions;
        mapping.app_target_id = "claude-code".into();
        mapping.agent_provider_id = "claude".into();
        assert!(
            claude_multi_ag_lights_allowed(&mapping, &pad),
            "sessions + Claude mapping allows multi-lights decoration"
        );
        mapping.app_target_id = "cursor-chat".into();
        mapping.agent_provider_id = "cursor".into();
        assert!(
            !claude_multi_ag_lights_allowed(&mapping, &pad),
            "Cursor never gets multi-lights"
        );
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
            key_mode_enabled: true,
            voice_mode_enabled: true,
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
            time_machine_workspace: String::new(),
        capture_hero_ref: None,
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: false,
            layout_profile: String::new(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
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
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
        let ag01 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG01")
            .unwrap();
        assert_eq!(ag00.status_source, "native");
        assert_eq!(ag00.run_status, "running");
        assert_eq!(ag01.status_source, "native");
        assert_eq!(ag01.run_status, "needs_input");
    }

    #[test]
    fn anchored_origin_keeps_right_edge() {
        // Expand 432 ? 584 (+152): origin shifts left by 152.
        assert_eq!(anchored_origin_x(1000, 432, 584), 848);
        // Collapse 584 ? 432 (-152): origin shifts right by 152.
        assert_eq!(anchored_origin_x(848, 584, 432), 1000);
        // No change.
        assert_eq!(anchored_origin_x(100, 432, 432), 100);
    }

    #[test]
    fn overlay_geom_ignores_dpi_drift_but_recovers_stuck_full() {
        let want = (true, 320, 44);
        // Same key + 2px drift: do not re-apply (mini 假死 thrash).
        assert!(!overlay_geom_needs_apply(
            Some(want),
            want,
            Some((322, 44)),
            (320, 44)
        ));
        // Key change mini→full: apply.
        assert!(overlay_geom_needs_apply(
            Some(want),
            (false, 432, 680),
            Some((320, 44)),
            (432, 680)
        ));
        // Stuck at full outer while want mini: recover.
        assert!(overlay_geom_needs_apply(
            Some(want),
            want,
            Some((432, 680)),
            (320, 44)
        ));
    }

    #[test]
    fn overlay_visible_in_numpad_mode_when_overlay_enabled() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: false,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![
                CodexMicroPadKeyRoute {
                    micro_key_id: "AG01".into(),
                    source_scan: 0x48,
                    source_extended: false,
                    source_key: String::new(),
                    slot_id: "plan".into(),
                    ui_icon_id: String::new(),
                    enabled: true,
                    advanced: false,
                    agent_light_id: String::new(),
                light_rgb: String::new(),
                key_role: None,
                auto_assignable: None,
                },
                CodexMicroPadKeyRoute {
                    micro_key_id: "ACT07".into(),
                    source_scan: 0x35,
                    source_extended: true,
                    source_key: String::new(),
                    slot_id: "commandPalette".into(),
                    ui_icon_id: "palette".into(),
                    enabled: true,
                    advanced: false,
                    agent_light_id: String::new(),
                light_rgb: String::new(),
                key_role: None,
                auto_assignable: None,
                },
            ],
        });
        mapping.agent_bindings = vec![
            AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
                slot_id: "plan".into(),
                action_id: "plan".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+Alt+P".into(),
                enabled: true,
                execution_mode: Some("insertOnly".into()),
                activation_scope: "foregroundApp".into(),
            },
            AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
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

        let plan = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG01")
            .unwrap();
        assert!(plan.bound);
        assert_eq!(plan.label, "制定计划");
        assert_eq!(plan.sub, "插入 /plan");
        assert_ne!(plan.sub, "Ctrl+Alt+P");
        assert_eq!(plan.source_kind, "primary");

        let act07 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT07")
            .unwrap();
        assert_eq!(act07.label, "命令菜单");
        assert_eq!(act07.sub, "Ctrl+K");
        assert_eq!(act07.source_kind, "primary");

        let nav = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "NAV_UP")
            .unwrap();
        assert_eq!(nav.source_kind, "advanced");
        assert_eq!(snap.pad_status, "idle");
    }

    #[test]
    fn overlay_cursor_plan_caption_uses_plan_mode_not_slash() {
        let _iso = isolate_status_globals();
        use crate::config::{AgentBinding, CodexMicroPadKeyRoute};

        let mut mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "custom".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "AG05".into(),
                source_scan: 0x4D,
                source_extended: false,
                source_key: String::new(),
                slot_id: "plan".into(),
                ui_icon_id: "plan".into(),
                enabled: true,
                advanced: false,
                agent_light_id: String::new(),
                light_rgb: String::new(),
                key_role: None,
                auto_assignable: None,
            }],
        });
        mapping.app_target_id = crate::app_chat_workflow::CURSOR_APP_TARGET_ID.into();
        mapping.agent_bindings = vec![AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
            slot_id: "plan".into(),
            action_id: "plan".into(),
            trigger_type: "key".into(),
            trigger_binding: "Ctrl+Alt+Shift+P".into(),
            enabled: true,
            execution_mode: Some("execute".into()),
            activation_scope: "foregroundApp".into(),
        }];
        let mut cfg = VoiceConfig::default();
        cfg.soft_pad_force_open = true;
        cfg.mappings = vec![mapping];
        test_set_foreground_latch(true);
        note_soft_pad_surface_for_agent(crate::soft_pad_runtime::AgentKind::Cursor);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible || !snap.cells.is_empty());
        let plan = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG05")
            .expect("AG05 cell");
        assert_eq!(plan.label, "Plan 模式");
        assert_eq!(plan.sub, "Ctrl+Alt+Shift+P");
        assert_ne!(plan.label, "总开关");
    }

    #[test]
    fn sticky_mapping_id_prefers_pinned_cursor_mapping() {
        let _iso = isolate_status_globals();
        use crate::app_chat_workflow::CURSOR_APP_TARGET_ID;

        let mut pad_a = crate::codex_numpad_layer::default_codex_micro_pad();
        pad_a.enabled = true;
        pad_a.overlay_enabled = true;
        let mut pad_b = crate::codex_numpad_layer::default_codex_micro_pad();
        pad_b.enabled = true;
        pad_b.overlay_enabled = true;

        let mut a = codex_mapping(pad_a);
        a.id = "cursor-a".into();
        a.app_target_id = CURSOR_APP_TARGET_ID.into();

        let mut b = codex_mapping(pad_b);
        b.id = "cursor-b".into();
        b.app_target_id = CURSOR_APP_TARGET_ID.into();

        let mut cfg = VoiceConfig::default();
        cfg.soft_pad_force_open = true;
        cfg.mappings = vec![a, b];
        test_set_foreground_latch(true);
        // Without pin, first overlay_enabled cursor wins (cursor-a).
        note_soft_pad_surface_for_agent(crate::soft_pad_runtime::AgentKind::Cursor);
        let snap_first = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap_first.mapping_id, "cursor-a");
        // Pin Hub selection → overlay must follow cursor-b.
        note_soft_pad_surface_for_mapping("cursor-b", crate::soft_pad_runtime::AgentKind::Cursor);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.mapping_id, "cursor-b");
    }

    #[test]
    fn overlay_source_kind_marks_screen_enc() {
        let _iso = isolate_status_globals();
        use crate::config::CodexMicroPadKeyRoute;

        let mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "ENC".into(),
                source_scan: 0,
                source_extended: false,
                source_key: String::new(),
                slot_id: "summonCodex".into(),
                ui_icon_id: "codex".into(),
                enabled: true,
                advanced: false,
                agent_light_id: String::new(),
            light_rgb: String::new(),
            key_role: None,
            auto_assignable: None,
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let ag01 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG01")
            .unwrap();
        assert_eq!(ag01.run_status, "running");
        assert_eq!(ag01.status_source, "native");
        assert_eq!(ag01.native_run_status, "running");
        let act = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT06")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
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
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
        assert_eq!(ag00.status_source, "codex_hook");
        assert_eq!(ag00.run_status, "running");
        let ag01 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG01")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.app_state_enabled);
        assert_eq!(snap.app_last_source, "codex_hook");
        assert_eq!(snap.app_last_event, "UserPromptSubmit");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
        assert_eq!(ag00.run_status, "running");
        assert_eq!(ag00.status_source, "inferred");
        assert!(ag00.native_run_status.is_empty());

        // Clear local status ? fallback idle.
        note_pad_run_status("idle", "");
        let snap2 = build_snapshot_from_cfg(&cfg);
        let ag00b = snap2
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
        assert_eq!(ag00b.run_status, "idle");
        assert_eq!(ag00b.status_source, "fallback");
    }

    #[test]
    fn overlay_status_lights_native_wins_over_hook_on_same_ag() {
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "needs_input");
        assert_eq!(snap.status_light_micro_key_id, "AG00");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
        // Native thstatus wins over Codex status-host Core on the same AG key.
        assert_eq!(ag00.status_source, "native");
        assert_eq!(ag00.run_status, "running");
        assert_eq!(ag00.native_run_status, "running");
        let rgb = snap.rgb.expect("soft rgb still from Core needs_input");
        assert_eq!((rgb.r, rgb.g, rgb.b), (255, 106, 0));
    }

    #[test]
    fn overlay_native_wins_on_status_host_ag04() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":4,"s":"running"}]}}"#,
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "AG04");
        let ag04 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG04")
            .unwrap();
        assert_eq!(ag04.status_source, "native");
        assert_eq!(ag04.run_status, "running");
    }

    fn claude_model_route(micro: &str) -> crate::config::CodexMicroPadKeyRoute {
        crate::config::CodexMicroPadKeyRoute {
            micro_key_id: micro.into(),
            source_scan: 0x48,
            source_extended: false,
            source_key: String::new(),
            slot_id: "claudeModel".into(),
            ui_icon_id: "claude".into(),
            enabled: true,
            advanced: false,
            agent_light_id: String::new(),
        light_rgb: String::new(),
        key_role: None,
        auto_assignable: None,
        }
    }

    #[test]
    fn overlay_claude_session_lane_decorates_subagents_not_separate_ags() {
        let _iso = isolate_status_globals();
        crate::agent_lane::store::reset_for_test();
        crate::agent_lane::page::reset_for_test();
        crate::agent_lane::slots::reset_sticky_for_test();
        // Two subagents under one top-level session — AG must show the session, not two clickable hosts.
        let _ = crate::agent_lane::ingest_lane_event(crate::agent_lane::store::LaneIngest {
            provider: crate::soft_pad_runtime::AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "sess-1".into(),
            subagent_id: Some("a1".into()),
            title: Some("Main session".into()),
            event: "SubagentStart".into(),
            source: "claude_hook".into(),
            cwd: "/tmp".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(1),
            at: Some(10),
        });
        let _ = crate::agent_lane::ingest_lane_event(crate::agent_lane::store::LaneIngest {
            provider: crate::soft_pad_runtime::AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "sess-1".into(),
            subagent_id: Some("a2".into()),
            title: None,
            event: "SubagentStart".into(),
            source: "claude_hook".into(),
            cwd: "/tmp".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(2),
            at: Some(20),
        });
        let mut pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Sessions,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: true,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        };
        for i in 0..6 {
            pad.keys.push(crate::config::CodexMicroPadKeyRoute {
                micro_key_id: format!("AG{i:02}"),
                enabled: true,
                key_role: Some(crate::soft_pad_purpose::SoftPadKeyRole::AgentLane),
                auto_assignable: Some(true),
                ..Default::default()
            });
        }
        let mut mapping = codex_mapping(pad);
        mapping.id = "claude-map".into();
        mapping.app_target_id = "claude-code".into();
        mapping.agent_provider_id = "claude".into();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping];
        crate::soft_pad_runtime::set_follow_pin(Some(crate::soft_pad_runtime::AgentKind::Claude));
        crate::soft_pad_runtime::request_soft_pad_recompute(&cfg);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.ag_surface, "mixed");
        assert!(snap.multi_agent_lights);
        let lane_cells: Vec<_> = snap
            .cells
            .iter()
            .filter(|c| !c.lane_id.is_empty())
            .collect();
        assert_eq!(lane_cells.len(), 1, "one top-level session occupies one AG");
        assert_eq!(lane_cells[0].label, "Main session");
        assert_eq!(lane_cells[0].subagent_count, 2);
        assert_eq!(lane_cells[0].key_role, "agentLane");
        // Subagent Stop clears decoration only — session slot remains.
        let _ = crate::agent_lane::ingest_lane_event(crate::agent_lane::store::LaneIngest {
            provider: crate::soft_pad_runtime::AgentKind::Claude,
            workspace_id: "w".into(),
            session_id: "sess-1".into(),
            subagent_id: Some("a1".into()),
            title: None,
            event: "SubagentStop".into(),
            source: "claude_hook".into(),
            cwd: "/tmp".into(),
            host_pid: 0,
            terminal_hwnd: 0,
            sequence: Some(3),
            at: Some(30),
        });
        let snap2 = build_snapshot_from_cfg(&cfg);
        let lane2: Vec<_> = snap2.cells.iter().filter(|c| !c.lane_id.is_empty()).collect();
        assert_eq!(lane2.len(), 1);
        assert_eq!(lane2[0].lane_id, lane_cells[0].lane_id);
        assert_eq!(lane2[0].subagent_count, 1);
    }

    #[test]
    fn overlay_claude_permission_request_lights_session_lane_ag00() {
        // User bug: Claude waiting for Bash confirm, AG00 (sun/agent under power) stays grey
        // while status strip already says 等待确认. Sessions nav relocates status host off AG00;
        // the waiting session lane on AG00 must still paint needs_input.
        let _iso = isolate_status_globals();
        crate::agent_lane::store::reset_for_test();
        crate::agent_lane::page::reset_for_test();
        crate::agent_lane::slots::reset_sticky_for_test();
        let _ = crate::pad_status::ingest_claude_payload_at(
            &crate::pad_status::ClaudeHookPayload {
                event: "PermissionRequest".into(),
                session_id: "5a0a495a-54cb-4a26-81fd-6c1c4b0d4fd6".into(),
                turn_id: String::new(),
                agent_id: String::new(),
                agent_type: String::new(),
                cwd: r"C:\Users\Administrator".into(),
                ts: 1785940869702,
                source: "claude_hook".into(),
            },
            1785940869702,
        );
        let mut pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Sessions,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: true,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        };
        for id in ["AG00", "AG01", "AG02", "AG03"] {
            pad.keys.push(crate::config::CodexMicroPadKeyRoute {
                micro_key_id: id.into(),
                enabled: true,
                key_role: Some(crate::soft_pad_purpose::SoftPadKeyRole::AgentLane),
                auto_assignable: Some(true),
                ..Default::default()
            });
        }
        // Explicit status slot on AG04 (Action) — mirrors mixed-nav relocation target.
        pad.keys.push(status_route("AG04"));
        let mut mapping = codex_mapping(pad);
        mapping.id = "claude-map".into();
        mapping.app_target_id = "claude-code".into();
        mapping.agent_provider_id = "claude".into();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![mapping];
        crate::soft_pad_runtime::set_follow_pin(Some(crate::soft_pad_runtime::AgentKind::Claude));
        crate::soft_pad_runtime::request_soft_pad_recompute(&cfg);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "needs_input");
        assert_eq!(snap.applied_agent, "claude");
        assert!(
            snap.navigation_slots.iter().any(|s| s == "AG00"),
            "AG00 should be a nav lane"
        );
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .expect("AG00");
        assert!(
            !ag00.lane_id.is_empty(),
            "waiting Claude session should project onto AG00, got lane_id empty; status_host={}",
            snap.status_light_micro_key_id
        );
        assert_eq!(
            ag00.run_status, "needs_input",
            "AG00 lane must flash needs_input (status_source={})",
            ag00.status_source
        );
        assert!(
            ag00.bound,
            "session lane must be bound so FE does not grey it out"
        );
        // Status host (AG04) should also reflect Claude waiting.
        let host = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == snap.status_light_micro_key_id)
            .expect("status host cell");
        assert_eq!(host.run_status, "needs_input");
        assert!(host.bound, "status host must be bound for visible lamp");
    }

    #[test]
    fn overlay_claude_waiting_hint_when_primary_idle() {
        let _iso = isolate_status_globals();
        crate::pad_status::claude_lights::apply_claude_light(
            "PermissionRequest",
            "need-agent",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            50,
            50,
        );
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04"), claude_model_route("AG01")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "idle");
        assert_eq!(snap.claude_waiting_hint, "reviewer 等待确认");
    }

    #[test]
    fn resolve_claude_hosts_overflow_when_pool_full() {
        let _iso = isolate_status_globals();
        let pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04"), claude_model_route("AG01")],
        };
        // status AG04 excluded; pool has 5 AG keys ? 6 lights overflow
        let lights: Vec<_> = (0..6)
            .map(|i| crate::pad_status::ClaudeAgentLightState {
                agent_key: format!("agent-{i}"),
                agent_id: format!("agent-{i}"),
                agent_type: format!("t{i}"),
                state: "running".into(),
                source: "claude_hook".into(),
                updated_at: i as u64,
                first_seen_at: i as u64,
                task_id: None,
                session_id: None,
                message: None,
                last_event: None,
                confidence: "high".into(),
                sticky_until: None,
            })
            .collect();
        let (assigned, overflow, items) = resolve_claude_agent_light_hosts(&pad, &lights);
        assert_eq!(assigned.len(), 5);
        assert!(!overflow.is_empty(), "expected overflow summary");
        assert!(overflow.contains("Claude"));
        assert_eq!(items.len(), 1);
        assert!(!items[0].short_label.is_empty());
        assert!(!assigned.iter().any(|(k, _)| k == "AG04"));
        assert!(!assigned.iter().any(|(k, _)| k.starts_with("ACT")));
        assert!(!assigned.iter().any(|(k, _)| k.starts_with("NAV")));
    }

    #[test]
    fn snapshot_keeps_overflow_short_string_and_items() {
        let _iso = isolate_status_globals();
        for i in 0..6 {
            crate::pad_status::claude_lights::apply_claude_light(
                "SubagentStart",
                &format!("agent-{i}"),
                &format!("type-{i}"),
                "claude_hook",
                "s",
                "",
                i as u64,
                i as u64,
            );
        }
        let mut cfg = VoiceConfig::default();
        let mut mapping = codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Sessions,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04"), claude_model_route("AG01")],
        });
        mapping.id = "claude-map".into();
        mapping.app_target_id = "claude-code".into();
        mapping.agent_provider_id = "claude".into();
        cfg.mappings = vec![mapping];
        crate::soft_pad_runtime::set_follow_pin(Some(crate::soft_pad_runtime::AgentKind::Claude));
        crate::soft_pad_runtime::request_soft_pad_recompute(&cfg);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.ag_surface, "mixed");
        assert!(snap.multi_agent_lights);
        assert!(snap.agent_lights_overflow.is_empty());
        assert!(snap.agent_lights_overflow_items.is_empty());
        assert!(!snap.agent_lights.is_empty());
    }

    #[test]
    fn overlay_claude_needs_input_emphasizes_act_when_primary_idle() {
        let _iso = isolate_status_globals();
        crate::pad_status::claude_lights::apply_claude_light(
            "PermissionRequest",
            "need-agent",
            "review",
            "claude_hook",
            "s",
            "t",
            50,
            50,
        );
        // Primary Core stays idle ? Claude-only needs_input should fill ACT emphasize.
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04"), claude_model_route("AG01")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "idle");
        let act12 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT12")
            .unwrap();
        let act08 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT08")
            .unwrap();
        assert_eq!(act12.context_rank, "emphasize");
        assert!(act12.context_hint.contains("确认"));
        assert_eq!(act08.context_rank, "emphasize");
        assert!(act08.context_hint.contains("拒绝"));
        assert_eq!(snap.claude_waiting_hint, "reviewer 等待确认");
        // Soft RGB follows primary idle ? not Claude needs_input
        assert!(
            snap.rgb.is_none() || {
                let rgb = snap.rgb.as_ref().unwrap();
                (rgb.r, rgb.g, rgb.b) != (255, 106, 0)
            },
            "Soft RGB must not follow Claude needs_input orange"
        );
    }

    #[test]
    fn overlay_claude_needs_input_does_not_override_primary_running() {
        let _iso = isolate_status_globals();
        crate::pad_status::claude_lights::apply_claude_light(
            "PermissionRequest",
            "need-agent",
            "review",
            "claude_hook",
            "s",
            "t",
            50,
            50,
        );
        note_pad_run_status("running", "AG00");
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false, // force pad_run as ACT context
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04"), claude_model_route("AG01")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        let act12 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT12")
            .unwrap();
        let act08 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT08")
            .unwrap();
        // running context: ACT08 emphasize cancel, ACT12 dim ? not needs_input confirm
        assert_eq!(act08.context_rank, "emphasize");
        assert_eq!(act08.context_hint, "可取消");
        assert_eq!(act12.context_rank, "dim");
    }

    fn status_route(micro: &str) -> crate::config::CodexMicroPadKeyRoute {
        crate::config::CodexMicroPadKeyRoute {
            micro_key_id: micro.into(),
            source_scan: 0x4C,
            source_extended: false,
            source_key: String::new(),
            slot_id: "status".into(),
            ui_icon_id: "status".into(),
            enabled: true,
            advanced: false,
            agent_light_id: String::new(),
        light_rgb: String::new(),
        key_role: None,
        auto_assignable: None,
        }
    }

    #[test]
    fn resolve_status_light_prefers_status_slot_then_ag00_then_empty() {
        use crate::config::CodexMicroPadKeyRoute;
        let with_status = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG05")],
        };
        assert_eq!(resolve_status_light_micro_key_id(&with_status), "AG05");

        let empty = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
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
                source_key: String::new(),
                slot_id: "status".into(),
                ui_icon_id: String::new(),
                enabled: true,
                advanced: false,
                agent_light_id: String::new(),
            light_rgb: String::new(),
            key_role: None,
            auto_assignable: None,
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG05")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "AG05");
        let ag05 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG05")
            .unwrap();
        assert_eq!(ag05.status_source, "codex_hook");
        assert_eq!(ag05.run_status, "running");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("ACT09")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "ACT09");
        let act09 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "ACT09")
            .unwrap();
        assert_eq!(act09.status_source, "codex_hook");
        assert_eq!(act09.run_status, "needs_input");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG05")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.status_light_micro_key_id, "AG05");
        assert!(!snap.app_state_enabled);
        let ag05 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG05")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![status_route("AG04")],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_agent, "claude");
        assert_eq!(snap.app_last_source, "claude_hook");
        assert_eq!(snap.status_light_micro_key_id, "AG04");
        let host = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG04")
            .unwrap();
        assert_eq!(host.status_source, "claude_hook");
        assert_eq!(host.run_status, "running");
        let ag00 = snap
            .cells
            .iter()
            .find(|c| c.micro_key_id == "AG00")
            .unwrap();
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.app_status, "idle");
        assert!(
            snap.rgb.is_none(),
            "status lights idle must not keep vendor mint"
        );
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
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        // Permission sheet stole FG ? latch false, but pad must remain as status beacon.
        test_set_foreground_latch(false);
        test_prime_visible_host();
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(
            snap.visible,
            "needs_input must keep overlay visible without FG"
        );
        assert_eq!(snap.visible_reason, "needs_input");
        assert_eq!(snap.app_status, "needs_input");
    }

    #[test]
    fn overlay_snapshot_carries_rgb_and_protocol_debug() {
        let _iso = isolate_status_globals();
        let _ = crate::codex_micro_vendor::apply_rpc_json(
            r#"{"m":"v.oai.rgbcfg","p":{"r":12,"g":34,"b":56}}"#,
        );
        let _ =
            crate::codex_micro_vendor::apply_rpc_json(r#"{"m":"sys.version","p":{"v":"9.9.9"}}"#);
        let _ =
            crate::codex_micro_vendor::apply_rpc_json(r#"{"m":"device.status","p":{"s":"ok"}}"#);
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
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
    fn joy_arrows_live_requires_capture_opt_in_and_bound_nav() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        let mut pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: true,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        };
        cfg.mappings = vec![codex_mapping(pad.clone())];
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        crate::codex_numpad_layer::set_joy_nav_panel_open(true);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.joy_nav_panel_open);
        assert!(
            !snap.joy_arrows_live,
            "show NAV column alone must not mark arrows live"
        );

        pad.capture_physical_arrows = true;
        pad.keys.push(crate::config::CodexMicroPadKeyRoute {
            micro_key_id: "NAV_LEFT".into(),
            source_scan: 0,
            source_extended: false,
            source_key: String::new(),
            slot_id: "navBack".into(),
            ui_icon_id: "navLeft".into(),
            enabled: true,
            advanced: true,
            agent_light_id: String::new(),
            light_rgb: String::new(),
            key_role: None,
            auto_assignable: None,
        });
        cfg.mappings = vec![codex_mapping(pad)];
        // agent bindings needed for route merge
        if let Some(m) = cfg.mappings.get_mut(0) {
            m.agent_bindings = crate::agent::bindings_build::build_codex_micro_13_bindings("zh-CN");
            m.agent_provider_id = crate::agent::templates::CODEX_PROVIDER_ID.into();
        }
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        let snap_on = build_snapshot_from_cfg(&cfg);
        assert!(
            snap_on.joy_arrows_live,
            "capture opt-in + bound NAV → arrows live"
        );
        test_set_foreground_latch(false);
        let snap_off = build_snapshot_from_cfg(&cfg);
        assert!(!snap_off.joy_arrows_live);
    }

    #[test]
    fn nav_keys_disabled_hides_nav_cells_keeps_routes() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        let mut pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: false,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: crate::codex_numpad_layer::default_codex_micro_pad_routes(),
        };
        // NAV routes live in data even when capture/UI column is off.
        pad.keys.push(crate::config::CodexMicroPadKeyRoute {
            micro_key_id: "NAV_UP".into(),
            source_scan: 0,
            source_extended: false,
            source_key: String::new(),
            slot_id: "navUp".into(),
            ui_icon_id: "navUp".into(),
            enabled: true,
            advanced: true,
            agent_light_id: String::new(),
        light_rgb: String::new(),
        key_role: None,
        auto_assignable: None,
        });
        assert!(pad.keys.iter().any(|k| k.micro_key_id == "NAV_UP"));
        cfg.mappings = vec![codex_mapping(pad.clone())];
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.nav_keys_enabled);
        assert_eq!(snap.layout_columns, 4);
        assert!(
            snap.cells
                .iter()
                .all(|c| !c.micro_key_id.starts_with("NAV_")),
            "overlay cells must hide NAV column when navKeysEnabled=false"
        );
        assert!(
            cfg.mappings[0]
                .codex_micro_pad
                .as_ref()
                .unwrap()
                .keys
                .iter()
                .any(|k| k.micro_key_id == "NAV_UP"),
            "NAV route must remain in config when nav off"
        );
        // Re-enable: NAV column returns; routes were never deleted.
        pad.nav_keys_enabled = true;
        cfg.mappings = vec![codex_mapping(pad)];
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
        let snap_on = build_snapshot_from_cfg(&cfg);
        assert!(snap_on.nav_keys_enabled);
        assert_eq!(snap_on.layout_columns, 5);
        assert!(snap_on.cells.iter().any(|c| c.micro_key_id == "NAV_UP"));
    }

    #[test]
    fn act_context_needs_input_emphasizes_confirm_reject() {
        let (rank12, hint12) = act_context_for("ACT12", "needs_input");
        assert_eq!(rank12, "emphasize");
        assert_eq!(hint12, "确认 / 继续");
        let (rank08, hint08) = act_context_for("ACT08", "needs_input");
        assert_eq!(rank08, "emphasize");
        assert_eq!(hint08, "拒绝 / 取消");
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
        assert_eq!(
            act_context_status(false, "needs_input", "running"),
            "running"
        );
    }

    #[test]
    fn effective_act_context_claude_needs_input_only_when_idle() {
        assert_eq!(effective_act_context("idle", true), "needs_input");
        assert_eq!(
            effective_act_context("running", true),
            "running",
            "Claude must not override Codex running"
        );
        assert_eq!(effective_act_context("idle", false), "idle");
    }

    #[test]
    fn claude_activity_hold_hook_and_app_near_window() {
        let _iso = isolate_status_globals();
        let now = 1_000_000u64;
        crate::pad_status::claude_lights::test_set_last_activity_at(now - 1_000, "claude_hook");
        assert!(claude_activity_hold_at(now));
        crate::pad_status::claude_lights::reset_for_test();
        crate::pad_status::claude_lights::test_set_last_activity_at(now - 1_000, "claude_app");
        assert!(claude_activity_hold_at(now));
    }

    #[test]
    fn claude_activity_hold_stale_and_codex_native_excluded() {
        let _iso = isolate_status_globals();
        let now = 1_000_000u64;
        crate::pad_status::claude_lights::test_set_last_activity_at(
            now - CLAUDE_ACTIVITY_SHOW_MS - 1,
            "claude_hook",
        );
        assert!(!claude_activity_hold_at(now), "stale Claude stamp");

        crate::pad_status::claude_lights::reset_for_test();
        // Codex primary must not alone keep hold when stamp/lights empty.
        let _ = crate::codex_app_state::apply_raw_json(
            r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"s","ts":999000}"#,
        );
        assert!(
            !claude_activity_hold_at(now),
            "codex_hook must not trigger Claude activity hold"
        );
    }

    #[test]
    fn claude_activity_hold_survives_codex_overwrite_of_primary() {
        let _iso = isolate_status_globals();
        let now = 50_000u64;
        crate::pad_status::claude_lights::bump_activity("claude_hook", now - 2_000);
        // Codex overwrites primary PadStatus ? hold must still use durable stamp.
        let _ = crate::codex_app_state::apply_raw_json(
            r#"{"source":"codex_hook","event":"UserPromptSubmit","sessionId":"cx","ts":50000}"#,
        );
        assert!(
            claude_activity_hold_at(now),
            "last_activity_at must survive Codex primary overwrite"
        );
    }

    #[test]
    fn claude_activity_hold_active_lights() {
        let _iso = isolate_status_globals();
        crate::pad_status::claude_lights::apply_claude_light(
            "SubagentStart",
            "a1",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            100,
            100,
        );
        // Clear durable stamp to prove active lights alone hold.
        crate::pad_status::claude_lights::test_set_last_activity_at(0, "");
        assert!(claude_activity_hold_at(100));
    }

    #[test]
    fn overlay_visible_with_recent_claude_activity_without_codex_fg() {
        let _iso = isolate_status_globals();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        crate::pad_status::claude_lights::bump_activity("claude_hook", now);
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(false);
        test_prime_visible_host();
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible);
        assert_eq!(snap.visible_reason, "claude_activity");
    }

    #[test]
    fn overlay_hidden_when_claude_activity_stale_without_fg() {
        let _iso = isolate_status_globals();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        crate::pad_status::claude_lights::test_set_last_activity_at(
            now.saturating_sub(CLAUDE_ACTIVITY_SHOW_MS + 5_000),
            "claude_hook",
        );
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(false);
        test_prime_visible_host();
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.visible);
        assert_eq!(snap.visible_reason, "hidden");
    }

    #[test]
    fn overlay_visible_reason_keeps_claude_activity_when_overlay_disabled() {
        let _iso = isolate_status_globals();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        crate::pad_status::claude_lights::bump_activity("claude_hook", now);
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: false,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(false);
        test_prime_visible_host();
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.visible, "overlay_enabled=false must hide pad");
        assert_eq!(
            snap.visible_reason, "claude_activity",
            "host reason must not collapse to hidden when overlay is off"
        );
    }

    #[test]
    fn overlay_visible_reason_codex_foreground() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(snap.visible);
        assert_eq!(snap.visible_reason, "codex_foreground");
    }

    #[test]
    fn normalize_skin_whitelist_and_fallback() {
        assert_eq!(normalize_skin(""), "default");
        assert_eq!(normalize_skin("DEFAULT"), "default");
        assert_eq!(normalize_skin("glass-light"), "glass-light");
        assert_eq!(normalize_skin("hybrid-pro"), "hybrid-pro");
        assert_eq!(normalize_skin("vibe-light"), "vibe-light");
        assert_eq!(normalize_skin("vibe-dark"), "vibe-light");
        assert_eq!(normalize_skin("unknown-skin"), "default");
        assert_eq!(normalize_skin("  Glass-Light  "), "glass-light");
    }

    #[test]
    fn snapshot_skin_from_pad_config() {
        let _iso = isolate_status_globals();
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![codex_mapping(CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
            capture_physical_arrows: false,
            overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: false,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            trae_code_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            copilot_vscode_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            roo_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            windsurf_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "hybrid-pro".into(),
            pinned_lane_preferences: Vec::new(),
            navigation_layout_migrated: false,
            keys: vec![],
        })];
        test_set_foreground_latch(true);
        let snap = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap.skin, "hybrid-pro");

        cfg.mappings[0].codex_micro_pad.as_mut().unwrap().skin = "nope".into();
        let snap2 = build_snapshot_from_cfg(&cfg);
        assert_eq!(snap2.skin, "default");
    }

    #[test]
    fn missing_skin_field_deserializes_to_default() {
        let json = r#"{
            "enabled": true,
            "requireForeground": true,
            "requireNumLockOff": false,
            "overlayEnabled": true,
            "layoutProfile": "standard",
            "softwareEnhanceEnabled": false,
            "codexStatusLightsEnabled": false,
            "claudeCliInjectPrefEnabled": false,
            "presentation": "full",
            "keys": []
        }"#;
        let pad: CodexMicroPadConfig = serde_json::from_str(json).expect("deserialize pad");
        assert_eq!(pad.skin, "default");
    }

    #[test]
    fn soft_pad_inject_legal_rejects_empty_target() {
        assert!(!soft_pad_inject_legal(""));
        assert!(!soft_pad_inject_legal("   "));
    }

    #[test]
    fn soft_pad_inject_target_fallback_defaults_to_codex() {
        // No Applied lane in unit test — mapping then Codex fallback.
        assert_eq!(soft_pad_inject_target_fallback(None), CODEX_APP_TARGET_ID);
        assert_eq!(
            soft_pad_inject_target_fallback(Some("cursor-chat")),
            "cursor-chat"
        );
    }

    #[test]
    fn pass_through_requires_agent_foreground() {
        // Sticky Codex needs_input but Codex not FG ? no punch-through (Cursor/explorer case).
        assert!(!soft_pad_pass_through_decision(
            true,
            true,
            "needs_input",
            "codex_hook",
            false,
            false,
        ));
        // Codex needs_input while Codex is FG ? punch-through ok.
        assert!(soft_pad_pass_through_decision(
            true,
            true,
            "needs_input",
            "codex_hook",
            true,
            false,
        ));
        // Claude sticky + Claude FG ? ok; Codex FG alone does not unlock Claude sticky.
        assert!(soft_pad_pass_through_decision(
            true,
            true,
            "needs_input",
            "claude_hook",
            false,
            true,
        ));
        assert!(!soft_pad_pass_through_decision(
            true,
            true,
            "needs_input",
            "claude_hook",
            true,
            false,
        ));
    }

    #[test]
    fn overlay_agents_keep_independent_lifecycle_and_honest_models() {
        let _iso = isolate_status_globals();
        crate::agent_attention::ingest_codex_hook_event("PreToolUse", "codex-s", "turn-1");
        crate::agent_attention::ingest_claude_hook_event(
            "SessionStart",
            "claude-s",
            "",
            "claude_hook",
        );
        crate::agent_attention::ingest_cursor_hook_event("beforeSubmitPrompt", "cursor-s");
        crate::agent_model_metadata::ingest_hook_model(
            crate::soft_pad_runtime::AgentKind::Codex,
            "PreToolUse",
            "codex-s",
            "gpt-5.4",
            1,
        );
        crate::agent_model_metadata::ingest_hook_model(
            crate::soft_pad_runtime::AgentKind::Claude,
            "SessionStart",
            "claude-s",
            "claude-sonnet",
            2,
        );
        crate::agent_model_metadata::ingest_hook_model(
            crate::soft_pad_runtime::AgentKind::Cursor,
            "beforeSubmitPrompt",
            "cursor-s",
            "default",
            3,
        );

        let mut cfg = crate::config::VoiceConfig::default();
        cfg.mappings.push(codex_mapping(CodexMicroPadConfig {
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: true,
            cursor_status_lights_enabled: true,
            ..crate::codex_numpad_layer::default_codex_micro_pad()
        }));
        let agents = agent_chip_snapshots(&cfg);
        assert_eq!(agents.len(), 9);
        assert_eq!(agents[0].kind, "codex");
        assert_eq!(agents[0].state, "running");
        assert_eq!(agents[0].model, "gpt-5.4");
        assert_eq!(agents[0].model_confidence, "high");
        assert_eq!(agents[1].kind, "claude");
        assert_eq!(agents[1].model_confidence, "low");
        assert_eq!(agents[2].kind, "cursor");
        assert_eq!(agents[2].model, "Auto");
        assert_eq!(agents[2].model_confidence, "low");
    }

    #[test]
    fn expand_sticky_across_same_mapping_snapshots() {
        let mut last = String::new();
        let mut runtime = true; // currently mini
        // First attach: seed from presentation mini
        assert!(resolve_minimized_on_mapping_change("A", true, &mut last, &mut runtime));
        // User expands (runtime false); same mapping still presentation mini must NOT force back
        runtime = false;
        assert!(!resolve_minimized_on_mapping_change("A", true, &mut last, &mut runtime));
        // Switch to MiniMax (or any) mapping that still prefers mini — keep user expand
        assert!(!resolve_minimized_on_mapping_change("B", true, &mut last, &mut runtime));
        // Switch again; presentation full must not fight sticky expand either
        assert!(!resolve_minimized_on_mapping_change("C", false, &mut last, &mut runtime));
        // User minimizes; sticky across further mapping switches
        runtime = true;
        assert!(resolve_minimized_on_mapping_change("A", false, &mut last, &mut runtime));
    }
}
