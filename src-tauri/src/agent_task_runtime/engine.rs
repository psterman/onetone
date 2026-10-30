//! Runtime loop: model (or fake driver) proposes one tool; Runtime gates & persists.

use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::Connection;
use serde_json::{json, Value};

use super::cancel::{self, TaskCancel};
use super::contracts::{
    PermissionMode, TaskStatus, MAX_FORMAT_RETRIES, MAX_IDENTICAL_TOOL, MAX_REPAIR,
    MAX_TOOL_JSON_DEPTH, MAX_TURNS,
};
use super::parse::{self, ParseError, ToolCall};
use super::prompts;
use super::scope::{self, WorkspaceScope};
use super::store::{
    self, append_event_and_update_task, get_task, insert_task, list_events, now_ms, TaskRow,
};
use super::tools::{self, PendingPatch};

pub trait ModelDriver: Send {
    /// Return next tool-call JSON (or empty to stop).
    fn next_tool_json(&mut self, task: &TaskRow, messages: &[Value]) -> Result<String, String>;
}

/// Scripted driver for Slice A happy path / tests.
pub struct FakeDriver {
    pub steps: Vec<String>,
    pub idx: usize,
}

impl ModelDriver for FakeDriver {
    fn next_tool_json(&mut self, _task: &TaskRow, _messages: &[Value]) -> Result<String, String> {
        if self.idx >= self.steps.len() {
            return Ok(r#"{"tool":"finish","arguments":{"summary":"done"}}"#.into());
        }
        let s = self.steps[self.idx].clone();
        self.idx += 1;
        Ok(s)
    }
}

pub struct StartOpts {
    pub goal: String,
    pub workspace_root: PathBuf,
    pub permission_mode: PermissionMode,
    pub materials_summary: String,
}

pub fn start_task(conn: &mut Connection, opts: StartOpts) -> Result<TaskRow, String> {
    let scope = scope::open_workspace(&opts.workspace_root)?;
    let now = now_ms();
    let task_id = store::new_task_id();
    let project_id = crate::agent_memory::project_id_from_path(&scope.root);
    let ws = scope.root.display().to_string();
    let session_id = crate::agent_memory::ensure_atr_session(
        &project_id,
        &task_id,
        &opts.goal,
        Some(&ws),
    )?;
    let ckpt = crate::agent_memory::create_or_get_atr_checkpoint(
        &session_id,
        &task_id,
        Some("执行中"),
        None,
        None,
    )?;
    let mut task = TaskRow {
        task_id: task_id.clone(),
        goal: opts.goal,
        workspace_root: ws,
        permission_mode: opts.permission_mode.as_str().into(),
        status: TaskStatus::Running.as_str().into(),
        waiting_reason: None,
        current_turn: 0,
        tool_call_count: 0,
        changed_files_json: "[]".into(),
        baseline_dirty_json: serde_json::to_string(&scope.baseline_dirty).unwrap_or_else(|_| "[]".into()),
        pending_approval_token: None,
        pending_patch_json: None,
        fingerprints_json: "{}".into(),
        checkpoint_id: Some(ckpt.checkpoint_id.clone()),
        last_error: None,
        repair_count: 0,
        format_retry_count: 0,
        applied_tokens_json: "[]".into(),
        created_at: now,
        updated_at: now,
    };
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("tx start: {e}"))?;
    insert_task(&tx, &task)?;
    let ev = append_event_and_update_task(
        &tx,
        &task,
        "started",
        None,
        json!({
            "materialsSummary": opts.materials_summary,
            "baselineDirty": scope.baseline_dirty,
            "sessionId": session_id,
            "checkpointId": ckpt.checkpoint_id,
        }),
    )?;
    task = get_task(&tx, &task_id)?.ok_or("missing after start")?;
    tx.commit().map_err(|e| format!("commit start: {e}"))?;
    sync_memory_checkpoint(&task, Some(&ev.event_id));
    let _ = cancel::register(&task_id);
    Ok(task)
}

/// Project ATR task onto the bound agent_memory checkpoint (same checkpoint_id).
pub fn sync_memory_checkpoint(task: &TaskRow, last_event_id: Option<&str>) {
    let Some(ckpt_id) = task.checkpoint_id.as_deref() else {
        return;
    };
    let changed = store::parse_string_list(&task.changed_files_json);
    let mut pending = Vec::new();
    let next = match task.status.as_str() {
        "waiting" if task.waiting_reason.as_deref() == Some("approval") => {
            pending.push("批准或拒绝当前补丁".into());
            Some("确认后继续")
        }
        "waiting" => {
            pending.push(
                task.waiting_reason
                    .clone()
                    .unwrap_or_else(|| "需要你的输入".into()),
            );
            Some("回复后继续")
        }
        "interrupted" => Some("继续任务或放弃"),
        "done" => Some("再做一件相关的事"),
        "failed" => Some("从上次进度继续排查"),
        "cancelled" => Some("任务已取消"),
        "verifying" | "repair" | "review" | "running" => Some("执行中"),
        _ => None,
    };
    let _ = crate::agent_memory::update_checkpoint(
        ckpt_id,
        Some(&task.status),
        Some(&task.goal),
        Some(&changed),
        Some(&pending),
        next,
        last_event_id,
    );
}

