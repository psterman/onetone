//! Roo file hooks - one script per event under `.roo/hooks` (+ Documents/Roo/Hooks).
//! Not settings.json. Marker: `--onetone-hook-id roo-activity-v1`.

use crate::shell_agent_hook_setup::{ShellHookSetupStatus, ShellHookWriteResult};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub const HOOK_ID: &str = "roo-activity-v1";
pub const PROBE_RESOURCE: &str = "scripts/roo-hook-probe.js";

const EVENTS: &[&str] = &[
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "TaskComplete",
    "TaskCancel",
    "TaskError",
    "Notification",
];

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn hook_dirs() -> Vec<PathBuf> {
    let home = home_dir();
    let mut out = vec![home.join(".roo").join("hooks")];
    if let Ok(doc) = std::env::var("USERPROFILE") {
        out.push(PathBuf::from(doc).join("Documents").join("Roo").join("Hooks"));
    } else {
        out.push(home.join("Documents").join("Roo").join("Hooks"));
    }
    out
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

fn build_cmd_body(probe_abs: &str, event: &str) -> String {
    format!(
        "@echo off\r\nnode \"{}\" --onetone-hook-id {} --source roo --event {}\r\n",
        probe_abs.replace('\\', "/"),
        HOOK_ID,
        event
    )
}

fn file_is_ours(path: &Path) -> bool {
    fs::read_to_string(path)
        .map(|s| s.contains(HOOK_ID) && s.contains("roo-hook-probe"))
        .unwrap_or(false)
}

fn dir_configured(dir: &Path) -> bool {
    EVENTS.iter().any(|ev| {
        let cmd = dir.join(format!("{ev}.cmd"));
        cmd.is_file() && file_is_ours(&cmd)
    })
}

fn backup_path_for(dir: &Path, name: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dir.join(format!("{name}.onetone-backup-{stamp}"))
}

pub fn setup_status() -> Result<ShellHookSetupStatus, String> {
    let probe = probe_absolute_path();
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    let dirs = hook_dirs();
    let primary = dirs
        .first()
        .cloned()
        .unwrap_or_else(|| home_dir().join(".roo").join("hooks"));
    let configured = dirs.iter().any(|d| dir_configured(d));
    let draft = serde_json::json!({
        "hookDirs": dirs.iter().map(|d| d.display().to_string()).collect::<Vec<_>>(),
        "events": EVENTS,
        "probe": probe_abs,
        "marker": HOOK_ID
    });
    Ok(ShellHookSetupStatus {
        kind: "roo".into(),
        settings_path: primary.display().to_string(),
        settings_exists: primary.is_dir(),
        settings_parse_ok: true,
        probe_exists: probe.is_file(),
        probe_script_path: probe_abs,
        onetone_configured: configured,
        draft_json: serde_json::to_string_pretty(&draft).unwrap_or_default(),
        can_install: probe.is_file() && node_available(),
        node_available: node_available(),
    })
}

pub fn install_confirm() -> ShellHookWriteResult {
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
    let mut added = Vec::new();
    let mut refreshed = Vec::new();
    for dir in hook_dirs() {
        if fs::create_dir_all(&dir).is_err() {
            continue;
        }
        for ev in EVENTS {
            let path = dir.join(format!("{ev}.cmd"));
            let body = build_cmd_body(&probe_abs, ev);
            if path.is_file() {
                if file_is_ours(&path) {
                    if fs::read_to_string(&path).ok().as_deref() != Some(body.as_str()) {
                        let b = backup_path_for(&dir, &format!("{ev}.cmd"));
                        let _ = fs::copy(&path, &b);
                        if fs::write(&path, &body).is_ok() {
                            refreshed.push(format!("{}/{}", dir.display(), ev));
                        }
                    }
                }
                continue;
            }
            if fs::write(&path, &body).is_ok() {
                added.push(format!("{}/{}", dir.display(), ev));
            }
        }
    }
    if added.is_empty() && refreshed.is_empty() && !hook_dirs().iter().any(|d| dir_configured(d)) {
        return ShellHookWriteResult {
            ok: false,
            message: "write_failed".into(),
            backup_path: String::new(),
            added,
            refreshed,
            removed: 0,
        };
    }
    ShellHookWriteResult {
        ok: true,
        message: "installed".into(),
        backup_path: String::new(),
        added,
        refreshed,
        removed: 0,
    }
}

pub fn uninstall() -> ShellHookWriteResult {
    let mut removed = 0usize;
    for dir in hook_dirs() {
        if !dir.is_dir() {
            continue;
        }
        for ev in EVENTS {
            let path = dir.join(format!("{ev}.cmd"));
            if path.is_file() && file_is_ours(&path) {
                if fs::remove_file(&path).is_ok() {
                    removed += 1;
                }
            }
        }
    }
    ShellHookWriteResult {
        ok: true,
        message: if removed > 0 {
            "uninstalled".into()
        } else {
            "nothing_to_uninstall".into()
        },
        backup_path: String::new(),
        added: vec![],
        refreshed: vec![],
        removed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cmd_body_has_marker_and_event() {
        let body = build_cmd_body("C:/repo/scripts/roo-hook-probe.js", "TaskComplete");
        assert!(body.contains(HOOK_ID));
        assert!(body.contains("--event TaskComplete"));
        assert!(body.contains("--source roo"));
    }
}