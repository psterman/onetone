//! Runtime integration for Vosk offline voice wake.

use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::config::{
    append_unique_phrases, normalize_voice_override, save_config, vosk_preset_default_phrases,
    vosk_preset_model_path, VoiceVoskConfig,
};
use crate::voice_vosk::{
    probe_vosk_resources, shutdown_sync, start_voice_vosk, stop_voice_vosk, vosk_resource_issue,
    VoiceVoskEvent, VoskResourceProbe,
};
use crate::AppState;

static OVERLAY_VOICE_NUDGE: std::sync::OnceLock<parking_lot::Mutex<(Instant, String)>> =
    std::sync::OnceLock::new();

fn maybe_nudge_overlay_for_voice(app: &AppHandle, state: &AppState, text: &str) {
    const MIN: Duration = Duration::from_millis(120);
    let slot = OVERLAY_VOICE_NUDGE.get_or_init(|| parking_lot::Mutex::new((Instant::now() - MIN, String::new())));
    let mut gate = slot.lock();
    if gate.1 == text && gate.0.elapsed() < MIN {
        return;
    }
    if gate.0.elapsed() < MIN {
        return;
    }
    gate.0 = Instant::now();
    gate.1 = text.to_string();
    crate::codex_micro_overlay::push_overlay_status(app, state);
}

/// Free-mode Vosk may miss grammar Detected; fuzzy-match finals for Cursor beginner commands.
fn try_route_vosk_final_phrase(state: &Arc<AppState>, app: &AppHandle, text: &str) {
    let text = text.trim();
    if text.is_empty() || *state.paused.lock() {
        return;
    }
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return;
    }
    if crate::cursor_beginner::probe_ok() {
        let route = crate::cursor_beginner::is_arm_phrase(text)
            || crate::cursor_beginner::is_disarm_phrase(text)
            || crate::cursor_beginner::matches_beginner_phrase(text).is_some();
        if route {
            *state.voice_vosk_last_detected_phrase.lock() = text.to_string();
            process_detected(state, app, text);
            return;
        }
    }
    let phrases = crate::scene_config::vosk_grammar_phrases_for_cfg(&state.cfg.lock());
    let Some(phrase) = crate::voice_vosk::matches_final(text, &phrases) else {
        return;
    };
    let cfg = state.cfg.lock();
    let is_start = crate::voice_end_runtime::is_start_phrase(&cfg, &phrase);
    let is_beginner =
        crate::cursor_beginner::probe_ok() && crate::cursor_beginner::is_beginner_voice_phrase(&phrase);
    drop(cfg);
    if !is_start && !is_beginner {
        return;
    }
    *state.voice_vosk_last_detected_phrase.lock() = phrase.clone();
    process_detected(state, app, &phrase);
}

fn next_vosk_epoch(state: &AppState) -> u64 {
    state.voice_vosk_epoch.fetch_add(1, Ordering::SeqCst) + 1
}

fn vosk_epoch_matches(state: &AppState, epoch: u64) -> bool {
    state.voice_vosk_epoch.load(Ordering::SeqCst) == epoch
}

/// Release the default capture device for a short external recording (e.g. acoustic calibration).
/// Never blocks on joining the worker — Vosk model load ignores the stop flag and a sync join
/// freezes `record_start` IPC (UI stuck on「正在打开麦克风」).
pub fn pause_for_external_capture(state: &AppState) -> bool {
    crate::voice_bootstrap::stop_mic_monitor_and_release(state, "engine_or_device");
    let was_active = {
        let st = state.voice_vosk_state.lock().clone();
        matches!(
            st.as_str(),
            "starting" | "listening" | "cooldown" | "triggered" | "stopping"
        ) || state.voice_vosk.lock().is_some()
    };
    let handle = state.voice_vosk.lock().take();
    let _epoch = next_vosk_epoch(state);
    *state.voice_vosk_cooldown_until.lock() = None;
    *state.voice_vosk_last_error.lock() = String::new();
    *state.voice_vosk_state.lock() = "stopped".into();
    if let Some(handle) = handle {
        stop_voice_vosk(handle);
        return true;
    }
    was_active
}

