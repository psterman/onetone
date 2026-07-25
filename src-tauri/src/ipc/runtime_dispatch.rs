use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;

use crate::app_chat_workflow::{self, CODEX_APP_TARGET_ID};
use crate::app_identity;
use crate::config::{effective_mapping_for_trigger, is_app_scenario_mapping};
use crate::key_chord::{build_pressed_chord, chord_parts, is_modifier_name, is_modifier_only_chord};
use crate::press_gesture::parse_physical_event;
use crate::runtime_event;
use crate::AgentModifierTapState;
use crate::AppState;

/// Invalidates in-flight overlay hold start + LMB watcher (each down/up bumps).
static OVERLAY_PAD_HOLD_GEN: AtomicU64 = AtomicU64::new(0);

static OVERLAY_PAD_PTT_CHORD: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn overlay_pad_ptt_chord_slot() -> &'static Mutex<Option<String>> {
    OVERLAY_PAD_PTT_CHORD.get_or_init(|| Mutex::new(None))
}

fn set_overlay_pad_ptt_chord(chord: String) {
    let chord = chord.trim();
    if chord.is_empty() {
        return;
    }
    *overlay_pad_ptt_chord_slot().lock().unwrap() = Some(chord.to_string());
}

fn take_overlay_pad_ptt_chord() -> Option<String> {
    overlay_pad_ptt_chord_slot().lock().unwrap().take()
}

fn focus_codex_before_ptt_release() {
    #[cfg(windows)]
    {
        let _ = app_chat_workflow::quick_focus_codex_for_hold();
        std::thread::sleep(Duration::from_millis(35));
    }
}

/// Release simulated Ctrl+Shift+D to Codex — must focus Codex first (not overlay).
fn release_overlay_ptt_chord(state: &AppState) {
    focus_codex_before_ptt_release();
    if crate::voice_end_runtime::held_voice_chord(state).is_some() {
        let _ = crate::voice_end_runtime::end_hold_voice_chord(state);
        let _ = take_overlay_pad_ptt_chord();
        return;
    }
    if let Some(chord) = take_overlay_pad_ptt_chord() {
        let _ = crate::keyboard::release_chord(&chord);
        crate::send_guard::disarm();
    }
}

fn bump_overlay_pad_hold_gen() -> u64 {
    OVERLAY_PAD_HOLD_GEN.fetch_add(1, Ordering::SeqCst) + 1
}

fn overlay_pad_hold_gen() -> u64 {
    OVERLAY_PAD_HOLD_GEN.load(Ordering::SeqCst)
}

#[cfg(windows)]
fn primary_button_down() -> bool {
    use winapi::um::winuser::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { (GetAsyncKeyState(VK_LBUTTON as i32) as u16) & 0x8000 != 0 }
}

#[cfg(not(windows))]
fn primary_button_down() -> bool {
    false
}

fn finish_micro_pad_hold(state: &Arc<AppState>, app: &AppHandle, micro_key_id: &str) {
    bump_overlay_pad_hold_gen();
    *state.codex_numpad_hold_source.lock() = None;
    release_overlay_ptt_chord(state.as_ref());
    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::reset_voice_session(state, Some(app), "hold-to-talk release");
    }
    crate::codex_micro_overlay::note_pad_run_status("done", micro_key_id);
    crate::codex_micro_overlay::push_overlay_status(app, state.as_ref());
}

