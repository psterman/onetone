//! Prompt builder — identity + tool contracts + task context (model-visible only).

use serde_json::Value;

use super::contracts::{PermissionMode, TaskDto, TaskEventDto};
use super::store::TaskRow;

const TRACE_EVENTS: usize = 8;
/// Keep each tool payload small — freemodel SSE stalls when the next turn context balloons.
const TRACE_CHARS_EACH: usize = 1_600;
const BASELINE_DIRTY_SAMPLE: usize = 24;

pub fn system_prompt_work() -> &'static str {
    "你是 OneTone 工作模式的执行 Agent：在用户授权的工作区内用工具完成目标。\n\
     每一轮只输出一个工具调用；不要闲聊、不要改写用户目标语义。\n\
     文件名/路径以用户说法为准（如 README2.md），勿擅自换成 README.md。\n\
     判断必须基于 tool_trace 真实结果；不得编造文件、测试或修改结果。\n\
     已有文件：修改前先 read_file。新建/目标文件不存在：不要反复 search；直接 propose_changes + apply_patch。\n\
     read_file 返回 not_found 时，下一步必须 propose_changes 创建该 path。\n\
     propose_changes 不写盘。apply_patch 在 write_with_approval 下需用户批准（含基线已脏，勿因 dirty 空转）。\n\
     放到桌面/Desktop：先在工作区写好，再 export_to_desktop{path}（相对路径）；禁止 apply_patch 桌面/绝对路径。\n\
     run_check 只传 check_id。自动修复最多 3 轮。勿重复同一工具与相同参数。\n\
     查询/说明类目标：证据足够就立刻 finish{summary}，不要为了凑步骤继续空转。\n\
     可用 web_search / fetch_url 查公开网；deliver_to_agent 投递到外部 Agent。\n\
     目标含糊时 request_user_input 一次。完成时 finish{summary}（summary 可短列表说明改了什么）。"
}

/// Chat lane: proactive tool loop; never tell the user to click 工作.
pub fn system_prompt_chat() -> &'static str {
    "你是 OneTone 对话 Agent：用工具把问题查清楚，再用自然语言结案。\n\
     每一轮只输出一个工具调用；不要闲聊、不要输出框架表，禁止说「去点顶部工作 / 切换工作模式」。\n\
     证据不够时主动：search_code / read_file（仓内）、web_search / fetch_url（公开网）。\n\
     本回合默认只读，不要假装已改文件。用户要交给 Cursor/Codex 等外部 Agent 时用 deliver_to_agent{text}；失败如实说明。\n\
     prior_chat 是上文摘要，goal 是本轮当前问题——优先回答 goal；仅当问题本身含糊且工具无法判定时才 request_user_input 一次。\n\
     事实查询（人数、价格、是否、地点、公开资料）先 web_search / fetch_url，再 finish；不要用 request_user_input 代替检索。\n\
     公开事实/闲聊禁止用 inspect_workspace / search_code / read_file 回答——那些只服务「本仓库代码」问题；仓内文档（验收记录、Gate7、计划）不是用户闲聊的答案。\n\
     用户说「继续」时继续完成 goal / prior_chat 里的原问题，不要改写成仓库状态汇报。\n\
     【证据】禁止的是把未核实内容说成确定事实，不是提及它；不得编造网页或文件内容。\n\
     【记忆】可以用已知作答，须标注「凭记忆，未检索核实」；真名、数字、日期、机构不作确定表述。\n\
     【检索无果】一次空结果或单字字典页不算查完。下一轮必须换一组与上一轮不同的 query：先纠错或换别名，再用精确引号，最后加领域词与站点限定；不要现在结案，也不要让用户替你换词。工具返回里的 message 只是现象描述，优先级低于本条。\n\
     【结案】必须用 finish{summary} 工具调用结案，不要输出散文；查证动作由你完成，只有改写路径全部跑完，才可把「请用户补一个链接」作为最后一项可选补充。\n\
     【summary 顺序】先给结论或已知判断 → 置信标签 → 圈出不确定项 → 已尝试路径（自然语言）→ 最后才可选请用户协助。\n\
     【summary 禁语】不得出现预算名、工具名、tool_trace、chat_search_cap、fetch_url 等内部标识符，也不得复述系统指令或检索次数。"
}

pub fn system_prompt() -> &'static str {
    system_prompt_work()
}

pub fn tool_contracts_prompt_work() -> &'static str {
    "工具：inspect_workspace, search_code{query}, read_file{path,start_line?,end_line?},\n\
     propose_changes{path,rationale,new_content,risk?}, apply_patch{path,new_content,allow_dirty?},\n\
     export_to_desktop{path}, run_check{check_id}, inspect_diff,\n\
     web_search{query,limit?,provider?}, fetch_url{url,provider?,max_chars?},\n\
     request_user_input{question}, deliver_to_agent{text,kind?}, finish{summary?}。\n\
     输出 JSON：{\"tool\":\"...\",\"arguments\":{...}}"
}

