//! Windows microphone enumeration, default-device switching, and level monitoring.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicLevelSnapshot {
    pub level: u32,
    pub device_id: String,
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
                    let _ = handle.join();
                })
                .ok();
        }
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
    use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, eConsole, ERole, IMMDevice, IMMDeviceEnumerator,
        MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
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

            let collection = enumerator
                .EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
                .map_err(|e| format!("enum endpoints: {e}"))?;
            let count = collection.GetCount().map_err(|e| format!("count: {e}"))?;

            let mut out = Vec::new();
            for i in 0..count {
                let device = collection.Item(i).map_err(|e| format!("item {i}: {e}"))?;
                let id = device_id(&device)?;
                let name = device_friendly_name(&device).unwrap_or_else(|_| id.clone());
                out.push(MicDeviceInfo {
                    is_default: default_console.as_ref() == Some(&id),
                    is_communications: default_comm.as_ref() == Some(&id),
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
                .find(|d| d.is_default)
                .cloned()
                .or_else(|| devices.first().cloned())
                .ok_or_else(|| "no input devices".to_string())?
        };

        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let device_name = target.name.clone();
        let device_id_out = target.id.clone();
        let level_state = level_state.clone();

        let handle = thread::spawn(move || {
            if let Err(err) = run_cpal_monitor(
                app,
                window,
                device_name,
                device_id_out,
                stop_thread,
                level_state,
            ) {
                eprintln!("mic monitor: {err}");
            }
        });

        *slot.lock() = Some(MicMonitorHandle {
            stop,
            thread: Some(handle),
        });
        Ok(())
    }

    pub fn read_mic_peak_level(device_id_hint: Option<&str>) -> Result<MicLevelSnapshot, String> {
        unsafe {
            init_com_apartment()?;
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("enumerator: {e}"))?;
            let device = resolve_meter_device(&enumerator, device_id_hint)?;
            let id = device_id(&device)?;
            let meter: IAudioMeterInformation = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("activate meter: {e}"))?;
            let peak = meter
                .GetPeakValue()
                .map_err(|e| format!("peak value: {e}"))?;
            Ok(MicLevelSnapshot {
                level: peak_to_level(peak),
                device_id: id,
            })
        }
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
        let err_fn = |err| eprintln!("cpal stream error: {err}");

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

    fn peak_to_level(peak: f32) -> u32 {
        let shaped = peak.clamp(0.0, 1.0).sqrt();
        (shaped * 100.0).round() as u32
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

    unsafe fn resolve_meter_device(
        enumerator: &IMMDeviceEnumerator,
        device_id_hint: Option<&str>,
    ) -> Result<IMMDevice, String> {
        if let Some(id) = device_id_hint.map(str::trim).filter(|id| !id.is_empty()) {
            let id = HSTRING::from(id);
            if let Ok(device) = enumerator.GetDevice(&id) {
                return Ok(device);
            }
        }
        enumerator
            .GetDefaultAudioEndpoint(eCapture, eConsole)
            .map_err(|e| format!("default endpoint: {e}"))
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
    list_input_devices, read_mic_peak_level, set_default_input_device, start_mic_monitor,
};

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

#[cfg(not(windows))]
pub fn read_mic_peak_level(_device_id: Option<&str>) -> Result<MicLevelSnapshot, String> {
    Err("microphone peak meter is Windows-only".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn list_input_devices_returns_ok() {
        let devices = super::list_input_devices().expect("list_input_devices");
        eprintln!("mic devices: {devices:?}");
        assert!(!devices.is_empty());
    }

    #[test]
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
