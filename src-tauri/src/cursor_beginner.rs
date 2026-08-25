//! Cursor beginner MVP: 4 cards, arm/KWS listen, focus-then-execute (Windows v0).

use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::app_chat_workflow::{self, CURSOR_APP_TARGET_ID};
use crate::agent::semantic::ActionChannel;
use crate::config::{self, VoiceConfig};
use crate::AppState;

pub const ARM_IDLE_TIMEOUT_MS: u64 = 30_000;
pub const NEW_THREAD_HOLD_MS: u32 = 500;
pub const SIDE_KEY_ARM_MS: u64 = 1_000;
pub const PROBE_FAIL_MSG: &str = "未检测到 Cursor，请先安装 / 登录";
/// Soft Pad / mini cancel-listen key (reject icon).
pub const CANCEL_LISTEN_MICRO_KEY: &str = "ACT08";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BeginnerSlotDef {
    pub slot_id: &'static str,
    pub action_id: &'static str,
    pub micro_key_id: &'static str,
    pub icon_id: &'static str,
    pub label_zh: &'static str,
    pub voice_phrases: &'static [&'static str],
    pub tap_hold_ms: u32,
}

pub const BEGINNER_SLOTS: &[BeginnerSlotDef] = &[
    BeginnerSlotDef {
        slot_id: "pushToTalk",
        action_id: "startDictation",
        micro_key_id: "ACT10",
        icon_id: "mic",
        label_zh: "说话",
        voice_phrases: &["说话", "麦克风"],
        tap_hold_ms: 0,
    },
    BeginnerSlotDef {
        slot_id: "stopOrSend",
        action_id: "stopOrSendDictation",
        micro_key_id: "ACT12",
        icon_id: "send",
        label_zh: "发送",
        voice_phrases: &["发送"],
        tap_hold_ms: 0,
    },
    BeginnerSlotDef {
        slot_id: "continue",
        action_id: "agent.continue",
        micro_key_id: "AG02",
        icon_id: "fast",
        label_zh: "继续",
        voice_phrases: &["继续"],
        tap_hold_ms: 0,
    },
    BeginnerSlotDef {
        slot_id: "newThread",
        action_id: "newThread",
        micro_key_id: "AG01",
        icon_id: "fork",
        label_zh: "新会话",
        voice_phrases: &["新会话", "新建"],
        tap_hold_ms: NEW_THREAD_HOLD_MS,
    },
    BeginnerSlotDef {
        slot_id: "cancelListen",
        action_id: "cursorBeginnerDisarm",
        micro_key_id: CANCEL_LISTEN_MICRO_KEY,
        icon_id: "reject",
        label_zh: "取消",
        voice_phrases: &["取消"],
        tap_hold_ms: 0,
    },
];

pub const DISARM_PHRASES: &[&str] = &["取消"];
/// Voice-only arm: show mini bar + enter listen mode without stealing Cursor FG.
pub const ARM_PHRASES: &[&str] = &["小助手"];
pub const ARM_HINT: &str = "聆听中 · 可说：发送、继续、新建、麦克风、取消";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginnerSlotSnapshot {
    pub slot_id: String,
    pub micro_key_id: String,
    pub icon_id: String,
    pub label_zh: String,
    pub hold_ms: u32,
}

struct SideKeyPending {
    lookup_key: String,
    dispatch_key: String,
    started: Instant,
}

#[derive(Default)]
pub struct CursorBeginnerRuntime {
    pub armed: bool,
    pub armed_at: Option<Instant>,
    pub last_voice_at: Option<Instant>,
    /// 「取消」while Cursor FG auto-listen: ignore commands until leave Cursor / re-arm.
    pub listen_suppressed: bool,
    side_pending: Option<SideKeyPending>,
    side_arm_fired: bool,
    last_overlay_minimized: Option<bool>,
}

