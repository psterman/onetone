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
    build_from_samples, extract_mfcc_from_pcm_f32, extract_sample_from_pcm_with_segmenter,
    match_acoustic_commands, EnergyGateSegmenter, BuildFromSamplesOptions, BuildFromSamplesResult,
    RecordReason, SpeechSegmenter, RECORD_TIMEOUT_MS,
};
use crate::voice_acoustic_record::{capture_pcm_mono_16k, TARGET_SAMPLE_RATE};
use crate::AppState;

const MATCH_COOLDOWN_MS: u64 = 1500;
const MATCH_BUFFER_MAX_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 3;
const MATCH_SPEECH_RMS: f32 = 0.008;
const MATCH_SILENCE_MS: u64 = 450;

pub struct AcousticVoiceRuntime {
    pub suspended: AtomicBool,
    pub record_in_progress: AtomicBool,
    match_stop: AtomicBool,
    match_running: AtomicBool,
    match_thread: Mutex<Option<JoinHandle<()>>>,
}

impl AcousticVoiceRuntime {
    pub fn new() -> Self {
        Self {
            suspended: AtomicBool::new(false),
            record_in_progress: AtomicBool::new(false),
            match_stop: AtomicBool::new(true),
            match_running: AtomicBool::new(false),
            match_thread: Mutex::new(None),
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

pub fn acoustic_status(state: &AppState) -> serde_json::Value {
    let rt = &state.acoustic_voice;
    serde_json::json!({
        "available": true,
        "suspended": rt.is_suspended(),
        "recordInProgress": rt.record_in_progress.load(Ordering::SeqCst),
        "matchRunning": rt.is_match_running(),
        "sampleRate": TARGET_SAMPLE_RATE,
    })
}

pub fn acoustic_set_suspend(state: &Arc<AppState>, suspended: bool, app: Option<&AppHandle>) {
    let was_suspended = state.acoustic_voice.is_suspended();
    state.acoustic_voice.set_suspended(suspended);
    if !suspended {
        state
            .acoustic_voice
            .record_in_progress
            .store(false, Ordering::SeqCst);
        // Calibration finished: wake engines may still be down if MicLease skipped
        // resume while suspended=true. Force reconcile.
        if was_suspended && !*state.paused.lock() {
            if let Some(app) = app {
                crate::voice_bootstrap::activate_desired_engine(app, state, "acoustic_unsuspend");
            }
        }
    } else if !was_suspended {
        // Quiet matcher only — do NOT pause wake engines here.
        // Exclusive mic capture is handled by MicLease inside record_once.
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

pub fn record_once(state: &Arc<AppState>, app: Option<&AppHandle>) -> serde_json::Value {
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

    eprintln!("acoustic record_once begin");
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);

    let pcm_result = {
        // MicLease Drop resumes the desired engine even on panic / early return.
        let mut lease =
            crate::voice_bootstrap::acquire_mic_lease(app, state, "acoustic_record_once");
        let captured = capture_pcm_mono_16k(RECORD_TIMEOUT_MS);
        lease.release();
        captured
    };

    let pcm = match pcm_result {
        Ok(p) => p,
        Err(err) => {
            eprintln!("acoustic record_once capture failed: {err}");
            return capture_error_json(&err);
        }
    };

    let out = process_pcm_buffer(&pcm);
    eprintln!("acoustic record_once end ok={}", out.get("ok").and_then(|v| v.as_bool()).unwrap_or(false));
    out
}

fn capture_error_json(err: &str) -> serde_json::Value {
    let lower = err.to_ascii_lowercase();
    let (reason, key) = if lower.contains("no default input device") {
        (RecordReason::Internal, "habitAcousticCmdNoMic")
    } else if lower.contains("microphone stream error") || lower.contains("no audio captured") {
        (RecordReason::NoSpeech, "habitAcousticCmdMicBusy")
    } else {
        (RecordReason::NoSpeech, "habitAcousticCmdTimeout")
    };
    record_error_json(reason, key, None)
}

/// Process captured PCM into a sample response (testable without hardware mic).
pub fn process_pcm_buffer(pcm: &[f32]) -> serde_json::Value {
    let segmenter = EnergyGateSegmenter::default();
    match extract_sample_from_pcm_with_segmenter(pcm, TARGET_SAMPLE_RATE, &segmenter) {
        Ok((sample, debug)) => {
            if let Ok(line) = serde_json::to_string(&serde_json::json!({
                "durationMs": debug.duration_ms,
                "speechMs": debug.speech_ms,
                "rms": debug.rms,
                "featureFrames": debug.feature_frames,
            })) {
                eprintln!("acoustic record_once debugSummary: {line}");
            }
            serde_json::json!({
                "ok": true,
                "sample": sample,
                "debugSummary": {
                    "durationMs": debug.duration_ms,
                    "speechMs": debug.speech_ms,
                    "rms": debug.rms,
                    "featureFrames": debug.feature_frames,
                }
            })
        }
        Err(reason) => {
            let duration_ms =
                ((pcm.len() as u64) * 1000 / TARGET_SAMPLE_RATE as u64) as u32;
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
    cfg.mappings.iter().any(|m| {
        m.enabled
            && m.acoustic_voice_commands
                .iter()
                .any(|c| c.enabled && !c.samples.is_empty())
    })
}

fn pcm_source_listening(state: &AppState) -> bool {
    let vosk = state.voice_vosk_state.lock();
    if vosk.as_str() == "listening" {
        return true;
    }
    let kws = state.voice_kws_state.lock();
    kws.as_str() == "listening"
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
    state.acoustic_voice.match_stop.store(false, Ordering::SeqCst);
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
        state.acoustic_voice.match_running.store(false, Ordering::SeqCst);
        state.acoustic_voice.match_stop.store(true, Ordering::SeqCst);
    }
}

pub fn stop_acoustic_match_runtime(state: &Arc<AppState>) {
    state.acoustic_voice.match_stop.store(true, Ordering::SeqCst);
    if let Some(handle) = state.acoustic_voice.match_thread.lock().take() {
        let _ = handle.join();
    }
    state
        .acoustic_voice
        .match_running
        .store(false, Ordering::SeqCst);
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
                    } else if silence_started.unwrap().elapsed() >= Duration::from_millis(MATCH_SILENCE_MS)
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
    let matched = match_acoustic_commands(
        &sample.feature,
        sample.feature_frames,
        &commands,
    );
    let Some(hit) = matched else {
        let best = best_match_score_hint(
            &sample.feature,
            sample.feature_frames,
            &commands,
        );
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
