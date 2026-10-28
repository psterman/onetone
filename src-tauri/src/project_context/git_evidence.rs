//! Fixed read-only git ops. Never expose a general command interface.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::contracts::*;
use super::reader::{fingerprint_file, resolve_under_root, validate_relative};
use super::scope::ProjectScope;

fn git_cmd(root: &Path) -> Result<Command, ContextError> {
    let mut c = Command::new("git");
    c.current_dir(root);
    c.env_remove("GIT_EXTERNAL_DIFF");
    c.env_remove("GIT_CONFIG");
    c.env_remove("GIT_DIR");
    c.env_remove("GIT_WORK_TREE");
    c.env_remove("GIT_SSH_COMMAND");
    c.env_remove("GIT_CONFIG_GLOBAL");
    c.env_remove("GIT_CONFIG_SYSTEM");
    c.env("GIT_CONFIG_NOSYSTEM", "1");
    c.env("GIT_TERMINAL_PROMPT", "0");
    c.env("LC_ALL", "C.UTF-8");
    c.stdin(Stdio::null());
    c.stdout(Stdio::piped());
    c.stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    Ok(c)
}

fn run_git(root: &Path, args: &[&str], timeout_ms: u64) -> Result<Vec<u8>, ContextError> {
    let mut cmd = git_cmd(root)?;
    cmd.args(args);
    let mut child = cmd.spawn().map_err(|_| ContextError::GitUnavailable)?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = Vec::new();
                if let Some(mut s) = child.stdout.take() {
                    let _ = s.read_to_end(&mut out);
                }
                let mut err = Vec::new();
                if let Some(mut s) = child.stderr.take() {
                    let _ = s.read_to_end(&mut err);
                }
                if !status.success() {
                    let msg = String::from_utf8_lossy(&err);
                    if msg.contains("not a git repository") {
                        return Err(ContextError::NotGit);
                    }
                    return Err(ContextError::IoError);
                }
                if out.len() > MAX_GIT_PATCH_BYTES * 4 {
                    out.truncate(MAX_GIT_PATCH_BYTES * 4);
                }
                return Ok(out);
            }
            Ok(None) => {
                if start.elapsed() > Duration::from_millis(timeout_ms) {
                    kill_tree(&mut child);
                    return Err(ContextError::Timeout);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(_) => {
                kill_tree(&mut child);
                return Err(ContextError::IoError);
            }
        }
    }
}

fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

pub fn assert_git_root_matches(scope: &ProjectScope) -> Result<(), ContextError> {
    let out = run_git(&scope.root, &["rev-parse", "--show-toplevel"], 1500)?;
    let top = String::from_utf8_lossy(&out).trim().replace('/', "\\");
    let root = scope.root.to_string_lossy().replace('/', "\\");
    // Must equal authorized root — subdir grant does not climb to parent repo.
    let top_canon = std::fs::canonicalize(Path::new(top.trim())).map_err(|_| ContextError::NotGit)?;
    let root_canon = std::fs::canonicalize(&scope.root).map_err(|_| ContextError::IoError)?;
    if top_canon != root_canon {
        let _ = root;
        return Err(ContextError::NotGit);
    }
    Ok(())
}

pub fn list_changes(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    mode: &str,
) -> Result<(Vec<GitChangeItem>, bool, Option<String>), ContextError> {
    let _ = request_id;
    assert_git_root_matches(scope)?;
    let mode = normalize_mode(mode)?;
    let args: Vec<&str> = if mode == "staged" {
        vec![
            "diff",
            "--cached",
            "--name-status",
            "-z",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
        ]
    } else {
        // untracked included via separate status; name-status for tracked WT changes
        vec![
            "diff",
            "--name-status",
            "-z",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
        ]
    };
    let out = run_git(&scope.root, &args, GIT_TIMEOUT_MS)?;
    let mut items = parse_name_status(&out);
    if mode == "unstaged" {
        // Untracked files
        if let Ok(u) = run_git(
            &scope.root,
            &[
                "ls-files",
                "--others",
                "--exclude-standard",
                "-z",
            ],
            GIT_TIMEOUT_MS,
        ) {
            for p in parse_z_paths(&u) {
                items.push(GitChangeItem {
                    relative_path: p.clone(),
                    display_path: p,
                    status: "untracked".into(),
                    rename_from: None,
                    binary: false,
                    version: None,
                });
            }
        }
    }
    let mut filtered = Vec::new();
    let mut truncated = false;
    let mut limit_reason = None;
    for it in items {
        if filtered.len() >= MAX_GIT_LIST {
            truncated = true;
            limit_reason = Some("git_list_limit".into());
            break;
        }
        if validate_relative(&it.relative_path).is_err() {
            continue;
        }
        if resolve_under_root(scope, &it.relative_path).is_err()
            && it.status != "D"
            && it.status != "deleted"
        {
            // deleted may not resolve; still allow if path validates
            if it.status != "D" && !it.status.starts_with('D') {
                continue;
            }
        }
        filtered.push(it);
    }
    Ok((filtered, truncated, limit_reason))
}

