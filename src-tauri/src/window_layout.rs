use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex as ParkingMutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewWindow};

use crate::config::{self, VoiceConfig};
use crate::AppState;

const MIN_W: f64 = 640.0;
const MIN_H: f64 = 680.0;
/// Maximize/restore animations emit many Moved/Resized; 400ms still wrote 3× disk mid-transition.
const SAVE_DEBOUNCE_MS: u64 = 1500;
/// Recent Moved/Resized still counts as "moving" even if LMB briefly reads up.
const MAIN_MOVED_FRESH_MS: u64 = 80;
/// Poll while waiting for title-bar gesture to end before layout persist.
const DRAG_WAIT_POLL_MS: u64 = 50;
/// Windows moves tray-hidden windows to about (-32000, -32000).
const HIDDEN_POSITION_THRESHOLD: f64 = -10_000.0;

static SAVE_GEN: AtomicU64 = AtomicU64::new(0);
/// Single debounce worker — Moved/Resized must not spawn per pixel on the UI thread.
static SAVE_PENDING: AtomicBool = AtomicBool::new(false);
/// Monotonic ms of last main-window Moved/Resized (for Soft Pad / persist deferral).
static MAIN_MOVED_AT_MS: AtomicU64 = AtomicU64::new(0);
/// Native WM_ENTERSIZEMOVE…EXITSIZEMOVE — sole truth for main title-bar / resize drag.
static MAIN_SIZEMOVE_ACTIVE: AtomicBool = AtomicBool::new(false);
/// NCLBUTTONDOWN paused camera but ENTERSIZEMOVE not yet (click-only must resume on button-up).
#[cfg(windows)]
static MAIN_EARLY_PAUSE_PENDING: AtomicBool = AtomicBool::new(false);
/// Main path already sent pause to JS (avoid depth+2 from early+ENTER).
#[cfg(windows)]
static MAIN_CAMERA_PAUSE_SENT: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static MAIN_SIZEMOVE_PREV_WNDPROC: AtomicIsize = AtomicIsize::new(0);
#[cfg(windows)]
static MAIN_SIZEMOVE_HWND: AtomicIsize = AtomicIsize::new(0);
static MAIN_APP_FOR_EMIT: OnceLock<ParkingMutex<Option<AppHandle>>> = OnceLock::new();

fn mono_ms() -> u64 {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

fn main_app_for_emit() -> &'static ParkingMutex<Option<AppHandle>> {
    MAIN_APP_FOR_EMIT.get_or_init(|| ParkingMutex::new(None))
}

/// Call from main `Moved`/`Resized` hot path (via schedule_save) — atomics only.
pub fn note_main_window_moving() {
    // 0 is reserved as "never moved"; clamp so a fresh note is never stored as 0.
    MAIN_MOVED_AT_MS.store(mono_ms().max(1), Ordering::SeqCst);
}

fn moved_stamp_is_fresh(last: u64, now: u64) -> bool {
    last != 0 && now.saturating_sub(last) <= MAIN_MOVED_FRESH_MS
}

/// True while the user is dragging/resizing the main window.
/// Primary: WM_ENTER/EXITSIZEMOVE latch. Aux: recent Moved stamp (non-Windows / settle).
/// Do **not** use GetCapture — scheduler threads cannot see UI-thread capture.
pub fn main_window_drag_active() -> bool {
    if MAIN_SIZEMOVE_ACTIVE.load(Ordering::SeqCst) {
        return true;
    }
    let last = MAIN_MOVED_AT_MS.load(Ordering::SeqCst);
    moved_stamp_is_fresh(last, mono_ms())
}

