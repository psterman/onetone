//! Soft Pad OpenAI-compatible model drivers (tools / tool_calls).
//! Content-JSON remains a one-shot format fallback when the model ignores tools.

use serde_json::{json, Value};

use super::contracts::PermissionMode;
use super::engine::ModelDriver;
use super::parse::{CHAT_TOOL_NAMES, TOOL_NAMES};
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
    openai_tools_named(TOOL_NAMES)
}

/// Tool catalog for the active lane (chat = read_only subset).
pub fn openai_tools_for_task(task: &TaskRow) -> Value {
    let mode = PermissionMode::parse(&task.permission_mode).unwrap_or(PermissionMode::WriteWithApproval);
    if mode == PermissionMode::ReadOnly {
        openai_tools_named(CHAT_TOOL_NAMES)
    } else {
        openai_tools()
    }
}

fn openai_tools_named(names: &[&str]) -> Value {
    let mut tools = Vec::new();
    for name in names {
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
        "web_search" => (
            "Search the public web for a query",
            json!({
                "query": {"type": "string"},
                "limit": {"type": "integer"},
                "provider": {"type": "string"}
            }),
            vec!["query"],
        ),
        "fetch_url" => (
            "Fetch a public http(s) URL as text (SSRF-safe)",
            json!({
                "url": {"type": "string"},
                "provider": {"type": "string"},
                "max_chars": {"type": "integer"}
            }),
            vec!["url"],
        ),
        "request_user_input" => (
            "Ask the user a question and wait",
            json!({"question": {"type": "string"}}),
            vec!["question"],
        ),
        "deliver_to_agent" => (
            "Copy text to clipboard and paste into the focused external Agent (Soft Pad)",
            json!({
                "text": {"type": "string"},
                "kind": {"type": "string"}
            }),
            vec!["text"],
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

fn is_read_only_task(task: &TaskRow) -> bool {
    PermissionMode::parse(&task.permission_mode) == Some(PermissionMode::ReadOnly)
}

impl ModelDriver for OpenAiCompatDriver {
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String> {
        // Model-first (no README hijack). Work lane cold-starts with inspect chrome;
        // chat/read_only lets the model pick web_search / read_file first.
        let trace = super::prompts::user_tool_trace_section(messages);
        let _ = super::workbuddy::scripted_readme_step(task, &trace);
        if !is_read_only_task(task) && !super::prompts::trace_ran(&trace, "inspect_workspace") {
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
            "tools": openai_tools_for_task(task),
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

/// OpenAI-compatible driver for MiniMax coding plan / custom providers (not Soft Pad enum).
pub struct GenericOpenAiDriver {
    pub provider_id: String,
    pub chat_url: String,
    pub model: String,
    pub api_key: String,
    pub max_tokens: u32,
    content_fallback_used: bool,
}

impl GenericOpenAiDriver {
    pub fn new(provider_id: &str, chat_url: &str, model: &str, api_key: &str) -> Self {
        Self {
            provider_id: provider_id.to_string(),
            chat_url: chat_url.to_string(),
            model: model.to_string(),
            api_key: api_key.to_string(),
            max_tokens: 1024,
            content_fallback_used: false,
        }
    }

    pub fn for_minimax() -> Result<Self, String> {
        let key = crate::provider_usage::read_stored_minimax_coding_key()
            .ok_or_else(|| "minimax_unconfigured".to_string())?;
        Ok(Self::new(
            "minimax",
            "https://api.minimaxi.com/v1/chat/completions",
            "MiniMax-M2.5",
            &key,
        ))
    }

    pub fn for_custom(provider_id: &str) -> Result<Self, String> {
        let cfg = crate::model_provider::read_enabled(provider_id)
            .ok_or_else(|| format!("{provider_id}_unconfigured"))?;
        let key = crate::model_provider::read_key(provider_id)
            .ok_or_else(|| "auth_failed".to_string())?;
        let base = cfg.base_url.trim_end_matches('/');
        let chat_url = if base.ends_with("/chat/completions") {
            base.to_string()
        } else {
            format!("{base}/chat/completions")
        };
        Ok(Self::new(provider_id, &chat_url, &cfg.model, &key))
    }
}

impl ModelDriver for GenericOpenAiDriver {
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String> {
        let trace = super::prompts::user_tool_trace_section(messages);
        let _ = super::workbuddy::scripted_readme_step(task, &trace);
        if !is_read_only_task(task) && !super::prompts::trace_ran(&trace, "inspect_workspace") {
            return Ok(r#"{"tool":"inspect_workspace","arguments":{}}"#.into());
        }
        let mut msgs = messages.to_vec();
        if self.content_fallback_used {
            msgs.push(json!({
                "role": "user",
                "content": "必须通过 tools/tool_calls 调用一个工具；不要只写自然语言。"
            }));
        }
        let body = json!({
            "model": self.model,
            "messages": msgs,
            "tools": openai_tools_for_task(task),
            "tool_choice": "auto",
            "max_tokens": self.max_tokens,
            "temperature": 0.2,
        });
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(8))
            .timeout(std::time::Duration::from_secs(45))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client
            .post(&self.chat_url)
            .bearer_auth(&self.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .map_err(|e| {
                if e.is_timeout() {
                    "timeout".to_string()
                } else {
                    format!("network_error: {e}")
                }
            })?;
        let status = resp.status().as_u16();
        if status == 401 || status == 403 {
            return Err("auth_failed".into());
        }
        if status == 429 {
            return Err("rate_limited".into());
        }
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
        assert!(arr.iter().any(|t| {
            t.pointer("/function/name")
                .and_then(|n| n.as_str())
                == Some("web_search")
        }));
        assert!(arr.iter().any(|t| {
            t.pointer("/function/name")
                .and_then(|n| n.as_str())
                == Some("deliver_to_agent")
        }));
    }

    #[test]
    fn chat_tools_exclude_write() {
        let mut task = crate::agent_task_runtime::store::TaskRow {
            task_id: "t".into(),
            goal: "q".into(),
            workspace_root: "/tmp".into(),
            permission_mode: "read_only".into(),
            status: "running".into(),
            waiting_reason: None,
            current_turn: 0,
            tool_call_count: 0,
            changed_files_json: "[]".into(),
            baseline_dirty_json: "[]".into(),
            pending_approval_token: None,
            pending_patch_json: None,
            fingerprints_json: "{}".into(),
            checkpoint_id: None,
            last_error: None,
            repair_count: 0,
            format_retry_count: 0,
            applied_tokens_json: "[]".into(),
            created_at: 0,
            updated_at: 0,
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "unknown".into(),
            verify_intent: false,
            sandbox_id: None,
            expected_rel_path: None,
            expected_content: None,
        };
        let tools = openai_tools_for_task(&task);
        let names: Vec<&str> = tools
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t.pointer("/function/name").and_then(|n| n.as_str()))
            .collect();
        assert!(names.contains(&"web_search"));
        assert!(names.contains(&"finish"));
        assert!(!names.contains(&"apply_patch"));
        task.permission_mode = "write_with_approval".into();
        let work = openai_tools_for_task(&task);
        let work_names: Vec<&str> = work
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t.pointer("/function/name").and_then(|n| n.as_str()))
            .collect();
        assert!(work_names.contains(&"apply_patch"));
    }
}
