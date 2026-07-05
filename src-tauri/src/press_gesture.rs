use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use crate::config::{MappingEntry, TriggerMode, VoiceConfig};
use crate::gesture_timing::{self, clamp_double_click_ms, clamp_long_press_ms};

pub const DEVICE_PREFIX: &str = "dev:";
pub const DEVICE_SEP: &str = "::";

/// 录制时检测到的按键手势。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordedGesture {
    Tap,
    LongPress,
    Double,
}

impl RecordedGesture {
    pub fn to_trigger_mode(self) -> TriggerMode {
        match self {
            RecordedGesture::Tap => TriggerMode::Tap,
            RecordedGesture::LongPress => TriggerMode::LongPress,
            RecordedGesture::Double => TriggerMode::Double,
        }
    }

    pub fn source_mode_id(self) -> &'static str {
        match self {
            RecordedGesture::Tap => "single_press",
            RecordedGesture::LongPress => "long_press",
            RecordedGesture::Double => "double_click",
        }
    }
}

const RECORD_LONG_PRESS_MS: u64 = gesture_timing::RECORD_LONG_PRESS_MS;
const RECORD_DOUBLE_MS: u64 = gesture_timing::RECORD_DOUBLE_MS;

#[derive(Debug, Clone)]
pub struct RecordGestureComplete {
    pub key: String,
    pub device: Option<String>,
    pub gesture: RecordedGesture,
}

#[derive(Debug, Clone)]
pub enum RecordGestureHint {
    Holding { key: String },
    WaitingDouble { key: String },
}

/// 录制启动键时识别单击 / 长按 / 双击。
pub struct RecordGestureDetector {
    active_key: Option<String>,
    active_device: Option<String>,
    press_started: Option<Instant>,
    first_release_at: Option<Instant>,
}

impl RecordGestureDetector {
    pub fn new() -> Self {
        Self {
            active_key: None,
            active_device: None,
            press_started: None,
            first_release_at: None,
        }
    }

    pub fn reset(&mut self) {
        *self = Self::new();
    }

    fn same_slot(&self, key: &str, device: Option<&str>) -> bool {
        self.active_key.as_deref() == Some(key) && self.active_device.as_deref() == device
    }

    fn store_slot(&mut self, key: &str, device: Option<&str>) {
        self.active_key = Some(key.to_string());
        self.active_device = device.map(str::to_string);
    }

    pub fn on_keydown(
        &mut self,
        key: &str,
        device: Option<&str>,
        now: Instant,
    ) -> Result<Option<RecordGestureComplete>, RecordGestureHint> {
        if self.first_release_at.is_some() && self.same_slot(key, device) {
            let complete = RecordGestureComplete {
                key: key.to_string(),
                device: device.map(str::to_string),
                gesture: RecordedGesture::Double,
            };
            self.reset();
            return Ok(Some(complete));
        }
        if self.press_started.is_some() {
            return Err(RecordGestureHint::Holding {
                key: key.to_string(),
            });
        }
        self.store_slot(key, device);
        self.press_started = Some(now);
        self.first_release_at = None;
        Err(RecordGestureHint::Holding {
            key: key.to_string(),
        })
    }

    pub fn on_keyup(
        &mut self,
        key: &str,
        device: Option<&str>,
        now: Instant,
    ) -> Result<Option<RecordGestureComplete>, RecordGestureHint> {
        if !self.same_slot(key, device) {
            return Ok(None);
        }
        let Some(started) = self.press_started else {
            return Ok(None);
        };
        let held_ms = now.duration_since(started).as_millis() as u64;
        if held_ms >= RECORD_LONG_PRESS_MS {
            let complete = RecordGestureComplete {
                key: key.to_string(),
                device: device.map(str::to_string),
                gesture: RecordedGesture::LongPress,
            };
            self.reset();
            return Ok(Some(complete));
        }
        let complete = RecordGestureComplete {
            key: key.to_string(),
            device: device.map(str::to_string),
            gesture: RecordedGesture::Tap,
        };
        self.reset();
        Ok(Some(complete))
    }