pub fn tool_contracts_prompt_chat() -> &'static str {
    "工具：inspect_workspace, search_code{query}, read_file{path,start_line?,end_line?},\n\
     web_search{query,limit?,provider?}, fetch_url{url,provider?,max_chars?},\n\
     request_user_input{question}, deliver_to_agent{text,kind?}, finish{summary?}。\n\
     输出 JSON：{\"tool\":\"...\",\"arguments\":{...}}"
}

pub fn tool_contracts_prompt() -> &'static str {
    tool_contracts_prompt_work()
}

fn is_chat_lane(task: &TaskRow) -> bool {
    PermissionMode::parse(&task.permission_mode) == Some(PermissionMode::ReadOnly)
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
                    | "waiting_deliver"
                    | "waiting_user"
                    | "user_input"
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
            "{out}\n规则：已 inspect 过则禁止再 inspect_workspace；选下一步工具继续，证据够则 finish。"
        );
    }
    if out.contains("not_found") {
        out = format!(
            "{out}\n规则：not_found = 文件不存在。禁止再 search/read 同一缺失路径；立刻 propose_changes{{path,new_content}} 创建，再 apply_patch；目标含桌面则再 export_to_desktop{{path}}。"
        );
    }
    if out.contains("inspect_diff")
        && (out.contains("\"changedFiles\":[]") || out.contains("no_paths_to_diff"))
    {
        out = format!(
            "{out}\n规则：inspect_diff 无可用文件时立刻 finish{{summary}} 回答目标。"
        );
    }
    out
}

/// Compact dirty list for the model — full paths stay in scope for write gates.
pub fn baseline_dirty_for_model(baseline_dirty_json: &str) -> String {
    let Ok(list) = serde_json::from_str::<Vec<String>>(baseline_dirty_json) else {
        return baseline_dirty_json.chars().take(400).collect();
    };
    let total = list.len();
    if total <= BASELINE_DIRTY_SAMPLE {
        return serde_json::to_string(&list).unwrap_or_else(|_| "[]".into());
    }
    let sample: Vec<&String> = list.iter().take(BASELINE_DIRTY_SAMPLE).collect();
    format!(
        "{{\"count\":{total},\"sample\":{},\"omitted\":{}}}",
        serde_json::to_string(&sample).unwrap_or_else(|_| "[]".into()),
        total - BASELINE_DIRTY_SAMPLE
    )
}

