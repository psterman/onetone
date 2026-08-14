//! OpenCode plugin install — merge path into `opencode.json` `plugin` array.
//! Marker path segment: `opencode-onetone-plugin/index.js`.

use crate::shell_agent_hook_setup::{ShellHookSetupStatus, ShellHookWriteResult};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub const HOOK_ID: &str = "opencode-onetone-v1";
pub const PLUGIN_RESOURCE: &str = "scripts/opencode-onetone-plugin/index.js";
const PLUGIN_MARKER: &str = "opencode-onetone-plugin";

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn config_paths() -> Vec<PathBuf> {
    let home = home_dir();
    vec![
        home.join(".config").join("opencode").join("opencode.json"),
        home.join(".opencode").join("opencode.json"),
    ]
}

pub fn plugin_absolute_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for base in [dir.join("resources"), dir.to_path_buf()] {
                let packaged = base.join(PLUGIN_RESOURCE);
                if packaged.is_file() {
                    return packaged;
                }
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .join(PLUGIN_RESOURCE)
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

fn backup_path_for(settings: &Path) -> PathBuf {
    let parent = settings.parent().unwrap_or(Path::new("."));
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    parent.join(format!(
        "{}.onetone-backup-{stamp}",
        settings
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("opencode.json")
    ))
}

fn entry_is_ours(v: &Value) -> bool {
    v.as_str()
        .map(|s| s.contains(PLUGIN_MARKER))
        .unwrap_or(false)
}

fn plugins_array_mut(root: &mut Value) -> &mut Vec<Value> {
    if !root.is_object() {
        *root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    if !obj.contains_key("plugin") || !obj.get("plugin").map(|p| p.is_array()).unwrap_or(false) {
        obj.insert("plugin".into(), json!([]));
    }
    obj.get_mut("plugin").unwrap().as_array_mut().unwrap()
}

fn file_configured(root: &Value) -> bool {
    root.get("plugin")
        .and_then(|p| p.as_array())
        .map(|arr| arr.iter().any(entry_is_ours))
        .unwrap_or(false)
}

fn merge_plugin(root: &mut Value, plugin_abs: &str) -> (bool, bool) {
    let arr = plugins_array_mut(root);
    let mut added = false;
    let mut refreshed = false;
    for item in arr.iter_mut() {
        if entry_is_ours(item) {
            let next = json!(plugin_abs);
            if item != &next {
                *item = next;
                refreshed = true;
            }
            return (added, refreshed);
        }
    }
    arr.push(json!(plugin_abs));
    added = true;
    (added, refreshed)
}

fn remove_plugin(root: &mut Value) -> usize {
    let Some(arr) = root.get_mut("plugin").and_then(|p| p.as_array_mut()) else {
        return 0;
    };
    let before = arr.len();
    arr.retain(|v| !entry_is_ours(v));
    before.saturating_sub(arr.len())
}

fn read_root(path: &Path) -> Result<Value, String> {
    if !path.is_file() {
        return Ok(json!({ "plugin": [] }));
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read_failed:{e}"))?;
    serde_json::from_str(&raw).map_err(|_| "settings_parse_failed".into())
}

pub fn setup_status() -> Result<ShellHookSetupStatus, String> {
    let plugin = plugin_absolute_path();
    let plugin_abs = plugin.to_string_lossy().replace('\\', "/");
    let paths = config_paths();
    let primary = paths
        .first()
        .cloned()
        .unwrap_or_else(|| home_dir().join(".config").join("opencode").join("opencode.json"));
    let mut exists = false;
    let mut parse_ok = true;
    let mut configured = false;
    for p in &paths {
        if !p.is_file() {
            continue;
        }
        exists = true;
        match read_root(p) {
            Ok(root) => {
                if file_configured(&root) {
                    configured = true;
                }
            }
            Err(_) => parse_ok = false,
        }
    }
    let mut draft = json!({ "plugin": [] });
    let _ = merge_plugin(&mut draft, &plugin_abs);
    Ok(ShellHookSetupStatus {
        kind: "opencode".into(),
        settings_path: primary.display().to_string(),
        settings_exists: exists || primary.parent().map(|d| d.is_dir()).unwrap_or(false),
        settings_parse_ok: parse_ok,
        probe_exists: plugin.is_file(),
        probe_script_path: plugin_abs.clone(),
        onetone_configured: configured,
        draft_json: serde_json::to_string_pretty(&draft).unwrap_or_default(),
        can_install: plugin.is_file(),
        node_available: node_available(),
    })
}

pub fn install_confirm() -> ShellHookWriteResult {
    let plugin = plugin_absolute_path();
    if !plugin.is_file() {
        return ShellHookWriteResult {
            ok: false,
            message: "plugin_missing".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    }
    let plugin_abs = plugin.to_string_lossy().replace('\\', "/");
    let target = config_paths()
        .into_iter()
        .find(|p| p.is_file())
        .unwrap_or_else(|| home_dir().join(".config").join("opencode").join("opencode.json"));
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let backup = if target.is_file() {
        let b = backup_path_for(&target);
        let _ = fs::copy(&target, &b);
        b.display().to_string()
    } else {
        String::new()
    };
    let mut root = match read_root(&target) {
        Ok(v) => v,
        Err(e) => {
            return ShellHookWriteResult {
                ok: false,
                message: e,
                backup_path: backup,
                added: vec![],
                refreshed: vec![],
                removed: 0,
            };
        }
    };
    let (added, refreshed) = merge_plugin(&mut root, &plugin_abs);
    match fs::write(
        &target,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
    ) {
        Ok(()) => ShellHookWriteResult {
            ok: true,
            message: "installed".into(),
            backup_path: backup,
            added: if added { vec!["plugin".into()] } else { vec![] },
            refreshed: if refreshed { vec!["plugin".into()] } else { vec![] },
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
    let mut total = 0usize;
    let mut backup = String::new();
    for target in config_paths() {
        if !target.is_file() {
            continue;
        }
        let Ok(mut root) = read_root(&target) else {
            continue;
        };
        let removed = remove_plugin(&mut root);
        if removed == 0 {
            continue;
        }
        let b = backup_path_for(&target);
        let _ = fs::copy(&target, &b);
        backup = b.display().to_string();
        if fs::write(
            &target,
            serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
        )
        .is_ok()
        {
            total += removed;
        }
    }
    ShellHookWriteResult {
        ok: true,
        message: if total > 0 {
            "uninstalled".into()
        } else {
            "nothing_to_uninstall".into()
        },
        backup_path: backup,
        added: vec![],
        refreshed: vec![],
        removed: total,
    }
}
