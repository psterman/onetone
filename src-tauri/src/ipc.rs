use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};

use crate::config::{
    self, canonical_trigger, is_allowed_trigger, is_volume_hotkey, is_peripheral_trigger_key,
    make_combo_trigger_source,
    apply_peripheral_autotrigger, make_peripheral_mixed_source, now_source_time,
    new_mapping_id, mapping_is_complete, ConflictReport,
    MappingEntry, RawEvent, TriggerSource, VoiceConfig,
};
use crate::key_chord::parse_chord;
use crate::AppState;

#[derive(Debug, Clone)]
pub enum RecordMode {
    Trigger,
    Target,
}

#[derive(Debug, Clone)]
pub struct RecordingTarget {
    pub mapping_id: String,
    pub mode: RecordMode,
}

fn enable_mapping_if_complete(cfg: &mut VoiceConfig, mapping_id: &str) {
    let complete = cfg
        .find_mapping_by_id(mapping_id)
        .map(|m| !m.trigger_key.trim().is_empty() && !m.target_key.trim().is_empty())
        .unwrap_or(false);
    if complete {
        cfg.enable_mapping(mapping_id);
    }
}

fn normalize_record_key(key: &str) -> String {
    canonical_trigger(key)
}

fn build_source_from_raw_events(raw_events: Vec<RawEvent>) -> TriggerSource {
    let label = raw_events
        .first()
        .map(|r| r.label.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "      ".into());
    TriggerSource {
        id: "source_captured".into(),
        label,
        mode: "single_press".into(),
        grouping: "exact".into(),
        raw_events,
    }
}

fn apply_trigger_capture(cfg: &mut VoiceConfig, mapping_id: &str, captured: &str, physical_key: &str) {
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
        let raw = if physical_key.trim().is_empty() {
            captured
        } else {
            physical_key
        };
        m.source_time = now_source_time();
        if is_peripheral_trigger_key(raw) || is_volume_hotkey(raw) {
            apply_peripheral_autotrigger(m, raw);
        } else if captured.contains('+') || raw.contains('+') {
            let stored = if captured.contains('+') {
                captured.to_string()
            } else {
                raw.to_string()
            };
            m.trigger_key = canonical_trigger(&stored);
            m.source_key = stored.clone();
            m.trigger_source = Some(make_combo_trigger_source(&stored));
        } else {
            let canon = canonical_trigger(captured);
            m.trigger_key = canon.clone();
            m.source_key = canonical_trigger(raw);
            m.trigger_source = Some(make_peripheral_mixed_source(&[raw.to_string()]));
        }
        if m.target_key.trim().is_empty() {
            m.target_key = "RAlt".into();
        }
        m.label = format!("{} -> {}", m.trigger_key, m.target_key);
    }
    cfg.normalize();
    enable_mapping_if_complete(cfg, mapping_id);
}

fn emit_record_seen(window: &tauri::WebviewWindow, key: &str) {
    let payload = serde_json::json!({
        "type": "mvp_record_seen",
        "key": key,
    });
    window.emit("to_js", &payload).ok();
}

fn normalize_hardware_key(key: &str) -> String {
    match key {
        "AudioVolumeDown" | "VolumeDown" | "Audio_Volume_Down" => "Volume_Down".into(),
        "AudioVolumeUp" | "VolumeUp" | "Audio_Volume_Up" => "Volume_Up".into(),
        "AudioVolumeMute" | "VolumeMute" | "Audio_Volume_Mute" => "Volume_Mute".into(),
        "RControl" => "RCtrl".into(),
        "LControl" | "ControlLeft" => "LCtrl".into(),
        "Control" => "LCtrl".into(),
        "LShift" | "ShiftLeft" => "LShift".into(),
        "RShift" | "ShiftRight" => "RShift".into(),
        "Shift" => "LShift".into(),
        "LAlt" | "AltLeft" | "LMenu" => "LAlt".into(),
        "RAlt" | "AltRight" | "RMenu" => "RAlt".into(),
        "Alt" => "LAlt".into(),
        "LWin" | "MetaLeft" => "LWin".into(),
        "RWin" | "MetaRight" => "RWin".into(),
        other => other.to_string(),
    }
}

fn is_modifier_token(key: &str) -> bool {
    matches!(
        key,
        "LCtrl" | "RCtrl" | "LShift" | "RShift" | "LAlt" | "RAlt" | "LWin" | "RWin"
    )
}

fn collect_pressed_side_modifiers() -> Vec<String> {
    use winapi::um::winuser::GetAsyncKeyState;
    let mut out = Vec::new();
    let pairs: &[(i32, &str)] = &[
        (0xA2, "LCtrl"),
        (0xA3, "RCtrl"),
        (0xA0, "LShift"),
        (0xA1, "RShift"),
        (0xA4, "LAlt"),
        (0xA5, "RAlt"),
        (0x5B, "LWin"),
        (0x5C, "RWin"),
    ];
    for (vk, name) in pairs {
        if unsafe { GetAsyncKeyState(*vk) } as u16 & 0x8000 != 0 {
            out.push((*name).to_string());
        }
    }
    out
}

