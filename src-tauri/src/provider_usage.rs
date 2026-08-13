//! Multi-provider Claude usage adapter (Soft Pad / mini-bar).
//!
//! Detects `ANTHROPIC_BASE_URL` in ~/.claude/settings.json and fills a
//! `ProviderUsageView`: official quota/balance when available, else
//! `manual_or_local_estimate` (bailian / mimo). Always merges local token ledger.

use crate::agent_usage::{self, UsageWindow};
use crate::data_root;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const REFRESH_SECS: u64 = 5 * 60;
const HTTP_TIMEOUT_SECS: u64 = 15;

const CODING_PLAN_WARNING: &str =
    "Coding Plan 套餐 key 勿用于 curl/批量等非编程工具探测，以免封禁或额外扣费。";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderId {
    Ark,
    Glm,
    Kimi,
    MiniMax,
    Bailian,
    Mimo,
    DeepSeek,
    Unknown,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            ProviderId::Ark => "ark",
            ProviderId::Glm => "glm",
            ProviderId::Kimi => "kimi",
            ProviderId::MiniMax => "minimax",
            ProviderId::Bailian => "bailian",
            ProviderId::Mimo => "mimo",
            ProviderId::DeepSeek => "deepseek",
            ProviderId::Unknown => "unknown",
        }
    }

    pub fn account_label(self) -> &'static str {
        match self {
            ProviderId::Ark => "火山 Ark",
            ProviderId::Glm => "智谱 GLM",
            ProviderId::Kimi => "Kimi",
            ProviderId::MiniMax => "MiniMax",
            ProviderId::Bailian => "阿里云百炼",
            ProviderId::Mimo => "小米 MiMo",
            ProviderId::DeepSeek => "DeepSeek",
            ProviderId::Unknown => "第三方",
        }
    }

    pub fn console_url(self) -> &'static str {
        match self {
            ProviderId::Ark => "https://console.volcengine.com/ark",
            ProviderId::Glm => "https://open.bigmodel.cn/",
            ProviderId::Kimi => "https://platform.moonshot.cn/",
            ProviderId::MiniMax => "https://platform.minimaxi.com/",
            ProviderId::Bailian => {
                "https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan"
            }
            ProviderId::Mimo => "https://platform.xiaomimimo.com/#/console",
            ProviderId::DeepSeek => "https://platform.deepseek.com/",
            ProviderId::Unknown => "",
        }
    }

    pub fn is_manual_only(self) -> bool {
        matches!(self, ProviderId::Bailian | ProviderId::Mimo)
    }

    pub fn coding_plan_warning(self) -> bool {
        matches!(
            self,
            ProviderId::Ark | ProviderId::Glm | ProviderId::MiniMax | ProviderId::Bailian
        )
    }
}

#[derive(Debug, Clone, Default)]
pub struct ProviderUsageView {
    pub detected: bool,
    pub provider: String,
    pub source: String,
    pub status: String,
    /// official | stale | local_only | manual_or_local_estimate
    pub confidence: String,
    pub message: String,
    pub account_label: String,
    pub plan_type: String,
    pub windows: Vec<UsageWindow>,
    pub console_url: String,
    pub coding_plan_warning: bool,
    pub local_today_tokens: Option<u64>,
    pub local_month_tokens: Option<u64>,
    pub local_today_requests: Option<u64>,
    pub observed_at: u64,
    pub last_success_at: u64,
}

fn view_store() -> &'static Mutex<ProviderUsageView> {
    static S: OnceLock<Mutex<ProviderUsageView>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(ProviderUsageView::default()))
}

