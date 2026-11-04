//! IR 构建与渲染。渲染器只认 IR，不认存储细节。

use super::decide::{confirmed_instructions, instruction_source_for, InstructionSource};
use super::model::{
    InstructionItem, InstructionSection, ProjectInstructionDoc, KIND_MANUAL, SECTION_BOUNDARIES,
    SECTION_COMMANDS, SECTION_GOTCHAS, SECTION_INVARIANTS, SECTION_MAP, SECTION_OVERVIEW,
};
use super::targets::{TargetDef, TARGET_AGENTS_MD, TARGET_CURSOR_MDC};

const SECTION_TITLES: &[(&str, &str)] = &[
    (SECTION_OVERVIEW, "技术栈与一句话简介"),
    (SECTION_COMMANDS, "命令"),
    (SECTION_MAP, "目录地图"),
    (SECTION_INVARIANTS, "硬性约束"),
    (SECTION_BOUNDARIES, "边界"),
    (SECTION_GOTCHAS, "已知坑位"),
];

fn title_for(key: &str) -> String {
    SECTION_TITLES
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, t)| (*t).to_string())
        .unwrap_or_else(|| key.to_string())
}

/// 条目的段落归属**不在正文里** —— 正文是干净的（人工录入没有任何前缀）。
/// 归属是候选表的属性，所以渲染必须走 `decide::instruction_source_for` 反查：
/// 先按 `source_event_id`（被接受的候选 id）找，再按 `accepted_memory_id` 兜底。
/// 反查不到时归入「已知坑位」并标记 manual —— 绝不因为找不到归属就丢弃条目。
fn section_and_origin(source: Option<&InstructionSource>) -> (String, String) {
    match source {
        Some(s) => (s.section.clone(), s.origin_kind.clone()),
        None => (SECTION_GOTCHAS.to_string(), KIND_MANUAL.to_string()),
    }
}

pub fn build_doc(project_id: &str) -> Result<ProjectInstructionDoc, String> {
    let rows = confirmed_instructions(project_id)?;
    let mut sections: Vec<InstructionSection> = SECTION_TITLES
        .iter()
        .map(|(k, _)| InstructionSection {
            key: (*k).to_string(),
            title: title_for(k),
            items: Vec::new(),
        })
        .collect();

    for row in rows {
        let source = instruction_source_for(
            project_id,
            &row.memory_id,
            row.source_event_id.as_deref(),
        );
        let (key, origin_kind) = section_and_origin(source.as_ref());
        let item = InstructionItem {
            text: row.content.trim().to_string(),
            origin_kind,
            memory_id: row.memory_id,
            confidence: row.confidence,
        };
        if let Some(s) = sections.iter_mut().find(|s| s.key == key) {
            s.items.push(item);
        } else {
            sections.push(InstructionSection {
                key: key.clone(),
                title: title_for(&key),
                items: vec![item],
            });
        }
    }

    Ok(ProjectInstructionDoc {
        project_id: project_id.to_string(),
        generated_at_ms: crate::agent_memory::now_ms(),
        sections: sections.into_iter().filter(|s| !s.items.is_empty()).collect(),
    })
}

pub fn render_doc(doc: &ProjectInstructionDoc) -> String {
    let mut out = String::new();
    out.push_str("# 项目约定\n");
    for section in &doc.sections {
        out.push_str("\n## ");
        out.push_str(&section.title);
        out.push('\n');
        for item in &section.items {
            out.push_str("- ");
            out.push_str(&item.text);
            out.push('\n');
        }
    }
    out
}

pub fn render_target(doc: &ProjectInstructionDoc, target: &TargetDef) -> String {
    match target.kind {
        TARGET_AGENTS_MD => render_doc(doc),
        TARGET_CURSOR_MDC => {
            let mut out = String::new();
            out.push_str("---\n");
            out.push_str("description: OneTone 生成的项目公共规则与坑位\n");
            out.push_str("alwaysApply: false\n");
            out.push_str("---\n\n");
            out.push_str("公共规则见 @AGENTS.md\n");
            out
        }
        _ => render_doc(doc),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_instructions::model::{KIND_DERIVED, KIND_MANUAL, SECTION_COMMANDS, SECTION_GOTCHAS};

    fn item(text: &str) -> InstructionItem {
        InstructionItem {
            text: text.to_string(),
            origin_kind: KIND_MANUAL.to_string(),
            memory_id: "m1".into(),
            confidence: 0.9,
        }
    }

    #[test]
    fn section_comes_from_candidate_lookup_not_content_prefix() {
        // 反查命中 → 用候选表给的段落与来源类型。
        let src = InstructionSource {
            section: SECTION_COMMANDS.to_string(),
            origin_kind: KIND_DERIVED.to_string(),
        };
        assert_eq!(
            section_and_origin(Some(&src)),
            (SECTION_COMMANDS.to_string(), KIND_DERIVED.to_string())
        );
        // 反查落空 → 归入 gotchas 且标记 manual，条目不丢。
        assert_eq!(
            section_and_origin(None),
            (SECTION_GOTCHAS.to_string(), KIND_MANUAL.to_string())
        );
    }

    #[test]
    fn renders_sections_and_items() {
        let doc = ProjectInstructionDoc {
            project_id: "p".into(),
            generated_at_ms: 0,
            sections: vec![
                InstructionSection {
                    key: SECTION_COMMANDS.into(),
                    title: "命令".into(),
                    items: vec![item("`dev` — vite")],
                },
                InstructionSection {
                    key: SECTION_GOTCHAS.into(),
                    title: "已知坑位".into(),
                    items: vec![item("worker.rs 双写")],
                },
            ],
        };
        let out = render_doc(&doc);
        assert!(out.contains("## 命令"));
        assert!(out.contains("- `dev` — vite"));
        assert!(out.contains("## 已知坑位"));
        assert!(out.contains("- worker.rs 双写"));
    }

    #[test]
    fn cursor_target_references_agents_md_instead_of_copying() {
        let doc = ProjectInstructionDoc {
            project_id: "p".into(),
            generated_at_ms: 0,
            sections: vec![InstructionSection {
                key: SECTION_COMMANDS.into(),
                title: "命令".into(),
                items: vec![item("`dev` — vite")],
            }],
        };
        let target = super::super::targets::TARGETS
            .iter()
            .find(|t| t.kind == TARGET_CURSOR_MDC)
            .unwrap();
        let out = render_target(&doc, target);
        assert!(out.contains("alwaysApply: false"));
        assert!(out.contains("@AGENTS.md"));
        assert!(!out.contains("vite"), "must not duplicate the body");
    }
}