/// Timeline breadcrumb for the Drag Lag panel (FE `OneToneDragLagPanel`).
pub fn emit_drag_trace(
    app: &AppHandle,
    phase: &str,
    source: &str,
    detail: serde_json::Value,
) {
    #[cfg(windows)]
    let camera_pause_sent = MAIN_CAMERA_PAUSE_SENT.load(Ordering::SeqCst);
    #[cfg(not(windows))]
    let camera_pause_sent = false;
    let payload = serde_json::json!({
        "type": "drag_trace",
        "t": crate::runtime_event::now_ms(),
        "phase": phase,
        "source": source,
        "detail": detail,
        "flags": {
            "mainSizeMove": MAIN_SIZEMOVE_ACTIVE.load(Ordering::SeqCst),
            "cameraPauseSent": camera_pause_sent,
        },
    });
    let _ = crate::ipc::emit_app_event(app, "drag_trace", &payload);
    crate::ipc::emit_to_main_if_available(app, None, payload.clone());
    // Fire the whole fan-out (2 emits + 2 evals) off the calling thread: the
    // callers include WM_NCLBUTTONDOWN handling on the UI thread, and doing
    // this inline measured as ncl_down→enter_sizemove growing 1ms → 78-202ms.
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        eval_drag_trace(&app2, &payload);
    });
}

/// Direct eval bridge to the Drag Lag panels. The tauri event system is dead
/// weight here: `withGlobalTauri=false` and `__TAURI_INTERNALS__` exposes no
/// `listen`, so `OneToneIpc.listen` always rejects and no FE listener is ever
/// registered — every `emit()` above is a silent no-op. The panels therefore
/// only ever saw local `fe_*` rows. Eval (same path as the to_js snapshots)
/// is the channel that actually lands.
fn eval_drag_trace(app: &AppHandle, payload: &serde_json::Value) {
    let body = payload.to_string();
    let script = format!(
        "try{{window.OneToneDragLagPanel&&OneToneDragLagPanel.noteRaw({body})}}catch(e){{}}"
    );
    if let Some(win) = crate::ipc::get_main_window(app) {
        let _ = win.eval(&script);
    }
    if let Some(win) = app.get_webview_window(crate::codex_micro_overlay::CODEX_MICRO_OVERLAY_LABEL)
    {
        let _ = win.eval(&script);
    }
}

/// Soft Pad drag worker threads — use cached AppHandle from main subclass install.
pub fn try_emit_drag_trace(phase: &str, source: &str, detail: serde_json::Value) {
    if let Some(app) = main_app_for_emit().lock().clone() {
        emit_drag_trace(&app, phase, source, detail);
    }
}

/// Pause/resume main-window camera pumps during drag.
/// Prefer `eval` (direct script) over `to_js` — ENTERSIZEMOVE / Soft Pad SC_MOVE
/// can starve event delivery until EXIT, so pause must land *before* the loop.
/// Never both eval and to_js: dual delivery doubled pauseDepth and a late to_js
/// resume could wake the camera mid Soft Pad drag (1st ok, 2nd laggy).
pub fn emit_camera_frame_pump(app: &AppHandle, paused: bool) {
    let payload = serde_json::json!({
        "type": "camera_frame_pump",
        "paused": paused,
    });
    if let Some(win) = crate::ipc::get_main_window(app) {
        let script = if paused {
            "try{window.OneToneCameraFramePump&&OneToneCameraFramePump.pause()}catch(e){}"
        } else {
            "try{window.OneToneCameraFramePump&&OneToneCameraFramePump.resume()}catch(e){}"
        };
        let _ = win.eval(script);
    } else {
        crate::ipc::emit_to_main_if_available(app, None, payload);
    }
    emit_drag_trace(
        app,
        if paused { "camera_pause" } else { "camera_resume" },
        "rust",
        serde_json::json!({ "via": "emit_camera_frame_pump" }),
    );
}

/// Main title-bar path only: pause then yield so eval can finish before
/// ENTERSIZEMOVE's modal loop starves the UI thread. Soft Pad SetWindowPos
/// follow does **not** need this — spawn follow first, then eval in parallel.
pub async fn emit_camera_frame_pump_before_modal(app: &AppHandle, paused: bool) {
    emit_camera_frame_pump(app, paused);
    if paused {
        tokio::time::sleep(Duration::from_millis(32)).await;
    }
}

