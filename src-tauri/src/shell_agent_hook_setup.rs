//! Soft Pad shell-agent hook install for WorkBuddy / Trae / Qoder / Copilot CLI / Gemini.
//! Value-tree merge only — never string-splice. Uninstall removes only
//! commands marked with the profile `--onetone-hook-id`.

use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const PROBE_RESOURCE: &str = "scripts/agent-shell-hook-probe.js";

#[derive(Debug, Clone, Copy)]
pub struct ShellHookProfile {
    pub kind: AgentKind,
    pub hook_id: &'static str,
    pub source_arg: &'static str,
    /// When true, event map is the JSON root (Trae). Otherwise under `hooks`.
    pub hooks_at_root: bool,
    pub events: &'static [(&'static str, u64)],
}

pub const WORKBUDDY: ShellHookProfile = ShellHookProfile {
    kind: AgentKind::WorkBuddy,
    hook_id: "workbuddy-activity-v1",
    source_arg: "workbuddy",
    hooks_at_root: false,
    events: &[
        ("SessionStart", 5),
        ("UserPromptSubmit", 5),
        ("PreToolUse", 5),
        ("PostToolUse", 5),
        ("PermissionRequest", 5),
        ("Stop", 5),
        ("StopFailure", 5),
    ],
};

pub const TRAE: ShellHookProfile = ShellHookProfile {
    kind: AgentKind::TraeCode,
    hook_id: "trae-activity-v1",
    source_arg: "trae_code",
    // Trae Code / IDE docs: { "version": 1, "hooks": { "<Event>": [...] } } — not events at root.
    hooks_at_root: false,
    events: &[
        ("SessionStart", 30),
        ("UserPromptSubmit", 30),
        ("PreToolUse", 30),
        ("PostToolUse", 30),
        ("Stop", 30),
        ("Notification", 30),
    ],
};

pub const QODER: ShellHookProfile = ShellHookProfile {
    kind: AgentKind::Qoder,
    hook_id: "qoder-activity-v1",
    source_arg: "qoder",
    hooks_at_root: false,
    events: &[
        ("UserPromptSubmit", 5),
        ("PreToolUse", 5),
        ("PostToolUse", 5),
        ("PostToolUseFailure", 5),
        ("Stop", 5),
    ],
};

pub const COPILOT: ShellHookProfile = ShellHookProfile {
    kind: AgentKind::CopilotCli,
    hook_id: "copilot-cli-activity-v1",
    source_arg: "copilot_cli",
    hooks_at_root: false,
    events: &[
        ("UserPromptSubmit", 5),
        ("PreToolUse", 5),
        ("PostToolUse", 5),
        ("PermissionRequest", 5),
        ("Stop", 5),
        ("StopFailure", 5),
    ],
};

/// Official Gemini CLI event names; probe normalizes BeforeTool/AfterTool/AfterAgent.
pub const GEMINI: ShellHookProfile = ShellHookProfile {
    kind: AgentKind::Gemini,
    hook_id: "gemini-activity-v1",
    source_arg: "gemini",
    hooks_at_root: false,
    events: &[
        ("SessionStart", 5),
        ("BeforeTool", 5),
        ("AfterTool", 5),
        ("AfterAgent", 5),
    ],
};

pub fn profile_for_kind(kind: AgentKind) -> Option<&'static ShellHookProfile> {
    match kind {
        AgentKind::WorkBuddy => Some(&WORKBUDDY),
        AgentKind::TraeCode => Some(&TRAE),
        AgentKind::Qoder => Some(&QODER),
        AgentKind::CopilotCli => Some(&COPILOT),
        AgentKind::Gemini => Some(&GEMINI),
        _ => None,
    }
}

pub fn profile_from_str(s: &str) -> Option<&'static ShellHookProfile> {
    AgentKind::from_kind_str(s).and_then(profile_for_kind)
}

