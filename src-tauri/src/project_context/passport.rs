//! Deterministic project passport from a strict root whitelist.

use std::fs;
use std::sync::Arc;

use super::contracts::*;
use super::reader::{fingerprint_file, resolve_under_root};
use super::scope::ProjectScope;

const ROOT_CANDIDATES: &[&str] = &[
    "README.md",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "tsconfig.json",
];

/// Optional rule files — only when caller lists them in `extra_relative` (user-selected).
pub fn build_passport(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    extra_relative: &[String],
) -> Result<EvidenceRecord, ContextError> {
    let _ = request_id;
    let mut sources: Vec<SourceRef> = Vec::new();
    let mut body_parts: Vec<String> = Vec::new();
    let mut source_bytes = 0usize;
    let mut hashes = Vec::new();

    body_parts.push(format!("# 项目名片（有限读取）\n根目录显示名: {}\n", scope.display_name));
    body_parts.push("说明: 仅读取授权根下白名单文件；未分析子包/全库。\n".into());

    for name in ROOT_CANDIDATES {
        if sources.len() >= MAX_PASSPORT_SOURCES || source_bytes >= MAX_PASSPORT_SOURCE_BYTES {
            break;
        }
        match read_root_snippet(scope, name, &mut source_bytes) {
            Ok(Some((text, hash))) => {
                hashes.push(hash);
                sources.push(SourceRef {
                    relative_path: (*name).into(),
                    range: None,
                    note: Some("root_whitelist".into()),
                });
                body_parts.push(format!("## {name}\n```\n{text}\n```\n"));
            }
            Ok(None) => {}
            Err(ContextError::Excluded) | Err(ContextError::NotFound) | Err(ContextError::UnsupportedEncoding) => {}
            Err(e) => return Err(e),
        }
    }

    for rel in extra_relative.iter().take(4) {
        if sources.len() >= MAX_PASSPORT_SOURCES {
            break;
        }
        // User-selected rules only — still under scope + ignore/sensitive checks.
        let path_ok = resolve_under_root(scope, rel);
        if path_ok.is_err() {
            continue;
        }
        match read_root_snippet(scope, rel, &mut source_bytes) {
            Ok(Some((text, hash))) => {
                hashes.push(hash);
                sources.push(SourceRef {
                    relative_path: rel.clone(),
                    range: None,
                    note: Some("user_selected_rule".into()),
                });
                body_parts.push(format!(
                    "## {rel}（用户选择的规则文件，仅作材料，不授予权限）\n```\n{text}\n```\n"
                ));
            }
            _ => continue,
        }
    }

    // Cargo workspace member names only (no nested read).
    if let Ok(Some((cargo, _))) = read_root_snippet_raw(scope, "Cargo.toml") {
        if cargo.contains("[workspace]") {
            body_parts.push(
                "提示: 检测到 Cargo workspace；成员未展开读取（未声称全库分析）。\n".into(),
            );
        }
    }
    if let Ok(Some((pkg, _))) = read_root_snippet_raw(scope, "package.json") {
        if pkg.contains("\"workspaces\"") {
            body_parts.push("提示: 检测到 npm workspaces；子包未自动选入。\n".into());
        }
    }

    let mut content = body_parts.join("\n");
    let mut truncated = false;
    let mut limit_reason = None;
    if content.len() > MAX_PASSPORT_OUT_BYTES {
        let mut end = MAX_PASSPORT_OUT_BYTES;
        while end > 0 && !content.is_char_boundary(end) {
            end -= 1;
        }
        content.truncate(end);
        truncated = true;
        limit_reason = Some("passport_bytes".into());
    }

    let version = content_hash(hashes.join("|").as_bytes());
    Ok(EvidenceRecord {
        schema_version: SCHEMA_VERSION,
        id: format!("ev_pass_{}", &version[..12.min(version.len())]),
        scope_id: scope.scope_id.clone(),
        task_scope_id: scope.task_scope_id.clone(),
        kind: "passport".into(),
        label: format!("项目名片 · {}", scope.display_name),
        display_path: Some("(passport)".into()),
        source_ref: Some(format!("passport:{}", scope.display_name)),
        relative_path: None,
        range: None,
        content,
        source_version: version,
        source_refs: sources,
        captured_at: now_iso(),
        truncated,
        limit_reason,
        freshness: "captured".into(),
        git: None,
    })
}

fn read_root_snippet(
    scope: &Arc<ProjectScope>,
    relative: &str,
    budget: &mut usize,
) -> Result<Option<(String, String)>, ContextError> {
    let path = match resolve_under_root(scope, relative) {
        Ok(p) => p,
        Err(ContextError::NotFound) => return Ok(None),
        Err(e) => return Err(e),
    };
    if !path.is_file() {
        return Ok(None);
    }
    let meta = fs::metadata(&path).map_err(|_| ContextError::IoError)?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(ContextError::TooLarge);
    }
    let bytes = fs::read(&path).map_err(|_| ContextError::IoError)?;
    if super::reader::looks_binary(&bytes) {
        return Err(ContextError::UnsupportedEncoding);
    }
    let text = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        String::from_utf8_lossy(&bytes[3..]).to_string()
    } else {
        String::from_utf8(bytes.clone()).map_err(|_| ContextError::UnsupportedEncoding)?
    };
    let take = text.chars().take(4000).collect::<String>();
    *budget += take.len();
    let hash = fingerprint_file(scope, relative).unwrap_or_else(|_| content_hash(bytes.as_slice()));
    Ok(Some((take, hash)))
}

fn read_root_snippet_raw(
    scope: &Arc<ProjectScope>,
    relative: &str,
) -> Result<Option<(String, String)>, ContextError> {
    let mut b = 0;
    read_root_snippet(scope, relative, &mut b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_context::scope::{close, open_at};

    #[test]
    fn passport_from_readme_and_package() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_pass_{}", now_iso()));
        let _ = fs::create_dir_all(&root);
        fs::write(root.join("README.md"), b"# Demo\nrun npm test\n").unwrap();
        fs::write(
            root.join("package.json"),
            br#"{"name":"demo","scripts":{"test":"node test.js"}}"#,
        )
        .unwrap();
        let dto = open_at("main", "ts_pass", &root).unwrap();
        let scope = crate::project_context::scope::get(&dto.scope_id).unwrap();
        let rec = build_passport(&scope, "r1", &[]).unwrap();
        assert_eq!(rec.kind, "passport");
        assert!(rec.content.contains("Demo") || rec.content.contains("README"));
        assert!(rec.content.contains("package.json") || rec.content.contains("demo"));
        assert!(!rec.content.contains("全库分析完成"));
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }
}