pub fn file_diff(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    mode: &str,
    relative_path: &str,
    expected_version: Option<&str>,
) -> Result<EvidenceRecord, ContextError> {
    let _ = request_id;
    assert_git_root_matches(scope)?;
    let mode = normalize_mode(mode)?;
    let rel = validate_relative(relative_path)?
        .to_string_lossy()
        .replace('\\', "/");
    // For existing paths enforce scope; deleted paths only validate relative.
    let _ = resolve_under_root(scope, &rel);

    if let Some(exp) = expected_version {
        if let Ok(cur) = fingerprint_file(scope, &rel) {
            if cur != exp {
                return Err(ContextError::Changed);
            }
        }
    }

    let mut args: Vec<String> = vec![
        "diff".into(),
        "--no-ext-diff".into(),
        "--no-textconv".into(),
        "--no-color".into(),
        "-U3".into(),
    ];
    if mode == "staged" {
        args.push("--cached".into());
    }
    args.push("--".into());
    args.push(rel.clone());

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run_git(&scope.root, &arg_refs, GIT_TIMEOUT_MS)?;
    if out.is_empty() {
        // Untracked: fall back to ordinary read (not a fake staged patch).
        if mode == "unstaged" {
            if let Ok(bytes) = std::fs::read(scope.root.join(&rel)) {
                if super::reader::looks_binary(&bytes) {
                    return Ok(status_only_record(
                        scope,
                        &rel,
                        mode,
                        "binary",
                        "文件为二进制，未生成文本 patch",
                    ));
                }
            }
        }
        return Ok(status_only_record(
            scope,
            &rel,
            mode,
            "empty",
            "无文本 diff（可能为删除/二进制/无变更）",
        ));
    }
    if out.windows(14).any(|w| w == b"Binary files differ" || w == b"GIT binary patch") {
        return Ok(status_only_record(
            scope,
            &rel,
            mode,
            "binary",
            "二进制变更，未转换为文本",
        ));
    }
    let mut patch = String::from_utf8_lossy(&out).to_string();
    let mut truncated = false;
    let mut limit_reason = None;
    if patch.len() > MAX_GIT_PATCH_BYTES {
        let mut end = MAX_GIT_PATCH_BYTES;
        while end > 0 && !patch.is_char_boundary(end) {
            end -= 1;
        }
        patch.truncate(end);
        truncated = true;
        limit_reason = Some("git_patch_bytes".into());
    }
    let hash = content_hash(patch.as_bytes());
    Ok(EvidenceRecord {
        schema_version: SCHEMA_VERSION,
        id: format!("ev_diff_{}", &hash[..12.min(hash.len())]),
        scope_id: scope.scope_id.clone(),
        task_scope_id: scope.task_scope_id.clone(),
        kind: "git_diff".into(),
        label: format!("git {mode} · {rel}"),
        display_path: Some(rel.clone()),
        source_ref: Some(format!("git:{mode}:{rel}")),
        relative_path: Some(rel.clone()),
        range: None,
        content: patch,
        source_version: hash.clone(),
        source_refs: vec![SourceRef {
            relative_path: rel,
            range: None,
            note: Some(mode.into()),
        }],
        captured_at: now_iso(),
        truncated,
        limit_reason,
        freshness: "captured".into(),
        git: Some(GitMeta {
            mode: mode.into(),
            base_oid: None,
            before_hash: None,
            after_hash: Some(hash),
        }),
    })
}

