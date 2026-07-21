//! fttawa/codex-micro vendor HID report reassembly + RPC protocol model (M3).
//! Ref: https://github.com/fttawa/codex-micro (report id 0x06, RPC channel 2).
//!
//! Methods:
//! - `v.oai.hid` — press/release (act 0/1); rotate pulse act 2 for ENC_CW/ENC_CC
//! - `v.oai.rad` — stick `p.a` angle + `p.d` distance → NAV_* (no center)
//! - `device.status` / `sys.version` / `v.oai.thstatus` / `v.oai.rgbcfg` / `lights.preview`
//!   — software light / status model only (no real HID writeback)

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const REPORT_ID: u8 = 0x06;
const REPORT_DATA_SIZE: usize = 63;
const MAX_PAYLOAD_SIZE: usize = 61;
const CHANNEL_RPC: u8 = 2;

/// Deadzone for `v.oai.rad` distance — at or below this → release / idle (no NAV).
pub const RAD_DEADZONE: f64 = 0.2;

/// Quadrant centers in normalized angle `[0, 1)` — right → down → left → up.
/// Locked by unit tests; if fttawa bench disagrees, change tests + these together.
pub const RAD_CENTER_RIGHT: f64 = 0.00;
pub const RAD_CENTER_DOWN: f64 = 0.25;
pub const RAD_CENTER_LEFT: f64 = 0.50;
pub const RAD_CENTER_UP: f64 = 0.75;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexMicroVendorKeyEvent {
    pub micro_key_id: String,
    pub key_down: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CodexMicroRgbCfg {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, Default)]
pub struct CodexMicroProtocolState {
    /// Raw device.status payload snippet / label.
    pub device_status: String,
    /// sys.version string.
    pub version: String,
    /// Mapped five-state: idle | running | listening | done | failed.
    pub pad_status: String,
    pub rgb: Option<CodexMicroRgbCfg>,
    pub lights_preview: bool,
    /// Last NAV_* held from rad (None = deadzone / released). Never NAV_PRESS from rad.
    pub last_nav: Option<String>,
}

struct ReportReassembler {
    max_buffer_size: usize,
    buffers: HashMap<u8, String>,
}

impl ReportReassembler {
    fn new(max_buffer_size: usize) -> Self {
        Self {
            max_buffer_size,
            buffers: HashMap::new(),
        }
    }

    fn push(&mut self, report: &[u8]) -> Vec<String> {
        let Some(normalized) = normalize_report(report) else {
            return vec![];
        };
        if normalized.len() < 2 {
            return vec![];
        }
        let channel = normalized[0];
        if channel != CHANNEL_RPC {
            return vec![];
        }
        let payload_size = normalized[1] as usize;
        if payload_size > MAX_PAYLOAD_SIZE || payload_size + 2 > normalized.len() {
            return vec![];
        }
        let buffer = self.buffers.entry(channel).or_default();
        if buffer.len() + payload_size > self.max_buffer_size {
            buffer.clear();
            return vec![];
        }
        buffer.push_str(&String::from_utf8_lossy(
            &normalized[2..2 + payload_size],
        ));
        extract_json_objects(buffer)
    }

    fn reset(&mut self) {
        self.buffers.clear();
    }
}

fn reassembler() -> &'static Mutex<ReportReassembler> {
    static REASSEMBLER: OnceLock<Mutex<ReportReassembler>> = OnceLock::new();
    REASSEMBLER.get_or_init(|| Mutex::new(ReportReassembler::new(4096)))
}

fn protocol_state() -> &'static Mutex<CodexMicroProtocolState> {
    static STATE: OnceLock<Mutex<CodexMicroProtocolState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(CodexMicroProtocolState::default()))
}

fn normalize_report(report: &[u8]) -> Option<&[u8]> {
    if report.is_empty() {
        return None;
    }
    if report.len() == 64 {
        if report[0] != REPORT_ID {
            return None;
        }
        return Some(&report[1..]);
    }
    if report.len() == REPORT_DATA_SIZE {
        return Some(report);
    }
    None
}

