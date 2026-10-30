//! WorkBuddy / CodeBuddy local LLM: multi-account store + chat completions.
//! Auth: OAuth device-code (primary) or API key (secondary). Never desktop accessToken.
//! Quota display stays in shell_agent_usage.

use crate::data_root::effective_data_root;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const CHANNEL: &str = "workbuddy";
const AUTH_KIND_API_KEY: &str = "api_key";
const AUTH_KIND_OAUTH: &str = "oauth";
const REGION_CN: &str = "cn";
// ponytail: upstream CLI plugin-auth; may break
const BASE_CN: &str = "https://copilot.tencent.com";
const CONFIG_PATH: &str = "/v3/config";
const CHAT_PATH: &str = "/v2/chat/completions";
const OAUTH_STATE_PATH: &str = "/v2/plugin/auth/state?platform=CLI";
const OAUTH_TOKEN_PATH: &str = "/v2/plugin/auth/token";
const OAUTH_REFRESH_PATH: &str = "/v2/plugin/auth/token/refresh";
const OAUTH_PENDING_CODE: i64 = 11217;
const OAUTH_LOGIN_TTL_MS: u64 = 5 * 60 * 1000;
const OAUTH_REFRESH_SKEW_MS: u64 = 5 * 60 * 1000;
const MODELS_CACHE_MS: u64 = 10 * 60 * 1000;
const HTTP_TIMEOUT_SECS: u64 = 20;
const CHAT_TIMEOUT_SECS: u64 = 180;
/// ATR tool turns — keep short so home UI isn't stuck on「正在调用」for minutes.
const AGENT_CHAT_TIMEOUT_SECS: u64 = 45;
const UA: &str = "CLI/unknown CodeBuddy/2.136.0 OneTone";

fn default_auth_kind() -> String {
    AUTH_KIND_API_KEY.into()
}
fn default_region() -> String {
    REGION_CN.into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyAccountMeta {
    pub id: String,
    pub channel: String,
    pub label: String,
    pub enabled: bool,
    pub is_default: bool,
    #[serde(default = "default_auth_kind")]
    pub auth_kind: String,
    #[serde(default = "default_region")]
    pub region: String,
    #[serde(default)]
    pub uid: String,
    #[serde(default)]
    pub nickname: String,
    pub key_fingerprint: String,
    pub masked_key: String,
    pub verify_status: String,
    pub last_error: String,
    #[serde(default)]
    pub models: Vec<WorkbuddyModelInfo>,
    #[serde(default)]
    pub models_fetched_at: u64,
    #[serde(default)]
    pub selected_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbuddyModelInfo {
    pub id: String,
    pub name: String,
    pub max_input_tokens: Option<u64>,
    pub max_output_tokens: Option<u64>,
    pub supports_images: bool,
    pub supports_reasoning: bool,
    pub only_reasoning: bool,
    pub default_reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoreFile {
    accounts: Vec<WorkbuddyAccountMeta>,
}

struct StoreState {
    file: StoreFile,
}

#[derive(Debug, Clone)]
struct PendingOauth {
    state: String,
    auth_url: String,
    region: String,
    expires_at: u64,
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
    uid: String,
    #[serde(default)]
    nickname: String,
    #[serde(default)]
    enterprise_id: String,
    #[serde(default)]
    domain: String,
}

#[derive(Debug, Clone)]
enum AuthMaterial {
    ApiKey(String),
    Oauth(OauthCreds),
}

fn store_mutex() -> &'static Mutex<StoreState> {
    static M: std::sync::OnceLock<Mutex<StoreState>> = std::sync::OnceLock::new();
    M.get_or_init(|| Mutex::new(StoreState { file: load_file() }))
}

fn pending_mutex() -> &'static Mutex<HashMap<String, PendingOauth>> {
    static M: std::sync::OnceLock<Mutex<HashMap<String, PendingOauth>>> =
        std::sync::OnceLock::new();
    M.get_or_init(|| Mutex::new(HashMap::new()))
}

// ponytail: process-wide refresh lock; upgrade to per-account if multi-slot refresh contends
fn refresh_mutex() -> &'static Mutex<()> {
    static M: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    M.get_or_init(|| Mutex::new(()))
}

fn base_url(region: &str) -> &'static str {
    let _ = region; // P0: cn only; global stub later
    BASE_CN
}

fn trunc_err(s: &str) -> String {
    s.chars().take(120).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store_path() -> PathBuf {
    effective_data_root().join("workbuddy-local-accounts.json")
}

fn keys_dir() -> PathBuf {
    effective_data_root().join("workbuddy-local-keys")
}

fn key_path(id: &str) -> PathBuf {
    keys_dir().join(format!("{id}.key"))
}

fn oauth_path(id: &str) -> PathBuf {
    keys_dir().join(format!("{id}.oauth.json"))
}

fn is_plausible_key(key: &str) -> bool {
    let k = key.trim();
    k.len() >= 12 && !k.contains(' ') && !k.eq_ignore_ascii_case("sk-xxx")
}

fn fingerprint(key: &str) -> String {
    let dig = Sha256::digest(key.trim().as_bytes());
    dig.iter().take(6).map(|b| format!("{b:02x}")).collect()
}

fn masked_key(key: &str) -> String {
    let k = key.trim();
    if k.len() <= 8 {
        return "••••".into();
    }
    format!("{}…{}", &k[..4], &k[k.len() - 4..])
}

fn load_file() -> StoreFile {
    let path = store_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return StoreFile::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_file(file: &StoreFile) -> Result<(), String> {
    let path = store_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn read_key(id: &str) -> Option<String> {
    let raw = fs::read_to_string(key_path(id)).ok()?;
    let k = raw.lines().next()?.trim().to_string();
    if is_plausible_key(&k) {
        Some(k)
    } else {
        None
    }
}

fn write_key(id: &str, key: &str) -> Result<(), String> {
    let dir = keys_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let k = key.trim();
    if k.is_empty() {
        let _ = fs::remove_file(key_path(id));
        return Ok(());
    }
    if !is_plausible_key(k) {
        return Err("invalid_workbuddy_key".into());
    }
    fs::write(key_path(id), format!("{k}\n")).map_err(|e| e.to_string())
}

fn read_oauth(id: &str) -> Option<OauthCreds> {
    let raw = fs::read_to_string(oauth_path(id)).ok()?;
    serde_json::from_str(&raw).ok().filter(|c: &OauthCreds| !c.access_token.trim().is_empty())
}

fn write_oauth(id: &str, creds: &OauthCreds) -> Result<(), String> {
    let dir = keys_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    fs::write(oauth_path(id), raw).map_err(|e| e.to_string())
}

fn new_id() -> String {
    format!("wb_{}", now_ms())
}

/// Windows argv for opening a URL without cmd.exe.
/// `cmd /C start` treats `&` as a statement separator and truncates OAuth query strings
/// (e.g. `?platform=CLI&state=…` → only `?platform=CLI`), which CodeBuddy rejects as
/// "登录链接不完整".
fn browser_open_program_args(url: &str) -> Option<(&'static str, Vec<String>)> {
    let url = url.trim();
    if url.is_empty() || !(url.starts_with("https://") || url.starts_with("http://")) {
        return None;
    }
    Some((
        "rundll32.exe",
        vec!["url.dll,FileProtocolHandler".into(), url.to_string()],
    ))
}

fn open_system_browser(url: &str) -> Result<(), String> {
    let Some((program, args)) = browser_open_program_args(url) else {
        return Err("invalid_auth_url".into());
    };
    #[cfg(windows)]
    {
        std::process::Command::new(program)
            .args(&args)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (program, args);
        Err("open url is only supported on Windows".into())
    }
}

fn ensure_one_default(accounts: &mut [WorkbuddyAccountMeta]) {
    if accounts.is_empty() {
        return;
    }
    let enabled: Vec<usize> = accounts
        .iter()
        .enumerate()
        .filter(|(_, a)| a.enabled)
        .map(|(i, _)| i)
        .collect();
    if enabled.is_empty() {
        for a in accounts.iter_mut() {
            a.is_default = false;
        }
        return;
    }
    if !accounts.iter().any(|a| a.enabled && a.is_default) {
        for a in accounts.iter_mut() {
            a.is_default = false;
        }
        accounts[enabled[0]].is_default = true;
    } else {
        let mut seen = false;
        for a in accounts.iter_mut() {
            if a.enabled && a.is_default {
                if seen {
                    a.is_default = false;
                } else {
                    seen = true;
                }
            } else {
                a.is_default = false;
            }
        }
    }
}

pub fn list_accounts() -> Vec<WorkbuddyAccountMeta> {
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    g.file.accounts.clone()
}

pub fn add_account(label: &str, key: &str) -> Result<WorkbuddyAccountMeta, String> {
    let key = key.trim();
    if !is_plausible_key(key) {
        return Err("invalid_workbuddy_key".into());
    }
    let id = new_id();
    write_key(&id, key)?;
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let make_default = !g.file.accounts.iter().any(|a| a.enabled && a.is_default);
    let mut meta = WorkbuddyAccountMeta {
        id: id.clone(),
        channel: CHANNEL.into(),
        label: {
            let l = label.trim();
            if l.is_empty() {
                format!("WorkBuddy {}", g.file.accounts.len() + 1)
            } else {
                l.to_string()
            }
        },
        enabled: true,
        is_default: make_default,
        auth_kind: AUTH_KIND_API_KEY.into(),
        region: REGION_CN.into(),
        uid: String::new(),
        nickname: String::new(),
        key_fingerprint: fingerprint(key),
        masked_key: masked_key(key),
        verify_status: "pending".into(),
        last_error: String::new(),
        models: Vec::new(),
        models_fetched_at: 0,
        selected_model: String::new(),
    };
    match discover_models_with_auth(&AuthMaterial::ApiKey(key.to_string()), REGION_CN) {
        Ok(models) => {
            if let Some(first) = models.first() {
                meta.selected_model = first.id.clone();
            }
            meta.models = models;
            meta.models_fetched_at = now_ms();
            meta.verify_status = "ok".into();
        }
        Err(e) => {
            meta.verify_status = "fail".into();
            meta.last_error = trunc_err(&e);
        }
    }
    g.file.accounts.push(meta.clone());
    ensure_one_default(&mut g.file.accounts);
    save_file(&g.file)?;
    Ok(meta)
}

pub fn remove_account(id: &str) -> Result<(), String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("missing_id".into());
    }
    let _ = fs::remove_file(key_path(id));
    let _ = fs::remove_file(oauth_path(id));
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let before = g.file.accounts.len();
    g.file.accounts.retain(|a| a.id != id);
    if g.file.accounts.len() == before {
        return Err("not_found".into());
    }
    ensure_one_default(&mut g.file.accounts);
    save_file(&g.file)
}

pub fn set_default(id: &str) -> Result<(), String> {
    let id = id.trim();
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) else {
        return Err("not_found".into());
    };
    if !acc.enabled {
        return Err("account_disabled".into());
    }
    for a in g.file.accounts.iter_mut() {
        a.is_default = a.id == id;
    }
    save_file(&g.file)
}

