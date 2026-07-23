//! P1: Codex status-lights bridge (Hook → AG00) — independent of key routes.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::app_chat_workflow::CODEX_APP_TARGET_ID;
use crate::codex_micro_overlay;
use crate::codex_numpad_layer;
use crate::config;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexStatusLightsSetResult {
    pub ok: bool,
    pub enabled: bool,
    pub loopback_enabled: bool,
    pub loopback_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHookSetupStatus {
    /// not_configured | configured_waiting | connected
    pub panel_phase: String,
    pub hooks_file_exists: bool,
    pub hooks_file_path: String,
    pub probe_configured: bool,
    pub probe_script_path: String,
    pub hooks_draft_json: String,
    /// Mapped Micro light status: idle | running | needs_input | done | …
    pub light_status: String,
    pub last_event: String,
    pub last_source: String,
    pub last_seen_at: u64,
    pub age_ms: u64,
    pub app_state_enabled: bool,
    pub loopback_enabled: bool,
    pub loopback_url: String,
    pub app_state_url: String,
    pub trust_hint: String,
}

/// Persist `codexStatusLightsEnabled`. On enable, ensure 8796 listener; on disable, do **not** stop it.
#[tauri::command]
pub fn cmd_codex_status_lights_set(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    enabled: bool,
) -> Result<CodexStatusLightsSetResult, String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }

    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        if mapping.app_target_id.trim() != CODEX_APP_TARGET_ID {
            return Err("not_codex_mapping".into());
        }
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
        pad.codex_status_lights_enabled = enabled;
        config::save_config(&cfg);
        codex_numpad_layer::sync_hook_cache(&cfg);
    }

    let mut loopback_error: Option<String> = None;
    if enabled {
        match crate::codex_micro_protocol_server::start(app.clone(), Arc::clone(state.inner()), None)
        {
            Ok(_) => {}
            Err(e) => {
                loopback_error = Some(classify_loopback_error(&e));
                crate::app_log::log_line(
                    state.inner(),
                    "config",
                    &format!("cmd_codex_status_lights_set ensure_loopback_failed: {e}"),
                );
            }
        }
    }

    let srv = crate::codex_micro_protocol_server::status();
    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("codex-status-lights".into())
        .spawn(move || {
            codex_micro_overlay::push_state(&app, &state_bg);
        });

    Ok(CodexStatusLightsSetResult {
        ok: loopback_error.is_none(),
        enabled,
        loopback_enabled: srv.enabled,
        loopback_url: srv.url.clone(),
        error: loopback_error,
    })
}

fn classify_loopback_error(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if lower.contains("address already in use")
        || lower.contains("only one usage of each socket")
        || lower.contains("os error 10048")
        || lower.contains("port_in_use")
    {
        return "port_in_use".into();
    }
    if lower.contains("bind") || lower.contains("permission") || lower.contains("os error") {
        return "bind_failed".into();
    }
    if raw.trim().is_empty() {
        return "bind_failed".into();
    }
    raw.to_string()
}

