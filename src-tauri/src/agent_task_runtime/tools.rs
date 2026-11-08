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
const INSPECT_DIRTY_SAMPLE: usize = 32;
/// Sentinel file hash for create-new-file apply (no prior read).
pub const NEW_FILE_HASH: &str = "new";

fn baseline_dirty_sample(paths: &[String], cap: usize) -> Value {
    let total = paths.len();
    if total <= cap {
        return json!(paths);
    }
    json!({
        "count": total,
        "sample": paths.iter().take(cap).cloned().collect::<Vec<_>>(),
        "omitted": total - cap,
    })
}

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
        "baselineDirty": baseline_dirty_sample(&scope.baseline_dirty, INSPECT_DIRTY_SAMPLE),
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

/// Line-level diff stats. Display only — never feeds patch_hash.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DiffStats {
    pub added: usize,
    pub removed: usize,
}

/// Max lines in the *trimmed middle* block before we give up on an LCS diff.
/// The common prefix/suffix are trimmed first, so a 3000-line file with one
/// changed line still diffs cheaply.
const MAX_DIFF_MID_LINES: usize = 1200;
/// Context lines kept around each hunk.
const DIFF_CONTEXT: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
enum DiffOp {
    Ctx,
    Del,
    Add,
}

/// Line-level unified diff between two file contents.
///
/// Display only. The approval/drift path keeps using `patch_hash`, which is
/// bound to the FULL old+new content — this function must never be used for
/// verification.
pub fn unified_line_diff(old: &str, new: &str) -> (String, DiffStats) {
    let old_lines: Vec<&str> = old.lines().collect();
    let new_lines: Vec<&str> = new.lines().collect();

    // Trim the common prefix.
    let mut pre = 0usize;
    while pre < old_lines.len() && pre < new_lines.len() && old_lines[pre] == new_lines[pre] {
        pre += 1;
    }
    // Trim the common suffix (never overlapping the prefix).
    let mut suf = 0usize;
    while suf < (old_lines.len() - pre)
        && suf < (new_lines.len() - pre)
        && old_lines[old_lines.len() - 1 - suf] == new_lines[new_lines.len() - 1 - suf]
    {
        suf += 1;
    }

    let old_mid = &old_lines[pre..old_lines.len() - suf];
    let new_mid = &new_lines[pre..new_lines.len() - suf];

    if old_mid.len() > MAX_DIFF_MID_LINES || new_mid.len() > MAX_DIFF_MID_LINES {
        return (
            format!(
                "@@ full-file replace @@\n-{} lines\n+{} lines\n",
                old_mid.len(),
                new_mid.len()
            ),
            DiffStats {
                added: new_mid.len(),
                removed: old_mid.len(),
            },
        );
    }

    let mid_ops = lcs_ops(old_mid, new_mid);

    // Walk prefix + middle + suffix in ONE pass, filling text and line numbers.
    let mut rows: Vec<(DiffOp, &str, u32, u32)> = Vec::new();
    for i in 0..pre {
        rows.push((DiffOp::Ctx, old_lines[i], (i + 1) as u32, (i + 1) as u32));
    }
    let mut old_ln = pre as u32;
    let mut new_ln = pre as u32;
    let mut oi = 0usize;
    let mut ni = 0usize;
    for op in mid_ops {
        match op {
            DiffOp::Ctx => {
                old_ln += 1;
                new_ln += 1;
                rows.push((DiffOp::Ctx, old_mid[oi], old_ln, new_ln));
                oi += 1;
                ni += 1;
            }
            DiffOp::Del => {
                old_ln += 1;
                rows.push((DiffOp::Del, old_mid[oi], old_ln, new_ln));
                oi += 1;
            }
            DiffOp::Add => {
                new_ln += 1;
                rows.push((DiffOp::Add, new_mid[ni], old_ln, new_ln));
                ni += 1;
            }
        }
    }
    for i in 0..suf {
        let o_idx = old_lines.len() - suf + i;
        let n_idx = new_lines.len() - suf + i;
        rows.push((
            DiffOp::Ctx,
            old_lines[o_idx],
            (o_idx + 1) as u32,
            (n_idx + 1) as u32,
        ));
    }

    let mut stats = DiffStats::default();
    for r in &rows {
        match r.0 {
            DiffOp::Add => stats.added += 1,
            DiffOp::Del => stats.removed += 1,
            DiffOp::Ctx => {}
        }
    }
    if stats.added == 0 && stats.removed == 0 {
        return (String::new(), stats);
    }

    // Group changed rows into hunks.
    let changed: Vec<usize> = rows
        .iter()
        .enumerate()
        .filter(|(_, r)| r.0 != DiffOp::Ctx)
        .map(|(i, _)| i)
        .collect();
    if changed.is_empty() {
        return (String::new(), stats);
    }
    let mut hunks: Vec<(usize, usize)> = Vec::new();
    let mut h_start = changed[0];
    let mut h_end = changed[0];
    for &c in changed.iter().skip(1) {
        if c <= h_end + 1 + 2 * DIFF_CONTEXT {
            h_end = c;
        } else {
            hunks.push((h_start, h_end));
            h_start = c;
            h_end = c;
        }
    }
    hunks.push((h_start, h_end));

    let mut out = String::new();
    for (s, e) in hunks {
        let s = s.saturating_sub(DIFF_CONTEXT);
        let e = (e + DIFF_CONTEXT).min(rows.len() - 1);
        let old_start = rows[s].2;
        let new_start = rows[s].3;
        let old_count = rows[s..=e]
            .iter()
            .filter(|r| r.0 != DiffOp::Add)
            .count();
        let new_count = rows[s..=e]
            .iter()
            .filter(|r| r.0 != DiffOp::Del)
            .count();
        out.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            old_start, old_count, new_start, new_count
        ));
        for r in &rows[s..=e] {
            let prefix = match r.0 {
                DiffOp::Ctx => ' ',
                DiffOp::Del => '-',
                DiffOp::Add => '+',
            };
            out.push(prefix);
            out.push_str(r.1);
            out.push('\n');
        }
    }
    (out, stats)
}

