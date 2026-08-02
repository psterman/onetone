//! Vosk offline speech worker: cpal → audio channel → recognizer loop.
#![allow(dead_code, unused_imports)]

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};

use crate::config::{
    resolve_vosk_model_path, vosk_preset_is_dual, VoiceVoskConfig, VOSK_CN_LIGHT_REL,
    VOSK_EN_LIGHT_REL,
};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const AUDIO_CHANNEL_CAP: usize = 64;
const EVENT_CHANNEL_CAP: usize = 64;
const PARTIAL_MIN_INTERVAL: Duration = Duration::from_millis(200);
const LEVEL_MIN_INTERVAL: Duration = Duration::from_millis(120);
const EN_WAKE_BUFFER_TTL: Duration = Duration::from_millis(2800);
/// Suppress partial+final double-fire within one utterance, not across repeats.
const WAKE_PHRASE_DEDUP_MS: u64 = 1200;
/// VAD: only run ASR while speech is likely present (saves CPU when idle).
const VAD_SPEECH_LEVEL: u32 = 7;
const VAD_SPEECH_HOLD_MS: u64 = 100;
const VAD_SILENCE_HOLD_MS: u64 = 850;
const WAKE_FUZZY_MAX_EXTRA_CHARS: usize = 4;
const WAKE_EN_MAX_EXTRA_TOKENS: usize = 2;

#[derive(Debug, Clone)]
pub enum VoiceVoskEvent {
    StateChanged(String),
    Error(String),
    Level { level: u32 },
    Partial(String),
    Final(String),
    Detected { phrase: String, text: String },
    GrammarMode { grammar: bool, note: String },
    ModelLoaded { load_time_ms: u64 },
}

pub struct VoiceVoskHandle {
    stop: Arc<AtomicBool>,
    event_rx: Receiver<VoiceVoskEvent>,
    thread: Option<JoinHandle<()>>,
}

impl VoiceVoskHandle {
    pub fn try_recv(&self) -> Option<VoiceVoskEvent> {
        self.event_rx.try_recv().ok()
    }
}

impl Drop for VoiceVoskHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            std::thread::Builder::new()
                .name("voice-vosk-join".into())
                .spawn(move || {
                    let _ = handle.join();
                })
                .ok();
        }
    }
}

/// Block until the worker exits, with a hard timeout.
///
/// Native Vosk model load can ignore the stop flag for a long time; an unbounded
/// `join` on the config-watcher / supervisor path freezes IPC and makes the UI look hung.
/// After `JOIN_TIMEOUT` we detach the join onto a helper thread and return so life-cycle
/// can continue (epoch bump still prevents a stale handle from being reused).
pub fn shutdown_sync(mut handle: VoiceVoskHandle) {
    const JOIN_TIMEOUT: Duration = Duration::from_secs(3);
    handle.stop.store(true, Ordering::SeqCst);
    if let Some(thread) = handle.thread.take() {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::Builder::new()
            .name("voice-vosk-join".into())
            .spawn(move || {
                let _ = thread.join();
                let _ = tx.send(());
            })
            .ok();
        match rx.recv_timeout(JOIN_TIMEOUT) {
            Ok(()) => {}
            Err(_) => {
                // Detached join continues in the helper thread; do not block supervisor.
                crate::app_log::sync_emergency_line("rs", &format!(
                    "[voice] vosk shutdown_sync timed out after {}ms — detaching join",
                    JOIN_TIMEOUT.as_millis()
                ));
            }
        }
    }
    thread::sleep(Duration::from_millis(150));
}

pub fn stop_voice_vosk(mut handle: VoiceVoskHandle) {
    handle.stop.store(true, Ordering::SeqCst);
    if let Some(thread) = handle.thread.take() {
        std::thread::Builder::new()
            .name("voice-vosk-join".into())
            .spawn(move || {
                let _ = thread.join();
                thread::sleep(Duration::from_millis(150));
            })
            .ok();
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoskResourceProbe {
    pub model_exists: bool,
    pub dll_exists: bool,
    pub lib_exists: bool,
    pub model_path: String,
    pub model_preset: String,
    pub resolved_model_path: String,
    pub resolved_dll_path: String,
}

pub fn probe_vosk_resources(
    cfg: &VoiceVoskConfig,
    resource_dir: Option<&Path>,
) -> VoskResourceProbe {
    let resolved_dll = resolve_vosk_dll_dir(resource_dir).join("libvosk.dll");
    let lib_exists = manifest_vosk_dir().join("libvosk.lib").exists();

    if vosk_preset_is_dual(&cfg.model_preset) {
        let cn = resolve_path(VOSK_CN_LIGHT_REL, resource_dir);
        let en = resolve_path(VOSK_EN_LIGHT_REL, resource_dir);
        let cn_ok = model_dir_valid(&cn);
        let en_ok = model_dir_valid(&en);
        return VoskResourceProbe {
            model_exists: cn_ok && en_ok,
            dll_exists: resolved_dll.is_file(),
            lib_exists,
            model_path: cfg.model_path.clone(),
            model_preset: cfg.model_preset.clone(),
            resolved_model_path: format!("{} | {}", cn.display(), en.display()),
            resolved_dll_path: resolved_dll.display().to_string(),
        };
    }

    let model_rel = resolve_vosk_model_path(cfg);
    let resolved_model = resolve_path(&model_rel, resource_dir);
    VoskResourceProbe {
        model_exists: model_dir_valid(&resolved_model),
        dll_exists: resolved_dll.is_file(),
        lib_exists,
        model_path: cfg.model_path.clone(),
        model_preset: cfg.model_preset.clone(),
        resolved_model_path: resolved_model.display().to_string(),
        resolved_dll_path: resolved_dll.display().to_string(),
    }
}

/// Parent directory where packaged / user Vosk assets live (`libvosk.dll`, models, …).
pub fn vosk_resources_dir(resource_dir: Option<&Path>) -> PathBuf {
    resolve_vosk_dll_dir(resource_dir)
}

pub fn vosk_model_download_url(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some("https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"),
        "en-light" => Some("https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"),
        _ => Some("https://alphacephei.com/vosk/models"),
    }
}

pub fn vosk_resource_issue(probe: &VoskResourceProbe) -> Option<&'static str> {
    if !probe.dll_exists {
        return Some("dll_missing");
    }
    if !probe.model_exists {
        return Some("model_missing");
    }
    None
}

pub fn open_path_in_explorer(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        if path.is_file() {
            if let Some(parent) = path.parent() {
                return open_path_in_explorer(parent);
            }
        }
        if !path.exists() {
            std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
        }
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("open folder is only supported on Windows".into())
    }
}

fn manifest_vosk_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/vosk")
}

fn normalize_extended_path(path: &Path) -> PathBuf {
    let raw = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(stripped) = raw.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
    }
    PathBuf::from(raw.as_ref())
}

fn push_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    let normalized = normalize_extended_path(&path);
    if normalized != path && !candidates.iter().any(|p| p == &normalized) {
        candidates.push(normalized);
    }
    if !candidates.iter().any(|p| p == &path) {
        candidates.push(path);
    }
}

