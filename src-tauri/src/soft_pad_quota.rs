//! Soft Pad multi-provider API quota (OpenRouter / DeepSeek / Kimi / SiliconFlow).
//!
//! Keys: plaintext `{data_root}/<provider>-api-key.txt` (MiniMax pattern).
//! Cache: TTL 60s + 429 cooldown 30s; parallel refresh; partial failure isolation.

use crate::data_root;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const HTTP_TIMEOUT_SECS: u64 = 15;
const CACHE_TTL: Duration = Duration::from_secs(60);
const COOLDOWN_429: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SoftPadQuotaProvider {
    OpenRouter,
    DeepSeek,
    Kimi,
    SiliconFlow,
}

impl SoftPadQuotaProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenRouter => "openrouter",
            Self::DeepSeek => "deepseek",
            Self::Kimi => "kimi",
            Self::SiliconFlow => "siliconflow",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::OpenRouter => "OpenRouter",
            Self::DeepSeek => "DeepSeek",
            Self::Kimi => "Kimi",
            Self::SiliconFlow => "SiliconFlow",
        }
    }

    pub fn console_url(self) -> &'static str {
        match self {
            Self::OpenRouter => "https://openrouter.ai/settings/keys",
            Self::DeepSeek => "https://platform.deepseek.com/",
            Self::Kimi => "https://platform.moonshot.cn/",
            Self::SiliconFlow => "https://cloud.siliconflow.cn/account/ak",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "openrouter" | "or" => Some(Self::OpenRouter),
            "deepseek" | "ds" => Some(Self::DeepSeek),
            "kimi" | "moonshot" => Some(Self::Kimi),
            "siliconflow" | "sf" | "silicon" => Some(Self::SiliconFlow),
            _ => None,
        }
    }

    pub fn all() -> [Self; 4] {
        [
            Self::OpenRouter,
            Self::DeepSeek,
            Self::Kimi,
            Self::SiliconFlow,
        ]
    }

    fn key_filename(self) -> &'static str {
        match self {
            Self::OpenRouter => "openrouter-api-key.txt",
            Self::DeepSeek => "deepseek-api-key.txt",
            Self::Kimi => "kimi-api-key.txt",
            Self::SiliconFlow => "siliconflow-api-key.txt",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FetchErrKind {
    InvalidKey,
    ExpiredKey,
    RateLimited,
    Offline,
    Unexpected,
}

impl FetchErrKind {
    fn user_message(self, provider: SoftPadQuotaProvider) -> String {
        match self {
            Self::InvalidKey => "key 无效".into(),
            Self::ExpiredKey => format!("{} key 已过期", provider.label()),
            Self::RateLimited => "请求过于频繁".into(),
            Self::Offline => "离线".into(),
            Self::Unexpected => "响应异常".into(),
        }
    }
}

#[derive(Debug, Clone)]
struct ParsedQuota {
    caption: String,
    used: Option<f64>,
    limit: Option<f64>,
    remaining: Option<f64>,
    currency: Option<String>,
    free_tier: bool,
}

#[derive(Debug, Clone)]
struct CachedQuota {
    row: SoftPadQuotaRow,
    fetched_at: Instant,
}

#[derive(Debug, Default)]
struct QuotaCache {
    by_provider: HashMap<SoftPadQuotaProvider, CachedQuota>,
    cooldown_until: HashMap<SoftPadQuotaProvider, Instant>,
    /// After key_set: verified | pending | invalid | rate_limited
    verify: HashMap<SoftPadQuotaProvider, String>,
}

fn cache() -> &'static Mutex<QuotaCache> {
    static C: OnceLock<Mutex<QuotaCache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(QuotaCache::default()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn key_path(p: SoftPadQuotaProvider) -> PathBuf {
    data_root::effective_data_root().join(p.key_filename())
}

fn is_plausible_key(key: &str) -> bool {
    let k = key.trim();
    k.len() >= 12 && !k.contains(' ') && !k.eq_ignore_ascii_case("sk-xxx")
}

pub fn read_stored_key(p: SoftPadQuotaProvider) -> Option<String> {
    let raw = std::fs::read_to_string(key_path(p)).ok()?;
    let k = raw.lines().next()?.trim().to_string();
    if is_plausible_key(&k) {
        Some(k)
    } else {
        None
    }
}

pub fn masked_stored_key(p: SoftPadQuotaProvider) -> Option<String> {
    let k = read_stored_key(p)?;
    if k.len() <= 8 {
        return Some("••••".into());
    }
    Some(format!("{}…{}", &k[..4], &k[k.len() - 4..]))
}

/// Persist Soft Pad provider key (plaintext file).
///
/// TODO(post-p2): migrate to OS keyring or single encrypted blob at
/// {data_root}/keys.bin with machine-id derived key.
pub fn set_stored_key(p: SoftPadQuotaProvider, key: &str) -> Result<(), String> {
    let k = key.trim();
    let path = key_path(p);
    if k.is_empty() {
        let _ = std::fs::remove_file(&path);
        let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
        c.by_provider.remove(&p);
        c.cooldown_until.remove(&p);
        c.verify.remove(&p);
        return Ok(());
    }
    if !is_plausible_key(k) {
        return Err(format!("invalid_{}_key", p.as_str()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, format!("{k}\n")).map_err(|e| e.to_string())?;
    let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
    c.by_provider.remove(&p);
    c.cooldown_until.remove(&p);
    c.verify.insert(p, "pending".into());
    Ok(())
}

/// Save key then kick async verify + refresh (non-blocking UI).
pub fn apply_provider_key(p: SoftPadQuotaProvider, key: &str) -> Result<(), String> {
    set_stored_key(p, key)?;
    if key.trim().is_empty() {
        return Ok(());
    }
    std::thread::Builder::new()
        .name(format!("soft-pad-quota-verify-{}", p.as_str()))
        .spawn(move || {
            verify_and_refresh_one(p);
        })
        .ok();
    Ok(())
}

fn classify_http(status: u16, body: &str, provider: SoftPadQuotaProvider) -> FetchErrKind {
    if status == 429 {
        return FetchErrKind::RateLimited;
    }
    if status == 401 || status == 403 {
        let lower = body.to_ascii_lowercase();
        if provider == SoftPadQuotaProvider::SiliconFlow
            && (lower.contains("expir") || lower.contains("过期"))
        {
            return FetchErrKind::ExpiredKey;
        }
        return FetchErrKind::InvalidKey;
    }
    FetchErrKind::Unexpected
}

fn http_get_bearer_for(
    provider: SoftPadQuotaProvider,
    url: &str,
    api_key: &str,
) -> Result<String, (FetchErrKind, String)> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| (FetchErrKind::Offline, e.to_string()))?;
    let resp = client
        .get(url)
        .bearer_auth(api_key.trim())
        .header("Accept", "application/json")
        .send()
        .map_err(|e| (FetchErrKind::Offline, e.to_string()))?;
    let status = resp.status().as_u16();
    let body = resp
        .text()
        .map_err(|e| (FetchErrKind::Unexpected, e.to_string()))?;
    if !(200..300).contains(&status) {
        return Err((
            classify_http(status, &body, provider),
            body.chars().take(160).collect(),
        ));
    }
    Ok(body)
}

/// OpenRouter Auth Key response → usage / limit / remaining (null limit = free/unlimited).
pub fn parse_openrouter_auth_key_json(raw: &str) -> Result<ParsedQuota, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let data = v.get("data").unwrap_or(&v);
    let usage = data
        .get("usage")
        .and_then(|x| x.as_f64())
        .or_else(|| data.get("usage").and_then(|x| x.as_i64()).map(|n| n as f64));
    let limit = data.get("limit").and_then(|x| {
        if x.is_null() {
            None
        } else {
            x.as_f64()
                .or_else(|| x.as_i64().map(|n| n as f64))
        }
    });
    let remaining = data
        .get("limit_remaining")
        .and_then(|x| {
            if x.is_null() {
                None
            } else {
                x.as_f64()
                    .or_else(|| x.as_i64().map(|n| n as f64))
            }
        })
        .or_else(|| match (usage, limit) {
            (Some(u), Some(l)) => Some((l - u).max(0.0)),
            _ => None,
        });
    let free_tier = data
        .get("is_free_tier")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    let caption = if free_tier || limit.is_none() {
        match usage {
            Some(u) => format!("OR · 已用 {u:.0}"),
            None => "OR · 免费档".into(),
        }
    } else {
        match (usage, remaining, limit) {
            (Some(u), Some(r), Some(l)) => format!("OR · {u:.0}/{l:.0} 余{r:.0}"),
            (Some(u), _, Some(l)) => format!("OR · {u:.0}/{l:.0}"),
            _ => "OpenRouter".into(),
        }
    };
    Ok(ParsedQuota {
        caption,
        used: usage,
        limit,
        remaining,
        currency: Some("credits".into()),
        free_tier,
    })
}

/// DeepSeek balance — empty `balance_infos` / `balance_available` → zeros, no panic.
pub fn parse_deepseek_soft_pad_balance_json(raw: &str) -> Result<ParsedQuota, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    // Prefer balance_infos (official); also accept balance_available[] shape.
    if let Some(infos) = v.get("balance_infos").and_then(|x| x.as_array()) {
        if infos.is_empty() {
            return Ok(ParsedQuota {
                caption: "DS · ¥0".into(),
                used: Some(0.0),
                limit: Some(0.0),
                remaining: Some(0.0),
                currency: Some("CNY".into()),
                free_tier: false,
            });
        }
        let first = &infos[0];
        let currency = first
            .get("currency")
            .and_then(|x| x.as_str())
            .unwrap_or("CNY")
            .to_string();
        let total: f64 = first
            .get("total_balance")
            .and_then(|x| x.as_str())
            .and_then(|s| s.parse().ok())
            .or_else(|| first.get("total_balance").and_then(|x| x.as_f64()))
            .unwrap_or(0.0);
        let available: f64 = first
            .get("available_balance")
            .and_then(|x| x.as_str())
            .and_then(|s| s.parse().ok())
            .or_else(|| first.get("available_balance").and_then(|x| x.as_f64()))
            .unwrap_or(total);
        let used = (total - available).max(0.0);
        let sym = if currency.eq_ignore_ascii_case("CNY") {
            "¥"
        } else {
            ""
        };
        return Ok(ParsedQuota {
            caption: format!("DS · {sym}{available}"),
            used: Some(used),
            limit: Some(total),
            remaining: Some(available),
            currency: Some(currency),
            free_tier: false,
        });
    }
    if let Some(arr) = v.get("balance_available").and_then(|x| x.as_array()) {
        if arr.is_empty() {
            return Ok(ParsedQuota {
                caption: "DS · ¥0".into(),
                used: Some(0.0),
                limit: Some(0.0),
                remaining: Some(0.0),
                currency: Some("CNY".into()),
                free_tier: false,
            });
        }
    }
    Err("missing balance_infos".into())
}

