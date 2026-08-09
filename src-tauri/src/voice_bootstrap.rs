//! Voice engine supervisor (control plane) — sole scheduling core.
//!
//! External callers (IPC, FE, acoustic, mic) must only use these public APIs:
//! - [`activate_desired_engine`] — exclusive stop peers → start desired
//! - [`acquire_mic_lease`] / [`MicLease::release`] — record / external capture
//! - [`pause_voice_engines`] / [`resume_voice_engines`] — listen pause
//! - [`apply_voice_config_change`] — fingerprint / desired changes after config write
//!
//! Epoch rule: only supervisor cancel via `*_stop_sync` bumps engine epochs.
//! Engine start workers may only `release_*_capture_handle` (never bump).
//! Reasons prefixed with `force:` bypass noop / skip-while-starting (config reload).
//!
//! Runtime modules may only start/stop **themselves**; they must not stop peers.
//! Runtime-only paths never mutate config enabled flags or call save_config.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Manager};

use crate::config::{VoiceConfig, VoiceKwsConfig, VoiceVoskConfig};
use crate::scene_config::DesiredVoiceEngine as EffectiveVoiceEngine;
use crate::voice_kws_runtime;
use crate::voice_sapi_runtime;
use crate::voice_vosk_runtime;
use crate::AppState;

pub use onetone_logic::voice_reload::DesiredVoiceEngine;

/// Serialize activate across strategy IPC spawn + config watcher to avoid interleaved stop/start.
static ACTIVATE_LOCK: Mutex<()> = Mutex::new(());

/// Count of async activate jobs spawned from strategy IPC (set before thread acquires ACTIVATE_LOCK).
static ACTIVATE_ASYNC_PENDING: AtomicUsize = AtomicUsize::new(0);

fn log_bootstrap_phase(state: &AppState, t0: Instant, phase: &str, detail: &str) {
    let elapsed = t0.elapsed().as_millis();
    let hb = crate::ui_heartbeat::ui_hb_diag();
    let msg = if detail.is_empty() {
        format!("voice_bootstrap phase={phase} elapsed_ms={elapsed} {hb}")
    } else {
        format!("voice_bootstrap phase={phase} {detail} elapsed_ms={elapsed} {hb}")
    };
    crate::app_log::log_line(state, "voice", &msg);
}

/// Mark that a background activate was scheduled (FE must wait before draining the next switch).
pub fn begin_activate_async() {
    ACTIVATE_ASYNC_PENDING.fetch_add(1, Ordering::SeqCst);
}

pub fn end_activate_async() {
    ACTIVATE_ASYNC_PENDING.fetch_sub(1, Ordering::SeqCst);
}

pub fn activate_busy() -> bool {
    // Prefer single-worker supervisor busy flag; fall back to lock for sync paths.
    if crate::voice_supervisor::activate_busy() {
        return true;
    }
    if ACTIVATE_ASYNC_PENDING.load(Ordering::SeqCst) > 0 {
        return true;
    }
    match ACTIVATE_LOCK.try_lock() {
        Ok(_guard) => false,
        Err(std::sync::TryLockError::WouldBlock) => true,
        Err(std::sync::TryLockError::Poisoned(_)) => true,
    }
}

fn voice_reload_snapshot(cfg: &VoiceConfig) -> onetone_logic::voice_reload::VoiceReloadConfig {
    onetone_logic::voice_reload::VoiceReloadConfig {
        vosk: onetone_logic::voice_reload::VoiceVoskReload {
            enabled: cfg.voice_vosk.enabled,
            phrases: cfg.voice_vosk.phrases.clone(),
            model_path: cfg.voice_vosk.model_path.clone(),
            model_preset: cfg.voice_vosk.model_preset.clone(),
            target_key: cfg.voice_vosk.target_key.clone(),
            cooldown_ms: cfg.voice_vosk.cooldown_ms,
        },
        sapi: onetone_logic::voice_reload::VoiceSapiReload {
            enabled: cfg.voice_sapi.enabled,
            phrases: cfg.voice_sapi.phrases.clone(),
            min_confidence: cfg.voice_sapi.min_confidence,
            target_key: cfg.voice_sapi.target_key.clone(),
            cooldown_ms: cfg.voice_sapi.cooldown_ms,
        },
        kws: onetone_logic::voice_reload::VoiceKwsReload {
            enabled: cfg.voice_kws.enabled,
            phrases: cfg.voice_kws.phrases.clone(),
            model_path: cfg.voice_kws.model_path.clone(),
            model_preset: cfg.voice_kws.model_preset.clone(),
            target_key: cfg.voice_kws.target_key.clone(),
            cooldown_ms: cfg.voice_kws.cooldown_ms,
        },
        voice_end: onetone_logic::voice_reload::VoiceEndReload {
            enabled: cfg.voice_end.enabled,
            phrases_zh: cfg.voice_end.phrases_zh.clone(),
            phrases_en: cfg.voice_end.phrases_en.clone(),
            cancel_phrases_zh: cfg.voice_end.cancel_phrases_zh.clone(),
            cancel_phrases_en: cfg.voice_end.cancel_phrases_en.clone(),
            send_phrases_zh: cfg.voice_end.send_phrases_zh.clone(),
            send_phrases_en: cfg.voice_end.send_phrases_en.clone(),
            send_mode: cfg.voice_end.send_mode.clone(),
        },
    }
}

fn voice_engine_state_is_busy(state: &str) -> bool {
    matches!(
        state,
        "starting" | "listening" | "cooldown" | "triggered" | "stopping"
    )
}

fn voice_engine_state_is_transition(state: &str) -> bool {
    matches!(state, "starting" | "stopping")
}

fn resolve_strategy_engine(
    strategy: &str,
    kws_ready: bool,
    advanced_engine: EffectiveVoiceEngine,
) -> EffectiveVoiceEngine {
    match strategy {
        "auto" => {
            if kws_ready {
                EffectiveVoiceEngine::Kws
            } else {
                EffectiveVoiceEngine::Vosk
            }
        }
        // KWS not ready → keep Vosk (same as auto). Desired=none stopped listening on every
        // 省电 click, then 增强 cold-started the model → UI_HB stall / 未响应.
        "resourceSaver" => {
            if kws_ready {
                EffectiveVoiceEngine::Kws
            } else {
                EffectiveVoiceEngine::Vosk
            }
        }
        "enhanced" => EffectiveVoiceEngine::Vosk,
        "off" => EffectiveVoiceEngine::None,
        _ => advanced_engine,
    }
}

pub fn supervisor_desired_engine(
    state: &AppState,
    cfg: &VoiceConfig,
    resource_dir: Option<&std::path::Path>,
) -> EffectiveVoiceEngine {
    resolve_supervisor_desired_engine(state, cfg, resource_dir)
}

