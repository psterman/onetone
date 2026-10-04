//! Project confirm / list helpers for Home Focus.

use crate::agent_memory::events::upsert_project;
use crate::agent_memory::project::{
    display_name_from_path, find_git_root, project_id_from_path, validate_workspace_path,
};
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use rusqlite::params;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownProjectDto {
    pub id: String,
    pub name: String,
    pub root: Option<String>,
    pub confirmed: bool,
}

pub fn is_project_confirmed(project_id: &str) -> bool {
    with_read_path(|conn| {
        let v: i64 = conn
            .query_row(
                "SELECT COALESCE(user_confirmed, 0) FROM projects WHERE project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(v != 0)
    })
    .unwrap_or(false)
}

pub fn confirm_project(
    project_root: Option<&str>,
    project_id: Option<&str>,
) -> Result<KnownProjectDto, String> {
    let (id, name, root, git) = if let Some(root_s) = project_root.map(str::trim).filter(|s| !s.is_empty())
    {
        let path = std::path::PathBuf::from(root_s);
        let canon = validate_workspace_path(&path)
            .ok_or_else(|| "project root invalid or missing".to_string())?;
        let id = project_id_from_path(&canon);
        let name = display_name_from_path(&canon);
        let git = find_git_root(&canon).map(|p| p.to_string_lossy().to_string());
        let root = canon.to_string_lossy().to_string();
        (id, name, Some(root), git)
    } else if let Some(pid) = project_id.map(str::trim).filter(|s| !s.is_empty()) {
        let row = with_read_path(|conn| {
            conn.query_row(
                "SELECT project_id, display_name, workspace_path, git_root
                 FROM projects WHERE project_id = ?1",
                params![pid],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .map_err(|e| format!("project not found: {e}"))
        })?;
        row
    } else {
        return Err("projectRoot or projectId required".into());
    };

    upsert_project(&id, &name, root.as_deref(), git.as_deref())?;
    let confirmed_at = now_ms() as i64;
    with_write(|conn| {
        conn.execute(
            "UPDATE projects SET user_confirmed = 1, confirmed_at_ms = ?1 WHERE project_id = ?2",
            params![confirmed_at, id],
        )
        .map_err(|e| format!("confirm project: {e}"))?;
        Ok(())
    })?;

    Ok(KnownProjectDto {
        id,
        name,
        root,
        confirmed: true,
    })
}

pub fn list_known_projects(limit: usize) -> Vec<KnownProjectDto> {
    let lim = limit.min(50).max(1) as i64;
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT project_id, display_name, workspace_path, COALESCE(user_confirmed, 0)
                 FROM projects
                 WHERE project_id != 'unknown-project'
                 ORDER BY COALESCE(confirmed_at_ms, detected_at_ms) DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("prepare list projects: {e}"))?;
        let rows = stmt
            .query_map(params![lim], |r| {
                Ok(KnownProjectDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    root: r.get(2)?,
                    confirmed: r.get::<_, i64>(3)? != 0,
                })
            })
            .map_err(|e| format!("query projects: {e}"))?;
        let mut out = Vec::new();
        for row in rows.flatten() {
            out.push(row);
        }
        Ok(out)
    })
    .unwrap_or_default()
}

/// Title-only candidate display (never used as PathBuf / project_id).
pub fn probable_name_from_title(title: Option<&str>) -> Option<String> {
    crate::agent_memory::workspace_evidence::title_project_token(title.unwrap_or(""))
}

#[allow(dead_code)]
pub fn project_root_exists(root: &Path) -> bool {
    validate_workspace_path(root).is_some()
}

