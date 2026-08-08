//! Shared models & helpers for shell-agent Soft Pad usage.
//!
//! Contract: official remaining ≠ local burn. Never invent remaining % from tokens.

use crate::agent_usage::{AgentUsageSnapshot, UsageWindow};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

pub const REFRESH_SECS: u64 = 5 * 60;
pub const HTTP_TIMEOUT_SECS: u64 = 15;

pub const QODER_CONSOLE: &str = "https://qoder.com/pricing";
pub const WORKBUDDY_CONSOLE: &str = "https://www.codebuddy.cn/";
pub const TRAE_CONSOLE: &str = "https://www.trae.ai/";

pub const SRC_QODER_LOCAL: &str = "qoder_local_session";
pub const SRC_QODER_OPENAPI: &str = "qoder_openapi";
pub const SRC_QODER_MANUAL: &str = "qoder_manual";
pub const SRC_WB_LOCAL: &str = "workbuddy_local_session";
pub const SRC_WB_MANUAL: &str = "workbuddy_manual";
pub const SRC_TRAE_ENTITLEMENT: &str = "trae_entitlement_api";
pub const SRC_TRAE_MANUAL: &str = "trae_manual";

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn env_str(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn number(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_i64().map(|n| n as f64))
        .or_else(|| v.as_u64().map(|n| n as f64))
        .or_else(|| v.as_str()?.trim().parse().ok())
}

pub fn window_from_remaining_pct(
    id: &str,
    kind: &str,
    remaining_pct: f64,
    resets_at: Option<u64>,
) -> UsageWindow {
    let rem = remaining_pct.clamp(0.0, 100.0);
    UsageWindow {
        id: id.into(),
        kind: kind.into(),
        duration_mins: None,
        used_percent: Some((100.0 - rem).clamp(0.0, 100.0)),
        remaining_percent: Some(rem),
        resets_at,
    }
}

pub fn credits_message(remaining: f64, unit: &str) -> String {
    let unit = if unit.is_empty() { "Credits" } else { unit };
    if remaining.fract().abs() < 0.05 {
        format!("剩余 {} {unit}", remaining.round() as i64)
    } else {
        format!("剩余 {remaining:.1} {unit}")
    }
}

pub fn manual_snap(source: &str, account: &str, console: &str, message: &str) -> AgentUsageSnapshot {
    let now = now_ms();
    AgentUsageSnapshot {
        source: source.into(),
        status: "ready".into(),
        confidence: "manual_or_local_estimate".into(),
        message: message.into(),
        account_label: account.into(),
        console_url: console.into(),
        updated_at: now,
        last_success_at: now,
        ..Default::default()
    }
}

pub fn unavailable_snap(source: &str, message: &str, console: &str) -> AgentUsageSnapshot {
    AgentUsageSnapshot {
        source: source.into(),
        status: "unavailable".into(),
        message: message.into(),
        console_url: console.into(),
        updated_at: now_ms(),
        ..Default::default()
    }
}

/// Attach local burn counters without touching official remaining fields.
pub fn attach_local(snap: &mut AgentUsageSnapshot, today: Option<u64>, month: Option<u64>) {
    if let Some(t) = today.filter(|t| *t > 0) {
        snap.local_today_tokens = Some(t);
    }
    if let Some(m) = month.filter(|m| *m > 0) {
        snap.local_month_tokens = Some(m);
    }
}

pub fn format_reset_ymd(epoch_ms: u64) -> Option<String> {
    if epoch_ms < 1_000_000_000_000 || epoch_ms > 4102444800000 {
        return None;
    }
    let secs = (epoch_ms / 1000) as i64;
    // Reject far-future sentinel (Qoder free often uses year 9999).
    if secs > 4102444800 {
        return None;
    }
    const DAY: i64 = 86400;
    let days = secs / DAY;
    let (y, m, d) = civil_from_days(days);
    Some(format!("{y}年{m}月{d}日"))
}

/// Howard Hinnant civil_from_days (proleptic Gregorian), days since Unix epoch.
pub fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn utc_ymdhms_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    const DAY: u64 = 86400;
    let days = secs / DAY;
    let rem = secs % DAY;
    let (y, m, d) = civil_from_days(days as i64);
    let hh = rem / 3600;
    let mm = (rem % 3600) / 60;
    let ss = rem % 60;
    format!("{y:04}-{m:02}-{d:02} {hh:02}:{mm:02}:{ss:02}")
}
