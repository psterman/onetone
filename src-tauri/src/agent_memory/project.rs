//! Multi-evidence project resolver (Plan A + Home Focus Exact gate).

use crate::agent_memory::model::{
    EvidenceTier, ProjectIdentity, ProjectMatch, WorkspaceEvidence, UNKNOWN_PROJECT_ID,
};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Canonical workspace root only when path exists, is file/dir, and canonicalize succeeds.
/// Files resolve to their parent directory.
pub fn validate_workspace_path(path: &Path) -> Option<PathBuf> {
    if !path.exists() {
        return None;
    }
    let root = if path.is_file() {
        path.parent()?.to_path_buf()
    } else if path.is_dir() {
        path.to_path_buf()
    } else {
        return None;
    };
    root.canonicalize().ok()
}

pub fn resolve_project(
    project_hint: Option<&Path>,
    workspace_evidence: Option<&WorkspaceEvidence>,
) -> (ProjectIdentity, ProjectMatch, String, f32) {
    if let Some(ev) = workspace_evidence {
        let raw = PathBuf::from(&ev.path);
        if let Some(canon) = validate_workspace_path(&raw) {
            let id = project_id_from_canon(&canon);
            let name = display_name_from_path(&canon);
            let git = find_git_root(&canon);
            let match_kind = match ev.tier {
                EvidenceTier::High => ProjectMatch::Exact,
                EvidenceTier::PathValid | EvidenceTier::Historic => ProjectMatch::Probable,
            };
            let conf = match match_kind {
                ProjectMatch::Exact => 0.9,
                ProjectMatch::Probable => 0.65,
                ProjectMatch::Unknown => 0.0,
            };
            return (
                ProjectIdentity {
                    project_id: id,
                    git_root: git.as_ref().map(|p| p.to_string_lossy().to_string()),
                    workspace_path: Some(canon.to_string_lossy().to_string()),
                    display_name: name,
                },
                match_kind,
                format!("workspace_evidence:{}:{}", ev.tier.as_str(), ev.source),
                conf,
            );
        }
        // Looks like a path but fails Exact gate — never Exact.
        return unknown("workspace_evidence_invalid");
    }

    if let Some(hint) = project_hint {
        // Hint alone is never Exact. Invalid/nonexistent path → Unknown (not fake Probable).
        if let Some(canon) = validate_workspace_path(hint) {
            let id = project_id_from_canon(&canon);
            let name = display_name_from_path(&canon);
            let git = find_git_root(&canon);
            return (
                ProjectIdentity {
                    project_id: id,
                    git_root: git.as_ref().map(|p| p.to_string_lossy().to_string()),
                    workspace_path: Some(canon.to_string_lossy().to_string()),
                    display_name: name,
                },
                ProjectMatch::Probable,
                "onetone_project_hint".into(),
                0.65,
            );
        }
        return unknown("project_hint_invalid");
    }

    unknown("no_workspace_evidence")
}

fn unknown(reason: &str) -> (ProjectIdentity, ProjectMatch, String, f32) {
    (
        ProjectIdentity {
            project_id: UNKNOWN_PROJECT_ID.into(),
            git_root: None,
            workspace_path: None,
            display_name: "未知项目".into(),
        },
        ProjectMatch::Unknown,
        reason.into(),
        0.0,
    )
}

pub fn project_id_from_path(path: &Path) -> String {
    let canon = validate_workspace_path(path).unwrap_or_else(|| path.to_path_buf());
    project_id_from_canon(&canon)
}

fn project_id_from_canon(canon: &Path) -> String {
    let s = canon.to_string_lossy().to_lowercase();
    let hash = Sha256::digest(s.as_bytes());
    format!("proj_{:x}", hash)
}

pub fn display_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "project".into())
}

pub fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut cur = if start.is_file() {
        start.parent()?.to_path_buf()
    } else {
        start.to_path_buf()
    };
    for _ in 0..8 {
        if cur.join(".git").exists() {
            return Some(cur);
        }
        cur = cur.parent()?.to_path_buf();
    }
    None
}

