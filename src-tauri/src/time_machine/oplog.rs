use std::path::Path;

use super::git_ops::command_git;
use super::store;
use super::types::TmOp;

const TIP_REF: &str = "refs/onetone/tip";

pub fn tip_op(workspace: &Path) -> Option<TmOp> {
    let tip = git_rev_parse(workspace, TIP_REF)?;
    // Prefer metadata by scanning recent oplog / metadata dir keyed by tip commit
    if let Some(ops) = list_from_metadata(workspace) {
        if let Some(op) = ops
            .into_iter()
            .find(|o| o.commit.as_deref() == Some(tip.as_str()))
        {
            return Some(op);
        }
    }
    rebuild_from_refs(workspace).into_iter().next()
}

pub fn list_ops(workspace: &Path, limit: usize) -> Vec<TmOp> {
    let mut ops = list_from_metadata(workspace).unwrap_or_default();
    if ops.is_empty() {
        ops = rebuild_from_refs(workspace);
    }
    // Sort newest first by created_at / id
    ops.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    ops.truncate(limit);
    ops
}

fn list_from_metadata(workspace: &Path) -> Option<Vec<TmOp>> {
    let dir = store::sidecar_dir(workspace).join("metadata");
    let rd = std::fs::read_dir(&dir).ok()?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(op) = serde_json::from_str::<TmOp>(&raw) {
                out.push(op);
            }
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn rebuild_from_refs(workspace: &Path) -> Vec<TmOp> {
    let output = command_git()
        .args([
            "for-each-ref",
            "--format=%(refname)|%(objectname)",
            "refs/onetone/op",
        ])
        .current_dir(workspace)
        .output();
    let Ok(out) = output else {
        return vec![];
    };
    if !out.status.success() {
        return vec![];
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut ops = Vec::new();
    for line in text.lines() {
        let mut parts = line.splitn(2, '|');
        let Some(refname) = parts.next() else {
            continue;
        };
        let Some(sha) = parts.next() else {
            continue;
        };
        let id = refname.rsplit('/').next().unwrap_or(refname).to_string();
        if let Some(meta) = store::read_metadata(workspace, &id) {
            ops.push(meta);
            continue;
        }
        ops.push(TmOp {
            id: id.clone(),
            kind: "checkpoint".into(),
            workspace: workspace.to_string_lossy().to_string(),
            git_ref: refname.to_string(),
            parent_op: None,
            base_head: None,
            created_at: id.clone(),
            label: None,
            trigger_source: "unknown".into(),
            agent_context: super::types::AgentContext::unknown(),
            stats: super::types::OpStats {
                changed: 0,
                added: 0,
                deleted: 0,
            },
            restore: None,
            commit: Some(sha.to_string()),
        });
    }
    ops
}

fn git_rev_parse(workspace: &Path, rev: &str) -> Option<String> {
    let out = command_git()
        .args(["rev-parse", "--verify", rev])
        .current_dir(workspace)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

pub fn tip_commit(workspace: &Path) -> Option<String> {
    git_rev_parse(workspace, TIP_REF)
}

pub fn update_tip(workspace: &Path, commit: &str) -> Result<(), String> {
    let st = command_git()
        .args(["update-ref", TIP_REF, commit])
        .current_dir(workspace)
        .status()
        .map_err(|e| e.to_string())?;
    if !st.success() {
        return Err("update tip ref failed".into());
    }
    Ok(())
}