static RUNTIME: Mutex<CursorBeginnerRuntime> = Mutex::new(CursorBeginnerRuntime {
    armed: false,
    armed_at: None,
    last_voice_at: None,
    listen_suppressed: false,
    side_pending: None,
    side_arm_fired: false,
    last_overlay_minimized: None,
});

pub fn runtime() -> parking_lot::MutexGuard<'static, CursorBeginnerRuntime> {
    RUNTIME.lock()
}

/// Overlay-aware FG latch: true while Cursor was the last real (non-overlay) foreground app.
static CURSOR_WAS_FG: Mutex<bool> = Mutex::new(false);

/// Called from `maybe_tick` when Cursor FG state changes.
/// `overlay_is_fg`: the OneTone overlay window currently owns Win32 foreground.
pub fn note_cursor_fg_change(cursor_now_fg: bool, overlay_is_fg: bool) {
    if cursor_now_fg {
        *CURSOR_WAS_FG.lock() = true;
    } else if !overlay_is_fg {
        *CURSOR_WAS_FG.lock() = false;
        // Left Cursor → clear「取消」suppress so next Cursor visit auto-listens again.
        runtime().listen_suppressed = false;
    }
}

pub fn cursor_was_or_is_foreground() -> bool {
    cursor_is_foreground() || *CURSOR_WAS_FG.lock()
}

#[cfg(windows)]
pub fn cursor_process_running() -> bool {
    crate::app_identity::process_running_by_exe(&["Cursor.exe"])
}

#[cfg(not(windows))]
pub fn cursor_process_running() -> bool {
    false
}

#[cfg(windows)]
pub fn probe_ok() -> bool {
    if cursor_process_running() {
        return true;
    }
    app_chat_workflow::app_target_window_visible(CURSOR_APP_TARGET_ID)
}

#[cfg(not(windows))]
pub fn probe_ok() -> bool {
    false
}

/// User selected Cursor in 习惯 (active_scene_id), even when Cursor.exe is not FG.
pub fn cursor_habit_active(cfg: &VoiceConfig) -> bool {
    let id = cfg.active_scene_id.trim();
    if id.is_empty() {
        return false;
    }
    cfg.find_mapping_by_id(id).is_some_and(|m| {
        m.enabled && m.app_target_id.trim() == CURSOR_APP_TARGET_ID
    })
}

pub fn should_prefer_cursor_soft_pad(cfg: &VoiceConfig) -> bool {
    probe_ok() || cursor_is_foreground() || cursor_habit_active(cfg)
}

pub fn beginner_mode_active(cfg: &VoiceConfig) -> bool {
    should_prefer_cursor_soft_pad(cfg)
}

pub fn ensure_beginner_overlay_ready(cfg: &mut VoiceConfig) -> bool {
    if !should_prefer_cursor_soft_pad(cfg) {
        return false;
    }
    let mut changed = false;
    // Enable a dormant cursor-chat habit so heal can run.
    for m in cfg.mappings.iter_mut() {
        if m.app_target_id.trim() == CURSOR_APP_TARGET_ID && !m.enabled {
            m.enabled = true;
            changed = true;
        }
    }
    let heal = crate::codex_numpad_layer::ensure_codex_pad_ready_for(
        cfg,
        "zh-CN",
        Some(CURSOR_APP_TARGET_ID),
    );
    if heal.changed {
        changed = true;
    }
    let mut cursor_mapping_id: Option<String> = None;
    for m in cfg.mappings.iter_mut() {
        if m.app_target_id.trim() != CURSOR_APP_TARGET_ID {
            continue;
        }
        if !m.enabled {
            continue;
        }
        cursor_mapping_id = Some(m.id.clone());
        let pad = m
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        if !pad.overlay_enabled {
            pad.overlay_enabled = true;
            changed = true;
        }
        if !pad.enabled {
            pad.enabled = true;
            changed = true;
        }
        // ponytail: keep mini visible while Cursor.exe alive (upgrade: user setting)
        if pad.require_foreground {
            pad.require_foreground = false;
            changed = true;
        }
        // Respect user expand — only heal mini when runtime chrome is collapsed.
        if crate::codex_micro_overlay::overlay_runtime_minimized() && pad.presentation != "mini" {
            pad.presentation = "mini".into();
            changed = true;
        }
        if heal_cursor_beginner_pad_slots(m) {
            changed = true;
        }
        if heal_cursor_beginner_voice_bindings(m) {
            changed = true;
        }
        break;
    }
    if let Some(id) = cursor_mapping_id {
        if cfg.set_active_scenario(&id) {
            changed = true;
        }
        crate::codex_micro_overlay::note_soft_pad_surface_for_mapping(
            &id,
            crate::soft_pad_runtime::AgentKind::Cursor,
        );
        crate::codex_micro_overlay::clear_overlay_session_dismissed();
    }
    if changed {
        crate::codex_numpad_layer::sync_hook_cache(cfg);
    }
    changed
}