pub fn set_enabled(id: &str, enabled: bool) -> Result<(), String> {
    let id = id.trim();
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) else {
        return Err("not_found".into());
    };
    acc.enabled = enabled;
    if !enabled {
        acc.is_default = false;
    }
    ensure_one_default(&mut g.file.accounts);
    save_file(&g.file)
}

pub fn set_selected_model(id: &str, model: &str) -> Result<(), String> {
    let id = id.trim();
    let model = model.trim();
    if model.is_empty() {
        return Err("missing_model".into());
    }
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) else {
        return Err("not_found".into());
    };
    if !acc.models.is_empty() && !acc.models.iter().any(|m| m.id == model) {
        return Err("model_not_in_catalog".into());
    }
    acc.selected_model = model.to_string();
    save_file(&g.file)
}

pub fn default_account() -> Option<WorkbuddyAccountMeta> {
    list_accounts()
        .into_iter()
        .find(|a| a.enabled && a.is_default)
        .or_else(|| list_accounts().into_iter().find(|a| a.enabled))
}

fn apply_auth_headers(
    req: reqwest::blocking::RequestBuilder,
    auth: &AuthMaterial,
) -> reqwest::blocking::RequestBuilder {
    match auth {
        AuthMaterial::ApiKey(key) => req
            .header("Authorization", format!("Bearer {}", key.trim()))
            .header("X-API-Key", key.trim()),
        AuthMaterial::Oauth(c) => {
            let mut r = req.header(
                "Authorization",
                format!("Bearer {}", c.access_token.trim()),
            );
            if c.uid.trim().is_empty() {
                r = r.header("X-No-User-Id", "1");
            } else {
                r = r.header("X-User-Id", c.uid.trim());
            }
            if c.enterprise_id.trim().is_empty() {
                r = r.header("X-No-Enterprise-Id", "1");
            } else {
                r = r.header("X-Enterprise-Id", c.enterprise_id.trim());
            }
            if !c.refresh_token.trim().is_empty() {
                r = r.header("X-Refresh-Token", c.refresh_token.trim());
            }
            if c.domain.trim().is_empty() {
                r = r.header("X-No-Department-Info", "1");
            } else {
                r = r.header("X-Domain", c.domain.trim());
            }
            r
        }
    }
}

fn http_get_config(auth: &AuthMaterial, region: &str) -> Result<String, String> {
    let url = format!("{}{}", base_url(region), CONFIG_PATH);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let req = client
        .get(&url)
        .header("Accept", "application/json")
        .header("X-Product", "SaaS")
        .header("User-Agent", UA);
    let resp = apply_auth_headers(req, auth)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("key_unauthorized".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    Ok(text)
}

/// Parse /v3/config → CLI-allowed models (order preserved).
pub fn parse_config_models(raw: &str) -> Result<Vec<WorkbuddyModelInfo>, String> {
    let body: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = body
            .get("msg")
            .and_then(|m| m.as_str())
            .unwrap_or("config_error");
        return Err(msg.chars().take(120).collect());
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let agents = data
        .pointer("/agents")
        .and_then(|a| a.as_array())
        .or_else(|| data.pointer("/agent/agents").and_then(|a| a.as_array()));
    let allowed: Vec<String> = agents
        .and_then(|arr| {
            arr.iter().find_map(|a| {
                if a.get("name").and_then(|n| n.as_str()) == Some("cli") {
                    a.get("models")
                        .and_then(|m| m.as_array())
                        .map(|ids| {
                            ids.iter()
                                .filter_map(|v| v.as_str().map(str::to_owned))
                                .collect::<Vec<_>>()
                        })
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();
    if allowed.is_empty() {
        return Err("no_cli_models".into());
    }
    let by_id: std::collections::HashMap<String, &Value> = data
        .get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    m.get("id")
                        .and_then(|i| i.as_str())
                        .map(|id| (id.to_string(), m))
                })
                .collect()
        })
        .unwrap_or_default();

    let mut out = Vec::new();
    for id in allowed {
        let Some(m) = by_id.get(&id) else {
            continue;
        };
        let max_in = m
            .get("maxInputTokens")
            .or_else(|| m.get("maxAllowedSize"))
            .and_then(|v| v.as_u64());
        let max_out = m.get("maxOutputTokens").and_then(|v| v.as_u64());
        if max_in.is_none() || max_out.is_none() {
            continue;
        }
        let reasoning = m.get("reasoning").cloned().unwrap_or(Value::Null);
        out.push(WorkbuddyModelInfo {
            id: id.clone(),
            name: m
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or(&id)
                .to_string(),
            max_input_tokens: max_in,
            max_output_tokens: max_out,
            supports_images: m
                .get("supportsImages")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            supports_reasoning: m
                .get("supportsReasoning")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            only_reasoning: m
                .get("onlyReasoning")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            default_reasoning_effort: reasoning
                .get("effort")
                .and_then(|e| e.as_str())
                .map(str::to_owned),
        });
    }
    if out.is_empty() {
        return Err("no_usable_models".into());
    }
    Ok(out)
}

fn discover_models_with_auth(
    auth: &AuthMaterial,
    region: &str,
) -> Result<Vec<WorkbuddyModelInfo>, String> {
    let raw = http_get_config(auth, region)?;
    parse_config_models(&raw)
}

fn mark_account_auth_fail(id: &str, err: &str) {
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    if let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) {
        acc.verify_status = "fail".into();
        acc.last_error = trunc_err(err);
        let _ = save_file(&g.file);
    }
}

fn load_auth_material(meta: &WorkbuddyAccountMeta) -> Result<AuthMaterial, String> {
    if meta.auth_kind == AUTH_KIND_OAUTH {
        let creds = read_oauth(&meta.id).ok_or_else(|| "oauth_missing".to_string())?;
        Ok(AuthMaterial::Oauth(creds))
    } else {
        let key = read_key(&meta.id).ok_or_else(|| "key_missing".to_string())?;
        Ok(AuthMaterial::ApiKey(key))
    }
}

fn access_token_still_fresh(creds: &OauthCreds, now: u64) -> bool {
    if creds.access_token.trim().is_empty() {
        return false;
    }
    // expires unknown (0): treat as usable until a 401 forces refresh
    if creds.access_expires_at == 0 {
        return true;
    }
    creds.access_expires_at > now.saturating_add(OAUTH_REFRESH_SKEW_MS)
}

/// Ensure OAuth access token is fresh (lazy refresh, single-flight).
fn ensure_fresh_access_token(id: &str) -> Result<OauthCreds, String> {
    let id = id.trim();
    let mut creds = read_oauth(id).ok_or_else(|| "oauth_missing".to_string())?;
    if access_token_still_fresh(&creds, now_ms()) {
        return Ok(creds);
    }
    if creds.refresh_token.trim().is_empty() {
        mark_account_auth_fail(id, "authExpired");
        return Err("authExpired".into());
    }
    let _guard = refresh_mutex().lock().unwrap_or_else(|e| e.into_inner());
    creds = read_oauth(id).ok_or_else(|| "oauth_missing".to_string())?;
    if access_token_still_fresh(&creds, now_ms()) {
        return Ok(creds);
    }
    match refresh_oauth_token(&creds, REGION_CN) {
        Ok(next) => {
            write_oauth(id, &next)?;
            Ok(next)
        }
        Err(e) => {
            mark_account_auth_fail(id, "authExpired");
            Err(e)
        }
    }
}

fn refresh_oauth_token(creds: &OauthCreds, region: &str) -> Result<OauthCreds, String> {
    let url = format!("{}{}", base_url(region), OAUTH_REFRESH_PATH);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Accept", "application/json")
        .header("X-Product", "SaaS")
        .header("X-Refresh-Token", creds.refresh_token.trim())
        .header("User-Agent", UA)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("authExpired".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    parse_oauth_refresh_response(&text, creds)
}

pub fn refresh_models(id: &str) -> Result<WorkbuddyAccountMeta, String> {
    let id = id.trim();
    let meta = list_accounts()
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| "not_found".to_string())?;
    let auth = if meta.auth_kind == AUTH_KIND_OAUTH {
        let creds = ensure_fresh_access_token(id)?;
        AuthMaterial::Oauth(creds)
    } else {
        load_auth_material(&meta)?
    };
    let models = match discover_models_with_auth(&auth, &meta.region) {
        Ok(m) => m,
        Err(e) => {
            mark_account_auth_fail(id, &e);
            return Err(e);
        }
    };
    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) else {
        return Err("not_found".into());
    };
    if acc.selected_model.is_empty()
        || !models.iter().any(|m| m.id == acc.selected_model)
    {
        acc.selected_model = models
            .first()
            .map(|m| m.id.clone())
            .unwrap_or_default();
    }
    acc.models = models;
    acc.models_fetched_at = now_ms();
    acc.verify_status = "ok".into();
    acc.last_error.clear();
    let out = acc.clone();
    save_file(&g.file)?;
    Ok(out)
}