/// Stop on a background thread (IPC-safe). Invalidates in-flight start workers.
pub fn spawn_voice_vosk_stop(state: Arc<AppState>) {
    let epoch = next_vosk_epoch(state.as_ref());
    let _ = epoch;
    crate::voice_bootstrap::stop_mic_monitor_and_release(state.as_ref(), "vosk_stop");
    *state.voice_vosk_cooldown_until.lock() = None;
    *state.voice_vosk_last_error.lock() = String::new();
    let handle = state.voice_vosk.lock().take();
    if let Some(handle) = handle {
        *state.voice_vosk_state.lock() = "stopping".into();
        std::thread::Builder::new()
            .name("voice-vosk-stop".into())
            .spawn(move || {
                stop_voice_vosk(handle);
                *state.voice_vosk_state.lock() = "stopped".into();
            })
            .ok();
    } else {
        *state.voice_vosk_state.lock() = "stopped".into();
    }
}

/// Stop capture handle without bumping epoch (safe to call from an in-flight start worker).
/// Never joins the worker — sync join belongs only in [`voice_vosk_stop_sync`].
fn release_vosk_capture_handle(state: &AppState) {
    crate::voice_bootstrap::stop_mic_monitor_and_release(state, "engine_or_device");
    *state.voice_vosk_cooldown_until.lock() = None;
    *state.voice_vosk_last_error.lock() = String::new();
    if let Some(handle) = state.voice_vosk.lock().take() {
        stop_voice_vosk(handle);
    }
    *state.voice_vosk_state.lock() = "stopped".into();
}

/// Block until the worker exits. Supervisor uses this for exclusive activate.
/// Bumps the epoch so any in-flight start worker aborts.
pub fn voice_vosk_stop_sync(state: &AppState) {
    let _epoch = next_vosk_epoch(state);
    crate::app_log::log_line(state, "voice", "vosk stop_sync begin");
    crate::voice_bootstrap::stop_mic_monitor_and_release(state, "engine_or_device");
    *state.voice_vosk_cooldown_until.lock() = None;
    *state.voice_vosk_last_error.lock() = String::new();
    if let Some(handle) = state.voice_vosk.lock().take() {
        shutdown_sync(handle);
    }
    *state.voice_vosk_state.lock() = "stopped".into();
    crate::app_log::log_line(state, "voice", "vosk stop_sync end");
}

/// Stop without joining the worker. Prefer this on config-watcher / fingerprint paths
/// so a stuck native model load cannot 假死 the UI (Responding=false).
pub fn voice_vosk_stop_detach(state: &AppState) {
    let _epoch = next_vosk_epoch(state);
    crate::app_log::log_line(state, "voice", "vosk stop_detach (non-blocking)");
    release_vosk_capture_handle(state);
}

