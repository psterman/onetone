//! Pending confirmation records for cross-channel confirm (camera → key/voice/softPad).
//!
//! Scope key: actionId + mappingId + providerId (all required for auto-match).
//! None is never a cross-scope wildcard.

use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

pub const PENDING_TTL_SECS: u64 = 60;

#[derive(Debug, Clone)]
pub struct PendingConfirmation {
    pub id: String,
    pub action_id: String,
    pub source_channel: String,
    pub mapping_id: Option<String>,
    pub provider_id: Option<String>,
    pub created_at: Instant,
    pub expires_at: Instant,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingConfirmationPublic {
    pub confirmation_id: String,
    pub action_id: String,
    pub source_channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    pub expires_in_ms: u64,
}

static STORE: LazyLock<Mutex<HashMap<String, PendingConfirmation>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn purge_expired(map: &mut HashMap<String, PendingConfirmation>) {
    let now = Instant::now();
    map.retain(|_, v| v.expires_at > now);
}

fn scope_key(action_id: &str, mapping_id: &str, provider_id: &str) -> String {
    format!("{action_id}\0{mapping_id}\0{provider_id}")
}

fn row_scope(row: &PendingConfirmation) -> Option<String> {
    let m = row.mapping_id.as_deref()?.trim();
    let p = row.provider_id.as_deref()?.trim();
    if m.is_empty() || p.is_empty() {
        return None;
    }
    Some(scope_key(&row.action_id, m, p))
}

/// Insert pending. Same actionId+mappingId+providerId replaces older row(s).
pub fn insert_pending(
    id: String,
    action_id: String,
    source_channel: String,
    mapping_id: Option<String>,
    provider_id: Option<String>,
) -> PendingConfirmation {
    let now = Instant::now();
    let row = PendingConfirmation {
        id: id.clone(),
        action_id,
        source_channel,
        mapping_id,
        provider_id,
        created_at: now,
        expires_at: now + Duration::from_secs(PENDING_TTL_SECS),
    };
    if let Ok(mut g) = STORE.lock() {
        purge_expired(&mut g);
        if let Some(sk) = row_scope(&row) {
            g.retain(|_, v| row_scope(v).as_deref() != Some(sk.as_str()));
        }
        g.insert(id, row.clone());
    }
    row
}

pub fn take_valid(id: &str, completing_channel: &str) -> Result<PendingConfirmation, &'static str> {
    let id = id.trim();
    if id.is_empty() {
        return Err("missing_confirmation_id");
    }
    let mut g = STORE.lock().map_err(|_| "store_poisoned")?;
    purge_expired(&mut g);
    let Some(row) = g.remove(id) else {
        return Err("unknown_confirmation_id");
    };
    if Instant::now() >= row.expires_at {
        return Err("confirmation_expired");
    }
    // Camera cannot complete its own pending; key/voice/softPad may.
    if completing_channel == "camera" {
        g.insert(row.id.clone(), row);
        return Err("camera_cannot_complete_confirmation");
    }
    if completing_channel != "key"
        && completing_channel != "voice"
        && completing_channel != "softPad"
    {
        g.insert(row.id.clone(), row);
        return Err("invalid_confirm_channel");
    }
    Ok(row)
}

/// Atomically take pending only when actionId matches. Mismatch leaves row untouched (TTL preserved).
pub fn take_valid_if_action_matches(
    id: &str,
    completing_channel: &str,
    expected_action_id: &str,
) -> Result<PendingConfirmation, &'static str> {
    let id = id.trim();
    if id.is_empty() {
        return Err("missing_confirmation_id");
    }
    let expected = expected_action_id.trim();
    let mut g = STORE.lock().map_err(|_| "store_poisoned")?;
    purge_expired(&mut g);
    let Some(row) = g.get(id) else {
        return Err("unknown_confirmation_id");
    };
    if Instant::now() >= row.expires_at {
        g.remove(id);
        return Err("confirmation_expired");
    }
    if completing_channel == "camera" {
        return Err("camera_cannot_complete_confirmation");
    }
    if completing_channel != "key"
        && completing_channel != "voice"
        && completing_channel != "softPad"
    {
        return Err("invalid_confirm_channel");
    }
    if row.action_id != expected {
        return Err("confirmation_action_mismatch");
    }
    Ok(g.remove(id).expect("just checked"))
}

static TEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// Serialize pending integration tests (global store).
pub fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

/// Cancel pending without executing. Camera may cancel its own proposal.
pub fn cancel(id: &str) -> Result<PendingConfirmation, &'static str> {
    let id = id.trim();
    if id.is_empty() {
        return Err("missing_confirmation_id");
    }
    let mut g = STORE.lock().map_err(|_| "store_poisoned")?;
    purge_expired(&mut g);
    g.remove(id).ok_or("unknown_confirmation_id")
}

/// Auto-match by exact scope. Mapping+provider must be non-empty.
/// - 0 matches → Ok(None) caller executes normally
/// - 1 match → Ok(Some(row)) consumed
/// - >1 → Err(confirmation_ambiguous) nothing consumed
pub fn take_unique_match(
    action_id: &str,
    completing_channel: &str,
    mapping_id: Option<&str>,
    provider_id: Option<&str>,
) -> Result<Option<PendingConfirmation>, &'static str> {
    if completing_channel == "camera" {
        return Ok(None);
    }
    if completing_channel != "key"
        && completing_channel != "voice"
        && completing_channel != "softPad"
    {
        return Ok(None);
    }
    let mid = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    let pid = provider_id.map(str::trim).filter(|s| !s.is_empty());
    let (Some(mid), Some(pid)) = (mid, pid) else {
        // Incomplete scope: never cross-match.
        return Ok(None);
    };
    let want = scope_key(action_id.trim(), mid, pid);
    let mut g = STORE.lock().map_err(|_| "store_poisoned")?;
    purge_expired(&mut g);
    let ids: Vec<String> = g
        .iter()
        .filter(|(_, v)| row_scope(v).as_deref() == Some(want.as_str()))
        .map(|(k, _)| k.clone())
        .collect();
    match ids.len() {
        0 => Ok(None),
        1 => Ok(g.remove(&ids[0])),
        _ => Err("confirmation_ambiguous"),
    }
}