fn build_hardware_record_chord(terminal: &str) -> String {
    crate::key_chord::build_pressed_chord(&normalize_hardware_key(terminal))
}

///      ?WebView/               LAlt+LAlt     ?
pub fn is_spurious_trigger_capture(key: &str) -> bool {
    use std::collections::HashSet;
    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    if parts.is_empty() {
        return true;
    }
    let mut seen = HashSet::new();
    for p in &parts {
        if !seen.insert(p.clone()) {
            return true;
        }
    }
    if parts.len() == 1 && (parts[0] == "RAlt" || parts[0] == "AltRight") {
        return false;
    }
    if parts.iter().all(|p| is_modifier_token(p)) {
        return true;
    }
    false
}

///                      ?F1/     ?
fn sanitize_trigger_capture(key: &str) -> String {
    use crate::config::{is_peripheral_trigger_key, is_volume_hotkey};
    let parts: Vec<String> = key
        .split('+')
        .map(|s| normalize_hardware_key(s.trim()))
        .filter(|s| !s.is_empty())
        .collect();
    let meaningful: Vec<String> = parts
        .iter()
        .filter(|p| is_peripheral_trigger_key(p) || is_volume_hotkey(p))
        .cloned()
        .collect();
    if !meaningful.is_empty() {
        return meaningful.last().unwrap().clone();
    }
    let non_mod: Vec<String> = parts
        .iter()
        .filter(|p| !is_modifier_token(p))
        .cloned()
        .collect();
    if !non_mod.is_empty() {
        return non_mod.join("+");
    }
    parts.join("+")
}

fn is_mouse_button(key: &str) -> bool {
    matches!(
        key,
        "LButton" | "RButton" | "MButton" | "XButton1" | "XButton2"
    )
}

pub fn handle_hardware_record_key(state: &AppState, window: &tauri::WebviewWindow, key_name: &str) {
    if !*state.recording.lock() {
        return;
    }
    let target = state.recording_target.lock().clone();
    let Some(target) = target else {
        return;
    };
    let is_trigger = matches!(target.mode, RecordMode::Trigger);
    let is_keyup = key_name.starts_with("keyup:");
    let raw = if is_keyup {
        &key_name[6..]
    } else {
        key_name
    };
    let normalized = normalize_hardware_key(raw);

    if is_trigger && is_mouse_button(&normalized) {
        let ignore = state
            .record_started_at
            .lock()
            .as_ref()
            .map(|t| t.elapsed() < Duration::from_millis(350))
            .unwrap_or(true);
        if ignore {
            return;
        }
    }

    emit_record_seen(window, &normalized);

    if is_keyup {
        if is_modifier_token(&normalized) {
            let should_finish = state
                .record_hw_pending
                .lock()
                .as_deref()
                .map(|p| p == &normalized)
                .unwrap_or(false);
            if should_finish {
                let pending = state.record_hw_pending.lock().take().unwrap_or(normalized.clone());
                finish_hardware_capture(state, window, &pending);
            }
        }
        return;
    }

    if is_trigger && (is_peripheral_trigger_key(&normalized) || is_volume_hotkey(&normalized)) {
        *state.record_hw_pending.lock() = None;
        finish_hardware_capture(state, window, &normalized);
        return;
    }

    if is_trigger && !is_modifier_token(&normalized) && !is_spurious_trigger_capture(&normalized) {
        *state.record_hw_pending.lock() = None;
        finish_hardware_capture(state, window, &normalized);
        return;
    }

    if is_modifier_token(&normalized) {
        let pressed = collect_pressed_side_modifiers();
        if pressed.len() == 1 && pressed[0] == normalized {
            *state.record_hw_pending.lock() = Some(normalized.clone());
            let ack = serde_json::json!({
                "type": "mvp_record_pending",
                "displayKey": normalized,
            });
            window.emit("to_js", &ack).ok();
            return;
        }
    }

    *state.record_hw_pending.lock() = None;
    let combo = build_hardware_record_chord(&normalized);
    if combo.trim().is_empty() {
        return;
    }
    if is_trigger && is_spurious_trigger_capture(&combo) {
        return;
    }
    finish_hardware_capture(state, window, &combo);
}

#[derive(Clone, serde::Serialize)]
struct RuntimePayload {
    #[serde(rename = "type")]
    msg_type: String,
    bindings: String,
    #[serde(rename = "lastAction")]
    last_action: String,
    #[serde(rename = "lastMappingId")]
    last_mapping_id: String,
    #[serde(rename = "mappingCount")]
    mapping_count: u32,
    #[serde(rename = "enabledCount")]
    enabled_count: u32,
    #[serde(rename = "timerActive")]
    timer_active: bool,
    paused: bool,
}

/// Emit to the webview on the main thread (safe from hotkey/voice/watcher threads).
pub fn emit_to_js_main(window: &tauri::WebviewWindow, payload: serde_json::Value) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}

