//! WorkBuddy local-account ModelDriver for ATR.
//! Model-first: no content hijack scripts, no forced tool chrome.

use serde_json::{json, Value};

use super::contracts::MAX_TOOL_JSON_DEPTH;
use super::contracts::PermissionMode;
use super::deepseek::{openai_tools, openai_tools_for_task};
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

fn finish_from_prose(summary: &str) -> String {
    let s: String = summary.chars().take(1200).collect();
    json!({"tool":"finish","arguments":{"summary": s}}).to_string()
}

/// CoT / mid-plan monologue must not become the user-facing finish summary.
fn looks_like_incomplete_thinking(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return true;
    }
    // Cut mid-sentence (screenshots: "实际上，根据我的知识:" / "Now I need to").
    let last = t.chars().last().unwrap_or(' ');
    if matches!(last, ':' | '：' | ',' | '，' | '、' | '-' | '—') {
        return true;
    }
    if t.ends_with(" to") || t.ends_with(" to ") || t.ends_with("需要") {
        return true;
    }
    let lower = t.to_ascii_lowercase();
    // Protocol / tool-loop leakage — not an answer.
    if lower.contains("tool_trace")
        || lower.contains("prior_chat")
        || lower.contains("let me search")
        || lower.contains("let me analyze")
        || t.contains("让我搜索")
        || t.contains("让我分析")
        || t.contains("根据我的知识") && !t.contains('。') && !t.contains('.')
    {
        return true;
    }
    false
}

/// Last web_search/fetch_url failed/empty with no later read_file/fetch_url success.
/// Blocks mid-loop "搜不到就算了" prose from becoming finish.
fn thin_failed_network_without_followup(trace: &str) -> bool {
    let mut last_net_fail_at: Option<usize> = None;
    for (i, line) in trace.lines().enumerate() {
        let is_ws = line.contains("tool=web_search]");
        let is_fu = line.contains("tool=fetch_url]");
        if !(is_ws || is_fu) || !line.contains("tool_result") {
            continue;
        }
        let failed = line.contains("\"ok\":false")
            || line.contains("\"ok\": false")
            || line.contains("\"code\":\"empty\"")
            || line.contains("\"code\": \"empty\"");
        if failed {
            last_net_fail_at = Some(i);
        } else {
            // Successful web_search / fetch_url clears prior empty-search block.
            last_net_fail_at = None;
        }
    }
    let Some(fail_line) = last_net_fail_at else {
        return false;
    };
    for (i, line) in trace.lines().enumerate() {
        if i <= fail_line || !line.contains("tool_result") {
            continue;
        }
        if line.contains("tool=read_file]") || line.contains("tool=fetch_url]") {
            if line.contains("\"ok\":false") || line.contains("\"ok\": false") {
                continue;
            }
            return false;
        }
    }
    true
}

fn salvage_prose_finish(trace: &str, err: &str) -> Option<String> {
    let summary = err.strip_prefix("prose_no_tool:")?;
    // Only after at least one real tool result — protocol recovery, not a scripted chain.
    if !trace.contains("tool=") {
        return None;
    }
    if thin_failed_network_without_followup(trace) {
        return None;
    }
    let t = summary.trim();
    if t.is_empty() || looks_like_incomplete_thinking(t) {
        return None;
    }
    Some(finish_from_prose(t))
}

impl ModelDriver for WorkbuddyDriver {
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String> {
        workbuddy_local_llm::atr_live_begin(&task.task_id);
        let out = self.next_tool_json_inner(task, messages);
        workbuddy_local_llm::atr_live_clear();
        out
    }
}

impl WorkbuddyDriver {
    fn next_tool_json_inner(
        &mut self,
        task: &TaskRow,
        messages: &[Value],
    ) -> Result<String, String> {
        let trace = user_tool_trace_section(messages);
        let _ = scripted_readme_step(task, &trace);

        let chat_lane =
            PermissionMode::parse(&task.permission_mode) == Some(PermissionMode::ReadOnly);
        // Model picks the first tool. After inspect once, drop it from the catalog
        // so freemodel can't loop on chrome — not a business tool chain.
        // Chat lane: no forced inspect; keep full chat tool set.
        let had_inspect = trace_ran(&trace, "inspect_workspace");
        let tools = if chat_lane {
            openai_tools_for_task(task)
        } else if had_inspect {
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
            Err(e) => {
                if let Some(fin) = salvage_prose_finish(&trace, &e) {
                    return Ok(fin);
                }
                if e.starts_with("prose_no_tool:") {
                    return Err("no_tool_calls".into());
                }
                Err(e)
            }
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

/// Chat/login ready. Normal editCapable comes from backend acceptance records.
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
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "unknown".into(),
            verify_intent: false,
            sandbox_id: None,
            expected_rel_path: None,
            expected_content: None,
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
    fn prose_after_tools_salvages_finish() {
        let fin = salvage_prose_finish(
            "[tool_result turn=1 tool=inspect_diff] {}",
            "prose_no_tool:今天改了 package.json 等文件",
        )
        .expect("salvage");
        assert!(fin.contains("\"tool\":\"finish\""), "{fin}");
        assert!(fin.contains("package.json"), "{fin}");
        assert!(salvage_prose_finish("(none yet)", "prose_no_tool:hi").is_none());
        assert!(
            salvage_prose_finish(
                "[tool_result turn=1 tool=web_search] {}",
                "prose_no_tool:Looking at prior_chat and tool_trace, Let me search for 异灵术"
            )
            .is_none(),
            "must not salvage incomplete CoT"
        );
        assert!(
            salvage_prose_finish(
                "[tool_result turn=1 tool=web_search] {}",
                "prose_no_tool:实际上，根据我的知识:"
            )
            .is_none()
        );
        // Empty/failed search without follow-up evidence must not soft-close the loop.
        assert!(
            salvage_prose_finish(
                "[tool_result turn=1 tool=web_search] {\"result\":{\"ok\":false,\"code\":\"empty\",\"results\":[]}}\n\
                 [tool_result turn=2 tool=inspect_workspace] {\"entries\":[]}",
                "prose_no_tool:未能核实戴佳伟相关信息。有什么我可以帮你的吗？"
            )
            .is_none(),
            "must not salvage after empty search"
        );
        // Successful fetch after a failed search allows salvage.
        assert!(
            salvage_prose_finish(
                "[tool_result turn=1 tool=web_search] {\"result\":{\"ok\":false,\"code\":\"empty\"}}\n\
                 [tool_result turn=2 tool=fetch_url] {\"result\":{\"ok\":true,\"text\":\"证据\"}}",
                "prose_no_tool:根据页面内容，结论如下。"
            )
            .is_some()
        );
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