pub fn active_view() -> ProviderUsageView {
    view_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn host_of(url: &str) -> String {
    let lower = url.trim().to_ascii_lowercase();
    let without = lower
        .strip_prefix("https://")
        .or_else(|| lower.strip_prefix("http://"))
        .unwrap_or(lower.as_str());
    without
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Map Claude ANTHROPIC_BASE_URL host → provider.
pub fn detect_provider_from_base(url: &str) -> ProviderId {
    let host = host_of(url);
    if host.is_empty() {
        return ProviderId::Unknown;
    }
    if host == "api.deepseek.com" {
        return ProviderId::DeepSeek;
    }
    if host.contains("volces.com") || host.contains("volcengine.com") || host.contains("ark.cn") {
        return ProviderId::Ark;
    }
    if host.contains("bigmodel.cn") || host == "api.z.ai" || host.ends_with(".z.ai") {
        return ProviderId::Glm;
    }
    if host.contains("kimi.com") || host.contains("moonshot.cn") || host.contains("moonshot.ai") {
        return ProviderId::Kimi;
    }
    if host.contains("minimaxi.com") || host.contains("minimax.io") || host.contains("minimax.com")
    {
        return ProviderId::MiniMax;
    }
    if host.contains("aliyun.com")
        || host.contains("alibabacloud.com")
        || host.contains("dashscope")
        || host.contains("bailian")
    {
        return ProviderId::Bailian;
    }
    if host.contains("xiaomimimo.com") || host.contains("mimo.xiaomi") {
        return ProviderId::Mimo;
    }
    ProviderId::Unknown
}

fn env_str(env: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = env.get(*key).and_then(|x| x.as_str()).map(str::trim) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

pub fn parse_claude_base_and_key(contents: &str) -> Option<(String, String)> {
    let v: Value = serde_json::from_str(contents).ok()?;
    let env = v.get("env")?.as_object()?;
    let base = env_str(
        env,
        &[
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_API_BASE",
            "ANTHROPIC_BASE_URL_OVERRIDE",
        ],
    )?;
    let key = env_str(
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

fn claude_settings_path() -> PathBuf {
    #[cfg(test)]
    if let Some(p) = settings_override().lock().unwrap().clone() {
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
fn settings_override() -> &'static Mutex<Option<PathBuf>> {
    static O: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    O.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub fn set_settings_path_override_for_test(path: Option<PathBuf>) {
    *settings_override().lock().unwrap() = path;
}

fn read_base_key() -> Option<(String, String)> {
    let raw = std::fs::read_to_string(claude_settings_path()).ok()?;
    parse_claude_base_and_key(&raw)
}

fn http_get(url: &str, api_key: &str, bearer: bool) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url).header("Accept", "application/json");
    if bearer {
        req = req.bearer_auth(api_key.trim());
    } else {
        req = req.header("Authorization", api_key.trim());
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {status}: {}",
            body.chars().take(120).collect::<String>()
        ));
    }
    Ok(body)
}

fn parse_iso_or_epoch_to_secs(v: &Value) -> Option<u64> {
    if let Some(n) = v.as_u64() {
        return Some(if n > 1_000_000_000_000 {
            n / 1000
        } else {
            n
        });
    }
    if let Some(n) = v.as_i64() {
        let n = n.max(0) as u64;
        return Some(if n > 1_000_000_000_000 {
            n / 1000
        } else {
            n
        });
    }
    let s = v.as_str()?.trim();
    if s.is_empty() {
        return None;
    }
    // RFC3339-ish: take until Z or +offset; chrono not required — best-effort via time crate absent.
    // Store as 0 if unparseable; UI still shows %.
    None
}

fn window_from_remaining_pct(
    id: &str,
    kind: &str,
    remaining_pct: f64,
    duration_mins: Option<u64>,
    resets_at: Option<u64>,
) -> UsageWindow {
    let rem = remaining_pct.clamp(0.0, 100.0);
    UsageWindow {
        id: id.into(),
        kind: kind.into(),
        duration_mins,
        used_percent: Some((100.0 - rem).clamp(0.0, 100.0)),
        remaining_percent: Some(rem),
        resets_at,
    }
}

// --- Ark via arkcli ---

pub fn parse_arkcli_usage_plan_json(raw: &str) -> Result<(Vec<UsageWindow>, String), String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let items = v
        .get("items")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "missing items".to_string())?;
    let mut chosen: Option<&Value> = None;
    for it in items {
        let product = it.get("product").and_then(|x| x.as_str()).unwrap_or("");
        if product == "coding-plan" || product == "coding-plan-team" {
            if it.get("subscribed").and_then(|x| x.as_bool()) == Some(true)
                || it.get("periods").and_then(|x| x.as_array()).is_some()
            {
                chosen = Some(it);
                break;
            }
            if chosen.is_none() {
                chosen = Some(it);
            }
        }
    }
    let item = chosen.ok_or_else(|| "no coding-plan item".to_string())?;
    if let Some(err) = item.get("error").and_then(|x| x.as_str()) {
        if !err.is_empty()
            && item
                .get("periods")
                .and_then(|x| x.as_array())
                .map(|a| a.is_empty())
                .unwrap_or(true)
        {
            return Err(err.chars().take(160).collect());
        }
    }
    let periods = item
        .get("periods")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "no periods".to_string())?;
    let mut windows = Vec::new();
    for p in periods {
        let label = p
            .get("label")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let used_pct = p
            .get("percent")
            .and_then(|x| x.as_f64())
            .or_else(|| {
                let used = p.get("used").and_then(|x| x.as_f64())?;
                let total = p.get("total").and_then(|x| x.as_f64())?;
                if total > 0.0 {
                    Some(used / total * 100.0)
                } else {
                    None
                }
            });
        let Some(used_pct) = used_pct else { continue };
        let rem = (100.0 - used_pct).clamp(0.0, 100.0);
        let resets = p
            .get("reset_at")
            .and_then(parse_iso_or_epoch_to_secs)
            .or_else(|| p.get("resetAt").and_then(parse_iso_or_epoch_to_secs));
        let (id, kind, mins) = if label.contains("5h")
            || label.contains("session")
            || label == "hour"
            || label.contains("小时")
        {
            ("five_hour", "primary", Some(5 * 60u64))
        } else if label.contains("week") || label.contains("周") {
            ("weekly", "secondary", Some(7 * 24 * 60))
        } else if label.contains("month") || label.contains("月") {
            ("monthly", "unknown", Some(30 * 24 * 60))
        } else {
            (label.as_str(), "unknown", None)
        };
        windows.push(window_from_remaining_pct(id, kind, rem, mins, resets));
    }
    if windows.is_empty() {
        return Err("coding-plan periods empty".into());
    }
    let tier = item
        .get("tier")
        .and_then(|x| x.as_str())
        .unwrap_or("Coding Plan")
        .to_string();
    Ok((windows, tier))
}

