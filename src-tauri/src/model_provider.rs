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

/// List model ids from an OpenAI-compatible `GET {base}/models`.
/// Prefer stored provider config; optional base_url/api_key for unsaved drafts.
pub fn list_models(
    provider_id: Option<&str>,
    base_url: Option<&str>,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    let pid = provider_id.unwrap_or("").trim();
    let mut url = base_url.unwrap_or("").trim().trim_end_matches('/').to_string();
    let mut key = api_key.unwrap_or("").trim().to_string();
    if !pid.is_empty() {
        if let Some(cfg) = read_configs()?.into_iter().find(|c| c.id == pid) {
            if url.is_empty() {
                url = cfg.base_url.trim_end_matches('/').to_string();
            }
        }
        if key.is_empty() {
            if let Some(k) = read_key(pid) {
                key = k;
            }
        }
    }
    if url.is_empty() {
        return Err("base_url_required".into());
    }
    if key.is_empty() {
        return Err("api_key_required".into());
    }
    let endpoint = format!("{url}/models");
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(&endpoint)
        .bearer_auth(&key)
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "timeout".to_string()
            } else {
                "network_error".to_string()
            }
        })?;
    let status = response.status().as_u16();
    let value: Value = response.json().map_err(|_| "unsupported_format".to_string())?;
    if !(200..300).contains(&status) {
        return Err(provider_error_message(status, &value));
    }
    let mut ids = Vec::new();
    if let Some(arr) = value.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            }
        }
    } else if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                let id = id.trim();
                if !id.is_empty() {
                    ids.push(id.to_string());
                }
            }
        }
    }
    ids.sort();
    ids.dedup();
    // Soft cap for UI datalist size.
    if ids.len() > 400 {
        ids.truncate(400);
    }
    Ok(ids)
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
    if !valid_id(id) || key.len() > 4096 {
        return Err("invalid_key".into());
    }
    let k = key.trim();
    // Empty key clears; sentinel "anonymous" enables no-auth free pools (e.g. Kilo).
    if k.is_empty() {
        let _ = fs::remove_file(key_path(id));
        return Ok(());
    }
    fs::create_dir_all(effective_data_root().join(KEY_DIR)).map_err(|e| e.to_string())?;
    fs::write(key_path(id), k).map_err(|e| e.to_string())
}

