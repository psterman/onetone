//! Claude Code Hook install / preview / uninstall for Soft Pad Activity.
//!
//! Merge and uninstall operate on `serde_json::Value` trees only — never string-splice
//! hooks. Writes require explicit user confirm IPC. Uninstall removes only commands
//! marked with `--onetone-hook-id claude-activity-v1` (no whole-file restore).

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Map, Value};

pub const HOOK_ID: &str = "claude-activity-v1";
/// Strict marker flag; ownership checks must match this exact form.
pub const STATUSLINE_MARKER: &str = "--onetone-statusline-id=onetone-claude-usage-v1";

const PHASE_CONNECTED_MS: u64 = 30_000;
const PHASE_STALE_MS: u64 = 300_000;

const PREVIEW_COPY: &str = "\
OneTone 将向 Claude Hooks 添加以下事件：\n\n\
SessionStart：让 Soft Pad 在 Claude 会话开始时出现\n\
UserPromptSubmit：显示 Claude 正在工作\n\
PermissionRequest：高亮确认 / 拒绝键\n\
Stop / StopFailure：显示完成或失败\n\
SubagentStart / SubagentStop：显示多个 Claude agent 活动灯\n\n\
不会删除或覆盖你已有的 Claude Hooks。\n\
安装前会自动备份 settings.json。";

const UNINSTALL_PREVIEW: &str = "\
撤回 OneTone Claude Hooks\n\n\
将删除：\n\
- SessionStart 中 OneTone probe\n\
- UserPromptSubmit 中 OneTone probe\n\
- PermissionRequest 中 OneTone probe\n\
- Stop / StopFailure 中 OneTone probe\n\
- SubagentStart / SubagentStop 中 OneTone probe\n\n\
不会删除：\n\
- 你自己配置的 Claude Hooks\n\
- 其他工具的 Hooks\n\
- 非 OneTone 的 statusLine\n\
- Claude 设置里的权限、模型、主题等配置";

/// Event name → command timeout seconds.
pub fn install_events() -> &'static [(&'static str, u64)] {
    &[
        ("SessionStart", 5),
        ("UserPromptSubmit", 5),
        ("PermissionRequest", 60),
        ("Notification", 60),
        ("Stop", 5),
        ("StopFailure", 5),
        ("SubagentStart", 5),
        ("SubagentStop", 5),
    ]
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHookIssue {
    pub severity: String,
    pub title: String,
    pub reason: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHookSetupStatus {
    pub settings_path: String,
    pub settings_exists: bool,
    pub settings_parse_ok: bool,
    pub probe_exists: bool,
    pub probe_script_path: String,
    pub configured_probe_path: String,
    pub configured_probe_exists: bool,
    pub onetone_configured: bool,
    pub has_user_hooks: bool,
    pub draft_json: String,
    /// Alias for clipboard copy compatibility.
    pub hooks_draft_json: String,
    pub merged_preview: String,
    pub diff: String,
    pub backup_path: String,
    pub node_available: bool,
    /// not_installed | error | connected | stale | waiting | offline
    pub install_phase: String,
    pub soft_pad_visible: bool,
    pub cli_pref_enabled: bool,
    pub cli_can_inject: bool,
    pub preview_copy: String,
    pub uninstall_preview: String,
    pub can_install: bool,
    pub trust_hint: String,
    pub issues: Vec<ClaudeHookIssue>,
    pub last_event: String,
    pub last_age_ms: u64,
    /// Legacy alias used by older UI chips.
    pub panel_phase: String,
    pub settings_file_exists: bool,
    pub settings_file_path: String,
    pub probe_configured: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHookWriteResult {
    pub ok: bool,
    pub reason: String,
    pub backup_path: String,
    pub settings_path: String,
    pub onetone_configured: bool,
    pub added_events: Vec<String>,
    pub refreshed_events: Vec<String>,
    pub skipped_events: Vec<String>,
    pub removed_count: usize,
}

fn settings_override() -> &'static Mutex<Option<PathBuf>> {
    static OVR: std::sync::OnceLock<Mutex<Option<PathBuf>>> = std::sync::OnceLock::new();
    OVR.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
pub fn set_settings_path_override_for_test(path: Option<PathBuf>) {
    *settings_override().lock().unwrap() = path;
}

pub fn settings_json_path() -> PathBuf {
    if let Some(p) = settings_override().lock().unwrap().clone() {
        return p;
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".claude").join("settings.json");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".claude").join("settings.json");
    }
    PathBuf::from(".claude").join("settings.json")
}

pub fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

pub fn probe_script_path() -> PathBuf {
    repo_root().join("scripts").join("claude-hook-probe.js")
}

pub fn statusline_probe_script_path() -> PathBuf {
    repo_root().join("scripts").join("claude-statusline-probe.js")
}

pub fn probe_script_abs_slash() -> String {
    let p = probe_script_path();
    if p.is_file() {
        p.to_string_lossy().replace('\\', "/")
    } else {
        String::new()
    }
}

pub fn statusline_probe_abs_slash() -> String {
    let p = statusline_probe_script_path();
    if p.is_file() {
        p.to_string_lossy().replace('\\', "/")
    } else {
        String::new()
    }
}

pub fn build_onetone_command(probe_abs: &str) -> String {
    let path = if probe_abs.is_empty() {
        "REPO_ROOT/scripts/claude-hook-probe.js"
    } else {
        probe_abs
    };
    format!("node \"{path}\" --onetone-hook-id {HOOK_ID} --source onetone")
}

pub fn build_onetone_statusline_command(probe_abs: &str) -> String {
    let path = if probe_abs.is_empty() {
        "REPO_ROOT/scripts/claude-statusline-probe.js"
    } else {
        probe_abs
    };
    format!("node \"{path}\" {STATUSLINE_MARKER}")
}

pub fn command_has_onetone_id(command: &str) -> bool {
    let c = command.to_ascii_lowercase();
    c.contains("claude-activity-v1") && c.contains("onetone-hook-id")
}

pub fn command_has_onetone_statusline_id(command: &str) -> bool {
    command.contains(STATUSLINE_MARKER)
}

/// missing | onetone_owned | foreign | malformed
pub fn statusline_ownership(root: &Value) -> &'static str {
    let Some(sl) = root.get("statusLine") else {
        return "missing";
    };
    if !sl.is_object() {
        return "malformed";
    }
    let cmd = sl.get("command").and_then(|c| c.as_str()).unwrap_or("");
    if cmd.is_empty() {
        // type-only or empty command — treat as foreign to avoid overwrite
        if sl.as_object().map(|o| o.is_empty()).unwrap_or(true) {
            return "missing";
        }
        return "foreign";
    }
    if command_has_onetone_statusline_id(cmd) {
        "onetone_owned"
    } else {
        "foreign"
    }
}