fn fetch_ark_via_cli() -> Result<(Vec<UsageWindow>, String), String> {
    let out = Command::new("arkcli")
        .args([
            "usage",
            "plan",
            "--product",
            "coding-plan",
            "--format",
            "json",
        ])
        .output()
        .map_err(|e| format!("arkcli 不可用: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if !out.status.success() && stdout.trim().is_empty() {
        return Err(if stderr.is_empty() {
            "arkcli usage plan failed".into()
        } else {
            stderr.chars().take(160).collect()
        });
    }
    parse_arkcli_usage_plan_json(&stdout)
}

// --- GLM ---

pub fn parse_glm_quota_json(raw: &str) -> Result<Vec<UsageWindow>, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let data = v.get("data").unwrap_or(&v);
    let limits = data
        .get("limits")
        .and_then(|x| x.as_array())
        .ok_or_else(|| "missing limits".to_string())?;
    let mut windows = Vec::new();
    for lim in limits {
        let typ = lim
            .get("type")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_ascii_uppercase();
        let used_pct = lim
            .get("percentage")
            .and_then(|x| x.as_f64())
            .or_else(|| {
                let usage = lim.get("usage").or_else(|| lim.get("currentValue"))?.as_f64()?;
                let remaining = lim.get("remaining")?.as_f64()?;
                let total = usage + remaining;
                if total > 0.0 {
                    Some(usage / total * 100.0)
                } else {
                    None
                }
            });
        let Some(used_pct) = used_pct else { continue };
        let rem = (100.0 - used_pct).clamp(0.0, 100.0);
        let resets = lim
            .get("nextResetTime")
            .or_else(|| lim.get("next_reset_time"))
            .and_then(parse_iso_or_epoch_to_secs);
        if typ.contains("TIME") || windows.is_empty() {
            windows.push(window_from_remaining_pct(
                "five_hour",
                "primary",
                rem,
                Some(5 * 60),
                resets,
            ));
        } else if typ.contains("TOKEN") {
            windows.push(window_from_remaining_pct(
                "weekly",
                "secondary",
                rem,
                Some(7 * 24 * 60),
                resets,
            ));
        }
    }
    if windows.is_empty() {
        return Err("glm limits empty".into());
    }
    // Ensure primary first
    windows.sort_by_key(|w| if w.kind == "primary" { 0 } else { 1 });
    Ok(windows)
}

fn fetch_glm(api_key: &str) -> Result<Vec<UsageWindow>, String> {
    // Prefer international host (CN bigmodel may anti-bot).
    let urls = [
        "https://api.z.ai/api/monitor/usage/quota/limit",
        "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    ];
    let mut last = "glm fetch failed".to_string();
    for url in urls {
        match http_get(url, api_key, false) {
            Ok(body) => match parse_glm_quota_json(&body) {
                Ok(w) => return Ok(w),
                Err(e) => last = e,
            },
            Err(e) => last = e,
        }
    }
    Err(last)
}

// --- Kimi balance ---

pub fn parse_kimi_balance_json(raw: &str) -> Result<String, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let data = v.get("data").unwrap_or(&v);
    let avail = data
        .get("available_balance")
        .or_else(|| data.get("availableBalance"))
        .and_then(|x| {
            x.as_f64()
                .or_else(|| x.as_str().and_then(|s| s.parse().ok()))
        })
        .ok_or_else(|| "missing available_balance".to_string())?;
    Ok(format!("Kimi 余额 {avail}"))
}

pub fn parse_kimi_coding_usages_json(raw: &str) -> Result<Vec<UsageWindow>, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let mut windows = Vec::new();
    if let Some(usage) = v.get("usage") {
        let limit = usage.get("limit").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let remaining = usage
            .get("remaining")
            .and_then(|x| x.as_f64())
            .unwrap_or(0.0);
        if limit > 0.0 {
            let rem = (remaining / limit * 100.0).clamp(0.0, 100.0);
            let resets = usage
                .get("resetTime")
                .or_else(|| usage.get("reset_time"))
                .and_then(parse_iso_or_epoch_to_secs);
            windows.push(window_from_remaining_pct(
                "weekly",
                "secondary",
                rem,
                Some(7 * 24 * 60),
                resets,
            ));
        }
    }
    if let Some(limits) = v.get("limits").and_then(|x| x.as_array()) {
        for lim in limits {
            let detail = lim.get("detail").unwrap_or(lim);
            let limit = detail.get("limit").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let remaining = detail
                .get("remaining")
                .and_then(|x| x.as_f64())
                .unwrap_or(0.0);
            if limit <= 0.0 {
                continue;
            }
            let rem = (remaining / limit * 100.0).clamp(0.0, 100.0);
            let resets = detail
                .get("resetTime")
                .or_else(|| detail.get("reset_time"))
                .and_then(parse_iso_or_epoch_to_secs);
            windows.insert(
                0,
                window_from_remaining_pct("five_hour", "primary", rem, Some(5 * 60), resets),
            );
            break;
        }
    }
    if windows.is_empty() {
        return Err("kimi usages empty".into());
    }
    Ok(windows)
}

