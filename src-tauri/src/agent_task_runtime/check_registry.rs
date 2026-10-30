//! check_id → internal CheckRequest. Model never sees program/args/timeouts.

use super::contracts::CheckRequest;
use std::path::Path;

pub fn resolve_check(check_id: &str, workspace: &Path) -> Result<CheckRequest, String> {
    let id = check_id.trim();
    if id.is_empty() {
        return Err("empty_check_id".into());
    }
    match id {
        "noop_ok" => Ok(CheckRequest {
            program: "noop".into(),
            args: vec!["ok".into()],
            timeout_ms: 1_000,
            output_limit: 256,
        }),
        "noop_fail" => Ok(CheckRequest {
            program: "noop".into(),
            args: vec!["fail".into()],
            timeout_ms: 1_000,
            output_limit: 256,
        }),
        "frontend_typecheck" => {
            // Prefer npm when package.json exists; else refuse rather than invent shell.
            if workspace.join("package.json").is_file() {
                Ok(CheckRequest {
                    program: "npm".into(),
                    args: vec!["run".into(), "typecheck".into()],
                    timeout_ms: 120_000,
                    output_limit: 64_000,
                })
            } else {
                Err("check_unavailable_for_workspace".into())
            }
        }
        "rust_lib_test_atr" => {
            if workspace.join("src-tauri").join("Cargo.toml").is_file()
                || workspace.join("Cargo.toml").is_file()
            {
                Ok(CheckRequest {
                    program: "cargo".into(),
                    args: vec![
                        "test".into(),
                        "--manifest-path".into(),
                        "src-tauri/Cargo.toml".into(),
                        "agent_task_runtime".into(),
                        "--".into(),
                        "--test-threads=1".into(),
                    ],
                    timeout_ms: 300_000,
                    output_limit: 128_000,
                })
            } else {
                Err("check_unavailable_for_workspace".into())
            }
        }
        _ => Err(format!("unknown_check_id:{id}")),
    }
}

/// Execute CheckRequest. `noop` is for Slice A fake/happy without spawning shells.
pub fn execute_check(req: &CheckRequest, cwd: &Path) -> Result<(bool, String), String> {
    if req.program == "noop" {
        let ok = req.args.first().map(|s| s.as_str()) == Some("ok");
        return Ok((
            ok,
            if ok {
                "noop ok".into()
            } else {
                "noop fail".into()
            },
        ));
    }
    let mut cmd = std::process::Command::new(&req.program);
    cmd.args(&req.args).current_dir(cwd);
    let output = cmd
        .output()
        .map_err(|e| format!("spawn {}: {e}", req.program))?;
    let mut text = String::new();
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    if text.len() > req.output_limit {
        text.truncate(req.output_limit);
        text.push_str("…");
    }
    Ok((output.status.success(), text))
}