/// Install or refresh OneTone statusLine. Returns Ok(action) where action is
/// added | refreshed | skipped_foreign | skipped_malformed | unchanged.
pub fn merge_onetone_statusline(root: &mut Value, probe_abs: &str) -> Result<&'static str, &'static str> {
    let ownership = statusline_ownership(root);
    match ownership {
        "foreign" => Ok("skipped_foreign"),
        "malformed" => Ok("skipped_malformed"),
        "missing" | "onetone_owned" => {
            let cmd = build_onetone_statusline_command(probe_abs);
            let obj = root
                .as_object_mut()
                .ok_or("settings_not_object")?;
            let already = obj
                .get("statusLine")
                .and_then(|v| v.get("command"))
                .and_then(|c| c.as_str())
                == Some(cmd.as_str());
            obj.insert(
                "statusLine".into(),
                json!({
                    "type": "command",
                    "command": cmd
                }),
            );
            if ownership == "missing" {
                Ok("added")
            } else if already {
                Ok("unchanged")
            } else {
                Ok("refreshed")
            }
        }
        _ => Ok("unchanged"),
    }
}

/// Remove only OneTone-marked statusLine. Returns 1 if removed.
pub fn uninstall_onetone_statusline(root: &mut Value) -> usize {
    if statusline_ownership(root) != "onetone_owned" {
        return 0;
    }
    if let Some(obj) = root.as_object_mut() {
        obj.remove("statusLine");
        return 1;
    }
    0
}

/// Best-effort extract of the quoted path after `node`.
pub fn extract_probe_path_from_command(command: &str) -> Option<String> {
    let lower = command.to_ascii_lowercase();
    let idx = lower.find("node")?;
    let rest = command[idx + 4..].trim_start();
    if let Some(stripped) = rest.strip_prefix('"') {
        let end = stripped.find('"')?;
        return Some(stripped[..end].replace('/', "\\"));
    }
    let tok = rest.split_whitespace().next()?;
    Some(tok.trim_matches('"').replace('/', "\\"))
}

pub fn timeout_for_event(event: &str) -> u64 {
    install_events()
        .iter()
        .find(|(e, _)| *e == event)
        .map(|(_, t)| *t)
        .unwrap_or(5)
}

pub fn build_draft_hooks_value(probe_abs: &str) -> Value {
    let cmd = build_onetone_command(probe_abs);
    let mut hooks = Map::new();
    for (ev, timeout) in install_events() {
        hooks.insert(
            (*ev).to_string(),
            json!([{
                "matcher": "",
                "hooks": [{
                    "type": "command",
                    "command": cmd,
                    "timeout": timeout
                }]
            }]),
        );
    }
    json!({ "hooks": hooks })
}

pub fn build_draft_json(probe_abs: &str) -> String {
    serde_json::to_string_pretty(&build_draft_hooks_value(probe_abs))
        .unwrap_or_else(|_| "{}".into())
}

fn onetone_matcher_block(probe_abs: &str, timeout: u64) -> Value {
    json!({
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": build_onetone_command(probe_abs),
            "timeout": timeout
        }]
    })
}

fn walk_commands_mut(event_val: &mut Value, mut f: impl FnMut(&mut String) -> bool) -> bool {
    let Some(arr) = event_val.as_array_mut() else {
        return false;
    };
    let mut touched = false;
    for matcher in arr.iter_mut() {
        let Some(hooks) = matcher.get_mut("hooks").and_then(|h| h.as_array_mut()) else {
            continue;
        };
        for hook in hooks.iter_mut() {
            let Some(cmd) = hook.get_mut("command").and_then(|c| c.as_str()).map(|s| s.to_string()) else {
                continue;
            };
            if !command_has_onetone_id(&cmd) {
                continue;
            }
            if let Some(cmd_v) = hook.get_mut("command") {
                let mut s = cmd.clone();
                if f(&mut s) {
                    *cmd_v = Value::String(s);
                    touched = true;
                }
            }
        }
    }
    touched
}

