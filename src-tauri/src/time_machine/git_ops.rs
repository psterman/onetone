use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::oplog;
use super::store;
use super::types::{
    chrono_now, new_op_id, AgentContext, DiffFile, DiffSummary, OpStats, RestoreMeta,
    RestorePreview, RestoreResult, TmOp,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Git subprocess with no console flash on Windows.
pub(super) fn command_git() -> Command {
    let mut cmd = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn is_git_repo(workspace: &Path) -> bool {
    git(workspace, &["rev-parse", "--is-inside-work-tree"])
        .ok()
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

pub fn conflict_block_reason(workspace: &Path) -> Option<String> {
    let git_dir = git(workspace, &["rev-parse", "--git-dir"]).ok()?;
    let git_dir = workspace.join(git_dir.trim());
    let markers = [
        ("MERGE_HEAD", "正在 merge，禁止恢复"),
        ("REBASE_HEAD", "正在 rebase，禁止恢复"),
        ("CHERRY_PICK_HEAD", "正在 cherry-pick，禁止恢复"),
        ("REVERT_HEAD", "正在 revert，禁止恢复"),
    ];
    for (name, msg) in markers {
        if git_dir.join(name).exists() {
            return Some(msg.into());
        }
    }
    // Unmerged index entries
    if let Ok(out) = git(workspace, &["diff", "--name-only", "--diff-filter=U"]) {
        if !out.trim().is_empty() {
            return Some("索引存在冲突文件，禁止恢复".into());
        }
    }
    None
}

pub fn dirty_fingerprint(workspace: &Path) -> Result<String, String> {
    // -uno: skip untracked enumeration (target/ etc. can freeze for minutes).
    // Tracked dirty is enough to detect concurrent agent writes mid-restore.
    let porcelain = git(workspace, &["status", "--porcelain=v1", "-uno"])?;
    Ok(simple_hash(&porcelain))
}

pub fn count_porcelain_changes(workspace: &Path) -> Result<u32, String> {
    let porcelain = git(workspace, &["status", "--porcelain=v1", "-uno"])?;
    Ok(porcelain.lines().filter(|l| !l.trim().is_empty()).count() as u32)
}

pub fn create_checkpoint(
    workspace: &Path,
    trigger_source: &str,
    label: Option<String>,
    agent_context: AgentContext,
    restore_target: Option<String>,
    restore_safety: Option<String>,
) -> Result<TmOp, String> {
    create_checkpoint_inner(
        workspace,
        trigger_source,
        label,
        agent_context,
        restore_target,
        restore_safety,
        false,
    )?
    .ok_or_else(|| "恢复点未创建".to_string())
}

pub fn create_scheduled_checkpoint(
    workspace: &Path,
    agent_context: AgentContext,
) -> Result<Option<TmOp>, String> {
    create_checkpoint_inner(
        workspace,
        "scheduled",
        None,
        agent_context,
        None,
        None,
        true,
    )
}

fn create_checkpoint_inner(
    workspace: &Path,
    trigger_source: &str,
    label: Option<String>,
    agent_context: AgentContext,
    restore_target: Option<String>,
    restore_safety: Option<String>,
    skip_unchanged: bool,
) -> Result<Option<TmOp>, String> {
    if let Some(reason) = conflict_block_reason(workspace) {
        return Err(reason);
    }

    // Scheduled path must not `git add -A` just to discover "clean" — that freezes large repos
    // (e.g. voice-pilot) and holds TM_LOCK so desk open/list looks like 假死.
    if skip_unchanged {
        let dirty = count_porcelain_changes(workspace).unwrap_or(1);
        if dirty == 0 {
            return Ok(None);
        }
    }

    let id = new_op_id();
    let created_at = chrono_now();
    let base_head = git(workspace, &["rev-parse", "HEAD"])
        .ok()
        .map(|sha| sha.trim().to_string());
    let parent_commit = oplog::tip_commit(workspace);
    let parent_op = parent_commit
        .as_ref()
        .and_then(|_| oplog::tip_op(workspace).map(|o| o.id));

    let tree = snapshot_worktree_tree(workspace, &id, base_head.as_deref())?;

    if skip_unchanged {
        if let Some(compare_commit) = parent_commit.as_ref().or(base_head.as_ref()) {
            let tip_tree = git(workspace, &["show", "-s", "--format=%T", compare_commit])?;
            if tip_tree.trim() == tree {
                return Ok(None);
            }
        }
    }

    let kind = if trigger_source == "safety_before_restore" {
        "safety_before_restore"
    } else if restore_target.is_some() {
        "restore"
    } else {
        "checkpoint"
    };

    let mut msg = format!("OneTone Time Machine ({kind})\n\n");
    msg.push_str(&format!("onetone-id: {id}\n"));
    msg.push_str(&format!("onetone-trigger: {trigger_source}\n"));
    if let Some(ref h) = base_head {
        msg.push_str(&format!("onetone-base-head: {h}\n"));
    }

    let mut commit_args = vec!["commit-tree".to_string(), tree.clone()];
    if let Some(ref p) = parent_commit {
        commit_args.push("-p".into());
        commit_args.push(p.clone());
    }
    commit_args.push("-m".into());
    commit_args.push(msg);

    let commit = git_args(workspace, &commit_args)?.trim().to_string();
    let git_ref = format!("refs/onetone/op/{id}");
    git(workspace, &["update-ref", &git_ref, &commit])?;
    oplog::update_tip(workspace, &commit)?;

    let stats = stats_vs_parent(workspace, &commit, parent_commit.as_deref())?;

    let op = TmOp {
        id: id.clone(),
        kind: kind.into(),
        workspace: workspace.to_string_lossy().to_string(),
        git_ref: git_ref.clone(),
        parent_op,
        base_head,
        created_at,
        label,
        trigger_source: trigger_source.into(),
        agent_context,
        stats,
        restore: if restore_target.is_some() || restore_safety.is_some() {
            Some(RestoreMeta {
                target_id: restore_target,
                safety_id: restore_safety,
            })
        } else {
            None
        },
        commit: Some(commit),
    };

    store::write_metadata(workspace, &op)?;
    store::append_oplog(workspace, &op)?;
    prune_old(workspace)?;
    Ok(Some(op))
}

pub fn preview_restore(workspace: &Path, target_id: &str) -> Result<RestorePreview, String> {
    let target = resolve_op(workspace, target_id)?;
    let target_commit = target
        .commit
        .clone()
        .ok_or_else(|| "目标恢复点缺少 commit".to_string())?;

    // Compare worktree+index to target without materializing a tree via `git add -A`.
    // That path freezes large repos (voice-pilot) and makes the Soft Pad window 未响应.
    // `git diff TARGET` is TARGET → worktree: A = only in WT (delete on restore),
    // D/M = only in target or different (overwrite on restore).
    let changes = git(workspace, &["diff", "--name-status", &target_commit])?;
    let mut overwrite = Vec::new();
    let mut delete = Vec::new();
    for line in changes.lines() {
        let mut parts = line.split('\t');
        let status = parts.next().unwrap_or("M");
        let paths: Vec<_> = parts.collect();
        let path = paths.last().copied().unwrap_or("").replace('\\', "/");
        if path.is_empty() {
            continue;
        }
        match status.chars().next().unwrap_or('M') {
            'A' => delete.push(path),
            _ => overwrite.push(path),
        }
    }

    // Untracked (non-ignored) paths are also removed by restore; keep listing cheap.
    if let Ok(st) = git(workspace, &["status", "--porcelain=v1", "-unormal"]) {
        for line in st.lines() {
            let Some(rest) = line.strip_prefix("?? ") else {
                continue;
            };
            let path = rest
                .trim()
                .trim_matches('"')
                .trim_end_matches('/')
                .replace('\\', "/");
            if path.is_empty() || is_heavy_untracked_path(&path) {
                continue;
            }
            delete.push(path);
        }
    }

    Ok(RestorePreview {
        overwrite_count: overwrite.len() as u32,
        delete_count: delete.len() as u32,
        keep_note: "已忽略文件、范围外路径与子模块内部内容会保留".into(),
        overwrite_sample: overwrite.into_iter().take(40).collect(),
        delete_sample: delete.into_iter().take(40).collect(),
    })
}

fn is_heavy_untracked_path(path: &str) -> bool {
    path.split(|c| c == '/' || c == '\\').any(|seg| {
        matches!(
            seg,
            "target"
                | "target-release-live"
                | "node_modules"
                | "dist"
                | "build"
                | ".next"
                | "coverage"
                | "__pycache__"
        ) || seg.starts_with("target-")
    })
}

fn snapshot_worktree_tree(
    workspace: &Path,
    id: &str,
    seed_commit: Option<&str>,
) -> Result<String, String> {
    let git_dir = PathBuf::from(git(workspace, &["rev-parse", "--git-dir"])?.trim());
    let git_dir = if git_dir.is_absolute() {
        git_dir
    } else {
        workspace.join(git_dir)
    };
    let tmp_index = git_dir.join(format!("onetone-index-{id}"));
    let _ = fs::remove_file(&tmp_index);
    if let Some(seed) = seed_commit {
        git_env(workspace, &tmp_index, &["read-tree", seed])?;
    }
    let result = (|| {
        // `-u` updates tracked paths only — never walks ignored build trees.
        git_env(workspace, &tmp_index, &["add", "-u"])?;
        // Add light untracked files (new source). Skip heavy build trees.
        if let Ok(st) = git(workspace, &["status", "--porcelain=v1", "-unormal"]) {
            for line in st.lines() {
                let Some(rest) = line.strip_prefix("?? ") else {
                    continue;
                };
                let path = rest.trim().trim_matches('"');
                if path.is_empty() || is_heavy_untracked_path(path) {
                    continue;
                }
                let _ = git_env(workspace, &tmp_index, &["add", "--", path.trim_end_matches('/')]);
            }
        }
        Ok(git_env(workspace, &tmp_index, &["write-tree"])?
            .trim()
            .to_string())
    })();
    let _ = fs::remove_file(&tmp_index);
    result
}

pub fn apply_restore(
    workspace: &Path,
    target_id: &str,
    safety_id: &str,
    preview: &RestorePreview,
    agent_context: AgentContext,
) -> Result<RestoreResult, String> {
    let target = resolve_op(workspace, target_id)?;
    let target_commit = target
        .commit
        .clone()
        .ok_or_else(|| "目标恢复点缺少 commit".to_string())?;

    // Compute delete set BEFORE mutating worktree (safety ≈ current in-scope).
    let target_set: HashSet<_> = list_tree_paths(workspace, &target_commit)?
        .into_iter()
        .collect();
    let delete_paths: Vec<String> = list_in_scope_paths(workspace)?
        .into_iter()
        .filter(|p| !target_set.contains(p))
        .collect();
    if (delete_paths.len() as u32) > preview.delete_count {
        return Err(format!(
            "待删除文件增多（{} → {}），已中止",
            preview.delete_count,
            delete_paths.len()
        ));
    }

    // Worktree-only restore for paths in target tree (batched).
    let paths = list_tree_paths(workspace, &target_commit)?;
    if !paths.is_empty() {
        for chunk in paths.chunks(80) {
            let mut args = vec![
                "restore".to_string(),
                format!("--source={target_commit}"),
                "--worktree".to_string(),
                "--".to_string(),
            ];
            args.extend(chunk.iter().cloned());
            git_args(workspace, &args)?;
        }
    }

    for rel in &delete_paths {
        let full = workspace.join(rel);
        if full.is_file() || full.is_symlink() {
            let _ = fs::remove_file(&full);
        } else if full.is_dir() {
            let _ = fs::remove_dir_all(&full);
        }
    }

    // Verify: every target path should exist (files) — soft check via ls-tree vs worktree
    if let Err(e) = verify_worktree_contains(workspace, &target_commit) {
        return Err(format!("恢复后校验失败：{e}"));
    }

    let restore_op = create_checkpoint(
        workspace,
        "restore",
        Some(format!("恢复到 {}", target_id)),
        agent_context,
        Some(target_id.to_string()),
        Some(safety_id.to_string()),
    )?;

    Ok(RestoreResult {
        ok: true,
        restored_id: target_id.to_string(),
        safety_id: safety_id.to_string(),
        restore_op_id: restore_op.id,
        message: Some("工作区文件已回到该恢复点；未改动暂存区与 HEAD".into()),
    })
}

pub fn diff_summary(workspace: &Path, op_id: &str) -> Result<DiffSummary, String> {
    let op = resolve_op(workspace, op_id)?;
    let commit = op.commit.clone().ok_or_else(|| "缺少 commit".to_string())?;
    let parent = op
        .parent_op
        .as_ref()
        .and_then(|pid| resolve_op(workspace, pid).ok().and_then(|p| p.commit));
    let stats = stats_vs_parent(workspace, &commit, parent.as_deref())?;
    let mut files = Vec::new();
    if let Some(ref p) = parent {
        let out = git(
            workspace,
            &["diff", "--name-status", &format!("{p}..{commit}")],
        )?;
        for line in out.lines() {
            let mut sp = line.splitn(2, '\t');
            let st = sp.next().unwrap_or("M");
            let path = sp.next().unwrap_or("").to_string();
            if path.is_empty() {
                continue;
            }
            let status = match st.chars().next().unwrap_or('M') {
                'A' => "added",
                'D' => "deleted",
                'R' => "renamed",
                _ => "modified",
            };
            files.push(DiffFile {
                path,
                status: status.into(),
            });
        }
    } else {
        for p in list_tree_paths(workspace, &commit)?.into_iter().take(80) {
            files.push(DiffFile {
                path: p,
                status: "added".into(),
            });
        }
    }
    Ok(DiffSummary { stats, files })
}

fn resolve_op(workspace: &Path, id: &str) -> Result<TmOp, String> {
    if let Some(op) = store::read_metadata(workspace, id) {
        return Ok(op);
    }
    oplog::list_ops(workspace, 50)
        .into_iter()
        .find(|o| o.id == id)
        .ok_or_else(|| format!("找不到恢复点 {id}"))
}

fn stats_vs_parent(
    workspace: &Path,
    commit: &str,
    parent: Option<&str>,
) -> Result<OpStats, String> {
    let Some(parent) = parent else {
        let n = list_tree_paths(workspace, commit)?.len() as u32;
        return Ok(OpStats {
            changed: n,
            added: n,
            deleted: 0,
        });
    };
    let name_status = git(
        workspace,
        &["diff", "--name-status", &format!("{parent}..{commit}")],
    )?;
    let mut added = 0u32;
    let mut deleted = 0u32;
    let mut modified = 0u32;
    for line in name_status.lines() {
        match line.chars().next().unwrap_or(' ') {
            'A' => added += 1,
            'D' => deleted += 1,
            'M' | 'T' => modified += 1,
            'R' | 'C' => modified += 1,
            _ => modified += 1,
        }
    }
    Ok(OpStats {
        changed: added + deleted + modified,
        added,
        deleted,
    })
}

fn list_tree_paths(workspace: &Path, commit: &str) -> Result<Vec<String>, String> {
    let out = git(workspace, &["ls-tree", "-r", "--name-only", commit])?;
    Ok(out
        .lines()
        .map(|l| l.trim().replace('\\', "/"))
        .filter(|l| !l.is_empty())
        .collect())
}

fn list_in_scope_paths(workspace: &Path) -> Result<Vec<String>, String> {
    // Tracked files from HEAD + untracked non-ignored from porcelain.
    // -unormal: untracked dirs stay one line. -uall freezes on huge trees.
    let mut set = HashSet::new();
    if let Ok(tracked) = git(workspace, &["ls-files"]) {
        for l in tracked.lines() {
            let p = l.trim().replace('\\', "/");
            if !p.is_empty() {
                set.insert(p);
            }
        }
    }
    let porcelain = git(workspace, &["status", "--porcelain=v1", "-unormal"])?;
    for line in porcelain.lines() {
        if line.len() < 4 {
            continue;
        }
        // XY PATH or XY ORIG -> PATH
        let rest = &line[3..];
        let path = if let Some((_, b)) = rest.split_once(" -> ") {
            b
        } else {
            rest
        };
        let p = path.trim().trim_matches('"').replace('\\', "/");
        if p.is_empty() || is_heavy_untracked_path(&p) {
            continue;
        }
        // deleted in worktree still in scope if was tracked
        if line.starts_with(" D") || line.starts_with("D ") || line.starts_with("DD") {
            // path may still need delete consideration via current set
            continue;
        }
        set.insert(p.trim_end_matches('/').to_string());
    }
    let mut v: Vec<_> = set.into_iter().collect();
    v.sort();
    Ok(v)
}

fn verify_worktree_contains(workspace: &Path, commit: &str) -> Result<(), String> {
    let paths = list_tree_paths(workspace, commit)?;
    let mut missing = 0u32;
    for p in paths.iter().take(200) {
        if !workspace.join(p).exists() {
            missing += 1;
        }
    }
    if missing > 0 {
        return Err(format!("有 {missing} 个目标文件在工作区缺失"));
    }
    Ok(())
}

fn prune_old(workspace: &Path) -> Result<(), String> {
    // 240 quarter-hour points cover roughly 2.5 busy days while Git still deduplicates blobs.
    // A 20-point cap only retained about five hours once automatic saving was enabled.
    const MAX_OPS: usize = 240;
    let mut ops = oplog::list_ops(workspace, MAX_OPS + 100);
    if ops.len() <= MAX_OPS {
        return Ok(());
    }
    ops.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let drop: Vec<_> = ops.into_iter().skip(MAX_OPS).collect();
    for op in drop {
        let _ = git(workspace, &["update-ref", "-d", &op.git_ref]);
        let _ = fs::remove_file(store::metadata_path(workspace, &op.id));
    }
    Ok(())
}

fn git(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let out = command_git()
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git 不可用：{e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("git {} 失败：{}", args.join(" "), err.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn git_args(workspace: &Path, args: &[String]) -> Result<String, String> {
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    git(workspace, &refs)
}

fn git_env(workspace: &Path, index: &Path, args: &[&str]) -> Result<String, String> {
    let out = command_git()
        .args(args)
        .current_dir(workspace)
        .env("GIT_INDEX_FILE", index)
        .output()
        .map_err(|e| format!("git 不可用：{e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("git {} 失败：{}", args.join(" "), err.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn simple_hash(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.hash(&mut h);
    format!("{:016x}", h.finish())
}
