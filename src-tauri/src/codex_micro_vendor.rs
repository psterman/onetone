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
/// Native protocol freshness window — older than this → stale/fallback for AG lights.
pub const NATIVE_STALE_MS: u64 = 3000;

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

/// Per-agent slot light snapshot from `v.oai.thstatus` (AG00–AG05).
#[derive(Debug, Clone, PartialEq)]
pub struct CodexMicroAgentSlotState {
    /// idle | running | needs_input | done | failed
    pub state: String,
    pub rgb: Option<CodexMicroRgbCfg>,
    pub raw: String,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone)]
pub struct CodexMicroProtocolState {
    /// Raw device.status payload snippet / label.
    pub device_status: String,
    /// sys.version string.
    pub version: String,
    /// Mapped pad five-state: idle | running | listening | done | failed (global chip only).
    pub pad_status: String,
    pub rgb: Option<CodexMicroRgbCfg>,
    pub lights_preview: bool,
    /// Last NAV_* held from rad (None = deadzone / released). Never NAV_PRESS from rad.
    pub last_nav: Option<String>,
    /// `None` = no native slot data (do not pretend idle is native).
    pub agent_slots: [Option<CodexMicroAgentSlotState>; 6],
    pub last_update_ms: u64,
    pub ever_native: bool,
    /// connected | stale | fallback — refreshed in `protocol_snapshot()`.
    pub connection_state: String,
}

impl Default for CodexMicroProtocolState {
    fn default() -> Self {
        Self {
            device_status: String::new(),
            version: String::new(),
            pad_status: String::new(),
            rgb: None,
            lights_preview: false,
            last_nav: None,
            agent_slots: [None, None, None, None, None, None],
            last_update_ms: 0,
            ever_native: false,
            connection_state: "fallback".into(),
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn mark_native_touch(state: &mut CodexMicroProtocolState) {
    state.ever_native = true;
    state.last_update_ms = now_ms();
    state.connection_state = "connected".into();
}

fn refresh_connection_state(state: &mut CodexMicroProtocolState) {
    if !state.ever_native || state.last_update_ms == 0 {
        state.connection_state = "fallback".into();
        return;
    }
    let age = now_ms().saturating_sub(state.last_update_ms);
    state.connection_state = if age > NATIVE_STALE_MS {
        "stale".into()
    } else {
        "connected".into()
    };
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

#[cfg(test)]
pub fn test_force_last_update_ms(ms: u64) {
    let mut state = protocol_state().lock().unwrap();
    state.last_update_ms = ms;
    state.ever_native = true;
    refresh_connection_state(&mut state);
}

/// Shared mutex so vendor + overlay protocol tests don't race.
#[cfg(test)]
pub fn test_protocol_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(())).lock().unwrap()
}

pub fn protocol_snapshot() -> CodexMicroProtocolState {
    let mut state = protocol_state().lock().unwrap().clone();
    refresh_connection_state(&mut state);
    state
}

/// True when connection is connected and age is within NATIVE_STALE_MS.
pub fn native_fresh(state: &CodexMicroProtocolState) -> bool {
    state.ever_native
        && state.last_update_ms > 0
        && now_ms().saturating_sub(state.last_update_ms) <= NATIVE_STALE_MS
}

/// AG00–AG05 index from micro key id.
pub fn agent_slot_index(micro_key_id: &str) -> Option<usize> {
    match micro_key_id.trim() {
        "AG00" => Some(0),
        "AG01" => Some(1),
        "AG02" => Some(2),
        "AG03" => Some(3),
        "AG04" => Some(4),
        "AG05" => Some(5),
        _ => None,
    }
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
            mark_native_touch(&mut state);
            return;
        }
        state.device_status = p;
        mark_native_touch(&mut state);
    } else if let Some(s) = extract_json_string_field(json, "result") {
        state.device_status = s;
        mark_native_touch(&mut state);
    } else {
        state.device_status = "ok".into();
        mark_native_touch(&mut state);
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
            mark_native_touch(&mut state);
            return;
        }
    }
    if let Some(v) = extract_json_string_field(json, "result") {
        state.version = v;
        mark_native_touch(&mut state);
    }
}