fn resolve_supervisor_desired_engine(
    state: &AppState,
    cfg: &VoiceConfig,
    resource_dir: Option<&std::path::Path>,
) -> EffectiveVoiceEngine {
    let strategy = crate::scene_config::voice_listening_strategy(cfg);
    let advanced_engine = crate::scene_config::idle_desired_voice_engine(cfg);
    // Never FS-probe here — attach_supervisor_status runs on every voice_*_status.
    let _ = resource_dir;
    let ready = crate::voice_kws_runtime::kws_readiness_cached(state, cfg);
    resolve_strategy_engine(strategy, ready.ready, advanced_engine)
}

pub fn desired_voice_engine(cfg: &VoiceConfig) -> DesiredVoiceEngine {
    onetone_logic::voice_reload::desired_voice_engine(&voice_reload_snapshot(cfg))
}

fn engine_label(engine: EffectiveVoiceEngine) -> &'static str {
    match engine {
        EffectiveVoiceEngine::None => "none",
        EffectiveVoiceEngine::Vosk => "vosk",
        EffectiveVoiceEngine::Sapi => "sapi",
        EffectiveVoiceEngine::Kws => "kws",
    }
}

pub fn kws_runtime_relevant_changed(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    onetone_logic::voice_reload::kws_runtime_relevant_changed(
        &voice_reload_snapshot(old),
        &voice_reload_snapshot(new),
    )
}

pub fn vosk_runtime_relevant_changed(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    onetone_logic::voice_reload::vosk_runtime_relevant_changed(
        &voice_reload_snapshot(old),
        &voice_reload_snapshot(new),
    )
}

pub fn sapi_runtime_relevant_changed(old: &VoiceConfig, new: &VoiceConfig) -> bool {
    onetone_logic::voice_reload::sapi_runtime_relevant_changed(
        &voice_reload_snapshot(old),
        &voice_reload_snapshot(new),
    )
}

fn observe_running_engine(state: &AppState) -> EffectiveVoiceEngine {
    let vosk_busy = state.voice_vosk.lock().is_some()
        || voice_engine_state_is_busy(state.voice_vosk_state.lock().as_str());
    let kws_busy = state.voice_kws.lock().is_some()
        || voice_engine_state_is_busy(state.voice_kws_state.lock().as_str());
    let sapi_busy = state.voice_sapi.lock().is_some()
        || voice_engine_state_is_busy(state.voice_sapi_state.lock().as_str());
    // Prefer Vosk, then KWS, then SAPI if multiple appear (should not happen after M1).
    if vosk_busy {
        EffectiveVoiceEngine::Vosk
    } else if kws_busy {
        EffectiveVoiceEngine::Kws
    } else if sapi_busy {
        EffectiveVoiceEngine::Sapi
    } else {
        EffectiveVoiceEngine::None
    }
}

fn engine_handle_alive(state: &AppState, engine: EffectiveVoiceEngine) -> bool {
    match engine {
        EffectiveVoiceEngine::Vosk => state.voice_vosk.lock().is_some(),
        EffectiveVoiceEngine::Sapi => state.voice_sapi.lock().is_some(),
        EffectiveVoiceEngine::Kws => state.voice_kws.lock().is_some(),
        EffectiveVoiceEngine::None => false,
    }
}

fn engine_transition_busy(state: &AppState, engine: EffectiveVoiceEngine) -> bool {
    let s = match engine {
        EffectiveVoiceEngine::Vosk => state.voice_vosk_state.lock().clone(),
        EffectiveVoiceEngine::Sapi => state.voice_sapi_state.lock().clone(),
        EffectiveVoiceEngine::Kws => state.voice_kws_state.lock().clone(),
        EffectiveVoiceEngine::None => return false,
    };
    voice_engine_state_is_transition(&s)
}

fn log_supervisor_switch(
    app: Option<&AppHandle>,
    state: &AppState,
    desired: EffectiveVoiceEngine,
    from: EffectiveVoiceEngine,
    to: EffectiveVoiceEngine,
    reason: &str,
    fingerprint_changed: bool,
    extra: Option<serde_json::Value>,
) {
    let mut payload = serde_json::json!({
        "source": "voice_bootstrap",
        "desiredEngine": engine_label(desired),
        "fromEngine": engine_label(from),
        "toEngine": engine_label(to),
        "reason": reason,
        "fingerprintChanged": fingerprint_changed,
    });
    if let Some(extra) = extra {
        if let Some(obj) = payload.as_object_mut() {
            if let Some(extra_obj) = extra.as_object() {
                for (k, v) in extra_obj {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }
    }
    let msg = format!(
        "voice_bootstrap switch desired={} from={} to={} reason={} fingerprintChanged={}",
        engine_label(desired),
        engine_label(from),
        engine_label(to),
        reason,
        fingerprint_changed
    );
    crate::app_log::log_line(state, "voice", &msg);
    crate::runtime_event::publish_runtime_event(
        app,
        state,
        "voice",
        crate::runtime_event::kind::VOICE_RESTART,
        &msg,
        Some(payload),
    );
}

fn start_self_engine(
    app: &AppHandle,
    state: &Arc<AppState>,
    engine: EffectiveVoiceEngine,
    reason: &str,
) {
    let cfg = state.cfg.lock().clone();
    match engine {
        EffectiveVoiceEngine::Vosk => {
            start_self_vosk(
                app,
                state,
                crate::scene_config::vosk_config_for_runtime(&cfg, true),
                reason,
            );
        }
        EffectiveVoiceEngine::Sapi => {
            let _ = voice_sapi_runtime::start_voice_sapi_runtime_only(
                state,
                crate::scene_config::sapi_config_for_runtime(&cfg, true),
                reason,
                Some(app.clone()),
            );
        }
        EffectiveVoiceEngine::Kws => {
            start_self_kws(
                app,
                state,
                crate::scene_config::kws_config_for_runtime(&cfg, true),
                reason,
            );
        }
        EffectiveVoiceEngine::None => {}
    }
}

fn start_self_vosk(
    app: &AppHandle,
    state: &Arc<AppState>,
    vosk_cfg: VoiceVoskConfig,
    reason: &str,
) {
    if state.voice_vosk.lock().is_some() {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start self vosk ({reason}): handle exists"),
        );
        return;
    }
    // After stop_sync (or a concurrent async stop that already took the handle), always
    // start. Do not skip on stale "stopping" — that left engines dead after fingerprint races.
    crate::app_log::log_line(state, "voice", &format!("start self vosk ({reason})"));
    let resource_dir = app.path().resource_dir().ok();
    voice_vosk_runtime::spawn_voice_vosk_start(
        Arc::clone(state),
        vosk_cfg,
        resource_dir,
        Some(app.clone()),
    );
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
}

fn start_self_kws(app: &AppHandle, state: &Arc<AppState>, kws_cfg: VoiceKwsConfig, reason: &str) {
    if !kws_cfg.enabled {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start self kws ({reason}): effective config disabled"),
        );
        return;
    }
    if state.voice_kws.lock().is_some() {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start self kws ({reason}): handle exists"),
        );
        return;
    }
    let current = state.voice_kws_state.lock().clone();
    if voice_engine_state_is_busy(&current) && current != "stopping" {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("skip start self kws ({reason}): state={current}"),
        );
        return;
    }
    crate::app_log::log_line(state, "voice", &format!("start self kws ({reason})"));
    let resource_dir = app.path().resource_dir().ok();
    voice_kws_runtime::spawn_voice_kws_start(
        Arc::clone(state),
        kws_cfg,
        resource_dir,
        Some(app.clone()),
    );
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
}

