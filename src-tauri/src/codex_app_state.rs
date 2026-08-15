//! Codex application / Hook state store (P0).
//!
//! Independent from `codex_micro_vendor` thstatus. Never converts Hook payloads
//! into `v.oai.thstatus` or accepts hid/rad.

use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

pub const APP_STATE_PATH: &str = "/api/codex-app/state";
pub const MAX_BODY_BYTES: usize = 16 * 1024;
pub const HOOK_STALE_MS: u64 = 3000;
pub const IDLE_AFTER_DONE_MS: u64 = 600;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAppStatePayload {
    pub source: String,
    #[serde(default)]
    pub event: String,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub turn_id: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub permission_mode: String,
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub agent_type: String,
    #[serde(default)]
    pub ts: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAppStateView {
    pub source: String,
    pub status: String,
    pub event: String,
    pub last_event: String,
    pub last_source: String,
    /// Epoch ms when last hook/app payload was accepted (`updated_at`).
    pub last_seen_at: u64,
    pub age_ms: u64,
    pub session_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone)]
struct CodexAppStateStore {
    source: String,
    status: String,
    last_event: String,
    last_source: String,
    session_id: String,
    turn_id: String,
    updated_at_ms: u64,
    pending_idle_at_ms: u64,
}

impl Default for CodexAppStateStore {
    fn default() -> Self {
        Self {
            source: String::new(),
            status: "idle".into(),
            last_event: String::new(),
            last_source: String::new(),
            session_id: String::new(),
            turn_id: String::new(),
            updated_at_ms: 0,
            pending_idle_at_ms: 0,
        }
    }
}

fn store() -> &'static Mutex<CodexAppStateStore> {
    static STORE: OnceLock<Mutex<CodexAppStateStore>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(CodexAppStateStore::default()))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_source(raw: &str) -> Option<&'static str> {
    match raw.trim() {
        "codex_hook" => Some("codex_hook"),
        "codex_app" => Some("codex_app"),
        "claude_hook" => Some("claude_hook"),
        "claude_app" => Some("claude_app"),
        "cursor_hook" => Some("cursor_hook"),
        // Soft Pad shell agents (POST 8796 → pad_status OfficialHook)
        "workbuddy_hook" => Some("workbuddy_hook"),
        // Canonical Trae Code; legacy `trae_hook` still accepted.
        "trae_code_hook" | "trae_hook" => Some("trae_hook"),
        "qoder_hook" => Some("qoder_hook"),
        "copilot_cli_hook" => Some("copilot_cli_hook"),
        "gemini_hook" => Some("gemini_hook"),
        "cline_hook" => Some("cline_hook"),
        "opencode_hook" => Some("opencode_hook"),
        "aider_hook" => Some("aider_hook"),
        _ => None,
    }
}

/// Map lifecycle event → light status. Subagent* returns None (record only).
pub fn map_event_to_status(event: &str) -> Option<&'static str> {
    match event.trim() {
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolBatch" => Some("running"),
        "PermissionRequest" | "Elicitation" => Some("needs_input"),
        "Stop" | "TaskCompleted" => Some("done"),
        "StopFailure" | "PostToolUseFailure" => Some("failed"),
        "SessionStart" | "SessionEnd" => Some("idle"),
        _ => None,
    }
}

fn map_hook_event_to_status(source: &str, event: &str) -> Option<&'static str> {
    if source == "cursor_hook" {
        return crate::pad_status::map_cursor_event_to_state(event);
    }
    map_event_to_status(event)
}