fn resolve_vosk_dll_dir(resource_dir: Option<&Path>) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(rd) = resource_dir {
        push_candidate(&mut candidates, rd.join("resources/vosk"));
        push_candidate(&mut candidates, rd.join("vosk"));
        push_candidate(&mut candidates, rd.to_path_buf());
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push_candidate(&mut candidates, dir.join("resources/vosk"));
            push_candidate(&mut candidates, dir.join("vosk"));
            push_candidate(&mut candidates, dir.to_path_buf());
        }
    }
    for candidate in candidates {
        if candidate.join("libvosk.dll").is_file() {
            return candidate;
        }
    }
    manifest_vosk_dir()
}

pub fn resolve_path(rel: &str, resource_dir: Option<&Path>) -> PathBuf {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return rel_path.to_path_buf();
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(rd) = resource_dir {
        push_candidate(&mut candidates, rd.join(rel));
        let stripped = rel.strip_prefix("resources/").unwrap_or(rel);
        push_candidate(&mut candidates, rd.join(stripped));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push_candidate(&mut candidates, dir.join(rel));
            let stripped = rel.strip_prefix("resources/").unwrap_or(rel);
            push_candidate(&mut candidates, dir.join(stripped));
        }
    }
    push_candidate(
        &mut candidates,
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel),
    );

    for candidate in &candidates {
        if model_dir_valid(candidate) {
            return candidate.clone();
        }
    }
    for candidate in candidates {
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

pub fn model_dir_valid(path: &Path) -> bool {
    path.join("conf/model.conf").is_file() || path.join("am/final.mdl").is_file()
}

pub fn start_voice_vosk(
    cfg: VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
    grammar_phrases: Vec<String>,
    frame_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
) -> Result<VoiceVoskHandle, String> {
    #[cfg(not(windows))]
    {
        let _ = (cfg, resource_dir, grammar_phrases, frame_tx);
        return Err("Vosk is Windows-only".into());
    }

    #[cfg(all(windows, vosk_disabled))]
    {
        let _ = (cfg, resource_dir, grammar_phrases, frame_tx);
        return Err(
            "Vosk native library not linked: place libvosk.lib and libvosk.dll in src-tauri/resources/vosk/ and rebuild"
                .into(),
        );
    }

    #[cfg(all(windows, not(vosk_disabled)))]
    {
        start_voice_vosk_impl(cfg, resource_dir, grammar_phrases, frame_tx)
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn start_voice_vosk_impl(
    cfg: VoiceVoskConfig,
    resource_dir: Option<PathBuf>,
    grammar_phrases: Vec<String>,
    frame_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
) -> Result<VoiceVoskHandle, String> {
    let probe = probe_vosk_resources(&cfg, resource_dir.as_deref());
    if !probe.dll_exists {
        return Err(format!(
            "libvosk.dll not found: {}",
            probe.resolved_dll_path
        ));
    }
    if !probe.model_exists {
        return Err(format!(
            "Vosk model not found: {}",
            probe.resolved_model_path
        ));
    }

    let (event_tx, event_rx) = bounded(EVENT_CHANNEL_CAP);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let dll_dir = resolve_vosk_dll_dir(resource_dir.as_deref());
    let phrases = if grammar_phrases.is_empty() {
        cfg.phrases.clone()
    } else {
        grammar_phrases
    };
    let model_preset = cfg.model_preset.clone();
    let event_tx_err = event_tx.clone();
    let resource_dir = resource_dir;
    let frame_tx_dual = frame_tx.clone();

    let thread = if vosk_preset_is_dual(&model_preset) {
        let cn_path = resolve_path(VOSK_CN_LIGHT_REL, resource_dir.as_deref());
        let en_path = resolve_path(VOSK_EN_LIGHT_REL, resource_dir.as_deref());
        thread::Builder::new()
            .name("voice-vosk".into())
            .spawn(move || {
                if let Err(e) = run_dual_worker(
                    cn_path,
                    en_path,
                    dll_dir,
                    phrases,
                    stop_thread,
                    event_tx,
                    frame_tx_dual,
                ) {
                    send_event_blocking(&event_tx_err, VoiceVoskEvent::Error(e));
                    let _ = event_tx_err.send(VoiceVoskEvent::StateChanged("error".into()));
                }
            })
            .map_err(|e| format!("spawn vosk worker failed: {e}"))?
    } else {
        let model_path = PathBuf::from(&probe.resolved_model_path);
        thread::Builder::new()
            .name("voice-vosk".into())
            .spawn(move || {
                if let Err(e) = run_worker(
                    model_path,
                    dll_dir,
                    phrases,
                    &model_preset,
                    stop_thread,
                    event_tx,
                    frame_tx,
                ) {
                    send_event_blocking(&event_tx_err, VoiceVoskEvent::Error(e));
                    let _ = event_tx_err.send(VoiceVoskEvent::StateChanged("error".into()));
                }
            })
            .map_err(|e| format!("spawn vosk worker failed: {e}"))?
    };

    Ok(VoiceVoskHandle {
        stop,
        event_rx,
        thread: Some(thread),
    })
}

#[cfg(all(windows, not(vosk_disabled)))]
fn run_worker(
    model_path: PathBuf,
    dll_dir: PathBuf,
    phrases: Vec<String>,
    model_preset: &str,
    stop: Arc<AtomicBool>,
    event_tx: Sender<VoiceVoskEvent>,
    frame_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::SampleFormat;
    use vosk::{CompleteResult, DecodingState, Model, Recognizer};

    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("starting".into()));

    set_dll_directory(&dll_dir)?;

    let load_start = Instant::now();
    let model = Model::new(model_path.display().to_string())
        .ok_or_else(|| format!("load model failed: {}", model_path.display()))?;
    let load_ms = load_start.elapsed().as_millis() as u64;
    let _ = send_event_blocking(
        &event_tx,
        VoiceVoskEvent::ModelLoaded {
            load_time_ms: load_ms,
        },
    );

    let mut grammar_phrases: Vec<String> = phrases.iter().cloned().collect();
    grammar_phrases.push("[unk]".into());
    let grammar_refs: Vec<&str> = grammar_phrases.iter().map(|s| s.as_str()).collect();

    // HCLG / small models: grammar API may "succeed" but only emit [unk]. Use free mode instead.
    let try_grammar = should_try_grammar(model_preset, &model_path);

    let (recognizer, grammar_mode, grammar_note) = if try_grammar {
        if let Some(r) =
            Recognizer::new_with_grammar(&model, TARGET_SAMPLE_RATE as f32, &grammar_refs)
        {
            (r, true, "语法限制模式".into())
        } else if let Some(r) = Recognizer::new(&model, TARGET_SAMPLE_RATE as f32) {
            (r, false, "已切换为自由识别模式（grammar 不可用）".into())
        } else {
            return Err("create recognizer failed: grammar failed; free mode also failed".into());
        }
    } else if let Some(r) = Recognizer::new(&model, TARGET_SAMPLE_RATE as f32) {
        (
            r,
            false,
            "自由识别模式（轻量/默认 model 目录不使用 grammar）".into(),
        )
    } else {
        return Err("create recognizer failed: free mode failed".into());
    };

    let _ = send_event_blocking(
        &event_tx,
        VoiceVoskEvent::GrammarMode {
            grammar: grammar_mode,
            note: grammar_note,
        },
    );

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| String::from("no default input device"))?;

    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;

    let (audio_tx, audio_rx) = bounded(AUDIO_CHANNEL_CAP);
    let err_fn = |err| crate::app_log::sync_emergency_line("rs", &format!("vosk cpal stream error: {err}"));

    let stream = match sample_format {
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
        other => {
            return Err(format!("unsupported sample format: {other:?}"));
        }
    }
    .map_err(|e| format!("build input stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("play input stream: {e}"))?;
    drop(audio_tx);

    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("listening".into()));

    let mut recognizer = recognizer;
    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut last_partial_text = String::new();
    let mut last_partial_at = Instant::now() - PARTIAL_MIN_INTERVAL;
    let mut last_level_at = Instant::now() - LEVEL_MIN_INTERVAL;
    let mut wake_dedup = WakePhraseDedup::new();
    let mut en_wake_buffer = RecentEnWakeText::new();
    let mut speech_gate = SpeechActivityGate::new();

    while !stop.load(Ordering::Relaxed) {
        match audio_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(chunk) => {
                let pcm = resampler.process_f32(&chunk);
                if pcm.is_empty() {
                    continue;
                }
                publish_i16_pcm_to_bus(&frame_tx, &pcm);
                let level = pcm_level_percent(&pcm);
                emit_level_if_due_level(&event_tx, level, &mut last_level_at);
                let (_, became_idle) = speech_gate.update(level);
                if became_idle {
                    recognizer.reset();
                    last_partial_text.clear();
                    en_wake_buffer.clear();
                }
                if !speech_gate.is_active() {
                    continue;
                }
                let state = recognizer
                    .accept_waveform(&pcm)
                    .unwrap_or(DecodingState::Running);
                emit_partial(
                    &mut recognizer,
                    &event_tx,
                    &mut last_partial_text,
                    &mut last_partial_at,
                );
                if wake_allows_partial(&phrases) {
                    if let Some(partial) = sanitize_vosk_text(&recognizer.partial_result().partial)
                    {
                        if let Some((phrase, text)) = try_wake_with_en_buffer(
                            &mut en_wake_buffer,
                            &partial,
                            &phrases,
                            &mut wake_dedup,
                        ) {
                            send_event_blocking(
                                &event_tx,
                                VoiceVoskEvent::Detected { phrase, text },
                            );
                        }
                    }
                }

                if state == DecodingState::Finalized {
                    let raw = complete_result_text(recognizer.result());
                    if let Some(text) = sanitize_vosk_text(&raw) {
                        send_event_blocking(&event_tx, VoiceVoskEvent::Final(text.clone()));
                        if let Some((phrase, hit_text)) = try_wake_with_en_buffer(
                            &mut en_wake_buffer,
                            &text,
                            &phrases,
                            &mut wake_dedup,
                        ) {
                            send_event_blocking(
                                &event_tx,
                                VoiceVoskEvent::Detected {
                                    phrase,
                                    text: hit_text,
                                },
                            );
                        }
                    }
                    recognizer.reset();
                    last_partial_text.clear();
                    en_wake_buffer.clear();
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }

    drop(stream);
    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("stopped".into()));
    Ok(())
}

#[cfg(all(windows, not(vosk_disabled)))]
fn run_dual_worker(
    cn_model_path: PathBuf,
    en_model_path: PathBuf,
    dll_dir: PathBuf,
    phrases: Vec<String>,
    stop: Arc<AtomicBool>,
    event_tx: Sender<VoiceVoskEvent>,
    frame_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
) -> Result<(), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::SampleFormat;
    use vosk::{DecodingState, Model, Recognizer};

    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("starting".into()));

    set_dll_directory(&dll_dir)?;

    let load_start = Instant::now();
    let cn_model = Model::new(cn_model_path.display().to_string())
        .ok_or_else(|| format!("load Chinese model failed: {}", cn_model_path.display()))?;
    let en_model = Model::new(en_model_path.display().to_string())
        .ok_or_else(|| format!("load English model failed: {}", en_model_path.display()))?;
    let load_ms = load_start.elapsed().as_millis() as u64;
    let _ = send_event_blocking(
        &event_tx,
        VoiceVoskEvent::ModelLoaded {
            load_time_ms: load_ms,
        },
    );

    let cn_recognizer = Recognizer::new(&cn_model, TARGET_SAMPLE_RATE as f32)
        .ok_or_else(|| "create Chinese recognizer failed".to_string())?;
    let en_recognizer = Recognizer::new(&en_model, TARGET_SAMPLE_RATE as f32)
        .ok_or_else(|| "create English recognizer failed".to_string())?;

    let _ = send_event_blocking(
        &event_tx,
        VoiceVoskEvent::GrammarMode {
            grammar: false,
            note: "双模型并行 · 中英自动识别".into(),
        },
    );

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| String::from("no default input device"))?;

    let (stream_config, sample_format, sample_rate) = pick_input_config(&device)?;
    let channels = stream_config.channels as usize;

    let (audio_tx, audio_rx) = bounded(AUDIO_CHANNEL_CAP);
    let err_fn = |err| crate::app_log::sync_emergency_line("rs", &format!("vosk cpal stream error: {err}"));

    let stream = match sample_format {
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
        other => {
            return Err(format!("unsupported sample format: {other:?}"));
        }
    }
    .map_err(|e| format!("build input stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("play input stream: {e}"))?;
    drop(audio_tx);

    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("listening".into()));

    let mut cn_recognizer = cn_recognizer;
    let mut en_recognizer = en_recognizer;
    let mut resampler = ResamplerState::new(sample_rate, TARGET_SAMPLE_RATE);
    let mut last_partial_text = String::new();
    let mut last_partial_at = Instant::now() - PARTIAL_MIN_INTERVAL;
    let mut last_level_at = Instant::now() - LEVEL_MIN_INTERVAL;
    let mut wake_dedup = WakePhraseDedup::new();
    let mut lang_lock: Option<(DualLangSide, Instant)> = None;
    let mut en_wake_buffer = RecentEnWakeText::new();
    let mut speech_gate = SpeechActivityGate::new();

    while !stop.load(Ordering::Relaxed) {
        match audio_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(chunk) => {
                let pcm = resampler.process_f32(&chunk);
                if pcm.is_empty() {
                    continue;
                }
                publish_i16_pcm_to_bus(&frame_tx, &pcm);
                let level = pcm_level_percent(&pcm);
                emit_level_if_due_level(&event_tx, level, &mut last_level_at);
                let (_, became_idle) = speech_gate.update(level);
                if became_idle {
                    cn_recognizer.reset();
                    en_recognizer.reset();
                    last_partial_text.clear();
                    en_wake_buffer.clear();
                }
                if !speech_gate.is_active() {
                    continue;
                }

                let cn_state = cn_recognizer
                    .accept_waveform(&pcm)
                    .unwrap_or(DecodingState::Running);
                let en_state = en_recognizer
                    .accept_waveform(&pcm)
                    .unwrap_or(DecodingState::Running);

                let lock = active_lang_lock(&lang_lock);

                emit_dual_partial(
                    &mut cn_recognizer,
                    &mut en_recognizer,
                    &phrases,
                    lock,
                    &event_tx,
                    &mut last_partial_text,
                    &mut last_partial_at,
                );

                let cn_partial = cn_recognizer.partial_result().partial.trim().to_string();
                let en_partial = en_recognizer.partial_result().partial.trim().to_string();

                let cn_final = if cn_state == DecodingState::Finalized {
                    sanitize_vosk_text(&complete_result_text(cn_recognizer.result()))
                } else {
                    None
                };
                let en_final = if en_state == DecodingState::Finalized {
                    sanitize_vosk_text(&complete_result_text(en_recognizer.result()))
                } else {
                    None
                };

                if cn_final.is_some() || en_final.is_some() {
                    match resolve_dual_finalization(
                        cn_final.as_deref(),
                        en_final.as_deref(),
                        &cn_partial,
                        &en_partial,
                        &phrases,
                        lock,
                    ) {
                        DualResolution::Commit(text) => {
                            send_event_blocking(&event_tx, VoiceVoskEvent::Final(text.clone()));
                            if let Some((phrase, hit_text)) = try_wake_with_en_buffer(
                                &mut en_wake_buffer,
                                &text,
                                &phrases,
                                &mut wake_dedup,
                            ) {
                                set_lang_lock_from_phrase(&mut lang_lock, &phrase);
                                send_event_blocking(
                                    &event_tx,
                                    VoiceVoskEvent::Detected {
                                        phrase,
                                        text: hit_text,
                                    },
                                );
                            }
                            cn_recognizer.reset();
                            en_recognizer.reset();
                            last_partial_text.clear();
                            en_wake_buffer.clear();
                        }
                        DualResolution::DropCnOnly => {
                            cn_recognizer.reset();
                        }
                        DualResolution::DropEnOnly => {
                            en_recognizer.reset();
                        }
                    }
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }

    drop(stream);
    let _ = send_event_blocking(&event_tx, VoiceVoskEvent::StateChanged("stopped".into()));
    Ok(())
}

#[cfg(all(windows, not(vosk_disabled)))]
fn emit_dual_partial(
    cn_recognizer: &mut vosk::Recognizer,
    en_recognizer: &mut vosk::Recognizer,
    phrases: &[String],
    lang_lock: Option<DualLangSide>,
    event_tx: &Sender<VoiceVoskEvent>,
    last_text: &mut String,
    last_at: &mut Instant,
) {
    let cn = cn_recognizer.partial_result().partial.trim();
    let en = en_recognizer.partial_result().partial.trim();
    let Some(text) = pick_dual_partial(cn, en, phrases, lang_lock) else {
        return;
    };
    if text == *last_text {
        return;
    }
    if last_at.elapsed() < PARTIAL_MIN_INTERVAL {
        return;
    }
    *last_text = text.clone();
    *last_at = Instant::now();
    send_event_try_partial(event_tx, VoiceVoskEvent::Partial(text));
}

fn text_has_cjk(text: &str) -> bool {
    text.chars()
        .any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c) || ('\u{3400}'..='\u{4dbf}').contains(&c))
}

fn text_has_latin(text: &str) -> bool {
    text.chars().any(|c| c.is_ascii_alphabetic())
}

fn split_phrases_by_script(phrases: &[String]) -> (Vec<String>, Vec<String>) {
    let mut cn = Vec::new();
    let mut en = Vec::new();
    for phrase in phrases {
        if text_has_cjk(phrase) {
            cn.push(phrase.clone());
        } else if text_has_latin(phrase) {
            en.push(phrase.clone());
        }
    }
    (cn, en)
}

const PHRASE_MATCH_STRONG: u32 = 500;

/// Fuzzy wake matches reject long unrelated sentences (contains match only).
pub fn wake_fuzzy_match_allowed(text: &str, phrase: &str) -> bool {
    let norm_text = normalize_phrase(text);
    let norm_phrase = normalize_phrase(phrase);
    if norm_phrase.is_empty() {
        return false;
    }
    if norm_text == norm_phrase {
        return true;
    }

    let text_len = norm_text.chars().count();
    let phrase_len = norm_phrase.chars().count();

    if text_has_latin(phrase) && !text_has_cjk(phrase) {
        let phrase_tokens = latin_word_tokens(phrase);
        if phrase_tokens.is_empty() {
            return false;
        }
        let text_tokens = latin_word_tokens(text);
        return text_tokens.len() <= phrase_tokens.len() + WAKE_EN_MAX_EXTRA_TOKENS
            && text_len <= phrase_len + 12;
    }

    let max_len = (phrase_len + WAKE_FUZZY_MAX_EXTRA_CHARS)
        .max((phrase_len * 3 + 1) / 2)
        .min(phrase_len * 2 + 2);
    text_len <= max_len
}

/// When ASR hears speech but no wake phrase matched, explain likely long/noise rejections.
pub fn wake_text_rejection_reason(text: &str, phrases: &[String]) -> Option<String> {
    if matches_final(text, phrases).is_some() {
        return None;
    }
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    for phrase in phrases {
        if !phrase_script_compatible(text, phrase) {
            continue;
        }
        let norm_text = normalize_phrase(text);
        let norm_phrase = normalize_phrase(phrase);
        if norm_phrase.is_empty() {
            continue;
        }
        if norm_text == norm_phrase {
            continue;
        }
        if norm_text.contains(&norm_phrase) && !wake_fuzzy_match_allowed(text, phrase) {
            return Some(format!("句子太长，不像唤醒词（听到「{}」）", trimmed));
        }
    }
    None
}

struct SpeechActivityGate {
    active: bool,
    candidate_since: Option<Instant>,
    silence_since: Option<Instant>,
}

impl SpeechActivityGate {
    fn new() -> Self {
        Self {
            active: false,
            candidate_since: None,
            silence_since: None,
        }
    }

    fn is_active(&self) -> bool {
        self.active
    }

    /// Returns `(listening_now, became_idle)`.
    fn update(&mut self, level: u32) -> (bool, bool) {
        let now = Instant::now();
        let mut became_idle = false;

        if level >= VAD_SPEECH_LEVEL {
            self.silence_since = None;
            if self.candidate_since.is_none() {
                self.candidate_since = Some(now);
            } else if !self.active
                && self.candidate_since.is_some_and(|t| {
                    now.duration_since(t) >= Duration::from_millis(VAD_SPEECH_HOLD_MS)
                })
            {
                self.active = true;
            }
        } else if self.active {
            if self.silence_since.is_none() {
                self.silence_since = Some(now);
            } else if self.silence_since.is_some_and(|t| {
                now.duration_since(t) >= Duration::from_millis(VAD_SILENCE_HOLD_MS)
            }) {
                self.active = false;
                self.candidate_since = None;
                self.silence_since = None;
                became_idle = true;
            }
        } else {
            self.candidate_since = None;
        }

        (self.active, became_idle)
    }
}

fn phrase_match_score(text: &str, phrase: &str) -> u32 {
    if !phrase_script_compatible(text, phrase) {
        return 0;
    }
    let norm_text = normalize_phrase(text);
    let norm_phrase = normalize_phrase(phrase);
    if norm_text.is_empty() || norm_phrase.is_empty() {
        return 0;
    }
    if norm_text == norm_phrase {
        return 1000;
    }
    if norm_text.contains(&norm_phrase) {
        let min_len = ((norm_phrase.chars().count() as f64) * 0.7).ceil() as usize;
        let required = min_len.max(4.min(norm_phrase.chars().count()));
        if norm_text.chars().count() >= required && wake_fuzzy_match_allowed(text, phrase) {
            return 500 + norm_phrase.chars().count() as u32;
        }
    }
    if text_has_latin(phrase) && !text_has_cjk(phrase) {
        if let Some(score) = english_token_match_score(text, phrase) {
            if score > 0 {
                return score;
            }
        }
    }
    0
}

fn latin_word_tokens(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| normalize_phrase(w))
        .filter(|w| !w.is_empty())
        .collect()
}