    pub fn poll(&mut self, now: Instant) -> Option<RecordGestureComplete> {
        if let Some(started) = self.press_started {
            if now.duration_since(started) >= Duration::from_millis(RECORD_LONG_PRESS_MS) {
                let complete = RecordGestureComplete {
                    key: self.active_key.clone().unwrap_or_default(),
                    device: self.active_device.clone(),
                    gesture: RecordedGesture::LongPress,
                };
                self.reset();
                return Some(complete);
            }
        }
        if let Some(released) = self.first_release_at {
            if now.duration_since(released) > Duration::from_millis(RECORD_DOUBLE_MS) {
                let complete = RecordGestureComplete {
                    key: self.active_key.clone().unwrap_or_default(),
                    device: self.active_device.clone(),
                    gesture: RecordedGesture::Tap,
                };
                self.reset();
                return Some(complete);
            }
        }
        None
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PhysicalKeyEvent {
    pub is_keyup: bool,
    pub device: Option<String>,
    pub key: String,
}

impl PhysicalKeyEvent {
    pub fn lookup_key(&self) -> String {
        format!("{}|{}", self.device.as_deref().unwrap_or(""), self.key)
    }

    pub fn dispatch_name(&self) -> String {
        match &self.device {
            Some(dev) if !dev.is_empty() => format!("{DEVICE_PREFIX}{dev}{DEVICE_SEP}{}", self.key),
            _ => self.key.clone(),
        }
    }
}

pub fn parse_physical_event(raw: &str) -> PhysicalKeyEvent {
    let (is_keyup, body) = if let Some(rest) = raw.strip_prefix("keyup:") {
        (true, rest)
    } else {
        (false, raw)
    };
    if let Some(rest) = body.strip_prefix(DEVICE_PREFIX) {
        if let Some((dev, key)) = rest.split_once(DEVICE_SEP) {
            return PhysicalKeyEvent {
                is_keyup,
                device: Some(dev.to_string()),
                key: key.to_string(),
            };
        }
    }
    PhysicalKeyEvent {
        is_keyup,
        device: None,
        key: body.to_string(),
    }
}

pub fn format_device_key(device: &str, key: &str) -> String {
    if device.trim().is_empty() {
        key.to_string()
    } else {
        format!("{DEVICE_PREFIX}{device}{DEVICE_SEP}{key}")
    }
}

pub fn devices_match(stored: &str, incoming: &str) -> bool {
    crate::device_identity::devices_match(stored, incoming)
}

/// Resolve a physical binding against an active hotkey registration list.
pub fn resolve_binding_in_list(
    bindings: &[String],
    name: &str,
    device: Option<&str>,
) -> Option<String> {
    let body = format_device_key(device.unwrap_or(""), name);
    if bindings.iter().any(|b| b == &body) {
        return Some(body);
    }
    let has_device = !device.unwrap_or("").trim().is_empty();
    if has_device && is_extension_binding_key(name) {
        return None;
    }
    let chord = crate::key_chord::build_pressed_chord(name);
    if bindings.iter().any(|b| b == &chord) {
        return Some(chord);
    }
    if bindings.iter().any(|b| b == name) {
        return Some(name.to_string());
    }
    None
}

fn is_extension_binding_key(name: &str) -> bool {
    name.starts_with("Gamepad_") || name.starts_with("HID_")
}

pub fn short_device_label(device: &str) -> String {
    let device = device.trim();
    if device.is_empty() {
        return String::new();
    }
    if device.contains("BTHENUM") || device.contains("BTHLE") {
        if let Some(idx) = device.rfind('#') {
            let tail = &device[idx + 1..];
            if let Some(end) = tail.find('{') {
                let name = tail[..end].trim_end_matches('&');
                if !name.is_empty() {
                    return format!("蓝牙 · {name}");
                }
            }
        }
        return "蓝牙设备".into();
    }
    if device.contains("HID#") || device.starts_with("dev:") {
        if let Some((vid, pid)) = crate::device_identity::parse_vid_pid(device) {
            return format!("{vid:04X}:{pid:04X}");
        }
        if let Some(stable) = device.strip_prefix("dev:") {
            return stable.to_string();
        }
        if let Some(start) = device.find("HID#") {
            let rest = &device[start + 4..];
            if let Some(end) = rest.find('#') {
                let seg = &rest[..end];
                let parts: Vec<&str> = seg.split('&').collect();
                if parts.len() >= 2 {
                    return format!("{} & {}", parts[0], parts[1]);
                }
            }
        }
    }
    if device.len() > 48 {
        format!("{}…", &device[device.len() - 48..])
    } else {
        device.to_string()
    }
}

struct PendingLong {
    started: Instant,
    threshold_ms: u32,
    dispatch_key: String,
}

struct PendingDouble {
    first_at: Instant,
    window_ms: u32,
    dispatch_key: String,
}

pub struct GestureTracker {
    long_press: HashMap<String, PendingLong>,
    long_fired: HashSet<String>,
    double_wait: HashMap<String, PendingDouble>,
}

impl GestureTracker {
    pub fn new() -> Self {
        Self {
            long_press: HashMap::new(),
            long_fired: HashSet::new(),
            double_wait: HashMap::new(),
        }
    }

    pub fn reset(&mut self) {
        self.long_press.clear();
        self.long_fired.clear();
        self.double_wait.clear();
    }

    pub fn on_keyup(&mut self, event: &PhysicalKeyEvent) {
        let lk = event.lookup_key();
        if self.long_fired.remove(&lk) {
            return;
        }
        self.long_press.remove(&lk);
    }

    pub fn on_keydown(
        &mut self,
        event: &PhysicalKeyEvent,
        mapping: &MappingEntry,
        now: Instant,
    ) -> Option<String> {
        let lk = event.lookup_key();
        let dispatch = event.dispatch_name();
        match mapping.trigger_mode {
            TriggerMode::LongPress => {
                let threshold = clamp_long_press_ms(mapping.long_press_ms);
                self.long_press.insert(
                    lk,
                    PendingLong {
                        started: now,
                        threshold_ms: threshold,
                        dispatch_key: dispatch,
                    },
                );
                None
            }
            TriggerMode::Double => {
                if let Some(pending) = self.double_wait.get(&lk) {
                    let window = pending.window_ms as u64;
                    if now.duration_since(pending.first_at) <= Duration::from_millis(window) {
                        let dispatch = pending.dispatch_key.clone();
                        self.double_wait.remove(&lk);
                        return Some(dispatch);
                    }
                }
                let window = clamp_double_click_ms(mapping.double_click_ms);
                self.double_wait.insert(
                    lk,
                    PendingDouble {
                        first_at: now,
                        window_ms: window,
                        dispatch_key: dispatch,
                    },
                );
                None
            }
            _ => Some(dispatch),
        }
    }

    pub fn poll_long_press(&mut self, _cfg: &VoiceConfig, now: Instant) -> Vec<String> {
        let mut fired = Vec::new();
        let mut done = Vec::new();
        for (lk, pending) in &self.long_press {
            if now.duration_since(pending.started)
                >= Duration::from_millis(pending.threshold_ms as u64)
            {
                fired.push(pending.dispatch_key.clone());
                done.push(lk.clone());
            }
        }
        for lk in done {
            self.long_press.remove(&lk);
            self.long_fired.insert(lk);
        }
        fired
    }

    pub fn expire_double_waits(&mut self, now: Instant) {
        self.double_wait.retain(|_, pending| {
            now.duration_since(pending.first_at)
                <= Duration::from_millis(pending.window_ms as u64 + 50)
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_short_press_completes_on_keyup() {
        let mut detector = RecordGestureDetector::new();
        let start = Instant::now();

        assert!(matches!(
            detector.on_keydown("RAlt", None, start),
            Err(RecordGestureHint::Holding { .. })
        ));

        let complete = detector
            .on_keyup("RAlt", None, start + Duration::from_millis(80))
            .expect("keyup should not be a hint")
            .expect("short press should complete");

        assert_eq!(complete.key, "RAlt");
        assert_eq!(complete.gesture, RecordedGesture::Tap);
    }

    #[test]
    fn resolve_binding_prefers_device_prefixed_key() {
        let bindings = vec!["dev:xinput:0::Gamepad_A".into()];
        let resolved = resolve_binding_in_list(&bindings, "Gamepad_A", Some("xinput:0"));
        assert_eq!(resolved.as_deref(), Some("dev:xinput:0::Gamepad_A"));
    }

    #[test]
    fn resolve_binding_blocks_bare_key_when_device_present() {
        let bindings = vec!["Gamepad_A".into()];
        let resolved = resolve_binding_in_list(&bindings, "Gamepad_A", Some("xinput:0"));
        assert!(resolved.is_none());
    }

    #[test]
    fn format_device_key_roundtrip() {
        let wire = format_device_key("xinput:0", "Gamepad_A");
        assert_eq!(wire, "dev:xinput:0::Gamepad_A");
        let event = parse_physical_event(&wire);
        assert_eq!(event.key, "Gamepad_A");
        assert_eq!(event.device.as_deref(), Some("xinput:0"));
    }
}
