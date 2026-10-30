//! Tool executors — inspect / search / read / propose / apply / diff / check.

use std::cell::RefCell;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::check_registry;
use super::contracts::FileFingerprint;
use super::scope::{
    content_hash, file_hash, is_baseline_dirty, mtime_secs, rel_display, resolve_in_root,
    ScopeError, WorkspaceScope,
};

const MAX_SEARCH_HITS: usize = 40;
const MAX_SEARCH_BYTES: usize = 120_000;
const MAX_READ_CHARS: usize = 40_000;
/// Sentinel file hash for create-new-file apply (no prior read).
pub const NEW_FILE_HASH: &str = "new";

pub fn inspect_workspace(scope: &WorkspaceScope) -> Value {
    let mut entries = Vec::new();
    if let Ok(rd) = fs::read_dir(&scope.root) {
        for e in rd.flatten().take(80) {
            let name = e.file_name().to_string_lossy().to_string();
            let kind = if e.path().is_dir() { "dir" } else { "file" };
            entries.push(json!({"name": name, "kind": kind}));
        }
    }
    json!({
        "root": scope.root.display().to_string(),
        "entries": entries,
        "baselineDirty": scope.baseline_dirty,
    })
}

pub fn search_code(scope: &WorkspaceScope, query: &str) -> Result<Value, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("empty_query".into());
    }
    let mut hits = Vec::new();
    let mut scanned = 0usize;
    walk_files(&scope.root, &mut |path| {
        if hits.len() >= MAX_SEARCH_HITS || scanned >= MAX_SEARCH_BYTES {
            return;
        }
        let Ok(meta) = fs::metadata(path) else {
            return;
        };
        if meta.len() > 200_000 {
            return;
        }
        let Ok(file) = fs::File::open(path) else {
            return;
        };
        let reader = BufReader::new(file);
        for (i, line) in reader.lines().enumerate() {
            let Ok(line) = line else { continue };
            scanned = scanned.saturating_add(line.len());
            if line.contains(q) {
                hits.push(json!({
                    "path": rel_display(&scope.root, path),
                    "line": i + 1,
                    "text": line.chars().take(200).collect::<String>(),
                }));
                if hits.len() >= MAX_SEARCH_HITS {
                    break;
                }
            }
            if scanned >= MAX_SEARCH_BYTES {
                break;
            }
        }
    });
    Ok(json!({ "query": q, "hits": hits, "truncated": hits.len() >= MAX_SEARCH_HITS }))
}

fn walk_files(root: &Path, f: &mut dyn FnMut(&Path)) {
    let Ok(rd) = fs::read_dir(root) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name == ".git" || name == "node_modules" || name == "target" {
            continue;
        }
        if p.is_dir() {
            walk_files(&p, f);
        } else if p.is_file() {
            f(&p);
        }
    }
}

