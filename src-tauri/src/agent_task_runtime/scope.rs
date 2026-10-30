//! Workspace path safety + baseline dirty set.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct WorkspaceScope {
    pub root: PathBuf,
    pub baseline_dirty: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScopeError {
    OutsideRoot,
    SymlinkEscape,
    InvalidPath,
    NotFound,
}

impl ScopeError {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OutsideRoot => "outside_root",
            Self::SymlinkEscape => "symlink_escape",
            Self::InvalidPath => "invalid_path",
            Self::NotFound => "not_found",
        }
    }
}

pub fn open_workspace(root: &Path) -> Result<WorkspaceScope, String> {
    let root = fs::canonicalize(root).map_err(|e| format!("canonicalize workspace: {e}"))?;
    if !root.is_dir() {
        return Err("workspace_not_directory".into());
    }
    let baseline_dirty = git_dirty_relpaths(&root).unwrap_or_default();
    Ok(WorkspaceScope {
        root,
        baseline_dirty,
    })
}

fn git_dirty_relpaths(root: &Path) -> Result<Vec<String>, String> {
    let out = Command::new("git")
        .args(["status", "--porcelain", "-uall"])
        .current_dir(root)
        .output()
        .map_err(|e| format!("git status: {e}"))?;
    if !out.status.success() {
        return Ok(Vec::new());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut files = Vec::new();
    for line in text.lines() {
        if line.len() < 4 {
            continue;
        }
        let path = line[3..].trim();
        if path.is_empty() {
            continue;
        }
        // Rename: "R  old -> new"
        if let Some((_, new)) = path.split_once(" -> ") {
            files.push(normalize_rel(new));
        } else {
            files.push(normalize_rel(path));
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

fn normalize_rel(p: &str) -> String {
    p.replace('\\', "/")
}

/// Resolve a relative (or root-relative) path; reject escape and symlink-out.
pub fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, ScopeError> {
    let rel = rel.trim().trim_start_matches(['/', '\\']);
    if rel.is_empty() {
        return Err(ScopeError::InvalidPath);
    }
    // Absolute path rejected.
    let candidate = PathBuf::from(rel);
    if candidate.is_absolute() {
        return Err(ScopeError::OutsideRoot);
    }
    for c in candidate.components() {
        match c {
            Component::ParentDir => return Err(ScopeError::OutsideRoot),
            Component::RootDir | Component::Prefix(_) => return Err(ScopeError::OutsideRoot),
            _ => {}
        }
    }
    let joined = root.join(&candidate);
    // If exists, canonicalize and ensure still under root.
    if joined.exists() {
        let canon = fs::canonicalize(&joined).map_err(|_| ScopeError::InvalidPath)?;
        let root_canon = fs::canonicalize(root).map_err(|_| ScopeError::InvalidPath)?;
        if !canon.starts_with(&root_canon) {
            return Err(ScopeError::SymlinkEscape);
        }
        return Ok(canon);
    }
    // Parent must stay under root (for create-on-write later).
    if let Some(parent) = joined.parent() {
        if parent.exists() {
            let parent_canon = fs::canonicalize(parent).map_err(|_| ScopeError::InvalidPath)?;
            let root_canon = fs::canonicalize(root).map_err(|_| ScopeError::InvalidPath)?;
            if !parent_canon.starts_with(&root_canon) {
                return Err(ScopeError::OutsideRoot);
            }
        }
    }
    Ok(joined)
}

pub fn rel_display(root: &Path, abs: &Path) -> String {
    abs.strip_prefix(root)
        .map(|p| normalize_rel(&p.to_string_lossy()))
        .unwrap_or_else(|_| normalize_rel(&abs.to_string_lossy()))
}

pub fn file_hash(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("read: {e}"))?;
    Ok(format!("{:x}", Sha256::digest(&bytes)))
}

pub fn content_hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

pub fn mtime_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn is_baseline_dirty(scope: &WorkspaceScope, rel: &str) -> bool {
    let n = normalize_rel(rel);
    scope.baseline_dirty.iter().any(|d| d == &n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_and_absolute() {
        let root = std::env::temp_dir().join(format!("atr_scope_{}", std::process::id()));
        let _ = fs::create_dir_all(&root);
        let scope = open_workspace(&root).unwrap();
        assert_eq!(
            resolve_in_root(&scope.root, "../secret"),
            Err(ScopeError::OutsideRoot)
        );
        #[cfg(windows)]
        {
            assert_eq!(
                resolve_in_root(&scope.root, r"C:\Windows\system.ini"),
                Err(ScopeError::OutsideRoot)
            );
        }
        #[cfg(not(windows))]
        {
            assert_eq!(
                resolve_in_root(&scope.root, "/etc/passwd"),
                Err(ScopeError::OutsideRoot)
            );
        }
        let _ = fs::remove_dir_all(&root);
    }
}
