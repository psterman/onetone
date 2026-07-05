//! Stable device identifiers (VID/PID) for peripheral binding.

const STABLE_PREFIX: &str = "dev:";

/// Parse `VID_046d&PID_c52b` segments from a Windows device path.
pub fn parse_vid_pid(path: &str) -> Option<(u16, u16)> {
    let upper = path.to_ascii_uppercase();
    let vid = parse_hex_after(&upper, "VID_")?;
    let pid = parse_hex_after(&upper, "PID_")?;
    Some((vid, pid))
}

fn parse_hex_after(haystack: &str, needle: &str) -> Option<u16> {
    let idx = haystack.find(needle)?;
    let rest = &haystack[idx + needle.len()..];
    let hex: String = rest
        .chars()
        .take_while(|c| c.is_ascii_hexdigit())
        .collect();
    u16::from_str_radix(&hex, 16).ok()
}

/// Build a stable id: `dev:046d:c52b` (lowercase hex, no 0x prefix).
pub fn stable_id_from_path(path: &str) -> String {
    let path = path.trim();
    if path.is_empty() {
        return String::new();
    }
    if let Some((vid, pid)) = parse_vid_pid(path) {
        return format!("{STABLE_PREFIX}{vid:04x}:{pid:04x}");
    }
    path.to_string()
}

/// Normalize stored or incoming device ids for comparison.
pub fn normalize_device_id(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }
    if raw.starts_with(STABLE_PREFIX) && raw.contains(':') {
        return raw.to_ascii_lowercase();
    }
    stable_id_from_path(raw)
}

pub fn devices_match(stored: &str, incoming: &str) -> bool {
    let stored = stored.trim();
    let incoming = incoming.trim();
    if stored.is_empty() || incoming.is_empty() {
        return stored.is_empty() && incoming.is_empty();
    }
    let sn = normalize_device_id(stored);
    let inn = normalize_device_id(incoming);
    if sn == inn {
        return true;
    }
    // Legacy full-path fallback during migration.
    if stored.contains('\\') || stored.contains('#') {
        if stored.ends_with(incoming) || incoming.ends_with(stored) {
            return true;
        }
        if let Some((vid, pid)) = parse_vid_pid(stored) {
            let stable = format!("{STABLE_PREFIX}{vid:04x}:{pid:04x}");
            if inn == stable {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vid_pid_from_hid_path() {
        let path = r"\\?\HID#VID_046D&PID_C52B&MI_00#7&1a2b3c4d&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}";
        let (vid, pid) = parse_vid_pid(path).unwrap();
        assert_eq!(vid, 0x046d);
        assert_eq!(pid, 0xc52b);
        assert_eq!(stable_id_from_path(path), "dev:046d:c52b");
    }

    #[test]
    fn stable_ids_match_after_port_change() {
        let old = r"\\?\HID#VID_046D&PID_C52B#7&aaa&0&0000#{884b96c3}";
        let new = r"\\?\HID#VID_046D&PID_C52B#7&bbb&0&0000#{884b96c3}";
        assert!(devices_match(
            &stable_id_from_path(old),
            &stable_id_from_path(new)
        ));
    }
}