pub fn voice_vosk_start(
    state: &AppState,
    cfg: &VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
    epoch: u64,
) -> Result<(), String> {
    if !vosk_epoch_matches(state, epoch) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("vosk start aborted (stale epoch {epoch} before stop)"),
        );
        return Ok(());
    }

    // Release mic level monitor / prior handle without invalidating *this* start epoch.
    release_vosk_capture_handle(state);
    clear_vosk_recognition_state(state);

    if !vosk_epoch_matches(state, epoch) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("vosk start aborted (stale epoch {epoch} after stop)"),
        );
        return Ok(());
    }

    *state.voice_vosk_state.lock() = "starting".into();

    let probe = probe_vosk_resources(cfg, resource_dir.as_deref());
    *state.voice_vosk_probe.lock() = Some(probe.clone());

    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap phase=model_open engine=vosk begin {}",
            crate::ui_heartbeat::ui_hb_diag()
        ),
    );
    // Clone grammar while holding cfg briefly — never keep cfg locked across model open
    // (start_voice_vosk can take seconds; holding the lock 假死'd IPC / UI on launch).
    let grammar = crate::scene_config::vosk_grammar_phrases_for_cfg(&state.cfg.lock());
    let strategy = crate::scene_config::voice_listening_strategy(&state.cfg.lock());
    // Enhanced/auto need live partials on home + debug; resourceSaver keeps VAD gate.
    let continuous_asr = !matches!(strategy, "resourceSaver" | "off");
    match start_voice_vosk(
        cfg.clone(),
        resource_dir,
        grammar,
        Some(state.audio_frame_bus.publisher()),
        Arc::clone(&state.settings_asr_quiet),
        continuous_asr,
    ) {
        Ok(handle) => {
            crate::app_log::log_line(
                state,
                "voice",
                &format!(
                    "voice_bootstrap phase=model_open engine=vosk ok {}",
                    crate::ui_heartbeat::ui_hb_diag()
                ),
            );
            if !vosk_epoch_matches(state, epoch) {
                stop_voice_vosk(handle);
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!("vosk start aborted (stale epoch {epoch} after open)"),
                );
                return Ok(());
            }
            *state.voice_vosk.lock() = Some(handle);
            *state.voice_vosk_last_error.lock() = String::new();
            *state.voice_vosk_state.lock() = "starting".into();
            crate::app_log::log_line(state, "voice", "vosk start worker opened handle");
            Ok(())
        }
        Err(e) => {
            crate::app_log::log_line(
                state,
                "voice",
                &format!(
                    "voice_bootstrap phase=model_open engine=vosk err={} {}",
                    e,
                    crate::ui_heartbeat::ui_hb_diag()
                ),
            );
            if vosk_epoch_matches(state, epoch) {
                let issue = vosk_resource_issue(&probe).unwrap_or("start_failed");
                *state.voice_vosk_last_error.lock() = if issue == "model_missing" {
                    format!("model_missing:{}", probe.resolved_model_path)
                } else if issue == "dll_missing" {
                    format!("dll_missing:{}", probe.resolved_dll_path)
                } else {
                    e.clone()
                };
                *state.voice_vosk_state.lock() = "error".into();
            }
            Err(e)
        }
    }
}

fn phrase_matches_vosk_preset(preset: &str, phrase: &str) -> bool {
    let p = phrase.trim();
    if p.is_empty() {
        return false;
    }
    let has_cjk = p.chars().any(|c| {
        matches!(
            c,
            '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{F900}'..='\u{FAFF}'
        )
    });
    let has_latin = p.chars().any(|c| c.is_ascii_alphabetic());
    match preset.trim() {
        "en-light" => has_latin && !has_cjk,
        "cn-light" => has_cjk || !has_latin,
        _ => true,
    }
}

fn clear_active_mapping_vosk_preset_override(cfg: &mut crate::config::VoiceConfig) {
    let active_id = cfg.active_scene_id.clone();
    if let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == active_id) {
        if let Some(ref mut ov) = mapping.voice_override {
            ov.model_preset = None;
        }
        mapping.voice_override = normalize_voice_override(mapping.voice_override.take());
    }
}

pub fn spawn_voice_vosk_start(
    state: Arc<AppState>,
    cfg: VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
    app: Option<AppHandle>,
) {
    let epoch = next_vosk_epoch(state.as_ref());
    *state.voice_vosk_state.lock() = "starting".into();
    *state.voice_vosk_last_error.lock() = String::new();
    std::thread::Builder::new()
        .name("voice-vosk-start".into())
        .spawn(move || {
            match voice_vosk_start(state.as_ref(), &cfg, resource_dir, epoch) {
                Ok(()) => {
                    crate::voice_bootstrap::on_engine_start_ok(
                        state.as_ref(),
                        crate::scene_config::DesiredVoiceEngine::Vosk,
                    );
                }
                Err(e) => {
                    crate::app_log::sync_emergency_line("rs", &format!("voice_vosk background start failed: {e}"));
                    let code = {
                        let err = state.voice_vosk_last_error.lock().clone();
                        if err.contains("model_missing") {
                            "model_missing"
                        } else if err.contains("dll_missing") {
                            "dll_missing"
                        } else {
                            "start_failed"
                        }
                    };
                    crate::voice_bootstrap::on_engine_start_failed(
                        app.as_ref(),
                        &state,
                        crate::voice_bootstrap::DegradeFailedEngine::Vosk,
                        code,
                    );
                }
            }
            crate::audio_win::request_recording_audio_policy_sync(Arc::clone(&state));
        })
        .ok();
}

