//! WorkBuddy local-account ModelDriver for ATR.
//! Model-first: no content hijack scripts. Cold-start inspect is process chrome only.

use serde_json::{json, Value};

use super::contracts::MAX_TOOL_JSON_DEPTH;
use super::deepseek::openai_tools;
use super::engine::ModelDriver;
use super::parse;
use super::prompts::{self, trace_ran, user_tool_trace_section};
use super::store::TaskRow;
use crate::workbuddy_local_llm;

pub struct WorkbuddyDriver {
    pub max_tokens: u32,
}

impl Default for WorkbuddyDriver {
    fn default() -> Self {
        Self { max_tokens: 4096 }
    }
}

fn accept_tool_raw(s: &str) -> Result<String, String> {
    if parse::is_tool_json(s, MAX_TOOL_JSON_DEPTH) {
        Ok(s.to_string())
    } else {
        Err("no_tool_calls".into())
    }
}

fn tools_excluding_inspect() -> Value {
    let tools = openai_tools();
    let filtered: Vec<Value> = tools
        .as_array()
        .into_iter()
        .flatten()
        .filter(|t| {
            t.pointer("/function/name").and_then(|n| n.as_str()) != Some("inspect_workspace")
        })
        .cloned()
        .collect();
    Value::Array(filtered)
}

/// Formerly hijacked README/desktop goals. Kept as a no-op so callers stay stable.
/// Content decisions belong to the model; UI owns presentation.
pub fn scripted_readme_step(_task: &TaskRow, _trace: &str) -> Option<String> {
    None
}

impl ModelDriver for WorkbuddyDriver {
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String> {
        let trace = user_tool_trace_section(messages);
        let _ = scripted_readme_step(task, &trace);

        // Process chrome only: first paint inspect so the steps window is never blank.
        if task.current_turn == 0 && !trace_ran(&trace, "inspect_workspace") {
            return Ok(r#"{"tool":"inspect_workspace","arguments":{}}"#.into());
        }

        let had_inspect = trace_ran(&trace, "inspect_workspace");
        let tools = if had_inspect {
            tools_excluding_inspect()
        } else {
            openai_tools()
        };
        let required = json!("required");
        let tok = self.max_tokens;

        match workbuddy_local_llm::agent_tool_turn(messages, &tools, Some(tok), &required) {
            Ok(s) => {
                if let Ok(ok) = accept_tool_raw(&s) {
                    if had_inspect && ok.contains("inspect_workspace") {
                        // Fall through to content-JSON protocol.
                    } else {
                        return Ok(ok);
                    }
                }
            }
            Err(e) if e != "no_tool_calls" && !e.starts_with("http_status_") => {
                return Err(e);
            }
            Err(_) => {}
        }

        // OAuth freemodel models often ignore native tools — one content-JSON retry.
        match workbuddy_local_llm::agent_json_turn(messages, Some(tok)) {
            Ok(s) => {
                let ok = accept_tool_raw(&s)?;
                if had_inspect && ok.contains("inspect_workspace") {
                    return Err("no_tool_calls".into());
                }
                Ok(ok)
            }
            Err(e) => Err(e),
        }
    }
}

/// Account + selected model — enough for chat and ATR edit (OAuth freemodel).
pub fn workbuddy_chat_ready() -> bool {
    workbuddy_local_llm::atr_ready()
}

/// Enabled default account present (may still need model pick).
pub fn workbuddy_has_account() -> bool {
    workbuddy_local_llm::default_account()
        .map(|a| a.enabled)
        .unwrap_or(false)
}

/// Legacy alias: same as chat ready (probe no longer gates edit listing).
pub fn workbuddy_edit_ready() -> bool {
    workbuddy_chat_ready()
}

/// `unknown` | `pass` | `fail`
pub fn workbuddy_edit_probe_status() -> &'static str {
    workbuddy_local_llm::atr_edit_probe_status()
}

pub fn probe_workbuddy_edit(force: bool) -> Result<bool, String> {
    workbuddy_local_llm::probe_native_tool_calling(force)
}

/// Back-compat alias — ATR listing / drive ready when account + model present.
pub fn workbuddy_ready() -> bool {
    workbuddy_chat_ready()
}

pub fn workbuddy_model_id() -> Option<String> {
    workbuddy_local_llm::atr_selected_model()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty_task(goal: &str) -> TaskRow {
        TaskRow {
            task_id: "t".into(),
            goal: goal.into(),
            workspace_root: "/tmp".into(),
            permission_mode: "write_with_approval".into(),
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
        }
    }

    #[test]
    fn system_tool_list_does_not_count_as_ran() {
        let messages = vec![
            json!({"role":"system","content":"工具：inspect_workspace, propose_changes, apply_patch"}),
            json!({"role":"user","content":"goal=写一个readme\n\ntool_trace:\n(none yet)\n"}),
        ];
        let trace = user_tool_trace_section(&messages);
        assert!(!prompts::trace_ran(&trace, "inspect_workspace"));
    }

    #[test]
    fn scripted_readme_never_hijacks_model() {
        let goals = [
            "写一个readme",
            "复制一个readme到桌面上",
            "帮我在桌面上创建一个readme文件",
            "根据最新的情况更新一个readme2的文档，说明更新内容，并发到桌面",
        ];
        for g in goals {
            assert!(
                scripted_readme_step(&empty_task(g), "(none yet)").is_none(),
                "must not script: {g}"
            );
            assert!(
                scripted_readme_step(
                    &empty_task(g),
                    "[tool_result turn=1 tool=inspect_workspace]"
                )
                .is_none(),
                "must not script after inspect: {g}"
            );
        }
    }
}
