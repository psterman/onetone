//! Non-hook usage sources for Soft Pad.
//!
//! Codex account limits come from a read-only App Server connection. Claude usage
//! comes from an opt-in OTLP/HTTP JSON metrics export. Neither path reads transcripts.

use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const CODEX_REFRESH_SECS: u64 = 5 * 60;
const CODEX_REQUEST_TIMEOUT_SECS: u64 = 15;
/// After rate+usage settle, wait at most this long for account/read.
const ACCOUNT_EXTRA_WAIT: Duration = Duration::from_millis(2500);
const OTEL_SESSION_TTL_MS: u64 = 6 * 60 * 60 * 1000;
const OTEL_SERIES_CAP: usize = 256;
pub const ENV_USAGE_ENABLED: &str = "ONETONE_AGENT_USAGE";
pub const ENV_CODEX_BIN: &str = "ONETONE_CODEX_BIN";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageWindow {
    pub id: String,
    /// primary | secondary | code_review | unknown
    pub kind: String,
    pub duration_mins: Option<u64>,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub resets_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageSnapshot {
    pub source: String,
    pub status: String,
    pub session_tokens: Option<u64>,
    pub auxiliary_tokens: Option<u64>,
    pub lifetime_tokens: Option<u64>,
    pub latest_daily_tokens: Option<u64>,
    pub latest_daily_date: String,
    pub estimated_cost_usd: Option<f64>,
    /// Compat scalar: first/highest-risk window remaining (prefer primary).
    pub remaining_percent: Option<f64>,
    pub window_duration_mins: Option<u64>,
    pub resets_at: Option<u64>,
    pub windows: Vec<UsageWindow>,
    /// chatgpt | api_key | … from account/read (never a secret).
    pub account_type: String,
    /// Masked email for UI (e.g. m***@example.com); never the full address.
    pub account_label: String,
    /// Plus / Pro / Team / … from account.planType or rate-limit planType.
    pub plan_type: String,
    pub updated_at: u64,
    pub last_success_at: u64,
    pub message: String,
}

/// Mask an email for Soft Pad UI. Never returns the full local-part.
pub fn mask_email(email: &str) -> String {
    let email = email.trim();
    let Some((local, domain)) = email.split_once('@') else {
        return String::new();
    };
    if local.is_empty() || domain.is_empty() || !domain.contains('.') {
        return String::new();
    }
    let first = local.chars().next().unwrap_or('?');
    format!("{first}***@{domain}")
}

fn usage_store() -> &'static Mutex<HashMap<AgentKind, AgentUsageSnapshot>> {
    static STORE: OnceLock<Mutex<HashMap<AgentKind, AgentUsageSnapshot>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn snapshot(agent: AgentKind) -> AgentUsageSnapshot {
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&agent)
        .cloned()
        .unwrap_or_else(|| default_snapshot(agent))
}

fn default_snapshot(agent: AgentKind) -> AgentUsageSnapshot {
    if agent == AgentKind::Cursor {
        return AgentUsageSnapshot {
            status: "unavailable".into(),
            message: "Cursor 暂无稳定官方用量接口".into(),
            ..Default::default()
        };
    }
    if agent == AgentKind::Codex && !env_enabled() {
        return AgentUsageSnapshot {
            status: "disabled".into(),
            message: "用量轮询已关闭 (ONETONE_AGENT_USAGE=0)".into(),
            ..Default::default()
        };
    }
    AgentUsageSnapshot {
        status: "unavailable".into(),
        ..Default::default()
    }
}

/// Human label for an unknown window id — duration-based, never guess "weekly".
pub fn window_display_label(window: &UsageWindow) -> String {
    match window.kind.as_str() {
        "primary" => match window.duration_mins {
            Some(mins) if mins > 0 && mins % 60 == 0 && mins <= 24 * 60 => {
                format!("{}h余", mins / 60)
            }
            Some(mins) if mins > 0 => format!("{mins}min余"),
            _ => "主窗口余".into(),
        },
        "secondary" => match window.duration_mins {
            Some(mins) if mins > 0 && mins % (24 * 60) == 0 => {
                format!("{}d余", mins / (24 * 60))
            }
            Some(mins) if mins > 0 && mins % 60 == 0 => format!("{}h余", mins / 60),
            Some(mins) if mins > 0 => format!("{mins}min窗口余"),
            _ => "次窗口余".into(),
        },
        "code_review" => "评审余".into(),
        _ => match window.duration_mins {
            Some(mins) if mins > 0 => format!("{mins}min窗口余"),
            _ => {
                if window.id.is_empty() {
                    "窗口余".into()
                } else {
                    format!("{}余", window.id)
                }
            }
        },
    }
}

fn parse_window_entry(id: &str, kind: &str, node: &Value) -> Option<UsageWindow> {
    let used = as_f64(node.get("usedPercent"));
    let remaining = used.map(|u| (100.0 - u).clamp(0.0, 100.0));
    if used.is_none()
        && node.get("windowDurationMins").is_none()
        && node.get("resetsAt").is_none()
    {
        return None;
    }
    Some(UsageWindow {
        id: id.to_string(),
        kind: kind.to_string(),
        duration_mins: as_u64(node.get("windowDurationMins")),
        used_percent: used,
        remaining_percent: remaining,
        resets_at: as_u64(node.get("resetsAt")),
    })
}