fn spawn_overlay_hold_lmb_watch(
    state: Arc<AppState>,
    app: AppHandle,
    micro_key_id: String,
    gen: u64,
) {
    let _ = std::thread::Builder::new()
        .name("overlay-pad-hold-lmb".into())
        .spawn(move || {
            // Soft Pad pointerup is authoritative. LMB is only a backup.
            // Do NOT finish just because GetAsyncKeyState flickers after focus steal —
            // that caused start/release storms and ChatGPT「未响应」(runtime-live.log).
            let mut stable_up = 0u32;
            for _ in 0..3_000 {
                if gen != overlay_pad_hold_gen() {
                    return;
                }
                if primary_button_down() {
                    stable_up = 0;
                } else {
                    stable_up = stable_up.saturating_add(1);
                    // Require ~80ms continuous up before treating as release.
                    if stable_up >= 8 {
                        if gen == overlay_pad_hold_gen() {
                            finish_micro_pad_hold(&state, &app, &micro_key_id);
                        }
                        return;
                    }
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
}

fn spawn_overlay_hold_start(
    state: Arc<AppState>,
    app: AppHandle,
    micro_key_id: String,
    mapping_id: String,
    trigger_binding: String,
    gen: u64,
) {
    let _ = std::thread::Builder::new()
        .name("overlay-pad-hold-start".into())
        .spawn(move || {
            if gen != overlay_pad_hold_gen() {
                return;
            }
            ensure_codex_focus_for_pad_hold(state.as_ref(), 0);
            if gen != overlay_pad_hold_gen() {
                return;
            }
            let Some(profile) = app_chat_workflow::profile_for(CODEX_APP_TARGET_ID) else {
                if gen == overlay_pad_hold_gen() {
                    *state.codex_numpad_hold_source.lock() = None;
                    crate::codex_micro_overlay::note_pad_run_status("failed", &micro_key_id);
                    crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
                }
                return;
            };
            let exec_window = app
                .get_webview_window("main")
                .or_else(|| app.get_webview_window(crate::codex_micro_overlay::CODEX_MICRO_OVERLAY_LABEL));
            let Some(exec_window) = exec_window else {
                return;
            };
            // Never abort on !primary_button_down after focus — LMB flicker used to skip
            // press or immediately finish and storm Codex with Ctrl+Shift+D.
            let hold_ok = app_chat_workflow::run_hold_voice_foreground(
                &state,
                &exec_window,
                &mapping_id,
                &trigger_binding,
                profile,
            )
            .is_ok();
            if !hold_ok {
                if gen == overlay_pad_hold_gen() {
                    *state.codex_numpad_hold_source.lock() = None;
                    crate::codex_micro_overlay::note_pad_run_status("failed", &micro_key_id);
                    crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
                }
                return;
            }
            set_overlay_pad_ptt_chord(trigger_binding.clone());
            if gen != overlay_pad_hold_gen() {
                release_overlay_ptt_chord(state.as_ref());
                return;
            }
            crate::codex_micro_overlay::refocus_overlay(&app);
            spawn_overlay_hold_lmb_watch(state.clone(), app.clone(), micro_key_id.clone(), gen);
            crate::codex_micro_overlay::note_pad_run_status("listening", &micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        });
}

use super::trigger_dispatch::dispatch_trigger_action;

fn should_publish_input_obs(state: &AppState, kind: &str) -> bool {
    *state.recording.lock() || kind == runtime_event::kind::INPUT_PARSE_MISS
}

/// Publish low-frequency input observability events to the runtime ring.
pub fn handle_input_obs_event(
    state: &Arc<AppState>,
    app: &AppHandle,
    obs: crate::input_obs::InputObsEvent,
) {
    if !should_publish_input_obs(state, obs.kind) {
        return;
    }
    let message = match obs.kind {
        runtime_event::kind::INPUT_PARSE_MISS => "HID parse miss".into(),
        runtime_event::kind::INPUT_IGNORED => format!("Input ignored: {}", obs.reason),
        runtime_event::kind::INPUT_CAPTURED => format!("Input captured: {}", obs.key),
        other => other.to_string(),
    };
    let payload = serde_json::json!({
        "key": obs.key,
        "device": obs.device,
        "reportHex": obs.report_hex,
        "reason": obs.reason,
        "source": obs.source,
    });
    runtime_event::publish_runtime_event(
        Some(app),
        state,
        "input_ext",
        obs.kind,
        &message,
        Some(payload),
    );
}

fn track_agent_modifier_keydown(state: &Arc<AppState>, event: &crate::press_gesture::PhysicalKeyEvent) {
    if event.is_keyup {
        return;
    }
    let chord = build_pressed_chord(&event.key);
    if is_modifier_name(&event.key) {
        let should_track = {
            let cfg = state.cfg.lock();
            cfg.find_agent_modifier_tap_dispatch(&chord).is_some()
        };
        if should_track {
            *state.agent_modifier_tap.lock() = Some(AgentModifierTapState {
                key: event.key.clone(),
                combo_broken: false,
            });
        }
        return;
    }
    if let Some(pending) = state.agent_modifier_tap.lock().as_mut() {
        pending.combo_broken = true;
    }
}

fn clear_agent_modifier_tap(state: &Arc<AppState>, key: &str) {
    let mut pending = state.agent_modifier_tap.lock();
    if pending
        .as_ref()
        .is_some_and(|p| p.key == key)
    {
        *pending = None;
    }
}

fn is_overlay_pad_window(window: &tauri::WebviewWindow) -> bool {
    window.label() == crate::codex_micro_overlay::CODEX_MICRO_OVERLAY_LABEL
}

fn run_overlay_tap_action(
    state: &Arc<AppState>,
    exec_window: &tauri::WebviewWindow,
    route: &crate::codex_numpad_layer::CodexNumpadRouteSnapshot,
) {
    // ENC 召回 / focusComposer: bring Codex + composer via workflow — never inject
    // Ctrl+Shift+P (that chord is not a stable summon and often hits the wrong app).
    if is_pad_summon_action(&route.action_id, &route.slot_id) {
        execute_agent_binding(
            state,
            exec_window,
            &route.mapping_id,
            &route.provider_id,
            if route.action_id.trim().is_empty() {
                "openAgent"
            } else {
                route.action_id.as_str()
            },
            &route.slot_id,
            None,
            Some("global".into()),
        );
        return;
    }

    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let mut chord = route.trigger_binding.trim().to_string();
    if chord.is_empty() {
        chord = crate::agent::bindings_build::default_key_for_slot(&route.slot_id).to_string();
    }
    let hotkey_action = matches!(
        route.action_id.as_str(),
        "commandPalette"
            | "cancel"
            | "newThread"
            | "undo"
            | "quickSearch"
            | "quickChat"
            | "stopOrSendDictation"
            | "openReviewTab"
            | "toggleReviewPanel"
            | "openTerminal"
            | "toggleBrowserPanel"
            | "newBrowserTab"
            | "focusBrowserAddressBar"
    );
    if hotkey_action && !chord.is_empty() {
        // Never SendInput while OneTone (overlay/main) still owns FG — chords land in
        // WebView2 and freeze Soft Pad (Ctrl+F find / Ctrl+N noop storms).
        crate::keyboard::track_foreground_for_send();
        let focused = app_chat_workflow::quick_focus_codex_for_hold();
        let codex_fg = crate::app_identity::foreground_app_target_id()
            .is_some_and(|id| id.trim() == CODEX_APP_TARGET_ID);
        if !focused || !codex_fg || crate::app_identity::foreground_is_self() {
            crate::app_log::log_line(
                state.as_ref(),
                "codex_pad",
                &format!(
                    "inject skipped chord={chord} focused={focused} codex_fg={codex_fg} self={}",
                    crate::app_identity::foreground_is_self()
                ),
            );
            return;
        }
        let _ = crate::keyboard::send_chord(&chord, duration_ms);
        return;
    }
    execute_agent_binding(
        state,
        exec_window,
        &route.mapping_id,
        &route.provider_id,
        &route.action_id,
        &route.slot_id,
        None,
        Some(activation_scope_for_route(route)),
    );
}

/// ENC / summonCodex / Claude model key must use Global focus workflow.
fn is_pad_summon_action(action_id: &str, slot_id: &str) -> bool {
    matches!(
        action_id.trim(),
        "openAgent" | "focusComposer" | "claudeModel"
    ) || matches!(slot_id.trim(), "summonCodex" | "claudeModel")
}

fn activation_scope_for_route(
    route: &crate::codex_numpad_layer::CodexNumpadRouteSnapshot,
) -> String {
    if is_pad_summon_action(&route.action_id, &route.slot_id) {
        "global".into()
    } else {
        "foregroundApp".into()
    }
}

fn spawn_overlay_tap_fire(
    state: Arc<AppState>,
    app: AppHandle,
    exec_window: tauri::WebviewWindow,
    route: crate::codex_numpad_layer::CodexNumpadRouteSnapshot,
    micro_key_id: String,
) {
    use std::sync::atomic::{AtomicBool, Ordering};
    // One focus+SendInput at a time — parallel taps deadlocked via AttachThreadInput/WebView2.
    static BUSY: AtomicBool = AtomicBool::new(false);
    if BUSY.swap(true, Ordering::SeqCst) {
        crate::app_log::log_line(
            state.as_ref(),
            "codex_pad",
            &format!("tap dropped busy key={micro_key_id} slot={}", route.slot_id),
        );
        crate::codex_micro_overlay::note_pad_run_status("done", &micro_key_id);
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        return;
    }
    crate::app_log::log_line(
        state.as_ref(),
        "codex_pad",
        &format!(
            "tap fire key={micro_key_id} slot={} action={}",
            route.slot_id, route.action_id
        ),
    );
    let _ = std::thread::Builder::new()
        .name("overlay-pad-tap".into())
        .spawn(move || {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_overlay_tap_action(&state, &exec_window, &route);
            }));
            crate::codex_micro_overlay::apply_overlay_no_activate();
            crate::codex_micro_overlay::refocus_overlay(&app);
            crate::codex_micro_overlay::note_pad_run_status("done", &micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            BUSY.store(false, Ordering::SeqCst);
        });
}

fn spawn_overlay_heal_and_fire(
    state: Arc<AppState>,
    app: AppHandle,
    overlay_window: tauri::WebviewWindow,
    micro_key_id: String,
    emit_pad_event: bool,
) {
    let _ = std::thread::Builder::new()
        .name("overlay-pad-heal".into())
        .spawn(move || {
            {
                let cfg = state.cfg.lock();
                crate::codex_numpad_layer::sync_hook_cache(&cfg);
            }
            let mut healed = crate::codex_numpad_layer::try_heal_micro_route(
                state.as_ref(),
                &micro_key_id,
                "zh-CN",
            );
            if !healed {
                let mut cfg = state.cfg.lock();
                let result =
                    crate::codex_numpad_layer::ensure_codex_pad_ready(&mut cfg, "zh-CN");
                if result.changed {
                    crate::codex_numpad_layer::sync_hook_cache(&cfg);
                    healed = true;
                }
            }
            if healed {
                let cfg = state.cfg.lock();
                crate::config::save_config(&cfg);
            }
            if crate::codex_numpad_layer::lookup_route_by_micro_key(&micro_key_id).is_some() {
                let _ = fire_codex_micro_pad_key(
                    &state,
                    &overlay_window,
                    &micro_key_id,
                    true,
                    emit_pad_event,
                );
            } else {
                crate::codex_micro_overlay::note_pad_run_status("failed", &micro_key_id);
            }
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        });
}

fn execute_agent_binding(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    mapping_id: &str,
    provider_id: &str,
    action_id: &str,
    slot_id: &str,
    execution_mode: Option<String>,
    activation_scope: Option<String>,
) {
    let _ = crate::agent::execute_agent_action(
        state,
        window,
        crate::agent::AgentExecuteRequest {
            provider_id: provider_id.to_string(),
            action_id: action_id.to_string(),
            mapping_id: Some(mapping_id.to_string()),
            slot_id: if slot_id.is_empty() {
                None
            } else {
                Some(slot_id.to_string())
            },
            execution_mode,
            activation_scope,
        },
    );
}

fn codex_numpad_hold_ids_match(held_id: &str, micro_key_id: &str, source_id: Option<&str>) -> bool {
    if held_id == micro_key_id {
        return true;
    }
    source_id.is_some_and(|sid| held_id == sid)
}

/// Drop stale hold latch when chord is no longer physically held.
fn clear_stale_codex_numpad_hold(state: &AppState) -> bool {
    let held = state.codex_numpad_hold_source.lock().clone();
    let Some(held_id) = held else {
        return false;
    };
    if crate::voice_end_runtime::held_voice_chord(state).is_some() {
        return false;
    }
    *state.codex_numpad_hold_source.lock() = None;
    crate::app_log::log_line(
        state,
        "hold",
        &format!("cleared stale numpad hold latch ({held_id})"),
    );
    true
}

fn try_end_codex_numpad_hold(
    state: &Arc<AppState>,
    app: &AppHandle,
    micro_key_id: &str,
    source_id: Option<&str>,
) -> bool {
    let held = state.codex_numpad_hold_source.lock().clone();
    let Some(held_id) = held else {
        return false;
    };
    if !codex_numpad_hold_ids_match(&held_id, micro_key_id, source_id) {
        return false;
    }
    *state.codex_numpad_hold_source.lock() = None;
    crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
    true
}

fn try_dispatch_codex_numpad(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    raw: &str,
) -> bool {
    let Some((source, key_down)) = crate::codex_numpad_layer::parse_event(raw) else {
        return false;
    };
    let source_id = source.id();
    let _ = window.emit(
        "to_js",
        &serde_json::json!({
            "type": "codex_micro_pad_key",
            "sourceId": source_id,
            "microKeyId": crate::codex_numpad_layer::lookup_route(&source)
                .map(|r| r.micro_key_id)
                .unwrap_or_default(),
            "phase": if key_down { "down" } else { "up" },
        }),
    );
    if let Some(route) = crate::codex_numpad_layer::lookup_route(&source) {
        crate::codex_micro_overlay::note_micro_key(&route.micro_key_id, key_down);
        // Status-only push — full push_state remounts geometry/AOT and makes Soft Pad 抖动.
        crate::codex_micro_overlay::push_overlay_status(&window.app_handle(), state.as_ref());
    }

    let Some(route) = crate::codex_numpad_layer::lookup_route(&source) else {
        return true;
    };

    if route.is_hold {
        let app = window.app_handle();
        if !key_down {
            try_end_codex_numpad_hold(state, &app, &route.micro_key_id, Some(&source_id));
            return true;
        }
        clear_stale_codex_numpad_hold(state.as_ref());
        if state.codex_numpad_hold_source.lock().is_some() {
            return true;
        }
        let Some(profile) = app_chat_workflow::profile_for(CODEX_APP_TARGET_ID) else {
            return true;
        };
        let duration_ms = state.cfg.lock().key_press_duration_ms;
        ensure_codex_focus_for_pad_hold(state.as_ref(), duration_ms);
        *state.codex_numpad_hold_source.lock() = Some(route.micro_key_id.clone());
        let hold_ok = app_chat_workflow::run_hold_voice_foreground(
            state,
            window,
            &route.mapping_id,
            &route.trigger_binding,
            profile,
        )
        .is_ok();
        if !hold_ok {
            *state.codex_numpad_hold_source.lock() = None;
        }
        return true;
    }

    if !key_down {
        return true;
    }
    execute_agent_binding(
        state,
        window,
        &route.mapping_id,
        &route.provider_id,
        &route.action_id,
        &route.slot_id,
        None,
        Some("foregroundApp".into()),
    );
    true
}

fn try_dispatch_codex_micro_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    raw: &str,
) -> bool {
    let Some((micro_key_id, key_down)) = crate::codex_numpad_layer::parse_micro_key_event(raw) else {
        return false;
    };
    let _ = fire_codex_micro_pad_key(state, window, &micro_key_id, key_down, true);
    true
}

/// Overlay hold-to-talk must target Codex, not the overlay webview (fast path — no UIA).
fn ensure_codex_focus_for_pad_hold(state: &AppState, _duration_ms: u32) {
    if !app_chat_workflow::quick_focus_codex_for_hold() {
        crate::app_log::log_line(state, "hold", "quick_focus_codex_for_hold failed");
    }
}

/// Screen / overlay fire path for Micro keycaps (M2 run mode).
/// `emit_pad_event`: when true, notify main UI + overlay highlight (hardware path).
pub fn fire_codex_micro_pad_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    micro_key_id: &str,
    key_down: bool,
    emit_pad_event: bool,
) -> serde_json::Value {
    let micro_key_id = micro_key_id.trim();
    if micro_key_id.is_empty() {
        return serde_json::json!({ "ok": false, "reason": "invalid_key" });
    }
    let app = window.app_handle();
    let claude_inject_ok = crate::claude_cli_session::claude_cli_can_inject().ok
        || crate::claude_cli_session::pending_approval_view().active;
    let session_ok = crate::codex_numpad_layer::codex_foreground_for_micro()
        || window.label() == crate::codex_micro_overlay::CODEX_MICRO_OVERLAY_LABEL
        || claude_inject_ok;
    if !session_ok {
        if key_down {
            crate::codex_micro_overlay::note_pad_run_status("failed", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        }
        return serde_json::json!({ "ok": false, "reason": "not_foreground" });
    }

    // Claude Soft Pad C1/C2: ACT12/ACT08 when latch high or pending Hook approval.
    if key_down {
        if let Some(handled) = crate::claude_cli_session::try_softpad_fire(micro_key_id) {
            let ok = handled.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            crate::codex_micro_overlay::note_pad_run_status(
                if ok { "done" } else { "failed" },
                micro_key_id,
            );
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return handled;
        }
    }

    // Numpad mode: ENC summons Codex; NP* inject digits; other Micro keys blocked.
    // If config says Codex mode but hook cache drifted, resync once before rejecting.
    if !crate::codex_numpad_layer::numpad_mode_allows_fire(micro_key_id) {
        {
            let cfg = state.cfg.lock();
            let cfg_on = cfg
                .active_mappings()
                .iter()
                .find(|m| m.app_target_id.trim() == CODEX_APP_TARGET_ID)
                .and_then(|m| m.codex_micro_pad.as_ref())
                .map(|p| p.enabled)
                .unwrap_or(false);
            if cfg_on {
                crate::codex_numpad_layer::sync_hook_cache(&cfg);
            }
        }
        if !crate::codex_numpad_layer::numpad_mode_allows_fire(micro_key_id) {
            if key_down {
                crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            }
            return serde_json::json!({
                "ok": false,
                "reason": "numpad_mode",
                "microKeyId": micro_key_id,
            });
        }
    }

    // Soft numpad digit / Enter / Dot — async inject (same pattern as NAV enhance).
    if crate::codex_numpad_layer::is_overlay_numpad_key(micro_key_id)
        && !crate::codex_numpad_layer::pad_mapping_active()
    {
        if key_down {
            spawn_numpad_digit_inject(micro_key_id.to_string());
        }
        return serde_json::json!({
            "ok": true,
            "reason": "numpad_pulse",
            "microKeyId": micro_key_id,
        });
    }

    // Overlay / enhance NAV: async inject only — never block IPC or thrash overlay state.
    // (Sync SendInput into the overlay webview + status push every 140ms caused UI freeze.)
    if is_nav_micro_key(micro_key_id)
        && crate::codex_numpad_layer::lookup_route_by_micro_key(micro_key_id).is_none()
        && (crate::codex_numpad_layer::software_enhance_enabled()
            || is_overlay_pad_window(window))
    {
        if key_down {
            spawn_nav_arrow_inject(micro_key_id.to_string());
        }
        return serde_json::json!({
            "ok": true,
            "reason": "enhance_pulse",
            "microKeyId": micro_key_id,
        });
    }

    if !crate::codex_numpad_layer::pad_mapping_active() {
        // ENC-only path (numpad mode exception).
        if !key_down {
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": true, "reason": "tap_up_ignored", "slotId": "summonCodex" });
        }
        let exec_window = app
            .get_webview_window("main")
            .unwrap_or_else(|| window.clone());
        crate::codex_micro_overlay::note_micro_key(micro_key_id, true);
        let route = {
            let cfg = state.cfg.lock();
            crate::codex_numpad_layer::resolve_enc_summon_route(&cfg)
        };
        let Some(route) = route else {
            crate::codex_micro_overlay::note_pad_run_status("failed", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": false, "reason": "unbound" });
        };
        crate::codex_micro_overlay::note_pad_run_status("running", micro_key_id);
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        if is_overlay_pad_window(window) {
            spawn_overlay_tap_fire(
                Arc::clone(state),
                app.clone(),
                exec_window,
                route,
                micro_key_id.to_string(),
            );
        } else {
            run_overlay_tap_action(state, &exec_window, &route);
            crate::codex_micro_overlay::note_pad_run_status("done", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        }
        return serde_json::json!({
            "ok": true,
            "reason": "fired",
            "slotId": "summonCodex",
            "actionId": "openAgent",
        });
    }

    // Overlay invokes this command on its own webview; execute/hold need the main window.
    let exec_window = app
        .get_webview_window("main")
        .unwrap_or_else(|| window.clone());

    crate::codex_micro_overlay::note_micro_key(micro_key_id, key_down);
    if emit_pad_event {
        let payload = serde_json::json!({
            "type": "codex_micro_pad_key",
            "microKeyId": micro_key_id,
            "phase": if key_down { "down" } else { "up" },
        });
        let _ = exec_window.emit("to_js", &payload);
    }

    let Some(route) = crate::codex_numpad_layer::lookup_route_by_micro_key(micro_key_id) else {
        // M4: software-enhance keys may pulse without a bound slot (NAV injects arrows).
        if crate::codex_numpad_layer::is_software_enhance_micro_key(micro_key_id)
            && (crate::codex_numpad_layer::software_enhance_enabled()
                || is_overlay_pad_window(window))
        {
            if key_down {
                if is_nav_micro_key(micro_key_id) {
                    spawn_nav_arrow_inject(micro_key_id.to_string());
                } else {
                    // ENC_CW / ENC_CC: highlight-only, no HID.
                    crate::codex_micro_overlay::note_pad_run_status("running", micro_key_id);
                    crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
                }
            } else if !is_nav_micro_key(micro_key_id) {
                crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            }
            return serde_json::json!({
                "ok": true,
                "reason": "enhance_pulse",
                "microKeyId": micro_key_id,
            });
        }
        if key_down {
            if is_overlay_pad_window(window) {
                crate::codex_micro_overlay::note_pad_run_status("running", micro_key_id);
                spawn_overlay_heal_and_fire(
                    Arc::clone(state),
                    app.clone(),
                    window.clone(),
                    micro_key_id.to_string(),
                    emit_pad_event,
                );
                crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
                return serde_json::json!({
                    "ok": true,
                    "reason": "healing",
                    "microKeyId": micro_key_id,
                });
            }
            {
                let cfg = state.cfg.lock();
                crate::codex_numpad_layer::sync_hook_cache(&cfg);
            }
            if crate::codex_numpad_layer::lookup_route_by_micro_key(micro_key_id).is_some() {
                return fire_codex_micro_pad_key(state, window, micro_key_id, key_down, emit_pad_event);
            }
            let mut healed = crate::codex_numpad_layer::try_heal_micro_route(
                state.as_ref(),
                micro_key_id,
                "zh-CN",
            );
            if !healed {
                let mut cfg = state.cfg.lock();
                let result =
                    crate::codex_numpad_layer::ensure_codex_pad_ready(&mut cfg, "zh-CN");
                if result.changed {
                    crate::codex_numpad_layer::sync_hook_cache(&cfg);
                    healed = true;
                }
            }
            if healed
                && crate::codex_numpad_layer::lookup_route_by_micro_key(micro_key_id).is_some()
            {
                let state_bg = Arc::clone(state);
                std::thread::spawn(move || {
                    let cfg = state_bg.cfg.lock();
                    crate::config::save_config(&cfg);
                });
                return fire_codex_micro_pad_key(state, window, micro_key_id, key_down, emit_pad_event);
            }
            crate::codex_micro_overlay::note_pad_run_status("failed", micro_key_id);
        }
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        return serde_json::json!({ "ok": false, "reason": "unbound" });
    };

    if route.is_hold {
        let from_overlay = is_overlay_pad_window(window);
        if !key_down {
            finish_micro_pad_hold(state, &app, micro_key_id);
            return serde_json::json!({ "ok": true, "reason": "hold_up", "slotId": route.slot_id });
        }
        clear_stale_codex_numpad_hold(state.as_ref());
        // Overlay used to skip this check and spawn parallel hold threads → Ctrl+Shift+D
        // start/release storms that hung ChatGPT (log: ChatGPT 未响应).
        if state.codex_numpad_hold_source.lock().is_some() {
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": true, "reason": "hold_busy", "slotId": route.slot_id });
        }
        if from_overlay {
            // Do not release an in-flight chord here — hold_busy above covers duplicates.
            let gen = bump_overlay_pad_hold_gen();
            *state.codex_numpad_hold_source.lock() = Some(micro_key_id.to_string());
            spawn_overlay_hold_start(
                Arc::clone(state),
                app.clone(),
                micro_key_id.to_string(),
                route.mapping_id.clone(),
                route.trigger_binding.clone(),
                gen,
            );
            crate::codex_micro_overlay::note_pad_run_status("listening", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": true, "reason": "hold_down", "slotId": route.slot_id });
        }
        let Some(profile) = app_chat_workflow::profile_for(CODEX_APP_TARGET_ID) else {
            crate::codex_micro_overlay::note_pad_run_status("failed", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": false, "reason": "no_profile" });
        };
        let duration_ms = state.cfg.lock().key_press_duration_ms;
        ensure_codex_focus_for_pad_hold(state.as_ref(), duration_ms);
        *state.codex_numpad_hold_source.lock() = Some(micro_key_id.to_string());
        let hold_ok = app_chat_workflow::run_hold_voice_foreground(
            state,
            &exec_window,
            &route.mapping_id,
            &route.trigger_binding,
            profile,
        )
        .is_ok();
        if !hold_ok {
            *state.codex_numpad_hold_source.lock() = None;
            crate::codex_micro_overlay::note_pad_run_status("failed", micro_key_id);
            crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
            return serde_json::json!({ "ok": false, "reason": "hold_failed" });
        }
        crate::codex_micro_overlay::note_pad_run_status("listening", micro_key_id);
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        return serde_json::json!({ "ok": true, "reason": "hold_down", "slotId": route.slot_id });
    }

    if !key_down {
        crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
        return serde_json::json!({ "ok": true, "reason": "tap_up_ignored", "slotId": route.slot_id });
    }
    // Always async — sync focus+SendInput on the IPC/UI thread freezes Soft Pad / WebView2.
    crate::codex_micro_overlay::note_pad_run_status("running", micro_key_id);
    crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
    spawn_overlay_tap_fire(
        Arc::clone(state),
        app.clone(),
        exec_window.clone(),
        route.clone(),
        micro_key_id.to_string(),
    );
    serde_json::json!({
        "ok": true,
        "reason": "fired",
        "slotId": route.slot_id,
        "actionId": route.action_id,
    })
}

/// M4 software enhance: NAV_* → arrow/Enter pulse. ENC_CW/CC are highlight-only without HID writeback.
fn inject_software_enhance_key(micro_key_id: &str) {
    let chord = match micro_key_id.trim() {
        "NAV_UP" => Some("Up"),
        "NAV_DOWN" => Some("Down"),
        "NAV_LEFT" => Some("Left"),
        "NAV_RIGHT" => Some("Right"),
        "NAV_PRESS" => Some("Enter"),
        _ => None,
    };
    if let Some(c) = chord {
        let _ = crate::keyboard::send_chord(c, 35);
    }
}

/// Overlay D-pad: focus Codex then inject arrow. Never run on the IPC thread (sleep + focus
/// would freeze the overlay), and never emit overlay status (repeat would thrash the webview).
fn spawn_nav_arrow_inject(micro_key_id: String) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static BUSY: AtomicBool = AtomicBool::new(false);
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("overlay-nav-inject".into())
        .spawn(move || {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _ = app_chat_workflow::quick_focus_codex_for_hold();
                inject_software_enhance_key(&micro_key_id);
            }));
            BUSY.store(false, Ordering::SeqCst);
        });
}

fn spawn_numpad_digit_inject(micro_key_id: String) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static BUSY: AtomicBool = AtomicBool::new(false);
    if BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("overlay-numpad-inject".into())
        .spawn(move || {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let _ = app_chat_workflow::quick_focus_codex_for_hold();
                inject_overlay_numpad_key(&micro_key_id);
            }));
            BUSY.store(false, Ordering::SeqCst);
        });
}

