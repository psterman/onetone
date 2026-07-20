//! Acoustic command runtime: calibration record_once, suspend, status, live matching.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crossbeam_channel::Receiver;
use parking_lot::Mutex;
use tauri::AppHandle;

use crate::app_identity::foreground_app_target_id;
use crate::config::{AcousticVoiceCommand, AcousticVoiceCommandSample, VoiceConfig};
use crate::voice_acoustic_command::{
    build_from_samples, extract_mfcc_from_pcm_f32, extract_sample_from_pcm_manual,
    extract_sample_from_pcm_with_segmenter, match_acoustic_commands, BuildFromSamplesOptions,
    BuildFromSamplesResult, EnergyGateSegmenter, RecordReason, SpeechSegmenter, MANUAL_MAX_MS,
    MAX_SPEECH_MS, MIN_SPEECH_MS, PREFER_SPEECH_MS, RECORD_TIMEOUT_MS,
};
use crate::voice_acoustic_record::{
    capture_pcm_mono_16k, probe_default_input, CaptureError, CaptureErrorKind,
    ManualCaptureSession, TARGET_SAMPLE_RATE,
};
use crate::voice_bootstrap::MicLease;
use crate::AppState;

const MATCH_COOLDOWN_MS: u64 = 1500;
const MATCH_BUFFER_MAX_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 3;
const MATCH_SPEECH_RMS: f32 = 0.008;
const MATCH_SILENCE_MS: u64 = 450;

struct ActiveManualRecord {
    session_id: String,
    capture: ManualCaptureSession,
    lease: MicLease,
}

pub struct AcousticVoiceRuntime {
    pub suspended: AtomicBool,
    pub record_in_progress: AtomicBool,
    match_stop: AtomicBool,
    match_running: AtomicBool,
    match_thread: Mutex<Option<JoinHandle<()>>>,
    manual_session: Mutex<Option<ActiveManualRecord>>,
    /// Held across multi-take calibration so stop does not restart Vosk between takes.
    calibration_lease: Mutex<Option<MicLease>>,
}

impl AcousticVoiceRuntime {
    pub fn new() -> Self {
        Self {
            suspended: AtomicBool::new(false),
            record_in_progress: AtomicBool::new(false),
            match_stop: AtomicBool::new(true),
            match_running: AtomicBool::new(false),
            match_thread: Mutex::new(None),
            manual_session: Mutex::new(None),
            calibration_lease: Mutex::new(None),
        }
    }

    pub fn set_suspended(&self, on: bool) {
        self.suspended.store(on, Ordering::SeqCst);
    }

    pub fn is_suspended(&self) -> bool {
        self.suspended.load(Ordering::SeqCst)
    }

    pub fn is_match_running(&self) -> bool {
        self.match_running.load(Ordering::SeqCst)
    }
}

fn acoustic_threshold_fields() -> serde_json::Value {
    serde_json::json!({
        "minSpeechMs": MIN_SPEECH_MS,
        "preferSpeechMs": PREFER_SPEECH_MS,
        "maxSpeechMs": MAX_SPEECH_MS,
        "manualMaxMs": MANUAL_MAX_MS,
        "recordTimeoutMs": RECORD_TIMEOUT_MS,
    })
}

fn emit_acoustic_level(
    app: &AppHandle,
    session_id: &str,
    tick: crate::voice_acoustic_record::CaptureLevelTick,
) {
    if session_id.is_empty() {
        return;
    }
    let payload = serde_json::json!({
        "type": "acoustic_record_level",
        "sessionId": session_id,
        "level": tick.level,
        "rms": tick.rms,
        "peak": tick.peak,
        "elapsedMs": tick.elapsed_ms,
        "speechMs": tick.speech_ms,
        "state": "recording",
    });
    // Must not use run_on_main_thread: capture joins from IPC while JS awaits invoke.
    let _ = crate::ipc::emit_app_event(app, "acoustic_record_level", &payload);
}

fn park_calibration_lease(rt: &AcousticVoiceRuntime, lease: MicLease) {
    // Drop any previous parked lease first (release outside would fight).
    let prev = rt.calibration_lease.lock().replace(lease);
    if let Some(mut prev) = prev {
        prev.disarm();
    }
}

fn take_calibration_lease(rt: &AcousticVoiceRuntime) -> Option<MicLease> {
    rt.calibration_lease.lock().take()
}