pub fn verify_account(id: &str) -> Result<WorkbuddyAccountMeta, String> {
    refresh_models(id)
}

fn resolve_chat_account(
    account_id: Option<&str>,
) -> Result<(WorkbuddyAccountMeta, AuthMaterial), String> {
    let accounts = list_accounts();
    let meta = if let Some(id) = account_id.map(str::trim).filter(|s| !s.is_empty()) {
        accounts
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| "not_found".to_string())?
    } else {
        default_account().ok_or_else(|| "no_default_account".to_string())?
    };
    if !meta.enabled {
        return Err("account_disabled".into());
    }
    let auth = if meta.auth_kind == AUTH_KIND_OAUTH {
        AuthMaterial::Oauth(ensure_fresh_access_token(&meta.id)?)
    } else {
        load_auth_material(&meta)?
    };
    Ok((meta, auth))
}

// No "://" — Tauri treats ":" as plugin-event namespace and drops custom emits.
pub const EVENT_DELTA: &str = "wb_local_chat_delta";
pub const EVENT_DONE: &str = "wb_local_chat_done";
pub const EVENT_SEED: &str = "wb_local_chat_seed";
pub const WINDOW_LABEL: &str = "workbuddy_local_chat";

struct ActiveStream {
    run_id: String,
    cancel: Arc<AtomicBool>,
    /// Shared live text for frontend poll (event delivery is unreliable).
    content: Arc<Mutex<String>>,
    done: Arc<AtomicBool>,
    error: Arc<Mutex<Option<String>>>,
    model: String,
    account_id: String,
}

static ACTIVE_STREAM: Mutex<Option<ActiveStream>> = Mutex::new(None);

fn cancel_active_stream() {
    if let Ok(mut g) = ACTIVE_STREAM.lock() {
        if let Some(active) = g.take() {
            active.cancel.store(true, Ordering::SeqCst);
        }
    }
}

fn set_stream_content(content: &Arc<Mutex<String>>, text: &str) {
    if let Ok(mut g) = content.lock() {
        *g = text.to_string();
    }
}

fn finish_stream_state(
    content: &Arc<Mutex<String>>,
    done: &Arc<AtomicBool>,
    error: &Arc<Mutex<Option<String>>>,
    final_text: &str,
    err: Option<String>,
) {
    set_stream_content(content, final_text);
    if let Ok(mut g) = error.lock() {
        *g = err;
    }
    done.store(true, Ordering::SeqCst);
}

struct PreparedChat {
    meta: WorkbuddyAccountMeta,
    auth: AuthMaterial,
    model_id: String,
    body: Value,
    chat_url: String,
}

fn prepare_chat(
    account_id: Option<&str>,
    model: Option<&str>,
    messages: &[Value],
    max_tokens: Option<u32>,
) -> Result<PreparedChat, String> {
    if messages.is_empty() {
        return Err("empty_messages".into());
    }
    let (mut meta, auth) = resolve_chat_account(account_id)?;
    if meta.models.is_empty()
        || now_ms().saturating_sub(meta.models_fetched_at) > MODELS_CACHE_MS
    {
        let _ = refresh_models(&meta.id);
        meta = list_accounts()
            .into_iter()
            .find(|a| a.id == meta.id)
            .ok_or_else(|| "not_found".to_string())?;
    }
    let model_id = model
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| meta.selected_model.clone());
    if model_id.is_empty() {
        return Err("no_model".into());
    }
    if !meta.models.is_empty() && !meta.models.iter().any(|m| m.id == model_id) {
        return Err("model_not_in_catalog".into());
    }
    let model_meta = meta.models.iter().find(|m| m.id == model_id);
    let cap = model_meta
        .and_then(|m| m.max_output_tokens)
        .unwrap_or(4096)
        .min(u64::from(u32::MAX)) as u32;
    // Match desktop clients: use full model output cap unless caller asks lower.
    let max_tok = max_tokens.unwrap_or(cap).min(cap).max(16);

    let mut body = json!({
        "model": model_id,
        "messages": messages,
        "stream": true,
        "max_tokens": max_tok,
    });
    if let Some(m) = model_meta {
        if m.supports_reasoning {
            if let Some(effort) = m.default_reasoning_effort.as_deref() {
                body.as_object_mut()
                    .unwrap()
                    .insert("reasoning_effort".into(), json!(effort));
            }
        }
    }

    let chat_url = format!("{}{}", base_url(&meta.region), CHAT_PATH);
    Ok(PreparedChat {
        meta,
        auth,
        model_id,
        body,
        chat_url,
    })
}

fn visible_assistant_text(content: &str, reasoning: &str) -> String {
    if !content.trim().is_empty() {
        content.to_string()
    } else {
        reasoning.to_string()
    }
}

fn emit_chat(app: &AppHandle, event: &str, payload: Value) {
    // App-wide (any listener).
    let _ = app.emit(event, &payload);
    // Explicit main window — home in-app page must receive deltas while streaming.
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(event, &payload);
        // Proven to_js bus (chrome.webview message) as a second path.
        let mut envelope = payload.clone();
        if let Some(obj) = envelope.as_object_mut() {
            let kind = if event == EVENT_DELTA {
                "wb_local_chat_delta"
            } else if event == EVENT_DONE {
                "wb_local_chat_done"
            } else {
                "wb_local_chat_seed"
            };
            obj.insert("type".into(), json!(kind));
        }
        let _ = main.emit("to_js", &envelope);
    }
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.emit(event, &payload);
    }
}

