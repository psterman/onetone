//! Soft Pad OpenAI-compatible model drivers (tools / tool_calls).
//! Content-JSON remains a one-shot format fallback when the model ignores tools.

use serde_json::{json, Value};

use super::engine::ModelDriver;
use super::parse::TOOL_NAMES;
use super::store::TaskRow;
use crate::assist_runtime::{self, extract_assistant_text};
use crate::soft_pad_quota::{self, SoftPadQuotaProvider};

/// OpenAI-compatible Soft Pad provider driver (DeepSeek / Kimi / SiliconFlow / OpenRouter).
pub struct OpenAiCompatDriver {
    pub provider: SoftPadQuotaProvider,
    pub max_tokens: u32,
    /// After one content-JSON nudge, fail format instead of looping forever.
    content_fallback_used: bool,
}

impl OpenAiCompatDriver {
    pub fn for_provider(provider: SoftPadQuotaProvider) -> Self {
        Self {
            provider,
            max_tokens: 1024,
            content_fallback_used: false,
        }
    }
}

impl Default for OpenAiCompatDriver {
    fn default() -> Self {
        Self::for_provider(SoftPadQuotaProvider::DeepSeek)
    }
}

/// Back-compat alias used by older call sites / tests.
pub type DeepSeekDriver = OpenAiCompatDriver;

pub fn openai_tools() -> Value {
    let mut tools = Vec::new();
    for name in TOOL_NAMES {
        let (desc, props, required) = tool_schema(name);
        tools.push(json!({
            "type": "function",
            "function": {
                "name": name,
                "description": desc,
                "parameters": {
                    "type": "object",
                    "properties": props,
                    "required": required,
                    "additionalProperties": false
                }
            }
        }));
    }
    Value::Array(tools)
}

fn tool_schema(name: &str) -> (&'static str, Value, Vec<&'static str>) {
    match name {
        "inspect_workspace" => ("Inspect workspace dirty/git state", json!({}), vec![]),
        "search_code" => (
            "Search code for a query",
            json!({"query": {"type": "string"}}),
            vec!["query"],
        ),
        "read_file" => (
            "Read a workspace file. If not_found, create with propose_changes — do not re-search the same missing path.",
            json!({
                "path": {"type": "string"},
                "start_line": {"type": "integer"},
                "end_line": {"type": "integer"}
            }),
            vec!["path"],
        ),
        "propose_changes" => (
            "Propose full-file new content (does not write). Use for creates when read_file returned not_found; then call apply_patch.",
            json!({
                "path": {"type": "string"},
                "rationale": {"type": "string"},
                "new_content": {"type": "string"},
                "risk": {"type": "string"}
            }),
            vec!["path", "new_content"],
        ),
        "apply_patch" => (
            "Request applying full-file content (may wait for approval)",
            json!({
                "path": {"type": "string"},
                "new_content": {"type": "string"},
                "allow_dirty": {"type": "boolean"}
            }),
            vec!["path", "new_content"],
        ),
        "export_to_desktop" => (
            "Copy an existing workspace file to the Windows Desktop (not apply_patch)",
            json!({"path": {"type": "string"}}),
            vec!["path"],
        ),
        "run_check" => (
            "Run a registered check by id only",
            json!({"check_id": {"type": "string"}}),
            vec!["check_id"],
        ),
        "inspect_diff" => ("Inspect diffs of changed files", json!({}), vec![]),
        "request_user_input" => (
            "Ask the user a question and wait",
            json!({"question": {"type": "string"}}),
            vec!["question"],
        ),
        "finish" => (
            "Finish the task",
            json!({"summary": {"type": "string"}}),
            vec![],
        ),
        _ => ("tool", json!({}), vec![]),
    }
}

/// Prefer message.tool_calls; else content JSON once.
pub fn extract_tool_json(response_body: &str, allow_content_fallback: bool) -> Result<String, String> {
    let v: Value = serde_json::from_str(response_body).map_err(|_| "bad_response".to_string())?;
    let msg = v
        .pointer("/choices/0/message")
        .cloned()
        .ok_or_else(|| "bad_response".to_string())?;
    if let Some(calls) = msg.get("tool_calls").and_then(|c| c.as_array()) {
        if !calls.is_empty() {
            // Normalize to ATR parse shape.
            return Ok(json!({ "tool_calls": calls }).to_string());
        }
    }
    if !allow_content_fallback {
        return Err("no_tool_calls".into());
    }
    let content = msg
        .get("content")
        .and_then(|c| c.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "no_tool_calls".to_string())?;
    let trimmed = content
        .strip_prefix("```json")
        .or_else(|| content.strip_prefix("```"))
        .unwrap_or(content);
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();
    Ok(trimmed.to_string())
}

