//! Short independent cpal capture for acoustic command calibration (M3).
//! Does not depend on Vosk/KWS runtime.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig, SupportedStreamConfigRange};
use crossbeam_channel::bounded;

use parking_lot::Mutex;
use std::thread::JoinHandle;

use crate::voice_acoustic_command::{utterance_capture_complete, MANUAL_MAX_MS, RECORD_TIMEOUT_MS};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;
const LEVEL_EMIT_MIN_MS: u64 = 80;
const STREAM_READY_TIMEOUT_MS: u64 = 4500;
const OPEN_RETRY_COUNT: u32 = 3;
const OPEN_RETRY_DELAY_MS: u64 = 350;
/// Below this capture length after timeout, treat as "too little audio" rather than a full utterance timeout.
const TOO_LITTLE_AUDIO_SAMPLES: usize = TARGET_SAMPLE_RATE as usize / 5; // ~200ms

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureErrorKind {
    NoDefaultInput,
    BuildStream,
    PlayStream,
    StreamRuntime,
    UnsupportedFormat,
    ChannelClosed,
    NoAudioCaptured,
    EmptyBuffer,
    TooLittleAudio,
    Timeout,
}

#[derive(Debug, Clone)]
pub struct CaptureError {
    pub kind: CaptureErrorKind,
    pub detail: String,
}

impl CaptureError {
    pub fn new(kind: CaptureErrorKind, detail: impl Into<String>) -> Self {
        Self {
            kind,
            detail: detail.into(),
        }
    }