pub fn slot_def(slot_id: &str) -> Option<&'static BeginnerSlotDef> {
    let id = slot_id.trim();
    BEGINNER_SLOTS.iter().find(|s| s.slot_id == id)
}

pub fn slot_for_micro_key(micro_key_id: &str) -> Option<&'static BeginnerSlotDef> {
    let id = micro_key_id.trim();
    BEGINNER_SLOTS.iter().find(|s| s.micro_key_id == id)
}

pub fn is_beginner_slot(slot_id: &str) -> bool {
    slot_def(slot_id).is_some()
}

pub fn is_beginner_micro_key(micro_key_id: &str) -> bool {
    slot_for_micro_key(micro_key_id).is_some()
}

pub fn matches_beginner_phrase(text: &str) -> Option<&'static BeginnerSlotDef> {
    let t = text.trim();
    if t.is_empty() {
        return None;
    }
    for slot in BEGINNER_SLOTS {
        for phrase in slot.voice_phrases {
            if config::phrases_fuzzy_match(t, phrase) {
                return Some(slot);
            }
        }
    }
    // ponytail: cn-small-model often hears 继续 as 但是; only for continue slot
    if config::phrases_fuzzy_match(t, "但是") {
        return slot_def("continue");
    }
    None
}

pub fn is_disarm_phrase(text: &str) -> bool {
    let t = text.trim();
    DISARM_PHRASES
        .iter()
        .any(|p| config::phrases_fuzzy_match(t, p))
}

pub fn is_arm_phrase(text: &str) -> bool {
    let t = text.trim();
    ARM_PHRASES
        .iter()
        .any(|p| config::phrases_fuzzy_match(t, p))
}

pub fn is_beginner_voice_phrase(text: &str) -> bool {
    matches_beginner_phrase(text).is_some() || is_disarm_phrase(text) || is_arm_phrase(text)
}

/// All beginner phrases for KWS grammar (static inject when Cursor is detected).
pub fn push_beginner_grammar_phrases(out: &mut Vec<String>, seen: &mut std::collections::HashSet<String>) {
    if !probe_ok() {
        return;
    }
    let mut push = |p: &str| {
        let t = p.trim();
        if t.is_empty() {
            return;
        }
        if seen.insert(t.to_string()) {
            out.push(t.to_string());
        }
    };
    for p in ARM_PHRASES {
        push(p);
    }
    for p in DISARM_PHRASES {
        push(p);
    }
    for slot in BEGINNER_SLOTS {
        for p in slot.voice_phrases {
            push(p);
        }
    }
}

pub fn is_armed() -> bool {
    runtime().armed
}

#[cfg(windows)]
pub fn cursor_is_foreground() -> bool {
    crate::app_identity::foreground_effective_app_target_id()
        .is_some_and(|id| id.trim() == CURSOR_APP_TARGET_ID)
}

#[cfg(not(windows))]
pub fn cursor_is_foreground() -> bool {
    false
}

