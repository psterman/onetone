use std::collections::HashMap;
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
    if bindings
        .iter()
        .any(|b| crate::key_chord::chords_equivalent(b, &chord))
    {
        return Some(chord);
    }
    if bindings.iter().any(|b| b == name) {
        if crate::key_chord::chords_equivalent(name, &chord) {
            return Some(name.to_string());
        }
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
    // lookup_key -> dispatch_key (used to support "hold-to-talk": keyup should also dispatch)
    long_fired: HashMap<String, String>,
    double_wait: HashMap<String, PendingDouble>,
}

impl GestureTracker {
    pub fn new() -> Self {
        Self {
            long_press: HashMap::new(),
            long_fired: HashMap::new(),
            double_wait: HashMap::new(),
        }
    }

    pub fn reset(&mut self) {
        self.long_press.clear();
        self.long_fired.clear();
        self.double_wait.clear();
    }

    // Returns Some(dispatch_key) when this keyup should also dispatch an action.
    pub fn on_keyup(&mut self, event: &PhysicalKeyEvent) -> Option<String> {
        let lk = event.lookup_key();
        if let Some(dispatch_key) = self.long_fired.remove(&lk) {
            // For LongPress mode we treat keyup as "end" signal.
            return Some(dispatch_key);
        }
        self.long_press.remove(&lk);
        None
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
        let mut fired_keys: Vec<(String, String)> = Vec::new(); // (lookup_key, dispatch_key)
        for (lk, pending) in &self.long_press {
            if now.duration_since(pending.started)
                >= Duration::from_millis(pending.threshold_ms as u64)
            {
                fired_keys.push((lk.clone(), pending.dispatch_key.clone()));
            }
        }
        let fired: Vec<String> = fired_keys.iter().map(|(_, dk)| dk.clone()).collect();
        for (lk, dispatch_key) in fired_keys {
            self.long_press.remove(&lk);
            // Key released after a successful long-press should dispatch again (stop dictation).
            self.long_fired.insert(lk, dispatch_key);
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

pub const TRIGGER_COMPAT_PULSE_MS: u64 = 1500;
pub const TRIGGER_COMPAT_TOTAL_MS: u64 = 8000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerCompatVerdict {
    HoldCapable,
    PulseOnly,
    Unrecognized,
}

impl TriggerCompatVerdict {
    pub fn as_str(self) -> &'static str {
        match self {
            TriggerCompatVerdict::HoldCapable => "hold_capable",
            TriggerCompatVerdict::PulseOnly => "pulse_only",
            TriggerCompatVerdict::Unrecognized => "unrecognized",
        }
    }

    pub fn recommended_mode(self) -> Option<&'static str> {
        match self {
            TriggerCompatVerdict::HoldCapable => Some("hold"),
            TriggerCompatVerdict::PulseOnly => Some("tap"),
            TriggerCompatVerdict::Unrecognized => None,
        }
    }

    pub fn viable_modes(self) -> &'static [&'static str] {
        match self {
            TriggerCompatVerdict::HoldCapable => &["hold", "tap", "double"],
            TriggerCompatVerdict::PulseOnly => &["tap", "double"],
            TriggerCompatVerdict::Unrecognized => &[],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerCompatRisk {
    None,
    LeftMouse,
    ScrollWheel,
    VendorMacro,
}

impl TriggerCompatRisk {
    pub fn as_str(self) -> &'static str {
        match self {
            TriggerCompatRisk::None => "none",
            TriggerCompatRisk::LeftMouse => "left_mouse",
            TriggerCompatRisk::ScrollWheel => "scroll_wheel",
            TriggerCompatRisk::VendorMacro => "vendor_macro",
        }
    }
}

#[derive(Debug, Clone)]
pub struct TriggerCompatResult {
    pub verdict: TriggerCompatVerdict,
    pub risk: TriggerCompatRisk,
    pub key: String,
    pub device: Option<String>,
    pub saw_keydown: bool,
    pub saw_keyup: bool,
}

pub fn trigger_compat_risk_for_key(key: &str) -> TriggerCompatRisk {
    match key {
        "LButton" => TriggerCompatRisk::LeftMouse,
        "MButton" => TriggerCompatRisk::ScrollWheel,
        _ => TriggerCompatRisk::None,
    }
}

pub fn trigger_compat_event_matches(bindings: &[String], event: &PhysicalKeyEvent) -> bool {
    resolve_binding_in_list(bindings, &event.key, event.device.as_deref()).is_some()
}

/// Classifies whether a bound trigger can support hold-to-talk (keydown + keyup) or pulse-only.
#[derive(Debug)]
pub struct TriggerCompatClassifier {
    started_at: Instant,
    matched_key: Option<String>,
    matched_device: Option<String>,
    keydown_at: Option<Instant>,
    saw_keydown: bool,
    saw_keyup: bool,
    risk: TriggerCompatRisk,
    finished: bool,
}

impl TriggerCompatClassifier {
    pub fn new(now: Instant) -> Self {
        Self {
            started_at: now,
            matched_key: None,
            matched_device: None,
            keydown_at: None,
            saw_keydown: false,
            saw_keyup: false,
            risk: TriggerCompatRisk::None,
            finished: false,
        }
    }

    pub fn note_vendor_macro_risk(&mut self) {
        if self.risk == TriggerCompatRisk::None {
            self.risk = TriggerCompatRisk::VendorMacro;
        }
    }

    fn merge_risk(&mut self, key: &str) {
        let incoming = trigger_compat_risk_for_key(key);
        if incoming != TriggerCompatRisk::None {
            self.risk = incoming;
        }
    }

    fn same_slot(&self, key: &str, device: Option<&str>) -> bool {
        self.matched_key.as_deref() == Some(key) && self.matched_device.as_deref() == device
    }

    fn store_slot(&mut self, key: &str, device: Option<&str>) {
        self.matched_key = Some(key.to_string());
        self.matched_device = device.map(str::to_string);
        self.merge_risk(key);
    }

    fn build_result(&self, verdict: TriggerCompatVerdict) -> TriggerCompatResult {
        TriggerCompatResult {
            verdict,
            risk: self.risk,
            key: self.matched_key.clone().unwrap_or_default(),
            device: self.matched_device.clone(),
            saw_keydown: self.saw_keydown,
            saw_keyup: self.saw_keyup,
        }
    }

    fn complete(&mut self, verdict: TriggerCompatVerdict) -> TriggerCompatResult {
        self.finished = true;
        self.build_result(verdict)
    }

    pub fn is_finished(&self) -> bool {
        self.finished
    }

    pub fn on_event(
        &mut self,
        event: &PhysicalKeyEvent,
        bindings: &[String],
        now: Instant,
    ) -> Option<TriggerCompatResult> {
        if self.finished || !trigger_compat_event_matches(bindings, event) {
            return None;
        }
        if event.is_keyup {
            if !self.saw_keydown || !self.same_slot(&event.key, event.device.as_deref()) {
                return None;
            }
            self.saw_keyup = true;
            return Some(self.complete(TriggerCompatVerdict::HoldCapable));
        }
        if self.saw_keydown {
            return None;
        }
        self.store_slot(&event.key, event.device.as_deref());
        self.saw_keydown = true;
        self.keydown_at = Some(now);
        None
    }

    pub fn poll(&mut self, now: Instant) -> Option<TriggerCompatResult> {
        if self.finished {
            return None;
        }
        if self.saw_keydown {
            let started = self.keydown_at.unwrap_or(self.started_at);
            if !self.saw_keyup
                && now.duration_since(started) >= Duration::from_millis(TRIGGER_COMPAT_PULSE_MS)
            {
                return Some(self.complete(TriggerCompatVerdict::PulseOnly));
            }
            return None;
        }
        if now.duration_since(self.started_at) >= Duration::from_millis(TRIGGER_COMPAT_TOTAL_MS) {
            return Some(self.complete(TriggerCompatVerdict::Unrecognized));
        }
        None
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

    #[test]
    fn compat_keydown_keyup_is_hold_capable() {
        let bindings = vec!["RAlt".into()];
        let start = Instant::now();
        let mut classifier = TriggerCompatClassifier::new(start);
        let down = PhysicalKeyEvent {
            is_keyup: false,
            device: None,
            key: "RAlt".into(),
        };
        assert!(classifier.on_event(&down, &bindings, start).is_none());
        let up = PhysicalKeyEvent {
            is_keyup: true,
            device: None,
            key: "RAlt".into(),
        };
        let result = classifier
            .on_event(&up, &bindings, start + Duration::from_millis(80))
            .expect("keyup should complete");
        assert_eq!(result.verdict, TriggerCompatVerdict::HoldCapable);
        assert_eq!(result.verdict.recommended_mode(), Some("hold"));
        assert!(result.verdict.viable_modes().contains(&"double"));
    }

    #[test]
    fn compat_keydown_only_is_pulse_only() {
        let bindings = vec!["Volume_Up".into()];
        let start = Instant::now();
        let mut classifier = TriggerCompatClassifier::new(start);
        let down = PhysicalKeyEvent {
            is_keyup: false,
            device: None,
            key: "Volume_Up".into(),
        };
        assert!(classifier.on_event(&down, &bindings, start).is_none());
        let result = classifier
            .poll(start + Duration::from_millis(TRIGGER_COMPAT_PULSE_MS + 50))
            .expect("pulse timeout should complete");
        assert_eq!(result.verdict, TriggerCompatVerdict::PulseOnly);
        assert_eq!(result.verdict.recommended_mode(), Some("tap"));
        assert_eq!(result.verdict.viable_modes(), &["tap", "double"]);
        assert!(!result.verdict.viable_modes().contains(&"hold"));
    }

    #[test]
    fn compat_no_input_is_unrecognized() {
        let start = Instant::now();
        let mut classifier = TriggerCompatClassifier::new(start);
        let result = classifier
            .poll(start + Duration::from_millis(TRIGGER_COMPAT_TOTAL_MS + 50))
            .expect("total timeout should complete");
        assert_eq!(result.verdict, TriggerCompatVerdict::Unrecognized);
        assert!(result.verdict.recommended_mode().is_none());
    }

    #[test]
    fn compat_left_mouse_keeps_verdict_with_risk() {
        let bindings = vec!["LButton".into()];
        let start = Instant::now();
        let mut classifier = TriggerCompatClassifier::new(start);
        let down = PhysicalKeyEvent {
            is_keyup: false,
            device: None,
            key: "LButton".into(),
        };
        assert!(classifier.on_event(&down, &bindings, start).is_none());
        let result = classifier
            .poll(start + Duration::from_millis(TRIGGER_COMPAT_PULSE_MS + 50))
            .expect("pulse timeout should complete");
        assert_eq!(result.verdict, TriggerCompatVerdict::PulseOnly);
        assert_eq!(result.risk, TriggerCompatRisk::LeftMouse);
    }
}