fn extract_json_objects(buffer: &mut String) -> Vec<String> {
    let mut objects = Vec::new();
    let mut start: Option<usize> = None;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let bytes = buffer.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        let ch = b as char;
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
        } else if ch == '{' {
            if depth == 0 {
                start = Some(i);
            }
            depth += 1;
        } else if ch == '}' && depth > 0 {
            depth -= 1;
            if depth == 0 {
                if let Some(s) = start {
                    objects.push(buffer[s..=i].to_string());
                    start = None;
                }
            }
        }
    }
    if depth > 0 {
        if let Some(s) = start {
            buffer.drain(..s);
        }
    } else {
        buffer.clear();
    }
    objects
}

/// Ingest a raw HID report; returns key events from `v.oai.hid` + `v.oai.rad`.
pub fn ingest_hid_report(data: &[u8]) -> Vec<CodexMicroVendorKeyEvent> {
    let mut messages = reassembler().lock().unwrap().push(data);
    let mut out = Vec::new();
    for json in messages.drain(..) {
        out.extend(apply_rpc_json(&json));
    }
    out
}

/// Parse a single RPC JSON object (host/tests). Updates protocol state for status/lights.
pub fn apply_rpc_json(json: &str) -> Vec<CodexMicroVendorKeyEvent> {
    let method = match extract_method(json) {
        Some(m) => m,
        None => return vec![],
    };
    match method.as_str() {
        "v.oai.hid" => parse_hid_rpc(json).into_iter().collect(),
        "v.oai.rad" => apply_rad_rpc(json),
        "device.status" => {
            apply_device_status(json);
            vec![]
        }
        "sys.version" => {
            apply_sys_version(json);
            vec![]
        }
        "v.oai.thstatus" => {
            apply_thstatus(json);
            vec![]
        }
        "v.oai.rgbcfg" => {
            apply_rgbcfg(json);
            vec![]
        }
        "lights.preview" => {
            apply_lights_preview(json);
            vec![]
        }
        _ => vec![],
    }
}

pub fn reset_reassembler() {
    reassembler().lock().unwrap().reset();
}

pub fn reset_protocol_state() {
    *protocol_state().lock().unwrap() = CodexMicroProtocolState::default();
}

pub fn protocol_snapshot() -> CodexMicroProtocolState {
    protocol_state().lock().unwrap().clone()
}

/// Map stick angle + distance → NAV_* or None (deadzone). **Never** returns center / NAV_PRESS.
pub fn rad_to_nav(angle: f64, distance: f64) -> Option<&'static str> {
    if !(distance.is_finite() && angle.is_finite()) {
        return None;
    }
    if distance <= RAD_DEADZONE {
        return None;
    }
    let a = normalize_angle01(angle);
    let centers = [
        (RAD_CENTER_RIGHT, "NAV_RIGHT"),
        (RAD_CENTER_DOWN, "NAV_DOWN"),
        (RAD_CENTER_LEFT, "NAV_LEFT"),
        (RAD_CENTER_UP, "NAV_UP"),
    ];
    let mut best = centers[0];
    let mut best_d = circular_dist01(a, centers[0].0);
    for &(c, name) in &centers[1..] {
        let d = circular_dist01(a, c);
        if d < best_d {
            best_d = d;
            best = (c, name);
        }
    }
    Some(best.1)
}

fn normalize_angle01(angle: f64) -> f64 {
    let mut a = angle % 1.0;
    if a < 0.0 {
        a += 1.0;
    }
    if a >= 1.0 {
        a = 0.0;
    }
    a
}

fn circular_dist01(a: f64, b: f64) -> f64 {
    let mut d = (a - b).abs();
    if d > 0.5 {
        d = 1.0 - d;
    }
    d
}

fn extract_method(json: &str) -> Option<String> {
    if let Some(m) = extract_json_string_field(json, "m") {
        return Some(m);
    }
    extract_json_string_field(json, "method")
}

fn parse_hid_rpc(json: &str) -> Option<CodexMicroVendorKeyEvent> {
    let payload = extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"))?;
    let key = extract_json_string_field(&payload, "k")?;
    if !is_micro_key_id(&key) {
        return None;
    }
    let act = extract_json_u8_field(&payload, "act")?;
    let key_down = match act {
        1 => true,
        0 => false,
        // Rotate pulse (ENC_CW / ENC_CC): treat as momentary down.
        2 if key == "ENC_CW" || key == "ENC_CC" => true,
        _ => return None,
    };
    Some(CodexMicroVendorKeyEvent {
        micro_key_id: key,
        key_down,
    })
}

