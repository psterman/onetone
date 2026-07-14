//! Acoustic voice command: MFCC-v1 extraction, DTW matching, calibration scoring.
//! Pure logic — no mic I/O in this module (see IPC layer for record_once).

use crate::config::{
    normalize_acoustic_voice_command_sample, AcousticVoiceCommand,
    AcousticVoiceCommandQualitySignals, AcousticVoiceCommandSample, ACOUSTIC_FEATURE_DIMS,
    ACOUSTIC_MAX_FEATURE_FRAMES,
};

use rustfft::{Fft, FftPlanner};
use std::f64::consts::PI;
use std::sync::Arc;

// --- Threshold constants (single source of truth; JS must not duplicate) ---

pub const AGREE_GOOD: f64 = 0.85;
pub const AGREE_OK: f64 = 0.68;
pub const DEFAULT_THRESHOLD: f64 = 0.78;
pub const DEFAULT_MARGIN: f64 = 0.08;
pub const THRESHOLD_OK: f64 = 0.86;
pub const MARGIN_OK: f64 = 0.10;
/// Reject clips shorter than this (absolute floor).
pub const MIN_SPEECH_MS: u32 = 450;
/// Prefer not to end capture until speech reaches this length.
pub const PREFER_SPEECH_MS: u32 = 700;
pub const MAX_SPEECH_MS: u32 = 2000;
pub const RECORD_TIMEOUT_MS: u32 = 8000;
pub const RUNTIME_COOLDOWN_MS: u64 = 1500;

const SAMPLE_RATE: u32 = 16000;
const FRAME_LENGTH: usize = 400; // 25ms @ 16kHz
const FRAME_HOP: usize = 160; // 10ms @ 16kHz
const FFT_SIZE: usize = 512;
const NUM_MEL_BINS: usize = 40;
const NUM_MFCC: usize = 13;
const PREEMPHASIS: f32 = 0.97;
const ENERGY_GATE_RMS: f32 = 0.006;
const ENERGY_GATE_MIN_RMS: f32 = 0.0025;
const TRAILING_SILENCE_MS: u32 = 700;
const FRAME_VAD_MS: u32 = 10;
const DTW_SAKOE_BAND_RATIO: f64 = 0.20;

/// Pluggable speech segmenter; MVP uses energy gate.
pub trait SpeechSegmenter {
    fn segment(&self, pcm: &[f32], sample_rate: u32) -> SpeechSegment;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpeechSegment {
    pub start_sample: usize,
    pub end_sample: usize,
    pub duration_ms: u32,
}

impl SpeechSegment {
    pub fn slice<'a>(&self, pcm: &'a [f32]) -> &'a [f32] {
        let end = self.end_sample.min(pcm.len());
        &pcm[self.start_sample.min(end)..end]
    }
}

#[derive(Debug, Clone)]
pub struct EnergyGateSegmenter {
    pub rms_threshold: f32,
}

impl Default for EnergyGateSegmenter {
    fn default() -> Self {
        Self {
            rms_threshold: ENERGY_GATE_RMS,
        }
    }
}

fn estimate_noise_floor_rms(pcm: &[f32], frame_len: usize) -> f32 {
    let mut energies: Vec<f32> = pcm.chunks(frame_len).map(frame_rms).collect();
    if energies.is_empty() {
        return ENERGY_GATE_RMS;
    }
    energies.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (energies.len() / 5).min(energies.len() - 1);
    energies[idx]
}

fn adaptive_rms_threshold(base: f32, pcm: &[f32], frame_len: usize) -> f32 {
    let noise = estimate_noise_floor_rms(pcm, frame_len);
    let adaptive = (noise * 2.8).max(ENERGY_GATE_MIN_RMS);
    // Prefer quieter of fixed baseline vs adaptive for USB/headset mics.
    adaptive.min(base).max(ENERGY_GATE_MIN_RMS)
}

