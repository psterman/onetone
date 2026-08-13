//! Non-hook usage sources for Soft Pad.
//!
//! Codex account limits come from a read-only App Server connection. Claude usage
//! comes from statusLine windows, optional OTLP/HTTP metrics, or — when Claude Code
//! points `ANTHROPIC_BASE_URL` at DeepSeek — `GET /user/balance` (cash balance, not %).
//! Neither path reads transcripts.

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
const DEEPSEEK_REFRESH_SECS: u64 = 5 * 60;
const DEEPSEEK_REQUEST_TIMEOUT_SECS: u64 = 15;
const DEEPSEEK_BALANCE_URL: &str = "https://api.deepseek.com/user/balance";
const CODEX_REQUEST_TIMEOUT_SECS: u64 = 15;
/// After rate+usage settle, wait at most this long for account/read.
const ACCOUNT_EXTRA_WAIT: Duration = Duration::from_millis(2500);
const OTEL_SESSION_TTL_MS: u64 = 6 * 60 * 60 * 1000;
const OTEL_SERIES_CAP: usize = 256;
/// statusLine windows: ready while fresh, keep as stale, then drop.
const STATUSLINE_READY_MS: u64 = 15 * 60 * 1000;
const STATUSLINE_KEEP_MS: u64 = 6 * 60 * 60 * 1000;
const RESETS_AT_PAST_SLACK_SECS: i64 = 10 * 60;
const RESETS_AT_FUTURE_MAX_SECS: i64 = 8 * 24 * 60 * 60;
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
    /// official | stale | local_only | manual_or_local_estimate (empty = legacy)
    #[serde(default)]
    pub confidence: String,
    #[serde(default)]
    pub console_url: String,
    #[serde(default)]
    pub coding_plan_warning: bool,
    #[serde(default)]
    pub local_today_tokens: Option<u64>,
    #[serde(default)]
    pub local_month_tokens: Option<u64>,
    #[serde(default)]
    pub local_today_requests: Option<u64>,
    /// Activity Provider: local sessions touched today (not official quota).
    #[serde(default)]
    pub local_today_sessions: Option<u64>,
    /// Activity Provider: crude active span sum for today (ms).
    #[serde(default)]
    pub local_today_active_ms: Option<u64>,
    /// Activity Provider: yesterday turn count for day-over-day dialogue delta.
    #[serde(default)]
    pub local_yesterday_requests: Option<u64>,
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

/// Insert / replace a usage snapshot (shell agents, providers, tests).
pub fn put_snapshot(agent: AgentKind, snap: AgentUsageSnapshot) {
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(agent, snap);
}

/// Put usage + sync connector health (MiniMax side-channel / Soft Pad).
pub fn put_usage_snapshot(agent: AgentKind, snap: AgentUsageSnapshot) {
    let has_windows = snap.windows.iter().any(|w| {
        w.remaining_percent
            .is_some_and(|p| p.is_finite() && (0.0..=100.0).contains(&p))
    });
    put_snapshot(agent, snap.clone());
    sync_usage_health(agent, &snap, has_windows);
}

