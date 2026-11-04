//! 受管区块写入 / 撤回。
//!
//! 红线：**绝不整体覆盖用户文件**。区块外的内容必须逐字节不变。

use std::fs;
use std::path::{Path, PathBuf};

use super::targets::TargetDef;

pub const BLOCK_BEGIN: &str = "<!-- onetone:instructions:begin -->";
pub const BLOCK_END: &str = "<!-- onetone:instructions:end -->";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyCode {
    Ok,
    NeedsDecision,
    CorruptBlock,
    Conflict,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub code: ApplyCode,
    pub message: String,
    pub path_label: String,
    pub wrote: bool,
}

/// 文件里受管区块的字节区间（若存在）。
fn find_block(text: &str) -> Option<(usize, usize)> {
    let begin = text.find(BLOCK_BEGIN)?;
    let after = begin + BLOCK_BEGIN.len();
    let end = text[after..].find(BLOCK_END)? + after + BLOCK_END.len();
    Some((begin, end))
}

fn block_body(text: &str) -> Option<String> {
    let (b, e) = find_block(text)?;
    let inner = &text[b + BLOCK_BEGIN.len()..e - BLOCK_END.len()];
    Some(inner.trim().to_string())
}

/// 组装最终文件内容：保留区块外原文，把区块内容换成新 body。
fn splice(text: &str, body: &str) -> Option<String> {
    let (b, e) = find_block(text)?;
    let mut out = String::with_capacity(text.len() + body.len());
    out.push_str(&text[..b]);
    out.push_str(BLOCK_BEGIN);
    out.push('\n');
    out.push_str(body.trim_end());
    out.push('\n');
    out.push_str(BLOCK_END);
    out.push_str(&text[e..]);
    Some(out)
}

fn target_path(root: &Path, target: &TargetDef) -> PathBuf {
    let mut p = root.to_path_buf();
    for seg in target.relative_path.split('/') {
        p.push(seg);
    }
    p
}

/// 只读评估：返回将要发生什么，不写盘。
pub fn plan_write(root: &Path, target: &TargetDef, body: &str) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();
    if !path.exists() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "目标文件不存在，将新建并只写入受管区块".into(),
            path_label: label,
            wrote: false,
        });
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?;
    let begins = text.matches(BLOCK_BEGIN).count();
    let ends = text.matches(BLOCK_END).count();
    if begins > 1 || ends > 1 || begins != ends {
        return Ok(ApplyOutcome {
            code: ApplyCode::CorruptBlock,
            message: "检测到多个受管区块或区块标记不成对，拒绝写入".into(),
            path_label: label,
            wrote: false,
        });
    }
    if begins == 0 {
        return Ok(ApplyOutcome {
            code: ApplyCode::NeedsDecision,
            message: "目标文件已有内容且没有受管区块，需用户明确同意后才能插入".into(),
            path_label: label,
            wrote: false,
        });
    }
    let existing = block_body(&text).unwrap_or_default();
    if existing == body.trim() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "受管区块内容已是最新，未写盘".into(),
            path_label: label,
            wrote: false,
        });
    }
    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "将替换受管区块内容，区块外内容保持不变".into(),
        path_label: label,
        wrote: false,
    })
}

/// 写入受管区块。必须先经过 plan_write + 用户显式确认。
pub fn write_block(
    root: &Path,
    target: &TargetDef,
    body: &str,
    consent_insert_into_existing: bool,
) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();

    let existing = if path.exists() {
        Some(fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?)
    } else {
        None
    };

    let final_text = match existing.as_deref() {
        None => format!("{BLOCK_BEGIN}\n{}\n{BLOCK_END}\n", body.trim_end()),
        Some(text) => {
            let begins = text.matches(BLOCK_BEGIN).count();
            let ends = text.matches(BLOCK_END).count();
            if begins > 1 || ends > 1 || begins != ends {
                return Ok(ApplyOutcome {
                    code: ApplyCode::CorruptBlock,
                    message: "检测到多个受管区块或区块标记不成对，拒绝写入".into(),
                    path_label: label,
                    wrote: false,
                });
            }
            if begins == 0 {
                if !consent_insert_into_existing {
                    return Ok(ApplyOutcome {
                        code: ApplyCode::NeedsDecision,
                        message: "目标文件已有内容且没有受管区块，需用户明确同意后才能插入".into(),
                        path_label: label,
                        wrote: false,
                    });
                }
                // 追加在文件末尾；用户原文一字不动。
                let mut out = text.to_string();
                if !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push('\n');
                out.push_str(BLOCK_BEGIN);
                out.push('\n');
                out.push_str(body.trim_end());
                out.push('\n');
                out.push_str(BLOCK_END);
                out.push('\n');
                out
            } else {
                if block_body(text).unwrap_or_default() == body.trim() {
                    return Ok(ApplyOutcome {
                        code: ApplyCode::Ok,
                        message: "受管区块内容已是最新，未写盘".into(),
                        path_label: label,
                        wrote: false,
                    });
                }
                splice(text, body).ok_or_else(|| "splice failed".to_string())?
            }
        }
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    // 原子写：临时文件 + rename。
    let tmp = path.with_extension("onetone-tmp");
    fs::write(&tmp, &final_text).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;

    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "已写入受管区块".into(),
        path_label: label,
        wrote: true,
    })
}

