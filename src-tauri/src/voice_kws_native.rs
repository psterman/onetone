//! sherpa-onnx KeywordSpotter worker (cpal mic → streaming KWS).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Sender, TryRecvError};
use sherpa_onnx::{KeywordSpotter, KeywordSpotterConfig};

use crate::config::VoiceKwsConfig;
use crate::voice_keyword_dispatch::VoiceKeywordKind;
use crate::voice_kws::{
    discover_kws_assets, resolve_kws_model_dir, VoiceKwsEvent, VoiceKwsHandle, EVENT_CHANNEL_CAP,
};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const AUDIO_CHANNEL_CAP: usize = 64;

pub fn start_voice_kws_native(
    cfg: &VoiceKwsConfig,
    resource_dir: Option<&std::path::Path>,
) -> Result<VoiceKwsHandle, String> {
    let model_dir = resolve_kws_model_dir(cfg, resource_dir);
    let assets = discover_kws_assets(&model_dir)?;

    let (event_tx, event_rx) = crossbeam_channel::bounded(EVENT_CHANNEL_CAP);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let event_tx_worker = event_tx.clone();
    let event_tx_err = event_tx.clone();

    let thread = thread::Builder::new()
        .name("voice-kws".into())
        .spawn(move || {
            if let Err(e) = run_worker(assets, stop_thread, event_tx_worker) {
                send_event_blocking(&event_tx_err, VoiceKwsEvent::Error(e));
                let _ = event_tx_err.send(VoiceKwsEvent::StateChanged("error".into()));
            }
        })
        .map_err(|e| format!("spawn kws worker failed: {e}"))?;

    let handle = VoiceKwsHandle::new(
        stop,
        event_rx,
        event_tx,
        Some(thread),
    );
    Ok(handle)
}

fn run_worker(
    assets: crate::voice_kws::KwsModelAssets,
    stop: Arc<AtomicBool>,
    event_tx: Sender<VoiceKwsEvent>,
) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::SampleFormat;

    let _ = send_event_blocking(&event_tx, VoiceKwsEvent::StateChanged("starting".into()));

    let mut config = KeywordSpotterConfig::default();
    config.model_config.transducer.encoder = Some(path_str(&assets.encoder));
    config.model_config.transducer.decoder = Some(path_str(&assets.decoder));
    config.model_config.transducer.joiner = Some(path_str(&assets.joiner));
    config.model_config.tokens = Some(path_str(&assets.tokens));
    config.model_config.provider = Some("cpu".into());
    config.model_config.num_threads = 2;
    config.keywords_file = Some(path_str(&assets.keywords));
    // Slightly lower threshold improves wake hit rate on typical USB mics.
    config.keywords_threshold = 0.12;
    config.keywords_score = 1.5;

    let kws = KeywordSpotter::create(&config)
        .ok_or_else(|| "create KeywordSpotter failed".to_string())?;
    let stream = kws.create_stream();

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| String::from("no default input device"))?;

    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;

    let (audio_tx, audio_rx) = bounded(AUDIO_CHANNEL_CAP);
    let err_fn = |err| eprintln!("kws cpal stream error: {err}");

    let input_stream = match sample_format {
        SampleFormat::F32 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| push_mono_f32(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::I16 => {
            let tx = audio_tx.clone();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| push_mono_i16(data, channels, &tx),
                err_fn,
                None,
            )
        }
        SampleFormat::U16 => {
            let tx = audio_tx.clone();
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

    input_stream
        .play()
        .map_err(|e| format!("play input stream: {e}"))?;
    drop(audio_tx);

    let _ = send_event_blocking(&event_tx, VoiceKwsEvent::StateChanged("listening".into()));

    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut level_tick = Instant::now();

    while !stop.load(Ordering::SeqCst) {
        match audio_rx.try_recv() {
            Ok(chunk) => {
                let pcm = resampler.process_f32(&chunk);
                if pcm.is_empty() {
                    continue;
                }
                stream.accept_waveform(TARGET_SAMPLE_RATE as i32, &pcm);
                decode_kws_stream(&kws, &stream, &event_tx);

                if level_tick.elapsed() >= Duration::from_millis(120) {
                    level_tick = Instant::now();
                    let level = rms_level(&pcm);
                    let _ = event_tx.try_send(VoiceKwsEvent::Level { level });
                }
            }
            Err(TryRecvError::Empty) => {
                thread::sleep(Duration::from_millis(5));
            }
            Err(TryRecvError::Disconnected) => break,
        }
    }

    drop(input_stream);
    Ok(())
}

fn decode_kws_stream(
    kws: &KeywordSpotter,
    stream: &sherpa_onnx::OnlineStream,
    event_tx: &Sender<VoiceKwsEvent>,
) {
    while kws.is_ready(stream) {
        kws.decode(stream);
        if let Some(result) = kws.get_result(stream) {
            if !result.keyword.is_empty() {
                let phrase = result.keyword.clone();
                let keyword = phrase.clone();
                let _ = send_event_blocking(
                    event_tx,
                    VoiceKwsEvent::Detected {
                        phrase,
                        keyword,
                        kind: VoiceKeywordKind::Custom,
                    },
                );
                kws.reset(stream);
            }
        }
    }
}

fn path_str(path: &std::path::Path) -> String {
    path.display().to_string()
}

fn send_event_blocking(tx: &Sender<VoiceKwsEvent>, ev: VoiceKwsEvent) {
    let _ = tx.send(ev);
}

fn rms_level(samples: &[f32]) -> u32 {
    if samples.is_empty() {
        return 0;
    }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    let rms = (sum / samples.len() as f32).sqrt();
    ((rms * 4096.0).min(4095.0)) as u32
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
            out.push(s0 + (s1 - s0) * frac as f32);
            pos += self.src_rate / self.dst_rate;
        }

        self.last_sample = *input.last().unwrap_or(&0.0);
        self.src_pos = pos - input.len() as f64;
        out
    }
}

fn pick_input_config(
    device: &cpal::Device,
) -> Result<(cpal::StreamConfig, cpal::SampleFormat, u32), String> {
    use cpal::traits::DeviceTrait;
    use cpal::{SampleFormat, SupportedStreamConfigRange};

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
        .ok_or_else(|| String::from("no supported input config (F32/I16/U16)"))?;

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

fn push_mono_f32(data: &[f32], channels: usize, tx: &Sender<Vec<f32>>) {
    let mono = to_mono_f32(data, channels);
    if !mono.is_empty() {
        try_push_audio(tx, mono);
    }
}

fn push_mono_i16(data: &[i16], channels: usize, tx: &Sender<Vec<f32>>) {
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
        try_push_audio(tx, mono);
    }
}

fn push_mono_u16(data: &[u16], channels: usize, tx: &Sender<Vec<f32>>) {
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
        try_push_audio(tx, mono);
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

fn try_push_audio(tx: &Sender<Vec<f32>>, chunk: Vec<f32>) {
    if tx.try_send(chunk).is_err() {
        // Drop when backlog is full — keep callback lightweight.
    }
}
