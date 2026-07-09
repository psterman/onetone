//! Windows microphone enumeration, default-device switching, and level monitoring.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use crate::AppState;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

/// Wait after stopping capture before reopening (device switch / monitor restart).
pub const MIC_MONITOR_SETTLE_MS: u64 = 400;
/// Wait after stopping capture before a user-initiated refresh (Bluetooth needs longer).
pub const MIC_MANUAL_REFRESH_SETTLE_MS: u64 = 800;
/// COM / WASAPI one-shot operations (list, set default, peak meter).
pub const COM_OP_TIMEOUT_MS: u64 = 8000;
/// Background join observation for a stuck cpal/WASAPI monitor thread.
pub const MONITOR_JOIN_TIMEOUT_MS: u64 = 3000;
/// Default audio-stack cooldown after timeout or monitor failure.
pub const DEFAULT_AUDIO_BACKOFF_MS: u64 = 30_000;

#[derive(Debug, Clone, Default)]
pub struct RecordingAudioEndpointBackup {
    pub role: String,
    pub device_id: String,
    pub muted: bool,
    pub volume: f32,
}

#[derive(Debug, Clone, Default)]
pub struct RecordingAudioBackup {
    pub endpoints: Vec<RecordingAudioEndpointBackup>,
}

pub fn recording_audio_mute_active(state: &AppState) -> bool {
    state.recording_audio.lock().is_some()
}

pub fn sync_recording_audio_policy_now(state: &AppState) {
    #[cfg(windows)]
    {
        imp::sync_recording_audio_policy_now(state);
    }
    #[cfg(not(windows))]
    {
        let _ = state;
    }
}