/// Cancel unique approve pending in scope (for agent.reject). Does not execute Esc.
pub fn cancel_unique_match(
    action_id: &str,
    mapping_id: Option<&str>,
    provider_id: Option<&str>,
) -> Result<Option<PendingConfirmation>, &'static str> {
    let mid = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    let pid = provider_id.map(str::trim).filter(|s| !s.is_empty());
    let (Some(mid), Some(pid)) = (mid, pid) else {
        return Ok(None);
    };
    let want = scope_key(action_id.trim(), mid, pid);
    let mut g = STORE.lock().map_err(|_| "store_poisoned")?;
    purge_expired(&mut g);
    let ids: Vec<String> = g
        .iter()
        .filter(|(_, v)| row_scope(v).as_deref() == Some(want.as_str()))
        .map(|(k, _)| k.clone())
        .collect();
    match ids.len() {
        0 => Ok(None),
        1 => Ok(g.remove(&ids[0])),
        _ => Err("confirmation_ambiguous"),
    }
}

pub fn peek_public(id: &str) -> Option<PendingConfirmationPublic> {
    let mut g = STORE.lock().ok()?;
    purge_expired(&mut g);
    let row = g.get(id.trim())?;
    Some(to_public(row))
}

/// Snapshot: all valid rows, optionally filtered by mappingId.
pub fn list_public(mapping_id: Option<&str>) -> Vec<PendingConfirmationPublic> {
    let Ok(mut g) = STORE.lock() else {
        return vec![];
    };
    purge_expired(&mut g);
    let filter = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    let mut rows: Vec<&PendingConfirmation> = g
        .values()
        .filter(|r| match filter {
            None => true,
            Some(mid) => r.mapping_id.as_deref().map(str::trim) == Some(mid),
        })
        .collect();
    rows.sort_by_key(|r| std::cmp::Reverse(r.created_at));
    rows.iter().map(|r| to_public(r)).collect()
}

fn to_public(row: &PendingConfirmation) -> PendingConfirmationPublic {
    let left = row.expires_at.saturating_duration_since(Instant::now());
    PendingConfirmationPublic {
        confirmation_id: row.id.clone(),
        action_id: row.action_id.clone(),
        source_channel: row.source_channel.clone(),
        mapping_id: row.mapping_id.clone(),
        provider_id: row.provider_id.clone(),
        expires_in_ms: left.as_millis() as u64,
    }
}

/// Acceptance-only: shrink TTL so expire UI can be captured without waiting 60s.
#[cfg(feature = "bfinal_e2e")]
pub fn e2e_force_expire_soon(id: &str, secs: u64) {
    if let Ok(mut g) = STORE.lock() {
        if let Some(row) = g.get_mut(id.trim()) {
            row.expires_at = Instant::now() + Duration::from_secs(secs.max(1));
        }
    }
}

pub fn reset_for_test() {
    if let Ok(mut g) = STORE.lock() {
        g.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camera_cannot_complete_own_pending() {
        let _g = test_lock();
        reset_for_test();
        let row = insert_pending(
            "c1".into(),
            "input.send".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        assert!(take_valid(&row.id, "camera").is_err());
        assert!(peek_public(&row.id).is_some());
        assert!(take_valid(&row.id, "key").is_ok());
        assert!(peek_public(&row.id).is_none());
    }

    #[test]
    fn same_scope_replaces() {
        let _g = test_lock();
        reset_for_test();
        insert_pending(
            "old".into(),
            "agent.approve".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        insert_pending(
            "new".into(),
            "agent.approve".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        assert!(peek_public("old").is_none());
        assert!(peek_public("new").is_some());
    }

    #[test]
    fn unique_match_requires_full_scope() {
        let _g = test_lock();
        reset_for_test();
        insert_pending(
            "p1".into(),
            "input.send".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        assert!(take_unique_match("input.send", "key", None, Some("codex"))
            .unwrap()
            .is_none());
        let taken = take_unique_match("input.send", "key", Some("m1"), Some("codex"))
            .unwrap()
            .expect("unique");
        assert_eq!(taken.id, "p1");
    }

    #[test]
    fn cancel_does_not_execute() {
        let _g = test_lock();
        reset_for_test();
        insert_pending(
            "x".into(),
            "agent.approve".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        assert!(cancel("x").is_ok());
        assert!(peek_public("x").is_none());
    }

    #[test]
    fn mismatch_does_not_remove_or_refresh() {
        let _g = test_lock();
        reset_for_test();
        let row = insert_pending(
            "m".into(),
            "input.send".into(),
            "camera".into(),
            Some("m1".into()),
            Some("codex".into()),
        );
        let before = peek_public(&row.id).unwrap().expires_in_ms;
        assert_eq!(
            take_valid_if_action_matches(&row.id, "key", "input.commit").unwrap_err(),
            "confirmation_action_mismatch"
        );
        let after = peek_public(&row.id).unwrap();
        assert!(after.expires_in_ms <= before + 2000);
    }
}
