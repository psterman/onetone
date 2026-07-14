//! Short independent cpal capture for acoustic command calibration (M3).
//! Does not depend on Vosk/KWS runtime.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig, SupportedStreamConfigRange};
use crossbeam_channel::bounded;

use crate::voice_acoustic_command::{utterance_capture_complete, RECORD_TIMEOUT_MS};

pub const TARGET_SAMPLE_RATE: u32 = 16_000;

pub fn capture_pcm_mono_16k(timeout_ms: u32) -> Result<Vec<f32>, String> {
    let timeout_ms = timeout_ms.min(RECORD_TIMEOUT_MS).max(500);
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "no default input device".to_string())?;
    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;
    let (tx, rx) = bounded::<Vec<f32>>(256);
    let err_flag = Arc::new(AtomicBool::new(false));
    let err_flag_cb = err_flag.clone();
    let err_fn = move |err| {
        eprintln!("acoustic cpal stream error: {err}");
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
        other => return Err(format!("unsupported sample format: {other:?}")),
    }
    .map_err(|e| format!("build input stream: {e}"))?;

    stream.play().map_err(|e| format!("play input stream: {e}"))?;
    drop(tx);

    let deadline = Instant::now() + Duration::from_millis(timeout_ms as u64);
    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut out = Vec::new();

    while Instant::now() < deadline {
        if err_flag.load(Ordering::Relaxed) {
            drop(stream);
            return Err("microphone stream error".into());
        }
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(chunk) => {
                out.extend(resampler.process_f32(&chunk));
                if out.len() >= TARGET_SAMPLE_RATE as usize / 4
                    && utterance_capture_complete(&out, TARGET_SAMPLE_RATE)
                {
                    break;
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => continue,
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }

    drop(stream);
    if out.is_empty() {
        return Err("no audio captured".into());
    }
    Ok(out)
}

fn pick_input_config(
    device: &cpal::Device,
) -> Result<(StreamConfig, SampleFormat, u32), String> {
    let mut preferred: Option<SupportedStreamConfigRange> = None;
    let mut fallback: Option<SupportedStreamConfigRange> = None;

    let configs = device
        .supported_input_configs()
        .map_err(|e| format!("supported_input_configs: {e}"))?;

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

    let chosen = preferred
        .or(fallback)
        .ok_or_else(|| "no supported input config (F32/I16/U16)".to_string())?;

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
}