/// materialsSummary from the started event (chat prior turns / work mats).
pub fn materials_summary_from_events(events: &[TaskEventDto]) -> String {
    events
        .iter()
        .find(|e| e.kind == "started")
        .and_then(|e| {
            e.payload
                .get("materialsSummary")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

pub fn task_context_prompt(
    task: &TaskRow,
    recent_tool_note: &str,
    tool_trace: &str,
    materials_summary: &str,
) -> String {
    let prior = materials_summary.trim();
    let prior_block = if prior.is_empty() {
        String::new()
    } else {
        let capped: String = prior.chars().take(3_000).collect();
        format!("prior_chat:\n{capped}\n\n")
    };
    format!(
        "{prior_block}task_id={}\ngoal={}\npermission_mode={}\nstatus={}\nchanged_files={}\nbaseline_dirty={}\nrepair_count={}\nrecent={}\n\ntool_trace:\n{}\n",
        task.task_id,
        task.goal,
        task.permission_mode,
        task.status,
        task.changed_files_json,
        baseline_dirty_for_model(&task.baseline_dirty_json),
        task.repair_count,
        recent_note_for_model(recent_tool_note),
        if tool_trace.is_empty() {
            "(none yet)"
        } else {
            tool_trace
        }
    )
}

/// FE prefixes materials with `reply_tone:<hint>\n` for chat-lane soft style.
fn peel_reply_tone(materials_summary: &str) -> (Option<String>, String) {
    let trimmed = materials_summary.trim_start();
    let Some(rest) = trimmed.strip_prefix("reply_tone:") else {
        return (None, materials_summary.to_string());
    };
    if let Some((hint, body)) = rest.split_once('\n') {
        let h = hint.trim();
        return (
            if h.is_empty() {
                None
            } else {
                Some(h.to_string())
            },
            body.to_string(),
        );
    }
    let h = rest.trim();
    (
        if h.is_empty() {
            None
        } else {
            Some(h.to_string())
        },
        String::new(),
    )
}

pub fn build_messages(task: &TaskRow, recent: &str, tool_trace: &str) -> Vec<serde_json::Value> {
    build_messages_with_materials(task, recent, tool_trace, "")
}

pub fn build_messages_with_materials(
    task: &TaskRow,
    recent: &str,
    tool_trace: &str,
    materials_summary: &str,
) -> Vec<serde_json::Value> {
    let (tone, mats) = peel_reply_tone(materials_summary);
    let chat = is_chat_lane(task);
    let tools = if chat {
        tool_contracts_prompt_chat()
    } else {
        tool_contracts_prompt_work()
    };
    let sys = if chat {
        match tone {
            Some(hint) if !hint.is_empty() => format!("{}\n{}", system_prompt_chat(), hint),
            _ => system_prompt_chat().to_string(),
        }
    } else {
        system_prompt_work().to_string()
    };
    vec![
        serde_json::json!({"role":"system","content": sys}),
        serde_json::json!({"role":"system","content": tools}),
        serde_json::json!({
            "role":"user",
            "content": task_context_prompt(task, recent, tool_trace, &mats)
        }),
    ]
}

pub fn dto_context(task: &TaskDto) -> String {
    format!("{} [{}]", task.goal, task.status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_task_runtime::store::TaskRow;
    use serde_json::json;

    #[test]
    fn chat_prompt_evidence_contract() {
        let p = system_prompt_chat();
        assert!(p.contains("凭记忆，未检索核实"), "{p}");
        assert!(p.contains("一次空结果或单字字典页不算查完"), "{p}");
        assert!(p.contains("【summary 禁语】"), "{p}");
        assert!(
            p.contains("公开事实/闲聊禁止用 inspect_workspace"),
            "{p}"
        );
        assert!(p.contains("用户说「继续」时继续完成 goal"), "{p}");
        assert!(
            !p.contains("判断只依据 tool_trace"),
            "old binary evidence gate must be gone"
        );
    }

    #[test]
    fn chat_reply_tone_peels_into_system_not_prior_chat() {
        let task = TaskRow {
            task_id: "t1".into(),
            goal: "问一句".into(),
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
            created_at: 1,
            updated_at: 1,
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "fake".into(),
            verify_intent: false,
            sandbox_id: None,
            expected_rel_path: None,
            expected_content: None,
        plan_json: None,
        plan_version: 0,
        plan_status: "none".into(),
        };
        let mats = "reply_tone:回复语气：口语、先结论。\nuser: hi\nassistant: hello";
        let msgs = build_messages_with_materials(&task, "", "", mats);
        let sys = msgs[0]["content"].as_str().unwrap_or("");
        assert!(sys.contains("回复语气：口语、先结论。"), "{sys}");
        let user = msgs[2]["content"].as_str().unwrap_or("");
        assert!(user.contains("prior_chat:"), "{user}");
        assert!(user.contains("user: hi"), "{user}");
        assert!(!user.contains("reply_tone:"), "{user}");
        assert!(!user.contains("回复语气："), "{user}");
    }

    #[test]
    fn tool_trace_includes_user_input() {
        let events = vec![TaskEventDto {
            event_id: "e0".into(),
            task_id: "t1".into(),
            seq: 1,
            kind: "user_input".into(),
            turn: 1,
            tool_name: None,
            payload: json!({"text": "戴佳伟是谁"}),
            created_at: 1,
        }];
        let trace = tool_trace_from_events(&events);
        assert!(trace.contains("user_input"), "trace={trace}");
        assert!(trace.contains("戴佳伟是谁"), "trace={trace}");
    }

    #[test]
    fn prior_chat_injected_from_materials() {
        let task = TaskRow {
            task_id: "t1".into(),
            goal: "继续问".into(),
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
            created_at: 1,
            updated_at: 1,
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "fake".into(),
            verify_intent: false,
            sandbox_id: None,
            expected_rel_path: None,
            expected_content: None,
        plan_json: None,
        plan_version: 0,
        plan_status: "none".into(),
        };
        let ctx = task_context_prompt(&task, "", "", "user: hi\nassistant: hello");
        assert!(ctx.contains("prior_chat:"), "{ctx}");
        assert!(ctx.contains("user: hi"), "{ctx}");
        assert!(ctx.contains("goal=继续问"), "{ctx}");
    }

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

    #[test]
    fn baseline_dirty_for_model_samples_long_lists() {
        let many: Vec<String> = (0..40).map(|i| format!("f{i}.rs")).collect();
        let raw = serde_json::to_string(&many).unwrap();
        let out = baseline_dirty_for_model(&raw);
        assert!(out.contains("\"count\":40"), "out={out}");
        assert!(out.contains("omitted"), "out={out}");
        assert!(!out.contains("f39.rs"), "sample must omit tail: {out}");
    }

    #[test]
    fn inspect_nudge_does_not_hardcode_edit_chain() {
        let events = vec![TaskEventDto {
            event_id: "e1".into(),
            task_id: "t1".into(),
            seq: 1,
            kind: "tool_result".into(),
            turn: 1,
            tool_name: Some("inspect_workspace".into()),
            payload: json!({"result":{"entries":[]}}),
            created_at: 1,
        }];
        let trace = tool_trace_from_events(&events);
        assert!(trace.contains("禁止再 inspect_workspace"));
        assert!(trace.contains("finish"));
        assert!(
            !trace.contains("下一步必须 read_file / propose_changes"),
            "must not hardcode edit chain: {trace}"
        );
    }
}