/// Stop every wake engine (self-stop only via each runtime API).
pub fn stop_all_voice_engines(app: Option<&AppHandle>, state: &Arc<AppState>, reason: &str) {
    let from = observe_running_engine(state);
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap stop_all reason={} fromEngine={}",
            reason,
            engine_label(from)
        ),
    );
    crate::runtime_event::publish_runtime_event(
        app,
        state.as_ref(),
        "voice",
        crate::runtime_event::kind::VOICE_RESTART,
        &format!("voice_bootstrap stop_all reason={reason}"),
        Some(serde_json::json!({
            "source": "voice_bootstrap",
            "desiredEngine": "none",
            "fromEngine": engine_label(from),
            "toEngine": "none",
            "reason": reason,
            "fingerprintChanged": false,
        })),
    );
    crate::app_log::log_line(state, "voice", "stop self vosk (supervisor)");
    voice_vosk_runtime::voice_vosk_stop_sync(state);
    crate::app_log::log_line(state, "voice", "stop self sapi (supervisor)");
    voice_sapi_runtime::voice_sapi_stop(state);
    crate::app_log::log_line(state, "voice", "stop self kws (supervisor)");
    voice_kws_runtime::voice_kws_stop_sync(state);
    crate::voice_acoustic_runtime::stop_acoustic_match_runtime(state);
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
}

/// Decide whether activate should run, noop, or skip (pure policy for tests).
pub(crate) fn resolve_activate_gate(
    desired: EffectiveVoiceEngine,
    from: EffectiveVoiceEngine,
    handle_alive: bool,
    transitioning: bool,
    reason: &str,
) -> ActivateGate {
    resolve_activate_gate_with_health(
        desired,
        from,
        handle_alive,
        transitioning,
        true, // callers without health info keep prior behavior
        reason,
    )
}

pub(crate) fn resolve_activate_gate_with_health(
    desired: EffectiveVoiceEngine,
    from: EffectiveVoiceEngine,
    handle_alive: bool,
    transitioning: bool,
    running_healthy: bool,
    reason: &str,
) -> ActivateGate {
    let force_reload = reason.starts_with("force:");
    let allow_while_starting =
        force_reload || reason.starts_with("degrade:") || reason == "listen resume";

    // Already listening: skip kill/restart unless caller forces a reload.
    // Stale handle + error/stopped must NOT noop — otherwise download/retry never recovers.
    if !force_reload
        && desired != EffectiveVoiceEngine::None
        && from == desired
        && handle_alive
        && running_healthy
        && !transitioning
    {
        return ActivateGate::NoopAlreadyActive;
    }
    // Still opening: avoid FE deferred-boot canceling bootstrap start.
    if !allow_while_starting
        && desired != EffectiveVoiceEngine::None
        && from == desired
        && transitioning
    {
        return ActivateGate::SkipStillStarting;
    }
    ActivateGate::Proceed
}