fn fetch_kimi(api_key: &str, base: &str) -> Result<(Option<Vec<UsageWindow>>, String), String> {
    let host = host_of(base);
    let balance_urls = if host.contains("moonshot.cn") || host.contains("kimi.com") {
        vec![
            "https://api.moonshot.cn/v1/users/me/balance",
            "https://api.moonshot.ai/v1/users/me/balance",
        ]
    } else {
        vec![
            "https://api.moonshot.ai/v1/users/me/balance",
            "https://api.moonshot.cn/v1/users/me/balance",
        ]
    };
    let mut caption = String::new();
    let mut last = "kimi balance failed".to_string();
    for url in &balance_urls {
        match http_get(url, api_key, true) {
            Ok(body) => match parse_kimi_balance_json(&body) {
                Ok(c) => {
                    caption = c;
                    break;
                }
                Err(e) => last = e,
            },
            Err(e) => last = e,
        }
    }
    let mut windows = None;
    if host.contains("kimi.com") {
        if let Ok(body) = http_get("https://api.kimi.com/coding/v1/usages", api_key, true) {
            if let Ok(w) = parse_kimi_coding_usages_json(&body) {
                windows = Some(w);
            }
        }
    }
    if caption.is_empty() && windows.is_none() {
        return Err(last);
    }
    if caption.is_empty() {
        caption = "Kimi Coding Plan".into();
    }
    Ok((windows, caption))
}

// --- MiniMax ---

pub fn parse_minimax_remains_json(raw: &str) -> Result<Vec<UsageWindow>, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if let Some(code) = v
        .pointer("/base_resp/status_code")
        .and_then(|x| x.as_i64())
    {
        if code != 0 {
            let msg = v
                .pointer("/base_resp/status_msg")
                .and_then(|x| x.as_str())
                .unwrap_or("minimax error");
            return Err(msg.into());
        }
    }
    let remains = v
        .get("model_remains")
        .and_then(|x| x.as_array())
        .and_then(|a| a.first())
        .ok_or_else(|| "missing model_remains".to_string())?;
    let interval = remains
        .get("current_interval_remaining_percent")
        .and_then(|x| x.as_f64())
        .ok_or_else(|| "missing interval remaining".to_string())?;
    let weekly = remains
        .get("current_weekly_remaining_percent")
        .and_then(|x| x.as_f64());
    let end = remains
        .get("end_time")
        .and_then(parse_iso_or_epoch_to_secs);
    let week_end = remains
        .get("weekly_end_time")
        .and_then(parse_iso_or_epoch_to_secs);
    let mut windows = vec![window_from_remaining_pct(
        "five_hour",
        "primary",
        interval,
        Some(5 * 60),
        end,
    )];
    if let Some(w) = weekly {
        windows.push(window_from_remaining_pct(
            "weekly",
            "secondary",
            w,
            Some(7 * 24 * 60),
            week_end,
        ));
    }
    Ok(windows)
}

fn fetch_minimax(api_key: &str, base: &str) -> Result<Vec<UsageWindow>, String> {
    let host = host_of(base);
    let mut urls = Vec::new();
    if host.contains("minimax.io") {
        urls.push("https://api.minimax.io/v1/api/openplatform/coding_plan/remains");
        urls.push("https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains");
    } else {
        // CN first
        urls.push("https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains");
        urls.push("https://api.minimax.io/v1/api/openplatform/coding_plan/remains");
    }
    let mut last = "minimax remains failed".to_string();
    for url in urls {
        match http_get(url, api_key, true) {
            Ok(body) => match parse_minimax_remains_json(&body) {
                Ok(w) => return Ok(w),
                Err(e) => last = e,
            },
            Err(e) => last = e,
        }
    }
    Err(last)
}