/// Classic LCS over two line slices. Returns the op sequence for the middle block.
fn lcs_ops(a: &[&str], b: &[&str]) -> Vec<DiffOp> {
    let n = a.len();
    let m = b.len();
    if n == 0 {
        return b.iter().map(|_| DiffOp::Add).collect();
    }
    if m == 0 {
        return a.iter().map(|_| DiffOp::Del).collect();
    }
    let w = m + 1;
    let mut dp = vec![0u32; (n + 1) * (m + 1)];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i * w + j] = if a[i] == b[j] {
                dp[(i + 1) * w + j + 1] + 1
            } else {
                dp[(i + 1) * w + j].max(dp[i * w + j + 1])
            };
        }
    }
    let mut ops = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if a[i] == b[j] {
            ops.push(DiffOp::Ctx);
            i += 1;
            j += 1;
        } else if dp[(i + 1) * w + j] >= dp[i * w + j + 1] {
            ops.push(DiffOp::Del);
            i += 1;
        } else {
            ops.push(DiffOp::Add);
            j += 1;
        }
    }
    while i < n {
        ops.push(DiffOp::Del);
        i += 1;
    }
    while j < m {
        ops.push(DiffOp::Add);
        j += 1;
    }
    ops
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

pub fn web_search(query: &str, limit: Option<u32>, provider: Option<&str>) -> Value {
    crate::research::web_search(query, limit, provider)
}

pub fn fetch_url(url: &str, provider: Option<&str>, max_chars: Option<u32>) -> Value {
    crate::research::fetch_url(url, provider, max_chars)
}