fn engine_running_healthy(state: &AppState, engine: EffectiveVoiceEngine) -> bool {
    let s = match engine {
        EffectiveVoiceEngine::Vosk => state.voice_vosk_state.lock().clone(),
        EffectiveVoiceEngine::Sapi => state.voice_sapi_state.lock().clone(),
        EffectiveVoiceEngine::Kws => state.voice_kws_state.lock().clone(),
        EffectiveVoiceEngine::None => return false,
    };
    matches!(s.as_str(), "listening" | "cooldown" | "triggered")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActivateGate {
    NoopAlreadyActive,
    SkipStillStarting,
    Proceed,
}

/// Activate the engine selected by `idle_desired_voice_engine` (exclusive).
///
/// Order: resolve desired → gate (noop / skip-starting) → stop_sync three peers
/// (epoch bump lives here) → start_self(desired) → sync_acoustic_match_runtime.
/// Prefix reason with `force:` to reload an already-listening engine.
pub fn activate_desired_engine(app: &AppHandle, state: &Arc<AppState>, reason: &str) {
    let _guard = ACTIVATE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    activate_desired_engine_locked(app, state, reason);
}

fn activate_desired_engine_locked(app: &AppHandle, state: &Arc<AppState>, reason: &str) {
    let t0 = Instant::now();
    let phase_log = reason == "bootstrap" || reason.starts_with("bootstrap:");
    if phase_log {
        log_bootstrap_phase(state, t0, "begin", &format!("reason={reason}"));
    }
    // Fresh activate retries desired engine; clear previous fallover unless reason is degrade.
    if !reason.starts_with("degrade:") {
        clear_degrade_status(state);
    }
    let cfg = state.cfg.lock().clone();
    let resource_dir = app.path().resource_dir().ok();
    let kws_ready = crate::voice_kws_runtime::kws_readiness(state, &cfg, resource_dir.as_deref());
    let desired = resolve_supervisor_desired_engine(state, &cfg, resource_dir.as_deref());
    let from = observe_running_engine(state);
    let now = onetone_logic::runtime_event::now_ms();
    if desired != EffectiveVoiceEngine::None {
        let prev = state.mic_owner.force_claim(
            onetone_logic::mic_owner::MicOwner::WakeEngine,
            reason,
            now,
        );
        if !matches!(prev, onetone_logic::mic_owner::MicOwner::WakeEngine | onetone_logic::mic_owner::MicOwner::None)
        {
            crate::app_log::log_line(
                state,
                "voice",
                &format!(
                    "mic_owner force_claim wake_engine reason={reason} prev={} detail={}",
                    prev.kind_label(),
                    prev.detail()
                ),
            );
        }
    } else {
        let _ = state.mic_owner.release(
            &onetone_logic::mic_owner::MicOwner::WakeEngine,
            now,
            &format!("activate_none:{reason}"),
        );
        state
            .mic_owner
            .invalidate_level_monitor(now, &format!("activate_none:{reason}"));
    }
    if phase_log {
        log_bootstrap_phase(
            state,
            t0,
            "desired_resolved",
            &format!(
                "desired={} from={}",
                engine_label(desired),
                engine_label(from)
            ),
        );
    }
    if crate::scene_config::voice_listening_strategy(&cfg) == "resourceSaver"
        && desired == EffectiveVoiceEngine::Vosk
        && !kws_ready.ready
    {
        crate::app_log::log_line(
            state,
            "voice",
            &format!(
                "resourceSaver desired=vosk (kws not ready: {})",
                kws_ready.reason
            ),
        );
    }
    let gate = resolve_activate_gate_with_health(
        desired,
        from,
        engine_handle_alive(state, desired),
        engine_transition_busy(state, desired),
        engine_running_healthy(state, desired),
        reason,
    );

    if gate == ActivateGate::NoopAlreadyActive {
        log_supervisor_switch(
            Some(app),
            state,
            desired,
            from,
            desired,
            reason,
            false,
            Some(serde_json::json!({ "action": "noop_already_active" })),
        );
        *state.last_voice_fingerprint.lock() = crate::scene_config::idle_voice_fingerprint(&cfg);
        crate::tray::refresh_tray_tooltip(app, state.as_ref());
        schedule_acoustic_match_sync(Some(app), state);
        if phase_log {
            log_bootstrap_phase(state, t0, "end", "action=noop_already_active");
        }
        return;
    }

    if gate == ActivateGate::SkipStillStarting {
        crate::app_log::log_line(
            state,
            "voice",
            &format!(
                "voice_bootstrap skip activate (desired {} still transitioning) reason={}",
                engine_label(desired),
                reason
            ),
        );
        *state.last_voice_fingerprint.lock() = crate::scene_config::idle_voice_fingerprint(&cfg);
        crate::tray::refresh_tray_tooltip(app, state.as_ref());
        schedule_acoustic_match_sync(Some(app), state);
        if phase_log {
            log_bootstrap_phase(state, t0, "end", "action=skip_still_starting");
        }
        return;
    }

    let busy = engine_transition_busy(state, from) || engine_transition_busy(state, desired);
    if busy {
        crate::app_log::log_line(
            state,
            "voice",
            &format!(
                "voice_bootstrap busy_policy=force_stop_then_activate reason={} from={} to={}",
                reason,
                engine_label(from),
                engine_label(desired)
            ),
        );
    }

    log_supervisor_switch(
        Some(app),
        state,
        desired,
        from,
        desired,
        reason,
        false,
        Some(serde_json::json!({
            "action": "activate",
            "busyForceStop": busy,
        })),
    );

    // Exclusive: sync self-stop peers before start_self (avoids dual listen / handle-exists skip).
    if phase_log {
        log_bootstrap_phase(state, t0, "stop_sync_begin", "peer=vosk");
    }
    crate::app_log::log_line(state, "voice", "stop self vosk (supervisor)");
    voice_vosk_runtime::voice_vosk_stop_sync(state);
    if phase_log {
        log_bootstrap_phase(state, t0, "stop_sync_end", "peer=vosk");
        log_bootstrap_phase(state, t0, "stop_sync_begin", "peer=sapi");
    }
    crate::app_log::log_line(state, "voice", "stop self sapi (supervisor)");
    voice_sapi_runtime::voice_sapi_stop(state);
    if phase_log {
        log_bootstrap_phase(state, t0, "stop_sync_end", "peer=sapi");
        log_bootstrap_phase(state, t0, "stop_sync_begin", "peer=kws");
    }
    crate::app_log::log_line(state, "voice", "stop self kws (supervisor)");
    voice_kws_runtime::voice_kws_stop_sync(state);
    if phase_log {
        log_bootstrap_phase(state, t0, "stop_sync_end", "peer=kws");
    }
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap peers stopped; starting desired={}",
            engine_label(desired)
        ),
    );

    // off/none：停机后尽快释放 ACTIVATE_LOCK，避免 FE 长时间 activateBusy 像假死。
    if desired == EffectiveVoiceEngine::None {
        *state.last_voice_fingerprint.lock() = crate::scene_config::idle_voice_fingerprint(&cfg);
        {
            let app_tip = app.clone();
            let state_tip = Arc::clone(state);
            let _ = std::thread::Builder::new()
                .name("tray-tooltip-refresh".into())
                .spawn(move || {
                    crate::tray::refresh_tray_tooltip(&app_tip, state_tip.as_ref());
                });
        }
        if phase_log {
            log_bootstrap_phase(state, t0, "audio_policy_begin", "desired=none");
        }
        {
            let state_audio = Arc::clone(state);
            let _ = std::thread::Builder::new()
                .name("recording-audio-sync-kick".into())
                .spawn(move || {
                    crate::audio_win::request_recording_audio_policy_sync(state_audio);
                });
        }
        if phase_log {
            log_bootstrap_phase(state, t0, "audio_policy_kicked", "desired=none");
        }
        schedule_acoustic_match_sync(Some(app), state);
        crate::app_log::log_line(
            state,
            "voice",
            &format!(
                "voice_bootstrap activate complete reason={} desired=none",
                reason
            ),
        );
        {
            let state_w = Arc::clone(state);
            let rd = app.path().resource_dir().ok();
            let _ = std::thread::Builder::new()
                .name("kws-probe-warm".into())
                .spawn(move || {
                    voice_kws_runtime::refresh_kws_probe_cache(state_w.as_ref(), rd.as_deref());
                });
        }
        if phase_log {
            log_bootstrap_phase(
                state,
                t0,
                "end",
                &format!("total_ms={} desired=none", t0.elapsed().as_millis()),
            );
        }
        return;
    }

    if phase_log {
        log_bootstrap_phase(
            state,
            t0,
            "start_self_begin",
            &format!("desired={}", engine_label(desired)),
        );
    }
    start_self_engine(app, state, desired, reason);
    if phase_log {
        log_bootstrap_phase(
            state,
            t0,
            "start_self_end",
            &format!("desired={}", engine_label(desired)),
        );
    }

    *state.last_voice_fingerprint.lock() = crate::scene_config::idle_voice_fingerprint(&cfg);
    // Tray tooltip can touch Win UI; never block activate completion on it.
    {
        let app_tip = app.clone();
        let state_tip = Arc::clone(state);
        let _ = std::thread::Builder::new()
            .name("tray-tooltip-refresh".into())
            .spawn(move || {
                crate::tray::refresh_tray_tooltip(&app_tip, state_tip.as_ref());
            });
    }
    if phase_log {
        log_bootstrap_phase(state, t0, "audio_policy_begin", "");
    }
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
    if phase_log {
        log_bootstrap_phase(state, t0, "audio_policy_end", "");
    }
    crate::app_log::log_line(
        state,
        "voice",
        "voice_bootstrap sync acoustic after activate",
    );
    // Defer acoustic sync: never hold ACTIVATE_LOCK across match start/stop (mutex ordering
    // with vosk/kws state caused launch 假死 when bootstrap ran on the UI thread).
    schedule_acoustic_match_sync(Some(app), state);
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap activate complete reason={} desired={}",
            reason,
            engine_label(desired)
        ),
    );
    // Warm KWS FS probe off the IPC path so status polls never readdir under load.
    {
        let state_w = Arc::clone(state);
        let rd = app.path().resource_dir().ok();
        let _ = std::thread::Builder::new()
            .name("kws-probe-warm".into())
            .spawn(move || {
                voice_kws_runtime::refresh_kws_probe_cache(state_w.as_ref(), rd.as_deref());
            });
    }
    if phase_log {
        log_bootstrap_phase(
            state,
            t0,
            "end",
            &format!(
                "total_ms={} desired={}",
                t0.elapsed().as_millis(),
                engine_label(desired)
            ),
        );
    }
}