/// Upstream rejects non-stream chat (code 11101). Request SSE, aggregate into one reply.
pub fn chat_once(
    account_id: Option<&str>,
    model: Option<&str>,
    messages: &[Value],
    max_tokens: Option<u32>,
) -> Result<Value, String> {
    let prepared = prepare_chat(account_id, model, messages, max_tokens)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(CHAT_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let req = client
        .post(&prepared.chat_url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("X-Product", "SaaS")
        .header("User-Agent", UA)
        .json(&prepared.body);
    let resp = apply_auth_headers(req, &prepared.auth)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 || status.as_u16() == 403 {
        if prepared.meta.auth_kind == AUTH_KIND_OAUTH {
            mark_account_auth_fail(&prepared.meta.id, "authExpired");
            return Err("authExpired".into());
        }
        return Err("key_unauthorized".into());
    }
    if status.as_u16() == 429 {
        return Err("rate_limited".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    let (content, usage) = aggregate_chat_sse_or_json(&text)?;
    if content.trim().is_empty() {
        // HTTP ok but no extractable assistant text (reasoning-only / unknown shape).
        return Err("empty_model_content".into());
    }
    Ok(json!({
        "ok": true,
        "accountId": prepared.meta.id,
        "model": prepared.model_id,
        "content": content,
        "usage": usage,
    }))
}

/// ATR chat: default WorkBuddy account has a selected model.
pub fn atr_ready() -> bool {
    default_account()
        .map(|a| a.enabled && !a.selected_model.trim().is_empty())
        .unwrap_or(false)
}

pub fn atr_selected_model() -> Option<String> {
    default_account().and_then(|a| {
        let m = a.selected_model.trim();
        if m.is_empty() {
            None
        } else {
            Some(m.to_string())
        }
    })
}

/// ATR edit listing: requires a prior native tool-calling probe pass for this account+model.
pub fn atr_edit_ready() -> bool {
    atr_ready() && atr_edit_probe_status() == "pass"
}

/// `unknown` | `pass` | `fail` — never hits the network.
pub fn atr_edit_probe_status() -> &'static str {
    let Some(acct) = default_account() else {
        return "unknown";
    };
    if !acct.enabled || acct.selected_model.trim().is_empty() {
        return "unknown";
    }
    let key = probe_cache_key(&acct.id, &acct.selected_model);
    match load_probe_cache() {
        Some(c) if c.key == key => {
            if c.ok {
                "pass"
            } else {
                "fail"
            }
        }
        _ => "unknown",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToolProbeCache {
    key: String,
    ok: bool,
    at_ms: u64,
}

fn probe_cache_path() -> PathBuf {
    effective_data_root().join("workbuddy-atr-tool-probe.json")
}

fn probe_cache_key(account_id: &str, model: &str) -> String {
    format!("{}\0{}", account_id.trim(), model.trim())
}

fn load_probe_cache() -> Option<ToolProbeCache> {
    let raw = fs::read_to_string(probe_cache_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_probe_cache(c: &ToolProbeCache) {
    let _ = fs::write(
        probe_cache_path(),
        serde_json::to_string_pretty(c).unwrap_or_else(|_| "{}".into()),
    );
}

/// Live probe: tools + tool_choice=required must yield a native `finish` tool_call (not prose).
pub fn probe_native_tool_calling(force: bool) -> Result<bool, String> {
    let acct = default_account().ok_or_else(|| "workbuddy_unconfigured".to_string())?;
    if !acct.enabled || acct.selected_model.trim().is_empty() {
        return Err("workbuddy_unconfigured".into());
    }
    let key = probe_cache_key(&acct.id, &acct.selected_model);
    if !force {
        if let Some(c) = load_probe_cache() {
            if c.key == key {
                return Ok(c.ok);
            }
        }
    }

    let tools = json!([{
        "type": "function",
        "function": {
            "name": "finish",
            "description": "Mark the probe complete.",
            "parameters": {
                "type": "object",
                "properties": { "summary": { "type": "string" } },
                "required": ["summary"]
            }
        }
    }]);
    let messages = vec![
        json!({
            "role": "system",
            "content": "Call the finish tool with summary=\"ok\". Do not write any other text."
        }),
        json!({ "role": "user", "content": "probe" }),
    ];
    let mut prepared = prepare_chat(None, None, &messages, Some(64))?;
    if let Some(obj) = prepared.body.as_object_mut() {
        obj.remove("reasoning_effort");
        obj.insert("tools".into(), tools);
        obj.insert("tool_choice".into(), json!("required"));
        obj.insert("temperature".into(), json!(0.0));
    }
    let text = post_agent_chat(&prepared)?;
    let ok = response_has_native_tool_call(&text, "finish");
    save_probe_cache(&ToolProbeCache {
        key,
        ok,
        at_ms: now_ms(),
    });
    Ok(ok)
}

/// Native OpenAI-style tool_calls only — content JSON does not count (edit reliability).
pub fn response_has_native_tool_call(text: &str, want_name: &str) -> bool {
    let trimmed = text.trim_start();
    if !(trimmed.starts_with("data:") || text.contains("\ndata:")) {
        if let Ok(v) = serde_json::from_str::<Value>(text) {
            let root = v.get("data").cloned().unwrap_or(v);
            return tool_calls_include_name(
                root.pointer("/choices/0/message/tool_calls")
                    .and_then(|c| c.as_array()),
                want_name,
            );
        }
        return false;
    }
    let mut tool_calls: Vec<Value> = Vec::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            let data = rest.trim();
            if data.is_empty() || data == "[DONE]" {
                if data == "[DONE]" {
                    break;
                }
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(data) {
                ingest_tool_calls_from_value(&mut tool_calls, &v);
            }
        }
    }
    tool_calls_include_name(Some(&tool_calls), want_name)
}

fn tool_calls_include_name(calls: Option<&Vec<Value>>, want_name: &str) -> bool {
    let Some(arr) = calls else {
        return false;
    };
    arr.iter().any(|c| {
        c.pointer("/function/name")
            .and_then(|n| n.as_str())
            .or_else(|| c.get("name").and_then(|n| n.as_str()))
            == Some(want_name)
    })
}

/// Agent Task Runtime turn: stream chat with `tools`, return ATR tool-call JSON.
/// `tool_choice`: OpenAI-style (`"required"`, `"auto"`, or forced function object).
pub fn agent_tool_turn(
    messages: &[Value],
    tools: &Value,
    max_tokens: Option<u32>,
    tool_choice: &Value,
) -> Result<String, String> {
    let mut prepared = prepare_chat(None, None, messages, max_tokens)?;
    if let Some(obj) = prepared.body.as_object_mut() {
        obj.remove("reasoning_effort");
        obj.insert("tools".into(), tools.clone());
        obj.insert("tool_choice".into(), tool_choice.clone());
        obj.insert("temperature".into(), json!(0.1));
    }
    let text = post_agent_chat(&prepared)?;
    aggregate_agent_tool_response(&text)
}

/// Content-protocol turn (no tools) — for models that ignore native function calling.
/// Expects a single ATR tool JSON object in assistant content.
pub fn agent_json_turn(messages: &[Value], max_tokens: Option<u32>) -> Result<String, String> {
    let mut prepared = prepare_chat(None, None, messages, max_tokens)?;
    if let Some(obj) = prepared.body.as_object_mut() {
        obj.remove("reasoning_effort");
        obj.remove("tools");
        obj.remove("tool_choice");
        obj.insert("temperature".into(), json!(0.0));
    }
    let text = post_agent_chat(&prepared)?;
    aggregate_agent_tool_response(&text)
}

fn post_agent_chat(prepared: &PreparedChat) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(AGENT_CHAT_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let req = client
        .post(&prepared.chat_url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("X-Product", "SaaS")
        .header("User-Agent", UA)
        .json(&prepared.body);
    let resp = apply_auth_headers(req, &prepared.auth)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 401 || status.as_u16() == 403 {
        if prepared.meta.auth_kind == AUTH_KIND_OAUTH {
            mark_account_auth_fail(&prepared.meta.id, "authExpired");
            return Err("authExpired".into());
        }
        return Err("no_key".into());
    }
    if status.as_u16() == 429 {
        return Err("rate_limited".into());
    }
    if !status.is_success() {
        return Err(format!("http_status_{}", status.as_u16()));
    }
    Ok(text)
}

fn merge_tool_call_delta(acc: &mut Vec<Value>, delta_calls: &[Value]) {
    for d in delta_calls {
        let idx = d.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
        while acc.len() <= idx {
            acc.push(json!({
                "id": "",
                "type": "function",
                "function": { "name": "", "arguments": "" }
            }));
        }
        let slot = &mut acc[idx];
        if let Some(id) = d.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            slot.as_object_mut()
                .unwrap()
                .insert("id".into(), json!(id));
        }
        if let Some(ty) = d.get("type").and_then(|v| v.as_str()) {
            slot.as_object_mut()
                .unwrap()
                .insert("type".into(), json!(ty));
        }
        if let Some(f) = d.get("function").and_then(|v| v.as_object()) {
            let dest = slot
                .get_mut("function")
                .and_then(|v| v.as_object_mut())
                .unwrap();
            if let Some(name) = f.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                dest.insert("name".into(), json!(name));
            }
            if let Some(args) = f.get("arguments").and_then(|v| v.as_str()) {
                let prev = dest
                    .get("arguments")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                dest.insert("arguments".into(), json!(format!("{prev}{args}")));
            }
        }
    }
}

fn ingest_tool_calls_from_value(acc: &mut Vec<Value>, root: &Value) {
    if let Some(arr) = root
        .pointer("/choices/0/delta/tool_calls")
        .or_else(|| root.pointer("/choices/0/message/tool_calls"))
        .and_then(|c| c.as_array())
    {
        merge_tool_call_delta(acc, arr);
    }
    if let Some(inner) = root.get("data") {
        ingest_tool_calls_from_value(acc, inner);
    }
}

fn strip_content_fence(content: &str) -> String {
    let trimmed = content.trim();
    let trimmed = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    trimmed.strip_suffix("```").unwrap_or(trimmed).trim().to_string()
}

fn aggregate_agent_tool_response(text: &str) -> Result<String, String> {
    // Non-SSE JSON body (rare): reuse OpenAI message shape.
    let trimmed = text.trim_start();
    if !(trimmed.starts_with("data:") || text.contains("\ndata:")) {
        if let Ok(v) = serde_json::from_str::<Value>(text) {
            let root = v.get("data").cloned().unwrap_or(v);
            if let Some(calls) = root
                .pointer("/choices/0/message/tool_calls")
                .and_then(|c| c.as_array())
            {
                if !calls.is_empty() {
                    return Ok(json!({ "tool_calls": calls }).to_string());
                }
            }
            let mut content = String::new();
            let mut reasoning = String::new();
            ingest_choice_payload(&mut content, &mut reasoning, &root);
            let body = if content.trim().is_empty() {
                reasoning
            } else {
                content
            };
            let stripped = strip_content_fence(&body);
            return content_as_tool_json(&stripped);
        }
    }

    let mut content = String::new();
    let mut reasoning = String::new();
    let mut usage = Value::Null;
    let mut tool_calls: Vec<Value> = Vec::new();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            let data = rest.trim();
            if data.is_empty() {
                continue;
            }
            if data == "[DONE]" {
                break;
            }
            if let Ok(v) = serde_json::from_str::<Value>(data) {
                ingest_tool_calls_from_value(&mut tool_calls, &v);
            }
        }
        if ingest_chat_sse_line(&mut content, &mut reasoning, &mut usage, line) {
            break;
        }
    }
    let tool_calls: Vec<Value> = tool_calls
        .into_iter()
        .filter(|c| {
            c.pointer("/function/name")
                .and_then(|n| n.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        })
        .collect();
    if !tool_calls.is_empty() {
        return Ok(json!({ "tool_calls": tool_calls }).to_string());
    }
    if content.trim().is_empty() && !reasoning.trim().is_empty() {
        content = reasoning;
    }
    let stripped = strip_content_fence(&content);
    content_as_tool_json(&stripped)
}

/// Reject chatty prose. Full ATR parse happens in the driver; here only gate obvious monologue.
/// (Do not call into agent_task_runtime — that would cycle: ATR workbuddy → this module.)
fn content_as_tool_json(stripped: &str) -> Result<String, String> {
    if stripped.is_empty() {
        return Err("no_tool_calls".into());
    }
    let t = stripped.trim();
    if let Ok(v) = serde_json::from_str::<Value>(t) {
        if v.get("tool").is_some()
            || v.get("tool_calls").is_some()
            || v.get("name").is_some()
        {
            return Ok(stripped.to_string());
        }
        return Err("no_tool_calls".into());
    }
    // Embedded JSON in prose — let ATR salvage; still require a tool marker.
    if t.contains("\"tool\"") || t.contains("\"tool_calls\"") {
        return Ok(stripped.to_string());
    }
    Err("no_tool_calls".into())
}

/// Open (or focus) the OneTone local-chat webview and optionally seed turns.
pub fn open_chat_window(app: &AppHandle, seed: Option<Value>) -> Result<Value, String> {
    let (win, created) = crate::overlay_window::ensure_overlay_window(
        app,
        crate::overlay_window::WORKBUDDY_LOCAL_CHAT,
    )
    .map_err(|e| e.to_string())?;
    if created {
        let _ = win.set_background_color(Some(tauri::webview::Color(248, 250, 252, 255)));
    }
    let _ = win.show();
    let _ = win.set_focus();
    let _ = win.set_always_on_top(true);
    if let Some(payload) = seed {
        let app2 = app.clone();
        let delay_ms = if created { 180 } else { 40 };
        let _ = std::thread::Builder::new()
            .name("wb-chat-seed".into())
            .spawn(move || {
                std::thread::sleep(Duration::from_millis(delay_ms));
                emit_chat(&app2, EVENT_SEED, payload);
            });
    }
    Ok(json!({
        "ok": true,
        "created": created,
        "label": WINDOW_LABEL,
    }))
}

/// Start streaming chat in a background thread. Single active run (new start cancels old).
pub fn chat_stream_start(
    app: &AppHandle,
    account_id: Option<&str>,
    model: Option<&str>,
    messages: &[Value],
    max_tokens: Option<u32>,
) -> Result<Value, String> {
    let mut prepared = prepare_chat(account_id, model, messages, max_tokens)?;
    // Interactive chat: skip reasoning_effort — first token is much faster.
    if let Some(obj) = prepared.body.as_object_mut() {
        obj.remove("reasoning_effort");
    }
    cancel_active_stream();
    let run_id = format!("wb_{}", now_ms());
    let cancel = Arc::new(AtomicBool::new(false));
    let content_arc = Arc::new(Mutex::new(String::new()));
    let done_flag = Arc::new(AtomicBool::new(false));
    let error_arc = Arc::new(Mutex::new(None));
    {
        let mut g = ACTIVE_STREAM.lock().unwrap_or_else(|e| e.into_inner());
        *g = Some(ActiveStream {
            run_id: run_id.clone(),
            cancel: cancel.clone(),
            content: content_arc.clone(),
            done: done_flag.clone(),
            error: error_arc.clone(),
            model: prepared.model_id.clone(),
            account_id: prepared.meta.id.clone(),
        });
    }

    let app2 = app.clone();
    let account_id = prepared.meta.id.clone();
    let auth_kind = prepared.meta.auth_kind.clone();
    let model_id = prepared.model_id.clone();
    let chat_url = prepared.chat_url.clone();
    let body = prepared.body.clone();
    let auth = prepared.auth.clone();
    let run_id_thread = run_id.clone();

    let _ = std::thread::Builder::new()
        .name("wb-chat-stream".into())
        .spawn(move || {
            let done = |final_text: String, error: Option<String>, usage: Value| {
                finish_stream_state(
                    &content_arc,
                    &done_flag,
                    &error_arc,
                    &final_text,
                    error.clone(),
                );
                emit_chat(
                    &app2,
                    EVENT_DONE,
                    json!({
                        "runId": run_id_thread,
                        "content": final_text,
                        "model": model_id,
                        "accountId": account_id,
                        "usage": usage,
                        "error": error,
                        "ok": error.is_none(),
                        "done": true,
                    }),
                );
            };

            if cancel.load(Ordering::SeqCst) {
                done(String::new(), Some("cancelled".into()), Value::Null);
                return;
            }

            let client = match reqwest::blocking::Client::builder()
                .connect_timeout(Duration::from_secs(20))
                .timeout(Duration::from_secs(CHAT_TIMEOUT_SECS))
                .pool_max_idle_per_host(0)
                .build()
            {
                Ok(c) => c,
                Err(e) => {
                    done(String::new(), Some(e.to_string()), Value::Null);
                    return;
                }
            };
            let req = client
                .post(&chat_url)
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("Accept-Encoding", "identity")
                .header("X-Product", "SaaS")
                .header("User-Agent", UA)
                .json(&body);
            let resp = match apply_auth_headers(req, &auth).send() {
                Ok(r) => r,
                Err(e) => {
                    done(String::new(), Some(e.to_string()), Value::Null);
                    return;
                }
            };
            let status = resp.status();
            if status.as_u16() == 401 || status.as_u16() == 403 {
                let err = if auth_kind == AUTH_KIND_OAUTH {
                    mark_account_auth_fail(&account_id, "authExpired");
                    "authExpired".to_string()
                } else {
                    "key_unauthorized".to_string()
                };
                done(String::new(), Some(err), Value::Null);
                return;
            }
            if status.as_u16() == 429 {
                done(String::new(), Some("rate_limited".into()), Value::Null);
                return;
            }
            if !status.is_success() {
                let text = resp.text().unwrap_or_default();
                done(
                    String::new(),
                    Some(format!("HTTP {status}: {}", trunc_err(&text))),
                    Value::Null,
                );
                return;
            }

            let mut content = String::new();
            let mut reasoning = String::new();
            let mut usage = Value::Null;
            let mut emitted = String::new();
            let reader = BufReader::with_capacity(8 * 1024, resp);
            for line_res in reader.lines() {
                if cancel.load(Ordering::SeqCst) {
                    done(
                        visible_assistant_text(&content, &reasoning),
                        Some("cancelled".into()),
                        usage,
                    );
                    return;
                }
                let Ok(line) = line_res else {
                    continue;
                };
                let done_stream =
                    ingest_chat_sse_line(&mut content, &mut reasoning, &mut usage, &line);
                let visible = visible_assistant_text(&content, &reasoning);
                if visible != emitted {
                    let delta = if visible.starts_with(&emitted) {
                        visible[emitted.len()..].to_string()
                    } else {
                        visible.clone()
                    };
                    emitted = visible.clone();
                    set_stream_content(&content_arc, &emitted);
                    if !delta.is_empty() {
                        emit_chat(
                            &app2,
                            EVENT_DELTA,
                            json!({
                                "runId": run_id_thread,
                                "delta": delta,
                                "contentSoFar": emitted,
                            }),
                        );
                    }
                }
                if done_stream {
                    break;
                }
            }

            let final_text = visible_assistant_text(&content, &reasoning);
            if final_text.trim().is_empty() {
                done(String::new(), Some("empty_model_content".into()), usage);
            } else {
                done(final_text, None, usage);
            }
        });

    Ok(json!({
        "ok": true,
        "runId": run_id,
        "model": prepared.model_id,
        "accountId": prepared.meta.id,
    }))
}

/// Poll live stream state (preferred over events for the in-app page).
pub fn chat_stream_poll(run_id: Option<&str>) -> Result<Value, String> {
    let g = ACTIVE_STREAM.lock().unwrap_or_else(|e| e.into_inner());
    let Some(active) = g.as_ref() else {
        return Ok(json!({
            "ok": true,
            "active": false,
            "done": true,
            "contentSoFar": "",
            "content": "",
            "error": Value::Null,
        }));
    };
    if let Some(id) = run_id.map(str::trim).filter(|s| !s.is_empty()) {
        if active.run_id != id {
            return Ok(json!({
                "ok": true,
                "active": false,
                "done": true,
                "runId": active.run_id,
                "contentSoFar": "",
                "content": "",
                "error": "run_mismatch",
            }));
        }
    }
    let content = active
        .content
        .lock()
        .map(|c| c.clone())
        .unwrap_or_default();
    let err = active
        .error
        .lock()
        .ok()
        .and_then(|e| e.clone())
        .unwrap_or_default();
    let done = active.done.load(Ordering::SeqCst);
    Ok(json!({
        "ok": true,
        "active": true,
        "done": done,
        "runId": active.run_id,
        "model": active.model,
        "accountId": active.account_id,
        "contentSoFar": content,
        "content": content,
        "error": if err.is_empty() { Value::Null } else { json!(err) },
    }))
}

pub fn chat_stream_cancel(run_id: Option<&str>) -> Result<Value, String> {
    let mut g = ACTIVE_STREAM.lock().unwrap_or_else(|e| e.into_inner());
    let Some(active) = g.as_ref() else {
        return Ok(json!({ "ok": true, "cancelled": false }));
    };
    if let Some(id) = run_id.map(str::trim).filter(|s| !s.is_empty()) {
        if active.run_id != id {
            return Ok(json!({ "ok": true, "cancelled": false, "reason": "run_mismatch" }));
        }
    }
    active.cancel.store(true, Ordering::SeqCst);
    Ok(json!({ "ok": true, "cancelled": true, "runId": active.run_id }))
}

/// Pull plain text from OpenAI-ish content: string, or array of {text|content} parts.
fn append_content_value(out: &mut String, v: &Value) {
    match v {
        Value::String(s) => out.push_str(s),
        Value::Array(items) => {
            for item in items {
                if let Some(s) = item.as_str() {
                    out.push_str(s);
                    continue;
                }
                if let Some(s) = item.get("text").and_then(|t| t.as_str()) {
                    out.push_str(s);
                    continue;
                }
                if let Some(s) = item.get("content").and_then(|t| t.as_str()) {
                    out.push_str(s);
                }
            }
        }
        _ => {}
    }
}

fn append_pointer_text(out: &mut String, root: &Value, pointer: &str) {
    if let Some(v) = root.pointer(pointer) {
        append_content_value(out, v);
    }
}

fn ingest_choice_payload(content: &mut String, reasoning: &mut String, root: &Value) {
    // Prefer assistant-visible content; keep reasoning as fallback for onlyReasoning models.
    let before = content.len();
    append_pointer_text(content, root, "/choices/0/delta/content");
    append_pointer_text(content, root, "/choices/0/delta/text");
    append_pointer_text(content, root, "/choices/0/delta/answer");
    if content.len() == before {
        append_pointer_text(content, root, "/choices/0/message/content");
        append_pointer_text(content, root, "/choices/0/text");
    }
    append_pointer_text(reasoning, root, "/choices/0/delta/reasoning_content");
    append_pointer_text(reasoning, root, "/choices/0/delta/reasoning");
    append_pointer_text(reasoning, root, "/choices/0/delta/thinking");
    append_pointer_text(reasoning, root, "/choices/0/message/reasoning_content");
}

/// Returns true when `[DONE]` ends the stream.
fn ingest_chat_sse_line(
    content: &mut String,
    reasoning: &mut String,
    usage: &mut Value,
    line: &str,
) -> bool {
    let Some(rest) = line.strip_prefix("data:") else {
        return false;
    };
    let data = rest.trim();
    if data.is_empty() {
        return false;
    }
    if data == "[DONE]" {
        return true;
    }
    let Ok(v) = serde_json::from_str::<Value>(data) else {
        return false;
    };
    if let Some(u) = v
        .get("usage")
        .or_else(|| v.pointer("/data/usage"))
        .filter(|u| !u.is_null())
    {
        *usage = u.clone();
    }
    let before = content.len() + reasoning.len();
    ingest_choice_payload(content, reasoning, &v);
    // Tencent-style envelope: { code, data: { choices: [...] } }
    if content.len() + reasoning.len() == before {
        if let Some(inner) = v.get("data") {
            ingest_choice_payload(content, reasoning, inner);
        }
    }
    false
}

fn aggregate_chat_sse_or_json(text: &str) -> Result<(String, Value), String> {
    let trimmed = text.trim_start();
    if trimmed.starts_with("data:") || text.contains("\ndata:") {
        let mut content = String::new();
        let mut reasoning = String::new();
        let mut usage = Value::Null;
        for line in text.lines() {
            if ingest_chat_sse_line(&mut content, &mut reasoning, &mut usage, line) {
                break;
            }
        }
        if content.trim().is_empty() && !reasoning.trim().is_empty() {
            content = reasoning;
        }
        return Ok((content, usage));
    }
    let parsed: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let root = parsed.get("data").cloned().unwrap_or_else(|| parsed.clone());
    let mut content = String::new();
    let mut reasoning = String::new();
    ingest_choice_payload(&mut content, &mut reasoning, &root);
    if content.trim().is_empty() {
        append_pointer_text(&mut content, &root, "/output_text");
        if let Some(s) = root.get("content").and_then(|c| c.as_str()) {
            content.push_str(s);
        }
    }
    if content.trim().is_empty() && !reasoning.trim().is_empty() {
        content = reasoning;
    }
    Ok((
        content,
        root.get("usage")
            .cloned()
            .or_else(|| parsed.get("usage").cloned())
            .unwrap_or(Value::Null),
    ))
}

/// Snapshot for Agent page / Soft Pad (no secrets).
pub fn snapshot_for_ui() -> Value {
    let accounts = list_accounts();
    let default_id = accounts
        .iter()
        .find(|a| a.enabled && a.is_default)
        .map(|a| a.id.clone())
        .unwrap_or_default();
    json!({
        "channel": CHANNEL,
        "accounts": accounts,
        "defaultAccountId": default_id,
        "configured": accounts.iter().any(|a| a.enabled),
        "oauthPending": pending_snapshot(),
    })
}

fn pending_snapshot() -> Value {
    let g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
    let now = now_ms();
    let Some((id, p)) = g.iter().next() else {
        return Value::Null;
    };
    if p.expires_at <= now {
        return Value::Null;
    }
    json!({
        "pendingId": id,
        "authUrl": p.auth_url,
        "region": p.region,
        "expiresAt": p.expires_at,
    })
}

/// Parse POST /v2/plugin/auth/state response.
pub fn parse_oauth_state_response(raw: &str) -> Result<(String, String), String> {
    let body: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = body
            .get("msg")
            .and_then(|m| m.as_str())
            .unwrap_or("oauth_state_error");
        return Err(trunc_err(msg));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let state = data
        .get("state")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let auth_url = data
        .get("authUrl")
        .or_else(|| data.get("auth_url"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if state.is_empty() || auth_url.is_empty() {
        return Err("oauth_state_incomplete".into());
    }
    Ok((state, auth_url))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OauthPollParsed {
    Pending,
    Ok(OauthTokenPayload),
    Fail(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OauthTokenPayload {
    pub access_token: String,
    pub refresh_token: String,
    pub access_expires_at: u64,
    pub uid: String,
    pub nickname: String,
    pub enterprise_id: String,
    pub domain: String,
}

fn json_str(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            let t = s.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    String::new()
}

fn expires_at_from_data(data: &Value, now: u64) -> u64 {
    if let Some(ms) = data
        .get("expiresAt")
        .or_else(|| data.get("expireAt"))
        .and_then(|v| v.as_u64())
    {
        if ms > 10_000_000_000 {
            return ms; // already ms
        }
        return ms.saturating_mul(1000);
    }
    if let Some(secs) = data
        .get("expiresIn")
        .or_else(|| data.get("expireIn"))
        .and_then(|v| v.as_u64())
    {
        return now.saturating_add(secs.saturating_mul(1000));
    }
    0
}

fn token_payload_from_data(data: &Value, now: u64) -> Result<OauthTokenPayload, String> {
    let user = data.get("user").cloned().unwrap_or(Value::Null);
    let access = json_str(data, &["accessToken", "access_token", "token"]);
    if access.is_empty() {
        return Err("oauth_token_missing".into());
    }
    Ok(OauthTokenPayload {
        access_token: access,
        refresh_token: json_str(data, &["refreshToken", "refresh_token"]),
        access_expires_at: expires_at_from_data(data, now),
        uid: {
            let u = json_str(data, &["uid", "userId", "user_id"]);
            if u.is_empty() {
                json_str(&user, &["uid", "userId", "id"])
            } else {
                u
            }
        },
        nickname: {
            let n = json_str(data, &["nickname", "nickName", "name"]);
            if n.is_empty() {
                json_str(&user, &["nickname", "nickName", "name"])
            } else {
                n
            }
        },
        enterprise_id: json_str(data, &["enterpriseId", "enterprise_id"]),
        domain: json_str(data, &["domain"]),
    })
}

/// Parse GET /v2/plugin/auth/token poll response.
pub fn parse_oauth_token_poll_response(raw: &str, now_ms_val: u64) -> OauthPollParsed {
    let body: Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(e) => return OauthPollParsed::Fail(trunc_err(&e.to_string())),
    };
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code == OAUTH_PENDING_CODE {
        return OauthPollParsed::Pending;
    }
    if code != 0 {
        let msg = body
            .get("msg")
            .and_then(|m| m.as_str())
            .unwrap_or("oauth_token_error");
        return OauthPollParsed::Fail(trunc_err(msg));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    match token_payload_from_data(&data, now_ms_val) {
        Ok(p) => OauthPollParsed::Ok(p),
        Err(e) => OauthPollParsed::Fail(e),
    }
}

fn parse_oauth_refresh_response(raw: &str, prev: &OauthCreds) -> Result<OauthCreds, String> {
    let body: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = body
            .get("msg")
            .and_then(|m| m.as_str())
            .unwrap_or("oauth_refresh_error");
        return Err(trunc_err(msg));
    }
    let data = body.get("data").cloned().unwrap_or(Value::Null);
    let payload = token_payload_from_data(&data, now_ms())?;
    Ok(OauthCreds {
        access_token: payload.access_token,
        refresh_token: if payload.refresh_token.is_empty() {
            prev.refresh_token.clone()
        } else {
            payload.refresh_token
        },
        access_expires_at: payload.access_expires_at,
        uid: if payload.uid.is_empty() {
            prev.uid.clone()
        } else {
            payload.uid
        },
        nickname: if payload.nickname.is_empty() {
            prev.nickname.clone()
        } else {
            payload.nickname
        },
        enterprise_id: if payload.enterprise_id.is_empty() {
            prev.enterprise_id.clone()
        } else {
            payload.enterprise_id
        },
        domain: if payload.domain.is_empty() {
            prev.domain.clone()
        } else {
            payload.domain
        },
    })
}

pub fn oauth_start(region: Option<&str>) -> Result<Value, String> {
    let region = match region.map(str::trim).unwrap_or(REGION_CN) {
        "global" => return Err("oauth_region_global_todo".into()),
        _ => REGION_CN,
    };
    let url = format!("{}{}", base_url(region), OAUTH_STATE_PATH);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("X-Product", "SaaS")
        .header("User-Agent", UA)
        .json(&json!({}))
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {}", trunc_err(&text)));
    }
    let (state, auth_url) = parse_oauth_state_response(&text)?;
    let pending_id = format!("pending_{}", now_ms());
    let expires_at = now_ms().saturating_add(OAUTH_LOGIN_TTL_MS);
    {
        let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
        g.clear(); // one pending at a time
        g.insert(
            pending_id.clone(),
            PendingOauth {
                state,
                auth_url: auth_url.clone(),
                region: region.into(),
                expires_at,
            },
        );
    }
    let _ = open_system_browser(&auth_url);
    Ok(json!({
        "pendingId": pending_id,
        "authUrl": auth_url,
        "region": region,
        "expiresAt": expires_at,
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
    let url = format!(
        "{}{}?state={}",
        base_url(&pending.region),
        OAUTH_TOKEN_PATH,
        urlencoding_encode(&pending.state)
    );
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .header("X-Product", "SaaS")
        .header("User-Agent", UA)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() >= 500 {
        return Ok(json!({
            "status": "fail",
            "error": trunc_err(&format!("HTTP {status}")),
        }));
    }
    match parse_oauth_token_poll_response(&text, now_ms()) {
        OauthPollParsed::Pending => Ok(json!({ "status": "pending" })),
        OauthPollParsed::Fail(e) => {
            let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
            g.remove(id);
            Ok(json!({ "status": "fail", "error": e }))
        }
        OauthPollParsed::Ok(payload) => {
            let meta = upsert_oauth_account(&pending.region, &payload)?;
            let mut g = pending_mutex().lock().unwrap_or_else(|e| e.into_inner());
            g.remove(id);
            Ok(json!({
                "status": "ok",
                "account": meta,
                "snapshot": snapshot_for_ui(),
            }))
        }
    }
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
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

fn upsert_oauth_account(
    region: &str,
    payload: &OauthTokenPayload,
) -> Result<WorkbuddyAccountMeta, String> {
    let creds = OauthCreds {
        access_token: payload.access_token.clone(),
        refresh_token: payload.refresh_token.clone(),
        access_expires_at: payload.access_expires_at,
        uid: payload.uid.clone(),
        nickname: payload.nickname.clone(),
        enterprise_id: payload.enterprise_id.clone(),
        domain: payload.domain.clone(),
    };
    let fp = fingerprint(&creds.access_token);
    let label = if !payload.nickname.trim().is_empty() {
        payload.nickname.trim().to_string()
    } else if !payload.uid.trim().is_empty() {
        format!("WorkBuddy {}", &payload.uid.chars().take(8).collect::<String>())
    } else {
        "WorkBuddy OAuth".into()
    };
    let masked = if !payload.uid.trim().is_empty() {
        let u = payload.uid.trim();
        if u.len() <= 8 {
            format!("uid:{u}")
        } else {
            format!("uid:{}…{}", &u[..4], &u[u.len() - 4..])
        }
    } else {
        format!("oauth:{fp}")
    };

    let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
    g.file = load_file();
    let existing = g
        .file
        .accounts
        .iter()
        .position(|a| a.auth_kind == AUTH_KIND_OAUTH && !payload.uid.is_empty() && a.uid == payload.uid);

    let id = if let Some(idx) = existing {
        g.file.accounts[idx].id.clone()
    } else {
        new_id()
    };
    write_oauth(&id, &creds)?;

    let make_default = !g.file.accounts.iter().any(|a| a.enabled && a.is_default);
    let mut meta = if let Some(idx) = existing {
        let mut m = g.file.accounts[idx].clone();
        m.label = label;
        m.nickname = payload.nickname.clone();
        m.uid = payload.uid.clone();
        m.region = region.into();
        m.key_fingerprint = fp;
        m.masked_key = masked;
        m.enabled = true;
        m.verify_status = "pending".into();
        m.last_error.clear();
        m
    } else {
        WorkbuddyAccountMeta {
            id: id.clone(),
            channel: CHANNEL.into(),
            label,
            enabled: true,
            is_default: make_default,
            auth_kind: AUTH_KIND_OAUTH.into(),
            region: region.into(),
            uid: payload.uid.clone(),
            nickname: payload.nickname.clone(),
            key_fingerprint: fp,
            masked_key: masked,
            verify_status: "pending".into(),
            last_error: String::new(),
            models: Vec::new(),
            models_fetched_at: 0,
            selected_model: String::new(),
        }
    };

    // drop lock before network
    if let Some(idx) = existing {
        g.file.accounts[idx] = meta.clone();
    } else {
        g.file.accounts.push(meta.clone());
    }
    ensure_one_default(&mut g.file.accounts);
    save_file(&g.file)?;
    drop(g);

    match discover_models_with_auth(&AuthMaterial::Oauth(creds), region) {
        Ok(models) => {
            let mut g = store_mutex().lock().unwrap_or_else(|e| e.into_inner());
            g.file = load_file();
            if let Some(acc) = g.file.accounts.iter_mut().find(|a| a.id == id) {
                if acc.selected_model.is_empty()
                    || !models.iter().any(|m| m.id == acc.selected_model)
                {
                    acc.selected_model =
                        models.first().map(|m| m.id.clone()).unwrap_or_default();
                }
                acc.models = models;
                acc.models_fetched_at = now_ms();
                acc.verify_status = "ok".into();
                acc.last_error.clear();
                meta = acc.clone();
                let _ = save_file(&g.file);
            }
        }
        Err(e) => {
            mark_account_auth_fail(&id, &e);
            meta.verify_status = "fail".into();
            meta.last_error = trunc_err(&e);
        }
    }
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_cli_models_filters_and_orders() {
        let raw = r#"{
          "code": 0,
          "msg": "OK",
          "data": {
            "agents": [{ "name": "cli", "models": ["deepseek-v4-flash", "missing", "glm-5.3"] }],
            "models": [
              { "id": "glm-5.3", "name": "GLM", "maxInputTokens": 100, "maxOutputTokens": 50 },
              { "id": "deepseek-v4-flash", "name": "DS", "maxInputTokens": 200, "maxOutputTokens": 80, "supportsReasoning": true, "reasoning": { "effort": "high" } },
              { "id": "other", "name": "X", "maxInputTokens": 10, "maxOutputTokens": 5 }
            ]
          }
        }"#;
        let models = parse_config_models(raw).expect("parse");
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "deepseek-v4-flash");
        assert_eq!(models[1].id, "glm-5.3");
        assert!(models[0].supports_reasoning);
        assert_eq!(
            models[0].default_reasoning_effort.as_deref(),
            Some("high")
        );
    }

    #[test]
    fn parse_rejects_nonzero_code() {
        let err = parse_config_models(r#"{"code":1,"msg":"nope"}"#).unwrap_err();
        assert!(err.contains("nope"), "{err}");
    }

    #[test]
    fn fingerprint_stable() {
        assert_eq!(fingerprint("sk-abcdefghijklmnopqrstuvwxyz"), fingerprint("sk-abcdefghijklmnopqrstuvwxyz"));
        assert_ne!(fingerprint("sk-abcdefghijklmnopqrstuvwxyz"), fingerprint("sk-zzzzzzzzzzzzzzzzzzzzzzzz"));
    }

    #[test]
    fn native_tool_call_probe_accepts_sse_finish() {
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"type\":\"function\",\"function\":{\"name\":\"finish\",\"arguments\":\"\"}}]}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"summary\\\":\\\"ok\\\"}\"}}]}}]}\n",
            "data: [DONE]\n"
        );
        assert!(response_has_native_tool_call(sse, "finish"));
        assert!(!response_has_native_tool_call(sse, "inspect_workspace"));
    }

    #[test]
    fn native_tool_call_probe_rejects_prose_only() {
        let sse = "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\ndata: [DONE]\n";
        assert!(!response_has_native_tool_call(sse, "finish"));
        let body = r#"{"choices":[{"message":{"content":"{\"tool\":\"finish\",\"arguments\":{\"summary\":\"ok\"}}"}}]}"#;
        assert!(
            !response_has_native_tool_call(body, "finish"),
            "content JSON must not unlock edit"
        );
    }

    #[test]
    fn parse_oauth_state_ok() {
        let (state, url) = parse_oauth_state_response(
            r#"{"code":0,"data":{"state":"abc","authUrl":"https://example.com/login?s=1"}}"#,
        )
        .expect("state");
        assert_eq!(state, "abc");
        assert!(url.starts_with("https://"));
    }

    #[test]
    fn browser_open_keeps_ampersand_query_intact() {
        let full = "https://www.codebuddy.cn/login/?platform=CLI&state=abc123&x=1";
        let (prog, args) = browser_open_program_args(full).expect("argv");
        assert_eq!(prog, "rundll32.exe");
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "url.dll,FileProtocolHandler");
        assert_eq!(args[1], full);
        assert!(args[1].contains("&state="));
        assert!(browser_open_program_args("ftp://nope").is_none());
        assert!(browser_open_program_args("").is_none());
    }

    #[test]
    fn parse_oauth_poll_pending_and_ok() {
        assert_eq!(
            parse_oauth_token_poll_response(r#"{"code":11217,"msg":"pending"}"#, 1_000),
            OauthPollParsed::Pending
        );
        match parse_oauth_token_poll_response(
            r#"{"code":0,"data":{"accessToken":"tok","refreshToken":"ref","expiresIn":3600,"uid":"u1","nickname":"N"}}"#,
            1_000_000,
        ) {
            OauthPollParsed::Ok(p) => {
                assert_eq!(p.access_token, "tok");
                assert_eq!(p.refresh_token, "ref");
                assert_eq!(p.uid, "u1");
                assert_eq!(p.nickname, "N");
                assert_eq!(p.access_expires_at, 1_000_000 + 3600 * 1000);
            }
            other => panic!("expected ok, got {other:?}"),
        }
    }

    #[test]
    fn access_fresh_skew() {
        let skew = OAUTH_REFRESH_SKEW_MS;
        let expires = skew + 10_000;
        let c = OauthCreds {
            access_token: "t".into(),
            access_expires_at: expires,
            ..Default::default()
        };
        // now within skew window → not fresh
        assert!(!access_token_still_fresh(&c, expires - skew + 1));
        // now far before skew → fresh
        assert!(access_token_still_fresh(&c, expires - skew - 1));
        assert!(access_token_still_fresh(
            &OauthCreds {
                access_token: "t".into(),
                access_expires_at: 0,
                ..Default::default()
            },
            99
        ));
    }

    #[test]
    fn aggregate_sse_deltas_and_done() {
        let raw = "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"total_tokens\":3}}\n\n\
data: [DONE]\n";
        let (content, usage) = aggregate_chat_sse_or_json(raw).expect("sse");
        assert_eq!(content, "你好");
        assert_eq!(usage.get("total_tokens").and_then(|v| v.as_u64()), Some(3));
    }

    #[test]
    fn aggregate_falls_back_to_json_message() {
        let raw = r#"{"choices":[{"message":{"content":"hi"}}],"usage":{"total_tokens":1}}"#;
        let (content, usage) = aggregate_chat_sse_or_json(raw).expect("json");
        assert_eq!(content, "hi");
        assert_eq!(usage.get("total_tokens").and_then(|v| v.as_u64()), Some(1));
    }

    #[test]
    fn aggregate_sse_reasoning_when_content_empty() {
        let raw = "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"想\"}}]}\n\n\
data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"一下\"}}]}\n\n\
data: [DONE]\n";
        let (content, _) = aggregate_chat_sse_or_json(raw).expect("sse");
        assert_eq!(content, "想一下");
    }

    #[test]
    fn aggregate_sse_array_content_parts() {
        let raw = "data: {\"choices\":[{\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"A\"},{\"text\":\"B\"}]}}]}\n\n\
data: [DONE]\n";
        let (content, _) = aggregate_chat_sse_or_json(raw).expect("sse");
        assert_eq!(content, "AB");
    }

    #[test]
    fn aggregate_sse_data_envelope() {
        let raw = "data: {\"code\":0,\"data\":{\"choices\":[{\"delta\":{\"content\":\"封\"}}]}}\n\n\
data: [DONE]\n";
        let (content, _) = aggregate_chat_sse_or_json(raw).expect("sse");
        assert_eq!(content, "封");
    }

    #[test]
    fn stream_ingest_grows_visible_text_per_line() {
        let lines = [
            "data: {\"choices\":[{\"delta\":{\"content\":\"你\"}}]}",
            "data: {\"choices\":[{\"delta\":{\"content\":\"好\"}}]}",
            "data: [DONE]",
        ];
        let mut content = String::new();
        let mut reasoning = String::new();
        let mut usage = Value::Null;
        let mut emitted = String::new();
        let mut pieces = Vec::new();
        for line in lines {
            let done = ingest_chat_sse_line(&mut content, &mut reasoning, &mut usage, line);
            let visible = visible_assistant_text(&content, &reasoning);
            if visible.len() > emitted.len() && visible.starts_with(&emitted) {
                pieces.push(visible[emitted.len()..].to_string());
                emitted = visible;
            }
            if done {
                break;
            }
        }
        assert_eq!(pieces, vec!["你".to_string(), "好".to_string()]);
        assert_eq!(emitted, "你好");
    }
}