fn commit_event(
    conn: &mut Connection,
    task: &TaskRow,
    kind: &str,
    tool_name: Option<&str>,
    payload: Value,
) -> Result<TaskRow, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let ev = append_event_and_update_task(&tx, task, kind, tool_name, payload)?;
    let updated = get_task(&tx, &task.task_id)?.ok_or("missing")?;
    tx.commit().map_err(|e| e.to_string())?;
    sync_memory_checkpoint(&updated, Some(&ev.event_id));
    Ok(updated)
}

fn load_scope(task: &TaskRow) -> Result<WorkspaceScope, String> {
    let mut scope = scope::open_workspace(PathBuf::from(&task.workspace_root).as_path())?;
    // Keep start-time baseline for write gate (not live dirty).
    scope.baseline_dirty = store::parse_string_list(&task.baseline_dirty_json);
    Ok(scope)
}

fn fingerprints_map(task: &TaskRow) -> HashMap<String, String> {
    serde_json::from_str(&task.fingerprints_json).unwrap_or_default()
}

fn set_fingerprint(task: &mut TaskRow, path: &str, file_hash: &str) {
    let mut m = fingerprints_map(task);
    m.insert(path.to_string(), file_hash.to_string());
    task.fingerprints_json = serde_json::to_string(&m).unwrap_or_else(|_| "{}".into());
}

fn last_file_hash(task: &TaskRow, path: &str) -> Option<String> {
    fingerprints_map(task).get(path).cloned()
}

fn applied_tokens(task: &TaskRow) -> Vec<String> {
    store::parse_string_list(&task.applied_tokens_json)
}

fn push_applied_token(task: &mut TaskRow, token: &str) {
    let mut v = applied_tokens(task);
    if !v.iter().any(|t| t == token) {
        v.push(token.to_string());
    }
    task.applied_tokens_json = serde_json::to_string(&v).unwrap_or_else(|_| "[]".into());
}

fn push_changed(task: &mut TaskRow, path: &str) {
    let mut v = store::parse_string_list(&task.changed_files_json);
    if !v.iter().any(|p| p == path) {
        v.push(path.to_string());
    }
    task.changed_files_json = serde_json::to_string(&v).unwrap_or_else(|_| "[]".into());
}

/// Snapshot needed to call the model outside the ATR write lock.
pub struct TurnPrep {
    pub task: TaskRow,
    pub messages: Vec<Value>,
    pub recent: String,
}

pub fn prep_turn(conn: &Connection, task_id: &str, recent: &str) -> Result<Option<TurnPrep>, String> {
    let task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    if task.status == TaskStatus::Waiting.as_str()
        || task.status == TaskStatus::Done.as_str()
        || task.status == TaskStatus::Failed.as_str()
        || task.status == TaskStatus::Cancelled.as_str()
        || task.status == TaskStatus::Interrupted.as_str()
    {
        return Ok(None);
    }
    if task.current_turn >= MAX_TURNS {
        return Ok(None);
    }
    let events = list_events(conn, task_id)?;
    let tool_trace = prompts::tool_trace_from_events(&events);
    let messages = prompts::build_messages(&task, recent, &tool_trace);
    Ok(Some(TurnPrep {
        task,
        messages,
        recent: recent.to_string(),
    }))
}