/// Clipboard + Soft Pad Ctrl+V to external foreground. Never pretends paste succeeded.
pub fn deliver_to_agent(text: &str, kind: &str) -> Value {
    let text = text.trim();
    if text.is_empty() {
        return json!({
            "ok": false,
            "code": "empty_text",
            "message": "deliver_to_agent needs non-empty text",
            "kind": kind,
        });
    }
    let clip_ok = crate::agent::insert_text::set_clipboard_text(text);
    if !clip_ok {
        return json!({
            "ok": false,
            "code": "clipboard_failed",
            "message": "could not copy text to clipboard",
            "kind": kind,
            "clipboard": false,
            "paste": false,
        });
    }
    let paste = crate::ipc::paste_only_external(40);
    json!({
        "ok": paste.ok,
        "code": paste.error.clone().unwrap_or_else(|| "ok".into()),
        "message": if paste.ok {
            "clipboard set and paste sent to external app".to_string()
        } else {
            format!(
                "clipboard set; paste failed ({}) — focus Cursor/Codex and Ctrl+V",
                paste.error.as_deref().unwrap_or("unknown")
            )
        },
        "kind": kind,
        "clipboard": true,
        "paste": paste.paste_input_sent,
        "chars": text.chars().count(),
    })
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
    // Task changed_files is empty until apply_patch — fall back to baseline dirty
    // so Q&A goals ("今天改了什么") still get paths. Cap sample to keep context small.
    const CAP: usize = 40;
    let (paths, source): (Vec<String>, &str) = if !changed.is_empty() {
        (
            changed.iter().take(CAP).cloned().collect(),
            "task_changed",
        )
    } else if !scope.baseline_dirty.is_empty() {
        (
            scope.baseline_dirty.iter().take(CAP).cloned().collect(),
            "baseline_dirty",
        )
    } else {
        (Vec::new(), "none")
    };
    let mut files = Vec::new();
    for rel in &paths {
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
    json!({
        "changedFiles": files,
        "source": source,
        "totalCandidates": paths.len(),
        "hint": if files.is_empty() {
            Value::String(
                "no_paths_to_diff — 直接 finish{summary} 回答目标，勿空转".into(),
            )
        } else {
            Value::Null
        },
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inspect_dirty_samples_long_lists() {
        let paths: Vec<String> = (0..50).map(|i| format!("p{i}.rs")).collect();
        let v = baseline_dirty_sample(&paths, 32);
        assert_eq!(v["count"], 50);
        assert_eq!(v["omitted"], 18);
        assert_eq!(v["sample"].as_array().map(|a| a.len()), Some(32));
    }

    #[test]
    fn inspect_diff_falls_back_to_baseline_dirty() {
        let dir = std::env::temp_dir().join(format!(
            "atr-inspect-diff-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.rs"), "fn a(){}").unwrap();
        let scope = WorkspaceScope {
            root: dir.clone(),
            baseline_dirty: vec!["a.rs".into()],
        };
        let v = inspect_diff(&scope, &[]);
        assert_eq!(v["source"], "baseline_dirty");
        assert_eq!(v["changedFiles"].as_array().map(|a| a.len()), Some(1));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn line_diff_marks_added_removed_context() {
        let old = "a\nb\nc\nd\ne\n";
        let new = "a\nb\nC\nd\ne\n";
        let (diff, stats) = unified_line_diff(old, new);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.removed, 1);
        assert!(diff.contains("@@"), "diff={diff}");
        assert!(diff.contains("-c"), "diff={diff}");
        assert!(diff.contains("+C"), "diff={diff}");
        assert!(diff.contains(" a"), "context line missing: {diff}");
    }

    #[test]
    fn web_search_empty_query_fails() {
        let v = web_search("", None, None);
        assert_eq!(v.get("ok").and_then(|x| x.as_bool()), Some(false));
    }

    #[test]
    fn deliver_to_agent_empty_fails() {
        let v = deliver_to_agent("  ", "soft_pad");
        assert_eq!(v.get("ok").and_then(|x| x.as_bool()), Some(false));
        assert_eq!(v.get("code").and_then(|x| x.as_str()), Some("empty_text"));
    }

    #[test]
    fn fetch_url_ssrf_blocked() {
        let v = fetch_url("http://127.0.0.1/secret", None, None);
        assert_eq!(v.get("ok").and_then(|x| x.as_bool()), Some(false));
        assert_eq!(v.get("code").and_then(|x| x.as_str()), Some("ssrf_blocked"));
    }

    #[test]
    fn line_diff_no_change_is_empty() {
        let (diff, stats) = unified_line_diff("x\ny\n", "x\ny\n");
        assert_eq!(diff, "");
        assert_eq!(stats.added, 0);
        assert_eq!(stats.removed, 0);
    }

    #[test]
    fn line_diff_new_file_has_only_additions() {
        let (diff, stats) = unified_line_diff("", "n1\nn2\n");
        assert_eq!(stats.added, 2);
        assert_eq!(stats.removed, 0);
        assert!(diff.contains("+n1"), "diff={diff}");
        assert!(!diff.contains("-n"), "diff={diff}");
    }

    #[test]
    fn line_diff_deletes_lines() {
        let (diff, stats) = unified_line_diff("a\nb\nc\n", "a\nc\n");
        assert_eq!(stats.removed, 1);
        assert_eq!(stats.added, 0);
        assert!(diff.contains("-b"), "diff={diff}");
    }

    #[test]
    fn line_diff_trims_common_prefix_and_suffix() {
        // 3000 identical lines around one change must NOT degrade.
        let mut old = String::new();
        let mut new = String::new();
        for i in 0..3000 {
            old.push_str(&format!("line{i}\n"));
            new.push_str(&format!("line{i}\n"));
        }
        old.push_str("old_tail\n");
        new.push_str("new_tail\n");
        let (diff, stats) = unified_line_diff(&old, &new);
        assert_eq!(stats.added, 1);
        assert_eq!(stats.removed, 1);
        assert!(!diff.contains("full-file replace"), "degraded: {diff}");
        assert!(diff.len() < 2000, "diff too long: {}", diff.len());
    }

    #[test]
    fn line_diff_degrades_on_huge_middle_block() {
        let old: String = (0..4000).map(|i| format!("o{i}\n")).collect();
        let new: String = (0..4000).map(|i| format!("n{i}\n")).collect();
        let (diff, stats) = unified_line_diff(&old, &new);
        assert!(diff.contains("full-file replace"), "diff={diff}");
        assert_eq!(stats.removed, 4000);
        assert_eq!(stats.added, 4000);
    }

    #[test]
    fn line_diff_never_panics_on_empty_inputs() {
        let (diff, stats) = unified_line_diff("", "");
        assert_eq!(stats.added, 0);
        assert_eq!(stats.removed, 0);
        assert_eq!(diff, "");
    }

    #[test]
    fn patch_hash_is_stable_across_diff_feature() {
        // Golden: the patch_hash input MUST stay byte-identical to the
        // pre-diff implementation. unified_replace_preview is unchanged.
        let old = "line1\nline2\nline3\n";
        let new = "line1\nCHANGED\nline3\n";
        // Byte-identity lock on the preview format itself. The preview must
        // keep carrying the FULL old+new content so that any on-disk drift
        // changes patch_hash and shows up as patch_context_mismatch.
        assert_eq!(
            format!(
                "{:x}",
                Sha256::digest(unified_replace_preview("a.txt", old, new).as_bytes())
            ),
            "13979d89dc28703619d3805e8cea7c27d456e5e341fb17143c263c9aa3bd05ea"
        );
        let path = std::env::temp_dir().join(format!("atr_golden_{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("a.txt"), old).unwrap();
        let scope = WorkspaceScope {
            root: path.clone(),
            baseline_dirty: vec![],
        };
        let pending = build_pending_patch(
            "t_golden",
            &scope,
            "a.txt",
            new,
            1,
            false,
            Some(&file_hash(&path.join("a.txt")).unwrap()),
        )
        .unwrap();
        // build_pending_patch must hash exactly those preview bytes. The rel
        // path is derived the same way the impl derives it — on Windows
        // resolve_in_root canonicalizes to a `\\?\` verbatim path, so
        // rel_display yields an absolute path rather than "a.txt".
        let rel = rel_display(&scope.root, &resolve_in_root(&scope.root, "a.txt").unwrap());
        let expected = format!(
            "{:x}",
            Sha256::digest(unified_replace_preview(&rel, old, new).as_bytes())
        );
        assert_eq!(pending.patch_hash, expected);
        let _ = fs::remove_dir_all(&path);
    }
}