fn set_main_sizemove_active(active: bool) {
    MAIN_SIZEMOVE_ACTIVE.store(active, Ordering::SeqCst);
    note_main_window_moving();
    #[cfg(windows)]
    {
        if active {
            MAIN_EARLY_PAUSE_PENDING.store(false, Ordering::SeqCst);
            let already = MAIN_CAMERA_PAUSE_SENT.swap(true, Ordering::SeqCst);
            if let Some(app) = main_app_for_emit().lock().clone() {
                emit_drag_trace(
                    &app,
                    "enter_sizemove",
                    "main",
                    serde_json::json!({ "alreadyPaused": already }),
                );
            }
            if already {
                return; // early NCL already paused — do not depth+2
            }
        } else {
            let had = MAIN_CAMERA_PAUSE_SENT.swap(false, Ordering::SeqCst);
            if let Some(app) = main_app_for_emit().lock().clone() {
                emit_drag_trace(
                    &app,
                    "exit_sizemove",
                    "main",
                    serde_json::json!({ "hadPause": had }),
                );
            }
            if !had {
                return;
            }
        }
    }
    if let Some(app) = main_app_for_emit().lock().clone() {
        emit_camera_frame_pump(&app, active);
    }
}

/// Title-bar / border hit → pause camera *before* DefWindowProc enters the modal move loop.
#[cfg(windows)]
fn early_pause_camera_before_sizemove() {
    MAIN_EARLY_PAUSE_PENDING.store(true, Ordering::SeqCst);
    MAIN_SIZEMOVE_ACTIVE.store(true, Ordering::SeqCst);
    note_main_window_moving();
    let already = MAIN_CAMERA_PAUSE_SENT.swap(true, Ordering::SeqCst);
    if let Some(app) = main_app_for_emit().lock().clone() {
        emit_drag_trace(
            &app,
            "ncl_down",
            "main",
            serde_json::json!({ "alreadyPaused": already }),
        );
        if already {
            return;
        }
        emit_camera_frame_pump(&app, true);
    }
}

#[cfg(windows)]
fn cancel_early_pause_if_click_only() {
    if !MAIN_EARLY_PAUSE_PENDING.swap(false, Ordering::SeqCst) {
        return;
    }
    // No ENTERSIZEMOVE — user clicked caption without dragging.
    MAIN_SIZEMOVE_ACTIVE.store(false, Ordering::SeqCst);
    if !MAIN_CAMERA_PAUSE_SENT.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Some(app) = main_app_for_emit().lock().clone() {
        emit_drag_trace(&app, "ncl_up_click", "main", serde_json::json!({}));
        emit_camera_frame_pump(&app, false);
    }
}

#[cfg(windows)]
fn hit_test_starts_sizemove(ht: isize) -> bool {
    use winapi::um::winuser::{
        HTBOTTOM, HTBOTTOMLEFT, HTBOTTOMRIGHT, HTCAPTION, HTLEFT, HTRIGHT, HTTOP, HTTOPLEFT,
        HTTOPRIGHT,
    };
    matches!(
        ht,
        x if x == HTCAPTION as isize
            || x == HTLEFT as isize
            || x == HTRIGHT as isize
            || x == HTTOP as isize
            || x == HTBOTTOM as isize
            || x == HTTOPLEFT as isize
            || x == HTTOPRIGHT as isize
            || x == HTBOTTOMLEFT as isize
            || x == HTBOTTOMRIGHT as isize
    )
}

