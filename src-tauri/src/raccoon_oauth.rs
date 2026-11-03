//! Raccoon (商汤小浣熊) WeChat QR login → model_provider upsert.
//!
//! Official site now uses IAM:
//!   POST /api/iam/v1/auth/mp/qrcode        → create (server issues qr-…)
//!   POST /api/iam/v1/auth/mp/qrcode/login  → poll
//! Client-minted 32-hex codes (old web auth poll) make WeChat show「二维码已经使用过期」.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::data_root::effective_data_root;
use crate::model_provider::{self, ModelProviderConfig};

const PROVIDER_ID: &str = "raccoon";
const PROVIDER_NAME: &str = "Raccoon（商汤）";
const API_BASE: &str = "https://xiaohuanxiong.com";
const IAM_PREFIX: &str = "/api/iam/v1";
const AUTH_PREFIX: &str = "/api/web/auth/v1";
const LLM_BASE: &str = "https://xiaohuanxiong.com/api/web/llm/v2";
const DEFAULT_MODEL: &str = "sn-sensenova-6-8-flash-lite";
/// Matches website bind/mp + login QR `appname`.
const APP_NAME: &str = "小浣熊官网";
const OAUTH_LOGIN_TTL_MS: u64 = 5 * 60 * 1000;
const HTTP_TIMEOUT_SECS: u64 = 20;
const CLIENT_PLATFORM: &str = "desktop-windows";
const CLIENT_VERSION: &str = "v1.0.35";

