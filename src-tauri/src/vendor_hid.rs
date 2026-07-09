//! Generic HID vendor-report key extraction (Phase 3 extension layer).
//!
//! Produces synthetic names `HID_XX` / `HID_R{rid}_{byte}` from vendor reports
//! after consumer / boot-keyboard parsers decline the payload.

const REPORT_HEX_MAX_BYTES: usize = 64;

/// Parsed vendor HID report — key name plus debug-only hex snapshot.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VendorHidScan {
    pub key: String,
    pub report_hex: String,
}

/// Map the first meaningful byte in a vendor HID report to a stable key name.
pub fn vendor_hid_key_name(data: &[u8]) -> Option<String> {
    scan_vendor_hid_report(data).map(|s| s.key)
}

pub fn scan_vendor_hid_bytes(data: &[u8]) -> Option<String> {
    scan_vendor_hid_report(data).map(|s| s.key)
}

pub fn report_hex(data: &[u8]) -> String {
    let end = data.len().min(REPORT_HEX_MAX_BYTES);
    data[..end]
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join("")
}

pub fn report_has_signal(data: &[u8]) -> bool {
    data.iter().any(|&b| b != 0)
}

pub fn scan_vendor_hid_report(data: &[u8]) -> Option<VendorHidScan> {
    if data.is_empty() || !report_has_signal(data) {
        return None;
    }
    let rid = data[0];
    let use_report_prefix = data.len() >= 3 && rid >= 0x01 && rid <= 0x0F;
    let start = if data.len() >= 3 { 2 } else { 0 };
    let key_byte = first_nonzero_byte(data, start).or_else(|| first_nonzero_byte(data, 0))?;
    let key = if use_report_prefix {
        format!("HID_R{rid:02X}_{key_byte:02X}")
    } else {
        format!("HID_{key_byte:02X}")
    };
    Some(VendorHidScan {
        key,
        report_hex: report_hex(data),
    })
}

fn first_nonzero_byte(data: &[u8], start: usize) -> Option<u8> {
    data.get(start..)?.iter().find(|&&b| b != 0).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendor_byte_maps_to_hid_name() {
        assert_eq!(
            scan_vendor_hid_bytes(&[0, 0, 0xB3]).as_deref(),
            Some("HID_B3")
        );
    }

    #[test]
    fn vendor_skips_empty_report() {
        assert_eq!(scan_vendor_hid_bytes(&[0, 0, 0]), None);
    }

    #[test]
    fn vendor_single_byte_report() {
        assert_eq!(scan_vendor_hid_bytes(&[0x04]).as_deref(), Some("HID_04"));
    }

    #[test]
    fn vendor_report_id_prefix() {
        let scan = scan_vendor_hid_report(&[0x01, 0x00, 0xB3]).expect("scan");
        assert_eq!(scan.key, "HID_R01_B3");
        assert!(scan.report_hex.starts_with("0100B3"));
    }

    #[test]
    fn vendor_report_id_skips_modifier_region() {
        let scan = scan_vendor_hid_report(&[0x02, 0x01, 0x00, 0x04]).expect("scan");
        assert_eq!(scan.key, "HID_R02_04");
    }

    #[test]
    fn legacy_foot_pedal_unchanged() {
        assert_eq!(scan_vendor_hid_bytes(&[0xB3]).as_deref(), Some("HID_B3"));
    }

    #[test]
    fn report_has_signal_detects_nonzero() {
        assert!(!report_has_signal(&[0, 0, 0]));
        assert!(report_has_signal(&[0, 1, 0]));
    }
}