/// Apply one model raw tool-call JSON (write lock held by caller).
pub fn apply_raw_tool_turn(
    conn: &mut Connection,
    task_id: &str,
    raw: &str,
    recent: &mut String,
) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    if task.status == TaskStatus::Waiting.as_str()
        || task.status == TaskStatus::Done.as_str()
        || task.status == TaskStatus::Failed.as_str()
        || task.status == TaskStatus::Cancelled.as_str()
        || task.status == TaskStatus::Interrupted.as_str()
    {
        return Ok(task);
    }
    if task.current_turn >= MAX_TURNS {
        return fail_task(conn, task_id, "max_turns");
    }
    task.current_turn = task.current_turn.saturating_add(1);
    let calls = match parse::parse_tool_calls(raw, MAX_TOOL_JSON_DEPTH) {
        Ok(c) => {
            task.format_retry_count = 0;
            c
        }
        Err(e) if e.retriable_format() && task.format_retry_count < MAX_FORMAT_RETRIES => {
            task.format_retry_count += 1;
            let updated = commit_event(
                conn,
                &task,
                "format_retry",
                None,
                json!({"error": e.as_str(), "raw": raw.chars().take(500).collect::<String>()}),
            )?;
            *recent = format!("format_error:{}", e.as_str());
            return Ok(updated);
        }
        Err(e) => {
            // Don't dump model monologue into lastError (FE would show it as the failure text).
            let reason = if e.retriable_format() {
                format!("parse_{}", e.as_str())
            } else {
                format!(
                    "parse_{}: {}",
                    e.as_str(),
                    raw.chars().take(120).collect::<String>()
                )
            };
            return fail_task(conn, task_id, &reason);
        }
    };
    if calls.is_empty() {
        return Err(ParseError::UnsupportedShape.as_str().into());
    }
    // Models often emit a tool_calls[] batch — execute the highest-value one only.
    let call = prefer_tool_call(calls);
    // Surface WorkBuddy decision + short model excerpt for the live steps window.
    let excerpt: String = raw.chars().take(600).collect();
    let sig = tool_call_sig(&call);
    // Drive uses maxSteps=1 so `recent` resets each IPC — also count trailing tool_call events.
    let next_n = next_identical_count(recent, &sig)
        .max(identical_tool_streak_from_events(conn, task_id, &call)?);
    if next_n >= MAX_IDENTICAL_TOOL {
        return fail_task(conn, task_id, "stuck_loop");
    }
    let _ = commit_event(
        conn,
        &task,
        "tool_call",
        Some(&call.name),
        json!({
            "arguments": call.arguments.clone(),
            "modelExcerpt": excerpt,
        }),
    )?;
    let out = match dispatch_tool(conn, &mut task, &call, recent) {
        Ok(Some(updated)) => Ok(updated),
        Ok(None) => get_task(conn, task_id)?.ok_or_else(|| "task_not_found".into()),
        Err(e) => {
            if is_fatal_tool_error(&e) {
                return fail_task(conn, task_id, &e);
            }
            let msg = map_tool_error_for_call(&call, &e);
            let mut t = get_task(conn, task_id)?.ok_or("task_not_found")?;
            t.last_error = Some(msg.clone());
            let updated = commit_event(
                conn,
                &t,
                "tool_error",
                Some(&call.name),
                json!({"error": msg}),
            )?;
            *recent = format!("tool_error:{msg}");
            Ok(updated)
        }
    };
    stamp_identical(recent, next_n, &sig);
    out
}