pub fn emit_to_js_main_t<T: serde::Serialize + Send + 'static>(
    window: &tauri::WebviewWindow,
    payload: T,
) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}

pub fn mvp_init_payload(state: &AppState, backdrop_mode: &str) -> serde_json::Value {
    let cfg = state.cfg.lock().clone();
    let conflicts = cfg.conflict_report();
    serde_json::json!({
        "type": "mvp_init",
        "config": cfg,
        "conflicts": conflicts,
        "shell": {
            "customTitlebar": crate::backdrop::CUSTOM_TITLEBAR,
            "backdropMode": backdrop_mode,
        }
    })
}

pub fn push_mvp_init(state: &AppState, window: &tauri::WebviewWindow, backdrop_mode: &str) {
    emit_to_js_main(window, mvp_init_payload(state, backdrop_mode));
}

pub fn push_runtime(
    state: &AppState,
    window: &tauri::WebviewWindow,
    last_action: &str,
    last_mapping_id: &str,
) {
    let (bindings, mapping_count, enabled_count, paused) = {
        let cfg = state.cfg.lock();
        let paused = *state.paused.lock();
        let enabled_count = cfg.mappings.iter().filter(|m| m.enabled).count() as u32;
        (
            cfg.bindings().join(", "),
            cfg.mappings.len() as u32,
            enabled_count,
            paused,
        )
    };
    let timer_active = state.machine_pool.lock().any_timer_active();
    let payload = RuntimePayload {
        msg_type: "mvp_runtime".into(),
        bindings,
        last_action: last_action.into(),
        last_mapping_id: last_mapping_id.into(),
        mapping_count,
        enabled_count,
        timer_active,
        paused,
    };
    emit_to_js_main_t(window, payload);
}

fn dispatch_trigger_action(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    duration_ms: u32,
    action: crate::state::Action,
) {
    use crate::{keyboard, state};
    match action {
        state::Action::SendKey { key } => {
            let sent = keyboard::send_chord(&key, duration_ms);
            if sent {
                let should_enter = {
                    let cfg = state.cfg.lock();
                    if !crate::voice_end_runtime::can_enter_dictating(&cfg) {
                        false
                    } else if let Some(m) = cfg.find_mapping_by_id(mapping_id) {
                        !m.native_key_restore
                            && !m.target_key.trim().is_empty()
                            && key == m.target_key
                    } else {
                        false
                    }
                };
                if should_enter {
                    crate::voice_end_runtime::enter_dictating(
                        state,
                        window,
                        mapping_id,
                        "physical trigger",
                    );
                }
            }
            let label = if sent { key.as_str() } else { "send_failed" };
            push_runtime(state.as_ref(), window, label, mapping_id);
        }
        state::Action::SendEsc => {
            keyboard::send_escape();
            push_runtime(state.as_ref(), window, "esc", mapping_id);
        }
        state::Action::ScheduleEnter { delay_ms, token } => {
            let s3 = Arc::clone(state);
            let w3 = window.clone();
            let mid = mapping_id.to_string();
            let d = delay_ms;
            let timer_token = token;
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(d as u64)).await;
                let action = s3
                    .machine_pool
                    .lock()
                    .get_or_create(&mid)
                    .on_enter_timer(timer_token);
                if matches!(action, state::Action::SendEnter) {
                    keyboard::send_enter();
                    push_runtime(&s3, &w3, "enter", &mid);
                }
            });
            push_runtime(state.as_ref(), window, "enter_scheduled", mapping_id);
        }
        state::Action::SendEnter => {
            keyboard::send_enter();
            push_runtime(state.as_ref(), window, "enter", mapping_id);
        }
        state::Action::None => {}
    }
}

///            / RawInput /         ?
pub fn handle_physical_key(state: &Arc<AppState>, window: &tauri::WebviewWindow, key_name: &str) {
    if *state.paused.lock() || *state.recording.lock() || crate::send_guard::is_active() {
        return;
    }
    let now = std::time::Instant::now();
    let (mapping_id, duration_ms, actions) = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_by_physical(key_name) else {
            return;
        };
        let mapping_id = mapping.id.clone();
        let duration_ms = cfg.key_press_duration_ms;
        let actions = {
            let mut pool = state.machine_pool.lock();
            pool.get_or_create(&mapping_id)
                .trigger(&cfg, mapping, key_name, now)
        };
        (mapping_id, duration_ms, actions)
    };
    for action in actions {
        dispatch_trigger_action(state, window, &mapping_id, duration_ms, action);
    }
}

pub fn mvp_init_json(state: &AppState, backdrop_mode: &str) -> String {
    let cfg = state.cfg.lock().clone();
    let conflicts = cfg.conflict_report();
    let payload = serde_json::json!({
        "config": cfg,
        "conflicts": conflicts,
        "shell": {
            "customTitlebar": crate::backdrop::CUSTOM_TITLEBAR,
            "backdropMode": backdrop_mode,
        }
    });
    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".into())
}

