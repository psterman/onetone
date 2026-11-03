//! Loomy (讯飞) SMS login → model_provider upsert.
//! Protocol aligned with dsh-our-free-model channel-pack loomy-*.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use hmac::{Hmac, Mac};
use md5::{Digest as _, Md5};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::Sha1;

use crate::data_root::effective_data_root;
use crate::model_provider::{self, ModelProviderConfig};

type HmacSha1 = Hmac<Sha1>;

const PROVIDER_ID: &str = "loomy";
const PROVIDER_NAME: &str = "Loomy（讯飞）";
const ACCOUNT_BASE: &str = "https://account.xfinfr.com";
const CHAT_BASE: &str = "https://loomyad.xunfei.cn/api/v1";
const DEFAULT_MODEL: &str = "spark-x";
const ACCESS_KEY_ID: &str = "2thryby66wxi53sk";
const ACCESS_KEY_SECRET: &str = "zsak6eadrbawz683wf5r3m2snrwj868r";
const APP_ID: &str = "GM3LOOMY";
const SMS_TTL_SECS: i64 = 300;
const SESSION_TTL_SECS: i64 = 1_209_600;
const HTTP_TIMEOUT_SECS: u64 = 20;
const OK_CODE: &str = "000000";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LoomyCreds {
    access_token: String,
    #[serde(default)]
    userid: String,
    #[serde(default)]
    phone: String,
    #[serde(default)]
    access_expires_at: u64,
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

fn write_oauth(creds: &LoomyCreds) -> Result<(), String> {
    let path = oauth_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn escape_rfc3986(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn build_escaped_path(raw_path: &str) -> String {
    let mut clean = if raw_path.starts_with('/') {
        raw_path.to_string()
    } else {
        format!("/{raw_path}")
    };
    if clean.len() > 1 && clean.ends_with('/') {
        clean.pop();
    }
    clean
        .split('/')
        .map(|seg| {
            if seg.is_empty() {
                String::new()
            } else {
                escape_rfc3986(seg)
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn content_md5_b64(body: &str) -> String {
    if body.is_empty() {
        return String::new();
    }
    let dig = Md5::digest(body.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(dig)
}

/// Build CAccount signing string (9 segments, trailing `\n\n`).
pub fn build_signing_string(
    method: &str,
    path: &str,
    body: &str,
    content_type: &str,
    date: &str,
    nonce: &str,
) -> String {
    let md5 = content_md5_b64(body);
    [
        method.to_ascii_uppercase(),
        build_escaped_path(path),
        String::new(),
        md5,
        content_type.to_string(),
        date.to_string(),
        nonce.to_string(),
        String::new(),
        String::new(),
    ]
    .join("\n")
}

fn auth_headers(path: &str, body: &str) -> Result<Vec<(String, String)>, String> {
    let date = httpdate_now();
    let nonce = format!("{:x}-{:x}", now_ms(), std::process::id());
    let content_type = "application/json";
    let string_to_sign = build_signing_string("POST", path, body, content_type, &date, &nonce);
    let mut mac = HmacSha1::new_from_slice(ACCESS_KEY_SECRET.as_bytes())
        .map_err(|e| e.to_string())?;
    mac.update(string_to_sign.as_bytes());
    let sig = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let mut headers = vec![
        (
            "Authorization".into(),
            format!("account {ACCESS_KEY_ID}:{sig}"),
        ),
        ("Date".into(), date),
        ("Nonce".into(), nonce),
        ("Content-Type".into(), content_type.into()),
        ("Accept".into(), "application/json".into()),
    ];
    let md5 = content_md5_b64(body);
    if !md5.is_empty() {
        headers.push(("Content-MD5".into(), md5));
    }
    Ok(headers)
}

fn httpdate_now() -> String {
    // RFC 1123 UTC without chrono: use system time via Windows-friendly format.
    // Prefer precise UTC via to_utc if available; fallback approximate is ok for nonce+date pair.
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Manual UTC formatting (good enough for CAccount Date header).
    const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    // days since 1970-01-01 (Thu)
    let days = (secs / 86_400) as usize;
    let tod = secs % 86_400;
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    let weekday = DAYS[days % 7];
    // civil from days — Howard Hinnant algorithm
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{weekday}, {d:02} {} {y} {hh:02}:{mm:02}:{ss:02} GMT",
        MONTHS[(m as usize).saturating_sub(1).min(11)]
    )
}

fn build_account_body(param: Value) -> Value {
    json!({
        "base": {
            "appid": APP_ID,
            "modelid": "Web",
            "version": "1.0.0",
            "devid": "web",
            "ua": "Loomy|Desktop|Electron|macOS",
            "traceid": format!("{:x}{:x}", now_ms(), std::process::id())
        },
        "param": param
    })
}

fn post_account(path: &str, param: Value) -> Result<Value, String> {
    let body_val = build_account_body(param);
    let body = serde_json::to_string(&body_val).map_err(|e| e.to_string())?;
    let headers = auth_headers(path, &body)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(format!("{ACCOUNT_BASE}{path}")).body(body.clone());
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let resp = req.send().map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    let parsed: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let code = parsed
        .get("code")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    if code != OK_CODE {
        let msg = parsed
            .get("desc")
            .and_then(|d| d.as_str())
            .or_else(|| parsed.get("message").and_then(|m| m.as_str()))
            .unwrap_or("loomy_account_error");
        return Err(trunc_err(msg));
    }
    Ok(parsed.get("data").cloned().unwrap_or(Value::Null))
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

fn normalize_phone(phone: &str) -> Result<String, String> {
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() != 11 || !digits.starts_with('1') {
        return Err("invalid_phone".into());
    }
    Ok(digits)
}

/// Send SMS verification code. Returns `{ ok, msgid }`.
pub fn sms_send(phone: &str) -> Result<Value, String> {
    let phone = normalize_phone(phone)?;
    let data = post_account(
        "/login/phone/sendMsgCode",
        json!({
            "ccode": "86",
            "phone": phone,
            "expire": SMS_TTL_SECS
        }),
    )?;
    let msgid = data
        .get("msgid")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    if msgid.is_empty() {
        return Err("missing_msgid".into());
    }
    Ok(json!({
        "ok": true,
        "msgid": msgid,
        "channelId": PROVIDER_ID,
        "phone": phone
    }))
}

/// Complete SMS login → upsert loomy provider.
pub fn sms_login(phone: &str, code: &str, msgid: &str) -> Result<Value, String> {
    let phone = normalize_phone(phone)?;
    let code = code.trim();
    let msgid = msgid.trim();
    if code.is_empty() || msgid.is_empty() {
        return Err("missing_code_or_msgid".into());
    }
    let data = post_account(
        "/login/phone/checkCode",
        json!({
            "ccode": "86",
            "phone": phone,
            "mcode": code,
            "msgid": msgid,
            "expire": SESSION_TTL_SECS
        }),
    )?;
    let session = data
        .get("session")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let userid = data
        .get("userid")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    if session.is_empty() {
        return Err("missing_session".into());
    }
    let creds = LoomyCreds {
        access_token: session.clone(),
        userid: userid.clone(),
        phone: phone.clone(),
        access_expires_at: now_ms().saturating_add((SESSION_TTL_SECS as u64).saturating_mul(1000)),
    };
    write_oauth(&creds)?;
    let snapshot = upsert_provider_with_token(&session)?;
    Ok(json!({
        "ok": true,
        "status": "ok",
        "channelId": PROVIDER_ID,
        "userid": userid,
        "phone": phone,
        "snapshot": snapshot
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signing_string_ends_with_double_newline() {
        let s = build_signing_string(
            "POST",
            "/login/phone/sendMsgCode",
            "{\"a\":1}",
            "application/json",
            "Wed, 01 Jan 2020 00:00:00 GMT",
            "nonce-1",
        );
        assert!(s.ends_with("\n\n"), "must end with two newlines: {s:?}");
        assert!(s.starts_with("POST\n/login/phone/sendMsgCode\n"));
    }

    #[test]
    fn phone_normalize_rejects_short() {
        assert!(normalize_phone("123").is_err());
        assert_eq!(normalize_phone("13800138000").unwrap(), "13800138000");
    }
}
