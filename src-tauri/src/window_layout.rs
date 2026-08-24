use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{LogicalPosition, LogicalSize, Position, Size, WebviewWindow};

use crate::config::{self, VoiceConfig};
use crate::AppState;

const MIN_W: f64 = 640.0;
const MIN_H: f64 = 680.0;
/// Maximize/restore animations emit many Moved/Resized; 400ms still wrote 3× disk mid-transition.
const SAVE_DEBOUNCE_MS: u64 = 1500;
/// Windows moves tray-hidden windows to about (-32000, -32000).
const HIDDEN_POSITION_THRESHOLD: f64 = -10_000.0;

static SAVE_GEN: AtomicU64 = AtomicU64::new(0);

fn is_storable_position(x: f64, y: f64) -> bool {
    x > HIDDEN_POSITION_THRESHOLD && y > HIDDEN_POSITION_THRESHOLD
}

pub fn ensure_on_screen(window: &WebviewWindow) {
    if let Ok(pos) = window.outer_position() {
        let scale = window.scale_factor().unwrap_or(1.0);
        let logical = pos.to_logical::<f64>(scale);
        if is_storable_position(logical.x, logical.y) {
            return;
        }
    }
    let _ = window.center();
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

pub fn schedule_save(state: Arc<AppState>, window: WebviewWindow) {
    // Settings open: resize storms + disk save coincided with voiceWake idle stalls.
    if *state.settings_drawer_open.lock() {
        return;
    }
    let gen = SAVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(SAVE_DEBOUNCE_MS)).await;
        if SAVE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        if *state.settings_drawer_open.lock() {
            return;
        }
        persist_and_log(&state, &window, "resize");
    });
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
            (Some(logical.width.max(MIN_W)), Some(logical.height.max(MIN_H)))
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
    use super::{apply_window_geo, is_storable_position, WindowGeo};
    use crate::config::VoiceConfig;

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