pub fn settings_path(profile: &ShellHookProfile) -> PathBuf {
    let home = home_dir();
    match profile.kind {
        AgentKind::WorkBuddy => resolve_workbuddy_settings_path(),
        AgentKind::TraeCode => resolve_trae_hooks_path(),
        AgentKind::Qoder => home.join(".qoder").join("settings.json"),
        AgentKind::CopilotCli => home.join(".copilot").join("settings.json"),
        AgentKind::Gemini => home.join(".gemini").join("settings.json"),
        _ => home.join(".onetone-unknown").join("hooks.json"),
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// WorkBuddy desktop generations (community clawd / WorkBuddy AI):
/// 1) `~/.workbuddy-ai/settings.json` (current)
/// 2) `~/.workbuddy/settings.json` (legacy — still what this Windows build uses)
/// 3) `~/.codebuddy/settings.json` (mis-wired historical OneTone path — detect/clean only)
pub fn workbuddy_settings_candidates() -> Vec<PathBuf> {
    let home = home_dir();
    vec![
        home.join(".workbuddy-ai").join("settings.json"),
        home.join(".workbuddy").join("settings.json"),
        home.join(".codebuddy").join("settings.json"),
    ]
}

/// Prefer workbuddy-ai when that generation exists; else legacy settings file.
/// Never choose `.codebuddy` as the write target (CodeBuddy CLI ≠ WorkBuddy desktop).
pub fn resolve_workbuddy_settings_path() -> PathBuf {
    let home = home_dir();
    let current = home.join(".workbuddy-ai").join("settings.json");
    let current_dir = home.join(".workbuddy-ai");
    if current.is_file() || current_dir.is_dir() {
        return current;
    }
    let legacy = home.join(".workbuddy").join("settings.json");
    if legacy.is_file() {
        return legacy;
    }
    current
}

/// Trae global hooks: CN docs use `~/.trae-cn/hooks.json`; intl `~/.trae/hooks.json`.
pub fn trae_hooks_candidates() -> Vec<PathBuf> {
    let home = home_dir();
    vec![
        home.join(".trae-cn").join("hooks.json"),
        home.join(".trae").join("hooks.json"),
    ]
}

pub fn resolve_trae_hooks_path() -> PathBuf {
    let home = home_dir();
    let cn = home.join(".trae-cn").join("hooks.json");
    let cn_dir = home.join(".trae-cn");
    if cn.is_file() || cn_dir.is_dir() {
        return cn;
    }
    home.join(".trae").join("hooks.json")
}

pub fn trae_cn_hooks_path() -> PathBuf {
    home_dir().join(".trae-cn").join("hooks.json")
}

pub fn qoder_cn_settings_path() -> PathBuf {
    home_dir().join(".qoder-cn").join("settings.json")
}

pub fn probe_absolute_path() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let packaged = dir.join("resources").join(PROBE_RESOURCE);
            if packaged.is_file() {
                return packaged;
            }
            let sibling = dir.join(PROBE_RESOURCE);
            if sibling.is_file() {
                return sibling;
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or(Path::new("."))
        .join(PROBE_RESOURCE)
}

pub fn build_command(profile: &ShellHookProfile, probe_abs: &str) -> String {
    let path = if probe_abs.is_empty() {
        format!("REPO_ROOT/{}", PROBE_RESOURCE)
    } else {
        probe_abs.replace('\\', "/")
    };
    format!(
        "node \"{path}\" --onetone-hook-id {} --source {}",
        profile.hook_id, profile.source_arg
    )
}

fn command_has_hook_id(command: &str, hook_id: &str) -> bool {
    let c = command.to_ascii_lowercase();
    let id = hook_id.to_ascii_lowercase();
    c.contains(&id) && c.contains("onetone-hook-id")
}

fn matcher_block(cmd: &str, timeout: u64) -> Value {
    json!({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": cmd,
            "timeout": timeout
        }]
    })
}

fn hooks_object_mut<'a>(root: &'a mut Value, at_root: bool) -> Option<&'a mut Map<String, Value>> {
    if at_root {
        if !root.is_object() {
            *root = json!({});
        }
        return root.as_object_mut();
    }
    if !root.is_object() {
        *root = json!({});
    }
    let obj = root.as_object_mut()?;
    if !obj.contains_key("hooks") || !obj.get("hooks").map(|h| h.is_object()).unwrap_or(false) {
        obj.insert("hooks".into(), json!({}));
    }
    obj.get_mut("hooks")?.as_object_mut()
}

