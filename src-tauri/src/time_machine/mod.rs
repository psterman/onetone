//! OneTone Time Machine — Git worktree checkpoints + operation log.
//! Restore truth = git refs under refs/onetone/op/*. Agent context is display-only.

mod git_ops;
mod oplog;
mod store;
mod types;

pub use types::*;

use std::path::{Path, PathBuf};

use parking_lot::Mutex;

static TM_LOCK: Mutex<()> = Mutex::new(());

fn with_lock<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = TM_LOCK.lock();
    f()
}

pub fn sidecar_root_for(workspace: &Path) -> PathBuf {
    store::sidecar_dir(workspace)
}

pub fn status(workspace: Option<&str>, agent_busy: bool) -> TmStatus {
    let config = store::load_config();
    let ws = workspace
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .or_else(|| config.workspace_path.as_deref().map(PathBuf::from));

    let Some(ws) = ws else {
        return TmStatus {
            level: "L0".into(),
            workspace: String::new(),
            recent_workspaces: store::recent_workspace_paths(),
            is_git: false,
            dirty_fingerprint: String::new(),
            agent_busy,
            block_reason: Some("未选择项目目录".into()),
            tip_id: None,
            tip_label: None,
            changed_count: 0,
            auto_save_enabled: config.auto_save_enabled,
            auto_save_interval_min: config.auto_save_interval_min,
            last_auto_save_at: config.last_auto_save_at,
        };
    };

    let ws_str = ws.to_string_lossy().to_string();
    if !git_ops::is_git_repo(&ws) {
        return TmStatus {
            level: "L0".into(),
            workspace: ws_str,
            recent_workspaces: store::recent_workspace_paths(),
            is_git: false,
            dirty_fingerprint: String::new(),
            agent_busy,
            block_reason: Some("当前项目还没有开启版本保护（需要 Git 仓库）".into()),
            tip_id: None,
            tip_label: None,
            changed_count: 0,
            auto_save_enabled: config.auto_save_enabled,
            auto_save_interval_min: config.auto_save_interval_min,
            last_auto_save_at: store::last_auto_save_at_for(&ws),
        };
    }

    // ponytail: no full `git status` here — huge untracked trees (e.g. target/) freeze the UI.
    // Dirty fingerprint is taken only on restore preflight in git_ops.
    let tip = oplog::tip_op(&ws);
    let block = git_ops::conflict_block_reason(&ws);

    TmStatus {
        level: if block.is_some() {
            "L0".into()
        } else {
            "L1".into()
        },
        workspace: ws_str,
        recent_workspaces: store::recent_workspace_paths(),
        is_git: true,
        dirty_fingerprint: String::new(),
        agent_busy,
        block_reason: block,
        tip_id: tip.as_ref().map(|o| o.id.clone()),
        tip_label: tip.and_then(|o| {
            if o.label.as_ref().map(|s| !s.is_empty()).unwrap_or(false) {
                o.label
            } else {
                Some(format!("最近 {}", short_time(&o.created_at)))
            }
        }),
        changed_count: 0,
        auto_save_enabled: config.auto_save_enabled,
        auto_save_interval_min: config.auto_save_interval_min,
        last_auto_save_at: store::last_auto_save_at_for(&ws),
    }
}

fn short_time(iso: &str) -> String {
    // "2026-08-01T10:42:31+08:00" -> "10:42"
    if let Some(t) = iso.split('T').nth(1) {
        return t.chars().take(5).collect();
    }
    iso.chars().take(16).collect()
}

pub fn set_workspace(path: &str) -> Result<TmStatus, String> {
    with_lock(|| {
        let p = PathBuf::from(path.trim());
        if p.as_os_str().is_empty() || !p.is_absolute() {
            return Err("路径必须是绝对路径".into());
        }
        if !p.is_dir() {
            return Err("目录不存在".into());
        }
        store::save_workspace_path(&p)?;
        Ok(status(Some(&p.to_string_lossy()), false))
    })
}

pub fn set_autosave(
    enabled: bool,
    interval_min: u32,
    agent_busy: bool,
) -> Result<TmStatus, String> {
    with_lock(|| {
        if !matches!(interval_min, 5 | 15 | 30 | 60) {
            return Err("自动保存间隔只支持 5、15、30 或 60 分钟".into());
        }
        let mut config = store::load_config();
        config.auto_save_enabled = enabled;
        config.auto_save_interval_min = interval_min;
        store::save_config(&config)?;
        Ok(status(None, agent_busy))
    })
}

pub fn list(workspace: Option<&str>) -> Result<Vec<TmOp>, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        if !git_ops::is_git_repo(&ws) {
            return Ok(vec![]);
        }
        Ok(oplog::list_ops(&ws, 240))
    })
}

pub fn create(
    workspace: Option<&str>,
    trigger_source: &str,
    label: Option<String>,
    agent_context: AgentContext,
) -> Result<TmOp, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        git_ops::create_checkpoint(&ws, trigger_source, label, agent_context, None, None)
    })
}

