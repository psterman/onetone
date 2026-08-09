//! Runtime integration for KWS keyword command engine.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::config::{save_config, VoiceKwsConfig};
use crate::scene_config::resolve_effective_kws_config;
use crate::voice_keyword_dispatch::{classify_voice_keyword, VoiceKeywordKind};
use crate::voice_kws::{probe_kws_resources, start_voice_kws, stop_voice_kws, VoiceKwsEvent};
use crate::AppState;

#[derive(Debug, Clone, Default)]
pub struct KwsKeywordStatusSnapshot {
    pub encoded: Vec<String>,
    pub skipped: Vec<String>,
    pub truncated: Vec<String>,
    pub issue: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KwsReadiness {
    pub ready: bool,
    pub native: bool,
    pub model_complete: bool,
    pub encoded_non_empty: bool,
    pub strategy_allows_kws: bool,
    pub reason: &'static str,
}

fn compose_keyword_build_issue(
    plan: &crate::scene_config::KwsKeywordPlan,
    build: &crate::voice_kws_keywords::KwsKeywordBuildResult,
) -> String {
    if build.encoded.is_empty() {
        if plan.included.is_empty() {
            return "未配置有效关键词".into();
        }
        return format!("无法编码任何关键词（已跳过 {} 条）", build.skipped.len());
    }
    let mut parts = Vec::new();
    if !build.skipped.is_empty() {
        parts.push(format!("{} 条无法编码已跳过", build.skipped.len()));
    }
    if !plan.truncated.is_empty() {
        parts.push(format!("{} 条因上限未载入", plan.truncated.len()));
    }
    parts.join("；")
}

fn store_kws_keyword_build_snapshot(
    state: &AppState,
    plan: &crate::scene_config::KwsKeywordPlan,
    build: &crate::voice_kws_keywords::KwsKeywordBuildResult,
) {
    *state.voice_kws_keyword_build.lock() = KwsKeywordStatusSnapshot {
        encoded: build.encoded.clone(),
        skipped: build.skipped.clone(),
        truncated: plan.truncated.clone(),
        issue: compose_keyword_build_issue(plan, build),
    };
}

pub fn kws_readiness(
    state: &AppState,
    cfg: &crate::config::VoiceConfig,
    resource_dir: Option<&Path>,
) -> KwsReadiness {
    let probe = cached_kws_probe(state, &cfg.voice_kws, resource_dir, true);
    kws_readiness_from_probe(state, cfg, &probe)
}

/// Status / supervisor hot path — never FS-probe (AV scan hung voice_*_status ~60s).
pub fn kws_readiness_cached(
    state: &AppState,
    cfg: &crate::config::VoiceConfig,
) -> KwsReadiness {
    let probe = cached_kws_probe(state, &cfg.voice_kws, None, false);
    kws_readiness_from_probe(state, cfg, &probe)
}

fn kws_readiness_from_probe(
    state: &AppState,
    cfg: &crate::config::VoiceConfig,
    probe: &crate::voice_kws::KwsResourceProbe,
) -> KwsReadiness {
    let build = state.voice_kws_keyword_build.lock().clone();
    let strategy = crate::scene_config::voice_listening_strategy(cfg);
    let native = !probe.stub_mode;
    let model_complete = probe.model_exists;
    let encoded_non_empty = !build.encoded.is_empty();
    let strategy_allows_kws = matches!(strategy, "auto" | "resourceSaver" | "advanced");
    let (ready, reason) = if probe.resolved_model_path.is_empty() && !probe.model_exists && probe.stub_mode {
        // Cache miss on hot path — not ready until ensure-probe fills cache.
        (false, "probe_pending")
    } else if !strategy_allows_kws {
        (false, "strategy_disallows_kws")
    } else if !native {
        (false, "stub")
    } else if !model_complete {
        (false, "model_missing")
    } else if !encoded_non_empty {
        (false, "keywords_empty")
    } else {
        (true, "ready")
    };
    KwsReadiness {
        ready,
        native,
        model_complete,
        encoded_non_empty,
        strategy_allows_kws,
        reason,
    }
}

fn pending_kws_probe(cfg: &crate::config::VoiceKwsConfig) -> crate::voice_kws::KwsResourceProbe {
    crate::voice_kws::KwsResourceProbe {
        model_exists: false,
        keywords_exists: false,
        model_path: cfg.model_path.trim().to_string(),
        model_preset: if cfg.model_preset.trim().is_empty() {
            "cn-light".into()
        } else {
            cfg.model_preset.trim().to_string()
        },
        resolved_model_path: String::new(),
        // Conservative: treat as stub until a real probe lands.
        stub_mode: true,
    }
}

fn cached_kws_probe(
    state: &AppState,
    cfg: &crate::config::VoiceKwsConfig,
    resource_dir: Option<&Path>,
    allow_fs: bool,
) -> crate::voice_kws::KwsResourceProbe {
    if let Some(probe) = state.voice_kws_probe.lock().clone() {
        return probe;
    }
    if !allow_fs {
        return pending_kws_probe(cfg);
    }
    let probe = probe_kws_resources(cfg, resource_dir);
    *state.voice_kws_probe.lock() = Some(probe.clone());
    probe
}

pub fn refresh_kws_probe_cache(state: &AppState, resource_dir: Option<&Path>) {
    let cfg = state.cfg.lock().voice_kws.clone();
    *state.voice_kws_probe.lock() = Some(probe_kws_resources(&cfg, resource_dir));
}

fn next_kws_epoch(state: &AppState) -> u64 {
    state.voice_kws_epoch.fetch_add(1, Ordering::SeqCst) + 1
}

fn kws_epoch_matches(state: &AppState, epoch: u64) -> bool {
    state.voice_kws_epoch.load(Ordering::SeqCst) == epoch
}

pub fn spawn_voice_kws_stop(state: Arc<AppState>) {
    let _epoch = next_kws_epoch(state.as_ref());
    *state.voice_kws_cooldown_until.lock() = None;
    *state.voice_kws_last_error.lock() = String::new();
    let handle = state.voice_kws.lock().take();
    if let Some(handle) = handle {
        *state.voice_kws_state.lock() = "stopping".into();
        std::thread::Builder::new()
            .name("voice-kws-stop".into())
            .spawn(move || {
                stop_voice_kws(handle);
                *state.voice_kws_state.lock() = "stopped".into();
            })
            .ok();
    } else {
        *state.voice_kws_state.lock() = "stopped".into();
    }
}

/// Release the default capture device for a short external recording (e.g. acoustic calibration).
/// Uses async stop — a sync join can freeze `record_start` while the native worker winds down.
pub fn pause_for_external_capture(state: &AppState) -> bool {
    crate::voice_bootstrap::stop_mic_monitor_and_release(state, "engine_or_device");
    let was_active = {
        let st = state.voice_kws_state.lock().clone();
        matches!(
            st.as_str(),
            "starting" | "listening" | "cooldown" | "triggered" | "stopping"
        ) || state.voice_kws.lock().is_some()
    };
    let handle = state.voice_kws.lock().take();
    let _epoch = next_kws_epoch(state);
    *state.voice_kws_cooldown_until.lock() = None;
    *state.voice_kws_state.lock() = "stopped".into();
    if let Some(handle) = handle {
        stop_voice_kws(handle);
        return true;
    }
    was_active
}

/// Synchronous self-stop (supervisor may call this for exclusive activate).
/// Bumps the epoch so any in-flight start worker aborts.
pub fn voice_kws_stop_sync(state: &AppState) {
    let _epoch = next_kws_epoch(state);
    release_kws_capture_handle(state);
}

/// Stop capture handle without bumping epoch (safe to call from an in-flight start worker).
fn release_kws_capture_handle(state: &AppState) {
    *state.voice_kws_cooldown_until.lock() = None;
    if let Some(handle) = state.voice_kws.lock().take() {
        stop_voice_kws(handle);
    }
    *state.voice_kws_state.lock() = "stopped".into();
}

pub fn voice_kws_start(
    state: &AppState,
    cfg: &VoiceKwsConfig,
    resource_dir: Option<PathBuf>,
    epoch: u64,
) -> Result<(), String> {
    if !kws_epoch_matches(state, epoch) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("kws start aborted (stale epoch {epoch} before stop)"),
        );
        return Ok(());
    }
    crate::voice_bootstrap::stop_mic_monitor_and_release(state, "engine_or_device");
    // Do not bump epoch here — that would cancel this very start worker.
    release_kws_capture_handle(state);
    if !kws_epoch_matches(state, epoch) {
        crate::app_log::log_line(
            state,
            "voice",
            &format!("kws start aborted (stale epoch {epoch} after stop)"),
        );
        return Ok(());
    }
    *state.voice_kws_state.lock() = "starting".into();

    let keyword_plan = {
        let cfg_guard = state.cfg.lock();
        crate::scene_config::kws_keyword_plan_for_cfg(
            &cfg_guard,
            crate::scene_config::KWS_MAX_KEYWORD_ENTRIES,
        )
    };
    let model_dir = crate::voice_kws::resolve_kws_model_dir(cfg, resource_dir.as_deref());
    let build_result =
        crate::voice_kws::prepare_runtime_keywords(&model_dir, &keyword_plan.included);
    store_kws_keyword_build_snapshot(state, &keyword_plan, &build_result);
    if build_result.encoded.is_empty() {
        crate::app_log::sync_emergency_line("rs", &format!(
            "kws: runtime keywords empty (skipped={:?}, truncated={:?}); falling back to bundled keywords.txt",
            build_result.skipped, keyword_plan.truncated
        ));
    }

    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap phase=model_open engine=kws begin {}",
            crate::ui_heartbeat::ui_hb_diag()
        ),
    );
    let handle = start_voice_kws(
        cfg,
        resource_dir.as_deref(),
        Some(state.audio_frame_bus.publisher()),
    )?;
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap phase=model_open engine=kws ok {}",
            crate::ui_heartbeat::ui_hb_diag()
        ),
    );
    if !kws_epoch_matches(state, epoch) {
        stop_voice_kws(handle);
        crate::app_log::log_line(
            state,
            "voice",
            &format!("kws start aborted (stale epoch {epoch} after open)"),
        );
        return Ok(());
    }
    *state.voice_kws.lock() = Some(handle);
    *state.voice_kws_last_error.lock() = String::new();
    crate::app_log::log_line(state, "voice", "kws start worker opened handle");
    crate::app_log::log_line(
        state,
        "voice",
        &format!(
            "voice_bootstrap phase=worker_ready engine=kws {}",
            crate::ui_heartbeat::ui_hb_diag()
        ),
    );
    Ok(())
}