// --- Local ledger ---

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LedgerFile {
    /// day key YYYY-MM-DD → provider → model → counters
    days: HashMap<String, HashMap<String, HashMap<String, LedgerCounters>>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct LedgerCounters {
    input_tokens: u64,
    output_tokens: u64,
    cache_tokens: u64,
    request_count: u64,
}

impl LedgerCounters {
    fn total_tokens(&self) -> u64 {
        self.input_tokens
            .saturating_add(self.output_tokens)
            .saturating_add(self.cache_tokens)
    }
}

fn ledger_path() -> PathBuf {
    data_root::effective_data_root().join("provider-usage-ledger.json")
}

fn load_ledger() -> LedgerFile {
    let path = ledger_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_ledger(led: &LedgerFile) {
    let path = ledger_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(s) = serde_json::to_string_pretty(led) {
        let _ = std::fs::write(path, s);
    }
}

fn today_ymd() -> String {
    // UTC civil date (ponytail: ceiling — upgrade to local TZ with chrono if needed).
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    let z = secs.div_euclid(86400) + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// Record a local usage sample (OneTone-observed or future IPC). Safe to call often.
pub fn record_local_usage(
    provider: &str,
    model: &str,
    input_tokens: u64,
    output_tokens: u64,
    cache_tokens: u64,
) {
    let provider = provider.trim();
    let model = if model.trim().is_empty() {
        "_"
    } else {
        model.trim()
    };
    if provider.is_empty() {
        return;
    }
    let day = today_ymd();
    let mut led = load_ledger();
    let entry = led
        .days
        .entry(day)
        .or_default()
        .entry(provider.to_string())
        .or_default()
        .entry(model.to_string())
        .or_default();
    entry.input_tokens = entry.input_tokens.saturating_add(input_tokens);
    entry.output_tokens = entry.output_tokens.saturating_add(output_tokens);
    entry.cache_tokens = entry.cache_tokens.saturating_add(cache_tokens);
    entry.request_count = entry.request_count.saturating_add(1);
    save_ledger(&led);
}

pub fn local_totals_for_provider(provider: &str) -> (u64, u64, u64) {
    let led = load_ledger();
    let today = today_ymd();
    let month = if today.len() >= 7 {
        today[..7].to_string()
    } else {
        String::new()
    };
    let mut today_tok = 0u64;
    let mut month_tok = 0u64;
    let mut today_req = 0u64;
    for (day, by_prov) in &led.days {
        let Some(by_model) = by_prov.get(provider) else {
            continue;
        };
        let day_tok: u64 = by_model.values().map(|c| c.total_tokens()).sum();
        let day_req: u64 = by_model.values().map(|c| c.request_count).sum();
        if day == &today {
            today_tok = today_tok.saturating_add(day_tok);
            today_req = today_req.saturating_add(day_req);
        }
        if !month.is_empty() && day.starts_with(&month) {
            month_tok = month_tok.saturating_add(day_tok);
        }
    }
    (today_tok, month_tok, today_req)
}

fn attach_local(view: &mut ProviderUsageView, provider: ProviderId) {
    let (t, m, r) = local_totals_for_provider(provider.as_str());
    if t > 0 || m > 0 || r > 0 {
        view.local_today_tokens = Some(t);
        view.local_month_tokens = Some(m);
        view.local_today_requests = Some(r);
    }
}

fn publish(view: ProviderUsageView) {
    *view_store().lock().unwrap_or_else(|e| e.into_inner()) = view.clone();
    agent_usage::ingest_claude_provider_view(&view);
}

fn clear_published() {
    *view_store().lock().unwrap_or_else(|e| e.into_inner()) = ProviderUsageView::default();
    agent_usage::clear_claude_provider_view();
}

fn base_view(pid: ProviderId) -> ProviderUsageView {
    let now = now_ms();
    let mut view = ProviderUsageView {
        detected: true,
        provider: pid.as_str().into(),
        account_label: pid.account_label().into(),
        console_url: pid.console_url().into(),
        coding_plan_warning: pid.coding_plan_warning(),
        observed_at: now,
        plan_type: "API".into(),
        ..Default::default()
    };
    attach_local(&mut view, pid);
    view
}

/// Refresh once from Claude settings + provider endpoints / arkcli.
pub fn refresh_once() {
    if !agent_usage::usage_env_enabled() {
        clear_published();
        return;
    }
    let Some((base, key)) = read_base_key() else {
        clear_published();
        return;
    };
    let pid = detect_provider_from_base(&base);
    if pid == ProviderId::Unknown || pid == ProviderId::DeepSeek {
        // DeepSeek handled by agent_usage deepseek poll.
        clear_published();
        return;
    }

    if pid.is_manual_only() {
        let mut view = base_view(pid);
        view.source = format!("{}_manual", pid.as_str());
        view.status = "ready".into();
        view.confidence = "manual_or_local_estimate".into();
        let local_bit = match (view.local_today_tokens, view.local_month_tokens) {
            (Some(t), Some(m)) if t > 0 || m > 0 => format!("本机今日 {t} tok · 本月 {m} tok"),
            (Some(t), _) if t > 0 => format!("本机今日 {t} tok"),
            _ => "本机暂无记录".into(),
        };
        view.message = format!(
            "官方剩余请到控制台 · {local_bit}"
        );
        view.plan_type = "Token Plan".into();
        if view.coding_plan_warning {
            view.message = format!("{} · {}", view.message, CODING_PLAN_WARNING);
        }
        publish(view);
        return;
    }

    let mut view = base_view(pid);
    let result = match pid {
        ProviderId::Ark => match fetch_ark_via_cli() {
            Ok((windows, tier)) => {
                view.windows = windows;
                view.plan_type = tier;
                view.source = "arkcli_usage_plan".into();
                view.status = "ready".into();
                view.confidence = "official".into();
                view.message = "Ark Coding Plan".into();
                view.last_success_at = now_ms();
                Ok(())
            }
            Err(e) => Err(e),
        },
        ProviderId::Glm => match fetch_glm(&key) {
            Ok(windows) => {
                view.windows = windows;
                view.source = "glm_quota".into();
                view.status = "ready".into();
                view.confidence = "official".into();
                view.plan_type = "Coding Plan".into();
                view.message = "GLM Coding Plan".into();
                view.last_success_at = now_ms();
                Ok(())
            }
            Err(e) => Err(e),
        },
        ProviderId::Kimi => match fetch_kimi(&key, &base) {
            Ok((windows, caption)) => {
                if let Some(w) = windows {
                    view.windows = w;
                }
                view.source = "kimi_balance".into();
                view.status = "ready".into();
                view.confidence = "official".into();
                view.plan_type = "API".into();
                view.message = caption;
                view.last_success_at = now_ms();
                Ok(())
            }
            Err(e) => Err(e),
        },
        ProviderId::MiniMax => match fetch_minimax(&key, &base) {
            Ok(windows) => {
                view.windows = windows;
                view.source = "minimax_remains".into();
                view.status = "ready".into();
                view.confidence = "official".into();
                view.plan_type = "Coding Plan".into();
                view.message = "MiniMax Coding Plan".into();
                view.last_success_at = now_ms();
                Ok(())
            }
            Err(e) => Err(e),
        },
        _ => Err("unsupported".into()),
    };

    if let Err(e) = result {
        let prev = active_view();
        if prev.detected
            && prev.provider == pid.as_str()
            && (!prev.windows.is_empty() || !prev.message.is_empty())
            && prev.last_success_at > 0
        {
            view = prev;
            view.status = "stale".into();
            view.confidence = "stale".into();
            view.observed_at = now_ms();
            view.message = format!("{}（刷新失败：{}）", view.message, e.chars().take(80).collect::<String>());
            attach_local(&mut view, pid);
        } else {
            view.source = format!("{}_error", pid.as_str());
            view.status = "waiting".into();
            if view.local_today_tokens.unwrap_or(0) > 0 {
                view.confidence = "local_only".into();
                view.message = format!("官方额度未同步 · 本机今日 {} tok · {e}", view.local_today_tokens.unwrap_or(0));
            } else {
                view.confidence = "local_only".into();
                view.message = format!("额度未同步：{}", e.chars().take(100).collect::<String>());
            }
            if key.trim().is_empty() && pid != ProviderId::Ark {
                view.message = format!("{} 已配置，缺少 API Key", pid.account_label());
            }
        }
    }

    if view.coding_plan_warning && view.status == "ready" {
        // Keep warning out of the short message for mini pill; Soft Pad reads coding_plan_warning flag.
    }
    publish(view);
}

pub fn start_provider_usage_poll(app: AppHandle, state: std::sync::Arc<crate::AppState>) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("provider-usage".into())
        .spawn(move || loop {
            refresh_once();
            // Soft Pad MiniMax must not depend on Claude settings pointing at MiniMax
            // (this machine often uses DeepSeek there).
            refresh_minimax_side_channel();
            crate::codex_micro_overlay::request_overlay_push(&app, state.as_ref(), false);
            std::thread::sleep(Duration::from_secs(REFRESH_SECS));
        });
}

fn is_plausible_minimax_api_key(key: &str) -> bool {
    let k = key.trim();
    k.len() >= 20
        && !k.eq_ignore_ascii_case("sk-xxx")
        && !k.contains(' ')
        && !k.starts_with("eyJ") // JWT is login cookie, not Coding Plan key
}

/// Soft Pad–saved Coding Plan key (not Claude settings / MiniMax Code JWT).
fn onetone_minimax_key_path() -> PathBuf {
    data_root::effective_data_root().join("minimax-coding-api-key.txt")
}

pub fn read_stored_minimax_coding_key() -> Option<String> {
    let raw = std::fs::read_to_string(onetone_minimax_key_path()).ok()?;
    let k = raw.lines().next()?.trim().to_string();
    if is_plausible_minimax_api_key(&k) {
        Some(k)
    } else {
        None
    }
}

pub fn masked_stored_minimax_coding_key() -> Option<String> {
    let k = read_stored_minimax_coding_key()?;
    if k.len() <= 8 {
        return Some("••••".into());
    }
    Some(format!("{}…{}", &k[..4], &k[k.len() - 4..]))
}

pub fn set_stored_minimax_coding_key(key: &str) -> Result<(), String> {
    let k = key.trim();
    let path = onetone_minimax_key_path();
    if k.is_empty() {
        let _ = std::fs::remove_file(&path);
        return Ok(());
    }
    if !is_plausible_minimax_api_key(k) {
        return Err("invalid_minimax_coding_key".into());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, format!("{k}\n")).map_err(|e| e.to_string())
}

/// Persist key (or clear), bust MiniMax usage cache, and refresh 5h windows.
pub fn apply_minimax_coding_key(key: &str) -> Result<(), String> {
    use crate::soft_pad_runtime::AgentKind;
    set_stored_minimax_coding_key(key)?;
    let mut snap = agent_usage::snapshot(AgentKind::MiniMax);
    snap.last_success_at = 0;
    snap.status = "waiting".into();
    snap.message = "同步 Coding Plan…".into();
    agent_usage::put_usage_snapshot(AgentKind::MiniMax, snap);
    refresh_minimax_side_channel();
    Ok(())
}

fn read_minimax_api_key_from_yaml(raw: &str) -> Option<String> {
    for line in raw.lines() {
        let t = line.trim();
        let Some(rest) = t
            .strip_prefix("apiKey:")
            .or_else(|| t.strip_prefix("api_key:"))
            .or_else(|| t.strip_prefix("MINIMAX_API_KEY:"))
        else {
            continue;
        };
        let k = rest
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim();
        if is_plausible_minimax_api_key(k) {
            return Some(k.to_string());
        }
    }
    None
}

fn minimax_config_yaml_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        out.push(PathBuf::from(&home).join(".minimax").join("config.yaml"));
        out.push(
            PathBuf::from(&home)
                .join(".minimax")
                .join("agents")
                .join("coder")
                .join("config.yaml"),
        );
    }
    out
}

