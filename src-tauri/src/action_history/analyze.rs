//! DeepSeek chat API for action history analysis.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::log;
use super::model::ActionHistoryEntry;

const DEFAULT_MODEL: &str = "deepseek-chat";
const DEFAULT_HOURS: u64 = 24;
const DEFAULT_LIMIT: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

fn system_prompt() -> &'static str {
    "你是 OneTone 桌面应用的使用分析助手。用户会提供结构化动作历史 JSON。\
     只基于日志中实际出现的动作回答，不要编造未记录的行为。\
     用简洁中文回答，必要时用条目列表。不要输出用户隐私内容（听写正文、文件路径）。"
}

fn load_deepseek_auth() -> Option<(String, String)> {
    let path = claude_settings_path();
    let contents = std::fs::read_to_string(path).ok()?;
    crate::agent_usage::parse_claude_deepseek_auth(&contents)
}

fn claude_settings_path() -> std::path::PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return std::path::PathBuf::from(home)
            .join(".claude")
            .join("settings.json");
    }
    if let Ok(home) = std::env::var("HOME") {
        return std::path::PathBuf::from(home)
            .join(".claude")
            .join("settings.json");
    }
    std::path::PathBuf::from(".claude/settings.json")
}

fn chat_completions_url(base: &str) -> String {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1") {
        format!("{trimmed}/chat/completions")
    } else {
        format!("{trimmed}/v1/chat/completions")
    }
}

fn entries_json(entries: &[ActionHistoryEntry]) -> String {
    serde_json::to_string(entries).unwrap_or_else(|_| "[]".into())
}

pub fn build_summary_user_prompt(entries: &[ActionHistoryEntry]) -> String {
    format!(
        "请分析以下 OneTone 动作历史（最近 {} 条），输出：\n\
         1. 使用摘要（时段、主要通道）\n\
         2. 高频动作 Top 5\n\
         3. 2-3 条可执行的优化建议\n\n\
         动作日志 JSON：\n{}",
        entries.len(),
        entries_json(entries)
    )
}

pub fn build_chat_user_prompt(question: &str, entries: &[ActionHistoryEntry]) -> String {
    format!(
        "用户问题：{question}\n\n\
         参考动作日志（最近 {} 条）JSON：\n{}",
        entries.len(),
        entries_json(entries)
    )
}

pub fn build_optimization_user_prompt(entries: &[ActionHistoryEntry]) -> String {
    format!(
        "基于以下 OneTone 动作历史，给出 3-5 条具体优化建议（快捷键/语音/SoftPad/摄像头习惯配置）：\n\n{}",
        entries_json(entries)
    )
}

fn call_deepseek(user_prompt: &str) -> AnalyzeResult {
    let Some((base, key)) = load_deepseek_auth() else {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("no_api_key".into()),
            detail: Some("请在 Claude Code settings 中配置 DeepSeek API（ANTHROPIC_BASE_URL + AUTH_TOKEN）".into()),
        };
    };
    if key.trim().is_empty() {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("no_api_key".into()),
            detail: Some("DeepSeek API key 为空".into()),
        };
    }

    let body = serde_json::json!({
        "model": DEFAULT_MODEL,
        "messages": [
            { "role": "system", "content": system_prompt() },
            { "role": "user", "content": user_prompt },
        ],
        "temperature": 0.3,
        "max_tokens": 2048,
    });

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return AnalyzeResult {
                ok: false,
                text: None,
                reason: Some("http_client".into()),
                detail: Some(e.to_string()),
            };
        }
    };

    let url = chat_completions_url(&base);
    let resp = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", key.trim()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
    {
        Ok(r) => r,
        Err(e) => {
            return AnalyzeResult {
                ok: false,
                text: None,
                reason: Some("network".into()),
                detail: Some(e.to_string()),
            };
        }
    };

    let status = resp.status();
    let raw = resp.text().unwrap_or_default();
    if !status.is_success() {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("api_error".into()),
            detail: Some(format!("HTTP {status}: {raw}")),
        };
    }

    let v: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            return AnalyzeResult {
                ok: false,
                text: None,
                reason: Some("parse_error".into()),
                detail: Some(e.to_string()),
            };
        }
    };

    let text = v
        .pointer("/choices/0/message/content")
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    match text {
        Some(t) => AnalyzeResult {
            ok: true,
            text: Some(t),
            reason: None,
            detail: None,
        },
        None => AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("empty_response".into()),
            detail: Some(raw.chars().take(500).collect()),
        },
    }
}

pub fn analyze_summary(
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<&str>,
) -> AnalyzeResult {
    let hours = hours.unwrap_or(DEFAULT_HOURS).clamp(1, 168);
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    let entries = log::entries_for_analysis(hours, limit, mapping_id);
    if entries.is_empty() {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("no_entries".into()),
            detail: Some("暂无动作记录，请先使用语音/按键/SoftPad/摄像头触发一些动作".into()),
        };
    }
    let prompt = build_summary_user_prompt(&entries);
    call_deepseek(&prompt)
}

pub fn analyze_optimization(
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<&str>,
) -> AnalyzeResult {
    let hours = hours.unwrap_or(DEFAULT_HOURS).clamp(1, 168);
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    let entries = log::entries_for_analysis(hours, limit, mapping_id);
    if entries.is_empty() {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("no_entries".into()),
            detail: Some("暂无动作记录".into()),
        };
    }
    let prompt = build_optimization_user_prompt(&entries);
    call_deepseek(&prompt)
}

pub fn analyze_chat(
    question: &str,
    hours: Option<u64>,
    limit: Option<usize>,
    mapping_id: Option<&str>,
) -> AnalyzeResult {
    let q = question.trim();
    if q.is_empty() {
        return AnalyzeResult {
            ok: false,
            text: None,
            reason: Some("empty_question".into()),
            detail: None,
        };
    }
    let hours = hours.unwrap_or(DEFAULT_HOURS).clamp(1, 168);
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    let entries = log::entries_for_analysis(hours, limit, mapping_id);
    let prompt = build_chat_user_prompt(q, &entries);
    call_deepseek(&prompt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_builders_include_json() {
        let entries = vec![ActionHistoryEntry::new(
            1,
            1000,
            "key",
            "semantic_action",
            "executed",
            "test",
        )];
        assert!(build_summary_user_prompt(&entries).contains("test"));
        assert!(build_chat_user_prompt("用了几次?", &entries).contains("用了几次?"));
        assert!(build_optimization_user_prompt(&entries).contains("优化建议"));
    }

    #[test]
    fn no_api_key_fail_closed() {
        let prev = std::env::var("USERPROFILE").ok();
        std::env::set_var("USERPROFILE", "/nonexistent-onetone-test-path");
        let r = analyze_chat("test", Some(24), Some(10), None);
        assert!(!r.ok);
        assert_eq!(r.reason.as_deref(), Some("no_api_key"));
        if let Some(p) = prev {
            std::env::set_var("USERPROFILE", p);
        }
    }
}