/// End-phrase changes apply live from config; only grammar mode needs a Vosk reload.
pub fn maybe_restart_vosk_for_grammar(app: &AppHandle, state: &Arc<AppState>) {
    let cfg = state.cfg.lock().clone();
    if !cfg.voice_vosk.enabled {
        return;
    }
    if *state.voice_vosk_grammar_mode.lock() != Some(true) {
        return;
    }
    crate::voice_bootstrap::activate_desired_engine(app, state, "force:vosk_grammar_reload");
}

pub fn voice_vosk_stop(state: &AppState) {
    if let Some(handle) = state.voice_vosk.lock().take() {
        stop_voice_vosk(handle);
    }
    *state.voice_vosk_state.lock() = "stopped".into();
}

fn clear_vosk_recognition_state(state: &AppState) {
    *state.voice_vosk_last_partial.lock() = String::new();
    *state.voice_vosk_last_final.lock() = String::new();
    *state.voice_vosk_last_skip.lock() = String::new();
    *state.voice_vosk_last_detected_phrase.lock() = String::new();
    *state.voice_vosk_last_error.lock() = String::new();
    *state.voice_vosk_grammar_mode.lock() = None;
    *state.voice_vosk_model_load_time_ms.lock() = None;
}

fn tick_cooldown_state(state: &AppState) {
    let mut current = state.voice_vosk_state.lock();
    if *current == "error" || *current == "stopped" || *current == "stopping" {
        return;
    }

    let cooldown = state.voice_vosk_cooldown_until.lock();
    if let Some(until) = *cooldown {
        if Instant::now() < until {
            if *current != "cooldown" && *current != "triggered" {
                *current = "cooldown".into();
            }
            return;
        }
    }
    drop(cooldown);

    if state.voice_vosk.lock().is_some() {
        // ModelLoaded sets model_load_time_ms before the worker reaches the audio loop.
        // Promote stale "starting" once the model is loaded so FE stops the download loop.
        if *current == "starting" {
            if state.voice_vosk_model_load_time_ms.lock().is_some() {
                *current = "listening".into();
            }
        } else if *current != "listening" && *current != "cooldown" && *current != "triggered" {
            *current = "listening".into();
        }
    }
}

fn emit_vosk_mic_level(app: &AppHandle, state: &AppState, level: u32) {
    // Settings voiceWake already paints enough; mic_level flood → idle 假死.
    if *state.settings_drawer_open.lock() {
        state.mic_level.set("", level);
        return;
    }
    let payload = serde_json::json!({
        "type": "mic_level",
        "deviceId": "",
        "level": level,
    });
    crate::ipc::emit_to_main_if_available(app, Some(state), payload);
}