impl SpeechSegmenter for EnergyGateSegmenter {
    fn segment(&self, pcm: &[f32], sample_rate: u32) -> SpeechSegment {
        if pcm.is_empty() || sample_rate == 0 {
            return SpeechSegment {
                start_sample: 0,
                end_sample: 0,
                duration_ms: 0,
            };
        }
        let frame_len = ((sample_rate as usize * FRAME_VAD_MS as usize) / 1000).max(1);
        let hangover_frames =
            ((sample_rate as u64 * TRAILING_SILENCE_MS as u64) / 1000 / frame_len as u64)
                .max(1) as usize;
        let threshold = adaptive_rms_threshold(self.rms_threshold, pcm, frame_len);

        let mut best = (0usize, 0usize, 0usize);

        let mut cur_start: Option<usize> = None;
        let mut cur_end = 0usize;
        let mut silence_run = 0usize;

        let flush = |start: usize, end: usize, best: &mut (usize, usize, usize)| {
            let len = end.saturating_sub(start);
            if len > best.2 {
                *best = (start, end, len);
            }
        };

        for (fi, chunk) in pcm.chunks(frame_len).enumerate() {
            let rms = frame_rms(chunk);
            if rms >= threshold {
                silence_run = 0;
                if cur_start.is_none() {
                    cur_start = Some(fi * frame_len);
                }
                cur_end = ((fi + 1) * frame_len).min(pcm.len());
            } else if let Some(start) = cur_start {
                silence_run += 1;
                if silence_run >= hangover_frames {
                    flush(start, cur_end, &mut best);
                    cur_start = None;
                    silence_run = 0;
                }
            }
        }

        if let Some(start) = cur_start {
            flush(start, cur_end, &mut best);
        }

        let (best_start, best_end, best_len) = best;
        if best_len == 0 {
            return SpeechSegment {
                start_sample: 0,
                end_sample: 0,
                duration_ms: 0,
            };
        }

        let duration_ms = ((best_len as u64) * 1000 / sample_rate as u64) as u32;
        SpeechSegment {
            start_sample: best_start,
            end_sample: best_end,
            duration_ms,
        }
    }
}