fn collect_rate_windows(rate: &Value) -> Vec<UsageWindow> {
    let mut out = Vec::new();
    if let Some(primary) = rate.get("primary") {
        if let Some(w) = parse_window_entry("primary", "primary", primary) {
            out.push(w);
        }
    }
    if let Some(secondary) = rate.get("secondary") {
        if let Some(w) = parse_window_entry("secondary", "secondary", secondary) {
            out.push(w);
        }
    }
    if let Some(cr) = rate.get("codeReview").or_else(|| rate.get("code_review")) {
        if let Some(w) = parse_window_entry("code_review", "code_review", cr) {
            out.push(w);
        }
    }
    // Unknown sibling objects under rateLimits (skip known keys).
    if let Some(obj) = rate.as_object() {
        for (key, value) in obj {
            if matches!(
                key.as_str(),
                "primary" | "secondary" | "codeReview" | "code_review"
            ) {
                continue;
            }
            if value.is_object() {
                if let Some(w) = parse_window_entry(key, "unknown", value) {
                    out.push(w);
                }
            }
        }
    }
    out
}

fn apply_compat_scalars(snap: &mut AgentUsageSnapshot) {
    let pick = snap
        .windows
        .iter()
        .find(|w| w.kind == "primary")
        .or_else(|| snap.windows.first());
    if let Some(w) = pick {
        snap.remaining_percent = w.remaining_percent;
        snap.window_duration_mins = w.duration_mins;
        snap.resets_at = w.resets_at;
    }
}

fn sync_codex_usage_health(snap: &AgentUsageSnapshot) {
    use crate::connector_health::{
        upsert, CapabilityKind, HealthState, ValueState,
    };
    let value_state = if snap.windows.iter().any(|w| w.remaining_percent.is_some())
        || snap.lifetime_tokens.is_some()
    {
        ValueState::Present
    } else if snap.status == "ready" || snap.status == "stale" {
        ValueState::Absent
    } else {
        ValueState::Absent
    };
    let (state, reason, mark_ok) = match snap.status.as_str() {
        "disabled" => (HealthState::Disabled, "usage_disabled", false),
        "ready" => (HealthState::Live, "", true),
        "stale" => (HealthState::Stale, "stale_timeout", false),
        // First poll / never succeeded: show 同步中, not 出错.
        "waiting" => (HealthState::ConfiguredWaiting, "waiting_first", false),
        _ => {
            if snap.last_success_at > 0 {
                (HealthState::Stale, "export_timeout", false)
            } else {
                (HealthState::ConfiguredWaiting, "waiting_first", false)
            }
        }
    };
    upsert(
        AgentKind::Codex,
        CapabilityKind::Usage,
        state,
        value_state,
        reason,
        &friendly_codex_usage_message(&snap.message),
        "codex_app_server",
        snap.updated_at.max(now_ms()),
        mark_ok,
    );
}

fn friendly_codex_usage_message(message: &str) -> String {
    let lower = message.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") || lower.contains("token usage profile")
    {
        return "同步超时，稍后重试".into();
    }
    if message.trim().is_empty() {
        return String::new();
    }
    message.to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn as_u64(value: Option<&Value>) -> Option<u64> {
    let value = value?;
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|n| u64::try_from(n).ok()))
        .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
}

fn as_f64(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
}

fn selected_rate_limit(result: &Value) -> Option<&Value> {
    result
        .get("rateLimitsByLimitId")
        .and_then(|v| v.get("codex"))
        .or_else(|| result.get("rateLimits"))
}