fn schedule_acoustic_match_sync(app: Option<&AppHandle>, state: &Arc<AppState>) {
    let app2 = app.cloned();
    let state2 = Arc::clone(state);
    let _ = std::thread::Builder::new()
        .name("acoustic-sync".into())
        .spawn(move || {
            crate::voice_acoustic_runtime::sync_acoustic_match_runtime(app2.as_ref(), &state2);
            crate::app_log::log_line(
                state2.as_ref(),
                "voice",
                "voice_bootstrap acoustic sync done",
            );
        });
}

/// Restart the active engine when fingerprint changes; no-op when unchanged.
pub fn restart_active_engine_if_fingerprint_changed(
    app: &AppHandle,
    state: &Arc<AppState>,
    old_cfg: &VoiceConfig,
    new_cfg: &VoiceConfig,
    reason: &str,
) {
    // Same lock as activate: cmd_save + config watcher must not interleave stop/start.
    let _guard = ACTIVATE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    restart_active_engine_if_fingerprint_changed_locked(app, state, old_cfg, new_cfg, reason);
}

fn restart_active_engine_if_fingerprint_changed_locked(
    app: &AppHandle,
    state: &Arc<AppState>,
    old_cfg: &VoiceConfig,
    new_cfg: &VoiceConfig,
    reason: &str,
) {
    let desired = resolve_supervisor_desired_engine(
        state,
        new_cfg,
        app.path().resource_dir().ok().as_deref(),
    );
    let old_fp = crate::scene_config::idle_voice_fingerprint(old_cfg);
    let new_fp = crate::scene_config::idle_voice_fingerprint(new_cfg);
    let fingerprint_changed = old_fp != new_fp;
    let needs_restart = match (&old_fp, &new_fp) {
        (Some(a), Some(b)) => a.requires_engine_restart(b),
        _ => fingerprint_changed,
    };

    if !needs_restart {
        if fingerprint_changed {
            crate::app_log::log_line(
                state,
                "voice",
                "voice_bootstrap skip engine restart (summon-only / non-engine fingerprint change)",
            );
        } else {
            crate::app_log::log_line(
                state,
                "voice",
                "voice_bootstrap no runtime change (fingerprint unchanged)",
            );
        }
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "voice",
            crate::runtime_event::kind::VOICE_NO_CHANGE,
            if fingerprint_changed {
                "voice_bootstrap skip engine restart (summon-only fingerprint change)"
            } else {
                "voice_bootstrap no runtime change (fingerprint unchanged)"
            },
            Some(serde_json::json!({
                "source": "voice_bootstrap",
                "desiredEngine": engine_label(desired),
                "fromEngine": engine_label(desired),
                "toEngine": engine_label(desired),
                "reason": reason,
                "fingerprintChanged": fingerprint_changed,
                "engineRestart": false,
            })),
        );
        *state.last_voice_fingerprint.lock() = new_fp;
        crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
        return;
    }

    let from = observe_running_engine(state);
    log_supervisor_switch(
        Some(app),
        state,
        desired,
        from,
        desired,
        reason,
        true,
        Some(serde_json::json!({ "action": "fingerprint_restart" })),
    );

    match desired {
        EffectiveVoiceEngine::None => {
            stop_all_voice_engines(Some(app), state, reason);
        }
        EffectiveVoiceEngine::Vosk => {
            let vosk_state = state.voice_vosk_state.lock().clone();
            // Fingerprint can change during bootstrap while Vosk is still loading the
            // model. Sync join would hang the config watcher (UI fake-freeze). Skip the
            // restart; the in-flight start already picks up config via epoch / next activate.
            if vosk_state == "starting" {
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!(
                        "voice_bootstrap skip fingerprint restart vosk ({reason}): still starting"
                    ),
                );
            } else {
                // Never sync-join here: config watcher + save path hold ACTIVATE_LOCK;
                // native Vosk join used to leave the window Responding=false (假死).
                crate::app_log::log_line(state, "voice", "stop self vosk (supervisor)");
                voice_vosk_runtime::voice_vosk_stop_detach(state);
                std::thread::sleep(std::time::Duration::from_millis(120));
                start_self_vosk(
                    app,
                    state,
                    crate::scene_config::vosk_config_for_runtime(new_cfg, true),
                    reason,
                );
            }
        }
        EffectiveVoiceEngine::Sapi => {
            crate::app_log::log_line(state, "voice", "stop self sapi (supervisor)");
            voice_sapi_runtime::voice_sapi_stop(state);
            let _ = voice_sapi_runtime::start_voice_sapi_runtime_only(
                state,
                crate::scene_config::sapi_config_for_runtime(new_cfg, true),
                reason,
                Some(app.clone()),
            );
        }
        EffectiveVoiceEngine::Kws => {
            // Native KWS worker cannot safely hot-reload keywords while running.
            if state.voice_kws.lock().is_some() {
                crate::app_log::log_line(
                    state,
                    "voice",
                    &format!(
                        "voice_bootstrap skip hot restart kws ({reason}): native worker keeps current keywords until next start"
                    ),
                );
                *state.voice_kws_last_error.lock() =
                    "KWS 关键词已保存；为避免原生引擎热重启崩溃，将在下次启动 KWS 时生效".into();
            } else {
                crate::app_log::log_line(state, "voice", "stop self kws (supervisor)");
                voice_kws_runtime::voice_kws_stop_sync(state);
                start_self_kws(
                    app,
                    state,
                    crate::scene_config::kws_config_for_runtime(new_cfg, true),
                    reason,
                );
            }
        }
    }

    *state.last_voice_fingerprint.lock() = new_fp;
    crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state));
    schedule_acoustic_match_sync(Some(app), state);
}