fn default_snapshot(agent: AgentKind) -> AgentUsageSnapshot {
    if agent == AgentKind::Cursor {
        return AgentUsageSnapshot {
            status: "unavailable".into(),
            source: crate::cursor_local_activity::SRC_CURSOR_LOCAL.into(),
            confidence: "local_only".into(),
            message: if crate::cursor_local_activity::consent_enabled() {
                "Cursor 活动统计暂不可用".into()
            } else {
                "未启用 Cursor 活动统计".into()
            },
            console_url: crate::cursor_local_activity::CURSOR_USAGE_CONSOLE.into(),
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
            // Window length ≠ days until reset (Codex "Weekly … Aug 8").
            Some(mins) if mins > 0 && mins % (24 * 60) == 0 => {
                let days = mins / (24 * 60);
                if days == 7 {
                    "周余".into()
                } else {
                    format!("{days}天窗余")
                }
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
    let lane_hit = crate::agent_lane::app_server_bridge::ingest_app_server_message(message);
    if message.get("method").and_then(Value::as_str) != Some("thread/tokenUsage/updated") {
        return lane_hit;
    }
    let Some(params) = message.get("params") else {
        return lane_hit;
    };
    let total = params.get("tokenUsage").and_then(|v| v.get("total"));
    let Some(tokens) = total.and_then(|v| as_u64(v.get("totalTokens"))) else {
        return lane_hit;
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

#[derive(Debug, Clone, Default)]
struct ClaudeOtelState {
    session_tokens: Option<u64>,
    auxiliary_tokens: Option<u64>,
    estimated_cost_usd: Option<f64>,
    session_id: String,
    observed_at: u64,
    message: String,
    stale: bool,
}

#[derive(Debug, Clone, Default)]
struct ClaudeStatusLineState {
    windows: Vec<UsageWindow>,
    session_id: String,
    model_id: String,
    observed_at: u64,
    /// True when the latest payload had an explicit rate_limits object (even if empty).
    saw_rate_limits: bool,
}

fn otel_series() -> &'static Mutex<HashMap<OtelSeriesKey, OtelSeriesValue>> {
    static SERIES: OnceLock<Mutex<HashMap<OtelSeriesKey, OtelSeriesValue>>> = OnceLock::new();
    SERIES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn claude_otel_state() -> &'static Mutex<ClaudeOtelState> {
    static STATE: OnceLock<Mutex<ClaudeOtelState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(ClaudeOtelState::default()))
}

fn claude_statusline_state() -> &'static Mutex<ClaudeStatusLineState> {
    static STATE: OnceLock<Mutex<ClaudeStatusLineState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(ClaudeStatusLineState::default()))
}

fn is_main_query_source(value: &str) -> bool {
    matches!(value, "" | "main" | "repl_main_thread")
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

fn rebuild_claude_otel_state(series: &mut HashMap<OtelSeriesKey, OtelSeriesValue>) {
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
            if is_main_query_source(&key.query_source) {
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
    let otel = ClaudeOtelState {
        session_tokens: has_tokens.then_some(main_tokens.max(0.0).round() as u64),
        auxiliary_tokens: (auxiliary_tokens > 0.0).then_some(auxiliary_tokens.round() as u64),
        estimated_cost_usd: has_cost.then_some((cost * 1_000_000.0).round() / 1_000_000.0),
        session_id,
        observed_at: updated_at,
        message,
        stale,
    };
    *claude_otel_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = otel;
    compose_claude_snapshot();
}

fn parse_statusline_used_percent(node: &Value) -> Option<f64> {
    let raw = node
        .get("used_percentage")
        .or_else(|| node.get("usedPercentage"))?;
    // Numbers only — reject strings / timestamps masquerading as percentages.
    let used = raw.as_f64()?;
    if !used.is_finite() || !(0.0..=100.0).contains(&used) {
        return None;
    }
    Some(used)
}

fn parse_statusline_resets_at(node: &Value, now_secs: u64) -> Option<u64> {
    let raw = node.get("resets_at").or_else(|| node.get("resetsAt"))?;
    let resets = raw.as_u64().or_else(|| {
        raw.as_i64()
            .and_then(|n| u64::try_from(n).ok())
            .or_else(|| raw.as_f64().and_then(|f| {
                if f.is_finite() && f > 0.0 && f < 1e12 {
                    Some(f as u64)
                } else {
                    None
                }
            }))
    })?;
    if resets == 0 {
        return None;
    }
    // Reject millisecond timestamps that slipped into seconds field.
    if resets >= 1_000_000_000_000 {
        return None;
    }
    let now = now_secs as i64;
    let r = resets as i64;
    if r < now - RESETS_AT_PAST_SLACK_SECS {
        return None;
    }
    if r > now + RESETS_AT_FUTURE_MAX_SECS {
        return None;
    }
    Some(resets)
}

fn parse_statusline_window(
    id: &str,
    kind: &str,
    duration_mins: u64,
    node: Option<&Value>,
    now_secs: u64,
) -> Option<UsageWindow> {
    let node = node?;
    if !node.is_object() {
        return None;
    }
    let used = parse_statusline_used_percent(node)?;
    let remaining = (100.0 - used).clamp(0.0, 100.0);
    Some(UsageWindow {
        id: id.to_string(),
        kind: kind.to_string(),
        duration_mins: Some(duration_mins),
        used_percent: Some(used),
        remaining_percent: Some(remaining),
        resets_at: parse_statusline_resets_at(node, now_secs),
    })
}

/// Ingest Claude Code statusLine JSON (session_id + rate_limits). Per-window reject.
pub fn ingest_claude_statusline_json(raw: &str) -> Result<usize, &'static str> {
    let root: Value = serde_json::from_str(raw).map_err(|_| "invalid_json")?;
    let now = now_ms();
    let now_secs = now / 1000;
    let session_id = root
        .get("session_id")
        .or_else(|| root.get("sessionId"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let model_id = root
        .get("model")
        .and_then(|m| {
            if let Some(id) = m.get("id").and_then(Value::as_str) {
                Some(id.to_string())
            } else {
                m.as_str().map(str::to_string)
            }
        })
        .unwrap_or_default();

    let rate = root.get("rate_limits").or_else(|| root.get("rateLimits"));
    let saw_rate_limits = rate.map(|v| v.is_object()).unwrap_or(false);

    let mut windows = Vec::new();
    let mut accepted = 0usize;
    if let Some(rate) = rate.filter(|v| v.is_object()) {
        if let Some(w) = parse_statusline_window(
            "five_hour",
            "primary",
            300,
            rate.get("five_hour").or_else(|| rate.get("fiveHour")),
            now_secs,
        ) {
            windows.push(w);
            accepted += 1;
        }
        if let Some(w) = parse_statusline_window(
            "seven_day",
            "secondary",
            10080,
            rate.get("seven_day").or_else(|| rate.get("sevenDay")),
            now_secs,
        ) {
            windows.push(w);
            accepted += 1;
        }
    }

    {
        let mut sl = claude_statusline_state()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        // Explicit rate_limits (including empty) replaces prior windows — no forever-keep.
        // Missing rate_limits key leaves prior state untouched (partial/diagnostic payload).
        if saw_rate_limits {
            // Session change: do not glue old windows onto a new session.
            if !session_id.is_empty()
                && !sl.session_id.is_empty()
                && session_id != sl.session_id
            {
                sl.windows.clear();
            }
            sl.windows = windows;
            sl.saw_rate_limits = true;
            sl.observed_at = now;
            if !session_id.is_empty() {
                sl.session_id = session_id.clone();
            }
            if !model_id.is_empty() {
                sl.model_id = model_id.clone();
            }
        } else if accepted == 0 && !session_id.is_empty() && sl.session_id != session_id {
            // Session id only, no rate_limits — clear stale other-session windows.
            sl.windows.clear();
            sl.session_id = session_id.clone();
            sl.observed_at = now;
            sl.saw_rate_limits = false;
            if !model_id.is_empty() {
                sl.model_id = model_id.clone();
            }
        } else {
            if !session_id.is_empty() {
                sl.session_id = session_id.clone();
            }
            if !model_id.is_empty() {
                sl.model_id = model_id.clone();
            }
        }
    }
    if !model_id.is_empty() {
        crate::agent_model_metadata::ingest_statusline_model(&session_id, &model_id, now);
    }
    compose_claude_snapshot();
    Ok(accepted)
}

#[derive(Debug, Clone, Default)]
struct DeepSeekBalanceState {
    /// Claude settings currently point at api.deepseek.com.
    detected: bool,
    currency: String,
    total_balance: String,
    caption: String,
    status: String,
    observed_at: u64,
    last_success_at: u64,
    message: String,
}

fn deepseek_balance_state() -> &'static Mutex<DeepSeekBalanceState> {
    static STATE: OnceLock<Mutex<DeepSeekBalanceState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(DeepSeekBalanceState::default()))
}

fn claude_settings_json_path() -> PathBuf {
    #[cfg(test)]
    if let Some(p) = deepseek_settings_override().lock().unwrap().clone() {
        return p;
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".claude").join("settings.json");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".claude").join("settings.json");
    }
    PathBuf::from(".claude").join("settings.json")
}