    pub fn message_key(&self) -> &'static str {
        match self.kind {
            CaptureErrorKind::NoDefaultInput => "habitAcousticCmdNoMic",
            CaptureErrorKind::BuildStream
            | CaptureErrorKind::PlayStream
            | CaptureErrorKind::UnsupportedFormat => "habitAcousticCmdStreamFailed",
            CaptureErrorKind::StreamRuntime | CaptureErrorKind::ChannelClosed => {
                "habitAcousticCmdMicBusy"
            }
            CaptureErrorKind::NoAudioCaptured | CaptureErrorKind::EmptyBuffer => {
                "habitAcousticCmdNoAudio"
            }
            CaptureErrorKind::TooLittleAudio => "habitAcousticCmdTooShort",
            CaptureErrorKind::Timeout => "habitAcousticCmdTimeout",
        }
    }

    pub fn reason_str(&self) -> &'static str {
        match self.kind {
            CaptureErrorKind::NoDefaultInput => "noMic",
            CaptureErrorKind::BuildStream => "buildStream",
            CaptureErrorKind::PlayStream => "playStream",
            CaptureErrorKind::StreamRuntime => "streamRuntime",
            CaptureErrorKind::UnsupportedFormat => "unsupportedFormat",
            CaptureErrorKind::ChannelClosed => "channelClosed",
            CaptureErrorKind::NoAudioCaptured => "noAudio",
            CaptureErrorKind::EmptyBuffer => "emptyBuffer",
            CaptureErrorKind::TooLittleAudio => "tooLittleAudio",
            CaptureErrorKind::Timeout => "timeout",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CaptureLevelTick {
    pub level: f32,
    pub rms: f32,
    pub peak: f32,
    pub elapsed_ms: u32,
    pub speech_ms: u32,
}

/// Lightweight probe: default input device exists (no stream open).
pub fn probe_default_input() -> (bool, Option<String>) {
    let host = cpal::default_host();
    match host.default_input_device() {
        Some(dev) => {
            let name = dev.name().ok();
            (true, name)
        }
        None => (false, None),
    }
}

/// Long-lived calibration capture. Stream starts only after `play()` succeeds;
/// ends when `request_stop()` is called or `manual_max_ms` elapses.
pub struct ManualCaptureSession {
    stop: Arc<AtomicBool>,
    pcm: Arc<Mutex<Vec<f32>>>,
    thread: Option<JoinHandle<()>>,
    error: Arc<Mutex<Option<CaptureError>>>,
    started_at: Instant,
}

pub type LevelEmitFn = Arc<dyn Fn(CaptureLevelTick) + Send + Sync + 'static>;

impl ManualCaptureSession {
    /// Open mic, `play()`, then return. Level ticks fire on a background thread.
    pub fn start(manual_max_ms: u32, on_level: Option<LevelEmitFn>) -> Result<Self, CaptureError> {
        let manual_max_ms = manual_max_ms.clamp(500, MANUAL_MAX_MS.max(500));
        let stop = Arc::new(AtomicBool::new(false));
        let pcm = Arc::new(Mutex::new(Vec::new()));
        let error = Arc::new(Mutex::new(None));
        let stream_ready = Arc::new(AtomicBool::new(false));
        let (ready_tx, ready_rx) = bounded::<Result<(), CaptureError>>(1);

        let stop_t = stop.clone();
        let pcm_t = pcm.clone();
        let error_t = error.clone();
        let ready_flag = stream_ready.clone();
        let thread = std::thread::Builder::new()
            .name("acoustic-manual-capture".into())
            .spawn(move || {
                if let Err(err) = run_manual_capture_loop(
                    manual_max_ms,
                    stop_t,
                    pcm_t,
                    on_level,
                    ready_tx,
                    ready_flag,
                ) {
                    *error_t.lock() = Some(err);
                }
            })
            .map_err(|e| {
                CaptureError::new(
                    CaptureErrorKind::BuildStream,
                    format!("spawn capture thread: {e}"),
                )
            })?;

        match ready_rx.recv_timeout(Duration::from_millis(STREAM_READY_TIMEOUT_MS)) {
            Ok(Ok(())) => Ok(Self {
                stop,
                pcm,
                thread: Some(thread),
                error,
                started_at: Instant::now(),
            }),
            Ok(Err(err)) => {
                stop.store(true, Ordering::SeqCst);
                // Open already failed — thread exits soon; short join is OK.
                let _ = thread.join();
                Err(err)
            }
            Err(_) => {
                // play()/open may finish just after the wait — honor ready_flag.
                if stream_ready.load(Ordering::SeqCst) {
                    crate::app_log::sync_emergency_line("rs", &format!("acoustic manual capture: ready raced timeout; treating as ok"));
                    return Ok(Self {
                        stop,
                        pcm,
                        thread: Some(thread),
                        error,
                        started_at: Instant::now(),
                    });
                }
                // Never join here: WASAPI open() can block indefinitely while the device
                // is held by a pausing wake engine. Sync join freezes record_start IPC
                // and the UI stays on「正在打开麦克风」.
                stop.store(true, Ordering::SeqCst);
                std::thread::Builder::new()
                    .name("acoustic-capture-abandon".into())
                    .spawn(move || {
                        let _ = thread.join();
                    })
                    .ok();
                if let Some(err) = error.lock().clone() {
                    return Err(err);
                }
                Err(CaptureError::new(
                    CaptureErrorKind::StreamRuntime,
                    "microphone stream ready timeout (device busy?)",
                ))
            }
        }
    }

    pub fn request_stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }

    pub fn started_at_ms(&self) -> u128 {
        self.started_at.elapsed().as_millis()
    }

    /// Join capture thread and take PCM. Call only after `request_stop` (or rely on max).
    pub fn join_pcm(mut self) -> Result<Vec<f32>, CaptureError> {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
        if let Some(err) = self.error.lock().clone() {
            return Err(err);
        }
        let out = std::mem::take(&mut *self.pcm.lock());
        if out.is_empty() {
            return Err(CaptureError::new(
                CaptureErrorKind::NoAudioCaptured,
                "no audio captured",
            ));
        }
        if out.len() < TOO_LITTLE_AUDIO_SAMPLES {
            return Err(CaptureError::new(
                CaptureErrorKind::TooLittleAudio,
                format!("too little audio: {} samples", out.len()),
            ));
        }
        Ok(out)
    }
}