fn apply_thstatus(json: &str) {
    // Codex Desktop native: root `params` is a JSON array of slot lighting objects.
    let codex_native_slots = extract_json_array_field(json, "params")
        .map(|arr| parse_thstatus_slots(&arr))
        .filter(|slots| !slots.is_empty());

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
    let legacy_slots = payload.as_ref().and_then(|p| {
        extract_json_array_field(p, "slots")
            .or_else(|| extract_json_array_field(p, "agents"))
            .or_else(|| extract_json_array_field(p, "th"))
    });
    let parsed_slots = codex_native_slots.unwrap_or_else(|| {
        legacy_slots
            .as_ref()
            .map(|arr| parse_thstatus_slots(arr))
            .unwrap_or_default()
    });

    let mut state = protocol_state().lock().unwrap();
    if !mapped.is_empty() {
        state.pad_status = mapped;
    }
    for (idx, slot) in parsed_slots {
        if idx < 6 {
            state.agent_slots[idx] = Some(slot);
        }
    }
    mark_native_touch(&mut state);
}

/// Codex Micro official slot color → semantic state (AG00–AG05 lighting).
pub fn map_thstatus_color_to_state(c: u32) -> &'static str {
    match c {
        0 | 16777215 => "idle",
        3166206 => "running",
        65356 => "done",
        16739584 => "needs_input",
        16711731 => "failed",
        _ => "idle",
    }
}

fn color_u32_to_rgb(c: u32) -> CodexMicroRgbCfg {
    CodexMicroRgbCfg {
        r: ((c >> 16) & 0xFF) as u8,
        g: ((c >> 8) & 0xFF) as u8,
        b: (c & 0xFF) as u8,
    }
}

fn resolve_slot_state(obj: &str) -> String {
    if let Some(s) = extract_json_string_field(obj, "s")
        .or_else(|| extract_json_string_field(obj, "status"))
        .or_else(|| extract_json_string_field(obj, "state"))
    {
        if !s.trim().is_empty() {
            return map_agent_slot_state(&s);
        }
    }
    if let Some(c) = extract_json_u32_field(obj, "c") {
        return map_thstatus_color_to_state(c).to_string();
    }
    "idle".into()
}

/// Agent slot normalize: idle | running | needs_input | done | failed.
pub fn map_agent_slot_state(raw: &str) -> String {
    let s = raw.trim().to_ascii_lowercase();
    match s.as_str() {
        "" | "idle" | "blank" | "ready" | "ok" => "idle".into(),
        "running" | "busy" | "working" | "thinking" => "running".into(),
        "needs_input" | "waiting" | "approval" | "attention" | "listening" | "dictating"
        | "ptt" | "mic" => "needs_input".into(),
        "done" | "success" | "complete" | "completed" => "done".into(),
        "failed" | "error" | "fail" => "failed".into(),
        _ => {
            if s.contains("need") || s.contains("wait") || s.contains("approv") || s.contains("listen")
            {
                "needs_input".into()
            } else if s.contains("run") || s.contains("work") || s.contains("think") {
                "running".into()
            } else if s.contains("fail") || s.contains("err") {
                "failed".into()
            } else if s.contains("done") || s.contains("success") || s.contains("complete") {
                "done".into()
            } else {
                "idle".into()
            }
        }
    }
}