fn sync_config_ui(state: &AppState, window: &tauri::WebviewWindow, backdrop_mode: &str) {
    push_mvp_init(state, window, backdrop_mode);
}

fn persist_and_rebind(state: &AppState, window: &tauri::WebviewWindow, last_action: &str) {
    let cfg = state.cfg.lock().clone();
    config::save_config(&cfg);
    config::apply_config(state, &cfg);
    sync_config_ui(state, window, "unchanged");
    push_runtime(state, window, last_action, "");
    crate::tray::refresh_menu(window.app_handle());
}

pub fn pause_listen(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    state.machine_pool.lock().reset_all();
    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    *state.paused.lock() = true;
    let ack = serde_json::json!({"type":"mvp_paused","ok":true});
    window.emit("to_js", &ack).ok();
    push_runtime(state.as_ref(), window, "paused", "");
    crate::tray::refresh_menu(window.app_handle());
}

pub fn resume_listen(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    *state.paused.lock() = false;
    let ack = serde_json::json!({"type":"mvp_resumed","ok":true});
    window.emit("to_js", &ack).ok();
    push_runtime(state.as_ref(), window, "resumed", "");
    crate::tray::refresh_menu(window.app_handle());
}

pub fn set_active_trigger_mode(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mode: crate::config::TriggerMode,
) {
    let changed = {
        let mut cfg = state.cfg.lock();
        let active_id = cfg
            .active_mappings()
            .first()
            .map(|m| m.id.clone())
            .or_else(|| {
                cfg.mappings
                    .iter()
                    .find(|m| mapping_is_complete(m))
                    .map(|m| m.id.clone())
            });
        let Some(id) = active_id else {
            return;
        };
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            if m.trigger_mode != mode {
                m.trigger_mode = mode;
                true
            } else {
                false
            }
        } else {
            false
        }
    };
    if !changed {
        return;
    }
    state.machine_pool.lock().reset_all();
    persist_and_rebind(state, window, "mode_changed");
    let ack = serde_json::json!({
        "type": "mvp_mode_changed",
        "ok": true,
        "mode": match mode {
            crate::config::TriggerMode::Tap => "tap",
            crate::config::TriggerMode::Hold => "hold",
            crate::config::TriggerMode::Toggle => "toggle",
        },
    });
    window.emit("to_js", &ack).ok();
}

pub fn handle_scheme_cycle(state: &Arc<AppState>, window: &tauri::WebviewWindow) {
    if *state.recording.lock() {
        return;
    }
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.cycle_scheme_same_trigger()
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime(state.as_ref(), window, "scheme_cycle_skip", "");
        return;
    };
    finish_scheme_switch(state, window, &from_id, &to_id, "scheme_cycle");
}

pub fn handle_scheme_select(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
) {
    if *state.recording.lock() {
        return;
    }
    let switched = {
        let mut cfg = state.cfg.lock();
        cfg.select_scheme(mapping_id)
    };
    let Some((from_id, to_id)) = switched else {
        push_runtime(state.as_ref(), window, "scheme_select_skip", "");
        return;
    };
    finish_scheme_switch(state, window, &from_id, &to_id, "scheme_select");
}

fn finish_scheme_switch(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    from_id: &str,
    to_id: &str,
    action: &str,
) {
    state.machine_pool.lock().reset_all();
    {
        let cfg = state.cfg.lock();
        config::save_config(&cfg);
        config::apply_config(state, &cfg);
    }
    let label = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(to_id)
            .map(|m| m.display_label())
            .unwrap_or_default()
    };
    let cfg_snapshot = state.cfg.lock().clone();
    push_runtime(state.as_ref(), window, action, to_id);
    if !window.is_focused().unwrap_or(false) {
        let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
    }
    let payload = serde_json::json!({
        "type": "mvp_scheme_switched",
        "fromId": from_id,
        "toId": to_id,
        "label": label,
        "config": cfg_snapshot,
    });
    emit_to_js_main(window, payload);
    crate::tray::refresh_menu(window.app_handle());
}

#[tauri::command]
pub fn cmd_ready(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    backdrop_mode: Option<String>,
) {
    let mode = backdrop_mode.unwrap_or_else(|| "unchanged".into());
    push_mvp_init(&state, &window, &mode);
    push_runtime(&state, &window, "config_push", "");
}

#[tauri::command]
pub fn cmd_save(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow, json: String) {
    if let Ok(mut cfg) = serde_json::from_str::<VoiceConfig>(&json) {
        cfg.migrate();
        cfg.normalize();
        config::save_config(&cfg);
        config::apply_config(&state, &cfg);
        *state.cfg.lock() = cfg.clone();
        sync_config_ui(&state, &window, "unchanged");
        state.machine_pool.lock().reset_all();
        push_runtime(&state, &window, "saved", "");
        let ack = serde_json::json!({"type":"mvp_saved","ok":true});
        window.emit("to_js", &ack).ok();
    }
}