fn bearer_for_chat(id: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(key_path(id)) {
        Ok(raw) => {
            let k = raw.trim().to_string();
            if k.is_empty() || k.eq_ignore_ascii_case("anonymous") {
                Ok(None)
            } else {
                Ok(Some(k))
            }
        }
        Err(_) => {
            // Kilo free pool allows unauthenticated requests.
            if id == "kilo" {
                Ok(None)
            } else {
                Err("auth_failed".into())
            }
        }
    }
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
    let key = bearer_for_chat(&config.id)?.unwrap_or_default();
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

/// Pull assistant-visible text; fall back to reasoning when content is empty/null/array.
fn extract_assistant_text(value: &Value) -> String {
    fn append_parts(out: &mut String, v: &Value) {
        match v {
            Value::String(s) => out.push_str(s),
            Value::Array(items) => {
                for item in items {
                    if let Some(s) = item.as_str() {
                        out.push_str(s);
                    } else if let Some(s) = item.get("text").and_then(|t| t.as_str()) {
                        out.push_str(s);
                    } else if let Some(s) = item.get("content").and_then(|t| t.as_str()) {
                        out.push_str(s);
                    }
                }
            }
            _ => {}
        }
    }
    let msg = value
        .pointer("/choices/0/message")
        .cloned()
        .unwrap_or(Value::Null);
    let mut content = String::new();
    if let Some(v) = msg.get("content") {
        append_parts(&mut content, v);
    }
    if content.trim().is_empty() {
        if let Some(v) = value.pointer("/choices/0/text") {
            append_parts(&mut content, v);
        }
    }
    if content.trim().is_empty() {
        let mut reasoning = String::new();
        for key in ["reasoning_content", "reasoning", "thinking"] {
            if let Some(v) = msg.get(key) {
                append_parts(&mut reasoning, v);
            }
        }
        content = reasoning;
    }
    content
}

fn provider_error_message(status: u16, value: &Value) -> String {
    let msg = value
        .get("message")
        .and_then(|m| m.as_str())
        .or_else(|| value.get("error").and_then(|e| e.as_str()))
        .or_else(|| value.pointer("/error/message").and_then(|m| m.as_str()))
        .unwrap_or("")
        .trim();
    if !msg.is_empty() {
        return format!("provider_http_{status}:{msg}");
    }
    format!("provider_http_{status}")
}

pub fn chat(req: ModelChatRequest) -> Result<Value, String> {
    let config = read_configs()?
        .into_iter()
        .find(|c| c.id == req.provider_id && c.enabled)
        .ok_or_else(|| "provider_not_configured".to_string())?;
    validate_config(&config)?;
    let bearer = bearer_for_chat(&config.id)?;
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
    let client = Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?;
    let mut bearer = bearer;
    // Raccoon: refresh near expiry, then attach client platform headers.
    if config.id == "raccoon" {
        if let Ok(tok) = crate::raccoon_oauth::ensure_fresh_access_token() {
            bearer = Some(tok);
        }
    }

    let send_once = |bearer: &Option<String>| -> Result<(u16, Value), String> {
        let mut req_builder = client.post(&endpoint).json(&body);
        if config.id == "raccoon" {
            for (k, v) in crate::raccoon_oauth::chat_extra_headers() {
                req_builder = req_builder.header(k, v);
            }
        }
        if let Some(key) = bearer.as_ref() {
            req_builder = req_builder.bearer_auth(key);
        }
        let response = req_builder.send().map_err(|e| {
            if e.is_timeout() {
                "timeout".to_string()
            } else {
                "network_error".to_string()
            }
        })?;
        let status = response.status().as_u16();
        let value: Value = response.json().map_err(|_| "unsupported_format".to_string())?;
        Ok((status, value))
    };

    let (mut status, mut value) = send_once(&bearer)?;
    // Raccoon IAM tokens need `/api/web/auth/v1/iam/confirm` once per session.
    if config.id == "raccoon"
        && crate::raccoon_oauth::is_iam_confirm_required(status, &value)
    {
        if let Some(tok) = bearer.as_deref() {
            let _ = crate::raccoon_oauth::confirm_iam_session(tok);
        }
        let retry = send_once(&bearer)?;
        status = retry.0;
        value = retry.1;
    }
    if status == 401 || status == 403 {
        return Err("auth_failed".into());
    }
    if status == 429 {
        return Err("rate_limited".into());
    }
    if !(200..300).contains(&status) {
        return Err(provider_error_message(status, &value));
    }
    let text = extract_assistant_text(&value);
    if text.trim().is_empty() {
        return Err("empty_model_content".into());
    }
    Ok(json!({
        "ok": true,
        "providerId": config.id,
        "model": value["model"].as_str().unwrap_or(&config.model),
        "text": text,
        "usage": value.get("usage"),
        "finishReason": value["choices"][0]["finish_reason"]
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_falls_back_to_reasoning_content() {
        let v = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "",
                    "reasoning_content": "Hi there!"
                }
            }]
        });
        assert_eq!(extract_assistant_text(&v), "Hi there!");
    }

    #[test]
    fn extract_handles_null_content_and_array_parts() {
        let v = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": null,
                    "reasoning": [{"type":"text","text":"A"},{"text":"B"}]
                }
            }]
        });
        assert_eq!(extract_assistant_text(&v), "AB");
    }

    #[test]
    fn provider_error_keeps_message() {
        let v = json!({ "code": 200901, "message": "iam_confirm_required" });
        assert!(provider_error_message(400, &v).contains("iam_confirm_required"));
    }
}