pub fn mark_cancelled_public(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String> {
    mark_cancelled(conn, task_id)
}

pub fn fail_task_public(conn: &mut Connection, task_id: &str, reason: &str) -> Result<TaskRow, String> {
    fail_task(conn, task_id, reason)
}

pub fn run_until_idle(
    conn: &mut Connection,
    task_id: &str,
    driver: &mut dyn ModelDriver,
) -> Result<TaskRow, String> {
    let cancel_tok = cancel::get(task_id).unwrap_or_else(TaskCancel::new);
    let mut recent = String::new();
    loop {
        if cancel_tok.is_cancelled() {
            return mark_cancelled(conn, task_id);
        }
        let Some(prep) = prep_turn(conn, task_id, &recent)? else {
            let task = get_task(conn, task_id)?.ok_or("task_not_found")?;
            if task.current_turn >= MAX_TURNS
                && task.status != TaskStatus::Waiting.as_str()
                && task.status != TaskStatus::Done.as_str()
                && task.status != TaskStatus::Failed.as_str()
                && task.status != TaskStatus::Cancelled.as_str()
                && task.status != TaskStatus::Interrupted.as_str()
            {
                return fail_task(conn, task_id, "max_turns");
            }
            return Ok(task);
        };
        let raw = match driver.next_tool_json(&prep.task, &prep.messages) {
            Ok(s) => s,
            Err(e) => return fail_task(conn, task_id, &e),
        };
        if cancel_tok.is_cancelled() {
            return mark_cancelled(conn, task_id);
        }
        let updated = apply_raw_tool_turn(conn, task_id, &raw, &mut recent)?;
        if updated.status == TaskStatus::Waiting.as_str()
            || updated.status == TaskStatus::Done.as_str()
            || updated.status == TaskStatus::Failed.as_str()
            || updated.status == TaskStatus::Cancelled.as_str()
            || updated.status == TaskStatus::Interrupted.as_str()
        {
            return Ok(updated);
        }
    }
}

fn dispatch_tool(
    conn: &mut Connection,
    task: &mut TaskRow,
    call: &ToolCall,
    recent: &mut String,
) -> Result<Option<TaskRow>, String> {
    let scope = load_scope(task)?;
    task.tool_call_count = task.tool_call_count.saturating_add(1);
    let args = &call.arguments;

    match call.name.as_str() {
        "inspect_workspace" => {
            let result = tools::inspect_workspace(&scope);
            let payload = json!({"result": result});
            note_tool_result(recent, "inspect_workspace", &payload);
            persist_tool(conn, task, &call.name, payload)?;
        }
        "search_code" => {
            let q = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let result = tools::search_code(&scope, q)?;
            let payload = json!({"result": result});
            note_tool_result(recent, "search_code", &payload);
            persist_tool(conn, task, &call.name, payload)?;
        }
        "read_file" => {
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing_path")?;
            let start = args.get("start_line").and_then(|v| v.as_u64()).map(|x| x as u32);
            let end = args.get("end_line").and_then(|v| v.as_u64()).map(|x| x as u32);
            let (fp, result) = tools::read_file(&scope, path, start, end)?;
            set_fingerprint(task, &fp.path, &fp.file_hash);
            let payload = json!({"result": result});
            note_tool_result(recent, "read_file", &payload);
            persist_tool(conn, task, &call.name, payload)?;
        }
        "propose_changes" => {
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing_path")?;
            let rationale = args
                .get("rationale")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let new_content = args
                .get("new_content")
                .and_then(|v| v.as_str())
                .ok_or("missing_new_content")?;
            let risk = args.get("risk").and_then(|v| v.as_str()).unwrap_or("low");
            let result = tools::propose_changes(&scope, path, rationale, new_content, risk)?;
            // Must NOT touch changed_files.
            let payload = json!({"result": result});
            note_tool_result(recent, "propose_changes", &payload);
            persist_tool(conn, task, &call.name, payload)?;
        }
        "apply_patch" => {
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing_path")?;
            let new_content = args
                .get("new_content")
                .and_then(|v| v.as_str())
                .ok_or("missing_new_content")?;
            let allow_dirty = args
                .get("allow_dirty")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let mode = PermissionMode::parse(&task.permission_mode)
                .unwrap_or(PermissionMode::WriteWithApproval);
            if mode == PermissionMode::ReadOnly {
                return Err("write_denied_read_only".into());
            }
            // Write modes: dirty baseline pauses (approval) or writes (autonomous).
            // Never hard-fail baseline_dirty — that loops until max_turns with nothing on disk.
            let allow_dirty_eff = allow_dirty
                || matches!(
                    mode,
                    PermissionMode::WriteWithApproval | PermissionMode::WriteAutonomous
                );
            let mut last_hash = last_file_hash(task, path);
            // Existing file without prior read → auto-read once (models loop on must_read_before_apply).
            if last_hash.is_none() {
                if let Ok(abs) = scope::resolve_in_root(&scope.root, path) {
                    if abs.is_file() {
                        let (fp, result) = tools::read_file(&scope, path, None, None)?;
                        set_fingerprint(task, &fp.path, &fp.file_hash);
                        if fp.path != path {
                            set_fingerprint(task, path, &fp.file_hash);
                        }
                        last_hash = Some(fp.file_hash.clone());
                        let payload = json!({
                            "result": result,
                            "autoBeforeApply": true,
                        });
                        note_tool_result(recent, "read_file", &payload);
                        persist_tool(conn, task, "read_file", payload)?;
                    }
                }
            }
            let version = task.tool_call_count;
            let pending = tools::build_pending_patch(
                &task.task_id,
                &scope,
                path,
                new_content,
                version,
                allow_dirty_eff,
                last_hash.as_deref(),
            )?;
            if mode == PermissionMode::WriteWithApproval {
                let baseline_dirty = scope::is_baseline_dirty(&scope, &pending.path);
                task.status = TaskStatus::Waiting.as_str().into();
                task.waiting_reason = Some("approval".into());
                task.pending_approval_token = Some(pending.approval_token.clone());
                task.pending_patch_json =
                    Some(serde_json::to_string(&pending).unwrap_or_else(|_| "{}".into()));
                *recent = "waiting_approval".into();
                let updated = commit_event(
                    conn,
                    task,
                    "waiting_approval",
                    Some("apply_patch"),
                    json!({
                        "path": pending.path,
                        "approvalToken": pending.approval_token,
                        "patchHash": pending.patch_hash,
                        "patchVersion": pending.patch_version,
                        "targetFileHash": pending.target_file_hash,
                        "baselineDirty": baseline_dirty,
                    }),
                )?;
                return Ok(Some(updated));
            }
            // Autonomous write — same patch_applied event as the approve path (UI/gate look for it).
            let result = tools::apply_pending_patch(&scope, &pending)?;
            push_changed(task, &pending.path);
            push_applied_token(task, &pending.approval_token);
            set_fingerprint(
                task,
                &pending.path,
                result
                    .get("newFileHash")
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            );
            task.status = TaskStatus::Verifying.as_str().into();
            *recent = "patch_applied".into();
            let updated = commit_event(
                conn,
                task,
                "patch_applied",
                Some("apply_patch"),
                json!({"result": result}),
            )?;
            return Ok(Some(updated));
        }
        "export_to_desktop" => {
            let mode = PermissionMode::parse(&task.permission_mode)
                .unwrap_or(PermissionMode::WriteWithApproval);
            if mode == PermissionMode::ReadOnly {
                return Err("write_denied_read_only".into());
            }
            let path = args.get("path").and_then(|v| v.as_str()).ok_or("missing_path")?;
            let result = tools::export_to_desktop(&scope, path)?;
            *recent = "exported_desktop".into();
            let updated = commit_event(
                conn,
                task,
                "exported_desktop",
                Some("export_to_desktop"),
                json!({"result": result}),
            )?;
            return Ok(Some(updated));
        }
        "run_check" => {
            let check_id = args
                .get("check_id")
                .and_then(|v| v.as_str())
                .ok_or("missing_check_id")?;
            task.status = TaskStatus::Verifying.as_str().into();
            let result = tools::run_check_by_id(&scope, check_id)?;
            let ok = result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            if ok {
                task.status = TaskStatus::Review.as_str().into();
            } else {
                task.repair_count = task.repair_count.saturating_add(1);
                if task.repair_count > MAX_REPAIR {
                    task.status = TaskStatus::Failed.as_str().into();
                    task.last_error = Some("max_repair".into());
                } else {
                    task.status = TaskStatus::Repair.as_str().into();
                }
            }
            *recent = format!("run_check {check_id} ok={ok}");
            persist_tool(conn, task, &call.name, json!({"result": result}))?;
            if task.status == TaskStatus::Failed.as_str() {
                let updated = get_task(conn, &task.task_id)?.ok_or("missing")?;
                return Ok(Some(updated));
            }
        }
        "inspect_diff" => {
            let changed = store::parse_string_list(&task.changed_files_json);
            let result = tools::inspect_diff(&scope, &changed);
            *recent = "inspect_diff ok".into();
            persist_tool(conn, task, &call.name, json!({"result": result}))?;
        }
        "request_user_input" => {
            let q = args
                .get("question")
                .and_then(|v| v.as_str())
                .unwrap_or("need input");
            task.status = TaskStatus::Waiting.as_str().into();
            task.waiting_reason = Some("user_input".into());
            *recent = "waiting_user".into();
            let updated = commit_event(
                conn,
                task,
                "waiting_user",
                Some("request_user_input"),
                json!({"question": q}),
            )?;
            return Ok(Some(updated));
        }
        "finish" => {
            task.status = TaskStatus::Done.as_str().into();
            task.waiting_reason = None;
            let summary = args
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("done");
            *recent = "done".into();
            let updated = commit_event(
                conn,
                task,
                "done",
                Some("finish"),
                json!({"summary": summary}),
            )?;
            cancel::finish(&task.task_id);
            return Ok(Some(updated));
        }
        _ => return Err("unknown_tool".into()),
    }
    Ok(Some(get_task(conn, &task.task_id)?.ok_or("missing")?))
}

fn persist_tool(
    conn: &mut Connection,
    task: &TaskRow,
    tool: &str,
    payload: Value,
) -> Result<(), String> {
    let _ = commit_event(conn, task, "tool_result", Some(tool), payload)?;
    Ok(())
}

fn is_fatal_tool_error(e: &str) -> bool {
    matches!(
        e,
        "baseline_dirty_requires_approval" | "write_denied_read_only"
    )
}

fn prefer_tool_call(calls: Vec<parse::ToolCall>) -> parse::ToolCall {
    const RANK: &[&str] = &[
        "finish",
        "export_to_desktop",
        "apply_patch",
        "propose_changes",
        "request_user_input",
        "run_check",
        "inspect_diff",
        "read_file",
        "search_code",
        "inspect_workspace",
    ];
    let mut best_i = 0usize;
    let mut best_rank = usize::MAX;
    for (i, c) in calls.iter().enumerate() {
        let r = RANK.iter().position(|n| *n == c.name).unwrap_or(90);
        if r < best_rank {
            best_rank = r;
            best_i = i;
        }
    }
    calls.into_iter().nth(best_i).expect("non-empty tool_calls")
}

fn map_tool_error(e: &str) -> String {
    if e == "outside_root" {
        "outside_root: apply_patch 只能写工作区内文件。放到桌面请用 export_to_desktop{path}（path 为工作区内已有文件）"
            .into()
    } else {
        e.into()
    }
}

fn map_tool_error_for_call(call: &parse::ToolCall, e: &str) -> String {
    if call.name == "read_file" && e == "not_found" {
        let path = call
            .arguments
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("?");
        return format!(
            "not_found:{path} — 文件不存在。新建请立刻 propose_changes{{path,new_content}}（无需再 search/read），然后 apply_patch；若目标含桌面再 export_to_desktop{{path}}"
        );
    }
    map_tool_error(e)
}

/// Compact tool result for the in-loop `recent` note (full payload lives in tool_trace events).
fn note_tool_result(recent: &mut String, tool: &str, payload: &Value) {
    let raw = serde_json::to_string(payload).unwrap_or_default();
    let body: String = raw.chars().take(2_500).collect();
    *recent = format!("{tool} {body}");
}

pub fn approve_patch(
    conn: &mut Connection,
    task_id: &str,
    token: &str,
    persist_autonomous: bool,
) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    // Idempotent: already-applied token succeeds even after leaving waiting.
    if applied_tokens(&task).iter().any(|t| t == token) {
        return Ok(task);
    }
    if task.status != TaskStatus::Waiting.as_str() {
        return Err("not_waiting".into());
    }
    let expected = task
        .pending_approval_token
        .clone()
        .ok_or("no_pending_token")?;
    if expected != token {
        return Err("token_mismatch".into());
    }
    let pending: PendingPatch = serde_json::from_str(
        task.pending_patch_json
            .as_deref()
            .ok_or("no_pending_patch")?,
    )
    .map_err(|e| format!("pending_patch_json: {e}"))?;
    // Re-bind must match — stale token if any component changed
    let rebound = tools::bind_approval_token(
        &task.task_id,
        &pending.patch_hash,
        &pending.target_file_hash,
        pending.patch_version,
    );
    if rebound != token || pending.approval_token != token {
        return Err("token_stale".into());
    }
    // 同意这次 / 同意所有：本任务剩余写入不再询问。persist_autonomous 只影响「以后新任务」
    //（由前端写入 localStorage）；这里始终把当前任务切到 autonomous。
    let _ = persist_autonomous;
    task.permission_mode = PermissionMode::WriteAutonomous.as_str().into();
    let scope = load_scope(&task)?;
    let result = match tools::apply_pending_patch(&scope, &pending) {
        Ok(r) => r,
        Err(e) => {
            // Failed apply: clear pending, require re-read
            task.pending_approval_token = None;
            task.pending_patch_json = None;
            task.status = TaskStatus::Running.as_str().into();
            task.waiting_reason = None;
            task.last_error = Some(e.clone());
            return commit_event(
                conn,
                &task,
                "patch_failed",
                Some("apply_patch"),
                json!({"error": e}),
            );
        }
    };
    push_changed(&mut task, &pending.path);
    push_applied_token(&mut task, token);
    if let Some(h) = result.get("newFileHash").and_then(|v| v.as_str()) {
        set_fingerprint(&mut task, &pending.path, h);
    }
    task.pending_approval_token = None;
    task.pending_patch_json = None;
    task.status = TaskStatus::Verifying.as_str().into();
    task.waiting_reason = None;
    commit_event(
        conn,
        &task,
        "patch_applied",
        Some("apply_patch"),
        json!({"result": result, "approvalToken": token}),
    )
}