fn apply_rad_rpc(json: &str) -> Vec<CodexMicroVendorKeyEvent> {
    let payload = match extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"))
    {
        Some(p) => p,
        None => return vec![],
    };
    let angle = match extract_json_f64_field(&payload, "a") {
        Some(v) => v,
        None => return vec![],
    };
    let distance = match extract_json_f64_field(&payload, "d") {
        Some(v) => v,
        None => return vec![],
    };
    // Protocol has no center press on rad — ignore any center-ish fields.
    let next = rad_to_nav(angle, distance).map(|s| s.to_string());
    let mut state = protocol_state().lock().unwrap();
    let prev = state.last_nav.clone();
    if prev == next {
        return vec![];
    }
    let mut out = Vec::new();
    if let Some(old) = prev {
        out.push(CodexMicroVendorKeyEvent {
            micro_key_id: old,
            key_down: false,
        });
    }
    if let Some(ref nav) = next {
        out.push(CodexMicroVendorKeyEvent {
            micro_key_id: nav.clone(),
            key_down: true,
        });
    }
    state.last_nav = next;
    out
}

fn apply_device_status(json: &str) {
    let mut state = protocol_state().lock().unwrap();
    if let Some(p) = extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"))
    {
        if let Some(s) = extract_json_string_field(&p, "s")
            .or_else(|| extract_json_string_field(&p, "status"))
        {
            state.device_status = s;
            return;
        }
        state.device_status = p;
    } else if let Some(s) = extract_json_string_field(json, "result") {
        state.device_status = s;
    } else {
        state.device_status = "ok".into();
    }
}

fn apply_sys_version(json: &str) {
    let mut state = protocol_state().lock().unwrap();
    if let Some(p) = extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"))
    {
        if let Some(v) = extract_json_string_field(&p, "v")
            .or_else(|| extract_json_string_field(&p, "version"))
        {
            state.version = v;
            return;
        }
    }
    if let Some(v) = extract_json_string_field(json, "result") {
        state.version = v;
    }
}

fn apply_thstatus(json: &str) {
    let payload = extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"));
    let raw = payload
        .as_ref()
        .and_then(|p| {
            extract_json_string_field(p, "s")
                .or_else(|| extract_json_string_field(p, "status"))
                .or_else(|| extract_json_string_field(p, "state"))
        })
        .unwrap_or_default();
    let mapped = map_thstatus_to_pad(&raw);
    {
        let mut state = protocol_state().lock().unwrap();
        state.pad_status = mapped.clone();
    }
    if !mapped.is_empty() && mapped != "idle" {
        crate::codex_micro_overlay::note_pad_run_status(&mapped, "");
    } else if mapped == "idle" {
        crate::codex_micro_overlay::note_pad_run_status("idle", "");
    }
}

fn map_thstatus_to_pad(raw: &str) -> String {
    let s = raw.trim().to_ascii_lowercase();
    match s.as_str() {
        "" | "idle" | "ready" | "ok" => "idle".into(),
        "running" | "busy" | "working" | "thinking" => "running".into(),
        "listening" | "dictating" | "ptt" | "mic" => "listening".into(),
        "done" | "success" | "complete" | "completed" => "done".into(),
        "failed" | "error" | "fail" => "failed".into(),
        _ => {
            if s.contains("listen") {
                "listening".into()
            } else if s.contains("run") || s.contains("work") {
                "running".into()
            } else if s.contains("fail") || s.contains("err") {
                "failed".into()
            } else if s.contains("done") || s.contains("success") {
                "done".into()
            } else {
                "idle".into()
            }
        }
    }
}

fn apply_rgbcfg(json: &str) {
    let payload = match extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"))
    {
        Some(p) => p,
        None => return,
    };
    let r = extract_json_u8_field(&payload, "r").unwrap_or(0);
    let g = extract_json_u8_field(&payload, "g").unwrap_or(0);
    let b = extract_json_u8_field(&payload, "b").unwrap_or(0);
    protocol_state().lock().unwrap().rgb = Some(CodexMicroRgbCfg { r, g, b });
}

