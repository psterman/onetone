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
    let gen = SAVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(SAVE_DEBOUNCE_MS)).await;
        if SAVE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        persist_and_log(&state, &window, "resize");
    });
}

fn capture_into(cfg: &mut VoiceConfig, window: &WebviewWindow) {
    // Minimized / tray-hidden geometry is not meaningful and must not overwrite layout.
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    cfg.window_maximized = window.is_maximized().unwrap_or(false);
    if cfg.window_maximized {
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(size) = window.inner_size() {
        let logical = size.to_logical::<f64>(scale);
        cfg.window_width = logical.width.max(MIN_W);
        cfg.window_height = logical.height.max(MIN_H);
    }
    if let Ok(pos) = window.outer_position() {
        let logical = pos.to_logical::<f64>(scale);
        if is_storable_position(logical.x, logical.y) {
            cfg.window_x = Some(logical.x);
            cfg.window_y = Some(logical.y);
        }
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
    crate::ui_heartbeat::note_ipc_enter("layout_persist");
    let t0 = Instant::now();
    // Capture under lock, then drop before disk — save_config under cfg.lock 假死'd IPC/HB.
    let (changed, snapshot, lock_ms) = {
        let lock_t0 = Instant::now();
        let mut cfg = state.cfg.lock();
        let before = layout_fingerprint(&cfg);
        capture_into(&mut cfg, window);
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
    let mut disk_ms = 0u64;
    if let Some(cfg_snap) = snapshot.6 {
        let disk_t0 = Instant::now();
        config::save_config(&cfg_snap);
        disk_ms = disk_t0.elapsed().as_millis() as u64;
    }
    let total_ms = t0.elapsed().as_millis() as u64;
    crate::ui_heartbeat::note_ipc_exit("layout_persist");
    if !changed {
        return;
    }
    crate::app_log::log_line(
        state,
        "window",
        &format!(
            "layout saved ({reason}): maximized={} size={:.0}x{:.0} pos=({}, {}) lock={}ms disk={}ms",
            snapshot.1,
            snapshot.2,
            snapshot.3,
            snapshot
                .4
                .map(|v| format!("{v:.0}"))
                .unwrap_or_else(|| "-".into()),
            snapshot
                .5
                .map(|v| format!("{v:.0}"))
                .unwrap_or_else(|| "-".into()),
            lock_ms,
            disk_ms,
        ),
    );
    // #region agent log
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    crate::app_log::append_debug_session_ndjson(&format!(
        "{{\"sessionId\":\"b5f349\",\"runId\":\"post-fix\",\"hypothesisId\":\"L1\",\"location\":\"window_layout.rs:persist\",\"message\":\"layout persist\",\"data\":{{\"reason\":\"{reason}\",\"changed\":true,\"lockMs\":{lock_ms},\"diskMs\":{disk_ms},\"totalMs\":{total_ms},\"maximized\":{}}},\"timestamp\":{ts}}}",
        snapshot.1
    ));
    // #endregion
}

#[cfg(test)]
mod tests {
    use super::is_storable_position;

    #[test]
    fn rejects_windows_hidden_sentinel_position() {
        assert!(!is_storable_position(-32000.0, -32000.0));
    }

    #[test]
    fn accepts_normal_position() {
        assert!(is_storable_position(120.0, 80.0));
    }
}
