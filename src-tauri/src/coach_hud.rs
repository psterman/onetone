use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::config::{mapping_is_complete, VoiceConfig};
use crate::AppState;

pub const COACH_HUD_LABEL: &str = "coach_hud";

const HUD_WIDTH: f64 = 360.0;
const HUD_HEIGHT: f64 = 88.0;

static SUCCESS_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoachHudSnapshot {
    pub visible: bool,
    pub mode: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub trigger_key: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub target_key: String,
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let Some(win) = app.get_webview_window(COACH_HUD_LABEL) else {
        return Ok(());
    };
    configure_coach_hud_window(&win)?;
    Ok(())
}

fn configure_coach_hud_window(win: &WebviewWindow) -> tauri::Result<()> {
    win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = win.set_shadow(false);
    Ok(())
}

pub fn flash_success(app: &AppHandle, state: &AppState) {
    *SUCCESS_UNTIL.lock() = Some(Instant::now() + Duration::from_millis(850));
    push_state(app, state);
}

pub fn build_snapshot(state: &AppState) -> CoachHudSnapshot {
    let cfg = state.cfg.lock();
    build_snapshot_from_cfg(&cfg, state)
}

fn build_snapshot_from_cfg(cfg: &VoiceConfig, state: &AppState) -> CoachHudSnapshot {
    if !cfg.coach_hud_enabled || *state.coach_hud_session_dismissed.lock() || *state.paused.lock() {
        return CoachHudSnapshot {
            visible: false,
            mode: "hidden".into(),
            trigger_key: String::new(),
            target_key: String::new(),
        };
    }

    let (trigger_key, target_key) = active_mapping_keys(cfg);

    if let Some(until) = *SUCCESS_UNTIL.lock() {
        if Instant::now() < until {
            return CoachHudSnapshot {
                visible: true,
                mode: "success".into(),
                trigger_key,
                target_key,
            };
        }
    }

    CoachHudSnapshot {
        visible: true,
        mode: "key_only".into(),
        trigger_key,
        target_key,
    }
}

fn active_mapping_keys(cfg: &VoiceConfig) -> (String, String) {
    let m = cfg
        .active_mappings()
        .into_iter()
        .find(|m| mapping_is_complete(m))
        .or_else(|| cfg.mappings.iter().find(|m| mapping_is_complete(m)));
    match m {
        Some(m) => (m.trigger_key.clone(), m.target_key.clone()),
        None => (String::new(), String::new()),
    }
}

pub fn push_state(app: &AppHandle, state: &AppState) {
    let snapshot = build_snapshot(state);
    let Some(win) = app.get_webview_window(COACH_HUD_LABEL) else {
        return;
    };

    let visible = snapshot.visible;
    let payload = snapshot;
    let app_clone = app.clone();

    let _ = win.run_on_main_thread(move || {
        let Some(hud_win) = app_clone.get_webview_window(COACH_HUD_LABEL) else {
            return;
        };
        if visible {
            position_coach_hud(&hud_win);
            let _ = hud_win.set_size(Size::Logical(LogicalSize::new(HUD_WIDTH, HUD_HEIGHT)));
            let _ = hud_win.show();
        } else {
            let _ = hud_win.hide();
        }
        let _ = hud_win.emit("coach_state", &payload);
    });
}

fn position_coach_hud(win: &WebviewWindow) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let hud_w = (HUD_WIDTH * scale).round() as i32;
    let hud_h = (HUD_HEIGHT * scale).round() as i32;
    let margin = (12.0 * scale).round() as i32;

    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
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

    let mut x = work_x + (work_right - work_x - hud_w) / 2;
    let mut y = work_bottom - hud_h - margin;
    x = x.max(work_x + margin).min(work_right - hud_w - margin);
    y = y.max(work_y + margin).min(work_bottom - hud_h - margin);

    let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

pub fn reset_session_dismissed(state: &AppState) {
    *state.coach_hud_session_dismissed.lock() = false;
}

pub fn dismiss_session(state: &AppState) {
    *state.coach_hud_session_dismissed.lock() = true;
}

pub fn maybe_tick(app: &AppHandle, state: &AppState) {
    let cfg = state.cfg.lock();
    if !cfg.coach_hud_enabled {
        return;
    }
    drop(cfg);
    push_state(app, state);
}