pub fn read_file(
    scope: &WorkspaceScope,
    rel: &str,
    start_line: Option<u32>,
    end_line: Option<u32>,
) -> Result<(FileFingerprint, Value), String> {
    let path = resolve_in_root(&scope.root, rel).map_err(|e| e.as_str().to_string())?;
    if !path.is_file() {
        return Err(ScopeError::NotFound.as_str().into());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    let lines: Vec<&str> = raw.lines().collect();
    let start = start_line.unwrap_or(1).max(1) as usize;
    let end = end_line
        .map(|e| e as usize)
        .unwrap_or(lines.len())
        .min(lines.len())
        .max(start);
    let slice: String = lines[(start - 1)..end].join("\n");
    let mut body = slice;
    let truncated = if body.chars().count() > MAX_READ_CHARS {
        body = body.chars().take(MAX_READ_CHARS).collect();
        true
    } else {
        false
    };
    let fp = FileFingerprint {
        path: rel_display(&scope.root, &path),
        start_line: start as u32,
        end_line: end as u32,
        content_hash: content_hash(&body),
        file_hash: file_hash(&path)?,
        mtime: mtime_secs(&path),
    };
    Ok((
        fp.clone(),
        json!({
            "fingerprint": fp,
            "content": body,
            "truncated": truncated,
        }),
    ))
}

/// Pure propose — does not write and does not mutate changed_files.
pub fn propose_changes(
    scope: &WorkspaceScope,
    path: &str,
    rationale: &str,
    new_content: &str,
    risk: &str,
) -> Result<Value, String> {
    let abs = resolve_in_root(&scope.root, path).map_err(|e| e.as_str().to_string())?;
    let old = if abs.is_file() {
        fs::read_to_string(&abs).unwrap_or_default()
    } else {
        String::new()
    };
    let patch = unified_replace_preview(&rel_display(&scope.root, &abs), &old, new_content);
    let patch_hash = format!("{:x}", Sha256::digest(patch.as_bytes()));
    Ok(json!({
        "candidates": [{
            "path": rel_display(&scope.root, &abs),
            "rationale": rationale,
            "risk": risk,
            "patchPreview": patch,
            "patchHash": patch_hash,
            "newContent": new_content,
            "oldFileHash": if abs.is_file() { Some(file_hash(&abs)?) } else { None },
        }],
        "workspaceUnchanged": true,
    }))
}

fn unified_replace_preview(path: &str, old: &str, new: &str) -> String {
    format!("--- a/{path}\n+++ b/{path}\n@@ full-file replace @@\n-{old}\n+{new}\n")
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPatch {
    pub path: String,
    pub new_content: String,
    pub patch_hash: String,
    pub target_file_hash: String,
    pub patch_version: u32,
    pub approval_token: String,
    pub allow_dirty: bool,
}

pub fn build_pending_patch(
    task_id: &str,
    scope: &WorkspaceScope,
    path: &str,
    new_content: &str,
    patch_version: u32,
    allow_dirty: bool,
    last_file_hash: Option<&str>,
) -> Result<PendingPatch, String> {
    let abs = resolve_in_root(&scope.root, path).map_err(|e| e.as_str().to_string())?;
    let rel = rel_display(&scope.root, &abs);
    if is_baseline_dirty(scope, &rel) && !allow_dirty {
        return Err("baseline_dirty_requires_approval".into());
    }
    if abs.is_file() {
        let current_hash = file_hash(&abs)?;
        if let Some(expected) = last_file_hash {
            if expected != current_hash {
                return Err("file_hash_drift".into());
            }
        } else {
            return Err("must_read_before_apply".into());
        }
        let old = fs::read_to_string(&abs).map_err(|e| format!("read: {e}"))?;
        let patch = unified_replace_preview(&rel, &old, new_content);
        let patch_hash = format!("{:x}", Sha256::digest(patch.as_bytes()));
        let approval_token = bind_approval_token(task_id, &patch_hash, &current_hash, patch_version);
        return Ok(PendingPatch {
            path: rel,
            new_content: new_content.to_string(),
            patch_hash,
            target_file_hash: current_hash,
            patch_version,
            approval_token,
            allow_dirty,
        });
    }
    // Create new file — parent must exist; no prior read required.
    if last_file_hash.is_some() {
        return Err("file_not_found".into());
    }
    let parent = abs.parent().ok_or_else(|| "invalid_path".to_string())?;
    if !parent.exists() {
        return Err("parent_missing".into());
    }
    let current_hash = NEW_FILE_HASH.to_string();
    let patch = unified_replace_preview(&rel, "", new_content);
    let patch_hash = format!("{:x}", Sha256::digest(patch.as_bytes()));
    let approval_token = bind_approval_token(task_id, &patch_hash, &current_hash, patch_version);
    Ok(PendingPatch {
        path: rel,
        new_content: new_content.to_string(),
        patch_hash,
        target_file_hash: current_hash,
        patch_version,
        approval_token,
        allow_dirty,
    })
}

pub fn bind_approval_token(
    task_id: &str,
    patch_hash: &str,
    target_file_hash: &str,
    patch_version: u32,
) -> String {
    let raw = format!("{task_id}|{patch_hash}|{target_file_hash}|{patch_version}");
    format!("{:x}", Sha256::digest(raw.as_bytes()))
}

pub fn apply_pending_patch(scope: &WorkspaceScope, pending: &PendingPatch) -> Result<Value, String> {
    let abs = resolve_in_root(&scope.root, &pending.path).map_err(|e| e.as_str().to_string())?;
    if pending.target_file_hash == NEW_FILE_HASH {
        if abs.is_file() {
            return Err("file_hash_drift".into());
        }
        let parent = abs.parent().ok_or_else(|| "invalid_path".to_string())?;
        if !parent.exists() {
            return Err("parent_missing".into());
        }
        let patch = unified_replace_preview(&pending.path, "", &pending.new_content);
        let patch_hash = format!("{:x}", Sha256::digest(patch.as_bytes()));
        if patch_hash != pending.patch_hash {
            return Err("patch_context_mismatch".into());
        }
        fs::write(&abs, &pending.new_content).map_err(|e| format!("write: {e}"))?;
        return Ok(json!({
            "path": pending.path,
            "ok": true,
            "created": true,
            "newFileHash": file_hash(&abs)?,
        }));
    }
    if !abs.is_file() {
        return Err("file_not_found".into());
    }
    let current = file_hash(&abs)?;
    if current != pending.target_file_hash {
        return Err("file_hash_drift".into());
    }
    // Context match: recompute patch hash from current content.
    let old = fs::read_to_string(&abs).map_err(|e| format!("read: {e}"))?;
    let patch = unified_replace_preview(&pending.path, &old, &pending.new_content);
    let patch_hash = format!("{:x}", Sha256::digest(patch.as_bytes()));
    if patch_hash != pending.patch_hash {
        return Err("patch_context_mismatch".into());
    }
    fs::write(&abs, &pending.new_content).map_err(|e| format!("write: {e}"))?;
    Ok(json!({
        "path": pending.path,
        "ok": true,
        "newFileHash": file_hash(&abs)?,
    }))
}

thread_local! {
    static TEST_DESKTOP: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
}

#[cfg(test)]
pub fn set_test_desktop_dir(p: Option<PathBuf>) {
    TEST_DESKTOP.with(|c| *c.borrow_mut() = p);
}

fn desktop_dir() -> Result<PathBuf, String> {
    if let Some(p) = TEST_DESKTOP.with(|c| c.borrow().clone()) {
        return Ok(p);
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "desktop_home_missing".to_string())?;
    let home = PathBuf::from(home);
    for name in ["Desktop", "桌面"] {
        let d = home.join(name);
        if d.is_dir() {
            return Ok(d);
        }
    }
    Err("desktop_missing".into())
}

/// Copy a workspace file onto the Windows Desktop (basename only).
pub fn export_to_desktop(scope: &WorkspaceScope, rel: &str) -> Result<Value, String> {
    let abs = resolve_in_root(&scope.root, rel).map_err(|e| {
        if e == ScopeError::OutsideRoot {
            "outside_root: 源文件必须在工作区内，不要把桌面路径当作 path".into()
        } else {
            e.as_str().to_string()
        }
    })?;
    if !abs.is_file() {
        return Err("file_not_found".into());
    }
    let name = abs
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "invalid_path".to_string())?;
    if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err("invalid_path".into());
    }
    let dest_dir = desktop_dir()?;
    fs::create_dir_all(&dest_dir).map_err(|e| format!("desktop_mkdir: {e}"))?;
    let dest = dest_dir.join(name);
    fs::copy(&abs, &dest).map_err(|e| format!("desktop_copy: {e}"))?;
    Ok(json!({
        "ok": true,
        "src": rel_display(&scope.root, &abs),
        "dest": dest.display().to_string(),
    }))
}

pub fn inspect_diff(scope: &WorkspaceScope, changed: &[String]) -> Value {
    let mut files = Vec::new();
    for rel in changed {
        let Ok(abs) = resolve_in_root(&scope.root, rel) else {
            continue;
        };
        let content = fs::read_to_string(&abs).unwrap_or_default();
        files.push(json!({
            "path": rel,
            "bytes": content.len(),
            "preview": content.chars().take(400).collect::<String>(),
        }));
    }
    json!({ "changedFiles": files })
}

pub fn run_check_by_id(scope: &WorkspaceScope, check_id: &str) -> Result<Value, String> {
    let req = check_registry::resolve_check(check_id, &scope.root)?;
    let (ok, output) = check_registry::execute_check(&req, &scope.root)?;
    Ok(json!({
        "checkId": check_id,
        "ok": ok,
        "output": output,
        // Internal fields intentionally omitted from model-facing summary in loop.
    }))
}