pub fn spawn_voice_kws_start(
    state: Arc<AppState>,
    cfg: VoiceKwsConfig,
    resource_dir: Option<PathBuf>,
    app: Option<AppHandle>,
) {
    let epoch = next_kws_epoch(state.as_ref());
    *state.voice_kws_state.lock() = "starting".into();
    std::thread::Builder::new()
        .name("voice-kws-start".into())
        .spawn(
            move || match voice_kws_start(state.as_ref(), &cfg, resource_dir, epoch) {
                Ok(()) => {
                    crate::voice_bootstrap::on_engine_start_ok(
                        state.as_ref(),
                        crate::scene_config::DesiredVoiceEngine::Kws,
                    );
                }
                Err(e) => {
                    *state.voice_kws_last_error.lock() = e.clone();
                    *state.voice_kws_state.lock() = "error".into();
                    crate::voice_bootstrap::on_engine_start_failed(
                        app.as_ref(),
                        &state,
                        crate::voice_bootstrap::DegradeFailedEngine::Kws,
                        "start_failed",
                    );
                }
            },
        )
        .ok();
}

fn emit_kws_mic_level(app: &AppHandle, state: &AppState, level: u32) {
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

pub fn drain_voice_kws_events(state: &Arc<AppState>, app: &AppHandle) {
    let events: Vec<VoiceKwsEvent> = {
        let guard = state.voice_kws.lock();
        let Some(handle) = guard.as_ref() else {
            tick_kws_cooldown_state(state);
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
            VoiceKwsEvent::StateChanged(s) => {
                if s == "stopped" || s == "error" {
                    state.mic_level.clear();
                    *state.voice_kws_last_partial.lock() = String::new();
                    emit_kws_mic_level(app, state.as_ref(), 0);
                }
                *state.voice_kws_state.lock() = s;
            }
            VoiceKwsEvent::Error(e) => {
                *state.voice_kws_last_error.lock() = e;
                *state.voice_kws_state.lock() = "error".into();
                state.mic_level.clear();
                *state.voice_kws_last_partial.lock() = String::new();
                emit_kws_mic_level(app, state.as_ref(), 0);
            }
            VoiceKwsEvent::Level { level } => {
                state.mic_level.set("", level);
                emit_kws_mic_level(app, state, level);
            }
            VoiceKwsEvent::Partial(text) => {
                *state.voice_kws_last_partial.lock() = text;
            }
            VoiceKwsEvent::Detected {
                phrase,
                keyword,
                kind,
            } => {
                process_kws_detected(state, app, phrase, keyword, kind);
            }
        }
    }

    tick_kws_cooldown_state(state);
    crate::voice_acoustic_runtime::sync_acoustic_match_runtime(Some(app), state);
}

fn tick_kws_cooldown_state(state: &AppState) {
    let until = *state.voice_kws_cooldown_until.lock();
    if let Some(until) = until {
        if until <= std::time::Instant::now() {
            *state.voice_kws_cooldown_until.lock() = None;
            if state.voice_kws_state.lock().as_str() == "cooldown" {
                *state.voice_kws_state.lock() = "listening".into();
            }
        }
    }
}

fn process_kws_detected(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrase: String,
    keyword: String,
    _kind: VoiceKeywordKind,
) {
    let kind = {
        let cfg = state.cfg.lock();
        classify_voice_keyword(&cfg, &phrase)
    };
    *state.voice_kws_last_detected_phrase.lock() = phrase.clone();
    *state.voice_kws_last_detected_kind.lock() = kind.as_str().to_string();
    crate::app_log::log_line(
        state,
        "voice",
        &format!("kws detected: phrase={phrase} kind={}", kind.as_str()),
    );

    // Cooldown stays in runtime (M2); start gap before business dispatch for wake/summon.
    if matches!(kind, VoiceKeywordKind::Wake | VoiceKeywordKind::Summon) {
        let cooldown_ms = state.cfg.lock().voice_kws.cooldown_ms;
        if let Some(remain_ms) =
            crate::voice_end_runtime::wake_key_cooldown_remaining_ms(state, cooldown_ms)
        {
            *state.voice_kws_last_skip.lock() = format!("防连按冷却中，请 {remain_ms} ms 后再说。");
            *state.voice_kws_last_trigger.lock() = String::new();
            *state.voice_kws_state.lock() = "cooldown".into();
            return;
        }
        let now = std::time::Instant::now();
        *state.voice_kws_cooldown_until.lock() = Some(
            now + std::time::Duration::from_millis(crate::voice_end_runtime::wake_key_gap_ms(
                cooldown_ms,
            )),
        );
    }

    let detection = crate::voice_command_router::VoiceDetection {
        engine: "kws".into(),
        kind: crate::voice_command_router::VoiceDetectionKind::from_keyword_kind(kind),
        text: phrase.clone(),
        confidence: None,
        matched_phrase: if keyword.trim().is_empty() {
            phrase.clone()
        } else {
            keyword
        },
        timestamp_ms: crate::voice_command_router::VoiceDetection::now_ms(),
    };
    let result = crate::voice_command_router::handle_detection(state, app, &detection);

    if result.skipped {
        *state.voice_kws_last_skip.lock() = result.skip_reason;
        *state.voice_kws_last_trigger.lock() = String::new();
        if !result.handled {
            *state.voice_kws_state.lock() = "listening".into();
        }
        return;
    }

    *state.voice_kws_last_skip.lock() = String::new();
    *state.voice_kws_last_trigger.lock() = result.trigger_label;
    *state.voice_kws_state.lock() = if result.handled {
        if kind == VoiceKeywordKind::End
            || kind == VoiceKeywordKind::Cancel
            || kind == VoiceKeywordKind::Send
        {
            "listening".into()
        } else {
            "triggered".into()
        }
    } else {
        "error".into()
    };
}

pub fn voice_kws_inject_test_detect(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrase: String,
) -> Result<serde_json::Value, String> {
    let kind = {
        let cfg = state.cfg.lock();
        classify_voice_keyword(&cfg, &phrase)
    };
    let keyword = phrase.clone();

    if let Some(handle) = state.voice_kws.lock().as_ref() {
        handle.inject_detected(phrase.clone(), keyword.clone(), kind)?;
        drain_voice_kws_events(state, app);
    } else {
        process_kws_detected(state, app, phrase.clone(), keyword, kind);
    }

    Ok(voice_kws_status(state, None))
}

pub fn voice_kws_status(state: &AppState, resource_dir: Option<PathBuf>) -> serde_json::Value {
    // Clone then drop cfg before any probe — holding cfg.lock across FS starved
    // sync IPC (incl. cmd_ui_heartbeat / peer status cmds) when disk/AV stalled.
    let cfg = state.cfg.lock().clone();
    let plan = crate::scene_config::kws_keyword_plan_for_cfg(
        &cfg,
        crate::scene_config::KWS_MAX_KEYWORD_ENTRIES,
    );
    let build = state.voice_kws_keyword_build.lock().clone();
    let probe = cached_kws_probe(state, &cfg.voice_kws, resource_dir.as_deref(), false);
    let target_key =
        crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_kws.target_key);
    let resource_issue = crate::voice_kws::kws_resource_issue(&probe);
    let readiness = kws_readiness_from_probe(state, &cfg, &probe);
    let resources_dir = crate::voice_kws::kws_resources_dir(resource_dir.as_deref());
    let download_url = crate::config::kws_model_download_url(&probe.model_preset)
        .unwrap_or("https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models");
    let keyword_build_issue = if build.issue.is_empty() {
        compose_keyword_build_issue(
            &plan,
            &crate::voice_kws_keywords::KwsKeywordBuildResult {
                encoded: build.encoded.clone(),
                skipped: build.skipped.clone(),
            },
        )
    } else {
        build.issue.clone()
    };
    let mut value = serde_json::json!({
        "enabled": crate::scene_config::resolve_effective_kws_config(&cfg).enabled,
        "engine": "kws",
        "stubMode": probe.stub_mode,
        "state": state.voice_kws_state.lock().clone(),
        "lastError": state.voice_kws_last_error.lock().clone(),
        "lastSkip": state.voice_kws_last_skip.lock().clone(),
        "lastTrigger": state.voice_kws_last_trigger.lock().clone(),
        "lastDetectedPhrase": state.voice_kws_last_detected_phrase.lock().clone(),
        "lastDetectedKind": state.voice_kws_last_detected_kind.lock().clone(),
        "lastPartial": state.voice_kws_last_partial.lock().clone(),
        "phrases": plan.included,
        "phrasesActive": build.encoded,
        "phrasesSkipped": build.skipped,
        "phrasesTruncated": plan.truncated,
        "keywordBuildIssue": keyword_build_issue,
        "targetKey": target_key,
        "cooldownMs": cfg.voice_kws.cooldown_ms,
        "modelPath": probe.model_path,
        "modelPreset": probe.model_preset,
        "resolvedModelPath": probe.resolved_model_path,
        "modelExists": probe.model_exists,
        "keywordsExists": probe.keywords_exists,
        "ready": readiness.ready,
        "readyReason": readiness.reason,
        "nativeAvailable": readiness.native,
        "encodedNonEmpty": readiness.encoded_non_empty,
        "strategyAllowsKws": readiness.strategy_allows_kws,
        "resourceIssue": resource_issue,
        "resourcesDir": resources_dir.display().to_string(),
        "modelDownloadUrl": download_url,
    });
    crate::voice_bootstrap::attach_supervisor_status(state, &mut value);
    value
}