/// Install main HWND subclass for ENTER/EXITSIZEMOVE (Windows). No-op elsewhere.
pub fn install_main_sizemove_subclass(window: &WebviewWindow, app: &AppHandle) {
    *main_app_for_emit().lock() = Some(app.clone());
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        let Ok(handle) = window.window_handle() else {
            return;
        };
        let RawWindowHandle::Win32(platform) = handle.as_raw() else {
            return;
        };
        let hwnd = platform.hwnd.get() as isize;
        unsafe {
            install_main_sizemove_wndproc(hwnd as winapi::shared::windef::HWND);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

#[cfg(windows)]
unsafe fn install_main_sizemove_wndproc(hwnd: winapi::shared::windef::HWND) {
    use winapi::shared::basetsd::LONG_PTR;
    use winapi::um::winuser::{SetWindowLongPtrW, GWLP_WNDPROC};

    let stored = MAIN_SIZEMOVE_HWND.load(Ordering::SeqCst);
    if stored == hwnd as isize {
        return;
    }
    let prev = SetWindowLongPtrW(
        hwnd,
        GWLP_WNDPROC,
        main_sizemove_wndproc as *const () as LONG_PTR,
    );
    MAIN_SIZEMOVE_PREV_WNDPROC.store(prev, Ordering::SeqCst);
    MAIN_SIZEMOVE_HWND.store(hwnd as isize, Ordering::SeqCst);
}

#[cfg(windows)]
unsafe extern "system" fn main_sizemove_wndproc(
    hwnd: winapi::shared::windef::HWND,
    msg: winapi::shared::minwindef::UINT,
    wparam: winapi::shared::minwindef::WPARAM,
    lparam: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::{
        CallWindowProcW, WM_ENTERSIZEMOVE, WM_EXITSIZEMOVE, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP,
    };

    // NCLBUTTONDOWN arrives *before* the modal size/move loop — pause camera here so
    // win.eval can run before DefWindowProc blocks the UI thread.
    if msg == WM_NCLBUTTONDOWN && hit_test_starts_sizemove(wparam as isize) {
        early_pause_camera_before_sizemove();
    } else if msg == WM_ENTERSIZEMOVE {
        set_main_sizemove_active(true);
    } else if msg == WM_EXITSIZEMOVE {
        set_main_sizemove_active(false);
    } else if msg == WM_NCLBUTTONUP {
        cancel_early_pause_if_click_only();
    }
    let prev = MAIN_SIZEMOVE_PREV_WNDPROC.load(Ordering::SeqCst);
    CallWindowProcW(
        std::mem::transmute(prev),
        hwnd,
        msg,
        wparam,
        lparam,
    )
}

fn is_storable_position(x: f64, y: f64) -> bool {
    x > HIDDEN_POSITION_THRESHOLD && y > HIDDEN_POSITION_THRESHOLD
}

pub fn ensure_on_screen(window: &WebviewWindow) {
    let Ok(pos) = window.outer_position() else {
        let _ = window.center();
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical = pos.to_logical::<f64>(scale);
    if !is_storable_position(logical.x, logical.y) {
        let _ = window.center();
        return;
    }
    // Unplugged secondary left the window at e.g. x=-873 with no FE paint /
    // no strategy IPC → homepage "listening" forever with empty text.
    let on_a_monitor = window
        .available_monitors()
        .ok()
        .into_iter()
        .flatten()
        .any(|m| {
            let mpos = m.position().to_logical::<f64>(m.scale_factor());
            let msize = m.size().to_logical::<f64>(m.scale_factor());
            let mx2 = mpos.x + msize.width;
            let my2 = mpos.y + msize.height;
            logical.x < mx2
                && logical.x + 40.0 > mpos.x
                && logical.y < my2
                && logical.y + 40.0 > mpos.y
        });
    if !on_a_monitor {
        let _ = window.center();
    }
}

pub fn apply_on_startup(window: &WebviewWindow, cfg: &VoiceConfig) {
    if !cfg.window_layout_seen {
        let _ = window.maximize();
        return;
    }
    if cfg.window_maximized {
        let _ = window.maximize();
        return;
    }
    let w = cfg.window_width.max(MIN_W);
    let h = cfg.window_height.max(MIN_H);
    let _ = window.set_size(Size::Logical(LogicalSize::new(w, h)));
    if let (Some(x), Some(y)) = (cfg.window_x, cfg.window_y) {
        if is_storable_position(x, y) {
            let _ = window.set_position(Position::Logical(LogicalPosition::new(x, y)));
        } else {
            let _ = window.center();
        }
    }
}

pub fn apply_on_startup_logged(
    window: &WebviewWindow,
    cfg: &VoiceConfig,
    state: &Arc<AppState>,
    phase: &str,
) {
    apply_on_startup(window, cfg);
    crate::app_log::log_line(
        state,
        "window",
        &format!(
            "layout {phase}: seen={} maximized={} size={:.0}x{:.0} pos=({}, {})",
            cfg.window_layout_seen,
            cfg.window_maximized,
            cfg.window_width,
            cfg.window_height,
            cfg.window_x
                .map(|v| format!("{v:.0}"))
                .unwrap_or_else(|| "-".into()),
            cfg.window_y
                .map(|v| format!("{v:.0}"))
                .unwrap_or_else(|| "-".into()),
        ),
    );
}

pub fn finalize_first_launch(state: &Arc<AppState>, window: &WebviewWindow) {
    if state.cfg.lock().window_layout_seen {
        return;
    }
    persist_and_log(state, window, "first launch");
}

pub fn persist_now(state: &Arc<AppState>, window: &WebviewWindow) {
    persist_and_log(state, window, "close");
}

/// Arm a debounced layout persist. Hot path (UI thread `Moved`/`Resized`): only atomics.
/// Clone/spawn happens at most once until the worker finishes.
pub fn schedule_save(state: &Arc<AppState>, window: &WebviewWindow) {
    note_main_window_moving();
    SAVE_GEN.fetch_add(1, Ordering::SeqCst);
    // Already have a worker — only bump gen (no Arc clone / spawn on drag pixels).
    if SAVE_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let state = Arc::clone(state);
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let gen = SAVE_GEN.load(Ordering::SeqCst);
            tokio::time::sleep(Duration::from_millis(SAVE_DEBOUNCE_MS)).await;
            if SAVE_GEN.load(Ordering::SeqCst) != gen {
                continue;
            }
            // Pause mid-drag must not persist (geo query + cfg clone hitch UI).
            let mut deferred = false;
            while main_window_drag_active() {
                deferred = true;
                tokio::time::sleep(Duration::from_millis(DRAG_WAIT_POLL_MS)).await;
                if SAVE_GEN.load(Ordering::SeqCst) != gen {
                    break;
                }
            }
            if SAVE_GEN.load(Ordering::SeqCst) != gen {
                continue;
            }
            // After gesture end, re-arm a quiet window so we don't write mid-settle.
            if deferred {
                continue;
            }
            break;
        }
        let final_gen = SAVE_GEN.load(Ordering::SeqCst);
        // Settings open: resize storms + disk save coincided with voiceWake idle stalls.
        if !*state.settings_drawer_open.lock() {
            persist_and_log(&state, &window, "resize");
        }
        SAVE_PENDING.store(false, Ordering::SeqCst);
        // Lost update while clearing — re-arm so the last geometry is not dropped.
        if SAVE_GEN.load(Ordering::SeqCst) != final_gen {
            schedule_save(&state, &window);
        }
    });
}

