//! Temporary find-materials grants (Phase2.5).
//! Process-local only — never restored across app restart.
//! Does not upgrade Home Focus "confirm project" into read permission.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::contracts::{ContextError, ScopeDto};
use super::scope::{open_at, require_main_window};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantFindMaterialsArgs {
    pub task_scope_id: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenConfirmedArgs {
    pub task_scope_id: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevokeGrantArgs {
    #[serde(default)]
    pub grant_id: Option<String>,
    #[serde(default)]
    pub task_scope_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantDto {
    pub grant_id: String,
    pub project_id: String,
    pub task_scope_id: String,
    pub display_name: String,
    /// Relative / leaf display only — never absolute path outbound.
    pub display_root: String,
}

#[derive(Debug, Clone)]
struct GrantRecord {
    grant_id: String,
    project_id: String,
    task_scope_id: String,
    window_label: String,
    /// Canonical root — backend only.
    root: PathBuf,
    display_name: String,
}

struct GrantTable {
    /// window_label -> active grant (one per main window)
    by_window: HashMap<String, GrantRecord>,
    by_id: HashMap<String, GrantRecord>,
}

fn table() -> &'static Mutex<GrantTable> {
    static T: OnceLock<Mutex<GrantTable>> = OnceLock::new();
    T.get_or_init(|| {
        Mutex::new(GrantTable {
            by_window: HashMap::new(),
            by_id: HashMap::new(),
        })
    })
}

fn new_grant_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = (ms % 1_000_000) as u32;
    format!("pcg_{ms}_{n}")
}

fn display_leaf(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "project".into())
}

/// Resolve confirmed project workspace path from agent_memory. Never trusts FE absolute paths.
fn resolve_confirmed_root(project_id: &str) -> Result<(PathBuf, String), ContextError> {
    let pid = project_id.trim();
    if pid.is_empty() {
        return Err(ContextError::InvalidPath);
    }
    #[cfg(test)]
    {
        if let Some(hit) = confirmed_root_override_get(pid) {
            return Ok(hit);
        }
    }
    crate::agent_memory::confirmed_workspace_root(pid).ok_or(ContextError::GrantRequired)
}

/// ponytail: process-global test map — agent_memory OnceLock can't rebind mid-suite; clear after each grant test.
#[cfg(test)]
fn confirmed_root_override_table() -> &'static Mutex<HashMap<String, (PathBuf, String)>> {
    static O: OnceLock<Mutex<HashMap<String, (PathBuf, String)>>> = OnceLock::new();
    O.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(test)]
fn confirmed_root_override_get(project_id: &str) -> Option<(PathBuf, String)> {
    confirmed_root_override_table()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(project_id)
        .cloned()
}

#[cfg(test)]
fn set_confirmed_root_override(project_id: &str, root: &Path, display_name: &str) {
    let canon = std::fs::canonicalize(root).expect("test root canonicalize");
    confirmed_root_override_table()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(
            project_id.trim().to_string(),
            (canon, display_name.to_string()),
        );
}

#[cfg(test)]
fn clear_confirmed_root_overrides() {
    confirmed_root_override_table()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clear();
}

/// Native user confirmation → temporary find-materials grant (session / process only).
pub fn grant_find_materials(
    window_label: &str,
    args: &GrantFindMaterialsArgs,
) -> Result<GrantDto, ContextError> {
    require_main_window(window_label)?;
    let task = args.task_scope_id.trim();
    let project_id = args.project_id.trim();
    if task.is_empty() || project_id.is_empty() {
        return Err(ContextError::InvalidPath);
    }
    let (root, name) = resolve_confirmed_root(project_id)?;
    let grant_id = new_grant_id();
    let display_name = if name.trim().is_empty() {
        display_leaf(&root)
    } else {
        name
    };
    let rec = GrantRecord {
        grant_id: grant_id.clone(),
        project_id: project_id.to_string(),
        task_scope_id: task.to_string(),
        window_label: window_label.to_string(),
        root,
        display_name: display_name.clone(),
    };
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(old) = g.by_window.remove(window_label) {
        g.by_id.remove(&old.grant_id);
    }
    g.by_window.insert(window_label.to_string(), rec.clone());
    g.by_id.insert(grant_id.clone(), rec.clone());
    Ok(GrantDto {
        grant_id,
        project_id: project_id.to_string(),
        task_scope_id: task.to_string(),
        display_name,
        display_root: display_leaf(&rec.root),
    })
}

fn require_matching_grant(
    window_label: &str,
    project_id: &str,
    task_scope_id: &str,
) -> Result<GrantRecord, ContextError> {
    let g = table().lock().unwrap_or_else(|e| e.into_inner());
    let rec = g
        .by_window
        .get(window_label)
        .cloned()
        .ok_or(ContextError::GrantRequired)?;
    if rec.project_id != project_id || rec.task_scope_id != task_scope_id {
        return Err(ContextError::GrantRequired);
    }
    Ok(rec)
}

