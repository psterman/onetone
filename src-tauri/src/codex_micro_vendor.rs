//! fttawa/codex-micro vendor HID report reassembly and v.oai.hid key events.
//! Ref: https://github.com/fttawa/codex-micro (report id 0x06, RPC channel 2).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const REPORT_ID: u8 = 0x06;
const REPORT_DATA_SIZE: usize = 63;
const MAX_PAYLOAD_SIZE: usize = 61;
const CHANNEL_RPC: u8 = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexMicroVendorKeyEvent {
    pub micro_key_id: String,
    pub key_down: bool,
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

/// Ingest a raw HID report; returns key events from complete v.oai.hid RPC payloads.
pub fn ingest_hid_report(data: &[u8]) -> Vec<CodexMicroVendorKeyEvent> {
    let mut messages = reassembler().lock().unwrap().push(data);
    let mut out = Vec::new();
    for json in messages.drain(..) {
        if let Some(ev) = parse_hid_rpc(&json) {
            out.push(ev);
        }
    }
    out
}

pub fn reset_reassembler() {
    reassembler().lock().unwrap().reset();
}

fn parse_hid_rpc(json: &str) -> Option<CodexMicroVendorKeyEvent> {
    let method = extract_json_string_field(json, "m")?;
    if method != "v.oai.hid" {
        return None;
    }
    let payload = extract_json_object_field(json, "p")?;
    let key = extract_json_string_field(&payload, "k")?;
    if !is_micro_key_id(&key) {
        return None;
    }
    let act = extract_json_u8_field(&payload, "act")?;
    let key_down = match act {
        1 => true,
        0 => false,
        _ => return None,
    };
    Some(CodexMicroVendorKeyEvent {
        micro_key_id: key,
        key_down,
    })
}

fn is_micro_key_id(key: &str) -> bool {
    // M1: bindable press IDs only. Encoder rotate (ENC_CW/ENC_CC) and NAV_* ignored.
    key.starts_with("AG0")
        || key.starts_with("ACT")
        || key == "ENC"
        || key == "JOY"
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
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    rest[..end].parse().ok()
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
    fn ignores_non_hid_rpc() {
        assert!(parse_hid_rpc(r#"{"m":"device.status","p":{}}"#).is_none());
    }

    #[test]
    fn reassembles_framed_report() {
        reset_reassembler();
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
}
