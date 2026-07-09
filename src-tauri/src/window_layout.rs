use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{LogicalPosition, LogicalSize, Position, Size, WebviewWindow};

use crate::config::{self, VoiceConfig};
use crate::AppState;

const MIN_W: f64 = 640.0;
const MIN_H: f64 = 680.0;
const SAVE_DEBOUNCE_MS: u64 = 400;
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
        persist_now(&state, &window);
    });
}

fn capture_into(cfg: &mut VoiceConfig, window: &WebviewWindow) {
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

fn persist_and_log(state: &Arc<AppState>, window: &WebviewWindow, reason: &str) {
    let snapshot = {
        let mut cfg = state.cfg.lock();
        capture_into(&mut cfg, window);
        cfg.window_layout_seen = true;
        config::save_config(&cfg);
        (
            cfg.window_layout_seen,
            cfg.window_maximized,
            cfg.window_width,
            cfg.window_height,
            cfg.window_x,
            cfg.window_y,
        )
    };
    crate::app_log::log_line(
        state,
        "window",
        &format!(
            "layout saved ({reason}): maximized={} size={:.0}x{:.0} pos=({}, {})",
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
        ),
    );
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
