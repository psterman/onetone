//! 候选决策：接受 → 写入 memory_records；拒绝 → 仅改状态；人工录入 → 直接写入。

use crate::agent_memory::{list_memories_by_type, upsert_memory, MemoryRecordDto};

use super::model::{
    Candidate, KIND_MANUAL, MEMORY_TYPE_INSTRUCTION, STATUS_ACCEPTED, STATUS_REJECTED, STATUS_STALE,
    ALL_SECTIONS,
};
use super::store::{candidate_by_id, list_candidates, set_candidate_status, upsert_candidate};

/// 条目在说明书里的归属信息。
///
/// **section 不能只存在候选表里** —— 人工录入的 memory 正文是干净的（没有 `[section]` 前缀），
/// 渲染时必须能从 memory 行反查回它的段落。因此这里提供唯一反查入口：
/// 1. 先按 `source_event_id`（被接受的候选 id）查；
/// 2. 查不到再按 `accepted_memory_id` 扫一遍（人工录入路径没有 `source_event_id`）。
#[derive(Debug, Clone)]
pub struct InstructionSource {
    pub section: String,
    pub origin_kind: String,
}

pub fn instruction_source_for(
    project_id: &str,
    memory_id: &str,
    source_event_id: Option<&str>,
) -> Option<InstructionSource> {
    if let Some(sid) = source_event_id.filter(|s| !s.is_empty()) {
        if let Ok(Some(c)) = candidate_by_id(sid) {
            return Some(InstructionSource {
                section: c.section,
                origin_kind: c.kind,
            });
        }
    }
    let all = list_candidates(project_id, None).ok()?;
    let c = all
        .into_iter()
        .find(|c| c.accepted_memory_id.as_deref() == Some(memory_id))?;
    Some(InstructionSource {
        section: c.section,
        origin_kind: c.kind,
    })
}

fn valid_section(section: &str) -> bool {
    ALL_SECTIONS.contains(&section)
}

/// 接受候选 → 写入 memory_records（type=instruction，source_event_id=candidate_id）。
pub fn accept_candidate(candidate_id: &str) -> Result<String, String> {
    let cand = candidate_by_id(candidate_id)?
        .ok_or_else(|| format!("candidate_not_found: {candidate_id}"))?;
    let memory = upsert_memory(
        &cand.project_id,
        None,
        MEMORY_TYPE_INSTRUCTION,
        &cand.proposed_content,
        Some(&cand.candidate_id),
        Some(cand.confidence),
        None,
        false,
    )?;
    set_candidate_status(candidate_id, STATUS_ACCEPTED, Some(&memory.memory_id))?;
    Ok(memory.memory_id)
}

pub fn reject_candidate(candidate_id: &str) -> Result<(), String> {
    let cand = candidate_by_id(candidate_id)?
        .ok_or_else(|| format!("candidate_not_found: {candidate_id}"))?;
    set_candidate_status(&cand.candidate_id, STATUS_REJECTED, None)
}

/// 人工录入：直接写 memory_records（user_authored=true，无需 source_event_id）。
/// 同内容重复录入时 memory_id 相同 → 天然幂等。
pub fn add_manual(project_id: &str, section: &str, content: &str) -> Result<String, String> {
    if !valid_section(section) {
        return Err(format!("invalid section: {section}"));
    }
    let body = content.trim();
    if body.is_empty() {
        return Err("content empty".into());
    }
    let memory = upsert_memory(
        project_id,
        None,
        MEMORY_TYPE_INSTRUCTION,
        body,
        None,
        Some(0.9),
        None,
        true,
    )?;
    // 记一条 accepted 的 manual 候选用于追溯；内容相同则复用同一行。
    let now = crate::agent_memory::now_ms();
    upsert_candidate(&Candidate {
        candidate_id: super::store::candidate_id_for(project_id, KIND_MANUAL, section, body),
        project_id: project_id.into(),
        kind: KIND_MANUAL.into(),
        section: section.into(),
        proposed_content: body.into(),
        evidence_json: Some("{\"source\":\"manual\"}".into()),
        confidence: 0.9,
        status: STATUS_ACCEPTED.into(),
        accepted_memory_id: Some(memory.memory_id.clone()),
        created_at_ms: now,
        updated_at_ms: now,
    })?;
    Ok(memory.memory_id)
}

/// 漂移检测：derived 候选的 evidence 里存了当时的 source_version。
/// passport 的 source_version 变了 → 旧的 derived 条目标记 stale（**不改写正文**）。
pub fn mark_stale_candidates(project_id: &str, new_source_version: &str) -> Result<usize, String> {
    let cands = list_candidates(project_id, None)?;
    let mut marked = 0usize;
    for c in cands {
        if c.kind != super::model::KIND_DERIVED || c.status != STATUS_ACCEPTED {
            continue;
        }
        let Some(ev) = c.evidence_json.as_deref() else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(ev) else {
            continue;
        };
        let Some(old) = v.get("sourceVersion").and_then(|x| x.as_str()) else {
            continue;
        };
        if old != new_source_version {
            set_candidate_status(&c.candidate_id, STATUS_STALE, None)?;
            marked += 1;
        }
    }
    Ok(marked)
}

/// 列出某项目已确认的说明书条目（memory_records 里 type=instruction 的）。
///
/// **必须用 `list_memories_by_type`，不能用 `query_memory(project_id, "", 50)`**：
/// 空 query 会退化成 `list_recent_memory` —— 最近 50 条**所有类型**的记忆。
/// 项目里普通记忆一多，说明书条目就会被挤出窗口、被**静默丢弃**（规则少一条）。
pub fn confirmed_instructions(project_id: &str) -> Result<Vec<MemoryRecordDto>, String> {
    list_memories_by_type(project_id, MEMORY_TYPE_INSTRUCTION, 200)
}