fn inject_overlay_numpad_key(micro_key_id: &str) {
    #[cfg(windows)]
    {
        use winapi::um::winuser::{
            VK_ADD, VK_DECIMAL, VK_DIVIDE, VK_MULTIPLY, VK_NUMPAD0, VK_NUMPAD1, VK_NUMPAD2,
            VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9,
            VK_RETURN, VK_SUBTRACT,
        };
        let (vk, extended) = match micro_key_id.trim() {
            "NP0" => (VK_NUMPAD0 as u16, false),
            "NP1" => (VK_NUMPAD1 as u16, false),
            "NP2" => (VK_NUMPAD2 as u16, false),
            "NP3" => (VK_NUMPAD3 as u16, false),
            "NP4" => (VK_NUMPAD4 as u16, false),
            "NP5" => (VK_NUMPAD5 as u16, false),
            "NP6" => (VK_NUMPAD6 as u16, false),
            "NP7" => (VK_NUMPAD7 as u16, false),
            "NP8" => (VK_NUMPAD8 as u16, false),
            "NP9" => (VK_NUMPAD9 as u16, false),
            "NP_DOT" => (VK_DECIMAL as u16, false),
            "NP_DIV" => (VK_DIVIDE as u16, false),
            "NP_MUL" => (VK_MULTIPLY as u16, false),
            "NP_SUB" => (VK_SUBTRACT as u16, false),
            "NP_ADD" => (VK_ADD as u16, false),
            "NP_ENTER" => (VK_RETURN as u16, true),
            _ => return,
        };
        crate::keyboard::tap_vk(vk, extended, 35);
    }
    #[cfg(not(windows))]
    {
        let _ = micro_key_id;
    }
}