/// M5 degrade policy decision (pure; unit-tested).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DegradeFailedEngine {
    Vosk,
    Kws,
    Sapi,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DegradeDecision {
    /// Stay failed; surface reason (no alternate engine).
    NoFallback { reason: &'static str },
    /// Start alternate engine without rewriting config enabled flags.
    Fallback {
        to: EffectiveVoiceEngine,
        reason: &'static str,
    },
}

pub fn resolve_degrade_decision(
    failed: DegradeFailedEngine,
    fail_code: &str,
    has_acoustic: bool,
) -> DegradeDecision {
    let code = fail_code.to_ascii_lowercase();
    match failed {
        DegradeFailedEngine::Vosk => {
            if has_acoustic {
                // Acoustic matching needs PCM. Prefer KWS over a total outage; SAPI has no PCM bus.
                DegradeDecision::Fallback {
                    to: EffectiveVoiceEngine::Kws,
                    reason: "vosk_unavailable_acoustic_fallback_kws",
                }
            } else if code.contains("model_missing") {
                DegradeDecision::Fallback {
                    to: EffectiveVoiceEngine::Sapi,
                    reason: "vosk_model_missing",
                }
            } else {
                DegradeDecision::Fallback {
                    to: EffectiveVoiceEngine::Sapi,
                    reason: "vosk_start_failed",
                }
            }
        }
        DegradeFailedEngine::Kws => {
            if has_acoustic {
                // Acoustic matching needs a PCM-capable backend; never fall straight to SAPI.
                DegradeDecision::Fallback {
                    to: EffectiveVoiceEngine::Vosk,
                    reason: "kws_start_failed_acoustic_fallback_vosk",
                }
            } else {
                DegradeDecision::Fallback {
                    to: EffectiveVoiceEngine::Vosk,
                    reason: "kws_start_failed",
                }
            }
        }
        DegradeFailedEngine::Sapi => DegradeDecision::NoFallback {
            reason: "sapi_start_failed",
        },
    }
}

pub fn clear_degrade_status(state: &AppState) {
    *state.voice_degraded.lock() = false;
    *state.voice_degraded_reason.lock() = String::new();
}

pub fn set_degrade_status(state: &AppState, reason: &str) {
    *state.voice_degraded.lock() = true;
    *state.voice_degraded_reason.lock() = reason.to_string();
}

pub fn supervisor_status_json(state: &AppState) -> serde_json::Value {
    // Clone+drop before readiness: kws_readiness may FS-probe on cache miss.
    // Holding cfg across that starved voice_sapi_status (~5s) → UI_HB_STALL_5S.
    let cfg = state.cfg.lock().clone();
    let desired = resolve_supervisor_desired_engine(state, &cfg, None);
    let strategy = crate::scene_config::voice_listening_strategy(&cfg);
    let active = observe_running_engine(state);
    let degraded = *state.voice_degraded.lock();
    let degraded_reason = state.voice_degraded_reason.lock().clone();
    serde_json::json!({
        "desiredEngine": engine_label(desired),
        "listeningStrategy": strategy,
        "activeEngine": engine_label(active),
        "degraded": degraded,
        "degradedReason": degraded_reason,
        "activateBusy": activate_busy(),
    })
}

/// Merge supervisor fields into an engine/status JSON object (flat keys).
pub fn attach_supervisor_status(state: &AppState, value: &mut serde_json::Value) {
    let Some(obj) = value.as_object_mut() else {
        return;
    };
    let Some(map) = supervisor_status_json(state).as_object().cloned() else {
        return;
    };
    for (k, v) in map {
        obj.insert(k, v);
    }
}

/// Called from engine start workers when start succeeds.
pub fn on_engine_start_ok(state: &AppState, engine: EffectiveVoiceEngine) {
    let desired = crate::scene_config::idle_desired_voice_engine(&state.cfg.lock());
    if engine == desired {
        clear_degrade_status(state);
    }
}

/// Called from engine start workers when start fails. May start a fallover engine.
pub fn on_engine_start_failed(
    app: Option<&AppHandle>,
    state: &Arc<AppState>,
    failed: DegradeFailedEngine,
    fail_code: &str,
) {
    let has_acoustic = crate::scene_config::has_enabled_acoustic_commands(&state.cfg.lock());
    let decision = resolve_degrade_decision(failed, fail_code, has_acoustic);
    match decision {
        DegradeDecision::NoFallback { reason } => {
            set_degrade_status(state, reason);
            crate::app_log::log_line(
                state,
                "voice",
                &format!(
                    "voice_bootstrap degrade no_fallback failed={failed:?} reason={reason} acoustic={has_acoustic}"
                ),
            );
            crate::runtime_event::publish_runtime_event(
                app,
                state.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_RESTART,
                &format!("voice_bootstrap degrade no_fallback reason={reason}"),
                Some(serde_json::json!({
                    "source": "voice_bootstrap",
                    "degraded": true,
                    "degradedReason": reason,
                    "failedEngine": match failed {
                        DegradeFailedEngine::Vosk => "vosk",
                        DegradeFailedEngine::Kws => "kws",
                        DegradeFailedEngine::Sapi => "sapi",
                    },
                })),
            );
        }
        DegradeDecision::Fallback { to, reason } => {
            set_degrade_status(state, reason);
            crate::app_log::log_line(
                state,
                "voice",
                &format!(
                    "voice_bootstrap degrade fallback to={} reason={reason}",
                    engine_label(to)
                ),
            );
            crate::runtime_event::publish_runtime_event(
                app,
                state.as_ref(),
                "voice",
                crate::runtime_event::kind::VOICE_RESTART,
                &format!(
                    "voice_bootstrap degrade fallback to={} reason={reason}",
                    engine_label(to)
                ),
                Some(serde_json::json!({
                    "source": "voice_bootstrap",
                    "degraded": true,
                    "degradedReason": reason,
                    "toEngine": engine_label(to),
                    "failedEngine": match failed {
                        DegradeFailedEngine::Vosk => "vosk",
                        DegradeFailedEngine::Kws => "kws",
                        DegradeFailedEngine::Sapi => "sapi",
                    },
                })),
            );
            let Some(app) = app else {
                return;
            };
            // Start fallover from persisted engine config without flipping enabled flags.
            // Fallover uses effective configs; does not flip persisted enabled flags.
            let cfg_snap = state.cfg.lock().clone();
            match to {
                EffectiveVoiceEngine::Vosk => {
                    start_self_vosk(
                        app,
                        state,
                        crate::scene_config::vosk_config_for_runtime(&cfg_snap, true),
                        &format!("degrade:{reason}"),
                    );
                }
                EffectiveVoiceEngine::Sapi => {
                    let _ = voice_sapi_runtime::start_voice_sapi_runtime_only(
                        state,
                        crate::scene_config::sapi_config_for_runtime(&cfg_snap, true),
                        &format!("degrade:{reason}"),
                        Some(app.clone()),
                    );
                }
                EffectiveVoiceEngine::Kws => {
                    start_self_kws(
                        app,
                        state,
                        crate::scene_config::kws_config_for_runtime(&cfg_snap, true),
                        &format!("degrade:{reason}"),
                    );
                }
                EffectiveVoiceEngine::None => {}
            }
        }
    }
}

/// M3: pause active engine(s) for short external capture (acoustic calibration, etc.).
/// Resume via [`MicLease::release`] / `Drop` → `activate_desired_engine`.
pub fn pause_active_engine_for_external_capture(state: &AppState, reason: &str) -> bool {
    crate::app_log::log_line(
        state,
        "voice",
        &format!("voice_bootstrap pause_active_engine_for_external_capture reason={reason}"),
    );
    // Only the active backend holds the mic; still probe all three self-pause helpers
    // so leftover handles cannot block WASAPI reopen.
    let sapi = voice_sapi_runtime::pause_for_external_capture(state);
    let vosk = voice_vosk_runtime::pause_for_external_capture(state);
    let kws = voice_kws_runtime::pause_for_external_capture(state);
    sapi || vosk || kws
}

/// Stop level meter and invalidate its generation so late async starts cannot reopen.
pub fn stop_mic_monitor_and_release(state: &AppState, reason: &str) {
    let now = onetone_logic::runtime_event::now_ms();
    state.mic_owner.invalidate_level_monitor(now, reason);
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
}

/// RAII microphone lease. On drop/release, restores the desired wake engine (unless listen
/// is paused or acoustic calibration is still suspended).
pub struct MicLease {
    state: Arc<AppState>,
    app: Option<AppHandle>,
    reason: String,
    did_pause: bool,
    released: bool,
    owner: onetone_logic::mic_owner::MicOwner,
}

/// Acquire mic: pause active engine, wait briefly for device release.
pub fn acquire_mic_lease(app: Option<&AppHandle>, state: &Arc<AppState>, reason: &str) -> MicLease {
    let now = onetone_logic::runtime_event::now_ms();
    let owner = onetone_logic::mic_owner::MicOwner::Calibration {
        session_id: reason.to_string(),
    };
    let prev = state.mic_owner.force_claim(owner.clone(), reason, now);
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "mic_owner force_claim calibration reason={reason} prev={} prev_detail={}",
            prev.kind_label(),
            prev.detail()
        ),
    );
    let did_pause = pause_active_engine_for_external_capture(state, reason);
    if did_pause {
        // Pause is non-blocking (async engine teardown). Give WASAPI longer to free
        // the endpoint before acoustic capture tries to open it.
        std::thread::sleep(std::time::Duration::from_millis(700));
    }
    crate::app_log::log_line(
        state,
        "voice",
        &format!("voice_bootstrap mic_lease acquired reason={reason} didPause={did_pause}"),
    );
    MicLease {
        state: Arc::clone(state),
        app: app.cloned(),
        reason: reason.to_string(),
        did_pause,
        released: false,
        owner,
    }
}