/// Pick active session among candidates for a project (A2b).
pub fn mark_active_sessions(
    sessions: &mut [crate::agent_memory::model::SessionCandidate],
    project_id: &str,
) {
    for s in sessions.iter_mut() {
        s.is_active = false;
        s.activity_source = "observed".into();
        s.active_confidence = 0.0;
    }
    let mut best: Option<usize> = None;
    let mut best_ts: u64 = 0;
    for (i, s) in sessions.iter().enumerate() {
        if s.project_id == project_id && s.project_match == ProjectMatch::Exact {
            let ts = s.updated_at.unwrap_or(0);
            if ts >= best_ts {
                best_ts = ts;
                best = Some(i);
            }
        }
    }
    if let Some(i) = best {
        sessions[i].is_active = true;
        sessions[i].activity_source = "observed".into();
        sessions[i].active_confidence = 0.85;
        return;
    }
    let mut best: Option<usize> = None;
    let mut best_ts: u64 = 0;
    for (i, s) in sessions.iter().enumerate() {
        if s.project_id != project_id {
            continue;
        }
        let ts = s.updated_at.unwrap_or(0);
        if ts >= best_ts {
            best_ts = ts;
            best = Some(i);
        }
    }
    if let Some(i) = best {
        sessions[i].activity_source = "observed".into();
        sessions[i].active_confidence = 0.35;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_memory::model::SessionCandidate;
    use std::fs;

    fn cand(ext: &str, project: &str, m: ProjectMatch, ts: u64) -> SessionCandidate {
        SessionCandidate {
            provider: "cursor".into(),
            external_session_id: ext.into(),
            project_id: project.into(),
            project_match: m,
            match_reason: "test".into(),
            match_confidence: 0.5,
            started_at: Some(ts),
            updated_at: Some(ts),
            title: Some(ext.into()),
            is_active: false,
            activity_source: "observed".into(),
            active_confidence: 0.0,
            workspace_evidence: None,
        }
    }

    #[test]
    fn exact_newest_is_active_probable_is_not() {
        let mut sessions = vec![
            cand("a", "p1", ProjectMatch::Probable, 200),
            cand("b", "p1", ProjectMatch::Exact, 100),
            cand("c", "p1", ProjectMatch::Exact, 150),
        ];
        mark_active_sessions(&mut sessions, "p1");
        assert!(!sessions[0].is_active);
        assert!(!sessions[1].is_active);
        assert!(sessions[2].is_active);
        assert!(sessions[2].active_confidence > 0.5);
    }

    #[test]
    fn recent_without_exact_is_not_active() {
        let mut sessions = vec![cand("a", "p1", ProjectMatch::Unknown, 999)];
        mark_active_sessions(&mut sessions, "p1");
        assert!(
            !sessions[0].is_active,
            "recent must not pretend to be active"
        );
        assert!(sessions[0].active_confidence < 0.5);
    }

    #[test]
    fn fake_path_with_slash_is_not_exact() {
        let ev = WorkspaceEvidence {
            path: r"E:\does\not\exist\voice-pilot".into(),
            source: "test".into(),
            tier: EvidenceTier::High,
        };
        let (_id, m, reason, _) = resolve_project(None, Some(&ev));
        assert_eq!(m, ProjectMatch::Unknown);
        assert!(reason.contains("invalid"));
    }

    #[test]
    fn nonexistent_hint_is_unknown_not_probable() {
        let hint = PathBuf::from(r"E:\missing\project-name");
        let (_id, m, reason, _) = resolve_project(Some(&hint), None);
        assert_eq!(m, ProjectMatch::Unknown);
        assert_eq!(reason, "project_hint_invalid");
    }

    #[test]
    fn display_name_only_hint_is_unknown() {
        let hint = PathBuf::from("voice-pilot");
        let (_id, m, _, _) = resolve_project(Some(&hint), None);
        assert_eq!(m, ProjectMatch::Unknown);
    }

    #[test]
    fn existing_dir_high_evidence_is_exact() {
        let dir = std::env::temp_dir().join(format!("onetone_proj_exact_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let ev = WorkspaceEvidence {
            path: dir.to_string_lossy().to_string(),
            source: "test".into(),
            tier: EvidenceTier::High,
        };
        let (id, m, _, conf) = resolve_project(None, Some(&ev));
        assert_eq!(m, ProjectMatch::Exact);
        assert!(conf > 0.8);
        assert_ne!(id.project_id, UNKNOWN_PROJECT_ID);
        assert!(id.workspace_path.is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn existing_dir_path_valid_is_probable_not_exact() {
        let dir =
            std::env::temp_dir().join(format!("onetone_proj_probable_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let ev = WorkspaceEvidence {
            path: dir.to_string_lossy().to_string(),
            source: "workspaceStorage".into(),
            tier: EvidenceTier::PathValid,
        };
        let (_id, m, _, _) = resolve_project(None, Some(&ev));
        assert_eq!(m, ProjectMatch::Probable);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn path_traversal_nonexistent_is_unknown() {
        let dir = std::env::temp_dir().join(format!("onetone_proj_base_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let bogus = dir.join("..").join("definitely-missing-onetone-xyz");
        let ev = WorkspaceEvidence {
            path: bogus.to_string_lossy().to_string(),
            source: "test".into(),
            tier: EvidenceTier::High,
        };
        let (_id, m, _, _) = resolve_project(None, Some(&ev));
        assert_eq!(m, ProjectMatch::Unknown);
        let _ = fs::remove_dir_all(&dir);
    }
}
