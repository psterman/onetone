//! Aider done-only notify — merge `notifications-command` in `~/.aider.conf.yml`.
//! If user already has a different command without our marker, skip (no clobber).

use crate::shell_agent_hook_setup::{ShellHookSetupStatus, ShellHookWriteResult};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub const HOOK_ID: &str = "aider-notify-v1";
pub const PROBE_RESOURCE: &str = "scripts/aider-notify-probe.js";
const KEY: &str = "notifications-command";

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn conf_path() -> PathBuf {
    home_dir().join(".aider.conf.yml")
}

pub fn probe_absolute_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for base in [dir.join("resources"), dir.to_path_buf()] {
                let packaged = base.join(PROBE_RESOURCE);
                if packaged.is_file() {
                    return packaged;
                }
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .join(PROBE_RESOURCE)
}

fn node_available() -> bool {
    let mut cmd = Command::new("node");
    cmd.arg("-v");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn build_command(probe_abs: &str) -> String {
    format!(
        "node \"{}\" --onetone-hook-id {} --source aider",
        probe_abs.replace('\\', "/"),
        HOOK_ID
    )
}

fn line_is_key(line: &str) -> bool {
    line.trim_start().starts_with(KEY)
}

fn line_is_ours(line: &str) -> bool {
    line.contains(HOOK_ID) || line.contains("aider-notify-probe")
}

fn backup_path_for(path: &Path) -> PathBuf {
    let parent = path.parent().unwrap_or(Path::new("."));
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    parent.join(format!(
        "{}.onetone-backup-{stamp}",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(".aider.conf.yml")
    ))
}

fn file_configured(lines: &[String]) -> bool {
    lines.iter().any(|l| line_is_key(l) && line_is_ours(l))
}

pub fn setup_status() -> Result<ShellHookSetupStatus, String> {
    let path = conf_path();
    let probe = probe_absolute_path();
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    let exists = path.is_file();
    let (parse_ok, configured) = if exists {
        match fs::read_to_string(&path) {
            Ok(raw) => {
                let lines: Vec<String> = raw.lines().map(|s| s.to_string()).collect();
                (true, file_configured(&lines))
            }
            Err(_) => (false, false),
        }
    } else {
        (true, false)
    };
    let draft = format!("{KEY}: {}", build_command(&probe_abs));
    Ok(ShellHookSetupStatus {
        kind: "aider".into(),
        settings_path: path.display().to_string(),
        settings_exists: exists,
        settings_parse_ok: parse_ok,
        probe_exists: probe.is_file(),
        probe_script_path: probe_abs,
        onetone_configured: configured,
        draft_json: draft,
        can_install: probe.is_file() && node_available(),
        node_available: node_available(),
    })
}

pub fn install_confirm() -> ShellHookWriteResult {
    let path = conf_path();
    let probe = probe_absolute_path();
    if !probe.is_file() {
        return ShellHookWriteResult {
            ok: false,
            message: "probe_missing".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    }
    if !node_available() {
        return ShellHookWriteResult {
            ok: false,
            message: "node_missing".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    }
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    let desired = format!("{KEY}: {}", build_command(&probe_abs));
    let raw = if path.is_file() {
        fs::read_to_string(&path).unwrap_or_default()
    } else {
        String::new()
    };
    let mut lines: Vec<String> = if raw.is_empty() {
        vec![]
    } else {
        raw.lines().map(|s| s.to_string()).collect()
    };
    for line in &lines {
        if line_is_key(line) && !line_is_ours(line) {
            return ShellHookWriteResult {
                ok: false,
                message: "existing_notifications_command".into(),
                backup_path: String::new(),
                added: vec![],
                refreshed: vec![],
                removed: 0,
            };
        }
    }
    let backup = if path.is_file() {
        let b = backup_path_for(&path);
        let _ = fs::copy(&path, &b);
        b.display().to_string()
    } else {
        String::new()
    };
    let mut added = false;
    let mut refreshed = false;
    let mut found = false;
    for line in lines.iter_mut() {
        if line_is_key(line) {
            found = true;
            if *line != desired {
                *line = desired.clone();
                refreshed = true;
            }
            break;
        }
    }
    if !found {
        if !lines.is_empty() && !lines.last().map(|s| s.is_empty()).unwrap_or(true) {
            lines.push(String::new());
        }
        lines.push(desired);
        added = true;
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let out = if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    };
    match fs::write(&path, out) {
        Ok(()) => ShellHookWriteResult {
            ok: true,
            message: "installed".into(),
            backup_path: backup,
            added: if added { vec![KEY.into()] } else { vec![] },
            refreshed: if refreshed { vec![KEY.into()] } else { vec![] },
            removed: 0,
        },
        Err(e) => ShellHookWriteResult {
            ok: false,
            message: format!("write_failed:{e}"),
            backup_path: backup,
            added: vec![],
            refreshed: vec![],
            removed: 0,
        },
    }
}

pub fn uninstall() -> ShellHookWriteResult {
    let path = conf_path();
    if !path.is_file() {
        return ShellHookWriteResult {
            ok: true,
            message: "nothing_to_uninstall".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    }
    let raw = fs::read_to_string(&path).unwrap_or_default();
    let lines: Vec<String> = raw.lines().map(|s| s.to_string()).collect();
    let before = lines.len();
    let kept: Vec<String> = lines
        .into_iter()
        .filter(|l| !(line_is_key(l) && line_is_ours(l)))
        .collect();
    let removed = before.saturating_sub(kept.len());
    if removed == 0 {
        return ShellHookWriteResult {
            ok: true,
            message: "nothing_to_uninstall".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    }
    let backup = backup_path_for(&path);
    let _ = fs::copy(&path, &backup);
    let out = kept.join("\n");
    let out = if out.is_empty() { out } else { format!("{out}\n") };
    match fs::write(&path, out) {
        Ok(()) => ShellHookWriteResult {
            ok: true,
            message: "uninstalled".into(),
            backup_path: backup.display().to_string(),
            added: vec![],
            refreshed: vec![],
            removed,
        },
        Err(e) => ShellHookWriteResult {
            ok: false,
            message: format!("write_failed:{e}"),
            backup_path: backup.display().to_string(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        },
    }
}
