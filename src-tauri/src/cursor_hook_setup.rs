//! Cursor Hook setup — detect user/project scopes, absolute probe draft, merge preview.
//! Does not guess workspace from foreground cwd.

use crate::connector_health::{self, CapabilityKind, HealthState, ValueState};
use crate::soft_pad_runtime::AgentKind;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub const CURSOR_HOOK_SENTINEL: &str = "--onetone-hook-id cursor-observer-v1";
pub const PROBE_RESOURCE: &str = "scripts/cursor-hook-probe.js";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorHookScopeStatus {
    pub scope: String,
    pub path: String,
    pub found: bool,
    pub has_sentinel: bool,
    pub probe_path: String,
    pub path_matches: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorHookSetupStatus {
    pub node_ok: bool,
    pub node_reason: String,
    pub probe_abs: String,
    pub probe_exists: bool,
    pub configured_scopes: Vec<String>,
    pub effective_scope: String,
    pub conflicts: Vec<String>,
    pub scopes: Vec<CursorHookScopeStatus>,
    pub merge_preview: String,
    pub token_configured: bool,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn user_hooks_path() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".cursor")
        .join("hooks.json")
}

fn project_hooks_path(workspace: &Path) -> PathBuf {
    workspace.join(".cursor").join("hooks.json")
}

pub fn detect_node() -> Result<PathBuf, String> {
    let out = Command::new("node")
        .arg("-v")
        .output()
        .map_err(|_| "runtime_not_found".to_string())?;
    if !out.status.success() {
        return Err("runtime_not_found".into());
    }
    Ok(PathBuf::from("node"))
}