fn looks_like_micro_action(value: &serde_json::Value) -> bool {
    let Some(obj) = value.as_object() else {
        return false;
    };
    let method = obj
        .get("m")
        .or_else(|| obj.get("method"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    matches!(method, "v.oai.hid" | "v.oai.rad")
}

/// Validate POST body: ≤16KB, JSON object, allowed source, never hid/rad.
pub fn validate_app_state_body(raw: &str) -> Result<CodexAppStatePayload, &'static str> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("empty_body");
    }
    if trimmed.len() > MAX_BODY_BYTES {
        return Err("body_too_large");
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| "invalid_json")?;
    if !value.is_object() {
        return Err("invalid_json");
    }
    if looks_like_micro_action(&value) {
        return Err("invalid_method");
    }
    let payload: CodexAppStatePayload =
        serde_json::from_value(value).map_err(|_| "invalid_json")?;
    if normalize_source(&payload.source).is_none() {
        return Err("invalid_source");
    }
    Ok(payload)
}

fn settle(store: &mut CodexAppStateStore, now: u64) {
    if store.pending_idle_at_ms > 0 && now >= store.pending_idle_at_ms && store.status == "done" {
        store.status = "idle".into();
        store.pending_idle_at_ms = 0;
    }
}

fn apply_payload_at(store: &mut CodexAppStateStore, payload: &CodexAppStatePayload, now: u64) {
    let source = normalize_source(&payload.source).unwrap_or("codex_hook");
    let event = payload.event.trim();
    let incoming_session = payload.session_id.trim();
    let sticky = store.status == "needs_input" || store.status == "running";
    let foreign_session = !incoming_session.is_empty()
        && !store.session_id.is_empty()
        && incoming_session != store.session_id;

    // Another Codex session's Stop/SessionStart must not clear this session's permission wait.
    if sticky && foreign_session && matches!(event, "Stop" | "SessionStart") {
        settle(store, now);
        return;
    }

    store.last_event = event.to_string();
    store.last_source = source.to_string();
    store.source = source.to_string();
    store.updated_at_ms = if payload.ts > 0 { payload.ts } else { now };
    if !incoming_session.is_empty() {
        store.session_id = incoming_session.to_string();
    }
    if !payload.turn_id.trim().is_empty() {
        store.turn_id = payload.turn_id.trim().to_string();
    }

    if let Some(status) = map_hook_event_to_status(source, event) {
        store.status = status.to_string();
        if status == "done" {
            store.pending_idle_at_ms = now.saturating_add(IDLE_AFTER_DONE_MS);
        } else {
            store.pending_idle_at_ms = 0;
        }
    }
    // SubagentStart/Stop: keep last_event, leave status unchanged
    settle(store, now);
}

pub fn apply_payload(payload: &CodexAppStatePayload) -> CodexAppStateView {
    let now = now_ms();
    let mut g = store().lock().unwrap();
    apply_payload_at(&mut g, payload, now);
    let view = view_from(&g, now);
    drop(g);
    // State Core — overlay / AG lights must follow pad_status, not this store alone.
    let _ = crate::pad_status::ingest_codex_payload(payload);
    view
}

fn view_from(store: &CodexAppStateStore, now: u64) -> CodexAppStateView {
    let mut local = store.clone();
    settle(&mut local, now);
    let age = if local.updated_at_ms > 0 {
        now.saturating_sub(local.updated_at_ms)
    } else {
        0
    };
    CodexAppStateView {
        source: local.source.clone(),
        status: local.status.clone(),
        event: local.last_event.clone(),
        last_event: local.last_event.clone(),
        last_source: local.last_source.clone(),
        last_seen_at: local.updated_at_ms,
        age_ms: age,
        session_id: local.session_id.clone(),
        turn_id: local.turn_id.clone(),
    }
}

pub fn snapshot() -> CodexAppStateView {
    let now = now_ms();
    let mut g = store().lock().unwrap();
    settle(&mut g, now);
    view_from(&g, now)
}

/// Fresh app/hook signal for overlay merge (not Micro native).
///
/// Reads **pad_status** State Core (legacy store remains for HTTP view / tests).
pub fn fresh_signal() -> Option<(String, String)> {
    fresh_signal_at(now_ms())
}