fn event_has_onetone_id(event_val: &Value) -> bool {
    let Some(arr) = event_val.as_array() else {
        return false;
    };
    for matcher in arr {
        let Some(hooks) = matcher.get("hooks").and_then(|h| h.as_array()) else {
            continue;
        };
        for hook in hooks {
            if let Some(cmd) = hook.get("command").and_then(|c| c.as_str()) {
                if command_has_onetone_id(cmd) {
                    return true;
                }
            }
        }
    }
    false
}

fn first_configured_probe_path(root: &Value) -> Option<String> {
    let hooks = root.get("hooks")?.as_object()?;
    for (ev, _) in install_events() {
        let Some(event_val) = hooks.get(*ev) else {
            continue;
        };
        let Some(arr) = event_val.as_array() else {
            continue;
        };
        for matcher in arr {
            let Some(hooks_arr) = matcher.get("hooks").and_then(|h| h.as_array()) else {
                continue;
            };
            for hook in hooks_arr {
                if let Some(cmd) = hook.get("command").and_then(|c| c.as_str()) {
                    if command_has_onetone_id(cmd) {
                        return extract_probe_path_from_command(cmd);
                    }
                }
            }
        }
    }
    // Also scan any event for legacy/partial installs.
    for (_k, event_val) in hooks {
        let Some(arr) = event_val.as_array() else {
            continue;
        };
        for matcher in arr {
            let Some(hooks_arr) = matcher.get("hooks").and_then(|h| h.as_array()) else {
                continue;
            };
            for hook in hooks_arr {
                if let Some(cmd) = hook.get("command").and_then(|c| c.as_str()) {
                    if command_has_onetone_id(cmd) {
                        return extract_probe_path_from_command(cmd);
                    }
                }
            }
        }
    }
    None
}

fn count_non_onetone_hooks(root: &Value) -> usize {
    let Some(hooks) = root.get("hooks").and_then(|h| h.as_object()) else {
        return 0;
    };
    let mut n = 0;
    for (_k, event_val) in hooks {
        let Some(arr) = event_val.as_array() else {
            continue;
        };
        for matcher in arr {
            let Some(hooks_arr) = matcher.get("hooks").and_then(|h| h.as_array()) else {
                continue;
            };
            for hook in hooks_arr {
                let cmd = hook.get("command").and_then(|c| c.as_str()).unwrap_or("");
                if !command_has_onetone_id(cmd) {
                    n += 1;
                }
            }
        }
    }
    n
}