fn is_nav_micro_key(micro_key_id: &str) -> bool {
    matches!(
        micro_key_id.trim(),
        "NAV_UP" | "NAV_DOWN" | "NAV_LEFT" | "NAV_RIGHT" | "NAV_PRESS"
    )
}

fn try_end_hold_voice_on_keyup(
    state: &Arc<AppState>,
    app: &AppHandle,
    event: &crate::press_gesture::PhysicalKeyEvent,
) -> bool {
    let Some(held) = crate::voice_end_runtime::held_voice_chord(state.as_ref()) else {
        return false;
    };
    let key = event.key.trim();
    let ends_hold = chord_parts(&held).iter().any(|part| {
        key.eq_ignore_ascii_case(part)
            || crate::key_chord::chord_token_matches(part, key)
    });
    if !ends_hold {
        return false;
    }
    crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
    true
}

fn try_dispatch_agent_modifier_keyup(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    event: &crate::press_gesture::PhysicalKeyEvent,
) -> bool {
    let pending = state.agent_modifier_tap.lock().take();
    let Some(pending) = pending else {
        return false;
    };
    if pending.combo_broken || pending.key != event.key {
        return false;
    }
    let chord = build_pressed_chord(&event.key);
    let (mapping_id, action_id, slot_id, provider_id, execution_mode, activation_scope) = {
        let cfg = state.cfg.lock();
        let Some((mapping, b)) = cfg.find_agent_modifier_tap_dispatch(&chord) else {
            return false;
        };
        let provider = if mapping.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            mapping.agent_provider_id.clone()
        };
        (
            mapping.id.clone(),
            b.action_id.clone(),
            b.slot_id.clone(),
            provider,
            b.execution_mode.clone(),
            if b.activation_scope.trim().is_empty() {
                None
            } else {
                Some(b.activation_scope.clone())
            },
        )
    };
    execute_agent_binding(
        state,
        window,
        &mapping_id,
        &provider_id,
        &action_id,
        &slot_id,
        execution_mode,
        activation_scope,
    );
    true
}