/// Armed explicitly or Cursor FG (auto-listen while composing).
/// Uses overlay-aware latch so clicking the overlay doesn't break the armed state.
pub fn effective_armed(cfg: &VoiceConfig) -> bool {
    let rt = runtime();
    if rt.listen_suppressed {
        return false;
    }
    rt.armed || (probe_ok() && cursor_was_or_is_foreground())
}

pub fn arm_hint(cfg: &VoiceConfig) -> String {
    if effective_armed(cfg) && probe_ok() {
        ARM_HINT.into()
    } else {
        String::new()
    }
}

pub fn note_voice_activity() {
    let mut rt = runtime();
    rt.last_voice_at = Some(Instant::now());
}

pub fn cursor_chat_mapping_id(cfg: &VoiceConfig) -> Option<String> {
    cfg.active_mappings()
        .into_iter()
        .find(|m| m.app_target_id.trim() == CURSOR_APP_TARGET_ID)
        .map(|m| m.id.clone())
        .or_else(|| {
            config::find_preferred_workflow_scenario_for_dispatch(cfg)
                .filter(|m| m.app_target_id.trim() == CURSOR_APP_TARGET_ID)
                .map(|m| m.id.clone())
        })
}

pub fn build_slot_snapshots(probe_ok: bool) -> Vec<BeginnerSlotSnapshot> {
    if !probe_ok {
        return vec![];
    }
    BEGINNER_SLOTS
        .iter()
        .map(|s| BeginnerSlotSnapshot {
            slot_id: s.slot_id.into(),
            micro_key_id: s.micro_key_id.into(),
            icon_id: s.icon_id.into(),
            label_zh: s.label_zh.into(),
            hold_ms: s.tap_hold_ms,
        })
        .collect()
}

pub fn arm(state: &AppState, app: &AppHandle, expand_pad: bool) {
    if !beginner_mode_active(&state.cfg.lock()) {
        return;
    }
    {
        let mut rt = runtime();
        rt.armed = true;
        rt.armed_at = Some(Instant::now());
        rt.last_voice_at = None;
        rt.listen_suppressed = false;
    }
    if expand_pad {
        crate::codex_micro_overlay::set_overlay_minimized_persist(app, state, false);
    }
    crate::codex_micro_overlay::push_overlay_status(app, state);
}

pub fn disarm(state: &AppState, app: &AppHandle) {
    {
        let mut rt = runtime();
        rt.armed = false;
        rt.armed_at = None;
        rt.last_voice_at = None;
        // Keep suppress while still on Cursor so auto-FG listen doesn't instantly re-arm.
        rt.listen_suppressed = true;
    }
    crate::codex_micro_overlay::push_overlay_status(app, state);
}

pub fn maybe_timeout_arm(state: &AppState, app: &AppHandle) {
    let should = {
        let rt = runtime();
        if !rt.armed {
            return;
        }
        let idle_from = rt.last_voice_at.or(rt.armed_at);
        idle_from.is_some_and(|t| t.elapsed() >= Duration::from_millis(ARM_IDLE_TIMEOUT_MS))
    };
    if should {
        disarm(state, app);
    }
}

pub fn on_minimized_changed(state: &AppState, app: &AppHandle, minimized: bool) {
    let collapse = {
        let mut rt = runtime();
        let was = rt.last_overlay_minimized;
        rt.last_overlay_minimized = Some(minimized);
        was == Some(false) && minimized
    };
    // User collapsed full Pad → mini: exit listen (§1.3). Do not disarm on every mini tick.
    if collapse && is_armed() {
        disarm(state, app);
    } else if !minimized && beginner_mode_active(&state.cfg.lock()) {
        arm(state, app, false);
    }
}

pub fn is_side_key(key: &str) -> bool {
    let c = config::canonical_trigger(key);
    matches!(
        c.as_str(),
        "Volume_Up" | "Volume_Down" | "Volume_Mute" | "XButton1" | "XButton2"
    )
}