pub fn probe_absolute_path() -> PathBuf {
    // Prefer packaged resource beside the executable; fall back to repo scripts/.
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

fn command_has_sentinel(cmd: &str) -> bool {
    cmd.contains(CURSOR_HOOK_SENTINEL)
}

fn extract_probe_from_command(cmd: &str) -> String {
    // Best-effort: last quoted path ending with cursor-hook-probe.js
    let needle = "cursor-hook-probe.js";
    if let Some(idx) = cmd.find(needle) {
        let before = &cmd[..idx];
        if let Some(q) = before.rfind('"') {
            return format!("{}{}", &before[q + 1..], needle);
        }
    }
    String::new()
}

fn inspect_hooks_file(scope: &str, path: &Path, expected_probe: &Path) -> CursorHookScopeStatus {
    let mut status = CursorHookScopeStatus {
        scope: scope.into(),
        path: path.display().to_string(),
        found: path.is_file(),
        has_sentinel: false,
        probe_path: String::new(),
        path_matches: false,
    };
    if !status.found {
        return status;
    }
    let Ok(raw) = fs::read_to_string(path) else {
        return status;
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return status;
    };
    let Some(hooks) = value.get("hooks").and_then(|v| v.as_object()) else {
        return status;
    };
    for (_event, entries) in hooks {
        let Some(arr) = entries.as_array() else {
            continue;
        };
        for entry in arr {
            let cmd = entry
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if command_has_sentinel(cmd) {
                status.has_sentinel = true;
                status.probe_path = extract_probe_from_command(cmd);
                let expected = expected_probe.to_string_lossy().replace('/', "\\");
                let got = status.probe_path.replace('/', "\\");
                status.path_matches = !got.is_empty()
                    && (got.eq_ignore_ascii_case(&expected)
                        || Path::new(&got) == expected_probe);
            }
        }
    }
    status
}

pub fn build_merge_preview(probe_abs: &Path) -> String {
    let cmd = format!(
        "node \"{}\" {}",
        probe_abs.display(),
        CURSOR_HOOK_SENTINEL
    );
    let draft = json!({
        "version": 1,
        "hooks": {
            "beforeSubmitPrompt": [{ "command": cmd }],
            "afterAgentResponse": [{ "command": cmd }],
            "stop": [{ "command": cmd }],
            "subagentStart": [{ "command": cmd }]
        }
    });
    serde_json::to_string_pretty(&draft).unwrap_or_default()
}

/// `workspace` must be user-selected or Soft Pad scene-bound — never foreground cwd guess.
pub fn setup_status(workspace: Option<&Path>) -> CursorHookSetupStatus {
    let probe = probe_absolute_path();
    let (node_ok, node_reason) = match detect_node() {
        Ok(_) => (true, String::new()),
        Err(code) => (false, code),
    };
    let mut scopes = vec![inspect_hooks_file("user", &user_hooks_path(), &probe)];
    if let Some(ws) = workspace {
        scopes.push(inspect_hooks_file("project", &project_hooks_path(ws), &probe));
    }
    let configured: Vec<String> = scopes
        .iter()
        .filter(|s| s.has_sentinel)
        .map(|s| s.scope.clone())
        .collect();
    let mut conflicts = Vec::new();
    if configured.len() > 1 {
        conflicts.push("user_and_project_both_configured".into());
    }
    for s in &scopes {
        if s.has_sentinel && !s.path_matches {
            conflicts.push(format!("{}_probe_path_stale", s.scope));
        }
    }
    let effective = if configured.contains(&"project".to_string()) {
        "project".into()
    } else if configured.contains(&"user".to_string()) {
        "user".into()
    } else {
        String::new()
    };

    let status = CursorHookSetupStatus {
        node_ok,
        node_reason,
        probe_abs: probe.display().to_string(),
        probe_exists: probe.is_file(),
        configured_scopes: configured.clone(),
        effective_scope: effective.clone(),
        conflicts: conflicts.clone(),
        scopes,
        merge_preview: build_merge_preview(&probe),
        token_configured: crate::integration_token::token_configured(),
    };

    // Reflect lifecycle observation channel only — not AttentionState.
    let has_config = !status.configured_scopes.is_empty();
    let state = if !status.node_ok {
        HealthState::Error
    } else if !has_config {
        HealthState::NotConfigured
    } else {
        HealthState::ConfiguredWaiting
    };
    let mut row = connector_health::CapabilityHealth::new(AgentKind::Cursor, CapabilityKind::Lifecycle);
    row.state = state.as_str().into();
    row.value_state = ValueState::Absent.as_str().into();
    row.value_present = false;
    row.reason_code = if !status.node_ok {
        "runtime_not_found".into()
    } else if !has_config {
        "config_missing".into()
    } else if !conflicts.is_empty() {
        "config_conflict".into()
    } else {
        "waiting_first_event".into()
    };
    row.short_reason = if !status.node_ok {
        "未找到 Node 运行时".into()
    } else if !has_config {
        "未配置 Cursor Hook".into()
    } else {
        "已配置，等待首次 Hook 事件".into()
    };
    row.source = "cursor_hook".into();
    row.configured_scopes = status.configured_scopes.clone();
    row.effective_scope = status.effective_scope.clone();
    row.conflicts = status.conflicts.clone();
    row.last_attempt_at = now_ms();
    connector_health::set(row);

    // Usage remains unsupported for Cursor.
    connector_health::upsert(
        AgentKind::Cursor,
        CapabilityKind::Usage,
        HealthState::Unsupported,
        ValueState::Unsupported,
        "unsupported_by_provider",
        "Cursor 暂无稳定官方用量接口",
        "cursor",
        now_ms(),
        false,
    );

    status
}

pub fn merge_onetone_hooks(existing: &str, probe_abs: &Path) -> Result<String, String> {
    let mut root: Value = if existing.trim().is_empty() {
        json!({ "version": 1, "hooks": {} })
    } else {
        serde_json::from_str(existing).map_err(|_| "invalid_json".to_string())?
    };
    if !root.is_object() {
        return Err("invalid_json".into());
    }
    let cmd = format!(
        "node \"{}\" {}",
        probe_abs.display(),
        CURSOR_HOOK_SENTINEL
    );
    let hooks = root
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    let obj = hooks
        .as_object_mut()
        .ok_or_else(|| "invalid_json".to_string())?;
    for event in [
        "beforeSubmitPrompt",
        "afterAgentResponse",
        "stop",
        "subagentStart",
    ] {
        let arr = obj.entry(event).or_insert_with(|| json!([]));
        let list = arr
            .as_array_mut()
            .ok_or_else(|| "invalid_json".to_string())?;
        list.retain(|entry| {
            !entry
                .get("command")
                .and_then(|v| v.as_str())
                .map(command_has_sentinel)
                .unwrap_or(false)
        });
        list.push(json!({ "command": cmd }));
    }
    serde_json::to_string_pretty(&root).map_err(|e| e.to_string())
}

/// Write only after explicit user confirm. Atomic write + backup.
pub fn install_to_path(target: &Path, probe_abs: &Path) -> Result<(), String> {
    detect_node()?;
    let parent = target
        .parent()
        .ok_or_else(|| "invalid_path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("mkdir:{e}"))?;
    let existing = fs::read_to_string(target).unwrap_or_default();
    if !existing.trim().is_empty() {
        serde_json::from_str::<Value>(&existing).map_err(|_| "invalid_json".to_string())?;
        let bak = target.with_extension("json.bak");
        fs::write(&bak, &existing).map_err(|e| format!("backup:{e}"))?;
    }
    let merged = merge_onetone_hooks(&existing, probe_abs)?;
    let tmp = target.with_extension("json.tmp");
    fs::write(&tmp, &merged).map_err(|e| format!("write:{e}"))?;
    #[cfg(windows)]
    {
        let _ = fs::remove_file(target);
    }
    fs::rename(&tmp, target).map_err(|e| format!("rename:{e}"))?;
    Ok(())
}

pub fn uninstall_preview(existing: &str) -> Result<(String, usize), String> {
    if existing.trim().is_empty() {
        return Ok((String::new(), 0));
    }
    let mut root: Value =
        serde_json::from_str(existing).map_err(|_| "invalid_json".to_string())?;
    let Some(hooks) = root.get_mut("hooks").and_then(|v| v.as_object_mut()) else {
        return Ok((existing.to_string(), 0));
    };
    let mut removed = 0usize;
    for (_k, entries) in hooks.iter_mut() {
        if let Some(arr) = entries.as_array_mut() {
            let before = arr.len();
            arr.retain(|entry| {
                !entry
                    .get("command")
                    .and_then(|v| v.as_str())
                    .map(command_has_sentinel)
                    .unwrap_or(false)
            });
            removed += before.saturating_sub(arr.len());
        }
    }
    Ok((
        serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?,
        removed,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_keeps_third_party_and_adds_sentinel() {
        let existing = r#"{
          "version": 1,
          "hooks": {
            "stop": [{ "command": "node other.js" }]
          }
        }"#;
        let probe = PathBuf::from(r"C:\OneTone\scripts\cursor-hook-probe.js");
        let merged = merge_onetone_hooks(existing, &probe).unwrap();
        assert!(merged.contains("other.js"));
        assert!(merged.contains(CURSOR_HOOK_SENTINEL));
        assert!(merged.contains("cursor-hook-probe.js"));
    }

    #[test]
    fn uninstall_removes_only_sentinel() {
        let existing = r#"{
          "version": 1,
          "hooks": {
            "stop": [
              { "command": "node other.js" },
              { "command": "node \"C:\\x\\cursor-hook-probe.js\" --onetone-hook-id cursor-observer-v1" }
            ]
          }
        }"#;
        let (out, n) = uninstall_preview(existing).unwrap();
        assert_eq!(n, 1);
        assert!(out.contains("other.js"));
        assert!(!out.contains(CURSOR_HOOK_SENTINEL));
    }

    #[test]
    fn bad_json_rejected() {
        assert!(merge_onetone_hooks("{nope", Path::new("x.js")).is_err());
    }

    #[test]
    fn probe_resource_exists_in_repo_and_bundle_map() {
        let probe = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(PROBE_RESOURCE);
        assert!(
            probe.is_file(),
            "missing repo probe at {}",
            probe.display()
        );
        let conf = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json"),
        )
        .expect("tauri.conf.json");
        assert!(
            conf.contains("scripts/cursor-hook-probe.js"),
            "packaged resource mapping missing for cursor-hook-probe.js"
        );
    }
}