pub fn drain_voice_vosk_events(state: &Arc<AppState>, app: &AppHandle) {
    let events: Vec<VoiceVoskEvent> = {
        let guard = state.voice_vosk.lock();
        let Some(handle) = guard.as_ref() else {
            // Drop before acoustic sync — holding voice_vosk across sync/stop let
            // settings_park stop_sync + status IPC wait ~165s (UI_HB_STALL).
            drop(guard);
            tick_cooldown_state(state);
            // Only sync acoustic runtime when vosk was previously active and stopped;
            // skip during early boot when handle was never created (avoids lock
            // contention on cfg/state that contributed to launch freezes).
            let st = state.voice_vosk_state.lock();
            let was_active = *st == "stopped" || *st == "error";
            drop(st);
            if was_active {
                crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(app), state);
            }
            return;
        };
        let mut out = Vec::new();
        while let Some(ev) = handle.try_recv() {
            out.push(ev);
        }
        out
    };

    for ev in events {
        match ev {
            VoiceVoskEvent::StateChanged(s) => {
                if s == "stopped" || s == "error" {
                    state.mic_level.clear();
                    emit_vosk_mic_level(app, state.as_ref(), 0);
                }
                *state.voice_vosk_state.lock() = s.clone();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_STATE_CHANGED,
                    &format!("vosk state: {s}"),
                    Some(serde_json::json!({ "engine": "vosk", "state": s })),
                );
            }
            VoiceVoskEvent::Error(e) => {
                state.mic_level.clear();
                emit_vosk_mic_level(app, state.as_ref(), 0);
                *state.voice_vosk_last_error.lock() = e.clone();
                *state.voice_vosk_state.lock() = "error".into();
                crate::runtime_event::publish_runtime_event(
                    Some(app),
                    state.as_ref(),
                    "voice",
                    crate::runtime_event::kind::VOICE_ERROR,
                    &format!("vosk error: {e}"),
                    Some(serde_json::json!({ "engine": "vosk", "error": e })),
                );
                crate::tray::refresh_menu(app);
            }
            VoiceVoskEvent::Level { level } => {
                state.mic_level.set("", level);
                emit_vosk_mic_level(app, state.as_ref(), level);
            }
            VoiceVoskEvent::Partial(text) => {
                *state.voice_vosk_last_partial.lock() = text.clone();
                // Push to JS so the home page can render real-time heard text without
                // waiting for cmd_voice_vosk_status polling (which is 2-3s).
                // Worker already throttles to PARTIAL_MIN_INTERVAL (100ms) + dedups by text,
                // so this emit is bounded.
                let payload = serde_json::json!({
                    "type": "vosk_text",
                    "kind": "partial",
                    "text": text,
                });
                crate::ipc::emit_to_main_if_available(app, Some(state), payload);
                maybe_nudge_overlay_for_voice(app, state, &text);
            }
            VoiceVoskEvent::Final(text) => {
                *state.voice_vosk_last_final.lock() = text.clone();
                let payload = serde_json::json!({
                    "type": "vosk_text",
                    "kind": "final",
                    "text": text,
                });
                crate::ipc::emit_to_main_if_available(app, Some(state), payload);
                maybe_nudge_overlay_for_voice(app, state, &text);
                crate::voice_end_runtime::try_match_end_phrase_on_final(state, app, &text);
                try_route_vosk_final_phrase(state, app, &text);
                if crate::voice_end_runtime::session_state(state) == "idle" {
                    let phrases = crate::voice_end_runtime::idle_wake_phrases(&state.cfg.lock());
                    if let Some(reason) =
                        crate::voice_vosk::wake_text_rejection_reason(&text, &phrases)
                    {
                        *state.voice_vosk_last_skip.lock() = reason;
                    }
                }
            }
            VoiceVoskEvent::GrammarMode { grammar, note } => {
                *state.voice_vosk_grammar_mode.lock() = Some(grammar);
                *state.voice_vosk_last_skip.lock() = note;
            }
            VoiceVoskEvent::ModelLoaded { load_time_ms } => {
                *state.voice_vosk_model_load_time_ms.lock() = Some(load_time_ms);
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!(
                        "voice_bootstrap phase=worker_ready engine=vosk load_time_ms={load_time_ms} {}",
                        crate::ui_heartbeat::ui_hb_diag()
                    ),
                );
            }
            VoiceVoskEvent::Detected { phrase, text } => {
                if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                    *state.voice_vosk_last_skip.lock() = reason.into();
                    *state.voice_vosk_last_trigger.lock() = String::new();
                    continue;
                }
                let route = {
                    let cfg = state.cfg.lock();
                    let is_start = crate::voice_end_runtime::is_start_phrase(&cfg, &phrase);
                    let is_beginner = crate::cursor_beginner::probe_ok()
                        && crate::cursor_beginner::is_beginner_voice_phrase(&phrase);
                    is_start || is_beginner
                };
                if !route {
                    continue;
                }
                *state.voice_vosk_last_detected_phrase.lock() = phrase.clone();
                *state.voice_vosk_last_final.lock() = text;
                process_detected(state, app, &phrase);
            }
        }
    }

    tick_cooldown_state(state);
    // Throttle acoustic sync — was every drain (~40ms) with full cfg clone.
    {
        use std::sync::atomic::{AtomicU64, Ordering};
        use std::time::{SystemTime, UNIX_EPOCH};
        static LAST_AC_SYNC_MS: AtomicU64 = AtomicU64::new(0);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let prev = LAST_AC_SYNC_MS.load(Ordering::Relaxed);
        if now.saturating_sub(prev) >= 500 {
            LAST_AC_SYNC_MS.store(now, Ordering::Relaxed);
            crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(app), state);
        }
    }
}