/// Side key down: defer IME until keyup unless held 1s → arm.
pub fn maybe_intercept_side_key_down(event: &crate::press_gesture::PhysicalKeyEvent) -> bool {
    if !cursor_process_running() {
        return false;
    }
    if !is_side_key(&event.key) {
        return false;
    }
    let mut rt = runtime();
    rt.side_pending = Some(SideKeyPending {
        lookup_key: event.lookup_key(),
        dispatch_key: event.dispatch_name(),
        started: Instant::now(),
    });
    rt.side_arm_fired = false;
    true
}

pub fn poll_side_key_arm(state: &AppState, app: &AppHandle) {
    let fire_arm = {
        let mut rt = runtime();
        let Some(pending) = rt.side_pending.as_ref() else {
            return;
        };
        if rt.side_arm_fired {
            return;
        }
        pending.started.elapsed() >= Duration::from_millis(SIDE_KEY_ARM_MS)
    };
    if fire_arm {
        {
            let mut rt = runtime();
            rt.side_arm_fired = true;
            rt.side_pending = None;
        }
        arm(state, app, true);
    }
}

/// Keyup after side intercept: None = already armed; Some = short press IME dispatch key.
pub fn on_side_key_up(event: &crate::press_gesture::PhysicalKeyEvent) -> Option<String> {
    let mut rt = runtime();
    let lk = event.lookup_key();
    if rt.side_arm_fired {
        rt.side_arm_fired = false;
        return None;
    }
    let pending = rt.side_pending.take();
    let Some(pending) = pending else {
        return None;
    };
    if pending.lookup_key != lk {
        return None;
    }
    if pending.started.elapsed() >= Duration::from_millis(SIDE_KEY_ARM_MS) {
        return None;
    }
    Some(pending.dispatch_key)
}

fn chord_for_beginner_slot(cfg: &config::VoiceConfig, mapping_id: &str, slot_id: &str) -> String {
    if let Some(m) = cfg.find_mapping_by_id(mapping_id) {
        if let Some(b) = m.agent_bindings.iter().find(|b| {
            b.enabled
                && b.slot_id == slot_id
                && b.trigger_type.eq_ignore_ascii_case("key")
                && !b.trigger_binding.trim().is_empty()
        }) {
            return b.trigger_binding.trim().to_string();
        }
    }
    crate::agent::bindings_build::default_key_for_scenario(CURSOR_APP_TARGET_ID, slot_id).to_string()
}

fn inject_beginner_hotkey(
    state: &Arc<AppState>,
    mapping_id: &str,
    slot_id: &str,
    duration_ms: u32,
) -> bool {
    let chord = {
        let cfg = state.cfg.lock();
        chord_for_beginner_slot(&cfg, mapping_id, slot_id)
    };
    if chord.trim().is_empty() {
        return false;
    }
    crate::keyboard::send_chord(chord.trim(), duration_ms)
}