#[cfg(test)]
fn deepseek_settings_override() -> &'static Mutex<Option<PathBuf>> {
    static OVR: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    OVR.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub fn set_deepseek_settings_path_override_for_test(path: Option<PathBuf>) {
    *deepseek_settings_override().lock().unwrap() = path;
}

/// Host-only match: official DeepSeek API (not random relays).
pub fn is_deepseek_api_base(url: &str) -> bool {
    let raw = url.trim();
    if raw.is_empty() {
        return false;
    }
    let lower = raw.to_ascii_lowercase();
    let without_scheme = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(lower.as_str());
    let host = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim();
    host == "api.deepseek.com"
}

fn env_str_from_settings(env: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = env.get(*key).and_then(|x| x.as_str()).map(str::trim) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// Parse Claude Code settings for DeepSeek base URL + Bearer key.
/// Returns `(base_url, api_key)` only when base URL host is api.deepseek.com.
pub fn parse_claude_deepseek_auth(contents: &str) -> Option<(String, String)> {
    let v: Value = serde_json::from_str(contents).ok()?;
    let env = v.get("env")?.as_object()?;
    let base = env_str_from_settings(
        env,
        &[
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_API_BASE",
            "ANTHROPIC_BASE_URL_OVERRIDE",
        ],
    )?;
    if !is_deepseek_api_base(&base) {
        return None;
    }
    let key = env_str_from_settings(
        env,
        &[
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_API_KEY",
            "DEEPSEEK_API_KEY",
        ],
    )
    .unwrap_or_default();
    Some((base, key))
}

pub fn format_deepseek_balance_caption(currency: &str, total_balance: &str) -> String {
    let bal = total_balance.trim();
    if bal.is_empty() {
        return "DeepSeek 余额".into();
    }
    let cur = currency.trim().to_ascii_uppercase();
    let amount = match cur.as_str() {
        "CNY" | "RMB" => format!("¥{bal}"),
        "USD" => format!("${bal}"),
        "" => bal.to_string(),
        other => format!("{bal} {other}"),
    };
    format!("DeepSeek 余额 {amount}")
}

fn parse_deepseek_balance_json(raw: &str) -> Result<(String, String), String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let infos = v
        .get("balance_infos")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "missing balance_infos".to_string())?;
    let first = infos
        .first()
        .ok_or_else(|| "empty balance_infos".to_string())?;
    let currency = first
        .get("currency")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let total = first
        .get("total_balance")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if total.is_empty() {
        return Err("empty total_balance".into());
    }
    Ok((currency, total))
}

fn fetch_deepseek_user_balance(api_key: &str) -> Result<(String, String), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(DEEPSEEK_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(DEEPSEEK_BALANCE_URL)
        .bearer_auth(api_key.trim())
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", body.chars().take(120).collect::<String>()));
    }
    parse_deepseek_balance_json(&body)
}

fn read_claude_deepseek_auth_from_disk() -> Option<(String, String)> {
    let path = claude_settings_json_path();
    let contents = std::fs::read_to_string(path).ok()?;
    parse_claude_deepseek_auth(&contents)
}

/// Apply DeepSeek probe result into state, then recompose Claude usage.
pub fn ingest_deepseek_balance_result(
    detected: bool,
    balance: Option<(String, String)>,
    error: Option<&str>,
) {
    let now = now_ms();
    let mut st = deepseek_balance_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if !detected {
        *st = DeepSeekBalanceState::default();
        drop(st);
        usage_store()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&AgentKind::Claude);
        compose_claude_snapshot();
        return;
    }
    st.detected = true;
    st.observed_at = now;
    if let Some((currency, total)) = balance {
        st.currency = currency;
        st.total_balance = total;
        st.caption = format_deepseek_balance_caption(&st.currency, &st.total_balance);
        st.status = "ready".into();
        st.last_success_at = now;
        st.message = st.caption.clone();
    } else if st.last_success_at > 0 && !st.caption.is_empty() {
        st.status = "stale".into();
        st.message = error
            .map(|e| format!("{}（刷新失败：{}）", st.caption, e))
            .unwrap_or_else(|| format!("{} · 数据陈旧", st.caption));
    } else {
        // No prior balance: still surface the reason (missing key / HTTP) as waiting copy.
        st.status = "waiting".into();
        st.message = error
            .unwrap_or("DeepSeek 余额同步中")
            .to_string();
        st.caption.clear();
        st.currency.clear();
        st.total_balance.clear();
    }
    drop(st);
    compose_claude_snapshot();
}

