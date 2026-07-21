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

const OVERLAY_WIDTH: f64 = 300.0;
const OVERLAY_HEIGHT: f64 = 300.0;
const HIGHLIGHT_MS: u64 = 320;

static ACTIVE_MICRO_KEY: OnceLock<Mutex<String>> = OnceLock::new();
static HIGHLIGHT_UNTIL: OnceLock<ParkingMutex<Option<Instant>>> = OnceLock::new();
static LAST_FOREGROUND_CODEX: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static LAST_VISIBLE: OnceLock<ParkingMutex<bool>> = OnceLock::new();
static FG_CONFIRM: OnceLock<ParkingMutex<(bool, u8)>> = OnceLock::new();

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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroOverlaySnapshot {
    pub visible: bool,
    pub enabled: bool,
    pub bound_count: u32,
    pub active_micro_key_id: String,
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
        label_zh: "批准",
        label_en: "Approve",
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

/// Show pad while configuring in OneTone, or when Codex desktop is focused.
/// (Web ChatGPT / other apps do not count — click fire still requires Codex FG.)
#[cfg(windows)]
fn overlay_host_allows_show() -> bool {
    if codex_is_foreground() {
        return true;
    }
    let Some(identity) = crate::app_identity::foreground_app_identity() else {
        return false;
    };
    let exe = identity.exe_name.to_ascii_lowercase();
    if exe.contains("onetone") {
        return true;
    }
    identity
        .full_path
        .as_deref()
        .map(|p| {
            let pl = p.to_ascii_lowercase();
            pl.contains("onetone") || pl.contains("voice-pilot")
        })
        .unwrap_or(false)
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

fn build_snapshot_from_cfg(cfg: &VoiceConfig) -> CodexMicroOverlaySnapshot {
    let show = overlay_host_allows_show();
    let Some((mapping, pad)) = active_codex_mapping_with_overlay(cfg) else {
        return CodexMicroOverlaySnapshot {
            visible: false,
            enabled: false,
            bound_count: 0,
            active_micro_key_id: String::new(),
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
        let bound = slot_id.is_some();
        if bound {
            bound_count += 1;
        }
        let sub = slot_id
            .and_then(|slot| agent_key_binding_for_slot(mapping, slot))
            .map(|b| b.trigger_binding.clone())
            .unwrap_or_default();
        let ui_icon_id = route
            .map(|r| r.ui_icon_id.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| def.default_icon.to_string());
        cells.push(CodexMicroOverlayCell {
            micro_key_id: def.micro_key_id.to_string(),
            label: label_for_cell(def),
            bound,
            sub,
            ui_icon_id,
            kind: def.kind.to_string(),
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
        visible: show,
        enabled: pad.enabled,
        bound_count,
        active_micro_key_id: active,
        cells,
    }
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
            if visible {
                position_overlay(&win);
                let _ = win.set_size(Size::Logical(LogicalSize::new(
                    OVERLAY_WIDTH,
                    OVERLAY_HEIGHT,
                )));
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
            } else {
                let _ = win.hide();
            }
            let _ = win.emit("codex_micro_overlay_state", &payload);
        });
}

fn position_overlay(win: &WebviewWindow) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let w = (OVERLAY_WIDTH * scale).round() as i32;
    let h = (OVERLAY_HEIGHT * scale).round() as i32;
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

    let x = (work_right - w - margin).max(work_x + margin);
    let y = (work_bottom - h - margin).max(work_y + margin);

    let _ = win.set_position(Position::Physical(PhysicalPosition::new(x, y)));
}

pub fn maybe_tick(app: &AppHandle, state: &AppState) {
    let host_ok = stable_overlay_host(overlay_host_allows_show());

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
            keys: vec![],
        })];
        let snap = build_snapshot_from_cfg(&cfg);
        assert!(!snap.visible);
        assert!(snap.cells.is_empty());
    }
}
