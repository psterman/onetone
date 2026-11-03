//! OpenCode Zen / Console device OAuth → model_provider upsert.
//!
//! Device flow (CLI-compatible):
//!   POST https://console.opencode.ai/auth/device/code
//!   open verification_uri_complete
//!   POST https://console.opencode.ai/auth/device/token (poll)
//!
//! On success: persist oauth json + upsert model_provider `opencode_zen` with access token as key.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::data_root::effective_data_root;
use crate::model_provider::{self, ModelProviderConfig};

const PROVIDER_ID: &str = "opencode_zen";
const PROVIDER_NAME: &str = "OpenCode Zen";
const CLIENT_ID: &str = "opencode-cli";
/// Device code/token API host (CLI-compatible). Browser verification uses SITE_ORIGIN.
const AUTH_BASE: &str = "https://console.opencode.ai";
const SITE_ORIGIN: &str = "https://opencode.ai";
const DEVICE_CODE_PATH: &str = "/auth/device/code";
const DEVICE_TOKEN_PATH: &str = "/auth/device/token";
const CHAT_BASE: &str = "https://opencode.ai/zen/v1";
const DEFAULT_MODEL: &str = "big-pickle";
const GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
const OAUTH_LOGIN_TTL_MS: u64 = 10 * 60 * 1000;
const HTTP_TIMEOUT_SECS: u64 = 20;
const UA: &str = "OneTone/opencode-zen-oauth";