fn map_thstatus_to_pad(raw: &str) -> String {
    let s = raw.trim().to_ascii_lowercase();
    match s.as_str() {
        "" | "idle" | "ready" | "ok" => "idle".into(),
        "running" | "busy" | "working" | "thinking" => "running".into(),
        "listening" | "dictating" | "ptt" | "mic" | "needs_input" | "waiting" | "approval"
        | "attention" => "listening".into(),
        "done" | "success" | "complete" | "completed" => "done".into(),
        "failed" | "error" | "fail" => "failed".into(),
        _ => {
            if s.contains("listen") || s.contains("need") || s.contains("wait") {
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

fn parse_thstatus_slots(array_json: &str) -> Vec<(usize, CodexMicroAgentSlotState)> {
    let mut out = Vec::new();
    let ts = now_ms();
    for obj in iter_json_array_objects(array_json) {
        let idx = extract_slot_index(&obj);
        let Some(idx) = idx else {
            continue;
        };
        if idx >= 6 {
            continue;
        }
        let state = resolve_slot_state(&obj);
        let rgb = extract_slot_rgb(&obj);
        out.push((
            idx,
            CodexMicroAgentSlotState {
                state,
                rgb,
                raw: obj,
                updated_at_ms: ts,
            },
        ));
    }
    out
}

fn extract_slot_index(obj: &str) -> Option<usize> {
    if let Some(n) = extract_json_u8_field(obj, "id").map(|v| v as usize) {
        return Some(n);
    }
    if let Some(n) = extract_json_u8_field(obj, "i").map(|v| v as usize) {
        return Some(n);
    }
    if let Some(n) = extract_json_u8_field(obj, "index").map(|v| v as usize) {
        return Some(n);
    }
    if let Some(n) = extract_json_u8_field(obj, "slot").map(|v| v as usize) {
        return Some(n);
    }
    if let Some(s) = extract_json_string_field(obj, "i")
        .or_else(|| extract_json_string_field(obj, "index"))
        .or_else(|| extract_json_string_field(obj, "slot"))
    {
        let t = s.trim();
        if let Some(rest) = t.strip_prefix("AG0").or_else(|| t.strip_prefix("ag0")) {
            return rest.parse().ok();
        }
        return t.parse().ok();
    }
    None
}

fn extract_slot_rgb(obj: &str) -> Option<CodexMicroRgbCfg> {
    if let (Some(r), Some(g), Some(b)) = (
        extract_json_u8_field(obj, "r"),
        extract_json_u8_field(obj, "g"),
        extract_json_u8_field(obj, "b"),
    ) {
        return Some(CodexMicroRgbCfg { r, g, b });
    }
    extract_json_u32_field(obj, "c").map(color_u32_to_rgb)
}

fn extract_json_u32_field(json: &str, field: &str) -> Option<u32> {
    let needle = format!("\"{field}\":");
    let start = json.find(&needle)? + needle.len();
    let rest = json.get(start..)?.trim_start();
    let end = rest
        .find(|c: char| !(c.is_ascii_digit()))
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
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
    let mut state = protocol_state().lock().unwrap();
    state.rgb = Some(CodexMicroRgbCfg { r, g, b });
    mark_native_touch(&mut state);
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
    // Only update rgb when preview supplies r/g/b — never clear existing rgbcfg on on/off-only.
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
    mark_native_touch(&mut state);
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

fn extract_json_array_field(json: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\":[");
    let start = json.find(&needle)? + needle.len() - 1;
    let slice = json.get(start..)?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, ch) in slice.char_indices() {
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
        match ch {
            '"' => in_string = true,
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    return Some(slice[..=i].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn iter_json_array_objects(array_json: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = array_json.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() && bytes[i] != b'[' {
        i += 1;
    }
    if i >= bytes.len() {
        return out;
    }
    i += 1;
    while i < bytes.len() {
        while i < bytes.len() && (bytes[i] == b' ' || bytes[i] == b'\n' || bytes[i] == b'\t' || bytes[i] == b',') {
            i += 1;
        }
        if i >= bytes.len() || bytes[i] == b']' {
            break;
        }
        if bytes[i] != b'{' {
            // Skip non-object tokens.
            i += 1;
            continue;
        }
        let start = i;
        let mut depth = 0usize;
        let mut in_string = false;
        let mut escaped = false;
        while i < bytes.len() {
            let ch = bytes[i] as char;
            if in_string {
                if escaped {
                    escaped = false;
                } else if ch == '\\' {
                    escaped = true;
                } else if ch == '"' {
                    in_string = false;
                }
                i += 1;
                continue;
            }
            match ch {
                '"' => in_string = true,
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        if let Ok(s) = std::str::from_utf8(&bytes[start..=i]) {
                            out.push(s.to_string());
                        }
                        i += 1;
                        break;
                    }
                }
                _ => {}
            }
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    fn test_lock() -> MutexGuard<'static, ()> {
        crate::codex_micro_vendor::test_protocol_lock()
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
        assert!(protocol_snapshot().ever_native);
        assert_eq!(protocol_snapshot().connection_state, "connected");
        let _ = apply_rpc_json(r#"{"m":"v.oai.rgbcfg","p":{"r":10,"g":20,"b":30}}"#);
        let rgb = protocol_snapshot().rgb.expect("rgb");
        assert_eq!((rgb.r, rgb.g, rgb.b), (10, 20, 30));
        let _ = apply_rpc_json(r#"{"m":"sys.version","p":{"v":"1.2.3"}}"#);
        assert_eq!(protocol_snapshot().version, "1.2.3");
        let _ = apply_rpc_json(r#"{"m":"lights.preview","p":{"on":true,"r":1,"g":2,"b":3}}"#);
        assert!(protocol_snapshot().lights_preview);
        assert_eq!(protocol_snapshot().rgb.as_ref().map(|c| c.r), Some(1));
    }

    #[test]
    fn thstatus_codex_native_params_array() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(
            r#"{"method":"v.oai.thstatus","params":[{"id":0,"c":3166206,"b":1,"e":4,"s":0.4}],"id":42}"#,
        );
        let snap = protocol_snapshot();
        let slot = snap.agent_slots[0].as_ref().expect("slot 0");
        assert_eq!(slot.state, "running");
        assert!(slot.raw.contains("\"c\":3166206"));
        assert!(slot.raw.contains("\"id\":0"));
        assert!(native_fresh(&snap));
        assert_eq!(snap.connection_state, "connected");
    }

    #[test]
    fn map_thstatus_color_to_state_table() {
        assert_eq!(map_thstatus_color_to_state(0), "idle");
        assert_eq!(map_thstatus_color_to_state(16777215), "idle");
        assert_eq!(map_thstatus_color_to_state(3166206), "running");
        assert_eq!(map_thstatus_color_to_state(65356), "done");
        assert_eq!(map_thstatus_color_to_state(16739584), "needs_input");
        assert_eq!(map_thstatus_color_to_state(16711731), "failed");
    }

    #[test]
    fn thstatus_slots_update_agent_slots() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(
            r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":0,"s":"running"},{"index":2,"state":"needs_input"},{"slot":"AG05","s":"failed"}]}}"#,
        );
        let snap = protocol_snapshot();
        assert_eq!(snap.agent_slots[0].as_ref().map(|s| s.state.as_str()), Some("running"));
        assert!(snap.agent_slots[1].is_none());
        assert_eq!(
            snap.agent_slots[2].as_ref().map(|s| s.state.as_str()),
            Some("needs_input")
        );
        assert_eq!(snap.agent_slots[5].as_ref().map(|s| s.state.as_str()), Some("failed"));
        assert!(native_fresh(&snap));
    }

    #[test]
    fn thstatus_unknown_does_not_panic() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(r#"{"m":"v.oai.thstatus","p":{"slots":[{"i":9,"s":"weird"},{"foo":1}]}}"#);
        let snap = protocol_snapshot();
        assert!(snap.agent_slots.iter().all(|s| s.is_none()));
        assert_eq!(map_agent_slot_state("thinking"), "running");
        assert_eq!(map_agent_slot_state("approval"), "needs_input");
    }

    #[test]
    fn lights_preview_on_off_preserves_rgbcfg() {
        let _g = test_lock();
        reset_protocol_state();
        let _ = apply_rpc_json(r#"{"m":"v.oai.rgbcfg","p":{"r":9,"g":8,"b":7}}"#);
        let _ = apply_rpc_json(r#"{"m":"lights.preview","p":{"on":true}}"#);
        let rgb = protocol_snapshot().rgb.expect("rgb kept");
        assert_eq!((rgb.r, rgb.g, rgb.b), (9, 8, 7));
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