#[tauri::command]
pub fn cmd_start_recording(
    state: tauri::State<Arc<AppState>>,
    mapping_id: String,
    mode: String,
) {
    state.machine_pool.lock().reset_all();
    let record_mode = if mode == "target" {
        RecordMode::Target
    } else {
        RecordMode::Trigger
    };
    *state.recording_target.lock() = Some(RecordingTarget {
        mapping_id,
        mode: record_mode,
    });
    *state.recording.lock() = true;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = Some(Instant::now());
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.start_recording();
    }
}

#[tauri::command]
pub fn cmd_stop_recording(state: tauri::State<Arc<AppState>>) {
    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
        let bindings = state.cfg.lock().bindings();
        mgr.bind_all(&bindings);
    }
}

#[tauri::command]
pub fn cmd_pause(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    pause_listen(&state, &window);
}

#[tauri::command]
pub fn cmd_resume(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    resume_listen(&state, &window);
}

#[tauri::command]
pub fn cmd_mapping_toggle(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    enabled: bool,
) {
    let mut disabled_ids = Vec::new();
    {
        let mut cfg = state.cfg.lock();
        if enabled {
            disabled_ids = cfg.enable_mapping(&id);
        } else {
            cfg.disable_mapping(&id);
        }
        cfg.normalize();
    }
    persist_and_rebind(&state, &window, "mapping_toggled");
    let ack = serde_json::json!({
        "type": "mvp_mapping_toggled",
        "ok": true,
        "id": id,
        "enabled": enabled,
        "autoDisabled": disabled_ids,
    });
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_delete(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
) {
    let mut cfg = state.cfg.lock();
    if cfg.mappings.len() <= 1 {
        let ack = serde_json::json!({"type":"mvp_mapping_delete","ok":false,"reason":"last_mapping"});
        window.emit("to_js", &ack).ok();
        return;
    }
    cfg.mappings.retain(|m| m.id != id);
    cfg.normalize();
    drop(cfg);
    persist_and_rebind(&state, &window, "mapping_deleted");
    let ack = serde_json::json!({"type":"mvp_mapping_delete","ok":true,"id":id});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_duplicate(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
) {
    let mut new_id = String::new();
    {
        let mut cfg = state.cfg.lock();
        if let Some(src) = cfg.mappings.iter().find(|m| m.id == id).cloned() {
            new_id = new_mapping_id();
            let order = cfg.mappings.len() as u32;
            cfg.mappings.push(MappingEntry {
                id: new_id.clone(),
                label: format!("{}    ", src.display_label()),
                group: src.group,
                trigger_key: src.trigger_key,
                target_key: src.target_key,
                enabled: false,
                order,
                trigger_mode: src.trigger_mode,
                trigger_source: src.trigger_source,
                source_key: src.source_key,
                source_time: src.source_time,
                interval_ms: src.interval_ms,
                enter_delay_ms: src.enter_delay_ms,
                cancel_enabled: src.cancel_enabled,
                auto_enter_enabled: src.auto_enter_enabled,
                switch_keys: src.switch_keys.clone(),
                native_key_restore: src.native_key_restore,
            });
            cfg.normalize();
        }
    }
    persist_and_rebind(&state, &window, "mapping_duplicated");
    let ack = serde_json::json!({"type":"mvp_mapping_duplicated","ok":true,"id":new_id});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_mapping_reorder(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    ordered_ids: Vec<String>,
) {
    {
        let mut cfg = state.cfg.lock();
        for (i, oid) in ordered_ids.iter().enumerate() {
            if let Some(m) = cfg.mappings.iter_mut().find(|m| &m.id == oid) {
                m.order = i as u32;
            }
        }
        cfg.mappings.sort_by_key(|m| m.order);
    }
    persist_and_rebind(&state, &window, "mapping_reordered");
}

#[tauri::command]
pub fn cmd_mapping_set_group(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    group: String,
) {
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.group = if group.trim().is_empty() {
                "  ".into()
            } else {
                group
            };
        }
    }
    persist_and_rebind(&state, &window, "mapping_group_set");
}

#[tauri::command]
pub fn cmd_mapping_set_source_key(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    id: String,
    source_key: String,
) {
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == id) {
            m.source_key = source_key.trim().to_string();
            m.source_time = if m.source_key.is_empty() { String::new() } else { crate::config::now_source_time() };
        }
        cfg.normalize();
    }
    persist_and_rebind(&state, &window, "mapping_source_set");
    let ack = serde_json::json!({"type":"mvp_mapping_source_set","ok":true,"id":id,"sourceKey":source_key});
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_request_runtime(state: tauri::State<Arc<AppState>>, window: tauri::WebviewWindow) {
    push_runtime(&state, &window, "runtime_refresh", "");
}