fn tokens_in_subsequence_order(haystack: &[String], needle: &[String]) -> bool {
    if needle.is_empty() {
        return false;
    }
    let mut matched = 0;
    for token in haystack {
        if token == &needle[matched] {
            matched += 1;
            if matched >= needle.len() {
                return true;
            }
        }
    }
    matched >= needle.len()
}

/// English multi-word phrases: match spaced tokens ("start dictation") and split finals.
fn english_token_match_score(text: &str, phrase: &str) -> Option<u32> {
    let phrase_tokens = latin_word_tokens(phrase);
    if phrase_tokens.len() < 2 {
        return None;
    }
    let text_tokens = latin_word_tokens(text);
    let phrase_norm = normalize_phrase(phrase);
    let collapsed = normalize_phrase(text);

    if tokens_in_subsequence_order(&text_tokens, &phrase_tokens) {
        let joined_norm = normalize_phrase(&text_tokens.join(" "));
        if joined_norm == phrase_norm || collapsed == phrase_norm {
            return Some(1000);
        }
        if wake_fuzzy_match_allowed(text, phrase) {
            return Some(860 + phrase_tokens.len() as u32);
        }
    }

    if let Some(score) = english_first_token_inflection_score(&collapsed, &phrase_tokens) {
        return Some(score);
    }

    None
}