/// Open scope only when a matching backend grant exists for this window/task/project.
pub fn open_confirmed(
    window_label: &str,
    args: &OpenConfirmedArgs,
) -> Result<ScopeDto, ContextError> {
    require_main_window(window_label)?;
    let task = args.task_scope_id.trim();
    let project_id = args.project_id.trim();
    if task.is_empty() || project_id.is_empty() {
        return Err(ContextError::InvalidPath);
    }
    let rec = require_matching_grant(window_label, project_id, task)?;
    // Re-validate root still matches confirmed project identity.
    let (root, _) = resolve_confirmed_root(project_id)?;
    if root != rec.root {
        revoke_window(window_label);
        return Err(ContextError::GrantRequired);
    }
    open_at(window_label, task, &rec.root)
}

pub fn revoke_grant(window_label: &str, args: &RevokeGrantArgs) -> Result<bool, ContextError> {
    require_main_window(window_label)?;
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    let Some(cur) = g.by_window.get(window_label).cloned() else {
        return Ok(false);
    };
    if let Some(gid) = args.grant_id.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if gid != cur.grant_id {
            return Ok(false);
        }
    }
    if let Some(ts) = args
        .task_scope_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if ts != cur.task_scope_id {
            return Ok(false);
        }
    }
    if let Some(pid) = args
        .project_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if pid != cur.project_id {
            return Ok(false);
        }
    }
    g.by_window.remove(window_label);
    g.by_id.remove(&cur.grant_id);
    Ok(true)
}

pub fn revoke_window(window_label: &str) {
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(old) = g.by_window.remove(window_label) {
        g.by_id.remove(&old.grant_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_context::scope::{close, test_scope_lock};
    use std::fs;

    fn tempfile_dir(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "ot_pc_grant_{tag}_{}_{}",
            std::process::id(),
            new_grant_id()
        ));
        let _ = fs::create_dir_all(&p);
        p
    }

    #[test]
    fn open_confirmed_without_grant_rejected() {
        let _g = test_scope_lock();
        clear_confirmed_root_overrides();
        revoke_window("main");
        let err = open_confirmed(
            "main",
            &OpenConfirmedArgs {
                task_scope_id: "ts_x".into(),
                project_id: "nonexistent-project".into(),
            },
        )
        .unwrap_err();
        assert!(
            matches!(err, ContextError::GrantRequired | ContextError::NotFound),
            "{err:?}"
        );
    }

    #[test]
    fn non_main_cannot_grant() {
        let err = grant_find_materials(
            "tray_menu",
            &GrantFindMaterialsArgs {
                task_scope_id: "ts".into(),
                project_id: "p".into(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContextError::WrongOwner);
    }

    #[test]
    fn grant_then_open_confirmed_ok() {
        let _g = test_scope_lock();
        clear_confirmed_root_overrides();
        revoke_window("main");
        let dir = tempfile_dir("ok");
        set_confirmed_root_override("proj_test", &dir, "proj_test");
        let grant = grant_find_materials(
            "main",
            &GrantFindMaterialsArgs {
                task_scope_id: "ts_ok".into(),
                project_id: "proj_test".into(),
            },
        )
        .expect("grant");
        assert_eq!(grant.project_id, "proj_test");
        assert_eq!(grant.task_scope_id, "ts_ok");
        let scope = open_confirmed(
            "main",
            &OpenConfirmedArgs {
                task_scope_id: "ts_ok".into(),
                project_id: "proj_test".into(),
            },
        )
        .expect("open_confirmed");
        assert_eq!(scope.task_scope_id, "ts_ok");
        let _ = close("main", &scope.scope_id);
        clear_confirmed_root_overrides();
        revoke_window("main");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_confirmed_rejects_when_confirmed_root_changed() {
        let _g = test_scope_lock();
        clear_confirmed_root_overrides();
        revoke_window("main");
        let a = tempfile_dir("a");
        let b = tempfile_dir("b");
        set_confirmed_root_override("proj_drift", &a, "proj_drift");
        grant_find_materials(
            "main",
            &GrantFindMaterialsArgs {
                task_scope_id: "ts_drift".into(),
                project_id: "proj_drift".into(),
            },
        )
        .expect("grant on A");
        set_confirmed_root_override("proj_drift", &b, "proj_drift");
        let err = open_confirmed(
            "main",
            &OpenConfirmedArgs {
                task_scope_id: "ts_drift".into(),
                project_id: "proj_drift".into(),
            },
        )
        .unwrap_err();
        assert_eq!(err, ContextError::GrantRequired);
        // Grant cleared by revoke_window inside open_confirmed.
        let err2 = open_confirmed(
            "main",
            &OpenConfirmedArgs {
                task_scope_id: "ts_drift".into(),
                project_id: "proj_drift".into(),
            },
        )
        .unwrap_err();
        assert_eq!(err2, ContextError::GrantRequired);
        clear_confirmed_root_overrides();
        revoke_window("main");
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }
}