#[tauri::command]
pub fn cmd_capture_source(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    mapping_id: String,
    raw_events: Vec<RawEvent>,
) {
    if raw_events.is_empty() {
        return;
    }
    let source = build_source_from_raw_events(raw_events);
    let captured = source
        .raw_events
        .first()
        .map(|r| canonical_trigger(&r.hotkey))
        .unwrap_or_else(|| "AutoTrigger".into());
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
            m.trigger_key = captured.clone();
            m.source_key = source
                .raw_events
                .first()
                .map(|r| crate::config::canonical_trigger(&r.hotkey))
                .unwrap_or_else(|| captured.clone());
            m.trigger_source = Some(source.clone());
            m.source_time = crate::config::now_source_time();
            m.label = format!("{} -> {}", m.trigger_key, m.target_key);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &mapping_id);
    }
    persist_and_rebind(&state, &window, "source_captured");
    let ack = serde_json::json!({
        "type": "mvp_source_captured",
        "mappingId": mapping_id,
        "key": captured,
        "source": source,
        "sourceTime": crate::config::now_source_time(),
    });
    window.emit("to_js", &ack).ok();
}

#[tauri::command]
pub fn cmd_frontend_keydown(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    key: String,
    mapping_id: String,
    mode: String,
) {
    if !*state.recording.lock() {
        return;
    }
    if key.trim().is_empty() {
        return;
    }

    let is_target = mode == "target";
    let mapping_id = mapping_id.clone();
    if !is_target {
        let physical = normalize_hardware_key(&key);
        handle_hardware_record_key(state.inner(), &window, &physical);
        return;
    }
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
            m.target_key = key.clone();
            m.label = format!("{}  ?{}", m.trigger_key, key);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &mapping_id);
    }

    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    persist_and_rebind(&state, &window, "recorded");

    let captured_key = if is_target {
        key
    } else {
        normalize_record_key(&key)
    };
    let ack = serde_json::json!({
        "type": "mvp_key_captured",
        "key": captured_key,
        "mappingId": mapping_id,
        "mode": mode,
    });
    window.emit("to_js", &ack).ok();
}

pub fn finish_hardware_capture(state: &AppState, window: &tauri::WebviewWindow, key: &str) {
    let target = state.recording_target.lock().clone();
    let Some(target) = target else {
        return;
    };

    let key = if matches!(target.mode, RecordMode::Trigger) {
        sanitize_trigger_capture(key)
    } else {
        key.to_string()
    };

    if matches!(target.mode, RecordMode::Trigger) && is_spurious_trigger_capture(&key) {
        return;
    }

    let physical_key = key.clone();
    let captured = if matches!(target.mode, RecordMode::Trigger) {
        normalize_record_key(&key)
    } else {
        key.to_string()
    };

    if matches!(target.mode, RecordMode::Trigger) {
        if !is_allowed_trigger(&captured) {
            let ack = serde_json::json!({
                "type": "mvp_record_rejected",
                "reason": "trigger_not_allowed",
                "key": captured,
            });
            window.emit("to_js", &ack).ok();
            return;
        }
        {
            let mut cfg = state.cfg.lock();
            apply_trigger_capture(&mut cfg, &target.mapping_id, &captured, &physical_key);
        }
    } else {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == target.mapping_id) {
            m.target_key = captured.clone();
            m.label = format!("{}  ?{}", m.trigger_key, captured);
        }
        cfg.normalize();
        enable_mapping_if_complete(&mut cfg, &target.mapping_id);
    }

    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    persist_and_rebind(state, window, "recorded");

    let mode = if matches!(target.mode, RecordMode::Target) {
        "target"
    } else {
        "trigger"
    };
    let (display_key, target_key, trigger_source, source_key, source_time) = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(&target.mapping_id);
        if matches!(target.mode, RecordMode::Target) {
            (
                captured.clone(),
                mapping
                    .map(|m| m.target_key.clone())
                    .unwrap_or_else(|| captured.clone()),
                None,
                String::new(),
                String::new(),
            )
        } else {
            (
                mapping
                    .map(|m| m.trigger_key.clone())
                    .unwrap_or_else(|| captured.clone()),
                mapping
                    .map(|m| m.target_key.clone())
                    .unwrap_or_default(),
                mapping.and_then(|m| m.trigger_source.clone()),
                mapping.map(|m| m.source_key.clone()).unwrap_or_default(),
                mapping.map(|m| m.source_time.clone()).unwrap_or_default(),
            )
        }
    };
    let ack = serde_json::json!({
        "type": "mvp_key_captured",
        "key": display_key,
        "targetKey": target_key,
        "source": trigger_source,
        "sourceKey": source_key,
        "sourceTime": source_time,
        "mappingId": target.mapping_id,
        "mode": mode,
    });
    window.emit("to_js", &ack).ok();
}

///      WebView                            ?
#[tauri::command]
pub fn cmd_physical_trigger(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    key: String,
) {
    let key = key.trim();
    if key.is_empty() {
        return;
    }
    handle_physical_key(state.inner(), &window, key);
}

