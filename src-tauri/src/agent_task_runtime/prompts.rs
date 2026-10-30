//! Prompt builder — identity + tool contracts + task context (model-visible only).

use serde_json::Value;

use super::contracts::{TaskDto, TaskEventDto};
use super::store::TaskRow;

const TRACE_EVENTS: usize = 8;
const TRACE_CHARS_EACH: usize = 4_000;

pub fn system_prompt() -> &'static str {
    "你是 OneTone 工作模式的执行 Agent：在用户授权的工作区内用工具完成目标。\n\
     每一轮只输出一个工具调用；不要闲聊、不要改写用户目标语义。\n\
     文件名/路径以用户说法为准（如 README2.md），勿擅自换成 README.md。\n\
     判断必须基于 tool_trace 真实结果；不得编造文件、测试或修改结果。\n\
     已有文件：修改前先 read_file。新建/目标文件不存在：不要反复 search；直接 propose_changes + apply_patch。\n\
     read_file 返回 not_found 时，下一步必须 propose_changes 创建该 path。\n\
     propose_changes 不写盘。apply_patch 在 write_with_approval 下需用户批准（含基线已脏，勿因 dirty 空转）。\n\
     放到桌面/Desktop：先在工作区写好，再 export_to_desktop{path}（相对路径）；禁止 apply_patch 桌面/绝对路径。\n\
     run_check 只传 check_id。自动修复最多 3 轮。勿重复同一工具与相同参数。\n\
     目标含糊时 request_user_input 一次。完成时 finish{summary}（summary 可短列表说明改了什么）。"
}

pub fn tool_contracts_prompt() -> &'static str {
    "工具：inspect_workspace, search_code{query}, read_file{path,start_line?,end_line?},\n\
     propose_changes{path,rationale,new_content,risk?}, apply_patch{path,new_content,allow_dirty?},\n\
     export_to_desktop{path}, run_check{check_id}, inspect_diff, request_user_input{question}, finish{summary?}。\n\
     输出 JSON：{\"tool\":\"...\",\"arguments\":{...}}"
}

/// Drop stuck-loop bookkeeping prefix so the model only sees the tool note.
pub fn recent_note_for_model(recent: &str) -> &str {
    if recent.starts_with("repeat:") {
        recent.splitn(3, "###").nth(2).unwrap_or(recent)
    } else {
        recent
    }
}

/// Only the user task_context (`tool_trace:`) — NOT system prompts that list tool names.
pub fn user_tool_trace_section(messages: &[Value]) -> String {
    messages
        .iter()
        .filter_map(|m| {
            if m.get("role").and_then(|r| r.as_str()) != Some("user") {
                return None;
            }
            let c = m.get("content")?.as_str()?;
            c.split("tool_trace:").nth(1).map(|s| s.to_string())
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Events render as: `[tool_result turn=N tool=inspect_workspace]`.
pub fn trace_ran(trace: &str, tool: &str) -> bool {
    trace.contains(&format!("tool={tool}"))
}

/// Last tool_result / tool_error payloads — without this the model is blind and re-inspects.
pub fn tool_trace_from_events(events: &[TaskEventDto]) -> String {
    let relevant: Vec<&TaskEventDto> = events
        .iter()
        .filter(|e| {
            matches!(
                e.kind.as_str(),
                "tool_result"
                    | "tool_error"
                    | "format_retry"
                    | "waiting_approval"
                    | "waiting_user"
                    | "patch_applied"
                    | "exported_desktop"
            )
        })
        .collect();
    let start = relevant.len().saturating_sub(TRACE_EVENTS);
    let body = relevant[start..]
        .iter()
        .map(|e| {
            let raw = serde_json::to_string(&e.payload).unwrap_or_default();
            let body: String = raw.chars().take(TRACE_CHARS_EACH).collect();
            format!(
                "[{} turn={} tool={}] {}",
                e.kind,
                e.turn,
                e.tool_name.as_deref().unwrap_or("-"),
                body
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let mut out = body;
    if out.contains("inspect_workspace") {
        out = format!(
            "{out}\n规则：已 inspect 过则禁止再 inspect_workspace；下一步必须 read_file / propose_changes / apply_patch / export_to_desktop / finish。"
        );
    }
    if out.contains("not_found") {
        out = format!(
            "{out}\n规则：not_found = 文件不存在。禁止再 search/read 同一缺失路径；立刻 propose_changes{{path,new_content}} 创建，再 apply_patch；目标含桌面则再 export_to_desktop{{path}}。"
        );
    }
    out
}

pub fn task_context_prompt(task: &TaskRow, recent_tool_note: &str, tool_trace: &str) -> String {
    format!(
        "task_id={}\ngoal={}\npermission_mode={}\nstatus={}\nchanged_files={}\nbaseline_dirty={}\nrepair_count={}\nrecent={}\n\ntool_trace:\n{}\n",
        task.task_id,
        task.goal,
        task.permission_mode,
        task.status,
        task.changed_files_json,
        task.baseline_dirty_json,
        task.repair_count,
        recent_note_for_model(recent_tool_note),
        if tool_trace.is_empty() {
            "(none yet)"
        } else {
            tool_trace
        }
    )
}

pub fn build_messages(task: &TaskRow, recent: &str, tool_trace: &str) -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({"role":"system","content": system_prompt()}),
        serde_json::json!({"role":"system","content": tool_contracts_prompt()}),
        serde_json::json!({"role":"user","content": task_context_prompt(task, recent, tool_trace)}),
    ]
}

pub fn dto_context(task: &TaskDto) -> String {
    format!("{} [{}]", task.goal, task.status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tool_trace_includes_payload() {
        let events = vec![TaskEventDto {
            event_id: "e1".into(),
            task_id: "t1".into(),
            seq: 1,
            kind: "tool_result".into(),
            turn: 1,
            tool_name: Some("inspect_workspace".into()),
            payload: json!({"result":{"entries":[{"name":"README.md","kind":"file"}]}}),
            created_at: 1,
        }];
        let trace = tool_trace_from_events(&events);
        assert!(trace.contains("README.md"), "trace={trace}");
        assert!(trace.contains("inspect_workspace"));
    }

    #[test]
    fn tool_trace_not_found_nudges_create() {
        let events = vec![TaskEventDto {
            event_id: "e2".into(),
            task_id: "t1".into(),
            seq: 2,
            kind: "tool_error".into(),
            turn: 2,
            tool_name: Some("read_file".into()),
            payload: json!({"error":"not_found:README2.md — 新建请立刻 propose_changes"}),
            created_at: 2,
        }];
        let trace = tool_trace_from_events(&events);
        assert!(trace.contains("not_found"), "trace={trace}");
        assert!(trace.contains("propose_changes"), "trace={trace}");
        assert!(trace.contains("禁止再 search/read"), "trace={trace}");
    }

    #[test]
    fn recent_note_strips_repeat_prefix() {
        assert_eq!(
            recent_note_for_model("repeat:2###inspect_workspace:{}###inspect ok"),
            "inspect ok"
        );
        assert_eq!(recent_note_for_model("plain"), "plain");
    }
}