/// 解析物理按键事件，处理长按/双击手势后触发语音。
pub fn dispatch_physical_event(state: &Arc<AppState>, window: &tauri::WebviewWindow, raw: &str) {
    if raw.starts_with("codexNumpad:") {
        try_dispatch_codex_numpad(state, window, raw);
        return;
    }
    if raw.starts_with("codexMicroKey:") {
        try_dispatch_codex_micro_key(state, window, raw);
        return;
    }
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(raw);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    if event.is_keyup {
        if try_dispatch_agent_modifier_keyup(state, window, &event) {
            return;
        }
        clear_agent_modifier_tap(state, &event.key);
        let app = window.app_handle();
        if try_end_hold_voice_on_keyup(state, &app, &event) {
            return;
        }
        let maybe_dispatch = state.gesture.lock().on_keyup(&event);
        if let Some(dispatch_key) = maybe_dispatch {
            // For hold-to-talk (LongPress mode): key release should end the current dictation
            // session (if any) and run finish/send, instead of re-sending the wake key.
            crate::voice_end_runtime::stop_dictation_after_trigger_key(state, &app);
            let _ = dispatch_key;
        }
        return;
    }

    track_agent_modifier_keydown(state, &event);

    // Modifier-only agent bindings fire on keyup after a clean tap — never on keydown.
    let chord = build_pressed_chord(&event.key);
    if is_modifier_only_chord(&chord) {
        return;
    }

    // Agent chords registered via WM_HOTKEY (e.g. Codex pushToTalk Ctrl+Shift+D).
    if try_dispatch_agent_key(state, window, &event.key) {
        return;
    }

    let now = std::time::Instant::now();
    let fire_key = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mut gesture = state.gesture.lock();
        gesture.on_keydown(&event, mapping, now)
    };
    if let Some(key) = fire_key {
        handle_physical_key(state, window, &key);
    }
}