fn refresh_deepseek_balance_once() {
    if !env_enabled() {
        ingest_deepseek_balance_result(false, None, None);
        return;
    }
    let Some((_base, key)) = read_claude_deepseek_auth_from_disk() else {
        // Not DeepSeek — clear any prior DeepSeek overlay on Claude.
        let was = deepseek_balance_state()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .detected;
        if was {
            ingest_deepseek_balance_result(false, None, None);
        }
        return;
    };
    // Surface DeepSeek lane immediately so Soft Pad never falls back to OTel-only「本会话」.
    {
        let st = deepseek_balance_state()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let need_waiting = !st.detected || (st.status == "waiting" && st.message.is_empty());
        drop(st);
        if need_waiting {
            ingest_deepseek_balance_result(true, None, Some("DeepSeek 余额同步中"));
        }
    }
    if key.trim().is_empty() {
        ingest_deepseek_balance_result(
            true,
            None,
            Some("DeepSeek 已配置，缺少 API Key"),
        );
        return;
    }
    match fetch_deepseek_user_balance(&key) {
        Ok((currency, total)) => ingest_deepseek_balance_result(true, Some((currency, total)), None),
        Err(err) => ingest_deepseek_balance_result(true, None, Some(&err)),
    }
}

/// Fire-and-forget DeepSeek balance refresh (debounce one in-flight).
pub fn kick_deepseek_balance_refresh() {
    static INFLIGHT: AtomicBool = AtomicBool::new(false);
    if !env_enabled() {
        return;
    }
    if INFLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("deepseek-balance-kick".into())
        .spawn(|| {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                refresh_deepseek_balance_once();
            }));
            INFLIGHT.store(false, Ordering::SeqCst);
        });
}

pub fn start_deepseek_balance_poll(app: AppHandle, state: std::sync::Arc<crate::AppState>) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if !env_enabled() {
        return;
    }
    if STARTED.load(Ordering::SeqCst) {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("deepseek-balance".into())
        .spawn(move || loop {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                refresh_deepseek_balance_once();
            }));
            crate::codex_micro_overlay::request_overlay_push(&app, state.as_ref(), false);
            std::thread::sleep(Duration::from_secs(DEEPSEEK_REFRESH_SECS));
        });
    if spawned.is_ok() {
        STARTED.store(true, Ordering::SeqCst);
    }
}

fn apply_deepseek_usage_snap(ds: &DeepSeekBalanceState, now: u64) {
    let otel = claude_otel_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let status = if ds.status.is_empty() {
        "waiting"
    } else {
        ds.status.as_str()
    };
    let message = if !ds.message.is_empty() {
        ds.message.clone()
    } else {
        "DeepSeek 余额同步中".into()
    };
    let mut snap = AgentUsageSnapshot {
        source: "deepseek_balance".into(),
        status: status.into(),
        session_tokens: otel.session_tokens,
        auxiliary_tokens: otel.auxiliary_tokens,
        estimated_cost_usd: otel.estimated_cost_usd,
        windows: Vec::new(),
        account_type: "deepseek".into(),
        account_label: "DeepSeek".into(),
        plan_type: "API".into(),
        updated_at: if ds.observed_at > 0 {
            ds.observed_at
        } else {
            now
        },
        last_success_at: ds.last_success_at,
        message,
        confidence: if status == "ready" {
            "official".into()
        } else if status == "stale" {
            "stale".into()
        } else {
            "local_only".into()
        },
        console_url: "https://platform.deepseek.com/".into(),
        ..Default::default()
    };
    let (lt, lm, lr) = crate::provider_usage::local_totals_for_provider("deepseek");
    if lt > 0 || lm > 0 || lr > 0 {
        snap.local_today_tokens = Some(lt);
        snap.local_month_tokens = Some(lm);
        snap.local_today_requests = Some(lr);
    }
    apply_compat_scalars(&mut snap);
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Claude, snap.clone());
    sync_usage_health(AgentKind::Claude, &snap, false);
}

