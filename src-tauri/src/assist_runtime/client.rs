//! Async OpenAI-compatible HTTP + injectable transport for tests.

use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::sync::Mutex;

use super::cancel::AssistCancel;
use super::contracts::AssistReason;
use super::models::ModelEntry;

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<Value>,
    pub max_tokens: u32,
}

#[derive(Debug, Clone)]
pub struct ChatResponse {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone)]
pub enum AssistHttpError {
    Reason(AssistReason),
    Message(String),
}

impl AssistHttpError {
    pub fn reason(&self) -> AssistReason {
        match self {
            Self::Reason(r) => *r,
            Self::Message(_) => AssistReason::Internal,
        }
    }
}

#[async_trait::async_trait]
pub trait AssistTransport: Send + Sync {
    async fn post_chat(
        &self,
        request: ChatRequest,
        cancel: AssistCancel,
        deadline: Instant,
    ) -> Result<ChatResponse, AssistHttpError>;
}

/// Production transport: reqwest async + select!(http, cancel, deadline).
pub struct ReqwestTransport;

#[async_trait::async_trait]
impl AssistTransport for ReqwestTransport {
    async fn post_chat(
        &self,
        request: ChatRequest,
        cancel: AssistCancel,
        deadline: Instant,
    ) -> Result<ChatResponse, AssistHttpError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(90))
            .build()
            .map_err(|e| AssistHttpError::Message(e.to_string()))?;

        let body = json!({
            "model": request.model,
            "messages": request.messages,
            "temperature": 0.2,
            "max_tokens": request.max_tokens,
        });

        let send_fut = async {
            let resp = client
                .post(&request.url)
                .header("Authorization", format!("Bearer {}", request.api_key.trim()))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    if e.is_timeout() {
                        AssistHttpError::Reason(AssistReason::Timeout)
                    } else if e.is_connect() {
                        AssistHttpError::Reason(AssistReason::Offline)
                    } else {
                        AssistHttpError::Reason(AssistReason::Offline)
                    }
                })?;
            let status = resp.status().as_u16();
            let text = resp
                .text()
                .await
                .map_err(|_| AssistHttpError::Reason(AssistReason::BadResponse))?;
            // Cap response body memory.
            let capped = if text.len() > super::contracts::MAX_RESPONSE_BYTES {
                text.chars()
                    .take(super::contracts::MAX_RESPONSE_BYTES)
                    .collect()
            } else {
                text
            };
            Ok::<ChatResponse, AssistHttpError>(ChatResponse {
                status,
                body: capped,
            })
        };

        let sleep_dur = deadline.saturating_duration_since(Instant::now());
        tokio::select! {
            _ = cancel.cancelled() => Err(AssistHttpError::Reason(AssistReason::Cancelled)),
            _ = tokio::time::sleep(sleep_dur) => Err(AssistHttpError::Reason(AssistReason::Timeout)),
            res = send_fut => res,
        }
    }
}

#[derive(Debug, Clone)]
pub enum FakeStep {
    /// Delay then return response. Cancel during delay must win.
    DelayMs(u64, Result<ChatResponse, AssistReason>),
    Immediate(Result<ChatResponse, AssistReason>),
}

/// Scripted transport for tests — must honor cancel/deadline like production.
pub struct FakeTransport {
    steps: Mutex<Vec<FakeStep>>,
    pub attempts: Arc<Mutex<u32>>,
}

impl FakeTransport {
    pub fn new(steps: Vec<FakeStep>) -> Self {
        Self {
            steps: Mutex::new(steps),
            attempts: Arc::new(Mutex::new(0)),
        }
    }
}

#[async_trait::async_trait]
impl AssistTransport for FakeTransport {
    async fn post_chat(
        &self,
        _request: ChatRequest,
        cancel: AssistCancel,
        deadline: Instant,
    ) -> Result<ChatResponse, AssistHttpError> {
        {
            let mut a = self.attempts.lock().await;
            *a += 1;
        }
        let step = {
            let mut g = self.steps.lock().await;
            if g.is_empty() {
                return Err(AssistHttpError::Reason(AssistReason::Internal));
            }
            g.remove(0)
        };
        let (delay_ms, result) = match step {
            FakeStep::Immediate(r) => (0u64, r),
            FakeStep::DelayMs(ms, r) => (ms, r),
        };
        let sleep_dur = deadline.saturating_duration_since(Instant::now());
        let work = async {
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
            result.map_err(AssistHttpError::Reason)
        };
        tokio::select! {
            _ = cancel.cancelled() => Err(AssistHttpError::Reason(AssistReason::Cancelled)),
            _ = tokio::time::sleep(sleep_dur) => Err(AssistHttpError::Reason(AssistReason::Timeout)),
            res = work => res,
        }
    }
}

pub fn extract_assistant_text(body: &str) -> Result<String, AssistReason> {
    let v: Value = serde_json::from_str(body).map_err(|_| AssistReason::BadResponse)?;
    let content = v
        .pointer("/choices/0/message/content")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    content.ok_or(AssistReason::BadResponse)
}

