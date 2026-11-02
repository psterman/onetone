//! User-managed model providers.
//! Metadata is persisted separately from API keys; keys never cross the IPC
//! boundary except as an input to the setter.

use std::fs;
use std::path::PathBuf;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::data_root::effective_data_root;

const CONFIG_FILE: &str = "model-providers.json";
const KEY_DIR: &str = "model-provider-keys";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProviderConfig {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub timeout_ms: Option<u64>,
    pub max_context_tokens: Option<u32>,
    pub supports_json: Option<bool>,
    pub supports_streaming: Option<bool>,
    pub supports_tools: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelChatRequest {
    pub provider_id: String,
    pub model: Option<String>,
    pub messages: Vec<Value>,
    pub response_format: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

fn config_path() -> PathBuf {
    effective_data_root().join(CONFIG_FILE)
}

fn key_path(id: &str) -> PathBuf {
    effective_data_root().join(KEY_DIR).join(format!("{id}.key"))
}

fn read_configs() -> Result<Vec<ModelProviderConfig>, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid provider config: {e}"))
}

fn write_configs(configs: &[ModelProviderConfig]) -> Result<(), String> {
    fs::create_dir_all(effective_data_root()).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(configs).map_err(|e| e.to_string())?;
    fs::write(config_path(), raw).map_err(|e| e.to_string())
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 80
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn validate_config(c: &ModelProviderConfig) -> Result<(), String> {
    if !valid_id(&c.id) || c.protocol != "openai_compatible" {
        return Err("unsupported_provider".into());
    }
    if !(c.base_url.starts_with("https://") || c.base_url.starts_with("http://")) {
        return Err("base_url_must_be_http".into());
    }
    if c.model.trim().is_empty() {
        return Err("model_required".into());
    }
    Ok(())
}

pub fn snapshot() -> Result<Vec<Value>, String> {
    Ok(read_configs()?
        .into_iter()
        .map(|c| {
            json!({
                "id": c.id,
                "name": c.name,
                "protocol": c.protocol,
                "baseUrl": c.base_url,
                "model": c.model,
                "enabled": c.enabled,
                "configured": key_path(&c.id).exists(),
                "maskedKey": key_path(&c.id).exists().then(|| "••••••••".to_string()),
                "timeoutMs": c.timeout_ms,
                "maxContextTokens": c.max_context_tokens,
                "supportsJson": c.supports_json,
                "supportsStreaming": c.supports_streaming,
                "supportsTools": c.supports_tools
            })
        })
        .collect())
}

pub fn upsert(config: ModelProviderConfig) -> Result<Vec<Value>, String> {
    validate_config(&config)?;
    let mut all = read_configs()?;
    all.retain(|c| c.id != config.id);
    all.push(config);
    write_configs(&all)?;
    snapshot()
}

pub fn remove(id: &str) -> Result<Vec<Value>, String> {
    if !valid_id(id) {
        return Err("invalid_provider_id".into());
    }
    let mut all = read_configs()?;
    all.retain(|c| c.id != id);
    write_configs(&all)?;
    let _ = fs::remove_file(key_path(id));
    snapshot()
}

pub fn set_key(id: &str, key: &str) -> Result<(), String> {
    if !valid_id(id) || key.trim().is_empty() || key.len() > 4096 {
        return Err("invalid_key".into());
    }
    fs::create_dir_all(effective_data_root().join(KEY_DIR)).map_err(|e| e.to_string())?;
    fs::write(key_path(id), key.trim()).map_err(|e| e.to_string())
}

/// ATR / FE helpers — enabled config by id (no secrets).
pub fn read_enabled(id: &str) -> Option<ModelProviderConfig> {
    read_configs()
        .ok()?
        .into_iter()
        .find(|c| c.id == id && c.enabled)
}

pub fn read_key(id: &str) -> Option<String> {
    let raw = fs::read_to_string(key_path(id)).ok()?;
    let k = raw.trim().to_string();
    if k.is_empty() {
        None
    } else {
        Some(k)
    }
}

pub fn list_enabled_ids() -> Vec<String> {
    read_configs()
        .unwrap_or_default()
        .into_iter()
        .filter(|c| c.enabled)
        .map(|c| c.id)
        .collect()
}

/// Resolve chat URL / model / key for ATR GenericOpenAiDriver (no secrets in logs).
pub fn resolve_openai_endpoint(provider_id: &str) -> Result<(String, String, String), String> {
    let config = read_configs()?
        .into_iter()
        .find(|c| c.id == provider_id && c.enabled)
        .ok_or_else(|| format!("{provider_id}_unconfigured"))?;
    validate_config(&config)?;
    let key = fs::read_to_string(key_path(&config.id)).map_err(|_| "auth_failed".to_string())?;
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("auth_failed".into());
    }
    let endpoint = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    Ok((endpoint, config.model.clone(), key))
}

pub fn enabled_ids() -> Result<Vec<String>, String> {
    Ok(read_configs()?
        .into_iter()
        .filter(|c| c.enabled)
        .map(|c| c.id)
        .collect())
}

pub fn chat(req: ModelChatRequest) -> Result<Value, String> {
    let config = read_configs()?
        .into_iter()
        .find(|c| c.id == req.provider_id && c.enabled)
        .ok_or_else(|| "provider_not_configured".to_string())?;
    validate_config(&config)?;
    let key = fs::read_to_string(key_path(&config.id)).map_err(|_| "auth_failed".to_string())?;
    let endpoint = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let mut body = json!({
        "model": req.model.unwrap_or_else(|| config.model.clone()),
        "messages": req.messages,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "temperature": req.temperature.unwrap_or(0.2)
    });
    if req.response_format.as_deref() == Some("json") {
        body["response_format"] = json!({"type":"json_object"});
    }
    let timeout = std::time::Duration::from_millis(config.timeout_ms.unwrap_or(60_000).clamp(5_000, 180_000));
    let response = Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?
        .post(endpoint)
        .bearer_auth(key.trim())
        .json(&body)
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "timeout".to_string()
            } else {
                "network_error".to_string()
            }
        })?;
    let status = response.status();
    let value: Value = response.json().map_err(|_| "unsupported_format".to_string())?;
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("auth_failed".into());
    }
    if status.as_u16() == 429 {
        return Err("rate_limited".into());
    }
    if !status.is_success() {
        return Err(format!("provider_http_{}", status.as_u16()));
    }
    let text = value["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    Ok(json!({
        "ok": true,
        "providerId": config.id,
        "model": value["model"].as_str().unwrap_or(&config.model),
        "text": text,
        "usage": value.get("usage"),
        "finishReason": value["choices"][0]["finish_reason"]
    }))
}