fn compose_claude_snapshot() {
    let now = now_ms();
    let ds = deepseek_balance_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    // DeepSeek API billing: ignore Anthropic-style statusLine windows (usually empty/bogus).
    if ds.detected {
        apply_deepseek_usage_snap(&ds, now);
        return;
    }

    // Settings already point at DeepSeek, but poll hasn't marked detected yet.
    // Prefer waiting balance caption over OTel「本会话」so Soft Pad shows real billing lane.
    if read_claude_deepseek_auth_from_disk().is_some() {
        let pending = DeepSeekBalanceState {
            detected: true,
            status: "waiting".into(),
            message: "DeepSeek 余额同步中".into(),
            observed_at: now,
            ..Default::default()
        };
        apply_deepseek_usage_snap(&pending, now);
        return;
    }

    // Multi-provider adapter (Ark / GLM / Kimi / MiniMax / bailian / mimo).
    let pv = crate::provider_usage::active_view();
    if pv.detected {
        let target = if pv.provider.eq_ignore_ascii_case("minimax")
            || pv.source.starts_with("minimax")
        {
            AgentKind::MiniMax
        } else {
            AgentKind::Claude
        };
        let otel = claude_otel_state()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        // MiniMax Soft Pad: windows / balance only — never Claude OTel session burn.
        let use_otel = target == AgentKind::Claude;
        let mut snap = AgentUsageSnapshot {
            source: pv.source.clone(),
            status: if pv.status.is_empty() {
                "waiting".into()
            } else {
                pv.status.clone()
            },
            session_tokens: if use_otel { otel.session_tokens } else { None },
            auxiliary_tokens: if use_otel { otel.auxiliary_tokens } else { None },
            estimated_cost_usd: if use_otel { otel.estimated_cost_usd } else { None },
            windows: pv.windows.clone(),
            account_type: pv.provider.clone(),
            account_label: pv.account_label.clone(),
            plan_type: pv.plan_type.clone(),
            updated_at: if pv.observed_at > 0 {
                pv.observed_at
            } else {
                now
            },
            last_success_at: pv.last_success_at,
            message: pv.message.clone(),
            confidence: pv.confidence.clone(),
            console_url: pv.console_url.clone(),
            coding_plan_warning: pv.coding_plan_warning,
            local_today_tokens: pv.local_today_tokens,
            local_month_tokens: pv.local_month_tokens,
            local_today_requests: pv.local_today_requests,
            ..Default::default()
        };
        apply_compat_scalars(&mut snap);
        {
            let mut guard = usage_store().lock().unwrap_or_else(|e| e.into_inner());
            // Drop legacy MiniMax rows that used to land in the Claude bucket.
            if target == AgentKind::MiniMax {
                if guard
                    .get(&AgentKind::Claude)
                    .is_some_and(|s| s.source.starts_with("minimax"))
                {
                    guard.remove(&AgentKind::Claude);
                }
            }
            // Keep AgentKind::MiniMax when Claude settings point elsewhere (DeepSeek / Ark…).
            // Soft Pad MiniMax uses a side-channel refresh.
            guard.insert(target, snap.clone());
        }
        let has_windows = snap.windows.iter().any(|w| {
            w.remaining_percent
                .is_some_and(|p| p.is_finite() && (0.0..=100.0).contains(&p))
        });
        sync_usage_health(target, &snap, has_windows);
        return;
    }

    let otel = claude_otel_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let mut sl = claude_statusline_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();

    let sl_age = if sl.observed_at > 0 {
        now.saturating_sub(sl.observed_at)
    } else {
        u64::MAX
    };

    // Drop expired windows so mini never shows yesterday's %.
    if sl_age > STATUSLINE_KEEP_MS && !sl.windows.is_empty() {
        sl.windows.clear();
        if let Ok(mut guard) = claude_statusline_state().lock() {
            guard.windows.clear();
        }
    }

    let has_windows = sl.windows.iter().any(|w| {
        w.remaining_percent
            .is_some_and(|p| p.is_finite() && (0.0..=100.0).contains(&p))
    });
    let has_otel = otel.session_tokens.is_some()
        || otel.auxiliary_tokens.is_some()
        || otel.estimated_cost_usd.is_some();

    if !has_windows && !has_otel && otel.observed_at == 0 && sl.observed_at == 0 {
        return;
    }

    let (status, windows) = if has_windows {
        if sl_age <= STATUSLINE_READY_MS {
            ("ready", sl.windows.clone())
        } else {
            ("stale", sl.windows.clone())
        }
    } else if has_otel {
        (if otel.stale { "stale" } else { "ready" }, Vec::new())
    } else if sl.observed_at > 0 || otel.observed_at > 0 {
        ("waiting", Vec::new())
    } else {
        return;
    };

    let message = if has_windows && has_otel {
        let mut m = "额度：Claude statusLine · Token/费用：Claude OTel".to_string();
        if !otel.message.is_empty() {
            m.push_str(" · ");
            m.push_str(&otel.message);
        }
        m
    } else if has_windows {
        "额度：Claude statusLine".into()
    } else if has_otel {
        otel.message.clone()
    } else {
        "等待 Claude 上报用量".into()
    };

    // Public source: statusLine when windows present; else OTel.
    let source = if has_windows {
        "claude_statusline"
    } else if has_otel {
        "claude_otel"
    } else {
        "claude_otel"
    };

    // updated_at / last_success_at: window freshness from statusLine only when windows shown.
    let (updated_at, last_success_at) = if has_windows {
        (sl.observed_at, sl.observed_at)
    } else {
        (otel.observed_at, otel.observed_at)
    };

    let mut snap = AgentUsageSnapshot {
        source: source.into(),
        status: status.into(),
        session_tokens: otel.session_tokens,
        auxiliary_tokens: otel.auxiliary_tokens,
        estimated_cost_usd: otel.estimated_cost_usd,
        windows,
        updated_at,
        last_success_at,
        message,
        ..Default::default()
    };
    apply_compat_scalars(&mut snap);
    usage_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(AgentKind::Claude, snap.clone());
    sync_usage_health(AgentKind::Claude, &snap, has_windows);
}

