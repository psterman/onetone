//! Restart interrupt + resume that re-inspects before continuing.

use std::path::Path;

use rusqlite::Connection;
use serde_json::json;

use super::contracts::TaskStatus;
use super::scope;
use super::store::{append_event_and_update_task, get_task, interrupt_active_tasks, now_ms, TaskRow};
use super::tools;

/// Call once on process boot.
pub fn on_process_start(conn: &mut Connection) -> Result<usize, String> {
    interrupt_active_tasks(conn)
}

/// Resume: re-inspect workspace, recompute dirty, then choose waiting/running/interrupted.
pub fn resume_task(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    let st = TaskStatus::parse(&task.status);
    if !matches!(
        st,
        Some(TaskStatus::Interrupted) | Some(TaskStatus::Waiting)
    ) {
        return Err("not_resumable".into());
    }

    let live = scope::open_workspace(Path::new(&task.workspace_root))?;
    let inspect = tools::inspect_workspace(&live);
    let baseline: Vec<String> = serde_json::from_str(&task.baseline_dirty_json).unwrap_or_default();
    let changed: Vec<String> = serde_json::from_str(&task.changed_files_json).unwrap_or_default();

    let mut conflict = false;
    for rel in &changed {
        let abs = match scope::resolve_in_root(&live.root, rel) {
            Ok(p) => p,
            Err(_) => {
                conflict = true;
                break;
            }
        };
        if let Ok(h) = scope::file_hash(&abs) {
            let fps: serde_json::Map<String, serde_json::Value> =
                serde_json::from_str(&task.fingerprints_json).unwrap_or_default();
            if let Some(prev) = fps.get(rel).and_then(|v| v.as_str()) {
                if prev != h {
                    conflict = true;
                    break;
                }
            }
        }
    }

    let external_new: Vec<_> = live
        .baseline_dirty
        .iter()
        .filter(|d| !baseline.iter().any(|b| b == *d) && !changed.iter().any(|c| c == *d))
        .cloned()
        .collect();

    let next_status = if conflict {
        TaskStatus::Interrupted
    } else if task.pending_approval_token.is_some() {
        TaskStatus::Waiting
    } else if !external_new.is_empty() {
        // Safe to read/run but writes must pause — surface as waiting if no pending patch.
        TaskStatus::Running
    } else {
        TaskStatus::Running
    };

    task.status = next_status.as_str().into();
    task.waiting_reason = match next_status {
        TaskStatus::Waiting => task.waiting_reason.clone().or(Some("approval".into())),
        TaskStatus::Interrupted => Some("external_change".into()),
        _ => None,
    };
    task.updated_at = now_ms();

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let ev = append_event_and_update_task(
        &tx,
        &task,
        "resumed_inspect",
        Some("inspect_workspace"),
        json!({
            "inspect": inspect,
            "externalNewDirty": external_new,
            "conflict": conflict,
            "nextStatus": next_status.as_str(),
        }),
    )?;
    let updated = get_task(&tx, task_id)?.ok_or("missing")?;
    tx.commit().map_err(|e| e.to_string())?;
    super::engine::sync_memory_checkpoint(&updated, Some(&ev.event_id));
    Ok(updated)
}

pub fn abandon_task(conn: &mut Connection, task_id: &str) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or("task_not_found")?;
    task.status = TaskStatus::Cancelled.as_str().into();
    task.waiting_reason = Some("abandoned".into());
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let ev = append_event_and_update_task(
        &tx,
        &task,
        "cancelled",
        None,
        json!({"reason": "abandoned"}),
    )?;
    let updated = get_task(&tx, task_id)?.ok_or("missing")?;
    tx.commit().map_err(|e| e.to_string())?;
    super::engine::sync_memory_checkpoint(&updated, Some(&ev.event_id));
    super::cancel::finish(task_id);
    Ok(updated)
}