/// Older OneTone builds wrote Trae events at the JSON root. Official format nests under `hooks`.
fn migrate_trae_legacy_root(root: &mut Value) {
    let Some(obj) = root.as_object_mut() else {
        return;
    };
    if !obj.contains_key("version") {
        obj.insert("version".into(), json!(1));
    }
    const LEGACY: &[&str] = &[
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "Notification",
    ];
    let mut moved = serde_json::Map::new();
    for name in LEGACY {
        if let Some(v) = obj.remove(*name) {
            moved.insert((*name).to_string(), v);
        }
    }
    if moved.is_empty() {
        if !obj.contains_key("hooks") {
            obj.insert("hooks".into(), json!({}));
        }
        return;
    }
    let hooks = obj
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut();
    let Some(hooks) = hooks else {
        return;
    };
    for (k, v) in moved {
        hooks.entry(k).or_insert(v);
    }
}

fn event_has_hook_id(event_val: &Value, hook_id: &str) -> bool {
    let Some(arr) = event_val.as_array() else {
        return false;
    };
    for matcher in arr {
        if let Some(hooks) = matcher.get("hooks").and_then(|h| h.as_array()) {
            for hook in hooks {
                let cmd = hook.get("command").and_then(|c| c.as_str()).unwrap_or("");
                if command_has_hook_id(cmd, hook_id) {
                    return true;
                }
            }
        }
        // Flat Cursor-style: { "command": "..." }
        let cmd = matcher.get("command").and_then(|c| c.as_str()).unwrap_or("");
        if command_has_hook_id(cmd, hook_id) {
            return true;
        }
    }
    false
}

#[derive(Debug, Default)]
pub struct MergeStats {
    pub added: Vec<String>,
    pub refreshed: Vec<String>,
    pub skipped: Vec<String>,
}

pub fn merge_hooks(profile: &ShellHookProfile, root: &mut Value, probe_abs: &str) -> MergeStats {
    let Some(hooks) = hooks_object_mut(root, profile.hooks_at_root) else {
        return MergeStats::default();
    };
    let desired = build_command(profile, probe_abs);
    let mut stats = MergeStats::default();
    for (ev, timeout) in profile.events {
        let entry = hooks.entry((*ev).to_string()).or_insert_with(|| json!([]));
        if !entry.is_array() {
            stats.skipped.push((*ev).to_string());
            continue;
        }
        if event_has_hook_id(entry, profile.hook_id) {
            let mut refreshed = false;
            if let Some(arr) = entry.as_array_mut() {
                for matcher in arr.iter_mut() {
                    if let Some(hooks_arr) = matcher.get_mut("hooks").and_then(|h| h.as_array_mut())
                    {
                        for hook in hooks_arr.iter_mut() {
                            let cmd = hook
                                .get("command")
                                .and_then(|c| c.as_str())
                                .unwrap_or("");
                            if command_has_hook_id(cmd, profile.hook_id) {
                                if cmd.trim() != desired.trim() {
                                    hook.as_object_mut()
                                        .map(|o| o.insert("command".into(), json!(desired.clone())));
                                    refreshed = true;
                                }
                                hook.as_object_mut()
                                    .map(|o| o.insert("timeout".into(), json!(timeout)));
                            }
                        }
                    }
                }
            }
            if refreshed {
                stats.refreshed.push((*ev).to_string());
            } else {
                stats.skipped.push((*ev).to_string());
            }
        } else {
            entry
                .as_array_mut()
                .unwrap()
                .push(matcher_block(&desired, *timeout));
            stats.added.push((*ev).to_string());
        }
    }
    stats
}

