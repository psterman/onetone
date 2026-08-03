//! Best-effort model labels for the three Soft Pad agent chips.
//!
//! This is deliberately separate from `PadStatus`: lifecycle arbitration has one
//! winner, while the minimized strip presents one durable row per agent.

use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelMetadata {
    pub model: String,
    pub confidence: String,
    pub session_id: String,
    pub updated_at: u64,
}

fn store() -> &'static Mutex<HashMap<AgentKind, AgentModelMetadata>> {
    static STORE: OnceLock<Mutex<HashMap<AgentKind, AgentModelMetadata>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn codex_config_override() -> &'static Mutex<Option<PathBuf>> {
    static OVR: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();
    OVR.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub fn set_codex_config_path_override_for_test(path: Option<PathBuf>) {
    *codex_config_override().lock().unwrap() = path;
}

fn codex_config_toml_path() -> PathBuf {
    #[cfg(test)]
    if let Some(p) = codex_config_override().lock().unwrap().clone() {
        return p;
    }
    if let Ok(home) = std::env::var("CODEX_HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("config.toml");
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".codex").join("config.toml");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".codex").join("config.toml");
    }
    PathBuf::from(".codex").join("config.toml")
}

/// Parse root `model` (+ optional `model_reasoning_effort`) from Codex config.toml.
/// Matches the TUI header like `gpt-5.6-sol low`.
pub fn parse_codex_config_model_label(contents: &str) -> Option<String> {
    let mut section = String::new();
    let mut model: Option<String> = None;
    let mut effort: Option<String> = None;
    for line in contents.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with('[') && t.ends_with(']') {
            section = t[1..t.len() - 1].trim().to_string();
            continue;
        }
        if !section.is_empty() {
            continue;
        }
        if let Some(v) = toml_root_string(t, "model") {
            model = Some(v);
        } else if let Some(v) = toml_root_string(t, "model_reasoning_effort") {
            effort = Some(v);
        }
    }
    let model = model?.trim().to_string();
    if model.is_empty() {
        return None;
    }
    match effort {
        Some(e) if !e.trim().is_empty() => Some(format!("{} {}", model, e.trim())),
        _ => Some(model),
    }
}

fn toml_root_string(line: &str, key: &str) -> Option<String> {
    let rest = line.strip_prefix(key)?.trim_start();
    let rest = rest.strip_prefix('=')?.trim_start();
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let body = rest.get(1..)?;
    let end = body.find(quote)?;
    Some(body[..end].to_string())
}

fn read_codex_config_model_label() -> Option<String> {
    let path = codex_config_toml_path();
    let contents = std::fs::read_to_string(path).ok()?;
    parse_codex_config_model_label(&contents)
}

pub fn ingest_hook_model(
    agent: AgentKind,
    event: &str,
    session_id: &str,
    raw_model: &str,
    updated_at: u64,
) {
    let raw = raw_model.trim();
    if agent == AgentKind::Claude && event.trim() != "SessionStart" {
        return;
    }
    if raw.is_empty() {
        if agent == AgentKind::Claude && event.trim() == "SessionStart" {
            store()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&AgentKind::Claude);
        }
        return;
    }
    let (model, confidence) = match agent {
        AgentKind::Codex => (raw.to_string(), "high"),
        // Claude only promises the session-start model. A later /model change is invisible.
        AgentKind::Claude => (raw.to_string(), "low"),
        // Cursor may report the router rather than its resolved model.
        AgentKind::Cursor if raw.eq_ignore_ascii_case("default") => ("Auto".into(), "low"),
        AgentKind::Cursor => (raw.to_string(), "medium"),
        AgentKind::CopilotCli => return,
    };
    let mut g = store().lock().unwrap_or_else(|e| e.into_inner());
    g.insert(
        agent,
        AgentModelMetadata {
            model,
            confidence: confidence.into(),
            session_id: session_id.trim().to_string(),
            updated_at,
        },
    );
}

pub fn snapshot(agent: AgentKind) -> AgentModelMetadata {
    let mut meta = store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&agent)
        .cloned()
        .unwrap_or_default();
    // Codex hooks often omit model; ~/.codex/config.toml matches the TUI header.
    if agent == AgentKind::Codex && meta.model.trim().is_empty() {
        if let Some(label) = read_codex_config_model_label() {
            meta.model = label;
            meta.confidence = "medium".into();
        }
    }
    meta
}

#[cfg(test)]
pub fn reset_for_test() {
    store().lock().unwrap_or_else(|e| e.into_inner()).clear();
    set_codex_config_path_override_for_test(None);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn cursor_default_is_honest_auto() {
        reset_for_test();
        ingest_hook_model(AgentKind::Cursor, "beforeSubmitPrompt", "c1", "default", 7);
        let got = snapshot(AgentKind::Cursor);
        assert_eq!(got.model, "Auto");
        assert_eq!(got.confidence, "low");
    }

    #[test]
    fn claude_only_accepts_session_start_model() {
        reset_for_test();
        ingest_hook_model(AgentKind::Claude, "SessionStart", "s1", "claude-sonnet", 1);
        ingest_hook_model(AgentKind::Claude, "Stop", "s1", "claude-opus", 2);
        assert_eq!(snapshot(AgentKind::Claude).model, "claude-sonnet");
        ingest_hook_model(AgentKind::Claude, "SessionStart", "s2", "", 3);
        assert!(snapshot(AgentKind::Claude).model.is_empty());
    }

    #[test]
    fn parses_codex_config_model_and_effort() {
        let label = parse_codex_config_model_label(
            r#"
# comment
model = "gpt-5.6-sol"
model_reasoning_effort = "low"
[features]
hooks = true
model = "ignored-in-table"
"#,
        );
        assert_eq!(label.as_deref(), Some("gpt-5.6-sol low"));
    }

    #[test]
    fn codex_snapshot_falls_back_to_config_when_hook_empty() {
        reset_for_test();
        let dir = std::env::temp_dir().join(format!(
            "onetone-codex-model-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let cfg = dir.join("config.toml");
        {
            let mut f = std::fs::File::create(&cfg).unwrap();
            writeln!(f, "model = \"gpt-5.6-sol\"").unwrap();
            writeln!(f, "model_reasoning_effort = \"low\"").unwrap();
        }
        set_codex_config_path_override_for_test(Some(cfg));
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.model, "gpt-5.6-sol low");
        assert_eq!(got.confidence, "medium");
        let _ = std::fs::remove_dir_all(&dir);
        reset_for_test();
    }

    #[test]
    fn codex_hook_model_wins_over_config() {
        reset_for_test();
        let dir = std::env::temp_dir().join(format!(
            "onetone-codex-model-hook-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let cfg = dir.join("config.toml");
        std::fs::write(&cfg, "model = \"from-config\"\n").unwrap();
        set_codex_config_path_override_for_test(Some(cfg));
        ingest_hook_model(AgentKind::Codex, "SessionStart", "s1", "from-hook", 9);
        let got = snapshot(AgentKind::Codex);
        assert_eq!(got.model, "from-hook");
        assert_eq!(got.confidence, "high");
        let _ = std::fs::remove_dir_all(&dir);
        reset_for_test();
    }
}