#[derive(Debug, Clone)]
struct PendingDevice {
    device_code: String,
    user_code: String,
    auth_url: String,
    interval_secs: u64,
    expires_at: u64,
    last_poll_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OauthCreds {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    access_expires_at: u64,
    #[serde(default)]
    account_id: String,
    #[serde(default)]
    email: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn trunc_err(s: &str) -> String {
    let t = s.trim();
    if t.len() <= 240 {
        t.to_string()
    } else {
        format!("{}…", &t[..240])
    }
}

fn oauth_path() -> PathBuf {
    effective_data_root().join("freemodel-oauth").join(format!("{PROVIDER_ID}.oauth.json"))
}

fn pending_mutex() -> &'static Mutex<HashMap<String, PendingDevice>> {
    static M: OnceLock<Mutex<HashMap<String, PendingDevice>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

fn write_oauth(creds: &OauthCreds) -> Result<(), String> {
    let path = oauth_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn open_system_browser(url: &str) -> Result<(), String> {
    let url = url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("invalid_auth_url".into());
    }
    #[cfg(windows)]
    {
        // Same as WorkBuddy: FileProtocolHandler keeps query/hash (device user_code) intact.
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("open url is only supported on Windows".into())
    }
}

fn upsert_provider_with_token(access: &str) -> Result<Value, String> {
    let cfg = ModelProviderConfig {
        id: PROVIDER_ID.into(),
        name: PROVIDER_NAME.into(),
        protocol: "openai_compatible".into(),
        base_url: CHAT_BASE.into(),
        model: DEFAULT_MODEL.into(),
        enabled: true,
        timeout_ms: Some(60_000),
        max_context_tokens: None,
        supports_json: Some(true),
        supports_streaming: Some(false),
        supports_tools: Some(false),
    };
    model_provider::upsert(cfg)?;
    model_provider::set_key(PROVIDER_ID, access)?;
    Ok(json!({ "providers": model_provider::snapshot()? }))
}

/// Resolve Console verification URL. Origin-rooted `/console/device` must use SITE_ORIGIN
/// (not AUTH_BASE) or you get `/console/console/device` — see opencode#56513 / #44029.
pub fn resolve_device_auth_url(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    let absolute = if s.starts_with("https://") || s.starts_with("http://") {
        s.to_string()
    } else if s.starts_with("/console/") || s == "/console" {
        format!("{SITE_ORIGIN}{s}")
    } else if s.starts_with('/') {
        // Path under console API base, e.g. `/device?...`
        format!(
            "{}{}",
            AUTH_BASE.trim_end_matches('/'),
            s
        )
    } else {
        format!("{}/{s}", AUTH_BASE.trim_end_matches('/'))
    };
    // Collapse accidental /console/console/
    absolute.replacen("/console/console/", "/console/", 1)
}

/// Parse device/code JSON into (device_code, user_code, auth_url, interval_secs, expires_in_secs).
pub fn parse_device_code_response(raw: &str) -> Result<(String, String, String, u64, u64), String> {
    let body: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let device_code = body
        .get("device_code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let user_code = body
        .get("user_code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let mut auth_url = body
        .get("verification_uri_complete")
        .or_else(|| body.get("verificationUriComplete"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if auth_url.is_empty() {
        let base = body
            .get("verification_uri")
            .or_else(|| body.get("verificationUri"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if !base.is_empty() && !user_code.is_empty() {
            auth_url = if base.contains('?') {
                format!("{base}&user_code={user_code}")
            } else {
                format!("{base}?user_code={user_code}")
            };
        }
    }
    auth_url = resolve_device_auth_url(&auth_url);
    if device_code.is_empty() || auth_url.is_empty() {
        return Err("oauth_device_incomplete".into());
    }
    let interval = body
        .get("interval")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .max(1);
    let expires_in = body
        .get("expires_in")
        .or_else(|| body.get("expiresIn"))
        .and_then(|v| v.as_u64())
        .unwrap_or(600);
    Ok((device_code, user_code, auth_url, interval, expires_in))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DevicePollParsed {
    Pending,
    SlowDown,
    Ok {
        access_token: String,
        refresh_token: String,
        expires_in: u64,
        account_id: String,
        email: String,
    },
    Fail(String),
}

/// Parse device/token poll JSON (OAuth device grant).
pub fn parse_device_token_response(raw: &str) -> DevicePollParsed {
    let body: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(e) => return DevicePollParsed::Fail(trunc_err(&e.to_string())),
    };
    if let Some(err) = body.get("error").and_then(|e| e.as_str()) {
        let low = err.to_ascii_lowercase();
        if low == "authorization_pending" {
            return DevicePollParsed::Pending;
        }
        if low == "slow_down" {
            return DevicePollParsed::SlowDown;
        }
        if low == "expired_token" || low == "access_denied" {
            return DevicePollParsed::Fail(trunc_err(err));
        }
        let desc = body
            .get("error_description")
            .and_then(|d| d.as_str())
            .unwrap_or(err);
        return DevicePollParsed::Fail(trunc_err(desc));
    }
    let access = body
        .get("access_token")
        .or_else(|| body.get("accessToken"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if access.is_empty() {
        return DevicePollParsed::Fail("oauth_token_missing".into());
    }
    let refresh = body
        .get("refresh_token")
        .or_else(|| body.get("refreshToken"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let expires_in = body
        .get("expires_in")
        .or_else(|| body.get("expiresIn"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let account_id = body
        .get("account_id")
        .or_else(|| body.get("accountId"))
        .or_else(|| body.get("sub"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    DevicePollParsed::Ok {
        access_token: access,
        refresh_token: refresh,
        expires_in,
        account_id,
        email,
    }
}

pub fn oauth_start() -> Result<Value, String> {
    let url = format!("{AUTH_BASE}{DEVICE_CODE_PATH}");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("User-Agent", UA)
        .json(&json!({ "client_id": CLIENT_ID }))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    let (device_code, user_code, auth_url, interval, expires_in) =
        parse_device_code_response(&text)?;
    let pending_id = format!("zen_{}", now_ms());
    let ttl = expires_in
        .saturating_mul(1000)
        .min(OAUTH_LOGIN_TTL_MS)
        .max(60_000);
    let expires_at = now_ms().saturating_add(ttl);
    {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        g.clear();
        g.insert(
            pending_id.clone(),
            PendingDevice {
                device_code,
                user_code: user_code.clone(),
                auth_url: auth_url.clone(),
                interval_secs: interval,
                expires_at,
                last_poll_at: 0,
            },
        );
    }
    let _ = open_system_browser(&auth_url);
    Ok(json!({
        "pendingId": pending_id,
        "authUrl": auth_url,
        "userCode": user_code,
        "expiresAt": expires_at,
        "channelId": PROVIDER_ID,
    }))
}

pub fn oauth_cancel(pending_id: &str) -> Result<Value, String> {
    let id = pending_id.trim();
    let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
    if id.is_empty() {
        g.clear();
    } else {
        g.remove(id);
    }
    Ok(json!({ "ok": true }))
}

pub fn oauth_poll(pending_id: &str) -> Result<Value, String> {
    let id = pending_id.trim();
    if id.is_empty() {
        return Err("missing_pending_id".into());
    }
    let mut pending = {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        let Some(p) = g.get(id).cloned() else {
            return Ok(json!({ "status": "expired", "error": "no_pending" }));
        };
        if p.expires_at <= now_ms() {
            g.remove(id);
            return Ok(json!({ "status": "expired", "error": "login_timeout" }));
        }
        p
    };
    let min_gap = pending.interval_secs.saturating_mul(1000).max(1000);
    let now = now_ms();
    if pending.last_poll_at > 0 && now.saturating_sub(pending.last_poll_at) < min_gap {
        return Ok(json!({ "status": "pending" }));
    }
    pending.last_poll_at = now;
    {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(slot) = g.get_mut(id) {
            slot.last_poll_at = now;
        }
    }

    let url = format!("{AUTH_BASE}{DEVICE_TOKEN_PATH}");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("User-Agent", UA)
        .json(&json!({
            "grant_type": GRANT_TYPE,
            "device_code": pending.device_code,
            "client_id": CLIENT_ID,
        }))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    // Some servers return 400 with authorization_pending in body.
    if status.as_u16() >= 500 {
        return Ok(json!({
            "status": "fail",
            "error": trunc_err(&format!("HTTP {status}")),
        }));
    }
    match parse_device_token_response(&text) {
        DevicePollParsed::Pending => Ok(json!({ "status": "pending" })),
        DevicePollParsed::SlowDown => {
            let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
            if let Some(slot) = g.get_mut(id) {
                slot.interval_secs = slot.interval_secs.saturating_add(2);
            }
            Ok(json!({ "status": "pending" }))
        }
        DevicePollParsed::Fail(e) => {
            let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
            g.remove(id);
            Ok(json!({ "status": "fail", "error": e }))
        }
        DevicePollParsed::Ok {
            access_token,
            refresh_token,
            expires_in,
            account_id,
            email,
        } => {
            let creds = OauthCreds {
                access_token: access_token.clone(),
                refresh_token,
                access_expires_at: if expires_in > 0 {
                    now_ms().saturating_add(expires_in.saturating_mul(1000))
                } else {
                    0
                },
                account_id: account_id.clone(),
                email: email.clone(),
            };
            write_oauth(&creds)?;
            let snapshot = upsert_provider_with_token(&access_token)?;
            let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
            g.remove(id);
            Ok(json!({
                "status": "ok",
                "channelId": PROVIDER_ID,
                "accountId": account_id,
                "email": email,
                "snapshot": snapshot,
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_device_code_ok() {
        let raw = r#"{
            "device_code":"dc1",
            "user_code":"ABCD",
            "verification_uri_complete":"/console/device?user_code=ABCD",
            "interval":5,
            "expires_in":600
        }"#;
        let (dc, uc, url, interval, exp) = parse_device_code_response(raw).unwrap();
        assert_eq!(dc, "dc1");
        assert_eq!(uc, "ABCD");
        assert_eq!(url, "https://opencode.ai/console/device?user_code=ABCD");
        assert_eq!(interval, 5);
        assert_eq!(exp, 600);
    }

    #[test]
    fn resolve_collapses_double_console() {
        assert_eq!(
            resolve_device_auth_url("https://opencode.ai/console/console/device?user_code=X"),
            "https://opencode.ai/console/device?user_code=X"
        );
        assert_eq!(
            resolve_device_auth_url("/console/device?user_code=Y"),
            "https://opencode.ai/console/device?user_code=Y"
        );
    }

    #[test]
    fn parse_device_token_pending_and_ok() {
        assert_eq!(
            parse_device_token_response(r#"{"error":"authorization_pending"}"#),
            DevicePollParsed::Pending
        );
        match parse_device_token_response(
            r#"{"access_token":"tok","refresh_token":"ref","expires_in":3600,"email":"a@b.c"}"#,
        ) {
            DevicePollParsed::Ok {
                access_token,
                refresh_token,
                expires_in,
                email,
                ..
            } => {
                assert_eq!(access_token, "tok");
                assert_eq!(refresh_token, "ref");
                assert_eq!(expires_in, 3600);
                assert_eq!(email, "a@b.c");
            }
            other => panic!("expected ok, got {other:?}"),
        }
    }
}