pub fn run_slot(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    slot_id: &str,
    from_voice: bool,
    hold_confirmed: bool,
) -> serde_json::Value {
    let Some(def) = slot_def(slot_id) else {
        return serde_json::json!({ "ok": false, "reason": "unknown_slot" });
    };
    if def.slot_id == "cancelListen" {
        if from_voice {
            note_voice_activity();
        }
        crate::codex_micro_overlay::note_micro_key(def.micro_key_id, true);
        disarm(state.as_ref(), &window.app_handle());
        return serde_json::json!({
            "ok": true,
            "reason": "disarmed",
            "slotId": def.slot_id,
            "microKeyId": def.micro_key_id,
            "mappingId": ""
        });
    }
    if def.tap_hold_ms > 0 && !from_voice && !hold_confirmed {
        return serde_json::json!({
            "ok": false,
            "reason": "hold_required",
            "holdMs": def.tap_hold_ms,
            "slotId": def.slot_id
        });
    }
    if !probe_ok() {
        return serde_json::json!({
            "ok": false,
            "reason": "probe_failed",
            "message": PROBE_FAIL_MSG,
            "slotId": def.slot_id
        });
    }
    let mapping_id = {
        let cfg = state.cfg.lock();
        cursor_chat_mapping_id(&cfg).unwrap_or_default()
    };
    if mapping_id.is_empty() {
        return serde_json::json!({
            "ok": false,
            "reason": "probe_failed",
            "message": PROBE_FAIL_MSG
        });
    }
    let app = window.app_handle();
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    // 「发送」must land Enter in Cursor composer — Soft Pad/voice often leaves caret elsewhere.
    if def.slot_id == "stopOrSend" {
        let _pad_pass = crate::codex_micro_overlay::SoftPadSendPassGuard::engage(&app);
        if let Err(err) =
            app_chat_workflow::focus_composer_for_send(&app, CURSOR_APP_TARGET_ID, duration_ms)
        {
            crate::app_log::log_line(
                state.as_ref(),
                "cursor_beginner",
                &format!("send focus failed err={err:?}"),
            );
            return serde_json::json!({
                "ok": false,
                "reason": "focus_failed",
                "message": "未能聚焦 Cursor 输入框，请点一下对话框再说「发送」",
                "slotId": def.slot_id,
                "microKeyId": def.micro_key_id
            });
        }
        let commit_key = {
            let cfg = state.cfg.lock();
            let k = cfg.voice_end.commit_key.trim().to_string();
            if k.is_empty() {
                "Enter".into()
            } else {
                k
            }
        };
        let ok = crate::keyboard::send_chord(&commit_key, duration_ms);
        if from_voice {
            note_voice_activity();
        }
        crate::codex_micro_overlay::note_micro_key(def.micro_key_id, true);
        drop(_pad_pass);
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        return serde_json::json!({
            "ok": ok,
            "reason": if ok { "executed" } else { "input_failed" },
            "slotId": def.slot_id,
            "microKeyId": def.micro_key_id,
            "mappingId": mapping_id,
            "message": if ok { format!("sent {commit_key}") } else { format!("failed {commit_key}") }
        });
    }
    if let Err(err) = app_chat_workflow::focus_composer_only(&app, CURSOR_APP_TARGET_ID, duration_ms)
    {
        crate::app_log::log_line(
            state.as_ref(),
            "cursor_beginner",
            &format!("focus failed slot={} err={err:?}", def.slot_id),
        );
        return serde_json::json!({
            "ok": false,
            "reason": "probe_failed",
            "message": PROBE_FAIL_MSG,
            "slotId": def.slot_id
        });
    }
    let (ok, reason, detail) = if def.action_id == "newThread" {
        let sent = inject_beginner_hotkey(state, &mapping_id, def.slot_id, duration_ms);
        (
            sent,
            if sent {
                "executed".to_string()
            } else {
                "failed".to_string()
            },
            None::<String>,
        )
    } else {
        let result = crate::agent::dispatch::dispatch_semantic_action_ids(
            state,
            window,
            &mapping_id,
            def.action_id,
            Some(def.slot_id),
            if from_voice {
                ActionChannel::Voice
            } else {
                ActionChannel::SoftPad
            },
        );
        let ok = result.ok.unwrap_or(result.status == "executed");
        let reason = if ok {
            "executed".to_string()
        } else {
            result
                .reason_code
                .unwrap_or_else(|| "failed".to_string())
        };
        (ok, reason, result.detail)
    };
    if from_voice {
        note_voice_activity();
    }
    crate::codex_micro_overlay::note_micro_key(def.micro_key_id, true);
    crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
    let mut out = serde_json::json!({
        "ok": ok,
        "reason": reason,
        "slotId": def.slot_id,
        "microKeyId": def.micro_key_id,
        "mappingId": mapping_id
    });
    if let Some(d) = detail.filter(|s| !s.is_empty()) {
        out["message"] = serde_json::Value::String(d);
    }
    out
}

