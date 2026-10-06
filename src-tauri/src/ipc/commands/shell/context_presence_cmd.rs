//! Presence IPC — camera reports state, it never decides.
//!
//! The frontend owns the tracker; it ships three scalars across the boundary.
//! Frames never leave the renderer.

use crate::context::presence::{self, Presence, PresenceConfidence};

/// Report a fresh observation. Cheap; safe to call on every tracker tick.
#[tauri::command]
pub fn cmd_context_presence_report(state: String, confidence: String) -> serde_json::Value {
    let parsed = match state.trim().to_ascii_lowercase().as_str() {
        "here" | "present" => Presence::Here,
        "away" | "absent" => Presence::Away,
        // Anything unrecognised is treated as "we don't know", never as away.
        _ => Presence::Unknown,
    };
    let conf = match confidence.trim().to_ascii_lowercase().as_str() {
        "high" => PresenceConfidence::High,
        "mid" | "medium" => PresenceConfidence::Mid,
        _ => PresenceConfidence::Low,
    };
    presence::report(parsed, conf);
    serde_json::to_value(presence::snapshot()).unwrap_or_else(
        |_| serde_json::json!({ "state": "unknown", "confidence": "low", "fresh": false }),
    )
}

/// Read current evidence. Stale → `unknown` with `fresh: false`.
#[tauri::command]
pub fn cmd_context_presence_get() -> serde_json::Value {
    serde_json::to_value(presence::snapshot()).unwrap_or_else(
        |_| serde_json::json!({ "state": "unknown", "confidence": "low", "fresh": false }),
    )
}

/// Camera stopped / user turned it off. Drop the sample immediately so the
/// runtime falls back to foreground+input instead of holding a stale `away`.
#[tauri::command]
pub fn cmd_context_presence_clear() -> serde_json::Value {
    presence::report(Presence::Unknown, PresenceConfidence::Low);
    cmd_context_presence_get()
}