fn minimax_desktop_logged_in() -> bool {
    let candidates = [
        std::env::var("APPDATA")
            .ok()
            .map(|p| PathBuf::from(p).join("MiniMax").join("minimax-agent-cn-config.json")),
        std::env::var("USERPROFILE")
            .ok()
            .map(|p| PathBuf::from(p).join(".minimax").join("local-runtime.auth.json")),
        std::env::var("HOME")
            .ok()
            .map(|p| PathBuf::from(p).join(".minimax").join("local-runtime.auth.json")),
    ];
    for path in candidates.into_iter().flatten() {
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let token = v
            .pointer("/tokens/accessToken")
            .or_else(|| v.pointer("/auth/accessToken"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim();
        if token.len() >= 20 {
            return true;
        }
    }
    false
}

/// Discover MiniMax Coding Plan API key outside (or in) Claude settings.
fn discover_minimax_coding_key() -> Option<(String, String)> {
    // Soft Pad / OneTone-saved key wins — independent of Claude DeepSeek settings.
    if let Some(k) = read_stored_minimax_coding_key() {
        return Some((k, "https://api.minimaxi.com".into()));
    }
    if let Some((base, key)) = read_base_key() {
        if detect_provider_from_base(&base) == ProviderId::MiniMax && is_plausible_minimax_api_key(&key)
        {
            return Some((key, base));
        }
    }
    for env_key in ["MINIMAX_API_KEY", "MINIMAX_CODING_API_KEY", "MINIMAX_AUTH_TOKEN"] {
        if let Ok(k) = std::env::var(env_key) {
            if is_plausible_minimax_api_key(&k) {
                return Some((k, "https://api.minimaxi.com".into()));
            }
        }
    }
    for path in minimax_config_yaml_paths() {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Some(k) = read_minimax_api_key_from_yaml(&raw) {
                return Some((k, "https://api.minimaxi.com".into()));
            }
        }
    }
    None
}

/// Soft Pad MiniMax usage, independent of Claude `ANTHROPIC_BASE_URL` (often DeepSeek).
pub fn refresh_minimax_side_channel() {
    if !agent_usage::usage_env_enabled() {
        return;
    }
    use crate::soft_pad_runtime::AgentKind;

    let existing = agent_usage::snapshot(AgentKind::MiniMax);
    if existing.status == "ready"
        && (existing.source == "minimax_remains" || existing.source.starts_with("minimax_remains"))
        && existing.last_success_at > 0
        && now_ms().saturating_sub(existing.last_success_at) < 4 * 60 * 1000
    {
        return;
    }

    // Claude settings already MiniMax — refresh_once owns the official view.
    let av = active_view();
    if av.detected && av.provider.eq_ignore_ascii_case("minimax") && av.status == "ready" {
        return;
    }

    if let Some((key, base)) = discover_minimax_coding_key() {
        let (t, m, r) = local_totals_for_provider("minimax");
        let mut snap = agent_usage::AgentUsageSnapshot {
            source: "minimax_remains".into(),
            account_type: "minimax".into(),
            account_label: ProviderId::MiniMax.account_label().into(),
            plan_type: "Coding Plan".into(),
            console_url: ProviderId::MiniMax.console_url().into(),
            coding_plan_warning: true,
            local_today_tokens: if t > 0 { Some(t) } else { None },
            local_month_tokens: if m > 0 { Some(m) } else { None },
            local_today_requests: if r > 0 { Some(r) } else { None },
            updated_at: now_ms(),
            ..Default::default()
        };
        match fetch_minimax(&key, &base) {
            Ok(windows) => {
                snap.windows = windows;
                snap.status = "ready".into();
                snap.confidence = "official".into();
                snap.message = "MiniMax Coding Plan".into();
                snap.last_success_at = now_ms();
            }
            Err(e) => {
                if existing.last_success_at > 0 && !existing.windows.is_empty() {
                    snap = existing;
                    snap.status = "stale".into();
                    snap.confidence = "stale".into();
                    snap.message = format!(
                        "{}（刷新失败：{}）",
                        snap.message,
                        e.chars().take(80).collect::<String>()
                    );
                    snap.updated_at = now_ms();
                } else {
                    snap.source = "minimax_error".into();
                    snap.status = "waiting".into();
                    snap.confidence = "local_only".into();
                    snap.message =
                        format!("额度未同步：{}", e.chars().take(100).collect::<String>());
                }
            }
        }
        agent_usage::put_usage_snapshot(AgentKind::MiniMax, snap);
        return;
    }

    if minimax_desktop_logged_in() {
        let (t, m, r) = local_totals_for_provider("minimax");
        let local_bit = match (t, m) {
            (tt, mm) if tt > 0 || mm > 0 => format!("本机今日 {tt} tok · 本月 {mm} tok"),
            _ => "本机暂无记录".into(),
        };
        let snap = agent_usage::AgentUsageSnapshot {
            source: "minimax_manual".into(),
            status: "ready".into(),
            confidence: "manual_or_local_estimate".into(),
            account_type: "minimax".into(),
            account_label: ProviderId::MiniMax.account_label().into(),
            plan_type: "Token Plan".into(),
            console_url: ProviderId::MiniMax.console_url().into(),
            coding_plan_warning: true,
            message: format!(
                "点击填写 Key · 未配置 Coding Plan API Key · 官方剩余请到控制台 · {local_bit}"
            ),
            local_today_tokens: if t > 0 { Some(t) } else { None },
            local_month_tokens: if m > 0 { Some(m) } else { None },
            local_today_requests: if r > 0 { Some(r) } else { None },
            updated_at: now_ms(),
            last_success_at: now_ms(),
            ..Default::default()
        };
        agent_usage::put_usage_snapshot(AgentKind::MiniMax, snap);
    }
}

#[cfg(test)]
pub fn reset_for_test() {
    *view_store().lock().unwrap() = ProviderUsageView::default();
    set_settings_path_override_for_test(None);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_hosts() {
        assert_eq!(
            detect_provider_from_base("https://ark.cn-beijing.volces.com/api/coding"),
            ProviderId::Ark
        );
        assert_eq!(
            detect_provider_from_base("https://api.z.ai/v1"),
            ProviderId::Glm
        );
        assert_eq!(
            detect_provider_from_base("https://open.bigmodel.cn/api/anthropic"),
            ProviderId::Glm
        );
        assert_eq!(
            detect_provider_from_base("https://api.moonshot.cn/v1"),
            ProviderId::Kimi
        );
        assert_eq!(
            detect_provider_from_base("https://api.minimaxi.com/anthropic"),
            ProviderId::MiniMax
        );
        assert_eq!(
            detect_provider_from_base("https://dashscope.aliyuncs.com/compatible-mode/v1"),
            ProviderId::Bailian
        );
        assert_eq!(
            detect_provider_from_base("https://token-plan.sgp.xiaomimimo.com/anthropic"),
            ProviderId::Mimo
        );
        assert_eq!(
            detect_provider_from_base("https://api.deepseek.com/anthropic"),
            ProviderId::DeepSeek
        );
        assert_eq!(
            detect_provider_from_base("https://api.anthropic.com"),
            ProviderId::Unknown
        );
    }

    #[test]
    fn parse_minimax_fixture() {
        let raw = r#"{"base_resp":{"status_code":0},"model_remains":[{"model_name":"general","current_interval_remaining_percent":72.5,"current_weekly_remaining_percent":85.0,"end_time":1740000000,"weekly_end_time":1740600000}]}"#;
        let w = parse_minimax_remains_json(raw).unwrap();
        assert_eq!(w.len(), 2);
        assert_eq!(w[0].remaining_percent, Some(72.5));
        assert_eq!(w[1].remaining_percent, Some(85.0));
    }

    #[test]
    fn parse_glm_fixture() {
        let raw = r#"{"code":200,"data":{"limits":[{"type":"TIME_LIMIT","percentage":40,"nextResetTime":1740000000},{"type":"TOKENS_LIMIT","percentage":55,"nextResetTime":1740600000}]}}"#;
        let w = parse_glm_quota_json(raw).unwrap();
        assert!(w.iter().any(|x| x.kind == "primary"));
        assert!(w[0].remaining_percent.unwrap() > 50.0);
    }

    #[test]
    fn parse_kimi_balance_fixture() {
        let raw = r#"{"code":0,"data":{"available_balance":12.5,"voucher_balance":1.0,"cash_balance":11.5}}"#;
        assert!(parse_kimi_balance_json(raw).unwrap().contains("12.5"));
    }

    #[test]
    fn parse_arkcli_periods() {
        let raw = r#"{"viewer":{},"items":[{"product":"coding-plan","subscribed":true,"tier":"lite","periods":[{"label":"5h","percent":30.0,"reset_at":"x"},{"label":"weekly","percent":50.0},{"label":"monthly","percent":20.0}]}]}"#;
        let (w, tier) = parse_arkcli_usage_plan_json(raw).unwrap();
        assert_eq!(tier, "lite");
        assert_eq!(w.len(), 3);
        assert_eq!(w[0].remaining_percent, Some(70.0));
    }

    #[test]
    fn model_name_alone_not_deepseek_host() {
        assert_eq!(
            detect_provider_from_base("https://api.anthropic.com"),
            ProviderId::Unknown
        );
    }

    #[test]
    fn minimax_yaml_key_skips_placeholder_and_jwt() {
        assert!(read_minimax_api_key_from_yaml("apiKey: sk-xxx").is_none());
        assert!(read_minimax_api_key_from_yaml(
            "apiKey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"
        )
        .is_none());
        let k = read_minimax_api_key_from_yaml(
            "provider:\n  minimax:\n    apiKey: sk-abcdefghijklmnopqrstuvwxyz012345\n",
        )
        .expect("real key");
        assert!(k.starts_with("sk-abcdef"));
        assert!(!is_plausible_minimax_api_key("sk-xxx"));
        assert!(is_plausible_minimax_api_key(
            "sk-abcdefghijklmnopqrstuvwxyz012345"
        ));
    }
}