/// Kimi balance JSON; non-JSON callers should hit Unexpected before this.
pub fn parse_kimi_soft_pad_balance_json(raw: &str) -> Result<ParsedQuota, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| format!("non_json: {e}"))?;
    let data = v.get("data").unwrap_or(&v);
    let available = data
        .get("available_balance")
        .and_then(|x| x.as_f64())
        .ok_or_else(|| "missing available_balance".to_string())?;
    let cash = data.get("cash_balance").and_then(|x| x.as_f64());
    let voucher = data.get("voucher_balance").and_then(|x| x.as_f64());
    let total = cash
        .unwrap_or(0.0)
        .max(0.0)
        + voucher.unwrap_or(0.0).max(0.0);
    let limit = if total > 0.0 { Some(total) } else { None };
    Ok(ParsedQuota {
        caption: format!("Ki · ¥{available}"),
        used: limit.map(|l| (l - available).max(0.0)),
        limit,
        remaining: Some(available),
        currency: Some("CNY".into()),
        free_tier: false,
    })
}

pub fn parse_siliconflow_user_info_json(raw: &str) -> Result<ParsedQuota, String> {
    let v: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let data = v.get("data").unwrap_or(&v);
    let balance = data
        .get("balance")
        .and_then(|x| x.as_f64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
        .or_else(|| {
            data.get("totalBalance")
                .and_then(|x| x.as_f64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
        })
        .unwrap_or(0.0);
    let charge = data
        .get("chargeBalance")
        .and_then(|x| x.as_f64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0.0);
    let voucher = data
        .get("voucherBalance")
        .and_then(|x| x.as_f64().or_else(|| x.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(0.0);
    let remaining = balance.max(charge + voucher);
    Ok(ParsedQuota {
        caption: format!("SF · ¥{remaining}"),
        used: None,
        limit: None,
        remaining: Some(remaining),
        currency: Some("CNY".into()),
        free_tier: false,
    })
}

fn fetch_one(
    p: SoftPadQuotaProvider,
    key: &str,
) -> Result<ParsedQuota, (FetchErrKind, String)> {
    match p {
        SoftPadQuotaProvider::OpenRouter => {
            let body = http_get_bearer_for(
                p,
                "https://openrouter.ai/api/v1/auth/key",
                key,
            )?;
            parse_openrouter_auth_key_json(&body)
                .map_err(|e| (FetchErrKind::Unexpected, e))
        }
        SoftPadQuotaProvider::DeepSeek => {
            let body = http_get_bearer_for(p, "https://api.deepseek.com/user/balance", key)?;
            parse_deepseek_soft_pad_balance_json(&body)
                .map_err(|e| (FetchErrKind::Unexpected, e))
        }
        SoftPadQuotaProvider::Kimi => {
            let body =
                http_get_bearer_for(p, "https://api.moonshot.cn/v1/users/me/balance", key)?;
            // Non-JSON HTML → Unexpected
            if body.trim_start().starts_with('<') {
                return Err((FetchErrKind::Unexpected, "non_json_html".into()));
            }
            parse_kimi_soft_pad_balance_json(&body)
                .map_err(|e| (FetchErrKind::Unexpected, e))
        }
        SoftPadQuotaProvider::SiliconFlow => {
            let body =
                http_get_bearer_for(p, "https://api.siliconflow.cn/v1/user/info", key)?;
            parse_siliconflow_user_info_json(&body)
                .map_err(|e| (FetchErrKind::Unexpected, e))
        }
    }
}

fn row_from_ok(p: SoftPadQuotaProvider, q: ParsedQuota, verify: &str) -> SoftPadQuotaRow {
    SoftPadQuotaRow {
        provider: p.as_str().into(),
        label: p.label().into(),
        status: "ok".into(),
        icon: "ok".into(),
        message: String::new(),
        caption: q.caption,
        used: q.used,
        limit: q.limit,
        remaining: q.remaining,
        currency: q.currency.unwrap_or_default(),
        free_tier: q.free_tier,
        last_updated_at: now_ms(),
        last_success_at: now_ms(),
        verify_status: verify.into(),
        console_url: p.console_url().into(),
        configured: true,
    }
}

fn row_from_err(
    p: SoftPadQuotaProvider,
    kind: FetchErrKind,
    prior: Option<&SoftPadQuotaRow>,
    verify: &str,
) -> SoftPadQuotaRow {
    let msg = kind.user_message(p);
    let (status, icon) = match kind {
        FetchErrKind::InvalidKey | FetchErrKind::ExpiredKey => ("error", "err"),
        FetchErrKind::RateLimited => ("warn", "warn"),
        FetchErrKind::Offline => ("offline", "warn"),
        FetchErrKind::Unexpected => ("warn", "warn"),
    };
    let mut row = SoftPadQuotaRow {
        provider: p.as_str().into(),
        label: p.label().into(),
        status: status.into(),
        icon: icon.into(),
        message: msg.clone(),
        caption: msg,
        used: None,
        limit: None,
        remaining: None,
        currency: String::new(),
        free_tier: false,
        last_updated_at: now_ms(),
        last_success_at: prior.map(|r| r.last_success_at).unwrap_or(0),
        verify_status: verify.into(),
        console_url: p.console_url().into(),
        configured: true,
    };
    // Keep last success numbers on rate-limit / offline (stale warn).
    if matches!(kind, FetchErrKind::RateLimited | FetchErrKind::Offline) {
        if let Some(prev) = prior {
            if prev.last_success_at > 0 && prev.status == "ok" {
                row.used = prev.used;
                row.limit = prev.limit;
                row.remaining = prev.remaining;
                row.currency = prev.currency.clone();
                row.caption = format!("{} · {}", prev.caption, row.message);
                row.free_tier = prev.free_tier;
            }
        }
    }
    // Invalid key: do not show usage numbers.
    if matches!(kind, FetchErrKind::InvalidKey | FetchErrKind::ExpiredKey) {
        row.caption = if kind == FetchErrKind::ExpiredKey {
            format!("{} · key 已过期", p.label())
        } else {
            format!("{} · key 待验证", p.label())
        };
        row.verify_status = if kind == FetchErrKind::ExpiredKey {
            "expired".into()
        } else {
            "invalid".into()
        };
    }
    row
}

fn verify_and_refresh_one(p: SoftPadQuotaProvider) {
    let Some(key) = read_stored_key(p) else {
        return;
    };
    match fetch_one(p, &key) {
        Ok(q) => {
            let row = row_from_ok(p, q, "verified");
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            c.verify.insert(p, "verified".into());
            c.by_provider.insert(
                p,
                CachedQuota {
                    row,
                    fetched_at: Instant::now(),
                },
            );
        }
        Err((FetchErrKind::RateLimited, _)) => {
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            c.verify.insert(p, "rate_limited".into());
            c.cooldown_until
                .insert(p, Instant::now() + COOLDOWN_429);
            let prior = c.by_provider.get(&p).map(|x| x.row.clone());
            let row = row_from_err(p, FetchErrKind::RateLimited, prior.as_ref(), "rate_limited");
            c.by_provider.insert(
                p,
                CachedQuota {
                    row,
                    fetched_at: Instant::now(),
                },
            );
        }
        Err((kind, _)) => {
            let verify = match kind {
                FetchErrKind::InvalidKey => "invalid",
                FetchErrKind::ExpiredKey => "expired",
                _ => "pending",
            };
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            c.verify.insert(p, verify.into());
            let prior = c.by_provider.get(&p).map(|x| x.row.clone());
            let row = row_from_err(p, kind, prior.as_ref(), verify);
            c.by_provider.insert(
                p,
                CachedQuota {
                    row,
                    fetched_at: Instant::now(),
                },
            );
        }
    }
}

fn refresh_provider_blocking(p: SoftPadQuotaProvider) {
    let Some(key) = read_stored_key(p) else {
        let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
        c.by_provider.remove(&p);
        return;
    };

    {
        let c = cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(until) = c.cooldown_until.get(&p) {
            if Instant::now() < *until {
                return; // serve cache / prior warn row
            }
        }
        if let Some(cached) = c.by_provider.get(&p) {
            if cached.fetched_at.elapsed() < CACHE_TTL && cached.row.status == "ok" {
                return;
            }
        }
    }

    match fetch_one(p, &key) {
        Ok(q) => {
            let verify = {
                let c = cache().lock().unwrap_or_else(|e| e.into_inner());
                c.verify
                    .get(&p)
                    .cloned()
                    .unwrap_or_else(|| "verified".into())
            };
            let row = row_from_ok(p, q, &verify);
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            c.cooldown_until.remove(&p);
            c.verify.insert(p, "verified".into());
            c.by_provider.insert(
                p,
                CachedQuota {
                    row: SoftPadQuotaRow {
                        verify_status: "verified".into(),
                        ..row
                    },
                    fetched_at: Instant::now(),
                },
            );
        }
        Err((FetchErrKind::RateLimited, _)) => {
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            c.cooldown_until
                .insert(p, Instant::now() + COOLDOWN_429);
            let prior = c.by_provider.get(&p).map(|x| x.row.clone());
            let row = row_from_err(p, FetchErrKind::RateLimited, prior.as_ref(), "rate_limited");
            c.by_provider.insert(
                p,
                CachedQuota {
                    row,
                    fetched_at: Instant::now(),
                },
            );
        }
        Err((kind, _)) => {
            let verify = match kind {
                FetchErrKind::InvalidKey => "invalid",
                FetchErrKind::ExpiredKey => "expired",
                _ => "pending",
            };
            let mut c = cache().lock().unwrap_or_else(|e| e.into_inner());
            let prior = c.by_provider.get(&p).map(|x| x.row.clone());
            if matches!(kind, FetchErrKind::InvalidKey | FetchErrKind::ExpiredKey) {
                c.verify.insert(p, verify.into());
            }
            let row = row_from_err(p, kind, prior.as_ref(), verify);
            c.by_provider.insert(
                p,
                CachedQuota {
                    row,
                    fetched_at: Instant::now(),
                },
            );
        }
    }
}

/// Parallel refresh for all configured Soft Pad providers (TTL / cooldown aware).
pub fn refresh_all_configured() {
    let configured: Vec<SoftPadQuotaProvider> = SoftPadQuotaProvider::all()
        .into_iter()
        .filter(|p| read_stored_key(*p).is_some())
        .collect();
    if configured.is_empty() {
        return;
    }
    std::thread::scope(|scope| {
        for p in configured {
            scope.spawn(move || refresh_provider_blocking(p));
        }
    });
}

/// Kick refresh on a background thread (mini open / pill click).
pub fn kick_refresh_all() {
    std::thread::Builder::new()
        .name("soft-pad-quota-refresh".into())
        .spawn(|| {
            refresh_all_configured();
        })
        .ok();
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadQuotaRow {
    pub provider: String,
    pub label: String,
    /// ok | warn | error | offline
    pub status: String,
    /// ok | warn | err — mini dropdown glyph
    pub icon: String,
    pub message: String,
    pub caption: String,
    pub used: Option<f64>,
    pub limit: Option<f64>,
    pub remaining: Option<f64>,
    pub currency: String,
    pub free_tier: bool,
    pub last_updated_at: u64,
    pub last_success_at: u64,
    pub verify_status: String,
    pub console_url: String,
    pub configured: bool,
}

/// Snapshot rows for overlay (only configured providers). Serves cache.
pub fn snapshot_rows() -> Vec<SoftPadQuotaRow> {
    let mut out = Vec::new();
    let c = cache().lock().unwrap_or_else(|e| e.into_inner());
    for p in SoftPadQuotaProvider::all() {
        if read_stored_key(p).is_none() {
            continue;
        }
        if let Some(cached) = c.by_provider.get(&p) {
            out.push(cached.row.clone());
        } else {
            let verify = c
                .verify
                .get(&p)
                .cloned()
                .unwrap_or_else(|| "pending".into());
            out.push(SoftPadQuotaRow {
                provider: p.as_str().into(),
                label: p.label().into(),
                status: "warn".into(),
                icon: "warn".into(),
                message: "同步中".into(),
                caption: format!("{} · 同步中", p.label()),
                verify_status: verify,
                console_url: p.console_url().into(),
                configured: true,
                last_updated_at: now_ms(),
                ..Default::default()
            });
        }
    }
    out
}

/// Freshest last_updated_at among configured rows (for mini freshness dot).
pub fn freshest_updated_at(rows: &[SoftPadQuotaRow]) -> u64 {
    rows.iter().map(|r| r.last_updated_at).max().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn openrouter_free_tier_null_limit() {
        let raw = r#"{"data":{"label":"sk","usage":12.5,"is_free_tier":true,"limit":null,"rate_limit":{"requests":20,"interval":"10s"}}}"#;
        let q = parse_openrouter_auth_key_json(raw).expect("parse");
        assert!(q.free_tier);
        assert!(q.limit.is_none());
        assert_eq!(q.used, Some(12.5));
        assert!(q.caption.contains("已用") || q.caption.contains("免费"));
    }

    #[test]
    fn openrouter_paid_with_remaining() {
        let raw = r#"{"data":{"usage":100,"limit":200,"limit_remaining":100,"is_free_tier":false}}"#;
        let q = parse_openrouter_auth_key_json(raw).unwrap();
        assert_eq!(q.remaining, Some(100.0));
        assert_eq!(q.limit, Some(200.0));
    }

    #[test]
    fn deepseek_empty_balance_infos() {
        let raw = r#"{"is_available":false,"balance_infos":[]}"#;
        let q = parse_deepseek_soft_pad_balance_json(raw).unwrap();
        assert_eq!(q.remaining, Some(0.0));
        assert_eq!(q.used, Some(0.0));
    }

    #[test]
    fn deepseek_empty_balance_available_array() {
        let raw = r#"{"balance_available":[]}"#;
        let q = parse_deepseek_soft_pad_balance_json(raw).unwrap();
        assert_eq!(q.remaining, Some(0.0));
    }

    #[test]
    fn kimi_non_json_errors() {
        let err = parse_kimi_soft_pad_balance_json("<html>oops</html>").unwrap_err();
        assert!(err.contains("non_json") || err.contains("expected"));
    }

    #[test]
    fn kimi_balance_ok() {
        let raw = r#"{"code":0,"data":{"available_balance":12.5,"voucher_balance":1.0,"cash_balance":11.5}}"#;
        let q = parse_kimi_soft_pad_balance_json(raw).unwrap();
        assert_eq!(q.remaining, Some(12.5));
    }

    #[test]
    fn siliconflow_balances() {
        let raw = r#"{"data":{"balance":"10.5","chargeBalance":"8","voucherBalance":"2.5"}}"#;
        let q = parse_siliconflow_user_info_json(raw).unwrap();
        assert!(q.remaining.unwrap() >= 10.0);
    }

    #[test]
    fn classify_siliconflow_expired_vs_invalid() {
        assert_eq!(
            classify_http(401, "token expired", SoftPadQuotaProvider::SiliconFlow),
            FetchErrKind::ExpiredKey
        );
        assert_eq!(
            classify_http(401, "invalid api key", SoftPadQuotaProvider::SiliconFlow),
            FetchErrKind::InvalidKey
        );
        assert_eq!(
            classify_http(401, "nope", SoftPadQuotaProvider::OpenRouter),
            FetchErrKind::InvalidKey
        );
        assert_eq!(
            classify_http(429, "slow down", SoftPadQuotaProvider::Kimi),
            FetchErrKind::RateLimited
        );
    }

    #[test]
    fn invalid_key_row_hides_numbers() {
        let row = row_from_err(
            SoftPadQuotaProvider::OpenRouter,
            FetchErrKind::InvalidKey,
            None,
            "invalid",
        );
        assert!(row.used.is_none());
        assert!(row.caption.contains("待验证") || row.message.contains("无效"));
        assert_eq!(row.verify_status, "invalid");
    }
}