pub fn handle_physical_key(state: &Arc<AppState>, window: &tauri::WebviewWindow, key_name: &str) {
    if *state.paused.lock() || *state.recording.lock() {
        return;
    }
    let event = parse_physical_event(key_name);
    if crate::send_guard::blocks_key(&event.key) {
        crate::send_guard::note_blocked();
        return;
    }
    // Agent capability keys (Codex Micro pack) take priority over classic SendKey.
    if try_dispatch_agent_key(state, window, &event.key) {
        return;
    }
    let now = std::time::Instant::now();
    let (mapping_id, duration_ms, actions) = {
        let cfg = state.cfg.lock();
        let Some(mapping) = cfg.find_mapping_for_event(&event) else {
            return;
        };
        let mapping_id = mapping.id.clone();
        let duration_ms = cfg.key_press_duration_ms;

        // App-scenario long-press with Codex hold-to-talk: skip empty targetKey SendKey path.
        if mapping.trigger_mode == crate::config::TriggerMode::LongPress
            && is_app_scenario_mapping(mapping)
        {
            let app_target = mapping.app_target_id.trim().to_string();
            if let Some(voice_key) =
                crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, Some(mapping))
            {
                if crate::voice_end_runtime::is_hold_to_talk_voice_key(&voice_key) {
                    if let Some(profile) = app_chat_workflow::profile_for(&app_target) {
                        drop(cfg);
                        let ok = app_chat_workflow::run_hold_voice_foreground(
                            state,
                            window,
                            &mapping_id,
                            &voice_key,
                            profile,
                        )
                        .is_ok();
                        let cue = crate::config::runtime_sound_cue(
                            &state.cfg.lock(),
                            if ok { "key_wake" } else { "send_fail" },
                        );
                        crate::ipc::core::push_runtime_with_cue(
                            state.as_ref(),
                            window,
                            if ok { "codex_hold_start" } else { "codex_hold_failed" },
                            &mapping_id,
                            cue.as_deref(),
                        );
                        if ok {
                            crate::coach_hud::flash_success(&window.app_handle(), state.as_ref());
                        } else {
                            crate::coach_hud::push_state(&window.app_handle(), state.as_ref());
                        }
                        return;
                    }
                }
            }
        }

        let foreground = app_identity::foreground_app_identity();
        let effective = effective_mapping_for_trigger(mapping, foreground.as_ref());
        let actions = {
            let mut pool = state.machine_pool.lock();
            pool.get_or_create(&mapping_id)
                .trigger(&cfg, &effective, &event.key, now)
        };
        (mapping_id, duration_ms, actions)
    };
    let source_key = event.key.clone();
    for action in actions {
        dispatch_trigger_action(state, window, &mapping_id, duration_ms, &source_key, action);
    }
}