/// Reject pending patch: clear pending, stay on task, resume running.
pub fn reject_patch(conn: &mut Connection, task_id: &str, token: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    if task.status != TaskStatus::Waiting.as_str() {
        return Err("not_waiting".into());
    }
    let expected = task
        .pending_approval_token
        .clone()
        .ok_or("no_pending_token")?;
    if expected != token {
        return Err("token_mismatch".into());
    }
    task.pending_approval_token = None;
    task.pending_patch_json = None;
    task.status = TaskStatus::Running.as_str().into();
    task.waiting_reason = None;
    commit_event(
        conn,
        &task,
        "patch_rejected",
        Some("apply_patch"),
        json!({"approvalToken": token}),
    )
}

pub fn submit_user_input(
    conn: &mut Connection,
    task_id: &str,
    text: &str,
) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    if task.status != TaskStatus::Waiting.as_str() {
        return Err("not_waiting".into());
    }
    task.status = TaskStatus::Running.as_str().into();
    task.waiting_reason = None;
    commit_event(conn, &task, "user_input", None, json!({"text": text}))
}

fn mark_cancelled(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    task.status = TaskStatus::Cancelled.as_str().into();
    let updated = commit_event(conn, &task, "cancelled", None, json!({}))?;
    cancel::finish(task_id);
    Ok(updated)
}