/// 测试发送目标键；直接返回结果 JSON。
#[tauri::command]
pub fn cmd_test_send(
    state: tauri::State<Arc<AppState>>,
    mapping_id: Option<String>,
    target_key: Option<String>,
) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "paused",
        });
    }
    if *state.recording.lock() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "recording",
        });
    }

    let (key, duration_ms, mapping_label) = {
        let cfg = state.cfg.lock();
        let duration_ms = cfg.key_press_duration_ms;
        let mut mapping_label = String::new();
        if let Some(ref id) = mapping_id {
            if let Some(m) = cfg.find_mapping_by_id(id) {
                mapping_label = m.display_label();
            }
        }
        let mut key = target_key
            .as_deref()
            .map(str::trim)
            .filter(|k| !k.is_empty())
            .map(str::to_string)
            .unwrap_or_default();
        if key.is_empty() {
            if let Some(ref id) = mapping_id {
                if let Some(m) = cfg.find_mapping_by_id(id) {
                    if !m.target_key.trim().is_empty() {
                        key = m.target_key.clone();
                    }
                }
            }
        }
        (key, duration_ms, mapping_label)
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "no_target",
            "mappingLabel": mapping_label,
        });
    }

    if parse_chord(key.trim()).is_err() {
        return serde_json::json!({
            "type": "mvp_test_sent",
            "ok": false,
            "reason": "invalid_key",
            "key": key,
            "mappingLabel": mapping_label,
        });
    }

    let ok = crate::keyboard::send_chord(&key, duration_ms);
    serde_json::json!({
        "type": "mvp_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
        "mappingLabel": mapping_label,
    })
}

#[tauri::command]
pub fn cmd_mapping_conflicts(
    state: tauri::State<Arc<AppState>>,
    mapping_id: Option<String>,
) -> Vec<ConflictReport> {
    let cfg = state.cfg.lock();
    if let Some(id) = mapping_id {
        cfg.conflicts_for_mapping(&id)
    } else {
        cfg.conflict_report()
    }
}