fn process_detected(state: &Arc<AppState>, app: &AppHandle, phrase: &str) {
    let cooldown_ms = {
        let cfg = state.cfg.lock();
        cfg.voice_vosk.cooldown_ms
    };

    if *state.paused.lock() {
        *state.voice_vosk_last_skip.lock() = "?????????????????".into();
        *state.voice_vosk_last_trigger.lock() = String::new();
        return;
    }
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        // Keep lastDetectedPhrase for PhrasePractice; do not inject IME / steal focus.
        *state.voice_vosk_last_skip.lock() = "语音练习台中，仅本页听写测试。".into();
        *state.voice_vosk_last_trigger.lock() = String::new();
        return;
    }

    if let Some(remain_ms) =
        crate::voice_end_runtime::wake_key_cooldown_remaining_ms(state, cooldown_ms)
    {
        *state.voice_vosk_last_skip.lock() = format!("???????? {remain_ms} ms ????");
        *state.voice_vosk_last_trigger.lock() = String::new();
        *state.voice_vosk_state.lock() = "cooldown".into();
        return;
    }

    let now = Instant::now();
    *state.voice_vosk_cooldown_until.lock() =
        Some(now + Duration::from_millis(crate::voice_end_runtime::wake_key_gap_ms(cooldown_ms)));

    let state2 = Arc::clone(state);
    let app2 = app.clone();
    let detection = crate::voice_command_router::VoiceDetection::wake("vosk", phrase, None);
    std::thread::spawn(move || {
        if crate::send_guard::is_active() {
            *state2.voice_vosk_last_skip.lock() = "?????????????".into();
        }
        let result = crate::voice_command_router::handle_detection(&state2, &app2, &detection);
        *state2.voice_vosk_state.lock() = if result.handled {
            "triggered".into()
        } else if result.skipped {
            "listening".into()
        } else {
            "error".into()
        };
        if result.skipped || !result.handled {
            if !result.skip_reason.is_empty() {
                *state2.voice_vosk_last_skip.lock() = result.skip_reason;
            }
            if !result.handled {
                *state2.voice_vosk_last_trigger.lock() = String::new();
            }
            if !result.handled && !result.skipped {
                *state2.voice_vosk_last_error.lock() = "???????".into();
            }
        } else {
            *state2.voice_vosk_last_error.lock() = String::new();
            *state2.voice_vosk_last_skip.lock() = String::new();
            *state2.voice_vosk_last_trigger.lock() = result.trigger_label;
        }
    });
}

pub fn voice_vosk_status(state: &AppState, resource_dir: Option<PathBuf>) -> serde_json::Value {
    let (voice_vosk, target_key, phrases, cooldown_ms) = {
        let cfg = state.cfg.lock();
        let target_key =
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_vosk.target_key);
        let phrases = crate::voice_end_runtime::idle_wake_phrases(&cfg);
        let voice_vosk = cfg.voice_vosk.clone();
        let cooldown_ms = cfg.voice_vosk.cooldown_ms;
        (voice_vosk, target_key, phrases, cooldown_ms)
    };
    // Must allow FS: empty-cache + allow_fs=false invented dll_exists=false → FE
    // showed「本地识别组件缺失」every poll even when libvosk.dll was on disk.
    // Probe is a few Path::is_file checks; not the stop_sync stall path.
    let probe = cached_vosk_probe_opts(state, &voice_vosk, resource_dir.as_deref(), true);
    let resources_dir = crate::voice_vosk::vosk_resources_dir(resource_dir.as_deref());
    let resource_issue = crate::voice_vosk::vosk_resource_issue(&probe);
    let download_url = crate::voice_vosk::vosk_model_download_url(&probe.model_preset)
        .unwrap_or("https://alphacephei.com/vosk/models");
    let cfg_snap = state.cfg.lock().clone();
    let supervisor = crate::voice_bootstrap::supervisor_desired_engine(
        state,
        &cfg_snap,
        resource_dir.as_deref(),
    );
    let vosk_enabled = supervisor == crate::scene_config::DesiredVoiceEngine::Vosk
        || state.voice_vosk.lock().is_some();
    let mut value = serde_json::json!({
        "enabled": vosk_enabled,
        "state": state.voice_vosk_state.lock().clone(),
        "lastError": state.voice_vosk_last_error.lock().clone(),
        "lastPartial": state.voice_vosk_last_partial.lock().clone(),
        "lastFinal": state.voice_vosk_last_final.lock().clone(),
        "lastSkip": state.voice_vosk_last_skip.lock().clone(),
        "lastTrigger": state.voice_vosk_last_trigger.lock().clone(),
        "lastDetectedPhrase": state.voice_vosk_last_detected_phrase.lock().clone(),
        "phrases": phrases,
        "targetKey": target_key,
        "cooldownMs": cooldown_ms,
        "modelPath": probe.model_path,
        "modelPreset": probe.model_preset,
        "resolvedModelPath": probe.resolved_model_path,
        "resolvedDllPath": probe.resolved_dll_path,
        "modelExists": probe.model_exists,
        "dllExists": probe.dll_exists,
        "libExists": probe.lib_exists,
        "grammarMode": state.voice_vosk_grammar_mode.lock().clone(),
        "modelLoadTimeMs": state.voice_vosk_model_load_time_ms.lock().clone(),
        "resourceIssue": resource_issue,
        "resourcesDir": resources_dir.display().to_string(),
        "modelDownloadUrl": download_url,
    });
    crate::voice_bootstrap::attach_supervisor_status(state, &mut value);
    value
}