fn tool_call_sig(call: &ToolCall) -> String {
    let args = serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".into());
    format!("{}:{}", call.name, args)
}

/// `recent` may be `repeat:N###sig###note` (set after prior turn) or a plain tool note.
fn parse_identical(recent: &str) -> (u32, String) {
    let Some(rest) = recent.strip_prefix("repeat:") else {
        return (0, String::new());
    };
    let mut parts = rest.splitn(3, "###");
    let n = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let sig = parts.next().unwrap_or("").to_string();
    (n, sig)
}

fn identical_tool_streak_from_events(
    conn: &Connection,
    task_id: &str,
    call: &ToolCall,
) -> Result<u32, String> {
    let events = list_events(conn, task_id)?;
    let mut n = 1u32;
    for e in events.iter().rev() {
        if e.kind != "tool_call" {
            continue;
        }
        if e.tool_name.as_deref() != Some(call.name.as_str()) {
            break;
        }
        if e.payload.get("arguments") != Some(&call.arguments) {
            break;
        }
        n = n.saturating_add(1);
        if n >= MAX_IDENTICAL_TOOL {
            break;
        }
    }
    Ok(n)
}

fn next_identical_count(recent: &str, sig: &str) -> u32 {
    let (n, prev) = parse_identical(recent);
    if prev == sig {
        n.saturating_add(1)
    } else {
        1
    }
}