#[tauri::command]
pub fn cmd_reload_latest(app: tauri::AppHandle) {
    let exe = std::env::current_exe().ok();
    std::thread::spawn(move || {
        if let Some(exe) = exe {
            let _ = std::process::Command::new(exe).spawn();
        }
        app.exit(0);
    });
}
#[tauri::command]
pub fn cmd_window_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn cmd_window_close(window: tauri::WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
pub fn cmd_sync_theme_backdrop(window: tauri::WebviewWindow, theme: String) {
    crate::backdrop::sync_backdrop_theme(&window, &theme);
}

#[tauri::command]
pub fn cmd_tray_menu_ready(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) {
    let json = crate::tray::tray_menu_init_json(state.inner());
    window
        .eval(&format!("window.__tray_init__({json})"))
        .ok();
}

#[tauri::command]
pub fn cmd_tray_action(
    app: tauri::AppHandle,
    state: tauri::State<Arc<AppState>>,
    action: String,
    payload: Option<serde_json::Value>,
) {
    crate::tray::handle_tray_action(&app, state.inner(), &action, payload);
}

#[tauri::command]
pub fn cmd_tray_menu_present(
    window: tauri::WebviewWindow,
    width: f64,
    height: f64,
    cursor_x: i32,
    cursor_y: i32,
) -> Result<(), String> {
    crate::tray::present_tray_menu(&window, width, height, cursor_x, cursor_y)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_autostart_get(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_autostart_set(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn cmd_mic_list() -> Result<Vec<crate::audio_win::MicDeviceInfo>, String> {
    crate::audio_win::list_input_devices()
}

#[tauri::command]
pub fn cmd_mic_set_default(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] deviceId: Option<String>,
    device_id: Option<String>,
) -> Result<(), String> {
    let id = device_id
        .or(deviceId)
        .ok_or_else(|| "missing device id".to_string())?;
    crate::audio_win::set_default_input_device(&id)?;
    let cfg = state.cfg.lock().voice_sapi.clone();
    if cfg.enabled {
        crate::voice_sapi_runtime::voice_sapi_start(&state, &cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub fn cmd_mic_monitor_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] deviceId: Option<String>,
    device_id: Option<String>,
) -> Result<(), String> {
    // Voice engines hold the default capture device; starting a second stream freezes/hangs WASAPI.
    if state.voice_vosk.lock().is_some() || state.voice_sapi.lock().is_some() {
        return Ok(());
    }
    crate::audio_win::start_mic_monitor(
        app,
        window,
        device_id.or(deviceId),
        &state.mic_monitor,
        &state.mic_level,
    )
}

#[tauri::command]
pub fn cmd_mic_get_level(state: tauri::State<Arc<AppState>>) -> crate::audio_win::MicLevelSnapshot {
    state.mic_level.snapshot()
}

#[tauri::command]
pub fn cmd_mic_monitor_stop(state: tauri::State<Arc<AppState>>) {
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
}

#[tauri::command]
pub fn cmd_voice_sapi_status(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::voice_sapi_runtime::voice_sapi_status(&state)
}

#[tauri::command]
pub fn cmd_voice_sapi_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    crate::voice_sapi_runtime::voice_sapi_set_enabled(&state, &window, enabled)
}

#[tauri::command]
pub fn cmd_voice_sapi_set_phrases(
    state: tauri::State<Arc<AppState>>,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    crate::voice_sapi_runtime::voice_sapi_set_phrases(&state, phrases)
}

#[tauri::command]
pub fn cmd_voice_sapi_set_min_confidence(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] minConfidence: Option<f32>,
    min_confidence: Option<f32>,
) -> Result<serde_json::Value, String> {
    let value = min_confidence
        .or(minConfidence)
        .ok_or_else(|| "missing min confidence".to_string())?;
    crate::voice_sapi_runtime::voice_sapi_set_min_confidence(&state, value)
}

#[tauri::command]
pub fn cmd_voice_sapi_test_send(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::voice_sapi_runtime::voice_sapi_test_send(&state)
}

fn app_resource_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path().resource_dir().ok()
}

#[tauri::command]
pub fn cmd_voice_vosk_status(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
) -> serde_json::Value {
    crate::voice_vosk_runtime::voice_vosk_status(&state, app_resource_dir(&app))
}

#[tauri::command]
pub fn cmd_voice_vosk_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_enabled(
        &state,
        &window,
        enabled,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    phrases: Vec<String>,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_phrases(&state, phrases, app_resource_dir(&app))
}

#[tauri::command]
pub fn cmd_voice_vosk_set_model_preset(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    preset: String,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_model_preset(
        &state,
        preset,
        app_resource_dir(&app),
    )
}

#[tauri::command]
pub fn cmd_voice_vosk_set_model_path(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    crate::voice_vosk_runtime::voice_vosk_set_model_path(&state, path, app_resource_dir(&app))
}

#[tauri::command]
pub fn cmd_voice_vosk_test_send(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::voice_vosk_runtime::voice_vosk_test_send(&state)
}

#[tauri::command]
pub fn cmd_voice_end_status(state: tauri::State<Arc<AppState>>) -> serde_json::Value {
    crate::voice_end_runtime::voice_end_status(&state)
}

#[tauri::command]
pub fn cmd_voice_end_set_enabled(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let status = crate::voice_end_runtime::voice_end_set_enabled(&state, &window, enabled);
    if enabled {
        let cfg = state.cfg.lock();
        if cfg.voice_vosk.enabled {
            let vosk = cfg.voice_vosk.clone();
            drop(cfg);
            crate::voice_vosk_runtime::spawn_voice_vosk_start(
                Arc::clone(&state),
                vosk,
                app_resource_dir(&app),
            );
        }
    } else if state.cfg.lock().voice_vosk.enabled {
        let vosk = state.cfg.lock().voice_vosk.clone();
        crate::voice_vosk_runtime::spawn_voice_vosk_start(
            Arc::clone(&state),
            vosk,
            app_resource_dir(&app),
        );
    }
    Ok(status)
}

#[tauri::command]
pub fn cmd_voice_end_set_auto_send(
    state: tauri::State<Arc<AppState>>,
    enabled: bool,
) -> serde_json::Value {
    crate::voice_end_runtime::voice_end_set_auto_send(&state, enabled)
}

#[tauri::command]
pub fn cmd_voice_end_set_commit_delay(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] commitDelayMs: Option<u32>,
    commit_delay_ms: Option<u32>,
) -> serde_json::Value {
    let delay = commit_delay_ms.or(commitDelayMs).unwrap_or(4000);
    crate::voice_end_runtime::voice_end_set_commit_delay(&state, delay)
}

#[tauri::command]
pub fn cmd_voice_end_set_phrases(
    state: tauri::State<Arc<AppState>>,
    app: tauri::AppHandle,
    #[allow(non_snake_case)] phrasesZh: Option<Vec<String>>,
    phrases_zh: Option<Vec<String>>,
    #[allow(non_snake_case)] phrasesEn: Option<Vec<String>>,
    phrases_en: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let zh = phrases_zh.or(phrasesZh).unwrap_or_default();
    let en = phrases_en.or(phrasesEn).unwrap_or_default();
    let status = crate::voice_end_runtime::voice_end_set_phrases(&state, zh, en);
    let cfg = state.cfg.lock();
    if cfg.voice_vosk.enabled && cfg.voice_end.enabled {
        let vosk = cfg.voice_vosk.clone();
        drop(cfg);
        crate::voice_vosk_runtime::spawn_voice_vosk_start(
            Arc::clone(&state),
            vosk,
            app_resource_dir(&app),
        );
    }
    Ok(status)
}

#[tauri::command]
pub fn cmd_voice_end_test_stop(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_end_runtime::test_stop_dictation(&state, &window)
}

#[tauri::command]
pub fn cmd_voice_end_test_commit(
    state: tauri::State<Arc<AppState>>,
    window: tauri::WebviewWindow,
) -> serde_json::Value {
    crate::voice_end_runtime::test_commit_key(&state, &window)
}