fn fresh_signal_at(now: u64) -> Option<(String, String)> {
    let pad = crate::pad_status::snapshot_at(now);
    if pad.updated_at == 0 {
        return None;
    }
    let sticky =
        pad.is_sticky_active(now) || matches!(pad.state.as_str(), "needs_input" | "running");
    if !sticky {
        let age = now.saturating_sub(pad.updated_at);
        if age > HOOK_STALE_MS {
            return None;
        }
    }
    // Prefer agent-aware labels for overlay statusSource (Claude Hook vs Codex Hook).
    let src = pad.display_source_label().to_string();
    Some((src, pad.state.clone()))
}

/// Apply raw JSON body; returns view on success.
pub fn apply_raw_json(raw: &str) -> Result<CodexAppStateView, String> {
    let payload = validate_app_state_body(raw).map_err(|e| e.to_string())?;
    Ok(apply_payload(&payload))
}

#[cfg(test)]
pub fn reset_for_test() {
    let mut g = store().lock().unwrap();
    *g = CodexAppStateStore::default();
    crate::pad_status::reset_for_test();
}

#[cfg(test)]
pub fn test_store_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}

#[cfg(test)]
pub fn apply_payload_at_for_test(payload: &CodexAppStatePayload, now: u64) -> CodexAppStateView {
    let mut g = store().lock().unwrap();
    apply_payload_at(&mut g, payload, now);
    let view = view_from(&g, now);
    drop(g);
    let _ = crate::pad_status::ingest_codex_app_payload_at(payload, now);
    view
}