fn apply_account_identity(snap: &mut AgentUsageSnapshot, account: &Value, rate_root: Option<&Value>) {
    let account_node = account.get("account").unwrap_or(account);
    let account_type = account_node
        .get("type")
        .or_else(|| account_node.get("accountType"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(t) = account_type {
        snap.account_type = t.to_string();
    }

    let email = account_node.get("email").and_then(Value::as_str);
    if let Some(email) = email {
        let masked = mask_email(email);
        if !masked.is_empty() {
            snap.account_label = masked;
        }
    } else if snap.account_label.is_empty() {
        // API-key (or no-email) accounts: show type, never invent a plan from thin air.
        let t = snap.account_type.to_ascii_lowercase();
        if t.contains("api") || t == "apikey" || t == "api_key" {
            snap.account_label = "API Key".into();
        }
    }

    let plan_from_account = account_node
        .get("planType")
        .or_else(|| account_node.get("plan"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let plan_from_rate = rate_root
        .and_then(|r| {
            r.get("planType")
                .or_else(|| selected_rate_limit(r).and_then(|rl| rl.get("planType")))
        })
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty());
    // ChatGPT: prefer account.planType. Never invent a plan for API-key-only identity.
    if let Some(plan) = plan_from_account.or(plan_from_rate) {
        let api_key_only = snap.account_label == "API Key"
            && email.is_none()
            && plan_from_account.is_none();
        if !api_key_only {
            snap.plan_type = plan.to_string();
        }
    }
}

pub fn ingest_codex_account_results(
    rate_result: Option<&Value>,
    usage_result: Option<&Value>,
    account_result: Option<&Value>,
    error: Option<&str>,
) {
    let previous = snapshot(AgentKind::Codex);
    let mut current = previous.clone();
    current.source = "codex_app_server".into();
    let received_usage = rate_result.is_some() || usage_result.is_some();
    let attempt_at = now_ms();
    current.updated_at = attempt_at;

    if let Some(rate) = rate_result.and_then(selected_rate_limit) {
        let windows = collect_rate_windows(rate);
        if !windows.is_empty() {
            current.windows = windows;
            apply_compat_scalars(&mut current);
        }
    }

    if let Some(usage) = usage_result {
        current.lifetime_tokens = usage
            .get("summary")
            .and_then(|v| as_u64(v.get("lifetimeTokens")));
        if let Some(last) = usage
            .get("dailyUsageBuckets")
            .and_then(Value::as_array)
            .and_then(|rows| rows.last())
        {
            current.latest_daily_tokens = as_u64(last.get("tokens"));
            current.latest_daily_date = last
                .get("startDate")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
        }
    }

    if let Some(account) = account_result {
        apply_account_identity(&mut current, account, rate_result);
    } else if rate_result.is_some() {
        // Rate-limit planType fallback when account/read was unavailable.
        apply_account_identity(&mut current, &serde_json::json!({}), rate_result);
    }

    let has_data = current.windows.iter().any(|w| w.remaining_percent.is_some())
        || current.lifetime_tokens.is_some()
        || current.remaining_percent.is_some();

    // Identity alone never marks usage ready.
    if received_usage && has_data {
        current.status = "ready".into();
        current.message = String::new();
        current.last_success_at = attempt_at;
    } else if has_data
        || (previous.last_success_at > 0
            && (previous.remaining_percent.is_some()
                || !previous.windows.is_empty()
                || previous.lifetime_tokens.is_some()))
    {
        // Stale last-good (in-memory only for this process).
        if !has_data {
            current.windows = previous.windows;
            current.remaining_percent = previous.remaining_percent;
            current.window_duration_mins = previous.window_duration_mins;
            current.resets_at = previous.resets_at;
            current.lifetime_tokens = previous.lifetime_tokens;
            current.latest_daily_tokens = previous.latest_daily_tokens;
            current.latest_daily_date = previous.latest_daily_date;
            current.last_success_at = previous.last_success_at;
        }
        // Keep prior identity when this attempt did not refresh account.
        if account_result.is_none() && rate_result.is_none() {
            current.account_type = previous.account_type;
            current.account_label = previous.account_label;
            current.plan_type = previous.plan_type;
        } else if account_result.is_none() {
            if current.account_type.is_empty() {
                current.account_type = previous.account_type;
            }
            if current.account_label.is_empty() {
                current.account_label = previous.account_label;
            }
            if current.plan_type.is_empty() {
                current.plan_type = previous.plan_type;
            }
        }
        current.status = "stale".into();
        current.message = error.unwrap_or("Codex 刷新失败，显示上次成功值").to_string();
    } else if account_result.is_some() {
        // Account-only: identity saved, usage still unavailable.
        current.status = "unavailable".into();
        current.message = error.unwrap_or("Codex 窗口限额未连接").to_string();
    } else {
        current.status = "unavailable".into();
        current.message = error.unwrap_or("Codex 窗口限额未连接").to_string();
    }

    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Codex, current.clone());
    sync_codex_usage_health(&current);
}

pub fn mark_codex_usage_disabled() {
    let snap = AgentUsageSnapshot {
        source: "codex_app_server".into(),
        status: "disabled".into(),
        message: "用量轮询已关闭 (ONETONE_AGENT_USAGE=0)".into(),
        updated_at: now_ms(),
        ..Default::default()
    };
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Codex, snap.clone());
    sync_codex_usage_health(&snap);
}

/// Accept App Server notifications from a future OneTone-managed thread transport.
/// A passive account reader does not fabricate thread usage.
pub fn ingest_codex_app_server_message(message: &Value) -> bool {
    if message.get("method").and_then(Value::as_str) != Some("thread/tokenUsage/updated") {
        return false;
    }
    let Some(params) = message.get("params") else {
        return false;
    };
    let total = params.get("tokenUsage").and_then(|v| v.get("total"));
    let Some(tokens) = total.and_then(|v| as_u64(v.get("totalTokens"))) else {
        return false;
    };
    let mut current = snapshot(AgentKind::Codex);
    current.source = "codex_app_server".into();
    current.status = "ready".into();
    current.session_tokens = Some(tokens);
    current.updated_at = now_ms();
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Codex, current);
    true
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct OtelSeriesKey {
    metric: String,
    session_id: String,
    model: String,
    token_type: String,
    query_source: String,
}

#[derive(Debug, Clone, Default)]
struct OtelSeriesValue {
    value: f64,
    observed_at: u64,
}

fn otel_series() -> &'static Mutex<HashMap<OtelSeriesKey, OtelSeriesValue>> {
    static SERIES: OnceLock<Mutex<HashMap<OtelSeriesKey, OtelSeriesValue>>> = OnceLock::new();
    SERIES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn attribute_string(point: &Value, key: &str) -> String {
    point
        .get("attributes")
        .and_then(Value::as_array)
        .and_then(|attrs| {
            attrs.iter().find_map(|attr| {
                if attr.get("key").and_then(Value::as_str) != Some(key) {
                    return None;
                }
                let value = attr.get("value")?;
                value
                    .get("stringValue")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| value.get("intValue").map(|v| v.to_string()))
            })
        })
        .unwrap_or_default()
}

fn point_value(point: &Value) -> Option<f64> {
    as_f64(point.get("asDouble")).or_else(|| as_f64(point.get("asInt")))
}

