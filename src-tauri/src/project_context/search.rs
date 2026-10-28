//! Bounded literal search. No regex / shell / model tool loop.

use std::fs;
use std::sync::Arc;
use std::time::Instant;

use super::contracts::*;
use super::contracts::content_hash;
use super::reader::{looks_binary, resolve_under_root};
use super::scope::ProjectScope;

// re-export helper — ignore_builder is private in reader; duplicate thin walk here
fn walk(root: &std::path::Path) -> ignore::Walk {
    let mut b = ignore::WalkBuilder::new(root);
    b.hidden(false);
    b.git_ignore(true);
    b.git_global(false);
    b.git_exclude(true);
    b.ignore(true);
    b.parents(false);
    let oi = root.join(".onetoneignore");
    if oi.is_file() {
        let _ = b.add_ignore(oi);
    }
    b.build()
}

pub fn search_literal(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    literal: &str,
    relative_dir: Option<&str>,
) -> Result<(Vec<SearchHit>, bool, Option<String>, BudgetUsage), ContextError> {
    let q = literal.trim();
    if q.is_empty() || q.len() > MAX_SEARCH_QUERY {
        return Err(ContextError::InvalidPath);
    }
    let base = resolve_under_root(scope, relative_dir.unwrap_or(""))?;
    if !base.is_dir() {
        return Err(ContextError::NotFound);
    }
    let start = Instant::now();
    let mut hits = Vec::new();
    let mut walked_files = 0u32;
    let mut bytes: u64 = 0;
    let mut truncated = false;
    let mut limit_reason = None;

    for entry in walk(&base) {
        if scope.is_cancelled(request_id) {
            return Err(ContextError::Cancelled);
        }
        if start.elapsed().as_millis() as u64 > SEARCH_TIMEOUT_MS {
            truncated = true;
            limit_reason = Some("timeout".into());
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        walked_files += 1;
        if walked_files as usize > MAX_SEARCH_FILES {
            truncated = true;
            limit_reason = Some("file_limit".into());
            break;
        }
        let path = entry.path();
        let Ok(rel) = path.strip_prefix(&scope.root) else {
            continue;
        };
        let rel_s = rel.to_string_lossy().replace('\\', "/");
        if resolve_under_root(scope, &rel_s).is_err() {
            continue;
        }
        let meta = match fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        if bytes + meta.len() > MAX_SEARCH_BYTES as u64 {
            truncated = true;
            limit_reason = Some("bytes_limit".into());
            break;
        }
        let data = match fs::read(path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        bytes += data.len() as u64;
        if looks_binary(&data) {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&data) else {
            continue;
        };
        let version = content_hash(&data);
        for (idx, line) in text.lines().enumerate() {
            if line.contains(q) {
                let line_no = (idx + 1) as u32;
                let preview = clip_context(text, idx, 3, 2048);
                hits.push(SearchHit {
                    relative_path: rel_s.clone(),
                    display_path: rel_s.clone(),
                    line: line_no,
                    preview,
                    source_version: version.clone(),
                });
                if hits.len() >= MAX_SEARCH_HITS {
                    truncated = true;
                    limit_reason = Some("hit_limit".into());
                    break;
                }
            }
        }
        if hits.len() >= MAX_SEARCH_HITS {
            break;
        }
    }

    let shown = hits.len() as u32;
    Ok((
        hits,
        truncated,
        limit_reason.clone(),
        BudgetUsage {
            walked: walked_files,
            shown,
            bytes,
            limit_reason,
        },
    ))
}

fn clip_context(text: &str, center: usize, radius: usize, max_bytes: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = center.saturating_sub(radius);
    let end = (center + radius + 1).min(lines.len());
    let mut out = lines[start..end].join("\n");
    if out.len() > max_bytes {
        let mut e = max_bytes;
        while e > 0 && !out.is_char_boundary(e) {
            e -= 1;
        }
        out.truncate(e);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_context::scope::{close, open_at};

    #[test]
    fn finds_literal_and_skips_binaryish() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_search_{}", now_iso()));
        let _ = fs::create_dir_all(root.join("src"));
        fs::write(root.join("src/a.rs"), b"fn boom() { panic!(\"ZHTW_ERR_42\"); }\n").unwrap();
        fs::write(root.join("src/b.bin"), &[0u8, 1, 2, 3, 0, 9]).unwrap();
        let dto = open_at("main", "ts_search", &root).unwrap();
        let scope = crate::project_context::scope::get(&dto.scope_id).unwrap();
        let (hits, _, _, _) = search_literal(&scope, "r", "ZHTW_ERR_42", None).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].relative_path, "src/a.rs");
        let (none, _, _, _) = search_literal(&scope, "r", "NO_SUCH_TOKEN_XYZ", None).unwrap();
        assert!(none.is_empty());
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }
}