/// 撤回：只删受管区块，不删文件。
pub fn revert_block(root: &Path, target: &TargetDef) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();
    if !path.exists() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "目标文件不存在，无需撤回".into(),
            path_label: label,
            wrote: false,
        });
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?;
    let Some((b, e)) = find_block(&text) else {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "文件中没有受管区块，无需撤回".into(),
            path_label: label,
            wrote: false,
        });
    };
    let mut out = String::with_capacity(text.len());
    out.push_str(&text[..b]);
    out.push_str(&text[e..]);
    let cleaned = out.trim_end().to_string() + "\n";
    let tmp = path.with_extension("onetone-tmp");
    fs::write(&tmp, &cleaned).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "已撤回受管区块（文件其余内容保持不变）".into(),
        path_label: label,
        wrote: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_instructions::targets::{TargetDef, TARGET_AGENTS_MD};

    fn target() -> TargetDef {
        TargetDef {
            id: TARGET_AGENTS_MD,
            label: "AGENTS.md",
            relative_path: "AGENTS.md",
            kind: TARGET_AGENTS_MD,
        }
    }

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "onetone-apply-{}-{}-{}",
            tag,
            std::process::id(),
            crate::agent_memory::now_ms()
        ));
        let _ = fs::create_dir_all(&d);
        d
    }

    #[test]
    fn creates_file_with_block_when_absent() {
        let d = tmpdir("create");
        let out = write_block(&d, &target(), "# body", false).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(out.wrote);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.contains(BLOCK_BEGIN));
        assert!(text.contains("# body"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn preserves_user_content_outside_block_byte_for_byte() {
        let d = tmpdir("preserve");
        let original = "# 我的笔记\n\n保留我\n";
        fs::write(d.join("AGENTS.md"), original).unwrap();
        // 无 consent → 拒绝
        let out = write_block(&d, &target(), "# body", false).unwrap();
        assert_eq!(out.code, ApplyCode::NeedsDecision);
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), original);
        // 有 consent → 追加区块，原文不变
        let out = write_block(&d, &target(), "# body", true).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.starts_with(original), "user content must stay at the top untouched");
        assert!(text.contains(BLOCK_BEGIN));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn replaces_only_the_block_content() {
        let d = tmpdir("replace");
        let original = "KEEP-HEAD\n";
        fs::write(d.join("AGENTS.md"), format!("{original}{BLOCK_BEGIN}\nold\n{BLOCK_END}\nTAIL\n")).unwrap();
        write_block(&d, &target(), "new", false).unwrap();
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.starts_with("KEEP-HEAD\n"));
        assert!(text.contains("TAIL"));
        assert!(text.contains("new"));
        assert!(!text.contains("old"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn refuses_when_multiple_blocks() {
        let d = tmpdir("corrupt");
        fs::write(
            d.join("AGENTS.md"),
            format!("{BLOCK_BEGIN}\na\n{BLOCK_END}\n{BLOCK_BEGIN}\nb\n{BLOCK_END}\n"),
        )
        .unwrap();
        let out = write_block(&d, &target(), "new", true).unwrap();
        assert_eq!(out.code, ApplyCode::CorruptBlock);
        assert!(!out.wrote);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn idempotent_second_write_does_not_write() {
        let d = tmpdir("idem");
        write_block(&d, &target(), "same", false).unwrap();
        let before = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        let out = write_block(&d, &target(), "same", false).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(!out.wrote, "second identical write must be a no-op");
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), before);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn revert_removes_block_only() {
        let d = tmpdir("revert");
        fs::write(d.join("AGENTS.md"), format!("KEEP\n{BLOCK_BEGIN}\nx\n{BLOCK_END}\nTAIL\n")).unwrap();
        let out = revert_block(&d, &target()).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(out.wrote);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.contains("KEEP"));
        assert!(text.contains("TAIL"));
        assert!(!text.contains(BLOCK_BEGIN));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn plan_reports_needs_decision_without_writing() {
        let d = tmpdir("plan");
        fs::write(d.join("AGENTS.md"), "user text\n").unwrap();
        let out = plan_write(&d, &target(), "body").unwrap();
        assert_eq!(out.code, ApplyCode::NeedsDecision);
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), "user text\n");
        let _ = fs::remove_dir_all(&d);
    }
}
