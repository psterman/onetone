//! 项目说明书 IPC（Batch A）。
//!
//! 读路径复用既有 project_context scope（用户确认 + 有限读取）。
//! 写路径一律「预览 → 显式确认 → 写盘」两段式。

use serde::Deserialize;
use std::path::Path;

use tauri::Window;

// contracts 是私有模块；用公开 re-export（与 Task 2 同类偏离）。
use crate::project_context::{ContextQuery, QueryArgs, QueryPayload};
use crate::project_instructions::apply::{plan_write, revert_block, write_block, ApplyOutcome};
use crate::project_instructions::decide::{
    accept_candidate, add_manual, confirmed_instructions, mark_stale_candidates, reject_candidate,
};
use crate::project_instructions::derive::derive_from_passport;
use crate::project_instructions::model::{
    Candidate, ALL_SECTIONS, KIND_DERIVED, KIND_SIGNAL, STATUS_ACCEPTED,
};
use crate::project_instructions::render::{build_doc, render_target};
use crate::project_instructions::signals::{default_probe_logs, hot_dir_candidates};
use crate::project_instructions::store::{candidate_id_for, list_candidates, upsert_candidate};
use crate::project_instructions::targets::{TargetDef, TARGETS};

fn window_label(window: &Window) -> String {
    window.label().to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsScopeArgs {
    pub scope_id: String,
    pub task_scope_id: String,
    pub request_id: String,
    pub project_id: String,
    /// 用户确认的项目根（绝对路径，仅后端使用，不外发）。
    pub project_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsListArgs {
    pub project_id: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsCandidateDecideArgs {
    pub candidate_id: String,
    pub accept: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsManualArgs {
    pub project_id: String,
    pub section: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsApplyArgs {
    pub project_id: String,
    pub project_root: String,
    pub target_id: String,
    pub content: String,
    pub consent_insert_into_existing: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsTargetArgs {
    pub project_id: String,
    pub project_root: String,
    pub target_id: String,
}

fn find_target(target_id: &str) -> Result<&'static TargetDef, String> {
    TARGETS
        .iter()
        .find(|t| t.id == target_id)
        .ok_or_else(|| format!("unknown target: {target_id}"))
}

/// 取 IR + 已确认条目。
#[tauri::command]
pub fn cmd_project_instructions_doc(
    project_id: String,
) -> Result<serde_json::Value, String> {
    let doc = build_doc(&project_id)?;
    Ok(serde_json::json!({
        "ok": true,
        "doc": doc,
        "targets": TARGETS,
    }))
}

#[tauri::command]
pub fn cmd_project_instructions_candidates(
    args: InstructionsListArgs,
) -> Result<serde_json::Value, String> {
    let list = list_candidates(&args.project_id, args.status.as_deref())?;
    Ok(serde_json::json!({ "ok": true, "candidates": list }))
}

/// accept / reject。accept 会写入 memory_records。
#[tauri::command]
pub fn cmd_project_instructions_candidate_decide(
    args: InstructionsCandidateDecideArgs,
) -> Result<serde_json::Value, String> {
    if args.accept {
        let memory_id = accept_candidate(&args.candidate_id)?;
        Ok(serde_json::json!({ "ok": true, "memoryId": memory_id }))
    } else {
        reject_candidate(&args.candidate_id)?;
        Ok(serde_json::json!({ "ok": true, "memoryId": serde_json::Value::Null }))
    }
}

#[tauri::command]
pub fn cmd_project_instructions_add_manual(
    args: InstructionsManualArgs,
) -> Result<serde_json::Value, String> {
    if !ALL_SECTIONS.contains(&args.section.as_str()) {
        return Err(format!("invalid section: {}", args.section));
    }
    let memory_id = add_manual(&args.project_id, &args.section, &args.content)?;
    Ok(serde_json::json!({ "ok": true, "memoryId": memory_id }))
}

/// 触发一次推导：passport（确定性）+ 根目录清单 + 探针 cwd 频次（统计信号）。
/// 全部走既有 scope，**不新增任何读取权限**。
#[tauri::command]
pub fn cmd_project_instructions_derive(
    window: Window,
    args: InstructionsScopeArgs,
) -> Result<serde_json::Value, String> {
    let label = window_label(&window);
    let passport_args = QueryArgs {
        scope_id: args.scope_id.clone(),
        task_scope_id: args.task_scope_id.clone(),
        request_id: format!("{}-passport", args.request_id),
        query: ContextQuery::Passport,
    };
    let passport = crate::project_context::run_query(&label, &passport_args)
        .map_err(|e| e.as_str().to_string())?;
    let QueryPayload::Passport { record } = passport.result else {
        return Err("unexpected query payload".into());
    };

    let list_args = QueryArgs {
        scope_id: args.scope_id.clone(),
        task_scope_id: args.task_scope_id.clone(),
        request_id: format!("{}-list", args.request_id),
        query: ContextQuery::ListFiles {
            relative_dir: String::new(),
        },
    };
    let listing = crate::project_context::run_query(&label, &list_args)
        .map_err(|e| e.as_str().to_string())?;
    let QueryPayload::ListFiles { items } = listing.result else {
        return Err("unexpected query payload".into());
    };

    let mut derived = derive_from_passport(&record, &items);
    // 探针日志按**进程 cwd** 定位（与探针脚本写日志的位置一致），
    // 热点目录再按项目根过滤 —— 两者不是同一个基准，别混用。
    derived.extend(hot_dir_candidates(
        Path::new(&args.project_root),
        &default_probe_logs(),
    ));

    let now = crate::agent_memory::now_ms();
    let mut created = 0usize;
    for d in derived {
        let kind = if d.evidence.get("source").and_then(|s| s.as_str()) == Some("hook_probe_cwd") {
            KIND_SIGNAL
        } else {
            KIND_DERIVED
        };
        let candidate = Candidate {
            candidate_id: candidate_id_for(&args.project_id, kind, d.section, &d.content),
            project_id: args.project_id.clone(),
            kind: kind.into(),
            section: d.section.into(),
            proposed_content: d.content,
            evidence_json: Some(d.evidence.to_string()),
            confidence: d.confidence,
            status: crate::project_instructions::model::STATUS_PENDING.into(),
            accepted_memory_id: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        upsert_candidate(&candidate)?;
        created += 1;
    }

    // 漂移检测：passport 的 source_version 变了 → 旧的 derived 条目标 stale。
    let stale = mark_stale_candidates(&args.project_id, &record.source_version)?;

    Ok(serde_json::json!({
        "ok": true,
        "candidates": created,
        "stale": stale,
        "sourceVersion": record.source_version,
    }))
}

/// 渲染预览（不改盘）。
#[tauri::command]
pub fn cmd_project_instructions_render_preview(
    project_id: String,
    target_id: String,
) -> Result<serde_json::Value, String> {
    let doc = build_doc(&project_id)?;
    let target = find_target(&target_id)?;
    Ok(serde_json::json!({
        "ok": true,
        "targetId": target_id,
        "pathLabel": target.relative_path,
        "content": render_target(&doc, target),
    }))
}

/// 写入预览（只评估，不写盘）。
#[tauri::command]
pub fn cmd_project_instructions_apply_preview(
    args: InstructionsApplyArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome: ApplyOutcome =
        plan_write(Path::new(&args.project_root), target, &args.content)?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 显式确认后写盘。
#[tauri::command]
pub fn cmd_project_instructions_apply_confirm(
    args: InstructionsApplyArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome = write_block(
        Path::new(&args.project_root),
        target,
        &args.content,
        args.consent_insert_into_existing.unwrap_or(false),
    )?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 撤回受管区块。
#[tauri::command]
pub fn cmd_project_instructions_revert(
    args: InstructionsTargetArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome = revert_block(Path::new(&args.project_root), target)?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 已确认条目列表（供前端「已确认条目区」）。
#[tauri::command]
pub fn cmd_project_instructions_confirmed(
    project_id: String,
) -> Result<serde_json::Value, String> {
    let rows = confirmed_instructions(&project_id)?;
    Ok(serde_json::json!({ "ok": true, "items": rows }))
}

/// 常量导出（前端用）。
#[tauri::command]
pub fn cmd_project_instructions_meta() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ok": true,
        "sections": ALL_SECTIONS,
        "statuses": [crate::project_instructions::model::STATUS_PENDING, STATUS_ACCEPTED],
        "targets": TARGETS,
    }))
}