fn active_claude_session(series: &HashMap<OtelSeriesKey, OtelSeriesValue>) -> String {
    let hook_session = crate::agent_model_metadata::snapshot(AgentKind::Claude).session_id;
    if !hook_session.is_empty() && series.keys().any(|key| key.session_id == hook_session) {
        return hook_session;
    }
    series
        .iter()
        .max_by_key(|(_, value)| value.observed_at)
        .map(|(key, _)| key.session_id.clone())
        .unwrap_or_default()
}

fn rebuild_claude_snapshot(series: &mut HashMap<OtelSeriesKey, OtelSeriesValue>) {
    let now = now_ms();
    // Drop expired series (in-memory TTL) and enforce cardinality — mutate in place
    // because the caller already holds `otel_series()` lock.
    series.retain(|_, v| now.saturating_sub(v.observed_at) <= OTEL_SESSION_TTL_MS);
    if series.len() > OTEL_SERIES_CAP {
        let mut rows: Vec<_> = series.iter().map(|(k, v)| (k.clone(), v.observed_at)).collect();
        rows.sort_by_key(|(_, at)| *at);
        let drop_n = rows.len().saturating_sub(OTEL_SERIES_CAP);
        for (key, _) in rows.into_iter().take(drop_n) {
            series.remove(&key);
        }
    }

    let session_id = active_claude_session(series);
    if session_id.is_empty() {
        return;
    }
    let hook_session = crate::agent_model_metadata::snapshot(AgentKind::Claude).session_id;
    let fallback = !hook_session.is_empty() && hook_session != session_id;
    let mut main_tokens = 0.0;
    let mut auxiliary_tokens = 0.0;
    let mut cost = 0.0;
    let mut has_tokens = false;
    let mut has_cost = false;
    let mut updated_at = 0;
    for (key, value) in series
        .iter()
        .filter(|(key, _)| key.session_id == session_id)
    {
        updated_at = updated_at.max(value.observed_at);
        if key.metric == "claude_code.token.usage" {
            has_tokens = true;
            if key.query_source.is_empty() || key.query_source == "main" {
                main_tokens += value.value;
            } else {
                auxiliary_tokens += value.value;
            }
        } else if key.metric == "claude_code.cost.usage" {
            has_cost = true;
            cost += value.value;
        }
    }
    let stale = now.saturating_sub(updated_at) > OTEL_SESSION_TTL_MS / 12;
    let mut message = "费用为 Claude Code 本地估算".to_string();
    if fallback {
        message.push_str(" · latest_session_fallback");
    }
    let snap = AgentUsageSnapshot {
        source: "claude_otel".into(),
        status: if stale { "stale".into() } else { "ready".into() },
        session_tokens: has_tokens.then_some(main_tokens.max(0.0).round() as u64),
        auxiliary_tokens: (auxiliary_tokens > 0.0).then_some(auxiliary_tokens.round() as u64),
        estimated_cost_usd: has_cost.then_some((cost * 1_000_000.0).round() / 1_000_000.0),
        updated_at,
        last_success_at: updated_at,
        message,
        ..Default::default()
    };
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Claude, snap.clone());
    sync_claude_usage_health(&snap);
}

fn sync_claude_usage_health(snap: &AgentUsageSnapshot) {
    use crate::connector_health::{upsert, CapabilityKind, HealthState, ValueState};
    let has_value = snap.session_tokens.is_some() || snap.estimated_cost_usd.is_some();
    let value_state = if has_value {
        ValueState::Present
    } else {
        ValueState::Absent
    };
    let (state, reason, mark_ok) = match snap.status.as_str() {
        "ready" => (HealthState::Live, "", true),
        "stale" => (HealthState::Stale, "stale_timeout", false),
        "waiting" => (HealthState::ConfiguredWaiting, "waiting_first", false),
        "disabled" => (HealthState::Disabled, "usage_disabled", false),
        _ => {
            if snap.last_success_at > 0 {
                (HealthState::Stale, "export_timeout", false)
            } else {
                (HealthState::ConfiguredWaiting, "waiting_first", false)
            }
        }
    };
    upsert(
        AgentKind::Claude,
        CapabilityKind::Usage,
        state,
        value_state,
        reason,
        &snap.message,
        "claude_otel",
        snap.updated_at.max(now_ms()),
        mark_ok,
    );
}