pub fn uninstall_hooks(profile: &ShellHookProfile, root: &mut Value) -> usize {
    let Some(hooks) = hooks_object_mut(root, profile.hooks_at_root) else {
        return 0;
    };
    let mut removed = 0;
    let keys: Vec<String> = hooks.keys().cloned().collect();
    for key in keys {
        let Some(event_val) = hooks.get_mut(&key) else {
            continue;
        };
        let Some(arr) = event_val.as_array_mut() else {
            continue;
        };
        let mut new_matchers = Vec::new();
        for mut matcher in arr.drain(..) {
            if let Some(hooks_arr) = matcher.get_mut("hooks").and_then(|h| h.as_array_mut()) {
                let before = hooks_arr.len();
                hooks_arr.retain(|hook| {
                    let cmd = hook.get("command").and_then(|c| c.as_str()).unwrap_or("");
                    !command_has_hook_id(cmd, profile.hook_id)
                });
                removed += before.saturating_sub(hooks_arr.len());
                if !hooks_arr.is_empty() {
                    new_matchers.push(matcher);
                }
            } else {
                let cmd = matcher.get("command").and_then(|c| c.as_str()).unwrap_or("");
                if command_has_hook_id(cmd, profile.hook_id) {
                    removed += 1;
                } else {
                    new_matchers.push(matcher);
                }
            }
        }
        if new_matchers.is_empty() {
            hooks.remove(&key);
        } else {
            *event_val = Value::Array(new_matchers);
        }
    }
    removed
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHookSetupStatus {
    pub kind: String,
    pub settings_path: String,
    pub settings_exists: bool,
    pub settings_parse_ok: bool,
    pub probe_exists: bool,
    pub probe_script_path: String,
    pub onetone_configured: bool,
    pub draft_json: String,
    pub can_install: bool,
    pub node_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellHookWriteResult {
    pub ok: bool,
    pub message: String,
    pub backup_path: String,
    pub added: Vec<String>,
    pub refreshed: Vec<String>,
    pub removed: usize,
}

fn node_available() -> bool {
    let mut cmd = std::process::Command::new("node");
    cmd.arg("-v");
    #[cfg(windows)]
    {
        // ponytail: avoid black console flash when Soft Pad polls hook status on app switch.
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
        "{}.onetone-backup-{}",
        settings
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("settings.json"),
        stamp
    ))
}

fn file_has_hook_id(path: &Path, profile: &ShellHookProfile) -> bool {
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(mut root) = serde_json::from_str::<Value>(&raw) else {
        return false;
    };
    if profile.kind == AgentKind::TraeCode {
        migrate_trae_legacy_root(&mut root);
    }
    let hooks = if profile.hooks_at_root {
        root.as_object()
    } else {
        root.get("hooks").and_then(|h| h.as_object())
    };
    hooks
        .map(|h| h.values().any(|ev| event_has_hook_id(ev, profile.hook_id)))
        .unwrap_or(false)
}

fn write_merged_hooks(
    profile: &ShellHookProfile,
    settings: &Path,
    probe_abs: &str,
) -> Result<MergeStats, String> {
    if let Some(parent) = settings.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut root = if settings.is_file() {
        match fs::read_to_string(settings)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
        {
            Some(v) => v,
            None => return Err("settings_parse_failed".into()),
        }
    } else if profile.hooks_at_root {
        json!({})
    } else {
        json!({ "hooks": {} })
    };
    if profile.kind == AgentKind::TraeCode {
        migrate_trae_legacy_root(&mut root);
    }
    if settings.is_file() {
        let b = backup_path_for(settings);
        let _ = fs::copy(settings, &b);
    }
    let stats = merge_hooks(profile, &mut root, probe_abs);
    fs::write(
        settings,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
    )
    .map_err(|e| format!("write_failed:{e}"))?;
    Ok(stats)
}

fn uninstall_hooks_file(profile: &ShellHookProfile, settings: &Path) -> usize {
    if !settings.is_file() {
        return 0;
    }
    let Ok(raw) = fs::read_to_string(settings) else {
        return 0;
    };
    let Ok(mut root) = serde_json::from_str::<Value>(&raw) else {
        return 0;
    };
    let removed = uninstall_hooks(profile, &mut root);
    if removed > 0 {
        let _ = fs::write(
            settings,
            serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
        );
    }
    removed
}

pub fn setup_status(kind_str: &str) -> Result<ShellHookSetupStatus, String> {
    let profile = profile_from_str(kind_str).ok_or_else(|| "bad_kind".to_string())?;
    let settings = settings_path(profile);
    let probe = probe_absolute_path();
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    let exists = settings.is_file();
    let (parse_ok, configured) = if exists {
        match fs::read_to_string(&settings).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok())
        {
            Some(root) => {
                let hooks = if profile.hooks_at_root {
                    root.as_object()
                } else {
                    root.get("hooks").and_then(|h| h.as_object())
                };
                let configured = hooks
                    .map(|h| {
                        h.values()
                            .any(|ev| event_has_hook_id(ev, profile.hook_id))
                    })
                    .unwrap_or(false);
                (true, configured)
            }
            None => (false, false),
        }
    } else {
        (true, false)
    };
    let configured = if profile.kind == AgentKind::WorkBuddy {
        workbuddy_settings_candidates()
            .iter()
            .any(|p| file_has_hook_id(p, profile))
    } else if profile.kind == AgentKind::TraeCode {
        trae_hooks_candidates()
            .iter()
            .any(|p| file_has_hook_id(p, profile))
    } else if profile.kind == AgentKind::Qoder {
        configured || file_has_hook_id(&qoder_cn_settings_path(), profile)
    } else {
        configured
    };
    let mut draft = if profile.hooks_at_root {
        json!({})
    } else {
        json!({ "hooks": {} })
    };
    if profile.kind == AgentKind::Qoder {
        draft["qoderCnSettingsPath"] = json!(qoder_cn_settings_path().display().to_string());
    }
    if profile.kind == AgentKind::TraeCode {
        draft["traeCnHooksPath"] = json!(trae_cn_hooks_path().display().to_string());
        migrate_trae_legacy_root(&mut draft);
    }
    let _ = merge_hooks(profile, &mut draft, &probe_abs);
    Ok(ShellHookSetupStatus {
        kind: profile.kind.as_str().into(),
        settings_path: settings.display().to_string(),
        settings_exists: exists,
        settings_parse_ok: parse_ok,
        probe_exists: probe.is_file(),
        probe_script_path: probe_abs,
        onetone_configured: configured,
        draft_json: serde_json::to_string_pretty(&draft).unwrap_or_default(),
        can_install: parse_ok && probe.is_file() && node_available(),
        node_available: node_available(),
    })
}