fn try_dispatch_agent_key(
    state: &Arc<AppState>,
    window: &tauri::WebviewWindow,
    physical_key: &str,
) -> bool {
    let chord = if physical_key.contains('+') {
        crate::config::canonical_trigger(physical_key)
    } else {
        build_pressed_chord(physical_key)
    };
    if is_modifier_only_chord(&chord) {
        return false;
    }
    // WM_HOTKEY delivers the full chord string; only filter terminal-key events for
    // per-key hook delivery (e.g. keydown "D" while modifiers are held).
    if !physical_key.contains('+') {
        let parts = chord_parts(&chord);
        if parts.len() > 1 {
            let terminal = parts.last().map(String::as_str).unwrap_or("");
            if !physical_key.trim().eq_ignore_ascii_case(terminal)
                && !crate::key_chord::chord_token_matches(terminal, physical_key)
            {
                return false;
            }
        }
    }
    let (mapping_id, action_id, slot_id, provider_id, execution_mode, activation_scope) = {
        let cfg = state.cfg.lock();
        let Some((mapping, b)) = cfg.find_agent_key_dispatch(&chord) else {
            return false;
        };
        // Physical Ctrl+Shift+D must reach Codex as a native hold; only PageDown synthesizes it.
        // But while WE are synthesizing / already holding, consume the echo — do not fall through
        // into classic LongPress (log: double hold start/release → 假死).
        if b.action_id == "startDictation" && crate::key_chord::is_hold_to_talk_chord(&chord) {
            if crate::send_guard::blocks_key(physical_key)
                || crate::send_guard::blocks_key(&chord)
                || crate::voice_end_runtime::held_voice_chord(state.as_ref())
                    .is_some_and(|held| crate::key_chord::chords_equivalent(&held, &chord))
            {
                crate::send_guard::note_blocked();
                return true;
            }
            return false;
        }
        if b.action_id == "startDictation"
            && crate::voice_end_runtime::session_state(state.as_ref()) == "dictating"
            && crate::voice_end_runtime::held_voice_chord(state.as_ref()).is_some()
        {
            return true;
        }
        let provider = if mapping.agent_provider_id.trim().is_empty() {
            "codex".to_string()
        } else {
            mapping.agent_provider_id.clone()
        };
        (
            mapping.id.clone(),
            b.action_id.clone(),
            b.slot_id.clone(),
            provider,
            b.execution_mode.clone(),
            if b.activation_scope.trim().is_empty() {
                None
            } else {
                Some(b.activation_scope.clone())
            },
        )
    };
    execute_agent_binding(
        state,
        window,
        &mapping_id,
        &provider_id,
        &action_id,
        &slot_id,
        execution_mode,
        activation_scope,
    );
    true
}