/// Keep the tool note (set by dispatch) while recording identical-call streak.
fn stamp_identical(recent: &mut String, n: u32, sig: &str) {
    let note = if recent.starts_with("repeat:") {
        recent
            .splitn(3, "###")
            .nth(2)
            .unwrap_or("")
            .to_string()
    } else {
        recent.clone()
    };
    *recent = format!("repeat:{n}###{sig}###{note}");
}

/// Map driver / parse failure strings to a durable ATR event kind.
/// Timeline + replay use these so restart can explain why the task stopped.
pub fn classify_drive_failure(reason: &str) -> &'static str {
    let r = reason.to_ascii_lowercase();
    if r == "rate_limited" || r.contains("429") || r.contains("rate_limit") || r.contains("quota")
    {
        return "rate_limited";
    }
    if r == "max_turns" || r == "stuck_loop" {
        return "budget_exhausted";
    }
    if r.starts_with("parse_")
        || r.contains("format_error")
        || r.contains("no_tool_calls")
        || r.contains("unsupported_shape")
        || r.contains("invalid_args")
        || r.contains("unknown_tool")
    {
        return "format_error";
    }
    if r.contains("http")
        || r.contains("timeout")
        || r.contains("timed out")
        || r == "no_key"
        || r == "deepseek_unavailable"
        || r.contains("body:")
        || r.contains("connect")
        || r.contains("network")
    {
        return "model_error";
    }
    "failed"
}

fn fail_task(conn: &mut Connection, task_id: &str, reason: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    task.status = TaskStatus::Failed.as_str().into();
    task.last_error = Some(reason.into());
    let class = classify_drive_failure(reason);
    let updated = commit_event(
        conn,
        &task,
        class,
        None,
        json!({"reason": reason, "class": class}),
    )?;
    cancel::finish(task_id);
    Ok(updated)
}

pub fn public_events(conn: &Connection, task_id: &str) -> Result<Vec<super::contracts::TaskEventDto>, String> {
    list_events(conn, task_id)
}

