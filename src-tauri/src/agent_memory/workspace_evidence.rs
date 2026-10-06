//! Cursor workspaceStorage evidence — graded candidates, never auto-Exact from scan alone.

use crate::agent_memory::model::{EvidenceTier, WorkspaceEvidence};
use crate::agent_memory::project::validate_workspace_path;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const HISTORIC_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days

#[derive(Debug, Clone)]
pub struct WorkspaceCandidate {
    pub path: PathBuf,
    pub source: String,
    pub tier: EvidenceTier,
    pub mtime_ms: u64,
    pub display_name: String,
}

#[derive(Debug, Clone)]
pub enum EvidenceSelection {
    /// Single High-tier current-window match.
    High(WorkspaceEvidence),
    /// One PathValid/Historic candidate (probable).
    Probable(WorkspaceEvidence),
    /// Multiple valid candidates — caller must ask user.
    Ambiguous(Vec<WorkspaceCandidate>),
    None,
}

pub fn cursor_workspace_storage_root() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    let root = PathBuf::from(appdata)
        .join("Cursor")
        .join("User")
        .join("workspaceStorage");
    if root.is_dir() {
        Some(root)
    } else {
        None
    }
}

/// Scan workspaceStorage; classify by current window title + mtime.
/// Hard rule: scanned json alone never becomes Exact — only High (title-aligned current) can.
pub fn select_workspace_evidence(window_title: Option<&str>, now_ms: u64) -> EvidenceSelection {
    let root = match cursor_workspace_storage_root() {
        Some(r) => r,
        None => return EvidenceSelection::None,
    };
    let mut cands = scan_workspace_storage(&root, now_ms);
    if cands.is_empty() {
        return EvidenceSelection::None;
    }

    let title = window_title.unwrap_or("").trim();
    let title_token = title_project_token(title);

    // Promote to High only when unique title alignment with a valid path.
    if let Some(tok) = title_token.as_deref() {
        let mut high_hits: Vec<usize> = Vec::new();
        for (i, c) in cands.iter().enumerate() {
            if name_matches(&c.display_name, tok) || path_matches(&c.path, tok) {
                high_hits.push(i);
            }
        }
        if high_hits.len() == 1 {
            let i = high_hits[0];
            cands[i].tier = EvidenceTier::High;
            return EvidenceSelection::High(to_evidence(&cands[i]));
        }
        if high_hits.len() > 1 {
            let amb: Vec<_> = high_hits.into_iter().map(|i| cands[i].clone()).collect();
            return EvidenceSelection::Ambiguous(amb);
        }
    }

    // No current-window High: PathValid / Historic only → Probable or Ambiguous.
    let valid: Vec<_> = cands
        .into_iter()
        .filter(|c| validate_workspace_path(&c.path).is_some())
        .collect();
    match valid.len() {
        0 => EvidenceSelection::None,
        1 => EvidenceSelection::Probable(to_evidence(&valid[0])),
        _ => EvidenceSelection::Ambiguous(valid),
    }
}

fn to_evidence(c: &WorkspaceCandidate) -> WorkspaceEvidence {
    WorkspaceEvidence {
        path: c.path.to_string_lossy().to_string(),
        source: c.source.clone(),
        tier: c.tier.clone(),
    }
}

fn scan_workspace_storage(root: &Path, now_ms: u64) -> Vec<WorkspaceCandidate> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let json_path = dir.join("workspace.json");
        if !json_path.is_file() {
            continue;
        }
        let mtime_ms = file_mtime_ms(&json_path);
        let raw = match fs::read_to_string(&json_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let val: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for folder in extract_folder_uris(&val) {
            let Some(path) = uri_to_path(&folder) else {
                continue;
            };
            let Some(canon) = validate_workspace_path(&path) else {
                continue;
            };
            let age = now_ms.saturating_sub(mtime_ms);
            let tier = if age > HISTORIC_AGE_MS {
                EvidenceTier::Historic
            } else {
                EvidenceTier::PathValid
            };
            let display_name = canon
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("project")
                .to_string();
            out.push(WorkspaceCandidate {
                path: canon,
                source: format!("workspaceStorage:{}", entry.file_name().to_string_lossy()),
                tier,
                mtime_ms,
                display_name,
            });
        }
    }
    // Newest first.
    out.sort_by(|a, b| b.mtime_ms.cmp(&a.mtime_ms));
    // Dedupe by path.
    let mut seen = std::collections::HashSet::new();
    out.retain(|c| seen.insert(c.path.to_string_lossy().to_lowercase()));
    out
}

fn extract_folder_uris(val: &Value) -> Vec<String> {
    let mut uris = Vec::new();
    if let Some(f) = val.get("folder").and_then(|x| x.as_str()) {
        uris.push(f.to_string());
    }
    if let Some(arr) = val.get("folders").and_then(|x| x.as_array()) {
        for item in arr {
            if let Some(u) = item.get("uri").and_then(|x| x.as_str()) {
                uris.push(u.to_string());
            } else if let Some(u) = item.get("path").and_then(|x| x.as_str()) {
                uris.push(u.to_string());
            }
        }
    }
    uris
}