fn apply_lights_preview(json: &str) {
    let payload = extract_json_object_field(json, "p")
        .or_else(|| extract_json_object_field(json, "params"));
    let on = payload
        .as_ref()
        .and_then(|p| extract_json_bool_or_u8(p, "on"))
        .or_else(|| extract_json_bool_or_u8(json, "on"))
        .unwrap_or(true);
    let mut state = protocol_state().lock().unwrap();
    state.lights_preview = on;
    if on {
        if let Some(rgb) = payload.as_ref().and_then(|p| {
            let r = extract_json_u8_field(p, "r")?;
            let g = extract_json_u8_field(p, "g")?;
            let b = extract_json_u8_field(p, "b")?;
            Some(CodexMicroRgbCfg { r, g, b })
        }) {
            state.rgb = Some(rgb);
        }
    }
}

fn is_micro_key_id(key: &str) -> bool {
    key.starts_with("AG0")
        || key.starts_with("ACT")
        || key == "ENC"
        || key == "ENC_CW"
        || key == "ENC_CC"
        || key == "JOY"
        || key == "NAV_UP"
        || key == "NAV_DOWN"
        || key == "NAV_LEFT"
        || key == "NAV_RIGHT"
        || key == "NAV_PRESS"
}

fn extract_json_string_field(json: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\":\"");
    let start = json.find(&needle)? + needle.len();
    let rest = json.get(start..)?;
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn extract_json_u8_field(json: &str, field: &str) -> Option<u8> {
    let needle = format!("\"{field}\":");
    let start = json.find(&needle)? + needle.len();
    let rest = json.get(start..)?.trim_start();
    let end = rest
        .find(|c: char| !(c.is_ascii_digit()))
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

fn extract_json_f64_field(json: &str, field: &str) -> Option<f64> {
    let needle = format!("\"{field}\":");
    let start = json.find(&needle)? + needle.len();
    let rest = json.get(start..)?.trim_start();
    let end = rest
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E'))
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
}

fn extract_json_bool_or_u8(json: &str, field: &str) -> Option<bool> {
    let needle = format!("\"{field}\":");
    let start = json.find(&needle)? + needle.len();
    let rest = json.get(start..)?.trim_start();
    if rest.starts_with("true") {
        return Some(true);
    }
    if rest.starts_with("false") {
        return Some(false);
    }
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    let n: u8 = rest[..end].parse().ok()?;
    Some(n != 0)
}

fn extract_json_object_field(json: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\":{{");
    let start = json.find(&needle)? + needle.len() - 1;
    let slice = json.get(start..)?;
    let mut depth = 0usize;
    for (i, ch) in slice.char_indices() {
        if ch == '{' {
            depth += 1;
        } else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(slice[..=i].to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    fn test_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn parses_v_oai_hid_press() {
        let json = r#"{"m":"v.oai.hid","p":{"k":"AG00","act":1}}"#;
        let ev = parse_hid_rpc(json).expect("event");
        assert_eq!(ev.micro_key_id, "AG00");
        assert!(ev.key_down);
    }

    #[test]
    fn parses_v_oai_hid_release() {
        let json = r#"{"m":"v.oai.hid","p":{"k":"ACT10","act":0}}"#;
        let ev = parse_hid_rpc(json).expect("event");
        assert_eq!(ev.micro_key_id, "ACT10");
        assert!(!ev.key_down);
    }

    #[test]
    fn parses_encoder_rotate_act2() {
        let json = r#"{"m":"v.oai.hid","p":{"k":"ENC_CW","act":2}}"#;
        let ev = parse_hid_rpc(json).expect("rotate");
        assert_eq!(ev.micro_key_id, "ENC_CW");
        assert!(ev.key_down);
    }

    #[test]
    fn device_status_is_not_hid_key() {
        assert!(parse_hid_rpc(r#"{"m":"device.status","p":{}}"#).is_none());
    }

    #[test]
    fn rad_deadzone_releases() {
        assert!(rad_to_nav(0.0, 0.2).is_none());
        assert!(rad_to_nav(0.0, 0.1).is_none());
        assert!(rad_to_nav(0.75, 0.0).is_none());
    }

    #[test]
    fn rad_quadrants_locked() {
        assert_eq!(rad_to_nav(0.00, 1.0), Some("NAV_RIGHT"));
        assert_eq!(rad_to_nav(0.99, 0.5), Some("NAV_RIGHT"));
        assert_eq!(rad_to_nav(0.25, 1.0), Some("NAV_DOWN"));
        assert_eq!(rad_to_nav(0.50, 1.0), Some("NAV_LEFT"));
        assert_eq!(rad_to_nav(0.75, 1.0), Some("NAV_UP"));
        // Near boundaries still resolve by nearest center (no center press).
        assert_eq!(rad_to_nav(0.12, 0.9), Some("NAV_RIGHT"));
        assert_eq!(rad_to_nav(0.13, 0.9), Some("NAV_DOWN"));
    }

    #[test]
    fn rad_never_emits_nav_press_or_center() {
        let _g = test_lock();
        reset_protocol_state();
        let evs = apply_rpc_json(r#"{"m":"v.oai.rad","p":{"a":0.0,"d":0.0}}"#);
        assert!(evs.is_empty());
        assert!(protocol_snapshot().last_nav.is_none());
        for a in [0.0, 0.25, 0.5, 0.75, 0.125, 0.999] {
            let nav = rad_to_nav(a, 1.0).unwrap();
            assert_ne!(nav, "NAV_PRESS");
            assert!(!nav.contains("CENTER"));
        }
    }

    #[test]
    fn rad_stateful_release_on_deadzone() {
        let _g = test_lock();
        reset_protocol_state();
        let down = apply_rpc_json(r#"{"m":"v.oai.rad","p":{"a":0.75,"d":0.8}}"#);
        assert_eq!(down.len(), 1);
        assert_eq!(down[0].micro_key_id, "NAV_UP");
        assert!(down[0].key_down);
        let up = apply_rpc_json(r#"{"m":"v.oai.rad","p":{"a":0.75,"d":0.1}}"#);
        assert_eq!(up.len(), 1);
        assert_eq!(up[0].micro_key_id, "NAV_UP");
        assert!(!up[0].key_down);
        assert!(protocol_snapshot().last_nav.is_none());
    }

    #[test]
    fn rad_direction_change_releases_previous() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(r#"{"m":"v.oai.rad","p":{"a":0.0,"d":1}}"#);
        let evs = apply_rpc_json(r#"{"m":"v.oai.rad","p":{"a":0.5,"d":1}}"#);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0].micro_key_id, "NAV_RIGHT");
        assert!(!evs[0].key_down);
        assert_eq!(evs[1].micro_key_id, "NAV_LEFT");
        assert!(evs[1].key_down);
    }

    #[test]
    fn thstatus_and_rgbcfg_update_protocol_state() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(r#"{"m":"v.oai.thstatus","p":{"s":"listening"}}"#);
        assert_eq!(protocol_snapshot().pad_status, "listening");
        let _ = apply_rpc_json(r#"{"m":"v.oai.rgbcfg","p":{"r":10,"g":20,"b":30}}"#);
        let rgb = protocol_snapshot().rgb.expect("rgb");
        assert_eq!((rgb.r, rgb.g, rgb.b), (10, 20, 30));
        let _ = apply_rpc_json(r#"{"m":"sys.version","p":{"v":"1.2.3"}}"#);
        assert_eq!(protocol_snapshot().version, "1.2.3");
        let _ = apply_rpc_json(r#"{"m":"lights.preview","p":{"on":true,"r":1,"g":2,"b":3}}"#);
        assert!(protocol_snapshot().lights_preview);
    }

    #[test]
    fn reassembles_framed_report() {
        let _g = test_lock();
        reset_reassembler();
        reset_protocol_state();
        let mut report = [0u8; 64];
        report[0] = REPORT_ID;
        report[1] = CHANNEL_RPC;
        let payload = br#"{"m":"v.oai.hid","p":{"k":"ACT08","act":1}}"#;
        report[2] = payload.len() as u8;
        report[3..3 + payload.len()].copy_from_slice(payload);
        let events = ingest_hid_report(&report);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].micro_key_id, "ACT08");
        assert!(events[0].key_down);
    }

    #[test]
    fn ingest_rad_framed_report() {
        let _g = test_lock();
        reset_reassembler();
        reset_protocol_state();
        let mut report = [0u8; 64];
        report[0] = REPORT_ID;
        report[1] = CHANNEL_RPC;
        let payload = br#"{"m":"v.oai.rad","p":{"a":0.25,"d":1}}"#;
        report[2] = payload.len() as u8;
        report[3..3 + payload.len()].copy_from_slice(payload);
        let events = ingest_hid_report(&report);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].micro_key_id, "NAV_DOWN");
        assert!(events[0].key_down);
    }
}