/// Ingest OTLP/HTTP JSON metrics. Only the two documented Claude usage metrics are retained.
pub fn ingest_claude_otel_json(raw: &str) -> Result<usize, &'static str> {
    let root: Value = serde_json::from_str(raw).map_err(|_| "invalid_json")?;
    let mut accepted = 0usize;
    let observed_now = now_ms();
    let mut series = otel_series().lock().unwrap_or_else(|e| e.into_inner());
    let resources = root
        .get("resourceMetrics")
        .and_then(Value::as_array)
        .ok_or("invalid_otlp_metrics")?;
    for resource in resources {
        let scopes = resource
            .get("scopeMetrics")
            .and_then(Value::as_array)
            .into_iter()
            .flatten();
        for scope in scopes {
            let metrics = scope
                .get("metrics")
                .and_then(Value::as_array)
                .into_iter()
                .flatten();
            for metric in metrics {
                let name = metric.get("name").and_then(Value::as_str).unwrap_or("");
                if !matches!(name, "claude_code.token.usage" | "claude_code.cost.usage") {
                    continue;
                }
                let Some(sum) = metric.get("sum") else {
                    continue;
                };
                let is_delta = match sum.get("aggregationTemporality") {
                    Some(v) if v.as_u64() == Some(1) => true,
                    Some(v) if v.as_str().map(|s| s.eq_ignore_ascii_case("delta")).unwrap_or(false) => {
                        true
                    }
                    Some(v) if v.as_u64() == Some(2) => false,
                    Some(v)
                        if v.as_str()
                            .map(|s| s.eq_ignore_ascii_case("cumulative"))
                            .unwrap_or(false) =>
                    {
                        false
                    }
                    _ => false,
                };
                let points = sum
                    .get("dataPoints")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten();
                for point in points {
                    let Some(value) = point_value(point) else {
                        continue;
                    };
                    let session_id = attribute_string(point, "session.id");
                    if session_id.is_empty() {
                        continue;
                    }
                    let key = OtelSeriesKey {
                        metric: name.to_string(),
                        session_id,
                        model: attribute_string(point, "model"),
                        token_type: attribute_string(point, "type"),
                        query_source: attribute_string(point, "query_source"),
                    };
                    let observed_at = as_u64(point.get("timeUnixNano"))
                        .map(|n| n / 1_000_000)
                        .unwrap_or(observed_now);
                    let entry = series.entry(key).or_default();
                    entry.value = if is_delta { entry.value + value } else { value };
                    entry.observed_at = observed_at;
                    accepted += 1;
                }
            }
        }
    }
    rebuild_claude_snapshot(&mut series);
    Ok(accepted)
}

fn env_enabled() -> bool {
    !matches!(
        std::env::var(ENV_USAGE_ENABLED)
            .unwrap_or_else(|_| "1".into())
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "0" | "false" | "no" | "off"
    )
}

/// Detect Claude settings.env OTel endpoint conflicts with OneTone's fixed 8796 listener.
/// Returns stable reason codes (not user-facing copy).
pub fn otel_settings_conflicts(settings: &Value) -> Vec<&'static str> {
    let Some(env) = settings.get("env").and_then(|v| v.as_object()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let endpoint = env
        .get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_end_matches('/');
    if !endpoint.is_empty()
        && endpoint != "http://127.0.0.1:8796/v1/metrics"
        && endpoint != "http://localhost:8796/v1/metrics"
    {
        out.push("otel_endpoint_conflict");
    }
    let exporter = env
        .get("OTEL_METRICS_EXPORTER")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !exporter.is_empty() && exporter != "otlp" && exporter != "none" {
        out.push("otel_exporter_conflict");
    }
    out
}

/// OneTone Claude Usage OTel env keys (same contract as scripts/claude-otel-onetone.example.json).
pub fn onetone_otel_env_pairs() -> &'static [(&'static str, &'static str)] {
    &[
        ("CLAUDE_CODE_ENABLE_TELEMETRY", "1"),
        ("OTEL_METRICS_EXPORTER", "otlp"),
        ("OTEL_LOGS_EXPORTER", "none"),
        ("OTEL_EXPORTER_OTLP_METRICS_PROTOCOL", "http/json"),
        ("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", "http://127.0.0.1:8796/v1/metrics"),
        ("OTEL_METRIC_EXPORT_INTERVAL", "10000"),
        ("OTEL_LOG_USER_PROMPTS", "0"),
        ("OTEL_LOG_ASSISTANT_RESPONSES", "0"),
        ("OTEL_LOG_TOOL_DETAILS", "0"),
    ]
}

/// Merge OneTone OTel env into Claude settings when safe.
/// - Never overwrites an existing conflicting exporter/endpoint (returns Err reason code).
/// - Fills only missing keys; leaves other env values untouched.
/// Returns Ok(added_key_count).
pub fn merge_onetone_otel_env(settings: &mut Value) -> Result<usize, &'static str> {
    let conflicts = otel_settings_conflicts(settings);
    if !conflicts.is_empty() {
        return Err(conflicts[0]);
    }
    let env = settings
        .as_object_mut()
        .ok_or("settings_not_object")?
        .entry("env")
        .or_insert_with(|| Value::Object(Default::default()));
    let env_obj = env.as_object_mut().ok_or("env_not_object")?;
    let mut added = 0usize;
    for &(key, value) in onetone_otel_env_pairs() {
        match env_obj.get(key).and_then(|v| v.as_str()).map(str::trim) {
            None | Some("") => {
                env_obj.insert(key.to_string(), Value::String(value.to_string()));
                added += 1;
            }
            Some(_) => {}
        }
    }
    Ok(added)
}

/// Mark Claude Usage as waiting after OTel env is known present (no metrics yet).
pub fn mark_claude_usage_waiting(message: &str) {
    let now = now_ms();
    let snap = AgentUsageSnapshot {
        source: "claude_otel".into(),
        status: "waiting".into(),
        updated_at: now,
        message: message.to_string(),
        ..Default::default()
    };
    let mut store = usage_store().lock().unwrap_or_else(|e| e.into_inner());
    let replace = match store.get(&AgentKind::Claude) {
        None => true,
        Some(prev) => prev.status == "unavailable" || prev.status.is_empty(),
    };
    if replace {
        store.insert(AgentKind::Claude, snap.clone());
        drop(store);
        sync_claude_usage_health(&snap);
    }
}

fn send_json_line(stdin: &mut impl Write, value: Value) -> Result<(), String> {
    serde_json::to_writer(&mut *stdin, &value).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[derive(Debug, Clone)]
struct CodexCommandSpec {
    program: OsString,
    prefix_args: Vec<OsString>,
}

fn candidate_exists(path: PathBuf) -> Option<PathBuf> {
    path.is_file().then_some(path)
}

fn path_candidates(name: &str) -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .map(|dir| dir.join(name))
        .collect()
}