#[cfg(test)]
mod summon_tests {
    use super::{activation_scope_for_route, is_pad_summon_action};
    use crate::codex_numpad_layer::CodexNumpadRouteSnapshot;

    fn route(action: &str, slot: &str) -> CodexNumpadRouteSnapshot {
        CodexNumpadRouteSnapshot {
            mapping_id: "m".into(),
            slot_id: slot.into(),
            action_id: action.into(),
            provider_id: "codex".into(),
            trigger_binding: String::new(),
            micro_key_id: "ENC".into(),
            is_hold: false,
        }
    }

    #[test]
    fn enc_summon_is_focus_workflow_not_chord() {
        assert!(is_pad_summon_action("openAgent", "summonCodex"));
        assert!(is_pad_summon_action("focusComposer", "x"));
        assert!(is_pad_summon_action("claudeModel", "claudeModel"));
        assert!(is_pad_summon_action("", "summonCodex"));
        assert!(is_pad_summon_action("", "claudeModel"));
        assert!(!is_pad_summon_action("commandPalette", "commandPalette"));
        assert_eq!(
            activation_scope_for_route(&route("openAgent", "summonCodex")),
            "global"
        );
        assert_eq!(
            activation_scope_for_route(&route("claudeModel", "claudeModel")),
            "global"
        );
        assert_eq!(
            activation_scope_for_route(&route("commandPalette", "commandPalette")),
            "foregroundApp"
        );
    }
}