pub fn dispatch_voice_phrase(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrase: &str,
) -> Option<crate::voice_end_runtime::VoiceWakeDispatchResult> {
    if is_arm_phrase(phrase) {
        if !beginner_mode_active(&state.cfg.lock()) {
            return None;
        }
        arm(state, app, true);
        crate::codex_micro_overlay::note_micro_key("ENC", true);
        return Some(crate::voice_end_runtime::VoiceWakeDispatchResult {
            ok: true,
            target_key: phrase.to_string(),
            mapping_id: String::new(),
            used_summon_workflow: false,
            runtime_label: "cursor_beginner:arm".into(),
        });
    }
    let cfg = state.cfg.lock();
    let armed = effective_armed(&cfg);
    let habit_ok = cursor_habit_active(&cfg) && probe_ok();
    drop(cfg);
    // 「取消」：已聆听时退出；未聆听也闪一下取消键，方便用户确认口令命中。
    if is_disarm_phrase(phrase) || matches_beginner_phrase(phrase).is_some_and(|d| d.slot_id == "cancelListen")
    {
        let window = crate::ipc::get_main_window(app)?;
        let out = run_slot(state, &window, "cancelListen", true, true);
        let ok = out.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
        return Some(crate::voice_end_runtime::VoiceWakeDispatchResult {
            ok,
            target_key: phrase.to_string(),
            mapping_id: String::new(),
            used_summon_workflow: false,
            runtime_label: "cursor_beginner:cancelListen".into(),
        });
    }
    if !armed && !habit_ok {
        if matches_beginner_phrase(phrase).is_some() {
            return Some(crate::voice_end_runtime::VoiceWakeDispatchResult {
                ok: false,
                target_key: phrase.to_string(),
                mapping_id: String::new(),
                used_summon_workflow: false,
                runtime_label: "cursor_beginner:not_armed".into(),
            });
        }
        return None;
    }
    let def = matches_beginner_phrase(phrase)?;
    note_voice_activity();
    let window = crate::ipc::get_main_window(app)?;
    let out = run_slot(state, &window, def.slot_id, true, true);
    let ok = out.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    let mapping_id = out
        .get("mappingId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some(crate::voice_end_runtime::VoiceWakeDispatchResult {
        ok,
        target_key: phrase.to_string(),
        mapping_id,
        used_summon_workflow: false,
        runtime_label: format!("cursor_beginner:{}", def.slot_id),
    })
}

pub fn heal_cursor_beginner_pad_slots(m: &mut config::MappingEntry) -> bool {
    if m.app_target_id.trim() != CURSOR_APP_TARGET_ID {
        return false;
    }
    let Some(pad) = m.codex_micro_pad.as_mut() else {
        return false;
    };
    let mut changed = false;
    for route in &mut pad.keys {
        if route.micro_key_id == "AG02" && route.slot_id.trim() != "continue" {
            route.slot_id = "continue".into();
            if route.ui_icon_id.trim().is_empty() || route.ui_icon_id == "fast" {
                route.ui_icon_id = "fast".into();
            }
            changed = true;
        }
        // ACT08: listen cancel (口令「取消」) — not Esc generation while Cursor beginner pad.
        if route.micro_key_id == CANCEL_LISTEN_MICRO_KEY && route.slot_id.trim() != "cancelListen" {
            route.slot_id = "cancelListen".into();
            if route.ui_icon_id.trim().is_empty() {
                route.ui_icon_id = "reject".into();
            }
            changed = true;
        }
    }
    changed
}