fn sync_usage_health(agent: AgentKind, snap: &AgentUsageSnapshot, has_windows: bool) {
    use crate::connector_health::{upsert, CapabilityKind, HealthState, ValueState};
    let has_deepseek = snap.source == "deepseek_balance"
        && (!snap.account_label.is_empty() || snap.last_success_at > 0);
    let has_value = has_windows
        || has_deepseek
        || snap.session_tokens.is_some()
        || snap.estimated_cost_usd.is_some()
        || (!snap.windows.is_empty() && snap.source.starts_with("minimax"))
        || (snap.source.starts_with("minimax") && (!snap.message.is_empty() || snap.last_success_at > 0));
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
    let channel = if has_windows {
        if agent == AgentKind::MiniMax {
            if snap.source.is_empty() {
                "minimax_remains"
            } else {
                snap.source.as_str()
            }
        } else {
            "claude_statusline"
        }
    } else if snap.source == "deepseek_balance" {
        "deepseek_balance"
    } else if !snap.source.is_empty()
        && (snap.source.starts_with("ark")
            || snap.source.starts_with("glm")
            || snap.source.starts_with("kimi")
            || snap.source.starts_with("minimax")
            || snap.source.starts_with("bailian")
            || snap.source.starts_with("mimo"))
    {
        snap.source.as_str()
    } else {
        "claude_otel"
    };
    upsert(
        agent,
        CapabilityKind::Usage,
        state,
        value_state,
        reason,
        &snap.message,
        channel,
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
    rebuild_claude_otel_state(&mut series);
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

pub fn usage_env_enabled() -> bool {
    env_enabled()
}

/// Apply multi-provider adapter view into Claude usage store.
pub fn ingest_claude_provider_view(view: &crate::provider_usage::ProviderUsageView) {
    if !view.detected {
        clear_claude_provider_view();
        return;
    }
    compose_claude_snapshot();
}

pub fn clear_claude_provider_view() {
    let mut guard = usage_store().lock().unwrap_or_else(|e| e.into_inner());
    let drop_claude = guard
        .get(&AgentKind::Claude)
        .map(|s| {
            let src = s.source.as_str();
            src.starts_with("ark")
                || src.starts_with("glm")
                || src.starts_with("kimi")
                || src.starts_with("minimax")
                || src.starts_with("bailian")
                || src.starts_with("mimo")
        })
        .unwrap_or(false);
    if drop_claude {
        guard.remove(&AgentKind::Claude);
    }
    // Do NOT clear AgentKind::MiniMax here — Claude settings often point at DeepSeek while
    // Soft Pad MiniMax still needs its own side-channel remains/manual row.
    drop(guard);
    compose_claude_snapshot();
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
    {
        let mut otel = claude_otel_state()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let replace = otel.observed_at == 0
            || (otel.session_tokens.is_none()
                && otel.auxiliary_tokens.is_none()
                && otel.estimated_cost_usd.is_none());
        if replace {
            otel.message = message.to_string();
            if otel.observed_at == 0 {
                otel.observed_at = now;
            }
        }
    }
    let prev = snapshot(AgentKind::Claude);
    if prev.status == "unavailable"
        || prev.status.is_empty()
        || prev.status == "waiting"
        || prev.windows.is_empty()
            && prev.session_tokens.is_none()
            && prev.estimated_cost_usd.is_none()
    {
        compose_claude_snapshot();
        // If compose had nothing, seed a waiting snap.
        let after = snapshot(AgentKind::Claude);
        if after.status == "unavailable" || after.status.is_empty() {
            let snap = AgentUsageSnapshot {
                source: "claude_otel".into(),
                status: "waiting".into(),
                updated_at: now,
                message: message.to_string(),
                ..Default::default()
            };
            usage_store()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(AgentKind::Claude, snap.clone());
            sync_usage_health(AgentKind::Claude, &snap, false);
        }
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
        )?;
        send_json_line(
            &mut stdin,
            serde_json::json!({
                "method": "thread/list",
                "id": 5,
                "params": {
                    "cursor": null,
                    "limit": 25,
                    "sortKey": "updated_at",
                    "sortDirection": "desc"
                }
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
    let mut threads_settled = false;
    let mut account_deadline: Option<std::time::Instant> = None;
    let mut errors = Vec::new();

    while std::time::Instant::now() < deadline {
        if rate_settled && usage_settled && account_settled && threads_settled {
            break;
        }
        if rate_settled && usage_settled {
            if account_deadline.is_none() {
                account_deadline = Some(std::time::Instant::now() + ACCOUNT_EXTRA_WAIT);
            }
            if account_deadline.is_some_and(|d| std::time::Instant::now() >= d) {
                account_settled = true;
                if threads_settled {
                    break;
                }
            }
        }
        let loop_deadline = if rate_settled && usage_settled && !account_settled {
            account_deadline.unwrap_or(deadline).min(deadline)
        } else {
            deadline
        };
        let wait = loop_deadline.saturating_duration_since(std::time::Instant::now());
        if wait.is_zero() {
            if rate_settled && usage_settled && !account_settled {
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
            Some(5) => {
                threads_settled = true;
                if let Some(result) = message.get("result") {
                    let _ = crate::agent_lane::app_server_bridge::discover_threads_from_list_result(result);
                }
                // Discovery is best-effort and must not poison usage health.
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
    *claude_otel_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = ClaudeOtelState::default();
    *claude_statusline_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = ClaudeStatusLineState::default();
    *deepseek_balance_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = DeepSeekBalanceState::default();
    #[cfg(test)]
    set_deepseek_settings_path_override_for_test(None);
    crate::connector_health::reset_for_test();
}

#[cfg(test)]
fn statusline_age_for_test(age_ms: u64) {
    let mut sl = claude_statusline_state()
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if sl.observed_at > 0 {
        sl.observed_at = now_ms().saturating_sub(age_ms);
    }
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
        assert!(
            window_display_label(&got.windows[1]).contains("周余")
                || window_display_label(&got.windows[1]).contains("10080")
        );
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

    #[test]
    fn claude_otel_repl_main_thread_counts_as_main() {
        let _g = test_lock();
        reset_for_test();
        let raw = serde_json::json!({
            "resourceMetrics": [{ "scopeMetrics": [{ "metrics": [
                { "name": "claude_code.token.usage", "sum": { "aggregationTemporality": 2, "dataPoints": [
                    { "asInt": "50", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "query_source", "value": { "stringValue": "repl_main_thread" } }
                    ]},
                    { "asInt": "7", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "query_source", "value": { "stringValue": "subagent" } }
                    ]}
                ]}}
            ]}]}]
        });
        assert_eq!(ingest_claude_otel_json(&raw.to_string()), Ok(2));
        let got = snapshot(AgentKind::Claude);
        assert_eq!(got.session_tokens, Some(50));
        assert_eq!(got.auxiliary_tokens, Some(7));
    }

    fn statusline_payload(five: Option<f64>, seven: Option<f64>) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut rate = serde_json::Map::new();
        if let Some(u) = five {
            rate.insert(
                "five_hour".into(),
                serde_json::json!({ "used_percentage": u, "resets_at": now + 3600 }),
            );
        }
        if let Some(u) = seven {
            rate.insert(
                "seven_day".into(),
                serde_json::json!({ "used_percentage": u, "resets_at": now + 86400 }),
            );
        }
        serde_json::json!({
            "session_id": "s1",
            "rate_limits": Value::Object(rate)
        })
        .to_string()
    }

    #[test]
    fn statusline_rejects_bad_five_keeps_good_seven() {
        let _g = test_lock();
        reset_for_test();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let raw = serde_json::json!({
            "session_id": "s1",
            "rate_limits": {
                "five_hour": { "used_percentage": 250.0, "resets_at": now + 3600 },
                "seven_day": { "used_percentage": 41.0, "resets_at": now + 86400 }
            }
        })
        .to_string();
        assert_eq!(ingest_claude_statusline_json(&raw), Ok(1));
        let got = snapshot(AgentKind::Claude);
        assert_eq!(got.windows.len(), 1);
        assert_eq!(got.windows[0].id, "seven_day");
        assert_eq!(got.windows[0].remaining_percent, Some(59.0));
        assert_eq!(got.source, "claude_statusline");
        assert_eq!(got.status, "ready");
    }

    #[test]
    fn statusline_rejects_nan_and_string_percent() {
        let _g = test_lock();
        reset_for_test();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let raw = serde_json::json!({
            "session_id": "s1",
            "rate_limits": {
                "five_hour": { "used_percentage": "24", "resets_at": now + 3600 },
                "seven_day": { "used_percentage": null, "resets_at": now + 86400 }
            }
        })
        .to_string();
        assert_eq!(ingest_claude_statusline_json(&raw), Ok(0));
        assert!(snapshot(AgentKind::Claude).windows.is_empty());
    }

    #[test]
    fn statusline_and_otel_do_not_clear_each_other() {
        let _g = test_lock();
        reset_for_test();
        assert_eq!(ingest_claude_statusline_json(&statusline_payload(Some(24.0), Some(41.0))), Ok(2));
        let after_sl = snapshot(AgentKind::Claude);
        let sl_updated = after_sl.updated_at;
        assert_eq!(after_sl.windows.len(), 2);

        let otel = serde_json::json!({
            "resourceMetrics": [{ "scopeMetrics": [{ "metrics": [
                { "name": "claude_code.token.usage", "sum": { "aggregationTemporality": 2, "dataPoints": [
                    { "asInt": "100", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "query_source", "value": { "stringValue": "main" } }
                    ]}
                ]}}
            ]}]}]
        });
        assert_eq!(ingest_claude_otel_json(&otel.to_string()), Ok(1));
        let after_otel = snapshot(AgentKind::Claude);
        assert_eq!(after_otel.session_tokens, Some(100));
        assert_eq!(after_otel.windows.len(), 2);
        // OTel must not refresh statusLine window freshness.
        assert_eq!(after_otel.updated_at, sl_updated);

        assert_eq!(ingest_claude_statusline_json(&statusline_payload(Some(30.0), None)), Ok(1));
        let after_sl2 = snapshot(AgentKind::Claude);
        assert_eq!(after_sl2.session_tokens, Some(100));
        assert_eq!(after_sl2.windows.len(), 1);
        assert_eq!(after_sl2.windows[0].id, "five_hour");
    }

    #[test]
    fn statusline_empty_rate_limits_clears_windows() {
        let _g = test_lock();
        reset_for_test();
        assert_eq!(ingest_claude_statusline_json(&statusline_payload(Some(24.0), Some(41.0))), Ok(2));
        assert_eq!(snapshot(AgentKind::Claude).windows.len(), 2);
        let empty = serde_json::json!({ "session_id": "s1", "rate_limits": {} }).to_string();
        assert_eq!(ingest_claude_statusline_json(&empty), Ok(0));
        assert!(snapshot(AgentKind::Claude).windows.is_empty());
    }

    #[test]
    fn statusline_ages_to_stale_then_drops() {
        let _g = test_lock();
        reset_for_test();
        assert_eq!(ingest_claude_statusline_json(&statusline_payload(Some(24.0), None)), Ok(1));
        assert_eq!(snapshot(AgentKind::Claude).status, "ready");

        statusline_age_for_test(STATUSLINE_READY_MS + 1);
        compose_claude_snapshot();
        assert_eq!(snapshot(AgentKind::Claude).status, "stale");
        assert_eq!(snapshot(AgentKind::Claude).windows.len(), 1);

        statusline_age_for_test(STATUSLINE_KEEP_MS + 1);
        compose_claude_snapshot();
        assert!(snapshot(AgentKind::Claude).windows.is_empty());
    }

    #[test]
    fn deepseek_host_match_is_strict() {
        assert!(is_deepseek_api_base("https://api.deepseek.com"));
        assert!(is_deepseek_api_base("https://api.deepseek.com/v1"));
        assert!(is_deepseek_api_base("http://api.deepseek.com/anthropic"));
        assert!(!is_deepseek_api_base("https://api.openai.com"));
        assert!(!is_deepseek_api_base("https://relay.example.com/deepseek"));
        assert!(!is_deepseek_api_base(""));
    }

    #[test]
    fn parse_claude_deepseek_auth_requires_deepseek_base() {
        let hit = r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.deepseek.com","ANTHROPIC_AUTH_TOKEN":"sk-test"}}"#;
        let got = parse_claude_deepseek_auth(hit).expect("auth");
        assert_eq!(got.1, "sk-test");
        let miss = r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.anthropic.com","ANTHROPIC_AUTH_TOKEN":"sk-test","ANTHROPIC_MODEL":"deepseek-v4-pro"}}"#;
        assert!(parse_claude_deepseek_auth(miss).is_none());
        let no_key = r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.deepseek.com"}}"#;
        let got2 = parse_claude_deepseek_auth(no_key).expect("detected");
        assert!(got2.1.is_empty());
    }

    #[test]
    fn deepseek_balance_caption_formats_currency() {
        assert_eq!(
            format_deepseek_balance_caption("CNY", "12.34"),
            "DeepSeek 余额 ¥12.34"
        );
        assert_eq!(
            format_deepseek_balance_caption("USD", "1.5"),
            "DeepSeek 余额 $1.5"
        );
    }

    #[test]
    fn deepseek_compose_ignores_statusline_windows() {
        let _g = test_lock();
        reset_for_test();
        assert_eq!(
            ingest_claude_statusline_json(&statusline_payload(Some(24.0), Some(41.0))),
            Ok(2)
        );
        assert_eq!(snapshot(AgentKind::Claude).windows.len(), 2);
        ingest_deepseek_balance_result(true, Some(("CNY".into(), "9.99".into())), None);
        let got = snapshot(AgentKind::Claude);
        assert_eq!(got.source, "deepseek_balance");
        assert!(got.windows.is_empty());
        assert_eq!(got.status, "ready");
        assert!(got.message.contains("¥9.99"));
        assert_eq!(got.account_label, "DeepSeek");
        // Leave DeepSeek → statusLine can return.
        ingest_deepseek_balance_result(false, None, None);
        // Isolate from developer ~/.claude/settings.json (may already be DeepSeek).
        set_deepseek_settings_path_override_for_test(Some(std::env::temp_dir().join(
            format!("onetone-ds-miss-{}", std::process::id()),
        )));
        assert_eq!(ingest_claude_statusline_json(&statusline_payload(Some(10.0), None)), Ok(1));
        let back = snapshot(AgentKind::Claude);
        assert_eq!(back.source, "claude_statusline");
        assert_eq!(back.windows.len(), 1);
        set_deepseek_settings_path_override_for_test(None);
    }

    #[test]
    fn deepseek_settings_pending_beats_otel_only() {
        let _g = test_lock();
        reset_for_test();
        let dir = std::env::temp_dir().join(format!(
            "onetone-ds-pending-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        std::fs::write(
            &path,
            r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.deepseek.com/anthropic","ANTHROPIC_AUTH_TOKEN":"sk-test"}}"#,
        )
        .expect("write settings");
        set_deepseek_settings_path_override_for_test(Some(path));
        let raw = serde_json::json!({
            "resourceMetrics": [{ "scopeMetrics": [{ "metrics": [
                { "name": "claude_code.token.usage", "sum": { "aggregationTemporality": 2, "dataPoints": [
                    { "asInt": "100", "attributes": [
                        { "key": "session.id", "value": { "stringValue": "s1" } },
                        { "key": "query_source", "value": { "stringValue": "repl_main_thread" } }
                    ]}
                ]}}
            ]}]}]
        });
        assert_eq!(ingest_claude_otel_json(&raw.to_string()), Ok(1));
        let got = snapshot(AgentKind::Claude);
        assert_eq!(got.source, "deepseek_balance");
        assert_eq!(got.status, "waiting");
        assert!(got.message.contains("DeepSeek"));
        assert_eq!(got.session_tokens, Some(100));
        set_deepseek_settings_path_override_for_test(None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_deepseek_balance_json_reads_total() {
        let raw = r#"{"is_available":true,"balance_infos":[{"currency":"CNY","total_balance":"56.42","granted_balance":"0.00","topped_up_balance":"56.42"}]}"#;
        let (cur, total) = parse_deepseek_balance_json(raw).expect("parse");
        assert_eq!(cur, "CNY");
        assert_eq!(total, "56.42");
    }
}
