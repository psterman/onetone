//! Shared Claude CLI executable resolution (Windows shims, Hermes, npm, node fallback).
//! Used by smoke tasks and Agent Center background probe/stop — one resolution path only.

use std::ffi::OsString;
use std::path::PathBuf;

pub const ENV_CLAUDE_BIN: &str = "ONETONE_CLAUDE_BIN";
pub const MISSING_CLI_MSG: &str = "未找到 Claude CLI，请先安装或配置 PATH";

#[derive(Debug, Clone)]
pub struct ClaudeCommandSpec {
    pub program: OsString,
    pub prefix_args: Vec<OsString>,
}

fn candidate_exists(path: PathBuf) -> Option<PathBuf> {
    path.is_file().then_some(path)
}

fn path_candidates(name: &str) -> Vec<PathBuf> {
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .map(|dir| dir.join(name))
        .collect()
}

/// Prefer real claude.exe (or node entry) over .cmd/.bat.
fn exec_command_spec(spec: ClaudeCommandSpec) -> ClaudeCommandSpec {
    let prog = PathBuf::from(&spec.program);
    let name = prog
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if name != "claude.cmd" && name != "claude.bat" {
        return spec;
    }
    let Some(dir) = prog.parent() else {
        return spec;
    };
    // Current npm shim: ...\node_modules\@anthropic-ai\claude-code\bin\claude.exe
    let nested_exe = dir.join("node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    if nested_exe.is_file() {
        return ClaudeCommandSpec {
            program: nested_exe.into_os_string(),
            prefix_args: Vec::new(),
        };
    }
    let node = dir.join("node.exe");
    let js_candidates = [
        dir.join("node_modules/@anthropic-ai/claude-code/cli.js"),
        dir.join("node_modules/@anthropic-ai/claude-code/bin/cli.js"),
        dir.join("node_modules/@anthropic-ai/claude-code/bin/claude.js"),
    ];
    if node.is_file() {
        for js in js_candidates {
            if js.is_file() {
                return ClaudeCommandSpec {
                    program: node.into_os_string(),
                    prefix_args: vec![js.into_os_string()],
                };
            }
        }
    }
    spec
}

/// Resolve how to invoke Claude CLI on this machine.
pub fn claude_command_spec() -> Result<ClaudeCommandSpec, String> {
    if let Some(bin) = std::env::var_os(ENV_CLAUDE_BIN) {
        return Ok(ClaudeCommandSpec {
            program: bin,
            prefix_args: Vec::new(),
        });
    }

    #[cfg(windows)]
    {
        let appdata_npm = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("npm"));
        let hermes = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .map(|p| p.join("hermes").join("node"));

        let candidates = ["claude.exe", "claude.cmd", "claude.bat"]
            .into_iter()
            .flat_map(|name| {
                let mut paths = path_candidates(name);
                if let Some(dir) = &appdata_npm {
                    paths.push(dir.join(name));
                }
                if let Some(dir) = &hermes {
                    paths.push(dir.join(name));
                }
                paths
            });
        if let Some(path) = candidates.filter_map(candidate_exists).next() {
            return Ok(exec_command_spec(ClaudeCommandSpec {
                program: path.into_os_string(),
                prefix_args: Vec::new(),
            }));
        }

        let ps1 = appdata_npm
            .iter()
            .chain(hermes.iter())
            .map(|dir| dir.join("claude.ps1"))
            .chain(path_candidates("claude.ps1"))
            .filter_map(candidate_exists)
            .next();
        if let Some(path) = ps1 {
            return Ok(ClaudeCommandSpec {
                program: OsString::from("powershell.exe"),
                prefix_args: vec![
                    OsString::from("-NoProfile"),
                    OsString::from("-ExecutionPolicy"),
                    OsString::from("Bypass"),
                    OsString::from("-File"),
                    path.into_os_string(),
                ],
            });
        }

        return Err(MISSING_CLI_MSG.into());
    }

    #[cfg(not(windows))]
    {
        Ok(ClaudeCommandSpec {
            program: OsString::from("claude"),
            prefix_args: Vec::new(),
        })
    }
}