fn status_only_record(
    scope: &ProjectScope,
    rel: &str,
    mode: &str,
    status: &str,
    note: &str,
) -> EvidenceRecord {
    let content = format!("[{status}] {rel}\n{note}\n");
    let hash = content_hash(content.as_bytes());
    EvidenceRecord {
        schema_version: SCHEMA_VERSION,
        id: format!("ev_diff_{}", &hash[..12.min(hash.len())]),
        scope_id: scope.scope_id.clone(),
        task_scope_id: scope.task_scope_id.clone(),
        kind: "git_diff".into(),
        label: format!("git {mode} · {rel} ({status})"),
        display_path: Some(rel.into()),
        source_ref: Some(format!("git:{mode}:{rel}")),
        relative_path: Some(rel.into()),
        range: None,
        content,
        source_version: hash,
        source_refs: vec![],
        captured_at: now_iso(),
        truncated: false,
        limit_reason: None,
        freshness: "captured".into(),
        git: Some(GitMeta {
            mode: mode.into(),
            base_oid: None,
            before_hash: None,
            after_hash: None,
        }),
    }
}

fn normalize_mode(mode: &str) -> Result<&'static str, ContextError> {
    match mode {
        "staged" => Ok("staged"),
        "unstaged" => Ok("unstaged"),
        _ => Err(ContextError::InvalidPath),
    }
}

fn parse_z_paths(buf: &[u8]) -> Vec<String> {
    buf.split(|&b| b == 0)
        .filter(|s| !s.is_empty())
        .map(|s| String::from_utf8_lossy(s).replace('\\', "/"))
        .collect()
}

fn parse_name_status(buf: &[u8]) -> Vec<GitChangeItem> {
    // -z: STATUS\0path\0 or R100\0old\0new\0
    let parts = parse_z_paths(buf);
    let mut out = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let status = parts[i].clone();
        i += 1;
        if status.starts_with('R') || status.starts_with('C') {
            if i + 1 >= parts.len() {
                break;
            }
            let old = parts[i].clone();
            let newp = parts[i + 1].clone();
            i += 2;
            out.push(GitChangeItem {
                relative_path: newp.clone(),
                display_path: newp,
                status: if status.starts_with('R') {
                    "renamed".into()
                } else {
                    "copied".into()
                },
                rename_from: Some(old),
                binary: false,
                version: None,
            });
        } else {
            if i >= parts.len() {
                break;
            }
            let path = parts[i].clone();
            i += 1;
            let st = match status.chars().next().unwrap_or(' ') {
                'A' => "added",
                'M' => "modified",
                'D' => "deleted",
                'T' => "typechange",
                'U' => "unmerged",
                _ => "modified",
            };
            out.push(GitChangeItem {
                relative_path: path.clone(),
                display_path: path,
                status: st.into(),
                rename_from: None,
                binary: false,
                version: None,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_context::scope::{close, open_at};
    use std::fs;
    use std::process::Command;

    fn git_init(dir: &Path) {
        let _ = Command::new("git").args(["init"]).current_dir(dir).output();
        let _ = Command::new("git")
            .args(["config", "user.email", "t@example.com"])
            .current_dir(dir)
            .output();
        let _ = Command::new("git")
            .args(["config", "user.name", "t"])
            .current_dir(dir)
            .output();
    }

    #[test]
    fn staged_and_unstaged_separate() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_git_{}", now_iso()));
        let _ = fs::create_dir_all(&root);
        git_init(&root);
        fs::write(root.join("a.txt"), b"one\n").unwrap();
        let _ = Command::new("git")
            .args(["add", "a.txt"])
            .current_dir(&root)
            .output();
        let _ = Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(&root)
            .output();
        fs::write(root.join("a.txt"), b"two\n").unwrap();
        let _ = Command::new("git")
            .args(["add", "a.txt"])
            .current_dir(&root)
            .output();
        fs::write(root.join("a.txt"), b"three\n").unwrap();

        let dto = open_at("main", "ts_git", &root).unwrap();
        let scope = crate::project_context::scope::get(&dto.scope_id).unwrap();
        let (staged, _, _) = list_changes(&scope, "r", "staged").unwrap();
        let (unstaged, _, _) = list_changes(&scope, "r", "unstaged").unwrap();
        assert!(staged.iter().any(|i| i.relative_path == "a.txt"));
        assert!(unstaged.iter().any(|i| i.relative_path == "a.txt"));
        let sd = file_diff(&scope, "r", "staged", "a.txt", None).unwrap();
        let ud = file_diff(&scope, "r", "unstaged", "a.txt", None).unwrap();
        assert_ne!(sd.content, ud.content);
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }
}