fn onetone_configured(root: &Value) -> bool {
    let Some(hooks) = root.get("hooks").and_then(|h| h.as_object()) else {
        return false;
    };
    for (_k, event_val) in hooks {
        if event_has_onetone_id(event_val) {
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

/// Structural merge: append missing events; refresh command path when id exists but path differs.
pub fn merge_onetone_hooks(root: &mut Value, probe_abs: &str) -> MergeStats {
    if !root.is_object() {
        *root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    if !obj.contains_key("hooks") || !obj.get("hooks").map(|h| h.is_object()).unwrap_or(false) {
        obj.insert("hooks".into(), json!({}));
    }
    let hooks = obj.get_mut("hooks").unwrap().as_object_mut().unwrap();
    let desired = build_onetone_command(probe_abs);
    let mut stats = MergeStats::default();

    for (ev, timeout) in install_events() {
        let entry = hooks.entry((*ev).to_string()).or_insert_with(|| json!([]));
        if !entry.is_array() {
            // Unknown shape — leave alone; treat as cannot append.
            stats.skipped.push((*ev).to_string());
            continue;
        }
        if event_has_onetone_id(entry) {
            let mut refreshed = false;
            walk_commands_mut(entry, |cmd| {
                if cmd.trim() == desired.trim() {
                    false
                } else {
                    *cmd = desired.clone();
                    refreshed = true;
                    true
                }
            });
            // Also refresh timeout on PermissionRequest etc.
            if let Some(arr) = entry.as_array_mut() {
                for matcher in arr.iter_mut() {
                    if let Some(hooks_arr) = matcher.get_mut("hooks").and_then(|h| h.as_array_mut()) {
                        for hook in hooks_arr.iter_mut() {
                            let cmd = hook
                                .get("command")
                                .and_then(|c| c.as_str())
                                .unwrap_or("");
                            if command_has_onetone_id(cmd) {
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
                .push(onetone_matcher_block(probe_abs, *timeout));
            stats.added.push((*ev).to_string());
        }
    }
    stats
}

/// Remove only OneTone-marked commands; prune empty matcher shells.
pub fn uninstall_onetone_hooks(root: &mut Value) -> usize {
    let Some(hooks) = root.get_mut("hooks").and_then(|h| h.as_object_mut()) else {
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
        for matcher in arr.drain(..) {
            let mut matcher = matcher;
            let Some(hooks_arr) = matcher.get_mut("hooks").and_then(|h| h.as_array_mut()) else {
                new_matchers.push(matcher);
                continue;
            };
            let before = hooks_arr.len();
            hooks_arr.retain(|hook| {
                let cmd = hook.get("command").and_then(|c| c.as_str()).unwrap_or("");
                !command_has_onetone_id(cmd)
            });
            removed += before.saturating_sub(hooks_arr.len());
            if !hooks_arr.is_empty() {
                new_matchers.push(matcher);
            }
        }
        if new_matchers.is_empty() {
            hooks.remove(&key);
        } else {
            *hooks.get_mut(&key).unwrap() = Value::Array(new_matchers);
        }
    }
    removed
}

pub fn probe_node_available() -> bool {
    struct Cache {
        at: Instant,
        ok: bool,
    }
    static CACHE: std::sync::OnceLock<Mutex<Option<Cache>>> = std::sync::OnceLock::new();
    let lock = CACHE.get_or_init(|| Mutex::new(None));
    {
        let g = lock.lock().unwrap();
        if let Some(c) = g.as_ref() {
            if c.at.elapsed() < Duration::from_secs(60) {
                return c.ok;
            }
        }
    }
    let mut cmd = Command::new("node");
    cmd.arg("-v")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        // ponytail: avoid black console flash when Soft Pad polls hook status on app switch.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
    if let Ok(mut g) = lock.lock() {
        *g = Some(Cache {
            at: Instant::now(),
            ok,
        });
    }
    ok
}

fn now_stamp() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let hours = day_secs / 3600;
    let mins = (day_secs % 3600) / 60;
    let (y, m, d) = civil_from_days(days as i64);
    format!("{y:04}{m:02}{d:02}-{hours:02}{mins:02}")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    // Algorithm from civil_from_days (Howard Hinnant)
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn backup_path_for(settings: &Path) -> PathBuf {
    let parent = settings.parent().unwrap_or_else(|| Path::new("."));
    let stamp = now_stamp();
    let mut candidate =
        parent.join(format!("settings.json.onetone-backup-{stamp}"));
    let mut n = 0u32;
    while candidate.exists() {
        n += 1;
        candidate = parent.join(format!("settings.json.onetone-backup-{stamp}-{n}"));
    }
    candidate
}

pub fn find_latest_backup(settings: &Path) -> Option<PathBuf> {
    let parent = settings.parent()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    let rd = fs::read_dir(parent).ok()?;
    for ent in rd.flatten() {
        let name = ent.file_name().to_string_lossy().to_string();
        if !name.starts_with("settings.json.onetone-backup-") {
            continue;
        }
        let meta = ent.metadata().ok()?;
        let modified = meta.modified().ok()?;
        if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            best = Some((modified, ent.path()));
        }
    }
    best.map(|(_, p)| p)
}

fn atomic_write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let pretty = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.onetone-tmp");
    fs::write(&tmp, pretty.as_bytes()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })?;
    Ok(())
}

fn read_settings_value(path: &Path) -> Result<Option<Value>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(Some(json!({})));
    }
    serde_json::from_str(&raw).map(Some).map_err(|e| format!("invalid_json:{e}"))
}

fn human_diff(stats: &MergeStats, onetone_before: bool) -> String {
    let mut lines = Vec::new();
    if !stats.added.is_empty() {
        lines.push(format!("将新增事件：{}", stats.added.join(", ")));
    }
    if !stats.refreshed.is_empty() {
        lines.push(format!("将刷新 probe 路径：{}", stats.refreshed.join(", ")));
    }
    if !stats.skipped.is_empty() {
        lines.push(format!("已存在将跳过：{}", stats.skipped.join(", ")));
    }
    if lines.is_empty() {
        if onetone_before {
            lines.push("无变更（OneTone hooks 已是最新）。".into());
        } else {
            lines.push("将添加全部 OneTone Hook 事件。".into());
        }
    }
    lines.push("不会删除或覆盖你已有的非 OneTone Hooks。".into());
    lines.join("\n")
}

fn compute_install_phase(
    onetone: bool,
    parse_ok: bool,
    settings_exists: bool,
    probe_exists: bool,
    configured_probe_exists: bool,
    node_ok: bool,
    last_age: Option<u64>,
) -> String {
    if settings_exists && !parse_ok {
        return "error".into();
    }
    if !probe_exists {
        return "error".into();
    }
    if !node_ok {
        return "error".into();
    }
    if onetone && !configured_probe_exists {
        return "error".into();
    }
    if !onetone {
        return "not_installed".into();
    }
    match last_age {
        None => "waiting".into(),
        Some(a) if a <= PHASE_CONNECTED_MS => "connected".into(),
        Some(a) if a <= PHASE_STALE_MS => "stale".into(),
        Some(_) => "offline".into(),
    }
}

fn build_issues(
    settings_exists: bool,
    parse_ok: bool,
    probe_exists: bool,
    onetone: bool,
    configured_probe_exists: bool,
    configured_path: &str,
    node_ok: bool,
    phase: &str,
) -> Vec<ClaudeHookIssue> {
    let mut out = Vec::new();
    if settings_exists && !parse_ok {
        out.push(ClaudeHookIssue {
            severity: "error".into(),
            title: "配置异常".into(),
            reason: "settings.json 无法解析为 JSON。".into(),
            action: "请先修复或备份后删除坏文件，再确认安装。".into(),
        });
    }
    if !probe_exists {
        out.push(ClaudeHookIssue {
            severity: "error".into(),
            title: "Probe 脚本不存在".into(),
            reason: "仓库内 scripts/claude-hook-probe.js 未找到。".into(),
            action: "确认 OneTone 安装完整后再安装 Hooks。".into(),
        });
    }
    if onetone && !configured_probe_exists {
        out.push(ClaudeHookIssue {
            severity: "error".into(),
            title: "Probe 路径失效".into(),
            reason: format!(
                "settings 中的 probe 路径不存在：{}",
                if configured_path.is_empty() {
                    "（无法解析）"
                } else {
                    configured_path
                }
            ),
            action: "点击「确认安装」重新安装以刷新绝对路径。".into(),
        });
    }
    if !node_ok {
        out.push(ClaudeHookIssue {
            severity: "error".into(),
            title: "Node 不可用".into(),
            reason: "未检测到 node（PATH 不通或未安装）。配置写了也不会有事件。".into(),
            action: "安装 Node.js 并确保终端可运行 node -v。".into(),
        });
    }
    if phase == "waiting" {
        out.push(ClaudeHookIssue {
            severity: "warn".into(),
            title: "等待事件".into(),
            reason: "Hook 已写入，但还没有收到 Claude 事件。".into(),
            action: "请打开 Claude Code 发一句 prompt。".into(),
        });
    }
    if phase == "not_installed" && out.is_empty() {
        out.push(ClaudeHookIssue {
            severity: "info".into(),
            title: "未安装".into(),
            reason: "没有找到 OneTone hook 配置。".into(),
            action: "点击「预览安装」查看将写入的内容，再「确认安装」。".into(),
        });
    }
    out
}

pub struct StatusInputs {
    pub soft_pad_visible: bool,
    pub cli_pref_enabled: bool,
    pub cli_can_inject: bool,
    pub last_event: String,
    pub last_age_ms: Option<u64>,
}

pub fn setup_status(inputs: StatusInputs) -> ClaudeHookSetupStatus {
    let settings_path = settings_json_path();
    let settings_exists = settings_path.is_file();
    let read = read_settings_value(&settings_path);
    let (settings_parse_ok, root_opt) = match read {
        Ok(v) => (true, v),
        Err(_) => (false, None),
    };
    let root = root_opt.unwrap_or_else(|| json!({}));
    let probe_path = probe_script_path();
    let probe_exists = probe_path.is_file();
    let probe_abs = if probe_exists {
        probe_path.to_string_lossy().replace('\\', "/")
    } else {
        String::new()
    };
    let onetone = settings_parse_ok && onetone_configured(&root);
    let configured_probe_path = if settings_parse_ok {
        first_configured_probe_path(&root).unwrap_or_default()
    } else {
        String::new()
    };
    let configured_probe_exists = if configured_probe_path.is_empty() {
        false
    } else {
        PathBuf::from(&configured_probe_path).is_file()
            || PathBuf::from(configured_probe_path.replace('\\', "/")).is_file()
    };
    let has_user = settings_parse_ok && count_non_onetone_hooks(&root) > 0;
    let node_ok = probe_node_available();

    let mut preview_root = if settings_exists && settings_parse_ok {
        root.clone()
    } else if !settings_exists {
        json!({})
    } else {
        json!({})
    };
    let stats = if settings_parse_ok || !settings_exists {
        if probe_exists {
            merge_onetone_hooks(&mut preview_root, &probe_abs)
        } else {
            MergeStats::default()
        }
    } else {
        MergeStats::default()
    };
    let draft = build_draft_json(&probe_abs);
    let merged_preview = if settings_parse_ok || !settings_exists {
        serde_json::to_string_pretty(&preview_root).unwrap_or_else(|_| "{}".into())
    } else {
        String::new()
    };
    let diff = human_diff(&stats, onetone);
    let backup = find_latest_backup(&settings_path)
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let phase = compute_install_phase(
        onetone,
        settings_parse_ok,
        settings_exists,
        probe_exists,
        if onetone {
            configured_probe_exists
        } else {
            true
        },
        node_ok,
        inputs.last_age_ms,
    );
    let can_install = (settings_parse_ok || !settings_exists) && probe_exists && node_ok;
    let issues = build_issues(
        settings_exists,
        settings_parse_ok,
        probe_exists,
        onetone,
        if onetone {
            configured_probe_exists
        } else {
            true
        },
        &configured_probe_path,
        node_ok,
        &phase,
    );
    let mut issues = issues;
    if settings_parse_ok {
        for code in crate::agent_usage::otel_settings_conflicts(&root) {
            let (title, reason, action) = match code {
                "otel_endpoint_conflict" => (
                    "用量 OTel 端点冲突",
                    "settings.env 的 OTEL 指标端点不是 OneTone 的 127.0.0.1:8796/v1/metrics。",
                    "Lifecycle Hook 与 Usage OTel 分开：改端点或保留现有导出器，不要静默覆盖。",
                ),
                "otel_exporter_conflict" => (
                    "用量 OTel 导出器冲突",
                    "settings.env 已配置非 otlp 的 OTEL_METRICS_EXPORTER。",
                    "保留你的导出器，或手动改为 otlp 并指向 OneTone loopback。",
                ),
                _ => (
                    "用量 OTel 配置冲突",
                    "检测到与 OneTone Usage 通道不兼容的 OTel 设置。",
                    "请手动核对 ~/.claude/settings.json 的 env。",
                ),
            };
            issues.push(ClaudeHookIssue {
                severity: "warn".into(),
                title: title.into(),
                reason: reason.into(),
                action: action.into(),
            });
        }
        match statusline_ownership(&root) {
            "foreign" => issues.push(ClaudeHookIssue {
                severity: "warn".into(),
                title: "statusLine 已被占用".into(),
                reason: "Claude settings.statusLine 已有第三方或自定义命令；OneTone 不会覆盖。".into(),
                action: "手动把 statusLine.command 改为 OneTone relay，或先移除现有 statusLine。".into(),
            }),
            "malformed" => issues.push(ClaudeHookIssue {
                severity: "warn".into(),
                title: "statusLine 结构异常".into(),
                reason: "settings.statusLine 不是可识别的 command 对象。".into(),
                action: "请手动修正或删除 statusLine 后再安装。".into(),
            }),
            _ => {}
        }
    }

    let panel_phase = match phase.as_str() {
        "connected" => "connected",
        "waiting" | "stale" | "offline" => "configured_waiting",
        "error" if onetone => "configured_waiting",
        _ => "not_configured",
    };

    ClaudeHookSetupStatus {
        settings_path: settings_path.display().to_string(),
        settings_exists,
        settings_parse_ok,
        probe_exists,
        probe_script_path: probe_abs.clone(),
        configured_probe_path: configured_probe_path.replace('\\', "/"),
        configured_probe_exists,
        onetone_configured: onetone,
        has_user_hooks: has_user,
        draft_json: draft.clone(),
        hooks_draft_json: draft,
        merged_preview,
        diff,
        backup_path: backup,
        node_available: node_ok,
        install_phase: phase,
        soft_pad_visible: inputs.soft_pad_visible,
        cli_pref_enabled: inputs.cli_pref_enabled,
        cli_can_inject: inputs.cli_can_inject,
        preview_copy: PREVIEW_COPY.into(),
        uninstall_preview: UNINSTALL_PREVIEW.into(),
        can_install,
        trust_hint: "需你确认后才会写入 ~/.claude/settings.json，并可一键撤回 OneTone hooks。"
            .into(),
        issues,
        last_event: inputs.last_event,
        last_age_ms: inputs.last_age_ms.unwrap_or(0),
        panel_phase: panel_phase.into(),
        settings_file_exists: settings_exists,
        settings_file_path: settings_path.display().to_string(),
        probe_configured: onetone,
    }
}

pub fn install_confirm() -> ClaudeHookWriteResult {
    let settings_path = settings_json_path();
    let probe = probe_script_path();
    if !probe.is_file() {
        return ClaudeHookWriteResult {
            ok: false,
            reason: "probe_missing".into(),
            backup_path: String::new(),
            settings_path: settings_path.display().to_string(),
            onetone_configured: false,
            added_events: vec![],
            refreshed_events: vec![],
            skipped_events: vec![],
            removed_count: 0,
        };
    }
    if !probe_node_available() {
        return ClaudeHookWriteResult {
            ok: false,
            reason: "node_unavailable".into(),
            backup_path: String::new(),
            settings_path: settings_path.display().to_string(),
            onetone_configured: false,
            added_events: vec![],
            refreshed_events: vec![],
            skipped_events: vec![],
            removed_count: 0,
        };
    }
    let probe_abs = probe.to_string_lossy().replace('\\', "/");
    let exists = settings_path.is_file();
    let mut root = match read_settings_value(&settings_path) {
        Ok(None) => json!({}),
        Ok(Some(v)) => v,
        Err(e) => {
            return ClaudeHookWriteResult {
                ok: false,
                reason: e,
                backup_path: String::new(),
                settings_path: settings_path.display().to_string(),
                onetone_configured: false,
                added_events: vec![],
                refreshed_events: vec![],
                skipped_events: vec![],
                removed_count: 0,
            };
        }
    };

    let mut backup_path = String::new();
    if exists {
        let bp = backup_path_for(&settings_path);
        if let Err(e) = fs::copy(&settings_path, &bp) {
            return ClaudeHookWriteResult {
                ok: false,
                reason: format!("backup_failed:{e}"),
                backup_path: String::new(),
                settings_path: settings_path.display().to_string(),
                onetone_configured: onetone_configured(&root),
                added_events: vec![],
                refreshed_events: vec![],
                skipped_events: vec![],
                removed_count: 0,
            };
        }
        backup_path = bp.display().to_string();
    }

    let stats = merge_onetone_hooks(&mut root, &probe_abs);
    let otel_added = match crate::agent_usage::merge_onetone_otel_env(&mut root) {
        Ok(n) => n,
        Err(code) => {
            // Hooks still install; Usage OTel stays user-owned on conflict.
            let _ = code;
            0
        }
    };
    let statusline_probe = statusline_probe_script_path();
    let statusline_action = if statusline_probe.is_file() {
        let sl_abs = statusline_probe.to_string_lossy().replace('\\', "/");
        merge_onetone_statusline(&mut root, &sl_abs).unwrap_or("unchanged")
    } else {
        "unchanged"
    };
    if let Err(e) = atomic_write_json(&settings_path, &root) {
        return ClaudeHookWriteResult {
            ok: false,
            reason: format!("write_failed:{e}"),
            backup_path,
            settings_path: settings_path.display().to_string(),
            onetone_configured: false,
            added_events: stats.added,
            refreshed_events: stats.refreshed,
            skipped_events: stats.skipped,
            removed_count: 0,
        };
    }
    if otel_added > 0
        || crate::agent_usage::otel_settings_conflicts(&root).is_empty()
            && root
                .get("env")
                .and_then(|e| e.get("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"))
                .and_then(|v| v.as_str())
                .is_some_and(|ep| {
                    let ep = ep.trim().trim_end_matches('/');
                    ep == "http://127.0.0.1:8796/v1/metrics"
                        || ep == "http://localhost:8796/v1/metrics"
                })
    {
        crate::agent_usage::mark_claude_usage_waiting("已配置 OTel，等待 Claude 上报用量");
    }

    ClaudeHookWriteResult {
        ok: true,
        reason: if stats.added.is_empty()
            && stats.refreshed.is_empty()
            && otel_added == 0
            && matches!(statusline_action, "unchanged" | "skipped_foreign" | "skipped_malformed")
        {
            if statusline_action == "skipped_foreign" {
                "statusline_foreign".into()
            } else if statusline_action == "skipped_malformed" {
                "statusline_malformed".into()
            } else {
                "already_up_to_date".into()
            }
        } else if !stats.refreshed.is_empty()
            && stats.added.is_empty()
            && otel_added == 0
            && matches!(statusline_action, "unchanged" | "refreshed")
        {
            "path_refreshed".into()
        } else if otel_added > 0 && stats.added.is_empty() && stats.refreshed.is_empty() {
            "otel_env_merged".into()
        } else if statusline_action == "added"
            && stats.added.is_empty()
            && stats.refreshed.is_empty()
            && otel_added == 0
        {
            "statusline_merged".into()
        } else {
            "installed".into()
        },
        backup_path,
        settings_path: settings_path.display().to_string(),
        onetone_configured: true,
        added_events: stats.added,
        refreshed_events: stats.refreshed,
        skipped_events: stats.skipped,
        removed_count: 0,
    }
}

pub fn uninstall_onetone() -> ClaudeHookWriteResult {
    let settings_path = settings_json_path();
    if !settings_path.is_file() {
        return ClaudeHookWriteResult {
            ok: false,
            reason: "settings_missing".into(),
            backup_path: String::new(),
            settings_path: settings_path.display().to_string(),
            onetone_configured: false,
            added_events: vec![],
            refreshed_events: vec![],
            skipped_events: vec![],
            removed_count: 0,
        };
    }
    let mut root = match read_settings_value(&settings_path) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return ClaudeHookWriteResult {
                ok: false,
                reason: "settings_missing".into(),
                backup_path: String::new(),
                settings_path: settings_path.display().to_string(),
                onetone_configured: false,
                added_events: vec![],
                refreshed_events: vec![],
                skipped_events: vec![],
                removed_count: 0,
            };
        }
        Err(e) => {
            return ClaudeHookWriteResult {
                ok: false,
                reason: e,
                backup_path: String::new(),
                settings_path: settings_path.display().to_string(),
                onetone_configured: false,
                added_events: vec![],
                refreshed_events: vec![],
                skipped_events: vec![],
                removed_count: 0,
            };
        }
    };

    let bp = backup_path_for(&settings_path);
    if let Err(e) = fs::copy(&settings_path, &bp) {
        return ClaudeHookWriteResult {
            ok: false,
            reason: format!("backup_failed:{e}"),
            backup_path: String::new(),
            settings_path: settings_path.display().to_string(),
            onetone_configured: onetone_configured(&root),
            added_events: vec![],
            refreshed_events: vec![],
            skipped_events: vec![],
            removed_count: 0,
        };
    }
    let backup_path = bp.display().to_string();
    let removed = uninstall_onetone_hooks(&mut root) + uninstall_onetone_statusline(&mut root);
    if let Err(e) = atomic_write_json(&settings_path, &root) {
        return ClaudeHookWriteResult {
            ok: false,
            reason: format!("write_failed:{e}"),
            backup_path,
            settings_path: settings_path.display().to_string(),
            onetone_configured: true,
            added_events: vec![],
            refreshed_events: vec![],
            skipped_events: vec![],
            removed_count: removed,
        };
    }

    ClaudeHookWriteResult {
        ok: true,
        reason: if removed == 0 {
            "nothing_to_remove".into()
        } else {
            "uninstalled".into()
        },
        backup_path,
        settings_path: settings_path.display().to_string(),
        onetone_configured: onetone_configured(&root),
        added_events: vec![],
        refreshed_events: vec![],
        skipped_events: vec![],
        removed_count: removed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_settings<F: FnOnce(&Path)>(f: F) {
        let _g = TEST_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "onetone-claude-hook-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let settings = dir.join("settings.json");
        set_settings_path_override_for_test(Some(settings.clone()));
        f(&settings);
        set_settings_path_override_for_test(None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn permission_request_timeout_is_60() {
        assert_eq!(timeout_for_event("PermissionRequest"), 60);
        assert_eq!(timeout_for_event("SessionStart"), 5);
        let draft = build_draft_hooks_value("C:/x/scripts/claude-hook-probe.js");
        let pr = &draft["hooks"]["PermissionRequest"][0]["hooks"][0]["timeout"];
        assert_eq!(pr, 60);
        let ss = &draft["hooks"]["SessionStart"][0]["hooks"][0]["timeout"];
        assert_eq!(ss, 5);
        let cmd = draft["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(command_has_onetone_id(cmd));
    }

    #[test]
    fn merge_keeps_user_hooks_and_is_idempotent() {
        let mut root = json!({
            "hooks": {
                "UserPromptSubmit": [{
                    "hooks": [{ "type": "command", "command": "echo user" }]
                }]
            },
            "theme": "dark"
        });
        let s1 = merge_onetone_hooks(&mut root, "C:/repo/scripts/claude-hook-probe.js");
        assert!(s1.added.contains(&"UserPromptSubmit".into()));
        assert_eq!(root["theme"], "dark");
        let user_still = root["hooks"]["UserPromptSubmit"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| {
                m["hooks"].as_array().unwrap().iter().any(|h| {
                    h["command"].as_str() == Some("echo user")
                })
            });
        assert!(user_still);
        let s2 = merge_onetone_hooks(&mut root, "C:/repo/scripts/claude-hook-probe.js");
        assert!(s2.added.is_empty());
        assert_eq!(s2.skipped.len(), install_events().len());
        // Count onetone commands for UserPromptSubmit == 1
        let ot = root["hooks"]["UserPromptSubmit"]
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|m| m["hooks"].as_array().unwrap())
            .filter(|h| command_has_onetone_id(h["command"].as_str().unwrap_or("")))
            .count();
        assert_eq!(ot, 1);
    }

    #[test]
    fn merge_refreshes_path_when_id_exists() {
        let mut root = json!({
            "hooks": {
                "SessionStart": [{
                    "hooks": [{
                        "type": "command",
                        "command": "node \"C:/old/scripts/claude-hook-probe.js\" --onetone-hook-id claude-activity-v1 --source onetone",
                        "timeout": 5
                    }]
                }]
            }
        });
        let s = merge_onetone_hooks(&mut root, "C:/new/scripts/claude-hook-probe.js");
        assert!(s.refreshed.contains(&"SessionStart".into()));
        let cmd = root["hooks"]["SessionStart"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(cmd.contains("C:/new/scripts/claude-hook-probe.js"));
    }

    #[test]
    fn uninstall_only_removes_onetone() {
        let mut root = json!({
            "hooks": {
                "Stop": [
                    { "hooks": [{ "type": "command", "command": "echo mine" }] },
                    { "hooks": [{
                        "type": "command",
                        "command": "node \"C:/x/scripts/claude-hook-probe.js\" --onetone-hook-id claude-activity-v1 --source onetone"
                    }] }
                ]
            }
        });
        let n = uninstall_onetone_hooks(&mut root);
        assert_eq!(n, 1);
        assert_eq!(root["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert_eq!(
            root["hooks"]["Stop"][0]["hooks"][0]["command"],
            "echo mine"
        );
    }

    #[test]
    fn install_creates_missing_settings_and_rejects_bad_json() {
        with_temp_settings(|settings| {
            // Missing → create
            let r = install_confirm();
            // May fail on node/probe in CI — probe should exist in this repo.
            if probe_script_path().is_file() && probe_node_available() {
                assert!(r.ok, "{}", r.reason);
                assert!(settings.is_file());
                let v: Value = serde_json::from_str(&fs::read_to_string(settings).unwrap()).unwrap();
                assert!(onetone_configured(&v));
                // Second install idempotent
                let r2 = install_confirm();
                assert!(r2.ok);
                assert!(r2.added_events.is_empty());

                // Bad JSON reject
                fs::write(settings, "{not-json").unwrap();
                let bad = install_confirm();
                assert!(!bad.ok);
                assert!(bad.reason.contains("invalid_json"));
                // File still bad (no half-written success)
                let raw = fs::read_to_string(settings).unwrap();
                assert_eq!(raw, "{not-json");
            }
        });
    }

    #[test]
    fn phase_waiting_when_never_seen() {
        let p = compute_install_phase(true, true, true, true, true, true, None);
        assert_eq!(p, "waiting");
        let p2 = compute_install_phase(true, true, true, true, true, true, Some(10_000));
        assert_eq!(p2, "connected");
        let p3 = compute_install_phase(true, true, true, true, true, true, Some(60_000));
        assert_eq!(p3, "stale");
        let p4 = compute_install_phase(true, true, true, true, true, true, Some(400_000));
        assert_eq!(p4, "offline");
        let p5 = compute_install_phase(false, true, false, true, true, true, None);
        assert_eq!(p5, "not_installed");
        let p6 = compute_install_phase(true, true, true, true, false, true, Some(1000));
        assert_eq!(p6, "error");
    }

    #[test]
    fn extract_probe_path_quoted() {
        let cmd = r#"node "C:/Users/a/scripts/claude-hook-probe.js" --onetone-hook-id claude-activity-v1"#;
        let p = extract_probe_path_from_command(cmd).unwrap();
        assert!(p.contains("claude-hook-probe.js"));
    }

    #[test]
    fn statusline_missing_install_and_foreign_untouched() {
        let mut root = json!({ "theme": "dark" });
        assert_eq!(statusline_ownership(&root), "missing");
        assert_eq!(
            merge_onetone_statusline(&mut root, "C:/repo/scripts/claude-statusline-probe.js").unwrap(),
            "added"
        );
        assert_eq!(statusline_ownership(&root), "onetone_owned");
        let cmd = root["statusLine"]["command"].as_str().unwrap();
        assert!(command_has_onetone_statusline_id(cmd));
        assert!(cmd.contains(STATUSLINE_MARKER));

        let foreign = json!({
            "statusLine": { "type": "command", "command": "npx claude-code-usage-bar" }
        });
        let before = serde_json::to_string(&foreign).unwrap();
        let mut foreign_mut = foreign.clone();
        assert_eq!(statusline_ownership(&foreign_mut), "foreign");
        assert_eq!(
            merge_onetone_statusline(&mut foreign_mut, "C:/x/claude-statusline-probe.js").unwrap(),
            "skipped_foreign"
        );
        assert_eq!(serde_json::to_string(&foreign_mut).unwrap(), before);
        assert_eq!(uninstall_onetone_statusline(&mut foreign_mut), 0);
        assert_eq!(serde_json::to_string(&foreign_mut).unwrap(), before);

        assert_eq!(uninstall_onetone_statusline(&mut root), 1);
        assert!(root.get("statusLine").is_none());
    }

    #[test]
    fn statusline_filename_alone_is_not_owned() {
        let root = json!({
            "statusLine": {
                "type": "command",
                "command": "node \"C:/x/claude-statusline-probe.js\""
            }
        });
        assert_eq!(statusline_ownership(&root), "foreign");
    }
}