#[cfg(windows)]
fn codex_command_spec() -> Result<CodexCommandSpec, String> {
    if let Some(bin) = std::env::var_os(ENV_CODEX_BIN) {
        return Ok(CodexCommandSpec {
            program: bin,
            prefix_args: Vec::new(),
        });
    }

    let appdata_npm = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|p| p.join("npm"));
    let candidates = ["codex.exe", "codex.cmd", "codex.bat"]
        .into_iter()
        .flat_map(|name| {
            let mut paths = path_candidates(name);
            if let Some(dir) = &appdata_npm {
                paths.push(dir.join(name));
            }
            paths
        });
    if let Some(path) = candidates.filter_map(candidate_exists).next() {
        return Ok(CodexCommandSpec {
            program: path.into_os_string(),
            prefix_args: Vec::new(),
        });
    }

    let ps1 = appdata_npm
        .map(|dir| dir.join("codex.ps1"))
        .into_iter()
        .chain(path_candidates("codex.ps1"))
        .filter_map(candidate_exists)
        .next();
    if let Some(path) = ps1 {
        return Ok(CodexCommandSpec {
            program: OsString::from("powershell.exe"),
            prefix_args: vec![
                OsString::from("-NoProfile"),
                OsString::from("-ExecutionPolicy"),
                OsString::from("Bypass"),
                OsString::from("-File"),
                path.into_os_string(),
            ],
        });
    }

    Err("codex app-server: codex CLI not found; install Codex CLI or set ONETONE_CODEX_BIN".into())
}

#[cfg(not(windows))]
fn codex_command_spec() -> Result<CodexCommandSpec, String> {
    if let Some(bin) = std::env::var_os(ENV_CODEX_BIN) {
        return Ok(CodexCommandSpec {
            program: bin,
            prefix_args: Vec::new(),
        });
    }
    Ok(CodexCommandSpec {
        program: OsString::from("codex"),
        prefix_args: Vec::new(),
    })
}

fn refresh_codex_account_once() -> Result<(), String> {
    let spec = codex_command_spec()?;
    let mut command = Command::new(spec.program);
    command
        .args(spec.prefix_args)
        .args(["app-server", "--stdio"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("codex app-server: {e}"))?;
    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("app-server stdin unavailable".into());
    };
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("app-server stdout unavailable".into());
    };
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                let _ = tx.send(value);
            }
        }
    });

    let send_result = (|| {
        send_json_line(
            &mut stdin,
            serde_json::json!({
                "method": "initialize",
                "id": 1,
                "params": { "clientInfo": { "name": "onetone", "title": "OneTone", "version": env!("CARGO_PKG_VERSION") } }
            }),
        )?;
        send_json_line(
            &mut stdin,
            serde_json::json!({ "method": "initialized", "params": {} }),
        )?;
        send_json_line(
            &mut stdin,
            serde_json::json!({ "method": "account/rateLimits/read", "id": 2 }),
        )?;
        send_json_line(
            &mut stdin,
            serde_json::json!({ "method": "account/usage/read", "id": 3 }),
        )?;
        send_json_line(
            &mut stdin,
            serde_json::json!({
                "method": "account/read",
                "id": 4,
                "params": { "refreshToken": false }
            }),
        )
    })();
    if let Err(error) = send_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    let deadline = std::time::Instant::now() + Duration::from_secs(CODEX_REQUEST_TIMEOUT_SECS);
    let mut rate = None;
    let mut usage = None;
    let mut account = None;
    let mut rate_settled = false;
    let mut usage_settled = false;
    let mut account_settled = false;
    let mut account_deadline: Option<std::time::Instant> = None;
    let mut errors = Vec::new();

    while std::time::Instant::now() < deadline {
        if rate_settled && usage_settled && account_settled {
            break;
        }
        if rate_settled && usage_settled {
            if account_deadline.is_none() {
                account_deadline = Some(std::time::Instant::now() + ACCOUNT_EXTRA_WAIT);
            }
            if account_deadline.is_some_and(|d| std::time::Instant::now() >= d) {
                account_settled = true;
                break;
            }
        }
        let loop_deadline = if rate_settled && usage_settled {
            account_deadline.unwrap_or(deadline).min(deadline)
        } else {
            deadline
        };
        let wait = loop_deadline.saturating_duration_since(std::time::Instant::now());
        if wait.is_zero() {
            if rate_settled && usage_settled {
                account_settled = true;
            }
            break;
        }
        let Ok(message) = rx.recv_timeout(wait.min(Duration::from_millis(500))) else {
            continue;
        };
        match message.get("id").and_then(Value::as_u64) {
            Some(2) => {
                rate_settled = true;
                if let Some(result) = message.get("result") {
                    rate = Some(result.clone());
                } else if let Some(err) = message.get("error") {
                    errors.push(
                        err.get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("rate limits unavailable")
                            .to_string(),
                    );
                }
            }
            Some(3) => {
                usage_settled = true;
                if let Some(result) = message.get("result") {
                    usage = Some(result.clone());
                } else if let Some(err) = message.get("error") {
                    errors.push(
                        err.get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("account usage unavailable")
                            .to_string(),
                    );
                }
            }
            Some(4) => {
                account_settled = true;
                if let Some(result) = message.get("result") {
                    account = Some(result.clone());
                }
                // account/read errors settle identity without poisoning usage errors.
            }
            _ => {
                let _ = ingest_codex_app_server_message(&message);
            }
        }
    }
    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    let error = (!errors.is_empty()).then(|| errors.join("; "));
    ingest_codex_account_results(
        rate.as_ref(),
        usage.as_ref(),
        account.as_ref(),
        error.as_deref(),
    );
    if rate.is_none() && usage.is_none() {
        return Err(error.unwrap_or_else(|| "Codex account usage timed out".into()));
    }
    Ok(())
}