#[cfg(test)]
pub fn snapshot_at_for_test(now: u64) -> CodexAppStateView {
    let mut g = store().lock().unwrap();
    settle(&mut g, now);
    view_from(&g, now)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(source: &str, event: &str) -> CodexAppStatePayload {
        CodexAppStatePayload {
            source: source.into(),
            event: event.into(),
            session_id: "s1".into(),
            turn_id: "t1".into(),
            cwd: String::new(),
            model: String::new(),
            permission_mode: String::new(),
            tool_name: String::new(),
            agent_id: String::new(),
            agent_type: String::new(),
            ts: 0,
        }
    }

    #[test]
    fn validate_rejects_hid_rad_and_bad_source() {
        assert_eq!(
            validate_app_state_body(r#"{"m":"v.oai.hid","p":{}}"#).err(),
            Some("invalid_method")
        );
        assert_eq!(
            validate_app_state_body(r#"{"m":"v.oai.rad","p":{}}"#).err(),
            Some("invalid_method")
        );
        assert_eq!(
            validate_app_state_body(r#"{"source":"native_micro","event":"Stop"}"#).err(),
            Some("invalid_source")
        );
        assert!(
            validate_app_state_body(r#"{"source":"codex_hook","event":"UserPromptSubmit"}"#)
                .is_ok()
        );
        assert!(validate_app_state_body(
            r#"{"source":"cursor_hook","event":"beforeSubmitPrompt"}"#
        )
        .is_ok());
    }

    #[test]
    fn reducer_core_events_and_stop_idle() {
        let _lock = test_store_lock();
        reset_for_test();
        let t0 = 1_000_000u64;
        let v1 = apply_payload_at_for_test(&payload("codex_hook", "UserPromptSubmit"), t0);
        assert_eq!(v1.status, "running");
        assert_eq!(v1.last_event, "UserPromptSubmit");
        assert_eq!(v1.last_source, "codex_hook");
        assert_eq!(v1.last_seen_at, t0);

        let v2 = apply_payload_at_for_test(&payload("codex_hook", "PermissionRequest"), t0 + 10);
        assert_eq!(v2.status, "needs_input");

        let v3 = apply_payload_at_for_test(&payload("codex_hook", "Stop"), t0 + 20);
        assert_eq!(v3.status, "done");
        assert_eq!(v3.last_event, "Stop");

        let v4 = snapshot_at_for_test(t0 + 20 + IDLE_AFTER_DONE_MS);
        assert_eq!(v4.status, "idle");
        assert_eq!(v4.last_event, "Stop");
        assert_eq!(v4.last_source, "codex_hook");
    }

    #[test]
    fn needs_input_stays_fresh_past_stale_window() {
        let _lock = test_store_lock();
        reset_for_test();
        let t0 = 2_000_000u64;
        let _ = apply_payload_at_for_test(&payload("codex_hook", "PermissionRequest"), t0);
        let late = t0 + HOOK_STALE_MS + 60_000;
        let sig = fresh_signal_at(late).expect("sticky needs_input");
        assert_eq!(sig.0, "codex_hook");
        assert_eq!(sig.1, "needs_input");

        // done is not sticky — expires after HOOK_STALE_MS (and settle→idle).
        let _ = apply_payload_at_for_test(&payload("codex_hook", "Stop"), t0);
        let after_done = t0 + IDLE_AFTER_DONE_MS + HOOK_STALE_MS + 1;
        assert!(fresh_signal_at(after_done).is_none());
    }

    #[test]
    fn foreign_session_stop_does_not_clear_needs_input() {
        let _lock = test_store_lock();
        reset_for_test();
        let t0 = 3_000_000u64;
        let mut p = payload("codex_hook", "PermissionRequest");
        p.session_id = "session-a".into();
        let _ = apply_payload_at_for_test(&p, t0);
        assert_eq!(snapshot_at_for_test(t0).status, "needs_input");

        let mut stop = payload("codex_hook", "Stop");
        stop.session_id = "session-b".into();
        let v = apply_payload_at_for_test(&stop, t0 + 50);
        assert_eq!(v.status, "needs_input");
        assert_eq!(v.last_event, "PermissionRequest");

        // Same session Stop still clears.
        let mut stop_a = payload("codex_hook", "Stop");
        stop_a.session_id = "session-a".into();
        let v2 = apply_payload_at_for_test(&stop_a, t0 + 100);
        assert_eq!(v2.status, "done");
    }

    #[test]
    fn needs_input_clears_on_pre_tool_use_not_timer() {
        let _lock = test_store_lock();
        reset_for_test();
        let t0 = 4_000_000u64;
        let mut p = payload("codex_hook", "PermissionRequest");
        p.session_id = "s-hold".into();
        let _ = apply_payload_at_for_test(&p, t0);
        // Still waiting after a long wall-clock gap — no blind timer demote.
        assert_eq!(snapshot_at_for_test(t0 + 120_000).status, "needs_input");
        let mut pre = payload("codex_hook", "PreToolUse");
        pre.session_id = "s-hold".into();
        let v = apply_payload_at_for_test(&pre, t0 + 120_010);
        assert_eq!(v.status, "running");
    }

    #[test]
    fn subagent_records_event_without_forcing_light() {
        let _lock = test_store_lock();
        reset_for_test();
        let t0 = 2_000_000u64;
        let _ = apply_payload_at_for_test(&payload("codex_hook", "UserPromptSubmit"), t0);
        let v = apply_payload_at_for_test(&payload("codex_hook", "SubagentStart"), t0 + 5);
        assert_eq!(v.status, "running");
        assert_eq!(v.last_event, "SubagentStart");
    }

    #[test]
    fn source_must_be_a_supported_loopback_ingress() {
        assert_eq!(normalize_source("codex_hook"), Some("codex_hook"));
        assert_eq!(normalize_source("codex_app"), Some("codex_app"));
        assert_eq!(normalize_source("claude_hook"), Some("claude_hook"));
        assert_eq!(normalize_source("cursor_hook"), Some("cursor_hook"));
        assert_eq!(normalize_source("workbuddy_hook"), Some("workbuddy_hook"));
        assert_eq!(normalize_source("trae_hook"), Some("trae_hook"));
        assert_eq!(normalize_source("trae_code_hook"), Some("trae_hook"));
        assert_eq!(normalize_source("qoder_hook"), Some("qoder_hook"));
        assert_eq!(normalize_source("native_micro"), None);
        assert_eq!(normalize_source("native"), None);
    }
}