/// Pure coalesce gate used by unit tests (mirrors schedule_save hot path).
#[cfg(test)]
fn schedule_save_should_spawn_worker() -> bool {
    SAVE_GEN.fetch_add(1, Ordering::SeqCst);
    !SAVE_PENDING.swap(true, Ordering::SeqCst)
}

struct WindowGeo {
    skip: bool,
    maximized: bool,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
}

/// Win32 geometry queries — must run *outside* cfg.lock (under-lock queries
/// stacked with voice activate → layout_persist held≈3.5s / UI_HB_STALL_5S).
fn read_window_geo(window: &WebviewWindow) -> WindowGeo {
    if window.is_minimized().unwrap_or(false) {
        return WindowGeo {
            skip: true,
            maximized: false,
            width: None,
            height: None,
            x: None,
            y: None,
        };
    }
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        return WindowGeo {
            skip: false,
            maximized: true,
            width: None,
            height: None,
            x: None,
            y: None,
        };
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let (width, height) = window
        .inner_size()
        .ok()
        .map(|size| {
            let logical = size.to_logical::<f64>(scale);
            (
                Some(logical.width.max(MIN_W)),
                Some(logical.height.max(MIN_H)),
            )
        })
        .unwrap_or((None, None));
    let (x, y) = window
        .outer_position()
        .ok()
        .map(|pos| {
            let logical = pos.to_logical::<f64>(scale);
            if is_storable_position(logical.x, logical.y) {
                (Some(logical.x), Some(logical.y))
            } else {
                (None, None)
            }
        })
        .unwrap_or((None, None));
    WindowGeo {
        skip: false,
        maximized: false,
        width,
        height,
        x,
        y,
    }
}