fn cached_vosk_probe(
    state: &AppState,
    cfg: &VoiceVoskConfig,
    resource_dir: Option<&std::path::Path>,
) -> VoskResourceProbe {
    cached_vosk_probe_opts(state, cfg, resource_dir, true)
}

fn cached_vosk_probe_opts(
    state: &AppState,
    cfg: &VoiceVoskConfig,
    resource_dir: Option<&std::path::Path>,
    allow_fs: bool,
) -> VoskResourceProbe {
    if let Some(probe) = state.voice_vosk_probe.lock().clone() {
        return probe;
    }
    // allow_fs=false used to return dll_exists=false (unprobed) → FE 「组件缺失」spam.
    // Always probe when cache empty; is_file checks are cheap.
    let _ = allow_fs;
    let probe = probe_vosk_resources(cfg, resource_dir);
    *state.voice_vosk_probe.lock() = Some(probe.clone());
    probe
}

pub fn refresh_vosk_probe_cache(state: &AppState, resource_dir: Option<&std::path::Path>) {
    let cfg = state.cfg.lock().voice_vosk.clone();
    *state.voice_vosk_probe.lock() = Some(probe_vosk_resources(&cfg, resource_dir));
}

pub fn voice_vosk_set_enabled(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    enabled: bool,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        if enabled {
            crate::config::apply_desired_engine(&mut cfg, "vosk");
        } else if crate::config::parse_desired_engine_label(&cfg.desired_engine)
            == Some(crate::scene_config::DesiredVoiceEngine::Vosk)
        {
            crate::config::apply_desired_engine(&mut cfg, "none");
        }
        cfg.normalize();
        save_config(&cfg);
    }

    crate::voice_bootstrap::activate_desired_engine(
        window.app_handle(),
        state,
        if enabled {
            "vosk_set_enabled"
        } else {
            "vosk_set_disabled"
        },
    );

    if !enabled {
        let state2 = Arc::clone(state);
        let resource_dir2 = resource_dir.clone();
        std::thread::Builder::new()
            .name("voice-vosk-probe".into())
            .spawn(move || {
                refresh_vosk_probe_cache(state2.as_ref(), resource_dir2.as_deref());
            })
            .ok();
    }

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_phrases(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrases: Vec<String>,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let cleaned = clean_phrases(phrases);
    let old_cfg = state.cfg.lock().clone();
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.phrases = if cleaned.is_empty() {
            vec!["????".into()]
        } else {
            cleaned
        };
        cfg.normalize();
        save_config(&cfg);
    }
    let new_cfg = state.cfg.lock().clone();
    crate::voice_bootstrap::apply_voice_config_change(app, state, &old_cfg, &new_cfg);

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_model_preset(
    state: &Arc<AppState>,
    app: &AppHandle,
    preset: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let preset = preset.trim().to_string();
    if preset.is_empty() {
        return Err("model preset is empty".into());
    }
    if preset != "custom" && vosk_preset_model_path(&preset).is_none() {
        return Err(format!("unknown model preset: {preset}"));
    }

    let old_cfg = state.cfg.lock().clone();
    {
        let mut cfg = state.cfg.lock();
        let old_preset = cfg.voice_vosk.model_preset.clone();
        let old_defaults = vosk_preset_default_phrases(&old_preset).unwrap_or_default();
        cfg.voice_vosk.model_preset = preset.clone();
        if preset != "custom" {
            if let Some(path) = vosk_preset_model_path(&preset) {
                cfg.voice_vosk.model_path = path.to_string();
            }
            if let Some(defaults) = vosk_preset_default_phrases(&preset) {
                let custom: Vec<String> = cfg
                    .voice_vosk
                    .phrases
                    .iter()
                    .filter(|p| !old_defaults.iter().any(|d| d == *p))
                    .filter(|p| phrase_matches_vosk_preset(&preset, p))
                    .cloned()
                    .collect();
                cfg.voice_vosk.phrases = append_unique_phrases(defaults, &custom);
            }
        }
        clear_active_mapping_vosk_preset_override(&mut cfg);
        cfg.normalize();
        save_config(&cfg);
    }
    let new_cfg = state.cfg.lock().clone();
    crate::voice_bootstrap::apply_voice_config_change(app, state, &old_cfg, &new_cfg);

    Ok(voice_vosk_status(state, resource_dir))
}