pub fn request_recording_audio_policy_sync(state: Arc<AppState>) {
    #[cfg(windows)]
    {
        imp::request_recording_audio_policy_sync(state);
    }
    #[cfg(not(windows))]
    {
        let _ = state;
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicLevelSnapshot {
    pub level: u32,
    pub device_id: String,
}

pub struct AudioBackoffState {
    until: Mutex<Option<Instant>>,
}

impl AudioBackoffState {
    pub fn new() -> Self {
        Self {
            until: Mutex::new(None),
        }
    }

    pub fn is_active(&self) -> bool {
        self.remaining_ms() > 0
    }

    pub fn remaining_ms(&self) -> u64 {
        let guard = self.until.lock();
        guard
            .map(|until| until.saturating_duration_since(Instant::now()).as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn enter(&self, duration: Duration) {
        *self.until.lock() = Some(Instant::now() + duration);
    }

    pub fn clear(&self) {
        *self.until.lock() = None;
    }
}

pub struct MicLevelState {
    level: AtomicU32,
    device_id: Mutex<String>,
}

impl MicLevelState {
    pub fn new() -> Self {
        Self {
            level: AtomicU32::new(0),
            device_id: Mutex::new(String::new()),
        }
    }

    pub fn set(&self, device_id: &str, level: u32) {
        self.level.store(level, Ordering::Relaxed);
        *self.device_id.lock() = device_id.to_string();
    }

    pub fn snapshot(&self) -> MicLevelSnapshot {
        MicLevelSnapshot {
            level: self.level.load(Ordering::Relaxed),
            device_id: self.device_id.lock().clone(),
        }
    }

    pub fn clear(&self) {
        self.level.store(0, Ordering::Relaxed);
        self.device_id.lock().clear();
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_communications: bool,
    pub is_available: bool,
}

pub struct MicMonitorHandle {
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl MicMonitorHandle {
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            std::thread::Builder::new()
                .name("mic-monitor-join".into())
                .spawn(move || {
                    let (tx, rx) = mpsc::sync_channel(1);
                    std::thread::Builder::new()
                        .name("mic-monitor-join-wait".into())
                        .spawn(move || {
                            let _ = tx.send(handle.join());
                        })
                        .ok();
                    match rx.recv_timeout(Duration::from_millis(MONITOR_JOIN_TIMEOUT_MS)) {
                        Ok(Ok(())) => {}
                        Ok(Err(e)) => eprintln!("mic monitor join error: {e:?}"),
                        Err(_) => eprintln!(
                            "mic monitor: join timed out after {}ms (WASAPI/cpal thread may be stuck)",
                            MONITOR_JOIN_TIMEOUT_MS
                        ),
                    }
                })
                .ok();
        }
    }
}

/// Run a blocking audio/COM operation on a worker thread with a hard timeout.
pub fn run_with_timeout<T, F>(timeout: Duration, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("audio-op".into())
        .spawn(move || {
            let _ = tx.send(f());
        })
        .map_err(|e| format!("spawn audio op: {e}"))?;
    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(_) => Err(format!(
            "audio operation timed out after {}ms",
            timeout.as_millis()
        )),
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::policy_config::{IPolicyConfig, POLICY_CONFIG_CLIENT};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::SampleFormat;
    use std::sync::atomic::{AtomicU32, Ordering as AtomicOrdering};
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, eConsole, eMultimedia, eRender, ERole, IMMDevice,
        IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE, DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::StructuredStorage::PropVariantToStringAlloc;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
        STGM_READ,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, PROPERTYKEY};

    const PKEY_DEVICE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
        fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
        pid: 14,
    };

    pub fn list_input_devices() -> Result<Vec<MicDeviceInfo>, String> {
        unsafe {
            init_com_apartment()?;
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator: {e}"))?;
            let default_console = enumerator
                .GetDefaultAudioEndpoint(eCapture, eConsole)
                .ok()
                .and_then(|d| device_id(&d).ok());
            let default_comm = enumerator
                .GetDefaultAudioEndpoint(eCapture, eCommunications)
                .ok()
                .and_then(|d| device_id(&d).ok());

            let endpoint_mask = DEVICE_STATE_ACTIVE;
            let collection = enumerator
                .EnumAudioEndpoints(eCapture, endpoint_mask)
                .map_err(|e| format!("enum endpoints: {e}"))?;
            let count = collection.GetCount().map_err(|e| format!("count: {e}"))?;

            let mut out = Vec::new();
            for i in 0..count {
                let device = collection.Item(i).map_err(|e| format!("item {i}: {e}"))?;
                let id = device_id(&device)?;
                let name = device_friendly_name(&device).unwrap_or_else(|_| id.clone());
                let state = device.GetState().unwrap_or(DEVICE_STATE(0));
                let is_available = state.0 & DEVICE_STATE_ACTIVE.0 != 0;
                out.push(MicDeviceInfo {
                    is_default: default_console.as_ref() == Some(&id),
                    is_communications: default_comm.as_ref() == Some(&id),
                    is_available,
                    id,
                    name,
                });
            }
            Ok(out)
        }
    }

    pub fn set_default_input_device(device_id: &str) -> Result<(), String> {
        let device_id = device_id.trim();
        if device_id.is_empty() {
            return Err("device id is empty".into());
        }
        unsafe {
            init_com_apartment()?;
            let id = HSTRING::from(device_id);
            set_default_endpoint(&id, eConsole).map_err(|e| format!("set default console: {e}"))?;
            if let Err(err) = set_default_endpoint(&id, eCommunications) {
                eprintln!("set default communications (non-fatal): {err}");
            }
            Ok(())
        }
    }

    pub fn request_recording_audio_policy_sync(state: Arc<AppState>) {
        state
            .recording_audio_sync_pending
            .store(true, Ordering::Release);
        if state
            .recording_audio_sync_running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }

        let state2 = Arc::clone(&state);
        if let Err(err) = std::thread::Builder::new()
            .name("recording-audio-sync".into())
            .spawn(move || {
                loop {
                    state2
                        .recording_audio_sync_pending
                        .store(false, Ordering::Release);
                    sync_recording_audio_policy_now(state2.as_ref());
                    if !state2
                        .recording_audio_sync_pending
                        .swap(false, Ordering::AcqRel)
                    {
                        break;
                    }
                }
                state2
                    .recording_audio_sync_running
                    .store(false, Ordering::Release);
                if state2
                    .recording_audio_sync_pending
                    .swap(false, Ordering::AcqRel)
                    && state2
                        .recording_audio_sync_running
                        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                        .is_ok()
                {
                    request_recording_audio_policy_sync(state2);
                }
            })
        {
            state
                .recording_audio_sync_running
                .store(false, Ordering::Release);
            eprintln!("recording audio sync spawn failed: {err}");
            sync_recording_audio_policy_now(state.as_ref());
        }
    }

    pub fn sync_recording_audio_policy_now(state: &AppState) {
        let (enabled, strength, active) = {
            let cfg = state.cfg.lock();
            (
                cfg.sounds.recording_mute_enabled,
                cfg.sounds.recording_mute_strength.clone(),
                state.voice_sapi.lock().is_some() || state.voice_vosk.lock().is_some(),
            )
        };
        let result = if enabled && active {
            apply_recording_audio_mute(state, &strength)
        } else {
            restore_recording_audio(state)
        };
        if let Err(err) = result {
            eprintln!("recording audio policy sync failed: {err}");
        }
    }

    fn apply_recording_audio_mute(state: &AppState, strength: &str) -> Result<(), String> {
        let target_scale = recording_audio_target_scale(strength);
        let mut guard = state.recording_audio.lock();
        if let Some(snapshot) = guard.as_ref() {
            apply_recording_audio_snapshot(snapshot, target_scale)?;
            return Ok(());
        }

        let mut snapshot = RecordingAudioBackup::default();
        for role in recording_audio_roles() {
            if let Some(endpoint) = capture_render_endpoint(role)? {
                snapshot.endpoints.push(endpoint);
            }
        }
        if snapshot.endpoints.is_empty() {
            return Err("no render endpoints found".into());
        }
        apply_recording_audio_snapshot(&snapshot, target_scale)?;
        *guard = Some(snapshot);
        Ok(())
    }

    fn restore_recording_audio(state: &AppState) -> Result<(), String> {
        let mut guard = state.recording_audio.lock();
        let Some(snapshot) = guard.take() else {
            return Ok(());
        };
        let result = restore_recording_audio_snapshot(&snapshot);
        if result.is_err() {
            *guard = Some(snapshot);
        }
        result
    }

    fn apply_recording_audio_snapshot(
        snapshot: &RecordingAudioBackup,
        target_scale: f32,
    ) -> Result<(), String> {
        let mut errors = Vec::new();
        for endpoint in &snapshot.endpoints {
            if let Err(err) = apply_recording_audio_endpoint(endpoint, target_scale) {
                errors.push(format!("{}: {err}", endpoint.role));
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    fn restore_recording_audio_snapshot(snapshot: &RecordingAudioBackup) -> Result<(), String> {
        let mut errors = Vec::new();
        for endpoint in &snapshot.endpoints {
            if let Err(err) = restore_recording_audio_endpoint(endpoint) {
                errors.push(format!("{}: {err}", endpoint.role));
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    fn recording_audio_roles() -> [ERole; 3] {
        [eConsole, eMultimedia, eCommunications]
    }

    fn recording_audio_target_scale(strength: &str) -> f32 {
        match strength.trim() {
            "light" => 0.7,
            "balanced" => 0.45,
            "strong" => 0.15,
            "mute" => 0.0,
            _ => 0.45,
        }
    }

    fn role_name(role: ERole) -> &'static str {
        match role {
            r if r == eConsole => "console",
            r if r == eMultimedia => "multimedia",
            r if r == eCommunications => "communications",
            _ => "unknown",
        }
    }

    fn role_from_name(role: &str) -> Option<ERole> {
        match role.trim() {
            "console" => Some(eConsole),
            "multimedia" => Some(eMultimedia),
            "communications" => Some(eCommunications),
            _ => None,
        }
    }

    fn capture_render_endpoint(
        role: ERole,
    ) -> Result<Option<RecordingAudioEndpointBackup>, String> {
        unsafe {
            init_com_apartment()?;
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator: {e}"))?;
            let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, role) else {
                return Ok(None);
            };
            let endpoint: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("activate endpoint volume: {e}"))?;
            let id = device_id(&device)?;
            let muted = endpoint
                .GetMute()
                .map_err(|e| format!("endpoint mute: {e}"))?
                .as_bool();
            let volume = endpoint
                .GetMasterVolumeLevelScalar()
                .map_err(|e| format!("endpoint volume: {e}"))?;
            Ok(Some(RecordingAudioEndpointBackup {
                role: role_name(role).to_string(),
                device_id: id,
                muted,
                volume,
            }))
        }
    }

    fn apply_recording_audio_endpoint(
        endpoint: &RecordingAudioEndpointBackup,
        target_scale: f32,
    ) -> Result<(), String> {
        let Some(role) = role_from_name(&endpoint.role) else {
            return Ok(());
        };
        unsafe {
            init_com_apartment()?;
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, role)
                .map_err(|e| format!("default endpoint: {e}"))?;
            let id = device_id(&device)?;
            if id != endpoint.device_id {
                return Ok(());
            }
            let volume: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("activate endpoint volume: {e}"))?;
            if endpoint.muted {
                volume
                    .SetMute(true, core::ptr::null())
                    .map_err(|e| format!("set mute: {e}"))?;
                return Ok(());
            }
            if target_scale <= 0.0 {
                volume
                    .SetMute(true, core::ptr::null())
                    .map_err(|e| format!("set mute: {e}"))?;
            } else {
                let scale = (endpoint.volume * target_scale).clamp(0.0, 1.0);
                volume
                    .SetMute(false, core::ptr::null())
                    .map_err(|e| format!("clear mute: {e}"))?;
                volume
                    .SetMasterVolumeLevelScalar(scale, core::ptr::null())
                    .map_err(|e| format!("set volume: {e}"))?;
            }
            Ok(())
        }
    }

    fn restore_recording_audio_endpoint(
        endpoint: &RecordingAudioEndpointBackup,
    ) -> Result<(), String> {
        let Some(role) = role_from_name(&endpoint.role) else {
            return Ok(());
        };
        unsafe {
            init_com_apartment()?;
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, role)
                .map_err(|e| format!("default endpoint: {e}"))?;
            let id = device_id(&device)?;
            if id != endpoint.device_id {
                return Ok(());
            }
            let volume: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("activate endpoint volume: {e}"))?;
            volume
                .SetMasterVolumeLevelScalar(endpoint.volume.clamp(0.0, 1.0), core::ptr::null())
                .map_err(|e| format!("restore volume: {e}"))?;
            volume
                .SetMute(endpoint.muted, core::ptr::null())
                .map_err(|e| format!("restore mute: {e}"))?;
            Ok(())
        }
    }

    pub fn start_mic_monitor(
        app: AppHandle,
        window: WebviewWindow,
        device_id: Option<String>,
        slot: &Mutex<Option<MicMonitorHandle>>,
        level_state: &Arc<MicLevelState>,
    ) -> Result<(), String> {
        super::stop_mic_monitor(slot);
        level_state.clear();

        let devices = list_input_devices()?;
        let target = if let Some(ref id) = device_id {
            let id = id.trim();
            if id.is_empty() {
                return Err("device id is empty".into());
            }
            devices
                .iter()
                .find(|d| d.id == id)
                .cloned()
                .ok_or_else(|| format!("device not found: {id}"))?
        } else {
            devices
                .iter()
                .find(|d| d.is_default && d.is_available)
                .cloned()
                .or_else(|| devices.iter().find(|d| d.is_available).cloned())
                .ok_or_else(|| "no input devices".to_string())?
        };

        if !target.is_available {
            return Err(format!("microphone unavailable: {}", target.name));
        }

        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let device_name = target.name.clone();
        let device_id_out = target.id.clone();
        let level_state = level_state.clone();
        let app_monitor = app.clone();
        let app_err = app.clone();
        let device_id_err = device_id_out.clone();

        let handle = thread::spawn(move || {
            if let Err(err) = run_cpal_monitor(
                app_monitor,
                window,
                device_name,
                device_id_out,
                stop_thread,
                level_state,
            ) {
                eprintln!("mic monitor: {err}");
                emit_mic_monitor_error(
                    &app_err,
                    &device_id_err,
                    &err,
                    Some(DEFAULT_AUDIO_BACKOFF_MS),
                );
            }
        });

        *slot.lock() = Some(MicMonitorHandle {
            stop,
            thread: Some(handle),
        });
        Ok(())
    }

    fn run_cpal_monitor(
        app: AppHandle,
        _window: WebviewWindow,
        device_name: String,
        device_id: String,
        stop: Arc<AtomicBool>,
        level_state: Arc<MicLevelState>,
    ) -> Result<(), String> {
        let host = cpal::default_host();
        let device = resolve_cpal_input(&host, &device_name)?;
        let supported = device
            .default_input_config()
            .map_err(|e| format!("input config: {e}"))?;
        let sample_format = supported.sample_format();
        let config: cpal::StreamConfig = supported.into();
        let channels = config.channels as usize;

        let peak_bits = Arc::new(AtomicU32::new(0));
        let peak_cb = peak_bits.clone();
        let app_err = app.clone();
        let device_id_err = device_id.clone();
        let err_fn = move |err: cpal::StreamError| {
            eprintln!("cpal stream error: {err}");
            emit_mic_monitor_error(
                &app_err,
                &device_id_err,
                &err.to_string(),
                Some(DEFAULT_AUDIO_BACKOFF_MS),
            );
        };

        let stream = match sample_format {
            SampleFormat::F32 => device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    store_peak_bits(peak_from_f32(data, channels), &peak_cb);
                },
                err_fn,
                None,
            ),
            SampleFormat::I16 => device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    store_peak_bits(peak_from_i16(data, channels), &peak_cb);
                },
                err_fn,
                None,
            ),
            SampleFormat::U16 => device.build_input_stream(
                &config,
                move |data: &[u16], _| {
                    store_peak_bits(peak_from_u16(data, channels), &peak_cb);
                },
                err_fn,
                None,
            ),
            SampleFormat::I32 => device.build_input_stream(
                &config,
                move |data: &[i32], _| {
                    store_peak_bits(peak_from_i32(data, channels), &peak_cb);
                },
                err_fn,
                None,
            ),
            other => {
                return Err(format!("unsupported sample format: {other:?}"));
            }
        }
        .map_err(|e| format!("build stream: {e}"))?;

        stream.play().map_err(|e| format!("play stream: {e}"))?;

        let mut last_emit = Instant::now();
        let mut peak_hold = 0.0f32;
        while !stop.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(30));
            let sample_peak = peak_bits.swap(0, AtomicOrdering::Relaxed) as f32 / 1_000_000.0;
            if sample_peak > 0.0 {
                peak_hold = peak_hold.max(sample_peak);
            }
            if last_emit.elapsed() < Duration::from_millis(80) {
                continue;
            }
            last_emit = Instant::now();
            let level = ((peak_hold * 8.0).min(1.0) * 100.0).round() as u32;
            peak_hold *= 0.45;
            level_state.set(&device_id, level);
            emit_mic_level(&app, &device_id, level);
        }

        drop(stream);
        Ok(())
    }

    fn store_peak_bits(peak: f32, slot: &AtomicU32) {
        if peak <= 0.0 {
            return;
        }
        let micro = (peak * 1_000_000.0).clamp(0.0, 1_000_000.0) as u32;
        slot.fetch_max(micro, AtomicOrdering::Relaxed);
    }

    fn peak_from_f32(data: &[f32], channels: usize) -> f32 {
        if data.is_empty() {
            return 0.0;
        }
        let step = channels.max(1);
        let frames = data.len() / step;
        let mut peak = 0.0f32;
        for i in 0..frames {
            let mut frame_peak = 0.0f32;
            for c in 0..step {
                frame_peak = frame_peak.max(data[i * step + c].abs());
            }
            peak = peak.max(frame_peak);
        }
        peak
    }

    fn peak_from_i16(data: &[i16], channels: usize) -> f32 {
        if data.is_empty() {
            return 0.0;
        }
        let step = channels.max(1);
        let frames = data.len() / step;
        let mut peak = 0.0f32;
        for i in 0..frames {
            let mut frame_peak = 0.0f32;
            for c in 0..step {
                frame_peak =
                    frame_peak.max((f32::from(data[i * step + c]) / i16::MAX as f32).abs());
            }
            peak = peak.max(frame_peak);
        }
        peak
    }

    fn peak_from_u16(data: &[u16], channels: usize) -> f32 {
        if data.is_empty() {
            return 0.0;
        }
        let step = channels.max(1);
        let frames = data.len() / step;
        let mut peak = 0.0f32;
        for i in 0..frames {
            let mut frame_peak = 0.0f32;
            for c in 0..step {
                frame_peak =
                    frame_peak.max((f32::from(data[i * step + c]) / u16::MAX as f32).abs());
            }
            peak = peak.max(frame_peak);
        }
        peak
    }

    fn peak_from_i32(data: &[i32], channels: usize) -> f32 {
        if data.is_empty() {
            return 0.0;
        }
        let step = channels.max(1);
        let frames = data.len() / step;
        let mut peak = 0.0f32;
        for i in 0..frames {
            let mut frame_peak = 0.0f32;
            for c in 0..step {
                frame_peak = frame_peak.max((data[i * step + c] as f32 / i32::MAX as f32).abs());
            }
            peak = peak.max(frame_peak);
        }
        peak
    }

    fn emit_mic_level(app: &AppHandle, device_id: &str, level: u32) {
        let payload = serde_json::json!({
            "type": "mic_level",
            "level": level,
            "deviceId": device_id,
        });
        let _ = app.emit("to_js", &payload);
    }

    pub fn emit_mic_monitor_error(
        app: &AppHandle,
        device_id: &str,
        message: &str,
        retry_after_ms: Option<u64>,
    ) {
        let mut payload = serde_json::json!({
            "type": "mic_monitor_error",
            "deviceId": device_id,
            "message": message,
        });
        if let Some(ms) = retry_after_ms {
            payload["retryAfterMs"] = serde_json::json!(ms);
        }
        let _ = app.emit("to_js", &payload);
    }

    fn resolve_cpal_input(host: &cpal::Host, device_name: &str) -> Result<cpal::Device, String> {
        if let Some(default) = host.default_input_device() {
            if default
                .name()
                .map(|n| names_match(&n, device_name))
                .unwrap_or(false)
            {
                return Ok(default);
            }
            // Default endpoint was switched via WASAPI; cpal default should follow.
            return Ok(default);
        }
        find_cpal_input_by_name(host, device_name)
    }

    fn find_cpal_input_by_name(
        host: &cpal::Host,
        device_name: &str,
    ) -> Result<cpal::Device, String> {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| {
                d.name()
                    .map(|n| names_match(&n, device_name))
                    .unwrap_or(false)
            })
            .ok_or_else(|| format!("cpal device not found: {device_name}"))
    }

    fn names_match(a: &str, b: &str) -> bool {
        let na = normalize_name(a);
        let nb = normalize_name(b);
        na == nb || na.contains(&nb) || nb.contains(&na)
    }

    fn normalize_name(name: &str) -> String {
        name.to_lowercase()
            .chars()
            .filter(|c| c.is_alphanumeric())
            .collect()
    }

    unsafe fn init_com_apartment() -> Result<(), String> {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if hr.is_ok() || hr == windows::core::HRESULT(0x00000001) {
            return Ok(());
        }
        if hr == windows::core::HRESULT(0x80010106u32 as i32) {
            return Ok(());
        }
        Err(format!("CoInitializeEx: {hr}"))
    }

    unsafe fn device_id(device: &IMMDevice) -> Result<String, String> {
        let raw = device.GetId().map_err(|e| e.to_string())?;
        Ok(raw.to_string().map_err(|e| e.to_string())?)
    }

    unsafe fn device_friendly_name(device: &IMMDevice) -> Result<String, String> {
        let store: IPropertyStore = device
            .OpenPropertyStore(STGM_READ)
            .map_err(|e| e.to_string())?;
        let prop = store
            .GetValue(&PKEY_DEVICE_FRIENDLY_NAME)
            .map_err(|e| e.to_string())?;
        let wide = PropVariantToStringAlloc(&prop).map_err(|e| e.to_string())?;
        let name = wide.to_string().map_err(|e| e.to_string())?;
        let _ = CoTaskMemFree(Some(wide.0 as _));
        Ok(name)
    }

    unsafe fn set_default_endpoint(device_id: &HSTRING, role: ERole) -> Result<(), String> {
        let policy: IPolicyConfig =
            CoCreateInstance(&POLICY_CONFIG_CLIENT, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
        policy
            .SetDefaultEndpoint(PCWSTR(device_id.as_ptr()), role)
            .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
pub use imp::{
    emit_mic_monitor_error, list_input_devices, set_default_input_device, start_mic_monitor,
};

#[cfg(not(windows))]
pub fn emit_mic_monitor_error(
    _app: &AppHandle,
    _device_id: &str,
    _message: &str,
    _retry_after_ms: Option<u64>,
) {
}

pub fn stop_mic_monitor(slot: &Mutex<Option<MicMonitorHandle>>) {
    if let Some(handle) = slot.lock().take() {
        handle.stop();
    }
}

#[cfg(not(windows))]
pub fn list_input_devices() -> Result<Vec<MicDeviceInfo>, String> {
    Ok(vec![])
}

#[cfg(not(windows))]
pub fn set_default_input_device(_device_id: &str) -> Result<(), String> {
    Err("microphone control is Windows-only".into())
}

#[cfg(not(windows))]
pub fn start_mic_monitor(
    _app: AppHandle,
    _window: WebviewWindow,
    _device_id: Option<String>,
    _slot: &Mutex<Option<MicMonitorHandle>>,
    _level_state: &Arc<MicLevelState>,
) -> Result<(), String> {
    Err("microphone monitor is Windows-only".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    #[ignore = "requires audio hardware"]
    fn list_input_devices_returns_ok() {
        let devices = super::list_input_devices().expect("list_input_devices");
        eprintln!("mic devices: {devices:?}");
        assert!(!devices.is_empty());
    }

    #[test]
    #[ignore = "requires audio hardware"]
    fn set_default_input_device_switches_non_default() {
        let devices = super::list_input_devices().expect("list");
        let original = devices
            .iter()
            .find(|d| d.is_default)
            .or_else(|| devices.first())
            .expect("need a device");
        let target = devices
            .iter()
            .find(|d| d.id != original.id)
            .expect("need a second device");

        super::set_default_input_device(&target.id).expect("set_default");
        let after = super::list_input_devices().expect("list after");
        let switched = after.iter().any(|d| d.id == target.id && d.is_default);
        assert!(switched, "default did not change to {}", target.id);

        super::set_default_input_device(&original.id).expect("restore default");
    }

    #[test]
    #[ignore = "requires audio hardware"]
    fn cpal_default_input_reports_format() {
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .expect("default input device required");
        let name = device.name().unwrap_or_default();
        let cfg = device.default_input_config().expect("default input config");
        eprintln!("cpal default: {name} format={:?}", cfg.sample_format());
    }
}