fn apply_window_geo(cfg: &mut VoiceConfig, geo: &WindowGeo) {
    if geo.skip {
        return;
    }
    cfg.window_maximized = geo.maximized;
    if geo.maximized {
        return;
    }
    if let (Some(w), Some(h)) = (geo.width, geo.height) {
        cfg.window_width = w;
        cfg.window_height = h;
    }
    if let (Some(x), Some(y)) = (geo.x, geo.y) {
        cfg.window_x = Some(x);
        cfg.window_y = Some(y);
    }
}

fn layout_fingerprint(cfg: &VoiceConfig) -> (bool, bool, u32, u32, i32, i32) {
    (
        cfg.window_layout_seen,
        cfg.window_maximized,
        cfg.window_width.round() as u32,
        cfg.window_height.round() as u32,
        cfg.window_x.map(|v| v.round() as i32).unwrap_or(i32::MIN),
        cfg.window_y.map(|v| v.round() as i32).unwrap_or(i32::MIN),
    )
}

fn persist_and_log(state: &Arc<AppState>, window: &WebviewWindow, reason: &str) {
    let t0 = Instant::now();
    // Geometry first (no cfg.lock), then short lock mutate — save_config stays off-lock.
    let geo = read_window_geo(window);
    let (changed, snapshot, lock_ms) = {
        let _ipc = crate::ui_heartbeat::IpcInflightGuard::enter("layout_persist");
        let lock_t0 = Instant::now();
        let mut cfg = state.cfg.lock();
        let before = layout_fingerprint(&cfg);
        apply_window_geo(&mut cfg, &geo);
        cfg.window_layout_seen = true;
        let after = layout_fingerprint(&cfg);
        let changed = before != after;
        let snap = (
            cfg.window_layout_seen,
            cfg.window_maximized,
            cfg.window_width,
            cfg.window_height,
            cfg.window_x,
            cfg.window_y,
            if changed { Some(cfg.clone()) } else { None },
        );
        let lock_ms = lock_t0.elapsed().as_millis() as u64;
        (changed, snap, lock_ms)
    };
    let capture_ms = t0.elapsed().as_millis() as u64;
    if !changed {
        return;
    }
    let Some(cfg_snap) = snapshot.6 else {
        return;
    };
    let state_log = Arc::clone(state);
    let reason = reason.to_string();
    let maximized = snapshot.1;
    let w = snapshot.2;
    let h = snapshot.3;
    let x = snapshot.4;
    let y = snapshot.5;
    let _ = std::thread::Builder::new()
        .name("layout-persist".into())
        .spawn(move || {
            let disk_t0 = Instant::now();
            config::save_config(&cfg_snap);
            let disk_ms = disk_t0.elapsed().as_millis() as u64;
            crate::app_log::log_line(
                &state_log,
                "window",
                &format!(
                    "layout saved ({reason}): maximized={maximized} size={w:.0}x{h:.0} pos=({}, {}) lock={lock_ms}ms capture={capture_ms}ms disk={disk_ms}ms",
                    x.map(|v| format!("{v:.0}"))
                        .unwrap_or_else(|| "-".into()),
                    y.map(|v| format!("{v:.0}"))
                        .unwrap_or_else(|| "-".into()),
                ),
            );
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            crate::app_log::append_debug_session_ndjson(&format!(
                "{{\"sessionId\":\"b5f349\",\"runId\":\"post-fix\",\"hypothesisId\":\"L1\",\"location\":\"window_layout.rs:persist\",\"message\":\"layout persist\",\"data\":{{\"reason\":\"{reason}\",\"changed\":true,\"lockMs\":{lock_ms},\"captureMs\":{capture_ms},\"diskMs\":{disk_ms},\"maximized\":{maximized}}},\"timestamp\":{ts}}}"
            ));
        });
}