fn frame_rms(frame: &[f32]) -> f32 {
    if frame.is_empty() {
        return 0.0;
    }
    let sum: f32 = frame.iter().map(|s| s * s).sum();
    (sum / frame.len() as f32).sqrt()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordReason {
    NoSpeech,
    TooShort,
    TooLong,
    Timeout,
    Internal,
}

impl RecordReason {
    pub fn message_key(self) -> &'static str {
        match self {
            RecordReason::NoSpeech => "habitAcousticCmdTimeout",
            RecordReason::TooShort => "habitAcousticCmdTooShort",
            RecordReason::TooLong => "habitAcousticCmdTooLong",
            RecordReason::Timeout => "habitAcousticCmdTimeout",
            RecordReason::Internal => "habitAcousticCmdUnavailable",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RecordDebugSummary {
    pub duration_ms: u32,
    pub speech_ms: u32,
    pub rms: f32,
    pub feature_frames: u32,
}

#[derive(Debug, Clone)]
pub struct BuildFromSamplesResult {
    pub ok: bool,
    pub command: Option<AcousticVoiceCommand>,
    pub quality: Option<String>,
    pub reason: Option<String>,
    pub message_key: Option<String>,
    pub warnings: Vec<String>,
    pub agreement: f64,
}

#[derive(Debug, Clone)]
pub struct MatchCandidate {
    pub command_id: String,
    pub scenario_id: String,
    pub score: f64,
}

/// Extract MFCC-v1 features from mono PCM (i16).
pub fn extract_mfcc_from_pcm(pcm_i16: &[i16], sample_rate: u32) -> Option<AcousticVoiceCommandSample> {
    if sample_rate != SAMPLE_RATE || pcm_i16.is_empty() {
        return None;
    }
    let pcm: Vec<f32> = pcm_i16
        .iter()
        .map(|&s| f32::from(s) / i16::MAX as f32)
        .collect();
    extract_mfcc_from_pcm_f32(&pcm, sample_rate)
}

pub fn extract_mfcc_from_pcm_f32(pcm: &[f32], sample_rate: u32) -> Option<AcousticVoiceCommandSample> {
    let segmenter = EnergyGateSegmenter::default();
    let mut seg = segmenter.segment(pcm, sample_rate);
    if seg.duration_ms < MIN_SPEECH_MS {
        return None;
    }
    if seg.duration_ms > MAX_SPEECH_MS {
        let max_samples = (MAX_SPEECH_MS as u64 * sample_rate as u64 / 1000) as usize;
        seg.end_sample = (seg.start_sample + max_samples).min(seg.end_sample).min(pcm.len());
        seg.duration_ms = ((seg.end_sample.saturating_sub(seg.start_sample)) as u64 * 1000
            / sample_rate as u64) as u32;
    }
    let speech = seg.slice(pcm);
    let frames = compute_mfcc_frames(speech);
    if frames.is_empty() {
        return None;
    }
    let feature_frames = frames.len() as u32;
    if feature_frames > ACOUSTIC_MAX_FEATURE_FRAMES {
        return None;
    }
    let mut feature: Vec<f32> = Vec::with_capacity(frames.len() * NUM_MFCC);
    for frame in &frames {
        feature.extend_from_slice(frame);
    }
    if feature.iter().any(|v| !v.is_finite()) {
        return None;
    }
    Some(AcousticVoiceCommandSample {
        id: crate::config::new_acoustic_voice_sample_id(),
        duration_ms: seg.duration_ms,
        feature,
        feature_kind: "mfcc-v1".into(),
        feature_frames,
        feature_dims: ACOUSTIC_FEATURE_DIMS,
        sample_rate: SAMPLE_RATE,
        quality_signals: Some(AcousticVoiceCommandQualitySignals {
            has_speech: true,
            too_short: false,
            too_long: false,
            sample_agreement: 1.0,
        }),
        created_at: now_ms(),
    })
}

/// Record pipeline helper: segment + validate duration + extract features.
pub fn extract_sample_from_pcm_with_segmenter(
    pcm: &[f32],
    sample_rate: u32,
    segmenter: &dyn SpeechSegmenter,
) -> Result<(AcousticVoiceCommandSample, RecordDebugSummary), RecordReason> {
    if pcm.is_empty() {
        return Err(RecordReason::NoSpeech);
    }
    let duration_ms = ((pcm.len() as u64) * 1000 / sample_rate.max(1) as u64) as u32;
    let mut seg = segmenter.segment(pcm, sample_rate);
    if seg.end_sample <= seg.start_sample {
        return Err(RecordReason::NoSpeech);
    }
    if seg.duration_ms > MAX_SPEECH_MS {
        let max_samples = (MAX_SPEECH_MS as u64 * sample_rate as u64 / 1000) as usize;
        seg.end_sample = (seg.start_sample + max_samples).min(seg.end_sample).min(pcm.len());
        seg.duration_ms = ((seg.end_sample.saturating_sub(seg.start_sample)) as u64 * 1000
            / sample_rate as u64) as u32;
    }
    if seg.duration_ms < MIN_SPEECH_MS {
        return Err(RecordReason::TooShort);
    }
    let speech = seg.slice(pcm);
    let frames = compute_mfcc_frames(speech);
    if frames.is_empty() {
        return Err(RecordReason::NoSpeech);
    }
    let feature_frames = frames.len() as u32;
    if feature_frames > ACOUSTIC_MAX_FEATURE_FRAMES {
        return Err(RecordReason::TooLong);
    }
    let mut feature: Vec<f32> = Vec::with_capacity(frames.len() * NUM_MFCC);
    for frame in &frames {
        feature.extend_from_slice(frame);
    }
    if feature.iter().any(|v| !v.is_finite()) {
        return Err(RecordReason::Internal);
    }
    let rms = frame_rms(speech);
    let sample = AcousticVoiceCommandSample {
        id: crate::config::new_acoustic_voice_sample_id(),
        duration_ms: seg.duration_ms,
        feature,
        feature_kind: "mfcc-v1".into(),
        feature_frames,
        feature_dims: ACOUSTIC_FEATURE_DIMS,
        sample_rate: SAMPLE_RATE,
        quality_signals: Some(AcousticVoiceCommandQualitySignals {
            has_speech: true,
            too_short: false,
            too_long: false,
            sample_agreement: 1.0,
        }),
        created_at: now_ms(),
    };
    let debug = RecordDebugSummary {
        duration_ms,
        speech_ms: seg.duration_ms,
        rms,
        feature_frames,
    };
    Ok((sample, debug))
}

/// Whether captured PCM contains a complete utterance (speech + trailing silence).
pub fn utterance_capture_complete(pcm: &[f32], sample_rate: u32) -> bool {
    if pcm.is_empty() || sample_rate == 0 {
        return false;
    }
    let segmenter = EnergyGateSegmenter::default();
    let seg = segmenter.segment(pcm, sample_rate);
    // Do not early-stop on barely-minimum clips — those cut mid-phrase and fail matching.
    if seg.duration_ms < PREFER_SPEECH_MS {
        return false;
    }
    let frame_len = ((sample_rate as usize * FRAME_VAD_MS as usize) / 1000).max(1);
    let hangover_samples =
        (sample_rate as usize * TRAILING_SILENCE_MS as usize) / 1000;
    let threshold = adaptive_rms_threshold(segmenter.rms_threshold, pcm, frame_len);
    let tail_start = pcm.len().saturating_sub(hangover_samples);
    if tail_start <= seg.end_sample {
        return false;
    }
    pcm[tail_start..]
        .chunks(frame_len)
        .all(|chunk| frame_rms(chunk) < threshold)
}

fn compute_mfcc_frames(pcm: &[f32]) -> Vec<[f32; NUM_MFCC]> {
    let emphasized = preemphasis(pcm);
    let mel_filters = mel_filterbank();
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let mut out = Vec::new();
    let mut pos = 0usize;
    while pos + FRAME_LENGTH <= emphasized.len() {
        let frame: Vec<f32> = emphasized[pos..pos + FRAME_LENGTH]
            .iter()
            .enumerate()
            .map(|(i, &s)| s * hamming(i, FRAME_LENGTH))
            .collect();
        let power = power_spectrum(&frame, &fft);
        let mel = apply_mel(&power, &mel_filters);
        let mfcc = mfcc_from_mel(&mel);
        out.push(mfcc);
        pos += FRAME_HOP;
        if out.len() as u32 >= ACOUSTIC_MAX_FEATURE_FRAMES {
            break;
        }
    }
    out
}

fn preemphasis(pcm: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(pcm.len());
    let mut prev = 0.0f32;
    for &s in pcm {
        let v = s - PREEMPHASIS * prev;
        out.push(v);
        prev = s;
    }
    out
}

fn hamming(i: usize, n: usize) -> f32 {
    (0.54 - 0.46 * (2.0 * PI * i as f64 / (n as f64 - 1.0)).cos()) as f32
}

fn power_spectrum(frame: &[f32], fft: &Arc<dyn Fft<f32>>) -> Vec<f32> {
    let mut buffer: Vec<rustfft::num_complex::Complex<f32>> = (0..FFT_SIZE)
        .map(|i| {
            if i < frame.len() {
                rustfft::num_complex::Complex::new(frame[i], 0.0)
            } else {
                rustfft::num_complex::Complex::new(0.0, 0.0)
            }
        })
        .collect();
    fft.process(&mut buffer);
    buffer
        .iter()
        .take(FFT_SIZE / 2 + 1)
        .map(|c| c.norm_sqr())
        .collect()
}

fn hz_to_mel(hz: f64) -> f64 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f64) -> f64 {
    700.0 * (10.0_f64.powf(mel / 2595.0) - 1.0)
}

fn mel_filterbank() -> Vec<Vec<f32>> {
    let low_mel = hz_to_mel(0.0);
    let high_mel = hz_to_mel(SAMPLE_RATE as f64 / 2.0);
    let mel_points: Vec<f64> = (0..=NUM_MEL_BINS + 1)
        .map(|i| low_mel + (high_mel - low_mel) * i as f64 / (NUM_MEL_BINS + 1) as f64)
        .collect();
    let bin: Vec<usize> = mel_points
        .iter()
        .map(|&m| {
            let hz = mel_to_hz(m);
            ((FFT_SIZE + 1) as f64 * hz / SAMPLE_RATE as f64).floor() as usize
        })
        .collect();
    let mut filters = vec![vec![0.0f32; FFT_SIZE / 2 + 1]; NUM_MEL_BINS];
    for m in 0..NUM_MEL_BINS {
        let left = bin[m];
        let center = bin[m + 1];
        let right = bin[m + 2];
        for k in left..center {
            if center > left {
                filters[m][k] = (k - left) as f32 / (center - left) as f32;
            }
        }
        for k in center..right {
            if right > center {
                filters[m][k] = (right - k) as f32 / (right - center) as f32;
            }
        }
    }
    filters
}

fn apply_mel(power: &[f32], filters: &[Vec<f32>]) -> Vec<f32> {
    filters
        .iter()
        .map(|f| {
            let e: f32 = f
                .iter()
                .zip(power.iter())
                .map(|(&w, &p)| w * p)
                .sum();
            (e.max(1e-10)).ln()
        })
        .collect()
}

fn mfcc_from_mel(mel: &[f32]) -> [f32; NUM_MFCC] {
    let mut out = [0.0f32; NUM_MFCC];
    for n in 0..NUM_MFCC {
        let mut sum = 0.0f32;
        for (k, &m) in mel.iter().enumerate() {
            sum += m
                * ((std::f32::consts::PI * n as f32 * (k as f32 + 0.5)) / NUM_MEL_BINS as f32)
                    .cos();
        }
        out[n] = sum;
    }
    out
}

pub fn cmvn_features(feature: &[f32], frames: u32, dims: u32) -> Vec<f32> {
    let frames = frames as usize;
    let dims = dims as usize;
    if frames == 0 || dims == 0 || feature.len() != frames * dims {
        return feature.to_vec();
    }
    let mut out = feature.to_vec();
    for d in 0..dims {
        let mut sum = 0.0f64;
        for f in 0..frames {
            sum += out[f * dims + d] as f64;
        }
        let mean = sum / frames as f64;
        let mut var = 0.0f64;
        for f in 0..frames {
            let v = out[f * dims + d] as f64 - mean;
            var += v * v;
        }
        let std = (var / frames as f64).sqrt().max(1e-5);
        for f in 0..frames {
            out[f * dims + d] = ((out[f * dims + d] as f64 - mean) / std) as f32;
        }
    }
    out
}

pub fn dtw_similarity(a: &[f32], a_frames: u32, b: &[f32], b_frames: u32, dims: u32) -> f64 {
    let dims_usize = dims as usize;
    let af = a_frames as usize;
    let bf = b_frames as usize;
    if dims == 0 || af == 0 || bf == 0 || a.len() != af * dims_usize || b.len() != bf * dims_usize {
        return 0.0;
    }
    let a_n = cmvn_features(a, a_frames, dims);
    let b_n = cmvn_features(b, b_frames, dims);
    let band = ((af.max(bf) as f64) * DTW_SAKOE_BAND_RATIO).ceil() as isize;
    let dist = dtw_distance(&a_n, af, &b_n, bf, dims_usize, band);
    1.0 / (1.0 + dist)
}

fn dtw_distance(a: &[f32], af: usize, b: &[f32], bf: usize, dims: usize, band: isize) -> f64 {
    let inf = f64::INFINITY;
    let mut prev = vec![inf; bf + 1];
    let mut cur = vec![inf; bf + 1];
    prev[0] = 0.0;
    for i in 1..=af {
        cur[0] = inf;
        let j_start = ((i as isize - band).max(1)) as usize;
        let j_end = ((i as isize + band).min(bf as isize)) as usize;
        for j in j_start..=j_end {
            let cost = frame_dist(a, i - 1, b, j - 1, dims);
            let best = prev[j].min(cur[j - 1]).min(prev[j - 1]) + cost;
            cur[j] = best;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[bf] / (af as f64 + bf as f64)
}

fn frame_dist(a: &[f32], ai: usize, b: &[f32], bi: usize, dims: usize) -> f64 {
    let mut sum = 0.0f64;
    for d in 0..dims {
        let diff = a[ai * dims + d] as f64 - b[bi * dims + d] as f64;
        sum += diff * diff;
    }
    (sum / dims as f64).sqrt()
}

pub fn sample_pairwise_agreement(samples: &[AcousticVoiceCommandSample]) -> f64 {
    if samples.len() < 2 {
        return 1.0;
    }
    let mut pairs = 0usize;
    let mut sum = 0.0f64;
    for i in 0..samples.len() {
        for j in (i + 1)..samples.len() {
            let si = &samples[i];
            let sj = &samples[j];
            sum += dtw_similarity(
                &si.feature,
                si.feature_frames,
                &sj.feature,
                sj.feature_frames,
                si.feature_dims,
            );
            pairs += 1;
        }
    }
    if pairs == 0 {
        1.0
    } else {
        sum / pairs as f64
    }
}

pub struct BuildFromSamplesOptions<'a> {
    pub scenario_id: &'a str,
    pub activation_scope: &'a str,
    pub app_boost: bool,
    pub display_text: &'a str,
    pub current_command_id: Option<&'a str>,
}

/// Unified calibration: quality / threshold / margin decided here only.
pub fn build_from_samples(
    samples: Vec<AcousticVoiceCommandSample>,
    opts: BuildFromSamplesOptions<'_>,
) -> BuildFromSamplesResult {
    let normalized: Vec<AcousticVoiceCommandSample> = samples
        .into_iter()
        .filter_map(normalize_acoustic_voice_command_sample)
        .collect();

    if normalized.len() < 2 {
        return BuildFromSamplesResult {
            ok: false,
            command: None,
            quality: None,
            reason: Some("needMore".into()),
            message_key: Some("habitAcousticCmdNeedMore".into()),
            warnings: vec![],
            agreement: 0.0,
        };
    }

    let agreement = sample_pairwise_agreement(&normalized);

    let (quality, threshold, margin, warnings) = if agreement >= AGREE_GOOD {
        (
            "good",
            DEFAULT_THRESHOLD,
            DEFAULT_MARGIN,
            Vec::<String>::new(),
        )
    } else if agreement >= AGREE_OK {
        (
            "ok",
            THRESHOLD_OK,
            MARGIN_OK,
            vec!["habitAcousticCmdSuggestMoreSpecific".into()],
        )
    } else if normalized.len() < 3 {
        return BuildFromSamplesResult {
            ok: false,
            command: None,
            quality: None,
            reason: Some("unstable".into()),
            message_key: Some("habitAcousticCmdUnstable".into()),
            warnings: vec![],
            agreement,
        };
    } else {
        return BuildFromSamplesResult {
            ok: false,
            command: None,
            quality: None,
            reason: Some("weak".into()),
            message_key: Some("habitAcousticCmdTryClearer".into()),
            warnings: vec![],
            agreement,
        };
    };

    let scope = if opts.activation_scope.trim() == "foreground-app" {
        "foreground-app"
    } else {
        "global"
    };
    let now = now_ms();
    let mut samples_out = normalized;
    for s in &mut samples_out {
        if let Some(qs) = s.quality_signals.as_mut() {
            qs.sample_agreement = agreement;
        }
    }

    let command = AcousticVoiceCommand {
        id: opts
            .current_command_id
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(crate::config::new_acoustic_voice_command_id),
        version: 1,
        kind: "scenario-acoustic-activate".into(),
        scenario_id: opts.scenario_id.trim().to_string(),
        label: "我的语音命令".into(),
        display_text: opts.display_text.trim().to_string(),
        samples: samples_out,
        threshold,
        margin,
        quality: quality.into(),
        activation_scope: scope.into(),
        app_boost: opts.app_boost,
        enabled: true,
        created_at: now,
        updated_at: now,
    };

    BuildFromSamplesResult {
        ok: true,
        command: Some(command),
        quality: Some(quality.into()),
        reason: None,
        message_key: None,
        warnings,
        agreement,
    }
}

/// Match live features against enabled commands; returns best if threshold+margin pass.
pub fn match_acoustic_commands(
    live: &[f32],
    live_frames: u32,
    commands: &[AcousticVoiceCommand],
) -> Option<MatchCandidate> {
    let dims = ACOUSTIC_FEATURE_DIMS;
    if live_frames == 0 || live.len() != live_frames as usize * dims as usize {
        return None;
    }
    let mut scored: Vec<MatchCandidate> = Vec::new();
    for cmd in commands {
        if !cmd.enabled {
            continue;
        }
        let mut best = 0.0f64;
        for sample in &cmd.samples {
            let sim = dtw_similarity(
                live,
                live_frames,
                &sample.feature,
                sample.feature_frames,
                sample.feature_dims,
            );
            if sim > best {
                best = sim;
            }
        }
        if best >= cmd.threshold {
            scored.push(MatchCandidate {
                command_id: cmd.id.clone(),
                scenario_id: cmd.scenario_id.clone(),
                score: best,
            });
        }
    }
    if scored.is_empty() {
        return None;
    }
    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let top = scored[0].clone();
    if scored.len() > 1 {
        let margin = commands
            .iter()
            .find(|c| c.id == top.command_id)
            .map(|c| c.margin)
            .unwrap_or(DEFAULT_MARGIN);
        if top.score - scored[1].score < margin {
            return None;
        }
    }
    Some(top)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine_pcm(freq_hz: f32, ms: u32) -> Vec<f32> {
        let n = (SAMPLE_RATE as u64 * ms as u64 / 1000) as usize;
        (0..n)
            .map(|i| {
                let t = i as f32 / SAMPLE_RATE as f32;
                (2.0 * PI as f32 * freq_hz * t).sin() * 0.35
            })
            .collect()
    }

    #[test]
    fn same_pcm_high_similarity() {
        let pcm = sine_pcm(440.0, 800);
        let a = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("a");
        let b = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("b");
        let sim = dtw_similarity(
            &a.feature,
            a.feature_frames,
            &b.feature,
            b.feature_frames,
            a.feature_dims,
        );
        assert!(sim > 0.85, "sim={sim}");
    }

    #[test]
    fn different_freq_lower_similarity() {
        let a = extract_mfcc_from_pcm_f32(&sine_pcm(440.0, 800), SAMPLE_RATE).expect("a");
        let b = extract_mfcc_from_pcm_f32(&sine_pcm(880.0, 800), SAMPLE_RATE).expect("b");
        let sim = dtw_similarity(
            &a.feature,
            a.feature_frames,
            &b.feature,
            b.feature_frames,
            a.feature_dims,
        );
        assert!(sim < 0.85, "sim={sim}");
    }

    #[test]
    fn build_from_samples_good_and_unstable() {
        let pcm = sine_pcm(520.0, 900);
        let s1 = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("s1");
        let s2 = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("s2");
        let good = build_from_samples(
            vec![s1.clone(), s2.clone()],
            BuildFromSamplesOptions {
                scenario_id: "sc1",
                activation_scope: "global",
                app_boost: true,
                display_text: "",
                current_command_id: None,
            },
        );
        assert!(good.ok);
        assert_eq!(good.quality.as_deref(), Some("good"));

        let s3 = extract_mfcc_from_pcm_f32(&sine_pcm(1200.0, 900), SAMPLE_RATE).expect("s3");
        let unstable = build_from_samples(
            vec![s1, s3],
            BuildFromSamplesOptions {
                scenario_id: "sc1",
                activation_scope: "global",
                app_boost: true,
                display_text: "",
                current_command_id: None,
            },
        );
        assert!(!unstable.ok);
        assert_eq!(unstable.reason.as_deref(), Some("unstable"));
    }

    #[test]
    fn segmenter_tolerates_brief_pause_in_phrase() {
        let mut pcm = sine_pcm(440.0, 500);
        let gap = (SAMPLE_RATE as usize * 60) / 1000;
        pcm.extend(vec![0.0; gap]);
        pcm.extend(sine_pcm(440.0, 500));
        let seg = EnergyGateSegmenter::default().segment(&pcm, SAMPLE_RATE);
        assert!(
            seg.duration_ms >= 900,
            "expected full phrase, got {}ms",
            seg.duration_ms
        );
    }

    #[test]
    fn segmenter_picks_longest_region_not_first_blip() {
        let mut pcm = vec![0.0; (SAMPLE_RATE as usize * 200) / 1000];
        pcm.extend(sine_pcm(440.0, 40));
        pcm.extend(vec![0.0; (SAMPLE_RATE as usize * 300) / 1000]);
        pcm.extend(sine_pcm(520.0, 800));
        let seg = EnergyGateSegmenter::default().segment(&pcm, SAMPLE_RATE);
        assert!(
            seg.duration_ms >= 700,
            "expected main phrase, got {}ms",
            seg.duration_ms
        );
    }

    #[test]
    fn match_respects_margin() {
        let pcm = sine_pcm(500.0, 800);
        let sample = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("sample");
        let cmd = AcousticVoiceCommand {
            id: "acmd_a".into(),
            version: 1,
            kind: "scenario-acoustic-activate".into(),
            scenario_id: "sc1".into(),
            label: "t".into(),
            display_text: String::new(),
            samples: vec![sample.clone()],
            threshold: 0.5,
            margin: 0.5,
            quality: "good".into(),
            activation_scope: "global".into(),
            app_boost: true,
            enabled: true,
            created_at: 1,
            updated_at: 1,
        };
        let cmd2 = AcousticVoiceCommand {
            id: "acmd_b".into(),
            scenario_id: "sc2".into(),
            ..cmd.clone()
        };
        let live_frames = sample.feature_frames;
        let hit = match_acoustic_commands(&sample.feature, live_frames, &[cmd, cmd2]);
        assert!(hit.is_none(), "margin should block ambiguous top-two");
    }
}