/// Happy-path scripted steps for Slice A (relative to a prepared workspace file).
pub fn happy_path_fake_steps(rel_path: &str, new_content: &str) -> FakeDriver {
    let path_json = serde_json::to_string(rel_path).unwrap();
    let content_json = serde_json::to_string(new_content).unwrap();
    FakeDriver {
        steps: vec![
            r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
            format!(r#"{{"tool":"read_file","arguments":{{"path":{path_json}}}}}"#),
            format!(
                r#"{{"tool":"propose_changes","arguments":{{"path":{path_json},"rationale":"test","new_content":{content_json},"risk":"low"}}}}"#
            ),
            format!(
                r#"{{"tool":"apply_patch","arguments":{{"path":{path_json},"new_content":{content_json}}}}}"#
            ),
        ],
        idx: 0,
    }
}

/// Apply existing file without an explicit read_file — engine should auto-read.
pub fn apply_without_read_fake_steps(rel_path: &str, new_content: &str) -> FakeDriver {
    let path_json = serde_json::to_string(rel_path).unwrap();
    let content_json = serde_json::to_string(new_content).unwrap();
    FakeDriver {
        steps: vec![
            r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
            format!(
                r#"{{"tool":"apply_patch","arguments":{{"path":{path_json},"new_content":{content_json}}}}}"#
            ),
        ],
        idx: 0,
    }
}

/// Apply one existing file (no inspect) — used after 同意这次 to prove remaining writes skip the gate.
pub fn apply_only_fake_steps(rel_path: &str, new_content: &str) -> FakeDriver {
    let path_json = serde_json::to_string(rel_path).unwrap();
    let content_json = serde_json::to_string(new_content).unwrap();
    FakeDriver {
        steps: vec![format!(
            r#"{{"tool":"apply_patch","arguments":{{"path":{path_json},"new_content":{content_json}}}}}"#
        )],
        idx: 0,
    }
}

/// Copy a workspace file to the test desktop dir.
pub fn export_desktop_fake_steps(rel_path: &str) -> FakeDriver {
    let path_json = serde_json::to_string(rel_path).unwrap();
    FakeDriver {
        steps: vec![
            r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
            format!(r#"{{"tool":"export_to_desktop","arguments":{{"path":{path_json}}}}}"#),
        ],
        idx: 0,
    }
}

/// Create a missing file (no read_file) — README-style goals.
pub fn create_file_fake_steps(rel_path: &str, new_content: &str) -> FakeDriver {
    let path_json = serde_json::to_string(rel_path).unwrap();
    let content_json = serde_json::to_string(new_content).unwrap();
    FakeDriver {
        steps: vec![
            r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
            format!(
                r#"{{"tool":"propose_changes","arguments":{{"path":{path_json},"rationale":"create","new_content":{content_json},"risk":"low"}}}}"#
            ),
            format!(
                r#"{{"tool":"apply_patch","arguments":{{"path":{path_json},"new_content":{content_json}}}}}"#
            ),
        ],
        idx: 0,
    }
}

pub fn after_approve_check_steps(check_id: &str) -> FakeDriver {
    let id = serde_json::to_string(check_id).unwrap();
    FakeDriver {
        steps: vec![
            format!(r#"{{"tool":"run_check","arguments":{{"check_id":{id}}}}}"#),
            r#"{"tool":"finish","arguments":{"summary":"ok"}}"#.into(),
        ],
        idx: 0,
    }
}

/// After approve: first check fails → repair → second check ok → finish.
pub fn after_approve_repair_then_ok_steps(fail_id: &str, ok_id: &str) -> FakeDriver {
    let fail = serde_json::to_string(fail_id).unwrap();
    let ok = serde_json::to_string(ok_id).unwrap();
    FakeDriver {
        steps: vec![
            format!(r#"{{"tool":"run_check","arguments":{{"check_id":{fail}}}}}"#),
            format!(r#"{{"tool":"run_check","arguments":{{"check_id":{ok}}}}}"#),
            r#"{"tool":"finish","arguments":{"summary":"repaired"}}"#.into(),
        ],
        idx: 0,
    }
}

#[cfg(test)]
mod classify_tests {
    use super::classify_drive_failure;

    #[test]
    fn classifies_drive_failures() {
        assert_eq!(classify_drive_failure("rate_limited"), "rate_limited");
        assert_eq!(classify_drive_failure("http_status_429"), "rate_limited");
        assert_eq!(classify_drive_failure("parse_invalid_args: x"), "format_error");
        assert_eq!(classify_drive_failure("no_tool_calls"), "format_error");
        assert_eq!(classify_drive_failure("http: timeout"), "model_error");
        assert_eq!(classify_drive_failure("no_key"), "model_error");
        assert_eq!(classify_drive_failure("max_turns"), "budget_exhausted");
        assert_eq!(classify_drive_failure("stuck_loop"), "budget_exhausted");
    }

    #[test]
    fn identical_tool_trips_stuck_loop() {
        use super::{next_identical_count, stamp_identical, tool_call_sig, ToolCall, MAX_IDENTICAL_TOOL};
        use serde_json::json;

        let call = ToolCall {
            name: "inspect_workspace".into(),
            arguments: json!({}),
        };
        let sig = tool_call_sig(&call);
        let mut recent = String::new();
        let n1 = next_identical_count(&recent, &sig);
        assert_eq!(n1, 1);
        assert!(n1 < MAX_IDENTICAL_TOOL);
        recent = "inspect_workspace ok".into();
        stamp_identical(&mut recent, n1, &sig);

        let n2 = next_identical_count(&recent, &sig);
        assert_eq!(n2, 2);
        stamp_identical(&mut recent, n2, &sig);

        let n3 = next_identical_count(&recent, &sig);
        assert_eq!(n3, 3);
        assert!(n3 >= MAX_IDENTICAL_TOOL);
    }

    #[test]
    fn prefer_write_tools_over_explore() {
        use super::{prefer_tool_call, ToolCall};
        use serde_json::json;

        let picked = prefer_tool_call(vec![
            ToolCall {
                name: "search_code".into(),
                arguments: json!({"query": "readme2"}),
            },
            ToolCall {
                name: "read_file".into(),
                arguments: json!({"path": "README2.md"}),
            },
            ToolCall {
                name: "propose_changes".into(),
                arguments: json!({"path": "README2.md", "new_content": "# hi"}),
            },
        ]);
        assert_eq!(picked.name, "propose_changes");

        let export = prefer_tool_call(vec![
            ToolCall {
                name: "read_file".into(),
                arguments: json!({"path": "README.md"}),
            },
            ToolCall {
                name: "export_to_desktop".into(),
                arguments: json!({"path": "README2.md"}),
            },
        ]);
        assert_eq!(export.name, "export_to_desktop");
    }

    #[test]
    fn not_found_read_maps_to_create_hint() {
        use super::{map_tool_error_for_call, ToolCall};
        use serde_json::json;

        let call = ToolCall {
            name: "read_file".into(),
            arguments: json!({"path": "README2.md"}),
        };
        let msg = map_tool_error_for_call(&call, "not_found");
        assert!(msg.contains("README2.md"), "{msg}");
        assert!(msg.contains("propose_changes"), "{msg}");
        assert!(msg.contains("export_to_desktop"), "{msg}");
    }
}