fn run_manual_capture_loop(
    manual_max_ms: u32,
    stop: Arc<AtomicBool>,
    pcm: Arc<Mutex<Vec<f32>>>,
    on_level: Option<LevelEmitFn>,
    ready_tx: crossbeam_channel::Sender<Result<(), CaptureError>>,
    stream_ready: Arc<AtomicBool>,
) -> Result<(), CaptureError> {
    let mut last_err = CaptureError::new(CaptureErrorKind::BuildStream, "microphone open failed");

    let opened = 'open: {
        for attempt in 1..=OPEN_RETRY_COUNT {
            if stop.load(Ordering::SeqCst) {
                let err = CaptureError::new(CaptureErrorKind::StreamRuntime, "capture cancelled");
                let _ = ready_tx.send(Err(err.clone()));
                return Err(err);
            }
            crate::app_log::sync_emergency_line("rs", &format!("acoustic manual capture: open attempt {attempt}/{OPEN_RETRY_COUNT}"));
            match open_manual_input_stream() {
                Ok(bundle) => break 'open bundle,
                Err(err) => {
                    crate::app_log::sync_emergency_line("rs", &format!(
                        "acoustic manual capture: open attempt {attempt} failed kind={:?} detail={}",
                        err.kind, err.detail
                    ));
                    last_err = err;
                    if attempt < OPEN_RETRY_COUNT {
                        std::thread::sleep(Duration::from_millis(OPEN_RETRY_DELAY_MS));
                    }
                }
            }
        }
        let _ = ready_tx.send(Err(last_err.clone()));
        return Err(last_err);
    };

    let ManualStreamBundle {
        stream,
        rx,
        err_flag,
        sample_rate,
        tx_drop,
    } = opened;
    drop(tx_drop);

    stream_ready.store(true, Ordering::SeqCst);
    if ready_tx.send(Ok(())).is_err() {
        crate::app_log::sync_emergency_line("rs", &format!("acoustic manual capture: ready notify dropped (caller timed out?)"));
        // Keep recording if caller already accepted via ready_flag; otherwise exit.
        if stop.load(Ordering::SeqCst) {
            drop(stream);
            return Ok(());
        }
    }

    let started = Instant::now();
    let deadline = started + Duration::from_millis(manual_max_ms as u64);
    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut last_emit = Instant::now() - Duration::from_millis(LEVEL_EMIT_MIN_MS);
    let mut smooth_rms = 0.0f32;
    let mut peak = 0.0f32;

    while Instant::now() < deadline && !stop.load(Ordering::SeqCst) {
        if err_flag.load(Ordering::Relaxed) {
            drop(stream);
            return Err(CaptureError::new(
                CaptureErrorKind::StreamRuntime,
                "microphone stream error",
            ));
        }
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok(chunk) => {
                let chunk_peak = chunk.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                peak = peak.max(chunk_peak);
                let chunk_rms = if chunk.is_empty() {
                    0.0
                } else {
                    let sum: f32 = chunk.iter().map(|s| s * s).sum();
                    (sum / chunk.len() as f32).sqrt()
                };
                smooth_rms = smooth_rms * 0.7 + chunk_rms * 0.3;
                let resampled = resampler.process_f32(&chunk);
                if !resampled.is_empty() {
                    pcm.lock().extend_from_slice(&resampled);
                }
                if last_emit.elapsed() >= Duration::from_millis(LEVEL_EMIT_MIN_MS) {
                    last_emit = Instant::now();
                    if let Some(cb) = on_level.as_ref() {
                        let snapshot = pcm.lock();
                        let speech_ms = approx_speech_ms(&snapshot);
                        let elapsed_ms = started.elapsed().as_millis() as u32;
                        let level = (smooth_rms * 8.0).clamp(0.0, 1.0);
                        cb(CaptureLevelTick {
                            level,
                            rms: smooth_rms,
                            peak,
                            elapsed_ms,
                            speech_ms,
                        });
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                if last_emit.elapsed() >= Duration::from_millis(LEVEL_EMIT_MIN_MS) {
                    last_emit = Instant::now();
                    if let Some(cb) = on_level.as_ref() {
                        let snapshot = pcm.lock();
                        let speech_ms = approx_speech_ms(&snapshot);
                        cb(CaptureLevelTick {
                            level: (smooth_rms * 8.0).clamp(0.0, 1.0),
                            rms: smooth_rms,
                            peak,
                            elapsed_ms: started.elapsed().as_millis() as u32,
                            speech_ms,
                        });
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }
    drop(stream);
    Ok(())
}

struct ManualStreamBundle {
    stream: cpal::Stream,
    rx: crossbeam_channel::Receiver<Vec<f32>>,
    err_flag: Arc<AtomicBool>,
    sample_rate: u32,
    /// Drop after play so the stream alone keeps pulling; kept until play succeeds.
    tx_drop: crossbeam_channel::Sender<Vec<f32>>,
}

fn open_manual_input_stream() -> Result<ManualStreamBundle, CaptureError> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        CaptureError::new(CaptureErrorKind::NoDefaultInput, "no default input device")
    })?;
    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;
    let (tx, rx) = bounded::<Vec<f32>>(256);
    let err_flag = Arc::new(AtomicBool::new(false));
    let err_flag_cb = err_flag.clone();
    let err_fn = move |err| {
        crate::app_log::sync_emergency_line("rs", &format!("acoustic manual cpal stream error: {err}"));
        err_flag_cb.store(true, Ordering::Relaxed);
    };

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| push_mono_f32(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| push_mono_i16(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| push_mono_u16(data, channels, &tx),
                err_fn,
                None,
            )
        }
        other => {
            return Err(CaptureError::new(
                CaptureErrorKind::UnsupportedFormat,
                format!("unsupported sample format: {other:?}"),
            ));
        }
    }
    .map_err(|e| {
        CaptureError::new(
            CaptureErrorKind::BuildStream,
            format!("build input stream: {e}"),
        )
    })?;

    stream.play().map_err(|e| {
        CaptureError::new(
            CaptureErrorKind::PlayStream,
            format!("play input stream: {e}"),
        )
    })?;

    Ok(ManualStreamBundle {
        stream,
        rx,
        err_flag,
        sample_rate,
        tx_drop: tx,
    })
}