pub fn voice_kws_set_enabled(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    enabled: bool,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        if enabled {
            crate::config::apply_desired_engine(&mut cfg, "kws");
        } else if crate::config::parse_desired_engine_label(&cfg.desired_engine)
            == Some(crate::scene_config::DesiredVoiceEngine::Kws)
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
            "kws_set_enabled"
        } else {
            "kws_set_disabled"
        },
    );

    Ok(voice_kws_status(state, resource_dir))
}

pub fn voice_kws_set_phrases(
    state: &Arc<AppState>,
    app: &AppHandle,
    phrases: Vec<String>,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let old_cfg = state.cfg.lock().clone();
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_kws.phrases = phrases;
        cfg.normalize();
        save_config(&cfg);
    }
    let new_cfg = state.cfg.lock().clone();
    crate::voice_bootstrap::apply_voice_config_change(app, state, &old_cfg, &new_cfg);
    Ok(voice_kws_status(state, resource_dir))
}

pub fn voice_kws_test_send(state: &AppState, window: &WebviewWindow) -> serde_json::Value {
    let (target_key, duration_ms) = {
        let cfg = state.cfg.lock();
        (
            crate::voice_end_runtime::resolve_wake_target_key(&cfg, &cfg.voice_kws.target_key),
            cfg.key_press_duration_ms,
        )
    };
    let app = window.app_handle();
    let sent = crate::voice_end_runtime::send_wake_to_target(
        Some(state),
        Some(&app),
        &target_key,
        duration_ms,
    );
    serde_json::json!({
        "ok": sent,
        "targetKey": target_key,
    })
}

pub fn voice_kws_retry_start(
    app: &tauri::AppHandle,
    state: &Arc<AppState>,
    resource_dir: Option<PathBuf>,
) -> serde_json::Value {
    let cfg = resolve_effective_kws_config(&state.cfg.lock());
    if !cfg.enabled {
        return voice_kws_status(state, resource_dir);
    }
    crate::voice_bootstrap::activate_desired_engine(app, state, "kws_retry_start");
    voice_kws_status(state, resource_dir)
}

pub fn voice_kws_stop(state: &Arc<AppState>) {
    spawn_voice_kws_stop(Arc::clone(state));
}