pub fn install_confirm(kind_str: &str) -> ShellHookWriteResult {
    let Some(profile) = profile_from_str(kind_str) else {
        return ShellHookWriteResult {
            ok: false,
            message: "bad_kind".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    };
    let settings = settings_path(profile);
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
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    if let Some(parent) = settings.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut root = if settings.is_file() {
        match fs::read_to_string(&settings).ok().and_then(|s| serde_json::from_str(&s).ok()) {
            Some(v) => v,
            None => {
                return ShellHookWriteResult {
                    ok: false,
                    message: "settings_parse_failed".into(),
                    backup_path: String::new(),
                    added: vec![],
                    refreshed: vec![],
                    removed: 0,
                };
            }
        }
    } else if profile.hooks_at_root {
        json!({})
    } else {
        json!({ "hooks": {} })
    };
    if profile.kind == AgentKind::TraeCode {
        migrate_trae_legacy_root(&mut root);
    }
    let backup = if settings.is_file() {
        let b = backup_path_for(&settings);
        let _ = fs::copy(&settings, &b);
        b.display().to_string()
    } else {
        String::new()
    };
    let stats = merge_hooks(profile, &mut root, &probe_abs);
    match fs::write(
        &settings,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
    ) {
        Ok(()) => {
            if profile.kind == AgentKind::Qoder {
                let cn = qoder_cn_settings_path();
                let _ = write_merged_hooks(profile, &cn, &probe_abs);
            }
            if profile.kind == AgentKind::TraeCode {
                // Always mirror into ~/.trae-cn (CN TraeCode path) even if the dir
                // did not exist yet — SOLO uses ~/.trae, IDE docs use ~/.trae-cn.
                let _ = write_merged_hooks(profile, &trae_cn_hooks_path(), &probe_abs);
            }
            if profile.kind == AgentKind::WorkBuddy {
                // Drop OneTone hooks from inactive generations (.codebuddy mis-wire, other WB root).
                for other in workbuddy_settings_candidates() {
                    if other == settings {
                        continue;
                    }
                    let _ = uninstall_hooks_file(profile, &other);
                }
            }
            ShellHookWriteResult {
            ok: true,
            message: "installed".into(),
            backup_path: backup,
            added: stats.added,
            refreshed: stats.refreshed,
            removed: 0,
        }
        }
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

pub fn uninstall(kind_str: &str) -> ShellHookWriteResult {
    let Some(profile) = profile_from_str(kind_str) else {
        return ShellHookWriteResult {
            ok: false,
            message: "bad_kind".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    };
    let settings = settings_path(profile);
    let mut extra_removed = if profile.kind == AgentKind::Qoder {
        uninstall_hooks_file(profile, &qoder_cn_settings_path())
    } else {
        0
    };
    if profile.kind == AgentKind::TraeCode {
        for other in trae_hooks_candidates() {
            if other == settings {
                continue;
            }
            extra_removed += uninstall_hooks_file(profile, &other);
        }
    }
    if profile.kind == AgentKind::WorkBuddy {
        for other in workbuddy_settings_candidates() {
            if other == settings {
                continue;
            }
            extra_removed += uninstall_hooks_file(profile, &other);
        }
    }
    if !settings.is_file() {
        return ShellHookWriteResult {
            ok: true,
            message: if extra_removed > 0 {
                "uninstalled".into()
            } else {
                "nothing_to_uninstall".into()
            },
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: extra_removed,
        };
    }
    let Ok(raw) = fs::read_to_string(&settings) else {
        return ShellHookWriteResult {
            ok: false,
            message: "read_failed".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    };
    let Ok(mut root) = serde_json::from_str::<Value>(&raw) else {
        return ShellHookWriteResult {
            ok: false,
            message: "settings_parse_failed".into(),
            backup_path: String::new(),
            added: vec![],
            refreshed: vec![],
            removed: 0,
        };
    };
    let backup = backup_path_for(&settings);
    let _ = fs::copy(&settings, &backup);
    let removed = uninstall_hooks(profile, &mut root);
    match fs::write(
        &settings,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".into()),
    ) {
        Ok(()) => ShellHookWriteResult {
            ok: true,
            message: "uninstalled".into(),
            backup_path: backup.display().to_string(),
            added: vec![],
            refreshed: vec![],
            removed: removed + extra_removed,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_workbuddy_idempotent_and_keeps_user() {
        let mut root = json!({
            "hooks": {
                "Stop": [{
                    "matcher": "",
                    "hooks": [{ "type": "command", "command": "echo user" }]
                }]
            }
        });
        let s1 = merge_hooks(&WORKBUDDY, &mut root, "C:/repo/scripts/agent-shell-hook-probe.js");
        assert!(s1.added.contains(&"UserPromptSubmit".into()));
        assert!(s1.added.contains(&"Stop".into()) || s1.skipped.contains(&"Stop".into()) || {
            // Stop already had user hook — we append OneTone matcher
            root["hooks"]["Stop"].as_array().map(|a| a.len() >= 2).unwrap_or(false)
        });
        let stop = root["hooks"]["Stop"].as_array().unwrap();
        assert!(stop.iter().any(|m| {
            m.get("hooks")
                .and_then(|h| h.as_array())
                .map(|arr| {
                    arr.iter().any(|h| {
                        h.get("command")
                            .and_then(|c| c.as_str())
                            .map(|c| c.contains("echo user"))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false)
        }));
        let s2 = merge_hooks(&WORKBUDDY, &mut root, "C:/repo/scripts/agent-shell-hook-probe.js");
        assert!(s2.added.is_empty());
        let removed = uninstall_hooks(&WORKBUDDY, &mut root);
        assert!(removed > 0);
        let stop_after = root["hooks"]["Stop"].as_array().unwrap();
        assert!(stop_after.iter().any(|m| {
            m.get("hooks")
                .and_then(|h| h.as_array())
                .map(|arr| {
                    arr.iter().any(|h| {
                        h.get("command")
                            .and_then(|c| c.as_str())
                            .map(|c| c.contains("echo user"))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false)
        }));
        assert!(!event_has_hook_id(
            &root["hooks"]["UserPromptSubmit"],
            WORKBUDDY.hook_id
        ));
    }

    #[test]
    fn merge_trae_under_hooks_wrapper() {
        let mut root = json!({});
        migrate_trae_legacy_root(&mut root);
        let s = merge_hooks(&TRAE, &mut root, "/tmp/agent-shell-hook-probe.js");
        assert!(s.added.contains(&"Notification".into()));
        assert_eq!(root.get("version").and_then(|v| v.as_u64()), Some(1));
        assert!(root.get("Stop").is_none());
        assert!(root
            .pointer("/hooks/Stop")
            .and_then(|v| v.as_array())
            .is_some());
        let removed = uninstall_hooks(&TRAE, &mut root);
        assert!(removed > 0);
    }

    #[test]
    fn migrate_trae_moves_legacy_root_events() {
        let mut root = json!({
            "SessionStart": [{ "hooks": [{ "command": "echo legacy" }] }],
            "Stop": [{ "hooks": [{ "command": "echo stop" }] }]
        });
        migrate_trae_legacy_root(&mut root);
        assert!(root.get("SessionStart").is_none());
        assert_eq!(
            root.pointer("/hooks/SessionStart/0/hooks/0/command")
                .and_then(|v| v.as_str()),
            Some("echo legacy")
        );
    }

    #[test]
    fn trae_hooks_prefer_cn_when_present_else_intl() {
        let p = resolve_trae_hooks_path();
        let s = p.to_string_lossy().replace('\\', "/");
        assert!(
            s.ends_with(".trae-cn/hooks.json") || s.ends_with(".trae/hooks.json"),
            "expected trae-cn or trae hooks.json: {s}"
        );
        let cands = trae_hooks_candidates();
        assert_eq!(cands.len(), 2);
        assert!(cands[0].to_string_lossy().contains("trae-cn"));
        assert!(cands[1].to_string_lossy().contains(".trae"));
    }

    #[test]
    fn workbuddy_settings_prefer_legacy_file_over_codebuddy() {
        // Pure path logic: resolve never returns .codebuddy as primary.
        let p = resolve_workbuddy_settings_path();
        let s = p.to_string_lossy().replace('\\', "/");
        assert!(
            !s.ends_with(".codebuddy/settings.json"),
            "WorkBuddy must not write CodeBuddy CLI path: {s}"
        );
        assert!(
            s.ends_with(".workbuddy-ai/settings.json") || s.ends_with(".workbuddy/settings.json"),
            "expected workbuddy-ai or workbuddy settings: {s}"
        );
        let cands = workbuddy_settings_candidates();
        assert_eq!(cands.len(), 3);
        assert!(cands[0].to_string_lossy().contains("workbuddy-ai"));
        assert!(cands[1].to_string_lossy().contains(".workbuddy"));
        assert!(cands[2].to_string_lossy().contains(".codebuddy"));
    }

    #[test]
    fn profiles_resolve() {
        assert_eq!(profile_from_str("workbuddy").unwrap().hook_id, "workbuddy-activity-v1");
        assert_eq!(profile_from_str("codebuddy").unwrap().source_arg, "workbuddy");
        assert_eq!(profile_from_str("traeCode").unwrap().hooks_at_root, false);
        assert_eq!(profile_from_str("traeCode").unwrap().source_arg, "trae_code");
        assert_eq!(profile_from_str("traeCode").unwrap().kind, AgentKind::TraeCode);
        assert!(profile_from_str("trae").is_none());
        assert_eq!(profile_from_str("qoder").unwrap().kind, AgentKind::Qoder);
        assert_eq!(
            profile_from_str("copilotCli").unwrap().hook_id,
            "copilot-cli-activity-v1"
        );
        assert_eq!(profile_from_str("copilot_cli").unwrap().source_arg, "copilot_cli");
        assert_eq!(profile_from_str("gemini").unwrap().hook_id, "gemini-activity-v1");
        assert_eq!(profile_from_str("gemini").unwrap().source_arg, "gemini");
        assert!(profile_from_str("gemini")
            .unwrap()
            .events
            .iter()
            .any(|(e, _)| *e == "BeforeTool"));
        assert!(profile_from_str("claude").is_none());
    }
}