pub fn start_codex_account_poll(app: AppHandle, state: std::sync::Arc<crate::AppState>) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if !env_enabled() {
        mark_codex_usage_disabled();
        return;
    }
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("codex-account-usage".into())
        .spawn(move || loop {
            if let Err(error) = refresh_codex_account_once() {
                ingest_codex_account_results(None, None, None, Some(&error));
            }
            crate::codex_micro_overlay::request_overlay_push(&app, state.as_ref(), false);
            std::thread::sleep(Duration::from_secs(CODEX_REFRESH_SECS));
        });
}

#[cfg(test)]
pub fn reset_for_test() {
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
    otel_series()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
    crate::connector_health::reset_for_test();
}

#[cfg(test)]
pub fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_rate_limit_is_window_remaining_not_balance() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "rateLimits": { "primary": { "usedPercent": 37.5, "windowDurationMins": 300, "resetsAt": 123 } }
        });
        let usage = serde_json::json!({
            "summary": { "lifetimeTokens": 12000 },
            "dailyUsageBuckets": [{ "startDate": "2026-08-02", "tokens": 345 }]
        });
        ingest_codex_account_results(Some(&rate), Some(&usage), None, None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.remaining_percent, Some(62.5));
        assert_eq!(got.lifetime_tokens, Some(12000));
        assert_eq!(got.latest_daily_tokens, Some(345));
        assert_eq!(got.windows.len(), 1);
        assert_eq!(got.windows[0].kind, "primary");
        assert_eq!(got.windows[0].remaining_percent, Some(62.5));
    }

    #[test]
    fn mask_email_hides_local_part() {
        assert_eq!(mask_email("mike@example.com"), "m***@example.com");
        assert_eq!(mask_email("  a@b.co  "), "a***@b.co");
        assert_eq!(mask_email("not-an-email"), "");
        assert_eq!(mask_email(""), "");
    }

    #[test]
    fn codex_account_identity_and_plan_fallback() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "planType": "Plus",
            "rateLimits": {
                "primary": { "usedPercent": 37.0, "windowDurationMins": 300, "resetsAt": 1 }
            }
        });
        let account = serde_json::json!({
            "account": { "type": "chatgpt", "email": "mike@example.com", "planType": "Pro" }
        });
        ingest_codex_account_results(Some(&rate), None, Some(&account), None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.account_type, "chatgpt");
        assert_eq!(got.account_label, "m***@example.com");
        assert_eq!(got.plan_type, "Pro"); // account wins over rate planType

        reset_for_test();
        ingest_codex_account_results(Some(&rate), None, None, None);
        let got2 = snapshot(AgentKind::Codex);
        assert_eq!(got2.plan_type, "Plus"); // rate-limit fallback
        assert!(got2.account_label.is_empty());
    }

    #[test]
    fn codex_api_key_account_no_fake_plan() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "planType": "Plus",
            "rateLimits": {
                "primary": { "usedPercent": 10.0, "windowDurationMins": 300, "resetsAt": 1 }
            }
        });
        let account = serde_json::json!({
            "account": { "type": "api_key" }
        });
        ingest_codex_account_results(Some(&rate), None, Some(&account), None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.account_type, "api_key");
        assert_eq!(got.account_label, "API Key");
        assert!(got.plan_type.is_empty(), "API Key must not inherit rate planType");
        assert_eq!(got.status, "ready");
    }

    #[test]
    fn codex_account_only_does_not_mark_usage_ready() {
        let _g = test_lock();
        reset_for_test();
        let account = serde_json::json!({
            "account": { "type": "chatgpt", "email": "mike@example.com", "planType": "Plus" }
        });
        ingest_codex_account_results(None, None, Some(&account), None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.account_label, "m***@example.com");
        assert_eq!(got.plan_type, "Plus");
        assert_eq!(got.status, "unavailable");
        assert!(got.windows.is_empty());
    }

    #[test]
    fn codex_account_timeout_keeps_rate_usage_ready() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "rateLimits": {
                "primary": { "usedPercent": 20.0, "windowDurationMins": 300, "resetsAt": 9 }
            }
        });
        let usage = serde_json::json!({ "summary": { "lifetimeTokens": 1 } });
        // Account absent (timed out) — usage still ready; no identity error.
        ingest_codex_account_results(Some(&rate), Some(&usage), None, None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.status, "ready");
        assert_eq!(got.remaining_percent, Some(80.0));
        assert!(got.account_label.is_empty());
    }

    #[test]
    fn codex_primary_and_secondary_windows() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "rateLimits": {
                "primary": { "usedPercent": 28.0, "windowDurationMins": 300, "resetsAt": 1 },
                "secondary": { "usedPercent": 59.0, "windowDurationMins": 10080, "resetsAt": 2 }
            }
        });
        ingest_codex_account_results(Some(&rate), None, None, None);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.windows.len(), 2);
        assert_eq!(got.windows[0].remaining_percent, Some(72.0));
        assert_eq!(got.windows[1].remaining_percent, Some(41.0));
        assert!(window_display_label(&got.windows[0]).contains("5h"));
        assert!(window_display_label(&got.windows[1]).contains("7d") || window_display_label(&got.windows[1]).contains("10080"));
    }

    #[test]
    fn codex_secondary_only_and_unknown_by_duration() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "rateLimits": {
                "secondary": { "usedPercent": 10.0, "windowDurationMins": 10080, "resetsAt": 9 },
                "oddBucket": { "usedPercent": 50.0, "windowDurationMins": 42, "resetsAt": 8 }
            }
        });
        ingest_codex_account_results(Some(&rate), None, None, None);
        let got = snapshot(AgentKind::Codex);
        assert!(got.windows.iter().any(|w| w.kind == "secondary"));
        let unknown = got.windows.iter().find(|w| w.kind == "unknown").expect("unknown");
        assert_eq!(window_display_label(unknown), "42min窗口余");
    }

    #[test]
    fn codex_timeout_keeps_stale_last_good() {
        let _g = test_lock();
        reset_for_test();
        let rate = serde_json::json!({
            "rateLimits": { "primary": { "usedPercent": 32.0, "windowDurationMins": 300, "resetsAt": 1 } }
        });
        let account = serde_json::json!({
            "account": { "type": "chatgpt", "email": "mike@example.com", "planType": "Plus" }
        });
        ingest_codex_account_results(Some(&rate), None, Some(&account), None);
        assert_eq!(snapshot(AgentKind::Codex).status, "ready");
        ingest_codex_account_results(None, None, None, Some("Codex CLI 未响应"));
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.status, "stale");
        assert_eq!(got.remaining_percent, Some(68.0));
        assert_eq!(got.account_label, "m***@example.com");
        assert_eq!(got.plan_type, "Plus");
        assert!(got.message.contains("未响应") || got.message.contains("上次"));
    }

    #[test]
    fn mark_disabled_when_usage_env_off() {
        let _g = test_lock();
        reset_for_test();
        mark_codex_usage_disabled();
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.status, "disabled");
        assert!(got.message.contains("ONETONE_AGENT_USAGE"));
    }

    #[test]
    fn otel_settings_conflict_codes() {
        let ok = serde_json::json!({
            "env": {
                "OTEL_METRICS_EXPORTER": "otlp",
                "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "http://127.0.0.1:8796/v1/metrics"
            }
        });
        assert!(otel_settings_conflicts(&ok).is_empty());
        let bad = serde_json::json!({
            "env": {
                "OTEL_METRICS_EXPORTER": "prometheus",
                "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "http://127.0.0.1:4318/v1/metrics"
            }
        });
        let codes = otel_settings_conflicts(&bad);
        assert!(codes.contains(&"otel_endpoint_conflict"));
        assert!(codes.contains(&"otel_exporter_conflict"));
    }

    #[test]
    fn merge_onetone_otel_env_fills_missing_only() {
        let mut settings = serde_json::json!({
            "env": {
                "ANTHROPIC_MODEL": "keep-me",
                "OTEL_METRICS_EXPORTER": "otlp"
            }
        });
        assert_eq!(merge_onetone_otel_env(&mut settings), Ok(8));
        let env = settings.get("env").unwrap();
        assert_eq!(env.get("ANTHROPIC_MODEL").and_then(|v| v.as_str()), Some("keep-me"));
        assert_eq!(
            env.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT")
                .and_then(|v| v.as_str()),
            Some("http://127.0.0.1:8796/v1/metrics")
        );
        // Second merge is idempotent.
        assert_eq!(merge_onetone_otel_env(&mut settings), Ok(0));
    }

    #[test]
    fn merge_onetone_otel_env_refuses_conflict() {
        let mut settings = serde_json::json!({
            "env": {
                "OTEL_METRICS_EXPORTER": "prometheus",
                "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "http://127.0.0.1:4318/v1/metrics"
            }
        });
        assert_eq!(merge_onetone_otel_env(&mut settings), Err("otel_endpoint_conflict"));
    }

    #[test]
    fn claude_otel_keeps_main_and_auxiliary_separate() {
        let _g = test_lock();
        reset_for_test();
        let raw = serde_json::json!({
            "resourceMetrics": [{ "scopeMetrics": [{ "metrics": [
                { "name": "claude_code.token.usage", "sum": { "aggregationTemporality": 2, "dataPoints": [
                    { "asInt": "100", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "type", "value": { "stringValue": "input" } },
                        { "key": "query_source", "value": { "stringValue": "main" } }
                    ]},
                    { "asInt": "25", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "type", "value": { "stringValue": "output" } },
                        { "key": "query_source", "value": { "stringValue": "subagent" } }
                    ]}
                ]}},
                { "name": "claude_code.cost.usage", "sum": { "aggregationTemporality": 2, "dataPoints": [
                    { "asDouble": 0.1234, "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "query_source", "value": { "stringValue": "main" } }
                    ]}
                ]}}
            ]}]}]
        });
        assert_eq!(ingest_claude_otel_json(&raw.to_string()), Ok(3));
        let got = snapshot(AgentKind::Claude);
        assert_eq!(got.session_tokens, Some(100));
        assert_eq!(got.auxiliary_tokens, Some(25));
        assert_eq!(got.estimated_cost_usd, Some(0.1234));
    }
}