pub fn voice_vosk_set_model_path(
    state: &Arc<AppState>,
    app: &AppHandle,
    path: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("model path is empty".into());
    }

    let old_cfg = state.cfg.lock().clone();
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_vosk.model_preset = "custom".into();
        cfg.voice_vosk.model_path = path;
        cfg.normalize();
        save_config(&cfg);
    }
    let new_cfg = state.cfg.lock().clone();
    crate::voice_bootstrap::apply_voice_config_change(app, state, &old_cfg, &new_cfg);

    Ok(voice_vosk_status(state, resource_dir))
}

fn clean_phrases(phrases: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    for phrase in phrases {
        let p = phrase.trim();
        if p.is_empty() {
            continue;
        }
        if !out.iter().any(|x: &String| x == p) {
            out.push(p.to_string());
        }
    }
    out
}

pub fn voice_vosk_test_send(state: &AppState, window: &WebviewWindow) -> serde_json::Value {
    if *state.paused.lock() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "paused",
        });
    }
    if *state.recording.lock() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "recording",
        });
    }

    let (key, duration_ms) = {
        let cfg = state.cfg.lock();
        (
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_vosk.target_key),
            cfg.key_press_duration_ms,
        )
    };

    if key.trim().is_empty() {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "no_target",
        });
    }

    if !crate::key_chord::chord_is_sendable(key.trim()) {
        return serde_json::json!({
            "type": "mvp_voice_vosk_test_sent",
            "ok": false,
            "reason": "invalid_key",
            "key": key,
        });
    }

    let ok = crate::voice_end_runtime::send_wake_to_target(
        Some(state),
        Some(&window.app_handle()),
        &key,
        duration_ms,
    );
    serde_json::json!({
        "type": "mvp_voice_vosk_test_sent",
        "ok": ok,
        "reason": if ok { "sent" } else { "send_failed" },
        "key": key,
    })
}

pub fn voice_vosk_open_resources_dir(resource_dir: Option<PathBuf>) -> Result<(), String> {
    let dir = crate::voice_vosk::vosk_resources_dir(resource_dir.as_deref());
    crate::voice_vosk::open_path_in_explorer(&dir)
}

pub fn voice_vosk_retry_start(
    app: &AppHandle,
    state: &Arc<AppState>,
    resource_dir: Option<PathBuf>,
) -> serde_json::Value {
    refresh_vosk_probe_cache(state, resource_dir.as_deref());
    let st = state.voice_vosk_state.lock().clone();
    let healthy = matches!(st.as_str(), "listening" | "cooldown" | "triggered")
        && state.voice_vosk.lock().is_some();
    // Already listening: soft activate (noop). Otherwise force reload stuck/error handles.
    let reason = if healthy {
        "vosk_retry_start"
    } else {
        "force:vosk_retry_start"
    };
    // Enqueue — sync activate on the IPC thread stacked with overlay kws reload
    // and held ACTIVATE_LOCK → voiceStatusPoll UI_HB_STALL_5S / 假死.
    crate::voice_supervisor::enqueue_activate(app.clone(), Arc::clone(state), reason);
    voice_vosk_status(state, resource_dir)
}