/// Read-only Hook setup probe — never writes `~/.codex`.
#[tauri::command]
pub fn cmd_codex_hook_setup_status(
    state: State<'_, Arc<AppState>>,
    mapping_id: Option<String>,
) -> CodexHookSetupStatus {
    let hooks_path = codex_hooks_json_path();
    let hooks_file_exists = hooks_path.is_file();
    let hooks_raw = if hooks_file_exists {
        std::fs::read_to_string(&hooks_path).unwrap_or_default()
    } else {
        String::new()
    };
    let probe_script = resolve_probe_script_path();
    let probe_configured = hooks_file_exists
        && (hooks_raw.contains("codex-hook-probe.js")
            || (!probe_script.is_empty()
                && hooks_raw.contains(&probe_script.replace('\\', "/"))));

    let app_view = crate::codex_app_state::snapshot();
    let pad = crate::pad_status::snapshot();
    let pad_ui = crate::pad_status::ui_status_from_pad(&pad);
    let srv = crate::codex_micro_protocol_server::status();
    let app_state_enabled = {
        let cfg = state.cfg.lock();
        if let Some(id) = mapping_id.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            cfg.mappings
                .iter()
                .find(|m| m.id == id)
                .and_then(|m| m.codex_micro_pad.as_ref())
                .map(|p| p.codex_status_lights_enabled)
                .unwrap_or_else(|| codex_micro_overlay::status_lights_enabled(&cfg))
        } else {
            codex_micro_overlay::status_lights_enabled(&cfg)
        }
    };

    let panel_phase = if !probe_configured {
        "not_configured"
    } else if (pad.source_enum() == crate::pad_status::PadSource::Hook
        || app_view.last_source == "codex_hook")
        && (!pad.last_event.as_ref().map(|e| e.is_empty()).unwrap_or(true)
            || !app_view.last_event.is_empty())
    {
        "connected"
    } else {
        "configured_waiting"
    };

    let app_state_url = if srv.url.is_empty() {
        "http://127.0.0.1:8796/api/codex-app/state".into()
    } else {
        format!(
            "{}/api/codex-app/state",
            srv.url.trim_end_matches('/')
        )
    };

    CodexHookSetupStatus {
        panel_phase: panel_phase.into(),
        hooks_file_exists,
        hooks_file_path: hooks_path.display().to_string(),
        probe_configured,
        probe_script_path: probe_script.clone(),
        hooks_draft_json: build_hooks_draft_json(&probe_script),
        light_status: if pad_ui.trim().is_empty() {
            "idle".into()
        } else {
            pad_ui
        },
        last_event: if !pad
            .last_event
            .as_ref()
            .map(|e| e.is_empty())
            .unwrap_or(true)
        {
            pad.last_event.clone().unwrap_or_default()
        } else {
            app_view.last_event
        },
        last_source: if pad.updated_at > 0 {
            pad.display_source_label().to_string()
        } else {
            app_view.last_source
        },
        last_seen_at: if pad.updated_at > 0 {
            pad.updated_at
        } else {
            app_view.last_seen_at
        },
        age_ms: if pad.updated_at > 0 {
            pad.age_ms(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            )
        } else {
            app_view.age_ms
        },
        app_state_enabled,
        loopback_enabled: srv.enabled,
        loopback_url: srv.url,
        app_state_url,
        trust_hint: "如果已配置但没有事件，请在 Codex 的 /hooks 中信任该 Hook。".into(),
    }
}

fn codex_hooks_json_path() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".codex").join("hooks.json");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".codex").join("hooks.json");
    }
    PathBuf::from(".codex").join("hooks.json")
}

fn resolve_probe_script_path() -> String {
    let candidates: Vec<PathBuf> = {
        let mut out = Vec::new();
        if let Ok(cwd) = std::env::current_dir() {
            out.push(cwd.join("scripts").join("codex-hook-probe.js"));
            if let Some(parent) = cwd.parent() {
                out.push(parent.join("scripts").join("codex-hook-probe.js"));
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                out.push(dir.join("scripts").join("codex-hook-probe.js"));
                // dev: target/debug → repo root
                if let Some(repo) = dir
                    .parent()
                    .and_then(|p| p.parent())
                    .and_then(|p| p.parent())
                {
                    out.push(repo.join("scripts").join("codex-hook-probe.js"));
                }
            }
        }
        // CARGO_MANIFEST_DIR at compile time → ../scripts
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(repo) = manifest.parent() {
            out.push(repo.join("scripts").join("codex-hook-probe.js"));
        }
        out
    };
    for p in candidates {
        if p.is_file() {
            return normalize_path_for_hooks(&p);
        }
    }
    String::new()
}

fn normalize_path_for_hooks(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn build_hooks_draft_json(probe_abs: &str) -> String {
    let cmd = if probe_abs.is_empty() {
        "node \"REPO_ROOT/scripts/codex-hook-probe.js\"".to_string()
    } else {
        format!("node \"{probe_abs}\"")
    };
    let events = [
        "SessionStart",
        "UserPromptSubmit",
        "PermissionRequest",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "SubagentStart",
        "SubagentStop",
    ];
    let mut hooks = serde_json::Map::new();
    for ev in events {
        hooks.insert(
            ev.to_string(),
            serde_json::json!([{
                "hooks": [{
                    "type": "command",
                    "command": cmd,
                    "timeout": 5
                }]
            }]),
        );
    }
    serde_json::to_string_pretty(&serde_json::json!({ "hooks": hooks }))
        .unwrap_or_else(|_| "{}".into())
}