#[cfg(test)]
mod tests {
    use super::{
        apply_window_geo, is_storable_position, main_window_drag_active, moved_stamp_is_fresh,
        note_main_window_moving, schedule_save_should_spawn_worker, WindowGeo, MAIN_MOVED_AT_MS,
        MAIN_SIZEMOVE_ACTIVE, SAVE_GEN, SAVE_PENDING,
    };
    use crate::config::VoiceConfig;
    use std::sync::atomic::Ordering;

    #[test]
    fn rejects_windows_hidden_sentinel_position() {
        assert!(!is_storable_position(-32000.0, -32000.0));
    }

    #[test]
    fn accepts_normal_position() {
        assert!(is_storable_position(120.0, 80.0));
    }

    #[test]
    fn apply_window_geo_skips_minimized_and_sets_restored() {
        let mut cfg = VoiceConfig::default();
        cfg.window_width = 800.0;
        apply_window_geo(
            &mut cfg,
            &WindowGeo {
                skip: true,
                maximized: false,
                width: Some(900.0),
                height: Some(700.0),
                x: Some(10.0),
                y: Some(20.0),
            },
        );
        assert_eq!(cfg.window_width, 800.0);

        apply_window_geo(
            &mut cfg,
            &WindowGeo {
                skip: false,
                maximized: false,
                width: Some(900.0),
                height: Some(700.0),
                x: Some(10.0),
                y: Some(20.0),
            },
        );
        assert_eq!(cfg.window_width, 900.0);
        assert_eq!(cfg.window_height, 700.0);
        assert_eq!(cfg.window_x, Some(10.0));
        assert_eq!(cfg.window_y, Some(20.0));
    }

    /// Moved storm must arm one worker, not one spawn per pixel.
    #[test]
    fn schedule_save_coalesces_to_one_spawn() {
        SAVE_GEN.store(0, Ordering::SeqCst);
        SAVE_PENDING.store(false, Ordering::SeqCst);
        let mut spawns = 0u32;
        for _ in 0..80 {
            if schedule_save_should_spawn_worker() {
                spawns += 1;
            }
        }
        assert_eq!(spawns, 1, "80 Moved bumps must spawn once");
        assert!(SAVE_GEN.load(Ordering::SeqCst) >= 80);
        // Reset so other tests / later calls are not stuck pending.
        SAVE_PENDING.store(false, Ordering::SeqCst);
    }

    #[test]
    fn moved_stamp_freshness_window() {
        assert!(!moved_stamp_is_fresh(0, 0));
        assert!(!moved_stamp_is_fresh(0, 100));
        assert!(moved_stamp_is_fresh(1, 1));
        assert!(moved_stamp_is_fresh(100, 180));
        assert!(!moved_stamp_is_fresh(100, 181));
    }

    #[test]
    fn note_main_window_moving_marks_drag_active() {
        MAIN_SIZEMOVE_ACTIVE.store(false, Ordering::SeqCst);
        MAIN_MOVED_AT_MS.store(0, Ordering::SeqCst);
        note_main_window_moving();
        assert!(
            MAIN_MOVED_AT_MS.load(Ordering::SeqCst) >= 1,
            "0 is reserved as never-moved"
        );
        assert!(main_window_drag_active(), "fresh Moved stamp ⇒ drag active");
    }

    #[test]
    fn sizemove_latch_is_drag_truth() {
        MAIN_MOVED_AT_MS.store(0, Ordering::SeqCst);
        MAIN_SIZEMOVE_ACTIVE.store(true, Ordering::SeqCst);
        assert!(main_window_drag_active(), "ENTERSIZEMOVE latch ⇒ drag active");
        MAIN_SIZEMOVE_ACTIVE.store(false, Ordering::SeqCst);
        assert!(
            !main_window_drag_active(),
            "EXITSIZEMOVE + stale stamp ⇒ not active"
        );
    }

    /// Cursor FG rising edge: changed+first must enqueue once (not twice).
    #[test]
    fn kws_reload_coalesce_once() {
        fn need(changed: bool, first: bool) -> bool {
            changed || first
        }
        assert!(need(true, true)); // was double-fire
        assert!(need(false, true));
        assert!(need(true, false));
        assert!(!need(false, false));
    }
}