pub fn run_autosave(
    workspace: Option<&str>,
    agent_busy: bool,
    agent_context: AgentContext,
) -> Result<TmCreateResult, String> {
    with_lock(|| {
        let config = store::load_config();
        if !config.auto_save_enabled {
            return Ok(skipped("disabled"));
        }
        if agent_busy {
            return Ok(skipped("busy"));
        }
        let ws = match resolve_ws(workspace) {
            Ok(ws) => ws,
            Err(_) => return Ok(skipped("unavailable")),
        };
        if !git_ops::is_git_repo(&ws) {
            return Ok(skipped("unavailable"));
        }
        if git_ops::conflict_block_reason(&ws).is_some() {
            return Ok(skipped("conflict"));
        }
        let result = create_scheduled_unlocked(&ws, agent_context)?;
        let Some(ref op) = result.op else {
            return Ok(result);
        };
        store::save_last_auto_save_at(&ws, &op.created_at)?;
        Ok(result)
    })
}

/// Create a scheduled checkpoint without consulting the global enabled/due setting.
/// The scheduler uses `run_autosave`; this entry point keeps dirty-check behavior testable.
pub fn create_scheduled(
    workspace: Option<&str>,
    agent_context: AgentContext,
) -> Result<TmCreateResult, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        create_scheduled_unlocked(&ws, agent_context)
    })
}

fn create_scheduled_unlocked(
    workspace: &Path,
    agent_context: AgentContext,
) -> Result<TmCreateResult, String> {
    let Some(op) = git_ops::create_scheduled_checkpoint(workspace, agent_context)? else {
        return Ok(skipped("unchanged"));
    };
    Ok(TmCreateResult {
        created: true,
        skipped_reason: None,
        op: Some(op),
    })
}

fn skipped(reason: &str) -> TmCreateResult {
    TmCreateResult {
        created: false,
        skipped_reason: Some(reason.into()),
        op: None,
    }
}

pub fn preview_restore(workspace: Option<&str>, target_id: &str) -> Result<RestorePreview, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        git_ops::preview_restore(&ws, target_id)
    })
}

pub fn restore(
    workspace: Option<&str>,
    target_id: &str,
    confirm_delete_count: u32,
    agent_busy: bool,
    agent_context: AgentContext,
) -> Result<RestoreResult, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        if agent_busy {
            return Err("建议先停止当前 AI 操作后再恢复".into());
        }
        let fp1 = git_ops::dirty_fingerprint(&ws)?;
        let safety = git_ops::create_checkpoint(
            &ws,
            "safety_before_restore",
            Some("恢复前自动保存".into()),
            agent_context.clone(),
            None,
            None,
        )?;
        let fp2 = git_ops::dirty_fingerprint(&ws)?;
        if fp1 != fp2 {
            return Err("工作区在打 safety 期间发生变化，已取消恢复（safety 已保存）".into());
        }
        let preview = git_ops::preview_restore(&ws, target_id)?;
        if preview.delete_count != confirm_delete_count {
            return Err(format!(
                "删除数量已变化（预期 {}，当前 {}），请重新预览确认",
                confirm_delete_count, preview.delete_count
            ));
        }
        git_ops::apply_restore(&ws, target_id, &safety.id, &preview, agent_context)
    })
}

pub fn undo_restore(
    workspace: Option<&str>,
    restore_op_id: &str,
    agent_context: AgentContext,
) -> Result<RestoreResult, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        let ops = oplog::list_ops(&ws, 50);
        let restore_op = ops
            .iter()
            .find(|o| o.id == restore_op_id)
            .ok_or_else(|| "找不到该恢复操作".to_string())?;
        let safety_id = restore_op
            .restore
            .as_ref()
            .and_then(|r| r.safety_id.clone())
            .ok_or_else(|| "该操作没有 safety 记录".to_string())?;
        // Undo = restore safety (with a new safety of current state)
        let fp1 = git_ops::dirty_fingerprint(&ws)?;
        let safety = git_ops::create_checkpoint(
            &ws,
            "safety_before_restore",
            Some("撤销恢复前自动保存".into()),
            agent_context.clone(),
            None,
            None,
        )?;
        let fp2 = git_ops::dirty_fingerprint(&ws)?;
        if fp1 != fp2 {
            return Err("工作区在打 safety 期间发生变化，已取消撤销".into());
        }
        let preview = git_ops::preview_restore(&ws, &safety_id)?;
        git_ops::apply_restore(&ws, &safety_id, &safety.id, &preview, agent_context)
    })
}

pub fn diff_summary(workspace: Option<&str>, op_id: &str) -> Result<DiffSummary, String> {
    with_lock(|| {
        let ws = resolve_ws(workspace)?;
        require_git_ok(&ws)?;
        git_ops::diff_summary(&ws, op_id)
    })
}

fn resolve_ws(workspace: Option<&str>) -> Result<PathBuf, String> {
    if let Some(w) = workspace.map(str::trim).filter(|s| !s.is_empty()) {
        return Ok(PathBuf::from(w));
    }
    store::load_workspace_path().ok_or_else(|| "未选择项目目录".to_string())
}

fn require_git_ok(ws: &Path) -> Result<(), String> {
    if !git_ops::is_git_repo(ws) {
        return Err("当前项目还没有开启版本保护（需要 Git 仓库）".into());
    }
    if let Some(reason) = git_ops::conflict_block_reason(ws) {
        return Err(reason);
    }
    Ok(())
}
