use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewWindow,
};

use crate::config::{mapping_is_complete, VoiceConfig};
use crate::scene_config;
use crate::AppState;

pub const COACH_HUD_LABEL: &str = "coach_hud";

const HUD_WIDTH: f64 = 400.0;
const HUD_HEIGHT: f64 = 88.0;
const HUD_HEIGHT_DICTATING: f64 = 118.0;

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
    #[serde(skip_serializing_if = "String::is_empty")]
    pub cancel_phrase_hint: String,
    pub cancel_window_active: bool,
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
            cancel_phrase_hint: String::new(),
            cancel_window_active: false,
        };
    }

    let (trigger_key, target_key) = active_mapping_keys(cfg);
    let session = crate::voice_end_runtime::session_state(state);

    if session == "dictating" {
        let mapping_id = state.voice_session_mapping_id.lock().clone();
        return CoachHudSnapshot {
            visible: true,
            mode: "dictating".into(),
            trigger_key,
            target_key,
            cancel_phrase_hint: dictation_cancel_phrase_hint(state),
            cancel_window_active: crate::voice_end_runtime::is_in_trigger_cancel_window(
                state,
                &mapping_id,
            ),
        };
    }

    if let Some(until) = *SUCCESS_UNTIL.lock() {
        if Instant::now() < until {
            return CoachHudSnapshot {
                visible: true,
                mode: "success".into(),
                trigger_key,
                target_key,
                cancel_phrase_hint: String::new(),
                cancel_window_active: false,
            };
        }
    }

    CoachHudSnapshot {
        visible: true,
        mode: "key_only".into(),
        trigger_key,
        target_key,
        cancel_phrase_hint: String::new(),
        cancel_window_active: false,
    }
}

fn dictation_cancel_phrase_hint(state: &AppState) -> String {
    if let Some(snap) = state.voice_session_snapshot.lock().as_ref() {
        if let Some(p) = snap.effective.cancel_phrases.zh.first() {
            let t = p.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
        if let Some(p) = snap.effective.cancel_phrases.en.first() {
            let t = p.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    let cfg = state.cfg.lock();
    cfg.voice_end
        .cancel_phrases_zh
        .first()
        .cloned()
        .unwrap_or_else(|| "取消输入".into())
}

fn active_mapping_keys(cfg: &VoiceConfig) -> (String, String) {
    if let Some(effective) = scene_config::resolve_idle_effective_scene(cfg) {
        let trigger_key = effective.trigger_key;
        let target_key = if let Some(m) = cfg.find_mapping_by_id(&effective.scene_id) {
            if let Some(ov) = m.voice_override.as_ref() {
                if let Some(k) = ov.target_key.as_ref() {
                    let t = k.trim();
                    if !t.is_empty() {
                        return (trigger_key, t.to_string());
                    }
                }
            }
            m.target_key.clone()
        } else {
            effective.target_key
        };
        return (trigger_key, target_key);
    }
    let m = cfg.mappings.iter().find(|m| mapping_is_complete(m));
    match m {
        Some(m) => (m.trigger_key.clone(), m.target_key.clone()),
        None => (String::new(), String::new()),
    }
}

pub fn push_state(app: &AppHandle, state: &AppState) {
    let snapshot = build_snapshot(state);
    let Some(_win) = app.get_webview_window(COACH_HUD_LABEL) else {
        return;
    };

    let visible = snapshot.visible;
    let payload = snapshot;
    let app_clone = app.clone();

    let _ = app.run_on_main_thread(move || {
        let Some(hud_win) = app_clone.get_webview_window(COACH_HUD_LABEL) else {
            return;
        };
        if visible {
            position_coach_hud(&hud_win);
            let height = if payload.mode == "dictating" {
                HUD_HEIGHT_DICTATING
            } else {
                HUD_HEIGHT
            };
            let _ = hud_win.set_size(Size::Logical(LogicalSize::new(HUD_WIDTH, height)));
            // Prefer no-activate show so the coach HUD never steals focus from the target app.
            #[cfg(windows)]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                if let Ok(handle) = hud_win.window_handle() {
                    if let RawWindowHandle::Win32(platform) = handle.as_raw() {
                        let hwnd = platform.hwnd.get() as winapi::shared::windef::HWND;
                        let _ = crate::keyboard::show_window_no_activate(hwnd);
                    } else {
                        let _ = hud_win.show();
                    }
                } else {
                    let _ = hud_win.show();
                }
            }
            #[cfg(not(windows))]
            {
                let _ = hud_win.show();
            }
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
    if !state.cfg.lock().coach_hud_enabled {
        return;
    }
    let expired = if let Some(until) = *SUCCESS_UNTIL.lock() {
        Instant::now() >= until
    } else {
        false
    };
    if expired {
        *SUCCESS_UNTIL.lock() = None;
        push_state(app, state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{MappingEntry, TriggerMode, VoiceConfig, VoiceOverride};

    fn mapping(id: &str, trigger: &str, target: &str, ov: Option<VoiceOverride>) -> MappingEntry {
        MappingEntry {
            id: id.into(),
            label: String::new(),
            group: "默认".into(),
            trigger_key: trigger.into(),
            target_key: target.into(),
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
            app_target_id: String::new(),
            app_behavior_rules: vec![],
            voice_override: ov,
            voice_commands: vec![],
            acoustic_voice_commands: vec![],
        }
    }

    fn sample_cfg(active: &str, other_target: &str) -> VoiceConfig {
        let mut cfg = VoiceConfig::default();
        cfg.mappings = vec![
            mapping(
                "a",
                "F1",
                "RAlt",
                Some(VoiceOverride {
                    target_key: Some("F2".into()),
                    wake_phrases: None,
                    end_phrases: None,
                    ..Default::default()
                }),
            ),
            mapping("b", "F3", other_target, None),
        ];
        cfg.active_scene_id = active.to_string();
        cfg
    }

    #[test]
    fn active_mapping_keys_use_effective_scene_target() {
        let cfg = sample_cfg("a", "RWin");
        let (trigger, target) = active_mapping_keys(&cfg);
        assert_eq!(trigger, "F1");
        assert_eq!(target, "F2");
    }

    #[test]
    fn active_mapping_keys_follow_active_scene_switch() {
        let cfg = sample_cfg("b", "RWin");
        let (_, target) = active_mapping_keys(&cfg);
        assert_eq!(target, "RWin");
    }
}