fn english_first_token_inflection_score(collapsed: &str, phrase_tokens: &[String]) -> Option<u32> {
    let Some(first) = phrase_tokens.first() else {
        return None;
    };
    if first.len() < 3 || first.ends_with('s') {
        return None;
    }

    let mut variants = Vec::with_capacity(2);
    variants.push(format!("{}s{}", first, phrase_tokens[1..].join("")));
    if first.ends_with("ch")
        || first.ends_with("sh")
        || first.ends_with('x')
        || first.ends_with('z')
    {
        variants.push(format!("{}es{}", first, phrase_tokens[1..].join("")));
    }

    for variant in variants {
        if collapsed == variant {
            return Some(960);
        }
        if collapsed.contains(&variant) {
            return Some(540 + variant.chars().count() as u32);
        }
    }
    None
}

struct WakePhraseDedup {
    norm: String,
    at: Instant,
}

impl WakePhraseDedup {
    fn new() -> Self {
        Self {
            norm: String::new(),
            at: Instant::now() - Duration::from_secs(10),
        }
    }

    fn clear(&mut self) {
        self.norm.clear();
    }

    fn is_duplicate(&self, norm: &str) -> bool {
        !norm.is_empty()
            && norm == self.norm
            && self.at.elapsed() < Duration::from_millis(WAKE_PHRASE_DEDUP_MS)
    }