pub fn capture_pcm_mono_16k(
    timeout_ms: u32,
    mut on_level: Option<&mut dyn FnMut(CaptureLevelTick)>,
) -> Result<Vec<f32>, CaptureError> {
    let timeout_ms = timeout_ms.min(RECORD_TIMEOUT_MS).max(500);
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or_else(|| {
        CaptureError::new(CaptureErrorKind::NoDefaultInput, "no default input device")
    })?;
    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;
    let (tx, rx) = bounded::<Vec<f32>>(256);
    let err_flag = Arc::new(AtomicBool::new(false));
    let err_flag_cb = err_flag.clone();
    let err_fn = move |err| {
        crate::app_log::sync_emergency_line("rs", &format!("acoustic cpal stream error: {err}"));
        err_flag_cb.store(true, Ordering::Relaxed);
    };

    let stream = match sample_format {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| push_mono_f32(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| push_mono_i16(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let tx = tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| push_mono_u16(data, channels, &tx),
                err_fn,
                None,
            )
        }
        other => {
            return Err(CaptureError::new(
                CaptureErrorKind::UnsupportedFormat,
                format!("unsupported sample format: {other:?}"),
            ));
        }
    }
    .map_err(|e| {
        CaptureError::new(
            CaptureErrorKind::BuildStream,
            format!("build input stream: {e}"),
        )
    })?;

    stream.play().map_err(|e| {
        CaptureError::new(
            CaptureErrorKind::PlayStream,
            format!("play input stream: {e}"),
        )
    })?;
    drop(tx);

    let started = Instant::now();
    let deadline = started + Duration::from_millis(timeout_ms as u64);
    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut out = Vec::new();
    let mut last_emit = Instant::now() - Duration::from_millis(LEVEL_EMIT_MIN_MS);
    let mut smooth_rms = 0.0f32;
    let mut peak = 0.0f32;
    let mut channel_closed = false;

    while Instant::now() < deadline {
        if err_flag.load(Ordering::Relaxed) {
            drop(stream);
            return Err(CaptureError::new(
                CaptureErrorKind::StreamRuntime,
                "microphone stream error",
            ));
        }
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok(chunk) => {
                let chunk_peak = chunk.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                peak = peak.max(chunk_peak);
                let chunk_rms = if chunk.is_empty() {
                    0.0
                } else {
                    let sum: f32 = chunk.iter().map(|s| s * s).sum();
                    (sum / chunk.len() as f32).sqrt()
                };
                smooth_rms = smooth_rms * 0.7 + chunk_rms * 0.3;
                out.extend(resampler.process_f32(&chunk));

                if last_emit.elapsed() >= Duration::from_millis(LEVEL_EMIT_MIN_MS) {
                    last_emit = Instant::now();
                    if let Some(cb) = on_level.as_mut() {
                        let elapsed_ms = started.elapsed().as_millis() as u32;
                        let speech_ms = approx_speech_ms(&out);
                        let level = (smooth_rms * 8.0).clamp(0.0, 1.0);
                        cb(CaptureLevelTick {
                            level,
                            rms: smooth_rms,
                            peak,
                            elapsed_ms,
                            speech_ms,
                        });
                    }
                }

                if out.len() >= TARGET_SAMPLE_RATE as usize / 4
                    && utterance_capture_complete(&out, TARGET_SAMPLE_RATE)
                {
                    drop(stream);
                    return Ok(out);
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                if last_emit.elapsed() >= Duration::from_millis(LEVEL_EMIT_MIN_MS) {
                    last_emit = Instant::now();
                    if let Some(cb) = on_level.as_mut() {
                        let elapsed_ms = started.elapsed().as_millis() as u32;
                        let speech_ms = approx_speech_ms(&out);
                        let level = (smooth_rms * 8.0).clamp(0.0, 1.0);
                        cb(CaptureLevelTick {
                            level,
                            rms: smooth_rms,
                            peak,
                            elapsed_ms,
                            speech_ms,
                        });
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                channel_closed = true;
                break;
            }
        }
    }

    drop(stream);

    if channel_closed && out.is_empty() {
        return Err(CaptureError::new(
            CaptureErrorKind::ChannelClosed,
            "capture channel closed",
        ));
    }
    if out.is_empty() {
        return Err(CaptureError::new(
            CaptureErrorKind::NoAudioCaptured,
            "no audio captured",
        ));
    }
    if out.len() < TOO_LITTLE_AUDIO_SAMPLES {
        return Err(CaptureError::new(
            CaptureErrorKind::TooLittleAudio,
            format!("too little audio: {} samples", out.len()),
        ));
    }
    // Deadline hit with usable PCM — let process_pcm_buffer classify speech quality.
    Ok(out)
}

fn approx_speech_ms(pcm: &[f32]) -> u32 {
    if pcm.is_empty() {
        return 0;
    }
    let frame = (TARGET_SAMPLE_RATE as usize * 10) / 1000;
    let mut speech_frames = 0u32;
    for chunk in pcm.chunks(frame.max(1)) {
        let sum: f32 = chunk.iter().map(|s| s * s).sum();
        let rms = (sum / chunk.len() as f32).sqrt();
        if rms >= 0.006 {
            speech_frames += 1;
        }
    }
    speech_frames * 10
}

fn pick_input_config(
    device: &cpal::Device,
) -> Result<(StreamConfig, SampleFormat, u32), CaptureError> {
    let mut preferred: Option<SupportedStreamConfigRange> = None;
    let mut fallback: Option<SupportedStreamConfigRange> = None;

    let configs = device.supported_input_configs().map_err(|e| {
        CaptureError::new(
            CaptureErrorKind::BuildStream,
            format!("supported_input_configs: {e}"),
        )
    })?;

    for cfg in configs {
        if cfg.sample_format() != SampleFormat::F32
            && cfg.sample_format() != SampleFormat::I16
            && cfg.sample_format() != SampleFormat::U16
        {
            continue;
        }
        fallback.get_or_insert(cfg.clone());
        if (cfg.min_sample_rate().0..=cfg.max_sample_rate().0).contains(&TARGET_SAMPLE_RATE) {
            preferred = Some(cfg);
            break;
        }
    }

    let chosen = preferred.or(fallback).ok_or_else(|| {
        CaptureError::new(
            CaptureErrorKind::UnsupportedFormat,
            "no supported input config (F32/I16/U16)",
        )
    })?;

    let sample_format = chosen.sample_format();
    let sample_rate = if (chosen.min_sample_rate().0..=chosen.max_sample_rate().0)
        .contains(&TARGET_SAMPLE_RATE)
    {
        TARGET_SAMPLE_RATE
    } else {
        chosen.min_sample_rate().0
    };

    let config = chosen
        .with_sample_rate(cpal::SampleRate(sample_rate))
        .into();
    Ok((config, sample_format, sample_rate))
}

struct ResamplerState {
    src_rate: f64,
    dst_rate: f64,
    src_pos: f64,
    last_sample: f32,
}

impl ResamplerState {
    fn new(src_rate: u32, dst_rate: u32) -> Self {
        Self {
            src_rate: src_rate as f64,
            dst_rate: dst_rate as f64,
            src_pos: 0.0,
            last_sample: 0.0,
        }
    }

    fn process_f32(&mut self, input: &[f32]) -> Vec<f32> {
        if input.is_empty() {
            return Vec::new();
        }
        if (self.src_rate - self.dst_rate).abs() < 1.0 {
            return input.to_vec();
        }
        let ratio = self.src_rate / self.dst_rate;
        let mut out = Vec::new();
        let mut pos = self.src_pos;
        while pos + 1.0 < input.len() as f64 {
            let idx = pos.floor() as usize;
            let frac = pos - idx as f64;
            let s0 = if idx == 0 {
                self.last_sample
            } else {
                input[idx - 1]
            };
            let s1 = input[idx];
            let sample = s0 + (s1 - s0) * frac as f32;
            out.push(sample);
            pos += ratio;
        }
        self.src_pos = pos - input.len() as f64;
        self.last_sample = *input.last().unwrap_or(&self.last_sample);
        out
    }
}

fn push_mono_f32(data: &[f32], channels: usize, tx: &crossbeam_channel::Sender<Vec<f32>>) {
    let mono = to_mono_f32(data, channels);
    if !mono.is_empty() {
        let _ = tx.try_send(mono);
    }
}

fn push_mono_i16(data: &[i16], channels: usize, tx: &crossbeam_channel::Sender<Vec<f32>>) {
    let step = channels.max(1);
    let frames = data.len() / step;
    let mut mono = Vec::with_capacity(frames);
    for i in 0..frames {
        let mut sum = 0.0f32;
        for c in 0..step {
            sum += f32::from(data[i * step + c]) / i16::MAX as f32;
        }
        mono.push(sum / step as f32);
    }
    if !mono.is_empty() {
        let _ = tx.try_send(mono);
    }
}

fn push_mono_u16(data: &[u16], channels: usize, tx: &crossbeam_channel::Sender<Vec<f32>>) {
    let step = channels.max(1);
    let frames = data.len() / step;
    let mut mono = Vec::with_capacity(frames);
    for i in 0..frames {
        let mut sum = 0.0f32;
        for c in 0..step {
            let v = (f32::from(data[i * step + c]) - 32768.0) / 32768.0;
            sum += v;
        }
        mono.push(sum / step as f32);
    }
    if !mono.is_empty() {
        let _ = tx.try_send(mono);
    }
}

fn to_mono_f32(data: &[f32], channels: usize) -> Vec<f32> {
    let step = channels.max(1);
    let frames = data.len() / step;
    let mut mono = Vec::with_capacity(frames);
    for i in 0..frames {
        let mut sum = 0.0f32;
        for c in 0..step {
            sum += data[i * step + c];
        }
        mono.push(sum / step as f32);
    }
    mono
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_identity_at_16k() {
        let mut r = ResamplerState::new(16000, 16000);
        let input = vec![0.1f32; 160];
        let out = r.process_f32(&input);
        assert_eq!(out.len(), 160);
    }

    #[test]
    fn capture_error_keys() {
        assert_eq!(
            CaptureError::new(CaptureErrorKind::NoDefaultInput, "").message_key(),
            "habitAcousticCmdNoMic"
        );
        assert_eq!(
            CaptureError::new(CaptureErrorKind::BuildStream, "").message_key(),
            "habitAcousticCmdStreamFailed"
        );
        assert_eq!(
            CaptureError::new(CaptureErrorKind::NoAudioCaptured, "").message_key(),
            "habitAcousticCmdNoAudio"
        );
        assert_eq!(
            CaptureError::new(CaptureErrorKind::TooLittleAudio, "").message_key(),
            "habitAcousticCmdTooShort"
        );
        assert_eq!(
            CaptureError::new(CaptureErrorKind::Timeout, "").message_key(),
            "habitAcousticCmdTimeout"
        );
    }
}