fn uri_to_path(uri: &str) -> Option<PathBuf> {
    let u = uri.trim();
    if u.is_empty() {
        return None;
    }
    // file:///C:/foo or file://c%3A/foo
    if let Some(rest) = u.strip_prefix("file:///") {
        let decoded = percent_decode(rest);
        // Windows: C:/path
        return Some(PathBuf::from(decoded.replace('/', "\\")));
    }
    if let Some(rest) = u.strip_prefix("file://") {
        let decoded = percent_decode(rest);
        return Some(PathBuf::from(decoded.replace('/', "\\")));
    }
    // Plain path
    if u.contains(':') || u.starts_with('/') || u.starts_with('\\') {
        return Some(PathBuf::from(u));
    }
    None
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn file_mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Same title-split heuristic as FG context — display token only, never a path.
pub fn title_project_token(title: &str) -> Option<String> {
    let title = title.trim();
    if title.is_empty() {
        return None;
    }
    let parts: Vec<&str> = {
        let mut out = Vec::new();
        let mut rest = title;
        loop {
            let idx = [" — ", " – ", " - "]
                .iter()
                .filter_map(|sep| rest.find(sep).map(|i| (i, sep.len())))
                .min_by_key(|(i, _)| *i);
            match idx {
                Some((i, sep_len)) => {
                    let (head, tail) = rest.split_at(i);
                    if !head.trim().is_empty() {
                        out.push(head.trim());
                    }
                    rest = tail[sep_len..].trim_start();
                }
                None => {
                    if !rest.trim().is_empty() {
                        out.push(rest.trim());
                    }
                    break;
                }
            }
        }
        out
    };
    let cand = if parts.len() >= 2 {
        parts[parts.len() - 2]
    } else {
        parts.first().copied().unwrap_or("")
    };
    let mut cand = cand
        .split(['·', '|'])
        .next()
        .unwrap_or(cand)
        .trim()
        .to_string();
    for ext in [
        ".tsx", ".ts", ".jsx", ".js", ".rs", ".py", ".md", ".json", ".html", ".htm",
    ] {
        if cand.to_ascii_lowercase().ends_with(ext) {
            cand.truncate(cand.len() - ext.len());
            break;
        }
    }
    cand = cand.trim().to_string();
    if cand.len() < 2 || cand.len() > 48 {
        return None;
    }
    if matches!(
        cand.to_ascii_lowercase().as_str(),
        "untitled" | "无标题" | "new folder" | "desktop" | "cursor"
    ) {
        return None;
    }
    Some(cand)
}

fn name_matches(display: &str, token: &str) -> bool {
    display.eq_ignore_ascii_case(token)
}

fn path_matches(path: &Path, token: &str) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|n| n.eq_ignore_ascii_case(token))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_file_windows() {
        let p = uri_to_path("file:///C:/Users/me/voice-pilot").unwrap();
        assert!(p.to_string_lossy().contains("voice-pilot"));
    }

    #[test]
    fn title_token_from_cursor_title() {
        let t = title_project_token("project.rs — voice-pilot — Cursor");
        assert_eq!(t.as_deref(), Some("voice-pilot"));
    }

    #[test]
    fn empty_storage_is_none() {
        // Nonexistent APPDATA path handled by select — just ensure scan empty dir.
        let dir = std::env::temp_dir().join(format!("onetone_ws_empty_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let cands = scan_workspace_storage(&dir, 1_000_000);
        assert!(cands.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn historic_scan_is_not_high() {
        let root = std::env::temp_dir().join(format!("onetone_ws_hist_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let ws = root.join("abc123");
        fs::create_dir_all(&ws).unwrap();
        let project = root.join("my-app");
        fs::create_dir_all(&project).unwrap();
        let folder_uri = format!("file:///{}", project.to_string_lossy().replace('\\', "/"));
        fs::write(
            ws.join("workspace.json"),
            format!(r#"{{"folder":"{}"}}"#, folder_uri),
        )
        .unwrap();
        let now = 10_000_000_000u64;
        let mut cands = scan_workspace_storage(&root, now);
        // Force historic by age if mtime is "now" — still PathValid or Historic, never High from scan.
        assert!(!cands.is_empty());
        assert!(cands.iter().all(|c| c.tier != EvidenceTier::High));
        // Ambiguous/Probable path via select without title → not High
        cands[0].tier = EvidenceTier::PathValid;
        let ev = to_evidence(&cands[0]);
        assert_ne!(ev.tier, EvidenceTier::High);
        let _ = fs::remove_dir_all(&root);
    }
}