    fn mark(&mut self, norm: String) {
        self.norm = norm;
        self.at = Instant::now();
    }
}

struct RecentEnWakeText {
    parts: VecDeque<(Instant, String)>,
}

impl RecentEnWakeText {
    fn new() -> Self {
        Self {
            parts: VecDeque::new(),
        }
    }

    fn ingest(&mut self, text: &str) {
        let now = Instant::now();
        self.parts
            .retain(|(t, _)| now.duration_since(*t) < EN_WAKE_BUFFER_TTL);
        let Some(s) = sanitize_vosk_text(text) else {
            return;
        };
        if !text_has_latin(&s) || text_has_cjk(&s) {
            return;
        }
        if self.parts.back().is_some_and(|(_, prev)| prev == &s) {
            return;
        }
        self.parts.push_back((now, s));
        while self.parts.len() > 6 {
            self.parts.pop_front();
        }
    }

    fn combined_spaced(&self) -> String {
        self.parts
            .iter()
            .map(|(_, s)| s.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn clear(&mut self) {
        self.parts.clear();
    }
}

fn wake_allows_partial(phrases: &[String]) -> bool {
    phrases.iter().any(|p| text_has_cjk(p))
}

fn try_wake_from_text(
    text: &str,
    phrases: &[String],
    dedup: &mut WakePhraseDedup,
) -> Option<(String, String)> {
    let Some(phrase) = matches_final(text, phrases) else {
        return None;
    };
    let phrase_norm = normalize_phrase(&phrase);
    if phrase_norm.is_empty() || dedup.is_duplicate(&phrase_norm) {
        return None;
    }
    dedup.mark(phrase_norm);
    Some((phrase, text.to_string()))
}

fn try_wake_with_en_buffer(
    buffer: &mut RecentEnWakeText,
    text: &str,
    phrases: &[String],
    dedup: &mut WakePhraseDedup,
) -> Option<(String, String)> {
    buffer.ingest(text);
    let hit = try_wake_from_text(text, phrases, dedup).or_else(|| {
        let combined = buffer.combined_spaced();
        if combined.is_empty() {
            None
        } else {
            try_wake_from_text(&combined, phrases, dedup)
        }
    });
    if hit.is_some() {
        buffer.clear();
    }
    hit
}

fn best_phrase_match_score(text: &str, phrases: &[String]) -> u32 {
    phrases
        .iter()
        .map(|phrase| phrase_match_score(text, phrase))
        .max()
        .unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DualLangSide {
    Cn,
    En,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DualResolution {
    Commit(String),
    DropCnOnly,
    DropEnOnly,
}

fn pick_dual_side(cn: &str, en: &str, phrases: &[String]) -> Option<(DualLangSide, String)> {
    let (cn_phrases, en_phrases) = split_phrases_by_script(phrases);
    let cn_text = sanitize_vosk_text(cn);
    let en_text = sanitize_vosk_text(en);

    let cn_score = cn_text
        .as_ref()
        .map(|t| best_phrase_match_score(t, &cn_phrases))
        .unwrap_or(0);
    let en_score = en_text
        .as_ref()
        .map(|t| best_phrase_match_score(t, &en_phrases))
        .unwrap_or(0);
    let cn_partial_score = best_phrase_match_score(cn, &cn_phrases);
    let en_partial_score = best_phrase_match_score(en, &en_phrases);

    if en_score >= PHRASE_MATCH_STRONG && en_score > cn_score {
        return en_text.map(|t| (DualLangSide::En, t));
    }
    if cn_score >= PHRASE_MATCH_STRONG && cn_score > en_score {
        return cn_text.map(|t| (DualLangSide::Cn, t));
    }
    if en_score >= PHRASE_MATCH_STRONG && cn_score >= PHRASE_MATCH_STRONG {
        if cn_partial_score >= PHRASE_MATCH_STRONG && text_has_cjk(cn) {
            return cn_text.or(en_text).map(|t| (DualLangSide::Cn, t));
        }
        return en_text.map(|t| (DualLangSide::En, t));
    }

    if en_partial_score >= PHRASE_MATCH_STRONG && cn_score < PHRASE_MATCH_STRONG {
        return en_text
            .or_else(|| sanitize_vosk_text(en))
            .map(|t| (DualLangSide::En, t));
    }
    if cn_partial_score >= PHRASE_MATCH_STRONG && en_score < PHRASE_MATCH_STRONG {
        return cn_text
            .or_else(|| sanitize_vosk_text(cn))
            .map(|t| (DualLangSide::Cn, t));
    }

    if let Some(ref en_t) = en_text {
        if text_has_latin(en_t) && !text_has_cjk(en_t) && cn_score < PHRASE_MATCH_STRONG {
            return Some((DualLangSide::En, en_t.clone()));
        }
    }
    if let Some(ref cn_t) = cn_text {
        if cn_score >= PHRASE_MATCH_STRONG {
            return Some((DualLangSide::Cn, cn_t.clone()));
        }
    }

    en_text
        .map(|t| (DualLangSide::En, t))
        .or_else(|| cn_text.map(|t| (DualLangSide::Cn, t)))
}

const LANG_LOCK_TTL: Duration = Duration::from_secs(8);

fn active_lang_lock(lock: &Option<(DualLangSide, Instant)>) -> Option<DualLangSide> {
    lock.as_ref().and_then(|(side, until)| {
        if Instant::now() < *until {
            Some(*side)
        } else {
            None
        }
    })
}

fn set_lang_lock_from_phrase(lock: &mut Option<(DualLangSide, Instant)>, phrase: &str) {
    let side = if text_has_cjk(phrase) {
        DualLangSide::Cn
    } else {
        DualLangSide::En
    };
    *lock = Some((side, Instant::now() + LANG_LOCK_TTL));
}

fn en_wake_building(en: &str) -> bool {
    let lower = en.to_lowercase();
    ["start", "begin", "voice", "input", "dictation", "typing"]
        .iter()
        .any(|token| lower.contains(token))
}

fn resolve_dual_finalization(
    cn_final: Option<&str>,
    en_final: Option<&str>,
    cn_partial: &str,
    en_partial: &str,
    phrases: &[String],
    lang_lock: Option<DualLangSide>,
) -> DualResolution {
    let (cn_phrases, en_phrases) = split_phrases_by_script(phrases);

    let cn_commit = cn_final.and_then(sanitize_vosk_text);
    let en_commit = en_final.and_then(sanitize_vosk_text);

    let cn_score = cn_commit
        .as_ref()
        .map(|t| best_phrase_match_score(t, &cn_phrases))
        .unwrap_or(0);
    let en_score = en_commit
        .as_ref()
        .map(|t| best_phrase_match_score(t, &en_phrases))
        .unwrap_or(0);
    let cn_partial_score = best_phrase_match_score(cn_partial, &cn_phrases);
    let en_partial_score = best_phrase_match_score(en_partial, &en_phrases);

    if lang_lock == Some(DualLangSide::En) {
        if let Some(text) = en_commit.filter(|_| en_score >= PHRASE_MATCH_STRONG) {
            return DualResolution::Commit(text);
        }
        if en_final.is_none()
            && en_partial_score >= PHRASE_MATCH_STRONG
            && cn_score < PHRASE_MATCH_STRONG
        {
            if let Some(text) = sanitize_vosk_text(en_partial) {
                return DualResolution::Commit(text);
            }
        }
        if cn_final.is_some() && en_final.is_none() {
            return DualResolution::DropCnOnly;
        }
        if en_final.is_some() && en_score < PHRASE_MATCH_STRONG {
            return DualResolution::DropEnOnly;
        }
        return DualResolution::DropCnOnly;
    }

    if lang_lock == Some(DualLangSide::Cn) {
        if let Some(text) = cn_commit.filter(|_| cn_score >= PHRASE_MATCH_STRONG) {
            return DualResolution::Commit(text);
        }
        if cn_final.is_none()
            && cn_partial_score >= PHRASE_MATCH_STRONG
            && en_score < PHRASE_MATCH_STRONG
        {
            if let Some(text) = sanitize_vosk_text(cn_partial) {
                return DualResolution::Commit(text);
            }
        }
        if en_final.is_some() && cn_final.is_none() {
            return DualResolution::DropEnOnly;
        }
        if en_final.is_some() && en_score >= PHRASE_MATCH_STRONG && cn_score < PHRASE_MATCH_STRONG {
            return DualResolution::DropEnOnly;
        }
        if cn_final.is_some() && cn_score < PHRASE_MATCH_STRONG {
            return DualResolution::DropCnOnly;
        }
        return DualResolution::DropEnOnly;
    }

    let cn_only = cn_final.is_some() && en_final.is_none();
    let en_only = en_final.is_some() && cn_final.is_none();

    if en_score >= PHRASE_MATCH_STRONG && en_score > cn_score {
        if let Some(text) = en_commit {
            return DualResolution::Commit(text);
        }
    }
    if cn_score >= PHRASE_MATCH_STRONG && cn_score > en_score {
        if let Some(text) = cn_commit {
            return DualResolution::Commit(text);
        }
    }

    if en_score >= PHRASE_MATCH_STRONG && cn_score >= PHRASE_MATCH_STRONG {
        let en_word_count = en_partial
            .split_whitespace()
            .filter(|w| w.chars().any(|c| c.is_ascii_alphabetic()))
            .count();
        if en_word_count >= 2 && en_partial_score >= PHRASE_MATCH_STRONG {
            if let Some(text) = en_commit.clone().or_else(|| sanitize_vosk_text(en_partial)) {
                return DualResolution::Commit(text);
            }
        }
        if cn_partial_score >= PHRASE_MATCH_STRONG && text_has_cjk(cn_partial) {
            if let Some(text) = cn_commit.clone().or_else(|| sanitize_vosk_text(cn_partial)) {
                return DualResolution::Commit(text);
            }
        }
        if let Some(text) = en_commit {
            return DualResolution::Commit(text);
        }
    }

    if en_only {
        if let Some(text) = en_commit {
            if en_score >= PHRASE_MATCH_STRONG {
                return DualResolution::Commit(text);
            }
        }
        return DualResolution::DropEnOnly;
    }

    if cn_only {
        if en_partial_score >= PHRASE_MATCH_STRONG && cn_score < PHRASE_MATCH_STRONG {
            if let Some(text) = sanitize_vosk_text(en_partial) {
                return DualResolution::Commit(text);
            }
        }
        if cn_score >= PHRASE_MATCH_STRONG {
            if let Some(text) = cn_commit {
                return DualResolution::Commit(text);
            }
        }
        if cn_score < PHRASE_MATCH_STRONG && en_partial_score >= PHRASE_MATCH_STRONG {
            return DualResolution::DropCnOnly;
        }
        if cn_score < PHRASE_MATCH_STRONG {
            return DualResolution::DropCnOnly;
        }
    }

    if cn_final.is_some() && en_final.is_some() {
        if en_score > cn_score && en_score >= PHRASE_MATCH_STRONG {
            if let Some(text) = en_commit {
                return DualResolution::Commit(text);
            }
        }
        if cn_score >= en_score && cn_score >= PHRASE_MATCH_STRONG {
            if let Some(text) = cn_commit {
                return DualResolution::Commit(text);
            }
        }
        if en_score >= PHRASE_MATCH_STRONG {
            if let Some(text) = en_commit {
                return DualResolution::Commit(text);
            }
        }
        return DualResolution::DropCnOnly;
    }

    DualResolution::DropCnOnly
}

fn pick_dual_partial(
    cn: &str,
    en: &str,
    phrases: &[String],
    lang_lock: Option<DualLangSide>,
) -> Option<String> {
    let (cn_phrases, en_phrases) = split_phrases_by_script(phrases);
    let en_score = best_phrase_match_score(en, &en_phrases);
    let cn_score = best_phrase_match_score(cn, &cn_phrases);

    if lang_lock == Some(DualLangSide::En) {
        return sanitize_vosk_text(en).or_else(|| sanitize_vosk_text(cn));
    }
    if lang_lock == Some(DualLangSide::Cn) {
        return sanitize_vosk_text(cn).or_else(|| sanitize_vosk_text(en));
    }

    if en_score >= PHRASE_MATCH_STRONG {
        return sanitize_vosk_text(en);
    }
    if cn_score >= PHRASE_MATCH_STRONG {
        return sanitize_vosk_text(cn);
    }
    if en_wake_building(en) && text_has_cjk(cn) && cn_score < PHRASE_MATCH_STRONG {
        return sanitize_vosk_text(en);
    }
    if text_has_cjk(cn) && en_score < PHRASE_MATCH_STRONG && !en_wake_building(en) {
        return sanitize_vosk_text(cn);
    }
    if text_has_latin(en) && cn_score < PHRASE_MATCH_STRONG {
        return sanitize_vosk_text(en);
    }
    pick_dual_side(cn, en, phrases).map(|(_, text)| text)
}

fn pick_dual_final(candidates: &[String], phrases: &[String]) -> Option<String> {
    for text in candidates {
        if !text_has_cjk(text) {
            continue;
        }
        if matches_final(text, phrases).is_some() {
            return Some(text.clone());
        }
    }
    for text in candidates {
        if text_has_cjk(text) {
            if matches_final(text, phrases).is_some() {
                return Some(text.clone());
            }
            return Some(text.clone());
        }
    }
    for text in candidates {
        if text_has_latin(text) && matches_final(text, phrases).is_some() {
            return Some(text.clone());
        }
    }
    for text in candidates {
        if text_has_latin(text) {
            return Some(text.clone());
        }
    }
    candidates.first().cloned()
}

fn phrase_script_compatible(text: &str, phrase: &str) -> bool {
    if text_has_cjk(phrase) {
        return text_has_cjk(text);
    }
    if text_has_latin(phrase) && !text_has_cjk(phrase) {
        return text_has_latin(text) && !text_has_cjk(text);
    }
    true
}

#[cfg(all(windows, not(vosk_disabled)))]
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

#[cfg(all(windows, not(vosk_disabled)))]
struct ResamplerState {
    src_rate: f64,
    dst_rate: f64,
    src_pos: f64,
    last_sample: f32,
}

#[cfg(all(windows, not(vosk_disabled)))]
impl ResamplerState {
    fn new(src_rate: u32, dst_rate: u32) -> Self {
        Self {
            src_rate: src_rate as f64,
            dst_rate: dst_rate as f64,
            src_pos: 0.0,
            last_sample: 0.0,
        }
    }

    fn process_f32(&mut self, input: &[f32]) -> Vec<i16> {
        if input.is_empty() {
            return Vec::new();
        }
        if (self.src_rate - self.dst_rate).abs() < 1.0 {
            return input.iter().map(|&s| f32_to_i16(s)).collect();
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
            out.push(f32_to_i16(sample));
            pos += ratio;
        }

        self.src_pos = pos - input.len() as f64;
        self.last_sample = *input.last().unwrap_or(&self.last_sample);
        out
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn f32_to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

#[cfg(all(windows, not(vosk_disabled)))]
fn push_mono_f32(data: &[f32], channels: usize, tx: &Sender<Vec<f32>>) {
    let mono = to_mono_f32(data, channels);
    if mono.is_empty() {
        return;
    }
    try_push_audio(tx, mono);
}

#[cfg(all(windows, not(vosk_disabled)))]
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
    if mono.is_empty() {
        return;
    }
    try_push_audio(tx, mono);
}

#[cfg(all(windows, not(vosk_disabled)))]
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
    if mono.is_empty() {
        return;
    }
    try_push_audio(tx, mono);
}

#[cfg(all(windows, not(vosk_disabled)))]
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

#[cfg(all(windows, not(vosk_disabled)))]
fn try_push_audio(tx: &Sender<Vec<f32>>, chunk: Vec<f32>) {
    match tx.try_send(chunk) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            // Drop new chunk when backlog is full — keep callback lightweight.
        }
        Err(TrySendError::Disconnected(_)) => {}
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn should_try_grammar(model_preset: &str, model_path: &Path) -> bool {
    if model_preset != "cn-accurate" && model_preset != "en-accurate" {
        return false;
    }
    let path = model_path.to_string_lossy().to_ascii_lowercase();
    !path.contains("small") && !path.ends_with("/model") && !path.ends_with("\\model")
}

/// Drop grammar-only `[unk]` and empty fragments.
pub fn sanitize_vosk_text(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed == "[unk]" {
        return None;
    }
    let joined: String = trimmed
        .split_whitespace()
        .filter(|token| *token != "[unk]")
        .collect();
    if joined.is_empty() {
        return None;
    }
    Some(joined)
}

#[cfg(all(windows, not(vosk_disabled)))]
fn complete_result_text(result: vosk::CompleteResult<'_>) -> String {
    use vosk::CompleteResult;
    match result {
        CompleteResult::Single(s) => s.text.trim().to_string(),
        CompleteResult::Multiple(m) => m
            .alternatives
            .first()
            .map(|a| a.text.trim().to_string())
            .unwrap_or_default(),
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn emit_partial(
    recognizer: &mut vosk::Recognizer,
    event_tx: &Sender<VoiceVoskEvent>,
    last_text: &mut String,
    last_at: &mut Instant,
) {
    let text = recognizer.partial_result().partial.trim().to_string();
    let Some(text) = sanitize_vosk_text(&text) else {
        return;
    };
    if text == *last_text {
        return;
    }
    if last_at.elapsed() < PARTIAL_MIN_INTERVAL {
        return;
    }
    *last_text = text.clone();
    *last_at = Instant::now();
    send_event_try_partial(event_tx, VoiceVoskEvent::Partial(text));
}

#[cfg(all(windows, not(vosk_disabled)))]
fn emit_level_if_due(event_tx: &Sender<VoiceVoskEvent>, pcm: &[i16], last_at: &mut Instant) {
    emit_level_if_due_level(event_tx, pcm_level_percent(pcm), last_at);
}

#[cfg(all(windows, not(vosk_disabled)))]
fn emit_level_if_due_level(event_tx: &Sender<VoiceVoskEvent>, level: u32, last_at: &mut Instant) {
    if last_at.elapsed() < LEVEL_MIN_INTERVAL {
        return;
    }
    *last_at = Instant::now();
    send_event_try_partial(event_tx, VoiceVoskEvent::Level { level });
}

#[cfg(all(windows, not(vosk_disabled)))]
fn publish_i16_pcm_to_bus(frame_tx: &Option<crossbeam_channel::Sender<Vec<f32>>>, pcm: &[i16]) {
    if let Some(tx) = frame_tx {
        let out: Vec<f32> = pcm
            .iter()
            .map(|&s| f32::from(s) / i16::MAX as f32)
            .collect();
        let _ = tx.try_send(out);
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn pcm_level_percent(pcm: &[i16]) -> u32 {
    let mut peak = 0.0f32;
    for sample in pcm {
        let amp = (f32::from(*sample) / i16::MAX as f32).abs();
        if amp > peak {
            peak = amp;
        }
    }
    let shaped = peak.clamp(0.0, 1.0).sqrt();
    (shaped * 100.0).round() as u32
}

#[cfg(all(windows, not(vosk_disabled)))]
fn send_event_try_partial(tx: &Sender<VoiceVoskEvent>, ev: VoiceVoskEvent) {
    let _ = tx.try_send(ev);
}

#[cfg(all(windows, not(vosk_disabled)))]
fn send_event_blocking(tx: &Sender<VoiceVoskEvent>, ev: VoiceVoskEvent) {
    if tx.send(ev).is_err() {
        // Worker shutting down.
    }
}

#[cfg(all(windows, not(vosk_disabled)))]
fn set_dll_directory(dir: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::SetDllDirectoryW;

    let mut wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        SetDllDirectoryW(PCWSTR(wide.as_mut_ptr()))
            .map_err(|e| format!("SetDllDirectoryW failed: {e}"))?;
    }
    Ok(())
}

pub fn normalize_phrase(s: &str) -> String {
    s.chars()
        .filter(|c| {
            c.is_ascii_alphanumeric()
                || ('\u{4e00}'..='\u{9fff}').contains(c)
                || ('\u{3400}'..='\u{4dbf}').contains(c)
        })
        .map(|c| {
            if c.is_ascii_alphabetic() {
                c.to_ascii_lowercase()
            } else {
                c
            }
        })
        .collect()
}

pub fn matches_final(text: &str, phrases: &[String]) -> Option<String> {
    let mut best: Option<(String, u32)> = None;
    for phrase in phrases {
        let score = phrase_match_score(text, phrase);
        if score >= PHRASE_MATCH_STRONG {
            if best
                .as_ref()
                .is_none_or(|(_, best_score)| score > *best_score)
            {
                best = Some((phrase.clone(), score));
            }
        }
    }
    best.map(|(phrase, _)| phrase)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_final_exact() {
        let phrases = vec!["开始输入".into()];
        assert_eq!(matches_final("开始输入", &phrases), Some("开始输入".into()));
    }

    #[test]
    fn matches_final_contains() {
        let phrases = vec!["开始输入".into()];
        assert_eq!(
            matches_final("请开始输入吧", &phrases),
            Some("开始输入".into())
        );
    }

    #[test]
    fn matches_final_rejects_long_unrelated_cn() {
        let phrases = vec!["开始输入".into()];
        assert_eq!(
            matches_final("今天下午我们开始输入很多内容", &phrases),
            None
        );
        assert!(wake_text_rejection_reason("今天下午我们开始输入很多内容", &phrases).is_some());
    }

    #[test]
    fn wake_fuzzy_allows_short_padding_en() {
        assert!(wake_fuzzy_match_allowed(
            "please start dictation",
            "start dictation"
        ));
        assert!(!wake_fuzzy_match_allowed(
            "please start dictation right now today",
            "start dictation"
        ));
    }

    #[test]
    fn sanitize_rejects_unk_only() {
        assert!(sanitize_vosk_text("[unk]").is_none());
        assert!(sanitize_vosk_text("  [unk]  ").is_none());
    }

    #[test]
    fn pick_dual_partial_prefers_script() {
        let phrases = dual_test_phrases();
        assert_eq!(
            pick_dual_partial("开始", "start", &phrases, None).as_deref(),
            Some("start")
        );
        assert_eq!(
            pick_dual_partial("", "start input", &phrases, None).as_deref(),
            Some("startinput")
        );
        assert_eq!(
            pick_dual_partial("开始输入", "start", &phrases, None).as_deref(),
            Some("开始输入")
        );
        assert_eq!(
            pick_dual_partial("探因铺子", "start input", &phrases, None).as_deref(),
            Some("startinput")
        );
        assert_eq!(
            pick_dual_partial("开始输入", "start input", &phrases, None).as_deref(),
            Some("startinput")
        );
    }

    #[test]
    fn resolve_dual_english_over_cn_garbage() {
        let phrases = dual_test_phrases();
        assert_eq!(
            resolve_dual_finalization(
                Some("他因铺子"),
                None,
                "探因铺子",
                "start input",
                &phrases,
                None,
            ),
            DualResolution::Commit("startinput".into())
        );
    }

    #[test]
    fn resolve_dual_drops_en_garbage_final() {
        let phrases = dual_test_phrases();
        assert_eq!(
            resolve_dual_finalization(
                None,
                Some("kaisersure"),
                "开始输入",
                "start input",
                &phrases,
                None,
            ),
            DualResolution::DropEnOnly
        );
    }

    #[test]
    fn resolve_dual_chinese_over_en_hallucination() {
        let phrases = dual_test_phrases();
        assert_eq!(
            resolve_dual_finalization(
                Some("开始听写"),
                Some("start dictation"),
                "开始听写",
                "start",
                &phrases,
                None,
            ),
            DualResolution::Commit("开始听写".into())
        );
    }

    fn dual_test_phrases() -> Vec<String> {
        vec![
            "开始听写".into(),
            "开始输入".into(),
            "start dictation".into(),
            "start input".into(),
        ]
    }

    #[test]
    fn wake_dedup_allows_repeat_after_window() {
        let phrases = vec!["start dictation".into()];
        let mut dedup = WakePhraseDedup::new();
        assert!(try_wake_from_text("start dictation", &phrases, &mut dedup).is_some());
        assert!(try_wake_from_text("start dictation", &phrases, &mut dedup).is_none());
        dedup.clear();
        assert!(try_wake_from_text("start dictation", &phrases, &mut dedup).is_some());
    }

    #[test]
    fn matches_final_rejects_garbage_cn() {
        let phrases = vec!["start dictation".into(), "开始输入".into()];
        assert_eq!(matches_final("他因铺子", &phrases), None);
        assert_eq!(matches_final("探因铺子", &phrases), None);
    }

    #[test]
    fn matches_final_rejects_cross_script() {
        let phrases = vec!["start dictation".into(), "开始输入".into()];
        assert_eq!(matches_final("kaisersure", &phrases), None);
        assert_eq!(matches_final("开始输入", &phrases), Some("开始输入".into()));
        assert_eq!(
            matches_final("start dictation", &phrases),
            Some("start dictation".into())
        );
    }

    #[test]
    fn pick_dual_final_prefers_chinese_phrase_match() {
        let phrases = vec!["开始输入".into(), "start dictation".into()];
        let candidates = vec!["kaisersure".into(), "开始输入".into()];
        assert_eq!(
            pick_dual_final(&candidates, &phrases).as_deref(),
            Some("开始输入")
        );
    }

    #[test]
    fn pick_dual_final_prefers_phrase_match() {
        let phrases = vec!["开始输入".into(), "start dictation".into()];
        let candidates = vec!["noise".into(), "start dictation".into()];
        assert_eq!(
            pick_dual_final(&candidates, &phrases).as_deref(),
            Some("start dictation")
        );
    }

    #[test]
    fn matches_final_english_split_tokens() {
        let phrases = vec!["start dictation".into(), "fast dictation".into()];
        assert_eq!(
            matches_final("start dictation", &phrases),
            Some("start dictation".into())
        );
        assert_eq!(
            matches_final("fast dictation", &phrases),
            Some("fast dictation".into())
        );
        assert_eq!(
            matches_final("fastdictation", &phrases),
            Some("fast dictation".into())
        );
        assert_eq!(
            matches_final("startsdictation", &phrases),
            Some("start dictation".into())
        );
    }

    #[test]
    fn wake_dedup_uses_phrase_not_text() {
        let phrases = vec!["start dictation".into()];
        let mut dedup = WakePhraseDedup::new();
        assert!(try_wake_from_text("startsdictation", &phrases, &mut dedup).is_some());
        assert!(try_wake_from_text("start dictation", &phrases, &mut dedup).is_none());
    }

    #[test]
    fn sanitize_keeps_chinese() {
        assert_eq!(sanitize_vosk_text("开始输入").as_deref(), Some("开始输入"));
    }
}