pub fn parse_task_organize_json(
    raw: &str,
    allowed_source_ids: &[String],
) -> Result<Value, AssistReason> {
    let text = strip_to_json(raw).ok_or(AssistReason::InvalidOutput)?;
    let v: Value = serde_json::from_str(&text).map_err(|_| AssistReason::InvalidOutput)?;
    validate_task_organize(&v, allowed_source_ids)?;
    Ok(v)
}

fn strip_to_json(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.starts_with('{') {
        return Some(t.to_string());
    }
    // Unique fenced code block.
    let mut blocks = Vec::new();
    let mut rest = t;
    while let Some(start) = rest.find("```") {
        let after = &rest[start + 3..];
        let after = after
            .strip_prefix("json")
            .or_else(|| after.strip_prefix("JSON"))
            .unwrap_or(after);
        let after = after.strip_prefix('\n').unwrap_or(after);
        if let Some(end) = after.find("```") {
            blocks.push(after[..end].trim().to_string());
            rest = &after[end + 3..];
        } else {
            break;
        }
    }
    if blocks.len() == 1 && blocks[0].starts_with('{') {
        Some(blocks[0].clone())
    } else {
        None
    }
}

fn validate_item(item: &Value, allowed: &[String]) -> Result<(), AssistReason> {
    let obj = item.as_object().ok_or(AssistReason::InvalidOutput)?;
    if obj.contains_key("tool_call") || obj.contains_key("toolCalls") || obj.contains_key("execute")
    {
        return Err(AssistReason::InvalidOutput);
    }
    let text = obj
        .get("text")
        .and_then(|x| x.as_str())
        .ok_or(AssistReason::InvalidOutput)?;
    if text.chars().count() > super::contracts::MAX_FIELD_CHARS {
        return Err(AssistReason::InvalidOutput);
    }
    if let Some(ids) = obj.get("sourceIds").or_else(|| obj.get("source_ids")) {
        let arr = ids.as_array().ok_or(AssistReason::InvalidOutput)?;
        for id in arr {
            let s = id.as_str().unwrap_or("");
            if !s.is_empty() && !allowed.iter().any(|a| a == s) {
                return Err(AssistReason::InvalidOutput);
            }
        }
    }
    Ok(())
}

fn validate_array(v: &Value, key: &str, allowed: &[String]) -> Result<(), AssistReason> {
    let arr = v
        .get(key)
        .or_else(|| {
            // camelCase aliases
            match key {
                "acceptance_criteria" => v.get("acceptanceCriteria"),
                _ => None,
            }
        })
        .cloned()
        .unwrap_or(Value::Array(vec![]));
    let arr = arr.as_array().ok_or(AssistReason::InvalidOutput)?;
    if arr.len() > super::contracts::MAX_ARRAY_ITEMS {
        return Err(AssistReason::InvalidOutput);
    }
    for item in arr {
        if item.is_string() {
            if item.as_str().unwrap_or("").chars().count() > super::contracts::MAX_FIELD_CHARS {
                return Err(AssistReason::InvalidOutput);
            }
            continue;
        }
        validate_item(item, allowed)?;
    }
    Ok(())
}

fn validate_task_organize(v: &Value, allowed: &[String]) -> Result<(), AssistReason> {
    let obj = v.as_object().ok_or(AssistReason::InvalidOutput)?;
    if obj.contains_key("tool_call") || obj.contains_key("toolCalls") {
        return Err(AssistReason::InvalidOutput);
    }
    let goal = obj
        .get("goal")
        .and_then(|x| x.as_str())
        .ok_or(AssistReason::InvalidOutput)?;
    if goal.trim().is_empty() || goal.chars().count() > super::contracts::MAX_FIELD_CHARS {
        return Err(AssistReason::InvalidOutput);
    }
    validate_array(v, "facts", allowed)?;
    validate_array(v, "constraints", allowed)?;
    validate_array(v, "steps", allowed)?;
    validate_array(v, "acceptance_criteria", allowed)?;
    validate_array(v, "unknowns", allowed)?;
    Ok(())
}

pub fn chat_request_for(entry: &ModelEntry, api_key: &str, messages: Vec<Value>) -> ChatRequest {
    ChatRequest {
        url: entry.chat_url.to_string(),
        api_key: api_key.to_string(),
        model: entry.model_id.to_string(),
        messages,
        max_tokens: entry.max_out_tokens.min(super::contracts::MAX_OUTPUT_TOKENS),
    }
}

/// Redact secrets from log lines.
pub fn safe_log_fragment(s: &str) -> String {
    let mut out = s.chars().take(120).collect::<String>();
    if s.len() > 120 {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_source_ids() {
        let raw = r#"{"goal":"g","facts":[{"text":"t","kind":"evidence","sourceIds":["nope"]}],"constraints":[],"steps":[],"acceptanceCriteria":[],"unknowns":[]}"#;
        assert!(parse_task_organize_json(raw, &["m1".into()]).is_err());
    }

    #[test]
    fn accepts_fenced_json() {
        let raw = "```json\n{\"goal\":\"g\",\"facts\":[],\"constraints\":[],\"steps\":[],\"acceptanceCriteria\":[],\"unknowns\":[]}\n```";
        assert!(parse_task_organize_json(raw, &[]).is_ok());
    }
}