fn take_manual_session_if_match(
    state: &AcousticVoiceRuntime,
    session_id: &str,
) -> Option<ActiveManualRecord> {
    let mut guard = state.manual_session.lock();
    match guard.as_ref().map(|s| s.session_id.as_str() == session_id) {
        Some(true) => guard.take(),
        _ => None,
    }
}

/// Stop capture and return PCM; park MicLease so engines stay paused for the next take.
fn end_capture_keep_lease(
    session: ActiveManualRecord,
    rt: &AcousticVoiceRuntime,
) -> Result<Vec<f32>, CaptureError> {
    session.capture.request_stop();
    let pcm = session.capture.join_pcm();
    park_calibration_lease(rt, session.lease);
    pcm
}

/// Abort capture and drop lease ownership without resuming engines.
/// Caller must activate desired engine after leaving acoustic suspend.
fn end_capture_release_all(rt: &AcousticVoiceRuntime, session: Option<ActiveManualRecord>) {
    if let Some(mut session) = session {
        session.capture.request_stop();
        let _ = session.capture.join_pcm();
        session.lease.disarm();
    }
    if let Some(mut lease) = take_calibration_lease(rt) {
        lease.disarm();
    }
}

/// Start manual calibration capture. Returns only after stream.play() succeeds.
pub fn record_session_start(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    session_id: Option<&str>,
) -> serde_json::Value {
    let session = session_id.map(str::trim).unwrap_or("").to_string();
    if session.is_empty() {
        return serde_json::json!({
            "ok": false,
            "reason": "invalidSession",
            "messageKey": "habitAcousticCmdUnavailable",
        });
    }

    // Replace any prior capture session; keep lease parked for next open.
    let prior = state.acoustic_voice.manual_session.lock().take();
    if let Some(prev) = prior {
        let _ = end_capture_keep_lease(prev, &state.acoustic_voice);
        state
            .acoustic_voice
            .record_in_progress
            .store(false, Ordering::SeqCst);
    }

    if state
        .acoustic_voice
        .record_in_progress
        .swap(true, Ordering::SeqCst)
    {
        return serde_json::json!({
            "ok": false,
            "reason": "busy",
            "messageKey": "habitAcousticCmdUnavailable",
        });
    }

    crate::audio_win::stop_mic_monitor(&state.mic_monitor);

    // Reuse parked lease between takes — avoids Vosk reclaiming the device.
    let lease = match take_calibration_lease(&state.acoustic_voice) {
        Some(l) => {
            eprintln!("acoustic record_start: reusing calibration mic lease");
            crate::app_log::log_line(
                state.as_ref(),
                "voice",
                "acoustic record_start: reusing calibration mic lease",
            );
            l
        }
        None => crate::voice_bootstrap::acquire_mic_lease(app, state, "acoustic_record_start"),
    };

    let app_for_emit = app.cloned();
    let session_for_emit = session.clone();
    let on_level: Option<crate::voice_acoustic_record::LevelEmitFn> =
        app_for_emit.map(|app_handle| {
            std::sync::Arc::new(move |tick| {
                emit_acoustic_level(&app_handle, &session_for_emit, tick);
            }) as crate::voice_acoustic_record::LevelEmitFn
        });

    let capture = match ManualCaptureSession::start(MANUAL_MAX_MS, on_level) {
        Ok(c) => c,
        Err(err) => {
            eprintln!(
                "acoustic record_start failed kind={:?} detail={}",
                err.kind, err.detail
            );
            crate::app_log::log_line(
                state.as_ref(),
                "voice",
                &format!(
                    "acoustic record_start failed kind={:?} detail={}",
                    err.kind, err.detail
                ),
            );
            // Keep engines paused so FE can retry take without Vosk reclaiming mic.
            park_calibration_lease(&state.acoustic_voice, lease);
            state
                .acoustic_voice
                .record_in_progress
                .store(false, Ordering::SeqCst);
            return capture_error_json(&err);
        }
    };

    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    *state.acoustic_voice.manual_session.lock() = Some(ActiveManualRecord {
        session_id: session.clone(),
        capture,
        lease,
    });

    let mut out = serde_json::json!({
        "ok": true,
        "sessionId": session,
        "startedAt": started_at,
    });
    if let Some(obj) = out.as_object_mut() {
        if let Some(fields) = acoustic_threshold_fields().as_object() {
            for (k, v) in fields {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    out
}

/// Stop matching session, process PCM; keep mic lease parked for subsequent takes.
pub fn record_session_stop(state: &Arc<AppState>, session_id: Option<&str>) -> serde_json::Value {
    let session = session_id.map(str::trim).unwrap_or("").to_string();
    if session.is_empty() {
        return serde_json::json!({
            "ok": false,
            "reason": "mismatch",
            "messageKey": "habitAcousticCmdUnavailable",
        });
    }
    let taken = take_manual_session_if_match(&state.acoustic_voice, &session);
    let Some(active) = taken else {
        return serde_json::json!({
            "ok": false,
            "reason": "stale",
            "messageKey": "habitAcousticCmdUnavailable",
        });
    };

    let pcm_result = end_capture_keep_lease(active, &state.acoustic_voice);
    state
        .acoustic_voice
        .record_in_progress
        .store(false, Ordering::SeqCst);

    let pcm = match pcm_result {
        Ok(p) => p,
        Err(err) => return capture_error_json(&err),
    };
    process_pcm_buffer_manual(&pcm)
}

/// Idempotent cancel. Releases parked calibration lease and any active capture.
pub fn record_session_cancel(state: &Arc<AppState>, session_id: Option<&str>) -> serde_json::Value {
    let session = session_id.map(str::trim).unwrap_or("").to_string();
    let active = if session.is_empty() {
        state.acoustic_voice.manual_session.lock().take()
    } else {
        take_manual_session_if_match(&state.acoustic_voice, &session)
            .or_else(|| state.acoustic_voice.manual_session.lock().take())
    };
    end_capture_release_all(&state.acoustic_voice, active);
    state
        .acoustic_voice
        .record_in_progress
        .store(false, Ordering::SeqCst);
    serde_json::json!({ "ok": true })
}

pub fn acoustic_status(state: &AppState) -> serde_json::Value {
    let rt = &state.acoustic_voice;
    let mut out = serde_json::json!({
        "available": true,
        "suspended": rt.is_suspended(),
        "recordInProgress": rt.record_in_progress.load(Ordering::SeqCst),
        "matchRunning": rt.is_match_running(),
        "sampleRate": TARGET_SAMPLE_RATE,
    });
    if let Some(obj) = out.as_object_mut() {
        if let Some(fields) = acoustic_threshold_fields().as_object() {
            for (k, v) in fields {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    out
}

/// Fast preflight — does not open a full capture stream.
pub fn preflight_record(state: &AppState) -> serde_json::Value {
    let rt = &state.acoustic_voice;
    let record_in_progress = rt.record_in_progress.load(Ordering::SeqCst);
    let suspended = rt.is_suspended();
    let (has_default_input, device_name) = probe_default_input();
    let mut warnings = Vec::new();
    if suspended {
        warnings.push("suspended");
    }
    let ok = !record_in_progress && has_default_input;
    let message_key = if record_in_progress {
        Some("habitAcousticCmdUnavailable")
    } else if !has_default_input {
        Some("habitAcousticCmdNoMic")
    } else {
        None
    };
    let mut out = serde_json::json!({
        "ok": ok,
        "recordInProgress": record_in_progress,
        "suspended": suspended,
        "hasDefaultInput": has_default_input,
        "deviceName": device_name,
        "warnings": warnings,
        "available": true,
    });
    if let Some(key) = message_key {
        out["messageKey"] = serde_json::json!(key);
    }
    if let Some(obj) = out.as_object_mut() {
        if let Some(fields) = acoustic_threshold_fields().as_object() {
            for (k, v) in fields {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    out
}

pub fn acoustic_set_suspend(state: &Arc<AppState>, suspended: bool, app: Option<&AppHandle>) {
    let was_suspended = state.acoustic_voice.is_suspended();
    state.acoustic_voice.set_suspended(suspended);
    if !suspended {
        // Leaving calibration: drop any active capture + parked multi-take lease
        // so activate_desired can reclaim the mic for wake engines.
        let active = state.acoustic_voice.manual_session.lock().take();
        end_capture_release_all(&state.acoustic_voice, active);
        state
            .acoustic_voice
            .record_in_progress
            .store(false, Ordering::SeqCst);
        // Never force-activate on the IPC thread: vosk stop/start can block long enough
        // to freeze the webview (and race fingerprint reloads mid-start).
        if was_suspended && !*state.paused.lock() {
            if let Some(app) = app {
                let app = app.clone();
                let state = Arc::clone(state);
                std::thread::Builder::new()
                    .name("acoustic-unsuspend".into())
                    .spawn(move || {
                        // Brief settle after capture join / WASAPI release.
                        std::thread::sleep(Duration::from_millis(80));
                        crate::voice_bootstrap::activate_desired_engine(
                            &app,
                            &state,
                            "force:acoustic_unsuspend",
                        );
                    })
                    .ok();
            }
        }
    } else if !was_suspended {
        // Quiet matcher only — do NOT pause wake engines here.
        // Exclusive mic capture is handled by MicLease inside record_start.
        crate::app_log::log_line(
            state.as_ref(),
            "voice",
            "acoustic_set_suspend: matcher suspended (engines keep running until record lease)",
        );
    }
    sync_acoustic_match_runtime(app, state);
}

struct RecordInProgressGuard<'a> {
    flag: &'a AtomicBool,
}

impl Drop for RecordInProgressGuard<'_> {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::SeqCst);
    }
}

pub fn record_once(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    session_id: Option<&str>,
) -> serde_json::Value {
    // Calibration may set suspend to quiet the runtime matcher — do not block on it here.
    if state
        .acoustic_voice
        .record_in_progress
        .swap(true, Ordering::SeqCst)
    {
        eprintln!("acoustic record_once rejected: already in progress");
        return record_error_json(RecordReason::Internal, "habitAcousticCmdUnavailable", None);
    }
    let _record_guard = RecordInProgressGuard {
        flag: &state.acoustic_voice.record_in_progress,
    };

    let session = session_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("")
        .to_string();
    eprintln!("acoustic record_once begin session={session}");
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);

    let pcm_result = {
        // MicLease Drop resumes the desired engine even on panic / early return.
        let mut lease =
            crate::voice_bootstrap::acquire_mic_lease(app, state, "acoustic_record_once");
        let app_for_emit = app.cloned();
        let session_for_emit = session.clone();
        let mut level_cb = move |tick: crate::voice_acoustic_record::CaptureLevelTick| {
            let Some(app) = app_for_emit.as_ref() else {
                return;
            };
            if session_for_emit.is_empty() {
                return;
            }
            let payload = serde_json::json!({
                "type": "acoustic_record_level",
                "sessionId": session_for_emit,
                "level": tick.level,
                "rms": tick.rms,
                "peak": tick.peak,
                "elapsedMs": tick.elapsed_ms,
                "speechMs": tick.speech_ms,
                "state": "listening",
            });
            let _ = crate::ipc::emit_app_event(app, "acoustic_record_level", &payload);
        };
        let captured = capture_pcm_mono_16k(RECORD_TIMEOUT_MS, Some(&mut level_cb));
        lease.release();
        captured
    };

    let pcm = match pcm_result {
        Ok(p) => p,
        Err(err) => {
            eprintln!(
                "acoustic record_once capture failed kind={:?} detail={}",
                err.kind, err.detail
            );
            return capture_error_json(&err);
        }
    };

    let out = process_pcm_buffer(&pcm);
    eprintln!(
        "acoustic record_once end ok={}",
        out.get("ok").and_then(|v| v.as_bool()).unwrap_or(false)
    );
    out
}

pub fn capture_error_json(err: &CaptureError) -> serde_json::Value {
    let reason = match err.kind {
        CaptureErrorKind::NoDefaultInput
        | CaptureErrorKind::BuildStream
        | CaptureErrorKind::PlayStream
        | CaptureErrorKind::UnsupportedFormat => RecordReason::Internal,
        CaptureErrorKind::StreamRuntime | CaptureErrorKind::ChannelClosed => RecordReason::NoSpeech,
        CaptureErrorKind::NoAudioCaptured
        | CaptureErrorKind::EmptyBuffer
        | CaptureErrorKind::TooLittleAudio
        | CaptureErrorKind::Timeout => RecordReason::Timeout,
    };
    let mut out = record_error_json(reason, err.message_key(), None);
    out["captureKind"] = serde_json::json!(err.reason_str());
    out["debugSummary"] = serde_json::json!({
        "durationMs": 0,
        "speechMs": 0,
        "rms": 0.0,
        "featureFrames": 0,
        "detail": err.detail,
    });
    out
}

/// Process captured PCM into a sample response (testable without hardware mic).
pub fn process_pcm_buffer(pcm: &[f32]) -> serde_json::Value {
    process_pcm_with_extractor(pcm, false)
}

/// Manual stop path: accept takes over maxSpeechMs by trimming features; warn instead of failing.
pub fn process_pcm_buffer_manual(pcm: &[f32]) -> serde_json::Value {
    process_pcm_with_extractor(pcm, true)
}

fn process_pcm_with_extractor(pcm: &[f32], manual: bool) -> serde_json::Value {
    let segmenter = EnergyGateSegmenter::default();
    let extracted = if manual {
        extract_sample_from_pcm_manual(pcm, TARGET_SAMPLE_RATE, &segmenter)
    } else {
        extract_sample_from_pcm_with_segmenter(pcm, TARGET_SAMPLE_RATE, &segmenter)
    };
    match extracted {
        Ok((sample, debug)) => {
            if let Ok(line) = serde_json::to_string(&serde_json::json!({
                "durationMs": debug.duration_ms,
                "speechMs": debug.speech_ms,
                "rms": debug.rms,
                "featureFrames": debug.feature_frames,
            })) {
                eprintln!("acoustic record process debugSummary: {line}");
            }
            let truncated = debug.speech_ms > MAX_SPEECH_MS;
            let mut out = serde_json::json!({
                "ok": true,
                "sample": sample,
                "debugSummary": {
                    "durationMs": debug.duration_ms,
                    "speechMs": debug.speech_ms,
                    "rms": debug.rms,
                    "featureFrames": debug.feature_frames,
                    "truncated": truncated,
                }
            });
            if manual && truncated {
                out["warnings"] = serde_json::json!(["habitAcousticCmdWarnTrimmed"]);
            }
            out
        }
        Err(reason) => {
            let duration_ms = ((pcm.len() as u64) * 1000 / TARGET_SAMPLE_RATE as u64) as u32;
            let seg = segmenter.segment(pcm, TARGET_SAMPLE_RATE);
            let speech = seg.slice(pcm);
            let rms = if speech.is_empty() {
                0.0
            } else {
                let sum: f32 = speech.iter().map(|s| s * s).sum();
                (sum / speech.len() as f32).sqrt()
            };
            record_error_json(
                reason,
                reason.message_key(),
                Some(serde_json::json!({
                    "durationMs": duration_ms,
                    "speechMs": seg.duration_ms,
                    "rms": rms,
                    "featureFrames": 0,
                })),
            )
        }
    }
}

fn record_error_json(
    reason: RecordReason,
    message_key: &str,
    debug: Option<serde_json::Value>,
) -> serde_json::Value {
    let reason_str = match reason {
        RecordReason::NoSpeech => "noSpeech",
        RecordReason::TooShort => "tooShort",
        RecordReason::TooLong => "tooLong",
        RecordReason::Timeout => "timeout",
        RecordReason::Internal => "internal",
    };
    let mut out = serde_json::json!({
        "ok": false,
        "reason": reason_str,
        "messageKey": message_key,
    });
    if let Some(d) = debug {
        out["debugSummary"] = d;
    }
    out
}

pub fn build_command_from_samples(
    samples: Vec<AcousticVoiceCommandSample>,
    opts: BuildFromSamplesOptions<'_>,
) -> BuildFromSamplesResult {
    build_from_samples(samples, opts)
}

pub fn build_command_json(
    samples: Vec<AcousticVoiceCommandSample>,
    scenario_id: &str,
    activation_scope: &str,
    app_boost: bool,
    display_text: &str,
    current_command_id: Option<&str>,
) -> serde_json::Value {
    let built = build_from_samples(
        samples,
        BuildFromSamplesOptions {
            scenario_id,
            activation_scope,
            app_boost,
            display_text,
            current_command_id,
        },
    );
    serde_json::json!({
        "ok": built.ok,
        "command": built.command,
        "quality": built.quality,
        "reason": built.reason,
        "messageKey": built.message_key,
        "warnings": built.warnings,
        "agreement": built.agreement,
    })
}

pub fn has_enabled_acoustic_commands(cfg: &VoiceConfig) -> bool {
    if cfg
        .voice_wake_acoustic_commands
        .iter()
        .any(|c| c.enabled && !c.samples.is_empty())
    {
        return true;
    }
    cfg.mappings.iter().any(|m| {
        m.enabled
            && m.acoustic_voice_commands
                .iter()
                .any(|c| c.enabled && !c.samples.is_empty())
    })
}

fn pcm_source_listening(state: &AppState) -> bool {
    let vosk = state.voice_vosk_state.lock();
    let vosk_listening = vosk.as_str() == "listening";
    drop(vosk);
    let kws = state.voice_kws_state.lock();
    let kws_listening = kws.as_str() == "listening";
    drop(kws);
    let cfg = state.cfg.lock().clone();
    let kws_ready = crate::voice_kws_runtime::kws_readiness(state, &cfg, None).ready;
    pcm_source_listening_from_states(vosk_listening, kws_listening, kws_ready)
}

fn pcm_source_listening_from_states(
    vosk_listening: bool,
    kws_listening: bool,
    kws_ready: bool,
) -> bool {
    vosk_listening || (kws_listening && kws_ready)
}

pub fn sync_acoustic_match_runtime(app: Option<&AppHandle>, state: &Arc<AppState>) {
    let cfg = state.cfg.lock().clone();
    let should_run = has_enabled_acoustic_commands(&cfg)
        && pcm_source_listening(state)
        && !state.acoustic_voice.is_suspended()
        && !*state.paused.lock();

    if should_run {
        start_acoustic_match_runtime(app, state);
    } else {
        stop_acoustic_match_runtime(state);
    }
}

pub fn start_acoustic_match_runtime(app: Option<&AppHandle>, state: &Arc<AppState>) {
    if state.acoustic_voice.match_running.load(Ordering::SeqCst) {
        return;
    }
    stop_acoustic_match_runtime(state);

    let frame_rx = state.audio_frame_bus.subscriber();
    state
        .acoustic_voice
        .match_stop
        .store(false, Ordering::SeqCst);
    state
        .acoustic_voice
        .match_running
        .store(true, Ordering::SeqCst);

    let worker_state = Arc::clone(state);
    let app_handle = app.cloned();
    let handle = std::thread::Builder::new()
        .name("acoustic-match".into())
        .spawn(move || {
            run_acoustic_match_loop(worker_state, app_handle, frame_rx);
        });
    if let Ok(h) = handle {
        *state.acoustic_voice.match_thread.lock() = Some(h);
    } else {
        state
            .acoustic_voice
            .match_running
            .store(false, Ordering::SeqCst);
        state
            .acoustic_voice
            .match_stop
            .store(true, Ordering::SeqCst);
    }
}

pub fn stop_acoustic_match_runtime(state: &Arc<AppState>) {
    state
        .acoustic_voice
        .match_stop
        .store(true, Ordering::SeqCst);
    let handle = state.acoustic_voice.match_thread.lock().take();
    state
        .acoustic_voice
        .match_running
        .store(false, Ordering::SeqCst);
    let Some(handle) = handle else {
        return;
    };
    // Never unbounded-join here: activate holds ACTIVATE_LOCK and strategy IPC used to
    // 假死 when match was stuck inside MFCC / command scoring (省电切策略停 Vosk 后常见).
    const JOIN_TIMEOUT: Duration = Duration::from_millis(800);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::Builder::new()
        .name("acoustic-match-join".into())
        .spawn(move || {
            let _ = handle.join();
            let _ = tx.send(());
        })
        .ok();
    match rx.recv_timeout(JOIN_TIMEOUT) {
        Ok(()) => {}
        Err(_) => {
            crate::app_log::log_line(
                state.as_ref(),
                "acoustic",
                &format!(
                    "match stop join timed out after {}ms — detaching",
                    JOIN_TIMEOUT.as_millis()
                ),
            );
        }
    }
}

fn run_acoustic_match_loop(
    state: Arc<AppState>,
    app: Option<AppHandle>,
    frame_rx: Receiver<Vec<f32>>,
) {
    let rt = &state.acoustic_voice;
    let mut pcm_buf: Vec<f32> = Vec::with_capacity(MATCH_BUFFER_MAX_SAMPLES);
    let mut in_speech = false;
    let mut silence_started: Option<Instant> = None;
    let mut last_emit_at: Option<Instant> = None;

    while !rt.match_stop.load(Ordering::Relaxed) {
        if rt.is_suspended() || *state.paused.lock() {
            std::thread::sleep(Duration::from_millis(80));
            pcm_buf.clear();
            in_speech = false;
            silence_started = None;
            continue;
        }

        match frame_rx.recv_timeout(Duration::from_millis(120)) {
            Ok(chunk) => {
                pcm_buf.extend_from_slice(&chunk);
                if pcm_buf.len() > MATCH_BUFFER_MAX_SAMPLES {
                    let drop_n = pcm_buf.len() - MATCH_BUFFER_MAX_SAMPLES;
                    pcm_buf.drain(0..drop_n);
                }
                let rms = chunk_rms(&chunk);
                if rms >= MATCH_SPEECH_RMS {
                    in_speech = true;
                    silence_started = None;
                } else if in_speech {
                    if silence_started.is_none() {
                        silence_started = Some(Instant::now());
                    } else if silence_started.unwrap().elapsed()
                        >= Duration::from_millis(MATCH_SILENCE_MS)
                    {
                        try_emit_acoustic_match(&state, app.as_ref(), &pcm_buf, &mut last_emit_at);
                        pcm_buf.clear();
                        in_speech = false;
                        silence_started = None;
                    }
                }
            }
            Err(_) => {}
        }
    }
}

fn chunk_rms(chunk: &[f32]) -> f32 {
    if chunk.is_empty() {
        return 0.0;
    }
    let sum: f32 = chunk.iter().map(|s| s * s).sum();
    (sum / chunk.len() as f32).sqrt()
}

fn try_emit_acoustic_match(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    pcm: &[f32],
    last_emit_at: &mut Option<Instant>,
) {
    if state.acoustic_voice.match_stop.load(Ordering::Relaxed) {
        return;
    }
    if pcm.len() < (TARGET_SAMPLE_RATE as usize * 300 / 1000) {
        return;
    }
    let sample = match extract_mfcc_from_pcm_f32(pcm, TARGET_SAMPLE_RATE) {
        Some(s) => s,
        None => {
            crate::app_log::log_line(
                state.as_ref(),
                "acoustic",
                &format!(
                    "match skip: feature extract failed (pcm_ms≈{})",
                    pcm.len() as u64 * 1000 / TARGET_SAMPLE_RATE as u64
                ),
            );
            return;
        }
    };
    let cfg = state.cfg.lock().clone();
    let foreground = foreground_app_target_id();
    let commands = collect_match_commands(&cfg, foreground.as_deref());
    if commands.is_empty() {
        crate::app_log::log_line(
            state.as_ref(),
            "acoustic",
            "match skip: no enabled acoustic commands in scope",
        );
        return;
    }
    let matched = match_acoustic_commands(&sample.feature, sample.feature_frames, &commands);
    let Some(hit) = matched else {
        let best = best_match_score_hint(&sample.feature, sample.feature_frames, &commands);
        crate::app_log::log_line(
            state.as_ref(),
            "acoustic",
            &format!(
                "match miss: frames={} best≈{:.3} cmds={}",
                sample.feature_frames,
                best.unwrap_or(0.0),
                commands.len()
            ),
        );
        return;
    };

    let now = Instant::now();
    if let Some(prev) = *last_emit_at {
        if now.duration_since(prev) < Duration::from_millis(MATCH_COOLDOWN_MS) {
            return;
        }
    }
    *last_emit_at = Some(now);

    crate::app_log::log_line(
        state.as_ref(),
        "acoustic",
        &format!(
            "match hit: scenario={} cmd={} score={:.3}",
            hit.scenario_id, hit.command_id, hit.score
        ),
    );

    if hit.scenario_id == "__voice_wake__" {
        if let Some(app) = app {
            let phrase = commands
                .iter()
                .find(|c| c.id == hit.command_id)
                .map(|c| {
                    let display = c.display_text.trim();
                    if !display.is_empty() {
                        display.to_string()
                    } else if !c.label.trim().is_empty() {
                        c.label.clone()
                    } else {
                        "acoustic-wake".into()
                    }
                })
                .unwrap_or_else(|| "acoustic-wake".into());
            crate::voice_end_runtime::handle_voice_wake_detected(
                state,
                app,
                &phrase,
                280,
                "acoustic-wake",
            );
        }
        return;
    }

    if hit.scenario_id == "__voice_end__" || hit.scenario_id == "__voice_cancel__" {
        if let Some(app) = app {
            let phrase = commands
                .iter()
                .find(|c| c.id == hit.command_id)
                .map(|c| {
                    let display = c.display_text.trim();
                    if !display.is_empty() {
                        display.to_string()
                    } else if !c.label.trim().is_empty() {
                        c.label.clone()
                    } else if hit.scenario_id == "__voice_cancel__" {
                        "acoustic-cancel".into()
                    } else {
                        "acoustic-end".into()
                    }
                })
                .unwrap_or_else(|| {
                    if hit.scenario_id == "__voice_cancel__" {
                        "acoustic-cancel".into()
                    } else {
                        "acoustic-end".into()
                    }
                });
            if hit.scenario_id == "__voice_cancel__" {
                crate::voice_end_runtime::handle_cancel_phrase(state, app, &phrase);
            } else {
                crate::voice_end_runtime::handle_end_phrase(state, app, &phrase);
            }
        }
        return;
    }

    if let Some(app) = app {
        crate::voice_end_runtime::handle_acoustic_scene_command(
            state,
            app,
            &hit.scenario_id,
            &hit.command_id,
            hit.score,
        );
    } else {
        crate::runtime_event::publish_runtime_event(
            None,
            state.as_ref(),
            "acoustic",
            "acoustic_voice_matched",
            "acoustic voice command matched (no app handle)",
            Some(serde_json::json!({
                "scenarioId": hit.scenario_id,
                "commandId": hit.command_id,
                "score": hit.score,
            })),
        );
    }
}

fn best_match_score_hint(
    live: &[f32],
    live_frames: u32,
    commands: &[AcousticVoiceCommand],
) -> Option<f64> {
    use crate::voice_acoustic_command::dtw_similarity;
    let mut best = 0.0f64;
    let mut any = false;
    for cmd in commands {
        for sample in &cmd.samples {
            let sim = dtw_similarity(
                live,
                live_frames,
                &sample.feature,
                sample.feature_frames,
                sample.feature_dims,
            );
            any = true;
            if sim > best {
                best = sim;
            }
        }
    }
    if any {
        Some(best)
    } else {
        None
    }
}

fn collect_match_commands(
    cfg: &VoiceConfig,
    foreground_app_id: Option<&str>,
) -> Vec<AcousticVoiceCommand> {
    let mut out = Vec::new();
    for cmd in &cfg.voice_wake_acoustic_commands {
        if !cmd.enabled || cmd.samples.is_empty() {
            continue;
        }
        let mut cloned = cmd.clone();
        let sid = cloned.scenario_id.trim();
        if sid.is_empty() {
            cloned.scenario_id = "__voice_wake__".into();
        }
        if cloned.kind.trim().is_empty() || cloned.kind == "scenario-acoustic-activate" {
            cloned.kind = match cloned.scenario_id.as_str() {
                "__voice_end__" => "voice-end-acoustic".into(),
                "__voice_cancel__" => "voice-cancel-acoustic".into(),
                _ => "voice-wake-acoustic".into(),
            };
        }
        cloned.activation_scope = "global".into();
        out.push(cloned);
    }
    for mapping in &cfg.mappings {
        if !mapping.enabled {
            continue;
        }
        for cmd in &mapping.acoustic_voice_commands {
            if !cmd.enabled || cmd.samples.is_empty() {
                continue;
            }
            if cmd.activation_scope == "foreground-app" {
                let fg = foreground_app_id.unwrap_or("").trim();
                if fg.is_empty() {
                    continue;
                }
                let target = mapping.app_target_id.trim();
                if !target.is_empty() && target != fg {
                    continue;
                }
            }
            out.push(cmd.clone());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::pcm_source_listening_from_states;

    #[test]
    fn acoustic_pcm_can_run_with_non_vosk_source() {
        assert!(pcm_source_listening_from_states(false, true, true));
        assert!(!pcm_source_listening_from_states(false, true, false));
        assert!(pcm_source_listening_from_states(true, false, false));
    }
}