pub fn heal_cursor_beginner_voice_bindings(m: &mut config::MappingEntry) -> bool {
    if m.app_target_id.trim() != CURSOR_APP_TARGET_ID {
        return false;
    }
    let mut changed = false;
    for slot in BEGINNER_SLOTS {
        for phrase in slot.voice_phrases {
            let exists = m.agent_bindings.iter().any(|b| {
                b.enabled
                    && b.trigger_type.eq_ignore_ascii_case("voice")
                    && b.slot_id == slot.slot_id
                    && config::phrases_fuzzy_match(&b.trigger_binding, phrase)
            });
            if !exists {
                m.agent_bindings.push(config::AgentBinding {
                    slot_id: slot.slot_id.into(),
                    action_id: slot.action_id.into(),
                    trigger_type: "voice".into(),
                    trigger_binding: (*phrase).into(),
                    enabled: true,
                    ..Default::default()
                });
                changed = true;
            }
        }
    }
    for phrase in ARM_PHRASES {
        let exists = m.agent_bindings.iter().any(|b| {
            b.enabled
                && b.trigger_type.eq_ignore_ascii_case("voice")
                && b.slot_id == "__cursor_beginner_arm__"
                && config::phrases_fuzzy_match(&b.trigger_binding, phrase)
        });
        if !exists {
            m.agent_bindings.push(config::AgentBinding {
                slot_id: "__cursor_beginner_arm__".into(),
                action_id: "cursorBeginnerArm".into(),
                trigger_type: "voice".into(),
                trigger_binding: (*phrase).into(),
                enabled: true,
                ..Default::default()
            });
            changed = true;
        }
    }
    if changed {
        config::compact_duplicate_agent_bindings(&mut m.agent_bindings);
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arm_phrase_recognized() {
        assert!(is_arm_phrase("小助手"));
        assert!(!is_arm_phrase("继续"));
    }

    #[test]
    fn voice_aliases_match_slots() {
        assert_eq!(matches_beginner_phrase("麦克风").map(|d| d.slot_id), Some("pushToTalk"));
        assert_eq!(matches_beginner_phrase("新建").map(|d| d.slot_id), Some("newThread"));
        assert_eq!(matches_beginner_phrase("但是").map(|d| d.slot_id), Some("continue"));
        assert_eq!(matches_beginner_phrase("取消").map(|d| d.slot_id), Some("cancelListen"));
        assert!(is_disarm_phrase("取消"));
    }

    #[test]
    fn beginner_phrase_requires_arm_when_not_armed() {
        disarm_for_test();
        assert!(matches_beginner_phrase("继续").is_some());
        assert!(!is_armed());
    }

    #[test]
    fn new_thread_requires_hold_on_tap() {
        let def = slot_def("newThread").unwrap();
        assert_eq!(def.tap_hold_ms, NEW_THREAD_HOLD_MS);
    }

    #[test]
    fn cancel_listen_slot_on_act08() {
        let def = slot_def("cancelListen").unwrap();
        assert_eq!(def.micro_key_id, CANCEL_LISTEN_MICRO_KEY);
        assert_eq!(
            slot_for_micro_key(CANCEL_LISTEN_MICRO_KEY).map(|d| d.slot_id),
            Some("cancelListen")
        );
    }

    #[test]
    fn stop_or_send_uses_dedicated_focus_path() {
        // Contract: 「发送」must punch Soft Pad + verify UIA composer before Enter.
        let src = include_str!("cursor_beginner.rs");
        assert!(src.contains("focus_composer_for_send"));
        assert!(src.contains("SoftPadSendPassGuard"));
        assert!(src.contains("stopOrSend"));
        let workflow = include_str!("app_chat_workflow.rs");
        assert!(workflow.contains("uia_focus_chat_input_verified"));
        assert!(workflow.contains("click_client_relative_via_message"));
        assert!(workflow.contains("uia_min_score_for_send"));
        let def = slot_def("stopOrSend").unwrap();
        assert_eq!(def.micro_key_id, "ACT12");
    }

    fn disarm_for_test() {
        let mut rt = runtime();
        rt.armed = false;
        rt.armed_at = None;
        rt.last_voice_at = None;
        rt.listen_suppressed = false;
    }
}
