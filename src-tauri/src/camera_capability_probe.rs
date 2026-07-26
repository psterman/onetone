//! Camera capability probe: RGB is frontend; Hello auth & HumanPresence are native.
//! Device-name matching is never treated as truth for Hello / gaze / multi-face.

use serde_json::{json, Value};

/// Heuristic only: registry hints that Face biometric may be present.
/// Not a guarantee of IR stream access or gaze quality.
#[cfg(windows)]
fn hello_auth_probe() -> Value {
    use std::path::Path;
    // WinBio face adapter presence is a weak signal that Hello Face *may* be configured.
    let candidates = [
        r"C:\Windows\System32\WinBioDatabase",
        r"C:\Windows\System32\WinBioPlugIns",
    ];
    let mut hint = false;
    for p in candidates {
        if Path::new(p).exists() {
            hint = true;
            break;
        }
    }
    // Do not claim available=true from folders alone — apps need UserConsentVerifier.
    // Expose as "possible" via reason so UI stays gated until real confirm works.
    json!({
        "available": false,
        "reason": if hint { "winbio_present_but_confirm_not_wired" } else { "hello_confirm_not_wired" },
        "method": "native_stub",
        "note": "Windows Hello is for authentication, not gaze/multi-monitor. Confirm API not wired yet."
    })
}

#[cfg(not(windows))]
fn hello_auth_probe() -> Value {
    json!({
        "available": false,
        "reason": "windows_only",
        "method": "native_stub"
    })
}

/// HumanPresenceSensor is a separate Windows 11 device surface — not implied by Hello cameras.
#[cfg(windows)]
fn human_presence_probe() -> Value {
    json!({
        "available": false,
        "reason": "hps_not_enumerated",
        "method": "native_stub",
        "note": "Having a Hello camera does not imply HumanPresenceSensor is exposed."
    })
}

#[cfg(not(windows))]
fn human_presence_probe() -> Value {
    json!({
        "available": false,
        "reason": "windows_only",
        "method": "native_stub"
    })
}

pub fn probe_camera_capabilities() -> Value {
    json!({
        "helloAuth": hello_auth_probe(),
        "humanPresence": human_presence_probe(),
        "deviceNameHint": serde_json::Value::Null
    })
}

/// Placeholder until UserConsentVerifier is wired. Always fails closed.
pub fn windows_hello_confirm(_reason: &str) -> Value {
    json!({
        "ok": false,
        "reason": "hello_confirm_not_wired",
        "message": "System confirm is not wired; Hello exclusive toggles stay gated."
    })
}