impl MicLease {
    pub fn did_pause(&self) -> bool {
        self.did_pause
    }

    /// Explicit release (also called from Drop). Safe to call once.
    pub fn release(&mut self) {
        if self.released {
            return;
        }
        self.released = true;
        let now = onetone_logic::runtime_event::now_ms();
        let matched = self.state.mic_owner.release(
            &self.owner,
            now,
            &format!("mic_lease_release:{}", self.reason),
        );
        crate::app_log::log_line(
            &self.state,
            "voice",
            &format!(
                "mic_owner release calibration reason={} matched={}",
                self.reason, matched
            ),
        );
        if !self.did_pause {
            return;
        }
        if *self.state.paused.lock() {
            crate::app_log::log_line(
                &self.state,
                "voice",
                &format!(
                    "voice_bootstrap mic_lease skip resume (listen paused) reason={}",
                    self.reason
                ),
            );
            return;
        }
        // During acoustic calibration, keep wake engines paused so multi-take
        // recording can reuse the mic. Resume happens on setSuspend(false).
        if self.state.acoustic_voice.is_suspended() {
            crate::app_log::log_line(
                &self.state,
                "voice",
                &format!(
                    "voice_bootstrap mic_lease skip resume (matcher suspended) reason={}",
                    self.reason
                ),
            );
            return;
        }
        let Some(app) = self.app.as_ref() else {
            crate::app_log::log_line(
                &self.state,
                "voice",
                &format!(
                    "voice_bootstrap mic_lease skip resume (no app handle) reason={}",
                    self.reason
                ),
            );
            return;
        };
        let reason = format!("mic_lease_release:{}", self.reason);
        crate::app_log::log_line(
            &self.state,
            "voice",
            &format!("voice_bootstrap mic_lease resume → activate_desired reason={reason}"),
        );
        activate_desired_engine(app, &self.state, &reason);
    }

    /// Drop lease ownership without restarting engines (park / replace).
    /// Mic owner stays Calibration until a later release / force_claim.
    pub fn disarm(&mut self) {
        self.released = true;
    }
}

impl Drop for MicLease {
    fn drop(&mut self) {
        self.release();
    }
}

/// Startup entry. Safe mode starts nothing.
pub fn bootstrap_voice_engines(app: &AppHandle, state: &Arc<AppState>, safe_mode: bool) {
    let t0 = Instant::now();
    log_bootstrap_phase(state, t0, "entry", if safe_mode { "safe_mode=1" } else { "safe_mode=0" });
    if safe_mode {
        crate::app_log::log_line(state, "voice", "voice bootstrap skipped (safe mode)");
        crate::runtime_event::publish_runtime_event(
            Some(app),
            state.as_ref(),
            "voice",
            crate::runtime_event::kind::VOICE_BOOTSTRAP,
            "voice bootstrap skipped (safe mode)",
            Some(serde_json::json!({
                "source": "voice_bootstrap",
                "desiredEngine": "none",
                "fromEngine": "none",
                "toEngine": "none",
                "reason": "safe_mode",
                "fingerprintChanged": false,
            })),
        );
        log_bootstrap_phase(state, t0, "end", "total_ms=0 action=safe_mode");
        return;
    }
    activate_desired_engine(app, state, "bootstrap");
}

