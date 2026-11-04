//! 统计信号：从 hook 探针日志的 cwd 频次推导「热点目录」候选。
//!
//! 边界（spec §4.1）：零采集放宽下，统计只能可靠回答「在哪儿干活」。
//! 因此本模块**只**产出热点目录，不产出权限摩擦 / 工具画像 / 失败原因条目。
//!
//! 过滤：探针日志里**没有** project_id，只有 cwd。因此按「cwd 位于项目根之下」过滤，
//! 否则会把别的项目的目录混进来。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::derive::DerivedCandidate;
use super::model::{KIND_SIGNAL, SECTION_MAP};

const MAX_HOT_DIRS: usize = 5;

/// 归一化路径：小写 + 正斜杠 + 去尾斜杠（Windows 路径大小写不敏感）。
fn normalize(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_ascii_lowercase()
}

/// 取 cwd 相对项目根的第一层目录名。
///
/// - `rel` 为空 → cwd 就是项目根本身 → None
/// - `rel` 只有一段（如 `src`）→ 该段就是第一层目录 → Some
/// - 隐藏目录 / `node_modules` / `target` → None
fn first_level_rel(project_root: &Path, cwd: &str) -> Option<String> {
    let root = normalize(project_root);
    let c = normalize(Path::new(cwd));
    if !c.starts_with(&root) {
        return None; // 不在本项目下
    }
    let rel = c[root.len()..].trim_start_matches('/');
    if rel.is_empty() {
        return None;
    }
    let first = rel.split('/').next()?.to_string();
    if first.is_empty() || first.starts_with('.') || first == "node_modules" || first == "target" {
        return None;
    }
    Some(first)
}

/// 从 probe jsonl 行中取 cwd。行格式由探针脚本决定，这里只认最小集合：
/// `{"cwd": "..."}` 或 `{"normalized": {"cwd": "..."}}`
fn cwd_from_line(line: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
        return Some(c.to_string());
    }
    v.get("normalized")
        .and_then(|n| n.get("cwd"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

pub fn hot_dir_candidates(
    project_root: &Path,
    log_paths: &[PathBuf],
) -> Vec<DerivedCandidate> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for p in log_paths {
        let Ok(text) = std::fs::read_to_string(p) else {
            continue;
        };
        for line in text.lines() {
            let Some(cwd) = cwd_from_line(line) else {
                continue;
            };
            let Some(dir) = first_level_rel(project_root, &cwd) else {
                continue;
            };
            *counts.entry(dir).or_insert(0) += 1;
        }
    }
    if counts.is_empty() {
        return Vec::new();
    }
    let mut pairs: Vec<(String, usize)> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    pairs.truncate(MAX_HOT_DIRS);
    pairs
        .into_iter()
        .map(|(dir, n)| DerivedCandidate {
            section: SECTION_MAP,
            content: format!("`{dir}/` — {n} 次会话记录在此目录活动"),
            confidence: 0.3,
            evidence: serde_json::json!({
                "source": "hook_probe_cwd",
                "dir": dir,
                "hits": n,
            }),
        })
        .collect()
}

/// 探针日志的默认位置（与探针脚本 `pad_status/log.rs::default_log_path` 一致：
/// 以进程 cwd 为基准的 `logs/`）。
pub fn default_probe_logs() -> Vec<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    vec![
        cwd.join("logs").join("claude-hook-probe.jsonl"),
        cwd.join("logs").join("pad-status.jsonl"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("E:/voice-pilot")
    }

    #[test]
    fn first_level_ignores_root_and_noise() {
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/src"), Some("src".into()));
        assert_eq!(
            first_level_rel(&root(), "E:\\voice-pilot\\src-tauri\\src"),
            Some("src-tauri".into())
        );
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/.git"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/node_modules/x"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/target"), None);
    }

    #[test]
    fn excludes_cwds_outside_project() {
        assert_eq!(first_level_rel(&root(), "E:/other-project/src"), None);
    }

    #[test]
    fn is_case_insensitive_on_windows_paths() {
        assert_eq!(first_level_rel(&root(), "e:/VOICE-PILOT/src"), Some("src".into()));
    }

    #[test]
    fn reads_cwd_from_both_line_shapes() {
        assert_eq!(cwd_from_line("{\"cwd\":\"a/b\"}").as_deref(), Some("a/b"));
        assert_eq!(
            cwd_from_line("{\"normalized\":{\"cwd\":\"c/d\"}}").as_deref(),
            Some("c/d")
        );
        assert_eq!(cwd_from_line("not json"), None);
    }

    #[test]
    fn counts_hot_dirs_within_project_only() {
        let dir = std::env::temp_dir().join(format!("onetone-sig-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let log = dir.join("probe.jsonl");
        std::fs::write(
            &log,
            "{\"cwd\":\"E:/voice-pilot/src\"}\n\
             {\"cwd\":\"E:/voice-pilot/src\"}\n\
             {\"cwd\":\"E:/voice-pilot/src-tauri\"}\n\
             {\"cwd\":\"E:/voice-pilot/.git\"}\n\
             {\"cwd\":\"E:/other/src\"}\n",
        )
        .unwrap();
        let cands = hot_dir_candidates(&root(), &[log]);
        assert_eq!(cands.len(), 2, "other project must be excluded");
        assert!(cands[0].content.contains("src"));
        assert!(cands[0].content.contains("2"), "hit count must be included");
        assert!(!cands.iter().any(|c| c.content.contains(".git")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_log_yields_no_candidates() {
        let cands = hot_dir_candidates(&root(), &[PathBuf::from("/nope/none.jsonl")]);
        assert!(cands.is_empty());
    }
}