fn finish_from_http(
    text: &str,
    status: u16,
    content_fallback_used: &mut bool,
) -> Result<String, String> {
    if status == 401 || status == 403 {
        return Err("no_key".into());
    }
    if status == 429 {
        return Err("rate_limited".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!("http_status_{status}"));
    }
    match extract_tool_json(text, true) {
        Ok(s) => {
            if let Ok(v) = serde_json::from_str::<Value>(text) {
                let empty_calls = v
                    .pointer("/choices/0/message/tool_calls")
                    .and_then(|c| c.as_array())
                    .map(|a| a.is_empty())
                    .unwrap_or(true);
                if empty_calls {
                    *content_fallback_used = true;
                }
            }
            Ok(s)
        }
        Err(e) => {
            if !*content_fallback_used {
                *content_fallback_used = true;
                if let Ok(content) = extract_assistant_text(text) {
                    let trimmed = content.trim();
                    let trimmed = trimmed
                        .strip_prefix("```json")
                        .or_else(|| trimmed.strip_prefix("```"))
                        .unwrap_or(trimmed);
                    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();
                    if !trimmed.is_empty() {
                        return Ok(trimmed.to_string());
                    }
                }
            }
            Err(e)
        }
    }
}

impl ModelDriver for OpenAiCompatDriver {
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String> {
        // Model-first (no README hijack). Cold-start inspect is process chrome only.
        let trace = super::prompts::user_tool_trace_section(messages);
        let _ = super::workbuddy::scripted_readme_step(task, &trace);
        if !super::prompts::trace_ran(&trace, "inspect_workspace") {
            return Ok(r#"{"tool":"inspect_workspace","arguments":{}}"#.into());
        }

        let provider = self.provider;
        let entry = assist_runtime::model_catalog()
            .into_iter()
            .find(|e| e.provider == provider && e.enabled)
            .ok_or_else(|| format!("{}_unavailable", provider.as_str()))?;
        let key = soft_pad_quota::read_stored_key(provider).ok_or("no_key")?;
        let mut msgs = messages.to_vec();
        if self.content_fallback_used {
            msgs.push(json!({
                "role": "user",
                "content": "必须通过 tools/tool_calls 调用一个工具；不要只写自然语言。"
            }));
        }
        let body = json!({
            "model": entry.model_id,
            "messages": msgs,
            "tools": openai_tools(),
            "tool_choice": "auto",
            "max_tokens": self.max_tokens.min(entry.max_out_tokens),
            "temperature": 0.2,
        });
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(8))
            .timeout(std::time::Duration::from_secs(45))
            .build()
            .map_err(|e| e.to_string())?;
        let mut req = client
            .post(entry.chat_url)
            .bearer_auth(&key)
            .header("Content-Type", "application/json");
        if provider == SoftPadQuotaProvider::OpenRouter {
            req = req
                .header("HTTP-Referer", "https://onetone.app")
                .header("X-Title", "OneTone");
        }
        let resp = req
            .json(&body)
            .send()
            .map_err(|e| format!("http: {e}"))?;
        let status = resp.status().as_u16();
        let text = resp.text().map_err(|e| format!("body: {e}"))?;
        finish_from_http(&text, status, &mut self.content_fallback_used)
    }
}

/// Ready when DeepSeek Soft Pad key present (for capability matrix / IPC).
pub fn deepseek_ready() -> bool {
    soft_pad_quota::read_stored_key(SoftPadQuotaProvider::DeepSeek).is_some()
}

pub fn soft_pad_provider_ready(provider: SoftPadQuotaProvider) -> bool {
    soft_pad_quota::read_stored_key(provider).is_some()
        && assist_runtime::model_catalog()
            .into_iter()
            .any(|e| e.provider == provider && e.enabled)
}

pub fn soft_pad_model_id(provider: SoftPadQuotaProvider) -> Option<&'static str> {
    assist_runtime::model_catalog()
        .into_iter()
        .find(|e| e.provider == provider && e.enabled)
        .map(|e| e.model_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_native_tool_calls() {
        let body = r#"{
          "choices":[{
            "message":{
              "role":"assistant",
              "content":null,
              "tool_calls":[{
                "id":"c1",
                "type":"function",
                "function":{"name":"inspect_workspace","arguments":"{}"}
              }]
            }
          }]
        }"#;
        let raw = extract_tool_json(body, false).unwrap();
        assert!(raw.contains("tool_calls"));
        assert!(raw.contains("inspect_workspace"));
    }

    #[test]
    fn content_fallback_once() {
        let body = r#"{
          "choices":[{
            "message":{
              "role":"assistant",
              "content":"{\"tool\":\"finish\",\"arguments\":{\"summary\":\"ok\"}}"
            }
          }]
        }"#;
        let raw = extract_tool_json(body, true).unwrap();
        assert!(raw.contains("finish"));
        assert!(extract_tool_json(body, false).is_err());
    }

    #[test]
    fn openai_tools_covers_finish() {
        let tools = openai_tools();
        let arr = tools.as_array().unwrap();
        assert!(arr.iter().any(|t| {
            t.pointer("/function/name")
                .and_then(|n| n.as_str())
                == Some("finish")
        }));
        assert!(arr.iter().any(|t| {
            t.pointer("/function/name")
                .and_then(|n| n.as_str())
                == Some("export_to_desktop")
        }));
    }
}