#[derive(Debug, Clone)]
struct PendingQr {
    qrcode_code: String,
    auth_url: String,
    expires_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RaccoonCreds {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    access_expires_at: u64,
    #[serde(default)]
    office_identity: String,
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
    effective_data_root()
        .join("freemodel-oauth")
        .join(format!("{PROVIDER_ID}.oauth.json"))
}

fn pending_mutex() -> &'static Mutex<HashMap<String, PendingQr>> {
    static M: OnceLock<Mutex<HashMap<String, PendingQr>>> = OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

fn write_oauth(creds: &RaccoonCreds) -> Result<(), String> {
    let path = oauth_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn read_oauth() -> Option<RaccoonCreds> {
    let raw = fs::read_to_string(oauth_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn iam_ok(body: &Value) -> bool {
    match body.get("code") {
        Some(Value::String(s)) => {
            let t = s.trim();
            t.eq_ignore_ascii_case("OK") || t == "0"
        }
        Some(Value::Number(n)) => n.as_i64() == Some(0),
        _ => false,
    }
}

fn iam_error_code(body: &Value) -> String {
    body.get("code")
        .and_then(|c| c.as_str())
        .or_else(|| body.get("error").and_then(|c| c.as_str()))
        .unwrap_or("")
        .to_string()
}

/// WeChat QR payload URL (desktop Chrome still 404s `/login/mp`; WeChat scanner handles it).
fn build_qr_url(scan_path: &str, code: &str) -> String {
    let path = {
        let p = scan_path.trim();
        if p.starts_with('/') && !p.starts_with("//") && !p.contains(['\\', ' ', '#']) {
            p
        } else {
            "/login/mp"
        }
    };
    format!(
        "{API_BASE}{path}?code={}&appname={}&source=platform",
        urlencoding_encode(code),
        urlencoding_encode(APP_NAME)
    )
}

fn http_json(
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<(u16, Value), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{API_BASE}{path}");
    let mut req = match method {
        "PUT" => client.put(&url),
        _ => client.post(&url),
    };
    req = req
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("Accept-Language", "zh-Hans");
    if let Some(b) = body {
        req = req.json(&b);
    } else {
        req = req.json(&json!({}));
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().map_err(|e| e.to_string())?;
    let val = serde_json::from_str(&text).unwrap_or(Value::Null);
    Ok((status, val))
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn decode_jwt_exp_ms(token: &str) -> Option<u64> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = parts[1];
    // base64url decode
    let mut b64 = payload.replace('-', "+").replace('_', "/");
    while b64.len() % 4 != 0 {
        b64.push('=');
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(&b64).ok()?;
    let v: Value = serde_json::from_slice(&bytes).ok()?;
    let exp = v.get("exp")?.as_u64()?;
    Some(exp.saturating_mul(1000))
}

fn upsert_provider_with_token(access: &str) -> Result<Value, String> {
    let cfg = ModelProviderConfig {
        id: PROVIDER_ID.into(),
        name: PROVIDER_NAME.into(),
        protocol: "openai_compatible".into(),
        base_url: LLM_BASE.into(),
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

pub fn oauth_start() -> Result<Value, String> {
    let (status, body) = http_json("POST", &format!("{IAM_PREFIX}/auth/mp/qrcode"), Some(json!({})))?;
    if status >= 500 {
        return Err(format!("raccoon_qr_create_http_{status}"));
    }
    if !iam_ok(&body) {
        return Err(trunc_err(
            body.get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("raccoon_qr_create_failed"),
        ));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let code = data
        .get("qrcode_code")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if code.is_empty() {
        return Err("raccoon_qr_code_missing".into());
    }
    let scan_path = data
        .get("scan_path")
        .and_then(|s| s.as_str())
        .unwrap_or("/login/mp");
    let auth_url = build_qr_url(scan_path, &code);
    let expires_in = data
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .unwrap_or(300)
        .clamp(30, 3600);
    let pending_id = format!("raccoon_{}", now_ms());
    let expires_at = now_ms()
        .saturating_add(expires_in.saturating_mul(1000))
        .min(now_ms().saturating_add(OAUTH_LOGIN_TTL_MS));
    {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        // Cancel any previous server QR best-effort.
        for old in g.values() {
            let _ = http_json(
                "PUT",
                &format!("{IAM_PREFIX}/auth/mp/qrcode"),
                Some(json!({
                    "qrcode_code": old.qrcode_code,
                    "status": "canceled"
                })),
            );
        }
        g.clear();
        g.insert(
            pending_id.clone(),
            PendingQr {
                qrcode_code: code.clone(),
                auth_url: auth_url.clone(),
                expires_at,
            },
        );
    }
    // Do NOT open auth_url in a browser — QR payload for 微信扫一扫 only.
    Ok(json!({
        "pendingId": pending_id,
        "authUrl": auth_url,
        "qrcodeCode": code,
        "expiresAt": expires_at,
        "channelId": PROVIDER_ID
    }))
}

pub fn oauth_cancel(pending_id: &str) -> Result<Value, String> {
    let id = pending_id.trim();
    let code = {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        if id.is_empty() {
            let codes: Vec<String> = g.values().map(|p| p.qrcode_code.clone()).collect();
            g.clear();
            codes
        } else if let Some(p) = g.remove(id) {
            vec![p.qrcode_code]
        } else {
            Vec::new()
        }
    };
    for c in code {
        let _ = http_json(
            "PUT",
            &format!("{IAM_PREFIX}/auth/mp/qrcode"),
            Some(json!({ "qrcode_code": c, "status": "canceled" })),
        );
    }
    Ok(json!({ "ok": true }))
}

pub fn oauth_poll(pending_id: &str) -> Result<Value, String> {
    let id = pending_id.trim();
    if id.is_empty() {
        return Err("missing_pending_id".into());
    }
    let pending = {
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

    let (status, body) = http_json(
        "POST",
        &format!("{IAM_PREFIX}/auth/mp/qrcode/login"),
        Some(json!({ "qrcode_code": pending.qrcode_code })),
    )?;
    if status >= 500 {
        return Ok(json!({ "status": "pending" }));
    }
    let err = iam_error_code(&body);
    if err == "AUTH_QRCODE_EXPIRED" {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        g.remove(id);
        return Ok(json!({ "status": "expired", "error": "AUTH_QRCODE_EXPIRED" }));
    }
    if !iam_ok(&body) {
        // Unknown soft failure — keep polling unless clearly terminal.
        return Ok(json!({ "status": "pending" }));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let st = data
        .get("status")
        .and_then(|s| s.as_str())
        .unwrap_or("");
    if st == "canceled" {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        g.remove(id);
        return Ok(json!({ "status": "fail", "error": "canceled" }));
    }
    if st == "logging" || st == "pending" || st.is_empty() {
        return Ok(json!({ "status": "pending" }));
    }
    if st != "success" {
        return Ok(json!({ "status": "pending" }));
    }
    let access = data
        .get("access_token")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let refresh = data
        .get("refresh_token")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    if access.is_empty() {
        return Ok(json!({ "status": "pending" }));
    }
    let exp = decode_jwt_exp_ms(&access).unwrap_or(0);
    let office = data
        .get("office_identity")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let creds = RaccoonCreds {
        access_token: access.clone(),
        refresh_token: refresh,
        access_expires_at: exp,
        office_identity: office,
    };
    write_oauth(&creds)?;
    // IAM access tokens need a one-shot web-auth confirm before LLM APIs
    // (otherwise chat returns HTTP 400 code 200901 iam_confirm_required).
    let _ = confirm_iam_session(&access);
    let snapshot = upsert_provider_with_token(&access)?;
    {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        g.remove(id);
    }
    Ok(json!({
        "status": "ok",
        "channelId": PROVIDER_ID,
        "snapshot": snapshot
    }))
}

/// Confirm IAM bearer for `/api/web/*` (LLM, user_info). Body `{}` is enough for personal accounts.
pub fn confirm_iam_session(access: &str) -> Result<(), String> {
    let access = access.trim();
    if access.is_empty() {
        return Err("empty_access_token".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("{API_BASE}{AUTH_PREFIX}/iam/confirm"))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .bearer_auth(access)
        .json(&json!({}))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().map_err(|e| e.to_string())?;
    let body: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if status == 200 && code == 0 {
        return Ok(());
    }
    Err(trunc_err(
        body.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("iam_confirm_failed"),
    ))
}

/// True when provider JSON looks like Raccoon IAM-confirm gate.
pub fn is_iam_confirm_required(status: u16, body: &Value) -> bool {
    if status != 400 {
        return false;
    }
    let code = body
        .get("code")
        .and_then(|c| c.as_i64())
        .unwrap_or(-1);
    if code == 200901 {
        return true;
    }
    body.get("message")
        .and_then(|m| m.as_str())
        .map(|m| m.eq_ignore_ascii_case("iam_confirm_required"))
        .unwrap_or(false)
}

/// Extra headers for model_provider chat when provider is raccoon.
pub fn chat_extra_headers() -> Vec<(String, String)> {
    let office = read_oauth()
        .map(|c| c.office_identity)
        .unwrap_or_default();
    vec![
        ("X-Client-Platform".into(), CLIENT_PLATFORM.into()),
        ("X-Client-Version".into(), CLIENT_VERSION.into()),
        ("X-Org-Code".into(), office),
        ("X-Raccoon-Language".into(), "zh".into()),
    ]
}

/// Best-effort silent refresh if token near expiry. Returns current access token.
pub fn ensure_fresh_access_token() -> Result<String, String> {
    let Some(mut creds) = read_oauth() else {
        return Err("no_raccoon_creds".into());
    };
    let near = creds.access_expires_at > 0
        && creds.access_expires_at.saturating_sub(now_ms()) < 5 * 60 * 1000;
    if !near || creds.refresh_token.trim().is_empty() {
        if creds.access_token.is_empty() {
            return Err("empty_access_token".into());
        }
        return Ok(creds.access_token);
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("{API_BASE}{AUTH_PREFIX}/refresh"))
        .header("Content-Type", "application/json")
        .json(&json!({ "refresh_token": creds.refresh_token }))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err("raccoon_relogin_required".into());
    }
    let body: Value = serde_json::from_str(&text).map_err(|e| trunc_err(&e.to_string()))?;
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        return Err(trunc_err(
            body.get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("refresh_failed"),
        ));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let access = data
        .get("access_token")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    if access.is_empty() {
        return Err("refresh_missing_access".into());
    }
    let next_refresh = data
        .get("refresh_token")
        .and_then(|s| s.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(creds.refresh_token.as_str())
        .to_string();
    creds.access_token = access.clone();
    creds.refresh_token = next_refresh;
    creds.access_expires_at = decode_jwt_exp_ms(&access).unwrap_or(0);
    write_oauth(&creds)?;
    let _ = model_provider::set_key(PROVIDER_ID, &access);
    // Fresh access tokens also need web-auth confirm.
    let _ = confirm_iam_session(&access);
    Ok(access)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qr_url_uses_server_code_and_source() {
        let c = "qr-01a1a099-45d5-76f0-93e1-0d189b67d3a8";
        let u = build_qr_url("/login/mp", c);
        assert!(u.contains(c));
        assert!(u.contains("xiaohuanxiong.com/login/mp"));
        assert!(u.contains("source=platform"));
        assert!(u.contains(&urlencoding_encode(APP_NAME)));
    }

    #[test]
    fn iam_ok_accepts_string_ok() {
        assert!(iam_ok(&json!({ "code": "OK" })));
        assert!(iam_ok(&json!({ "code": 0 })));
        assert!(!iam_ok(&json!({ "code": "AUTH_QRCODE_EXPIRED" })));
    }

    #[test]
    fn detects_iam_confirm_gate() {
        assert!(is_iam_confirm_required(
            400,
            &json!({ "code": 200901, "message": "iam_confirm_required" })
        ));
        assert!(!is_iam_confirm_required(401, &json!({ "code": 200901 })));
        assert!(!is_iam_confirm_required(400, &json!({ "code": 1 })));
    }
}