pub fn apply_voice_config_change(
    app: &AppHandle,
    state: &Arc<AppState>,
    old_cfg: &VoiceConfig,
    new_cfg: &VoiceConfig,
) {
    let resource_dir = app.path().resource_dir().ok();
    let resource = resource_dir.as_deref();
    if old_cfg.voice_kws.model_path != new_cfg.voice_kws.model_path
        || old_cfg.voice_kws.model_preset != new_cfg.voice_kws.model_preset
    {
        *state.voice_kws_probe.lock() = None;
    }
    // Use supervisor resolution (KWS readiness), not idle_desired — auto and resourceSaver
    // both map to Kws in idle_desired, but auto may run Vosk while resourceSaver must stop it.
    let old_desired = resolve_supervisor_desired_engine(state, old_cfg, resource);
    let new_desired = resolve_supervisor_desired_engine(state, new_cfg, resource);

    if old_desired == new_desired {
        restart_active_engine_if_fingerprint_changed(
            app,
            state,
            old_cfg,
            new_cfg,
            "effective fingerprint changed",
        );
        return;
    }

    activate_desired_engine(app, state, "config change");
}

/// Stop voice wake workers when listen is paused (saves CPU/RAM).
pub fn pause_voice_engines(state: &Arc<AppState>) {
    let desired = crate::scene_config::idle_desired_voice_engine(&state.cfg.lock());
    if desired == crate::scene_config::DesiredVoiceEngine::None {
        return;
    }
    stop_all_voice_engines(None, state, "listen paused");
}

/// Restart voice wake workers after listen resumes.
pub fn resume_voice_engines(app: &AppHandle, state: &Arc<AppState>) {
    activate_desired_engine(app, state, "listen resume");
}

#[cfg(test)]
mod activate_gate_tests {
    use super::{resolve_activate_gate, resolve_strategy_engine, ActivateGate};
    use crate::scene_config::DesiredVoiceEngine as EffectiveVoiceEngine;

    #[test]
    fn noop_when_desired_already_listening() {
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                true,
                false,
                "deferred_boot"
            ),
            ActivateGate::NoopAlreadyActive
        );
    }

    #[test]
    fn skip_when_desired_still_starting() {
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                false,
                true,
                "vosk_set_enabled"
            ),
            ActivateGate::SkipStillStarting
        );
    }

    #[test]
    fn force_prefix_bypasses_noop_and_skip() {
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                true,
                false,
                "force:vosk_phrases"
            ),
            ActivateGate::Proceed
        );
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                false,
                true,
                "force:vosk_model"
            ),
            ActivateGate::Proceed
        );
    }

    #[test]
    fn unhealthy_handle_does_not_noop() {
        assert_eq!(
            super::resolve_activate_gate_with_health(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                true,
                false,
                false,
                "vosk_model_already_present"
            ),
            ActivateGate::Proceed
        );
        assert_eq!(
            super::resolve_activate_gate_with_health(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                true,
                false,
                true,
                "vosk_model_already_present"
            ),
            ActivateGate::NoopAlreadyActive
        );
    }

    #[test]
    fn degrade_and_resume_bypass_skip_only() {
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Kws,
                EffectiveVoiceEngine::Kws,
                false,
                true,
                "degrade:vosk_unavailable_acoustic_fallback_kws"
            ),
            ActivateGate::Proceed
        );
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                false,
                true,
                "listen resume"
            ),
            ActivateGate::Proceed
        );
        // Already listening: resume still noops (no force:).
        assert_eq!(
            resolve_activate_gate(
                EffectiveVoiceEngine::Vosk,
                EffectiveVoiceEngine::Vosk,
                true,
                false,
                "listen resume"
            ),
            ActivateGate::NoopAlreadyActive
        );
    }

    #[test]
    fn strategy_engine_prefers_function_or_saver_behavior() {
        assert_eq!(
            resolve_strategy_engine("auto", true, EffectiveVoiceEngine::Sapi),
            EffectiveVoiceEngine::Kws
        );
        assert_eq!(
            resolve_strategy_engine("auto", false, EffectiveVoiceEngine::Sapi),
            EffectiveVoiceEngine::Vosk
        );
        assert_eq!(
            resolve_strategy_engine("resourceSaver", true, EffectiveVoiceEngine::Vosk),
            EffectiveVoiceEngine::Kws
        );
        assert_eq!(
            resolve_strategy_engine("resourceSaver", false, EffectiveVoiceEngine::Vosk),
            EffectiveVoiceEngine::Vosk
        );
        assert_eq!(
            resolve_strategy_engine("off", true, EffectiveVoiceEngine::Vosk),
            EffectiveVoiceEngine::None
        );
    }
}

#[cfg(test)]
mod degrade_policy_tests {
    use super::{resolve_degrade_decision, DegradeDecision, DegradeFailedEngine};
    use crate::scene_config::DesiredVoiceEngine as EffectiveVoiceEngine;

    #[test]
    fn vosk_without_acoustic_falls_back_to_sapi() {
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Vosk, "start_failed", false),
            DegradeDecision::Fallback {
                to: EffectiveVoiceEngine::Sapi,
                reason: "vosk_start_failed",
            }
        );
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Vosk, "model_missing", false),
            DegradeDecision::Fallback {
                to: EffectiveVoiceEngine::Sapi,
                reason: "vosk_model_missing",
            }
        );
    }

    #[test]
    fn vosk_with_acoustic_falls_back_to_kws() {
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Vosk, "model_missing", true),
            DegradeDecision::Fallback {
                to: EffectiveVoiceEngine::Kws,
                reason: "vosk_unavailable_acoustic_fallback_kws",
            }
        );
    }

    #[test]
    fn kws_falls_back_to_vosk() {
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Kws, "start_failed", true),
            DegradeDecision::Fallback {
                to: EffectiveVoiceEngine::Vosk,
                reason: "kws_start_failed_acoustic_fallback_vosk",
            }
        );
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Kws, "start_failed", false),
            DegradeDecision::Fallback {
                to: EffectiveVoiceEngine::Vosk,
                reason: "kws_start_failed",
            }
        );
    }

    #[test]
    fn sapi_has_no_fallback() {
        assert_eq!(
            resolve_degrade_decision(DegradeFailedEngine::Sapi, "start_failed", false),
            DegradeDecision::NoFallback {
                reason: "sapi_start_failed",
            }
        );
    }
}
