//! Read-only inventory of locally installed Soft Pad agents.
//! Used by Quick Start + Soft Pad Hub — never writes config.

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::app_chat_workflow::{app_launch_capability, AppLaunchCapability};
use crate::app_identity::{
    is_claude_cli_exe, list_running_apps, CODEX_APP_TARGET_ID, CURSOR_APP_TARGET_ID,
    MINIMAX_APP_TARGET_ID, QODER_APP_TARGET_ID, TRAE_APP_TARGET_ID, TRAE_CODE_APP_TARGET_ID,
    WINDSURF_APP_TARGET_ID, WORKBUDDY_APP_TARGET_ID,
};
use crate::config::VoiceConfig;
use crate::soft_pad_runtime::AgentKind;

/// Same process-name whitelist as `app_identity` MiniMax matcher — inventory-side only.
const MINIMAX_PROCESS_NAMES: &[&str] = &[
    "MiniMax Code.exe",
    "MiniMax Code Desktop.exe",
    "MiniMax-Code.exe",
];

fn exe_name_matches_whitelist(file_name: &str, expected: &str) -> bool {
    if file_name.eq_ignore_ascii_case(expected) {
        return true;
    }
    let f = file_name.trim();
    let e = expected.trim();
    let f_stem = f
        .strip_suffix(".exe")
        .or_else(|| f.strip_suffix(".EXE"))
        .unwrap_or(f);
    let e_stem = e
        .strip_suffix(".exe")
        .or_else(|| e.strip_suffix(".EXE"))
        .unwrap_or(e);
    f_stem.eq_ignore_ascii_case(e_stem)
}

fn is_minimax_process_exe(exe_name: &str) -> bool {
    MINIMAX_PROCESS_NAMES
        .iter()
        .any(|n| exe_name_matches_whitelist(exe_name, n))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallEvidence {
    /// running | desktop | cli | package | config | embedded
    pub kind: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallRow {
    pub kind: String,
    pub app_target_id: String,
    /// desktop | cli | embedded | configOnly | none
    pub presence: String,
    /// high | low
    pub confidence: String,
    pub running: bool,
    pub prepared: bool,
    pub light_enabled: bool,
    pub evidence: Vec<AgentInstallEvidence>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstallInventory {
    pub agents: Vec<AgentInstallRow>,
    pub high_confidence_count: u32,
}

const KINDS: &[AgentKind] = &[
    AgentKind::Codex,
    AgentKind::Claude,
    AgentKind::Cursor,
    AgentKind::MiniMax,
    AgentKind::WorkBuddy,
    AgentKind::Trae,
    AgentKind::TraeCode,
    AgentKind::Windsurf,
    AgentKind::Qoder,
];

pub fn collect_inventory(cfg: &VoiceConfig) -> AgentInstallInventory {
    // One process/window scan only — a second EnumWindows on the IPC thread 假死's the UI.
    let running = list_running_apps();
    let running_ids: Vec<String> = running
        .iter()
        .filter_map(|a| a.matched_preset_app_id.clone())
        .collect();
    let minimax_exe_running = running.iter().any(|a| is_minimax_process_exe(&a.exe_name));
    let mut agents = Vec::with_capacity(KINDS.len());
    for kind in KINDS {
        agents.push(probe_kind(*kind, &running_ids, minimax_exe_running, cfg));
    }
    let high_confidence_count = agents
        .iter()
        .filter(|a| a.confidence == "high")
        .count() as u32;
    AgentInstallInventory {
        agents,
        high_confidence_count,
    }
}

fn probe_kind(
    kind: AgentKind,
    running_ids: &[String],
    minimax_exe_running: bool,
    cfg: &VoiceConfig,
) -> AgentInstallRow {
    let app_id = kind.app_target_id().to_string();
    let mut evidence = Vec::new();
    // Preset match via app_identity; MiniMax also accepts process-name whitelist hits
    // when path markers miss (do not invent non-whitelist processes).
    let mut running = running_ids.iter().any(|id| id == &app_id);
    if !running && kind == AgentKind::MiniMax {
        running = minimax_exe_running;
    }
    if running {
        evidence.push(AgentInstallEvidence {
            kind: "running".into(),
            detail: "process".into(),
        });
    }

    match kind {
        AgentKind::Cursor => probe_cursor(&mut evidence),
        AgentKind::Codex => probe_codex(&mut evidence),
        AgentKind::Claude => probe_claude(&mut evidence),
        AgentKind::MiniMax => probe_minimax(&mut evidence),
        AgentKind::WorkBuddy => probe_shell(
            &mut evidence,
            WORKBUDDY_APP_TARGET_ID,
            &["WorkBuddy", "CodeBuddy"],
            &[".codebuddy/settings.json"],
        ),
        AgentKind::Trae => probe_shell(
            &mut evidence,
            TRAE_APP_TARGET_ID,
            &["TRAE SOLO"],
            &[],
        ),
        AgentKind::TraeCode => probe_shell(
            &mut evidence,
            TRAE_CODE_APP_TARGET_ID,
            &["Trae"],
            &[".trae/hooks.json", ".trae-cn/hooks.json"],
        ),
        AgentKind::Windsurf => probe_shell(
            &mut evidence,
            WINDSURF_APP_TARGET_ID,
            &["Windsurf"],
            &[],
        ),
        AgentKind::Qoder => probe_shell(
            &mut evidence,
            QODER_APP_TARGET_ID,
            &["Qoder", "QoderCN"],
            &[".qoder/settings.json", ".qoder-cn/settings.json"],
        ),
        AgentKind::CopilotCli | AgentKind::CopilotVscode | AgentKind::Gemini | AgentKind::Cline
        | AgentKind::Roo | AgentKind::OpenCode | AgentKind::Aider => {}
    }

    let (presence, confidence) = classify_evidence(&evidence, running);
    let (prepared, light_enabled) = mapping_flags(cfg, kind);

    AgentInstallRow {
        kind: kind.as_str().to_string(),
        app_target_id: app_id,
        presence,
        confidence,
        running,
        prepared,
        light_enabled,
        evidence,
    }
}

fn probe_cursor(evidence: &mut Vec<AgentInstallEvidence>) {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let exe = PathBuf::from(&local).join("Programs\\Cursor\\Cursor.exe");
        if exe.is_file() {
            evidence.push(AgentInstallEvidence {
                kind: "desktop".into(),
                detail: exe.display().to_string(),
            });
        }
    }
    if matches!(
        app_launch_capability(CURSOR_APP_TARGET_ID),
        AppLaunchCapability::Launchable
    ) && !evidence.iter().any(|e| e.kind == "desktop")
    {
        evidence.push(AgentInstallEvidence {
            kind: "desktop".into(),
            detail: "launchable".into(),
        });
    }
}

fn probe_minimax(evidence: &mut Vec<AgentInstallEvidence>) {
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let base = PathBuf::from(&local).join("Programs");
        for rel in [
            "MiniMax Code\\MiniMax Code.exe",
            "MiniMax\\MiniMax Code.exe",
            "MiniMax\\MiniMax Code Desktop.exe",
            "MiniMax\\MiniMax-Code.exe",
        ] {
            let exe = base.join(rel);
            if exe.is_file() {
                evidence.push(AgentInstallEvidence {
                    kind: "desktop".into(),
                    detail: exe.display().to_string(),
                });
                break;
            }
        }
    }
    if matches!(
        app_launch_capability(MINIMAX_APP_TARGET_ID),
        AppLaunchCapability::Launchable
    ) && !evidence.iter().any(|e| e.kind == "desktop")
    {
        evidence.push(AgentInstallEvidence {
            kind: "desktop".into(),
            detail: "launchable".into(),
        });
    }
}

fn probe_codex(evidence: &mut Vec<AgentInstallEvidence>) {
    if let Some(cli) = find_cli_on_path("codex") {
        if is_embedded_codex_path(&cli) {
            evidence.push(AgentInstallEvidence {
                kind: "embedded".into(),
                detail: cli.display().to_string(),
            });
        } else {
            evidence.push(AgentInstallEvidence {
                kind: "cli".into(),
                detail: cli.display().to_string(),
            });
        }
    }
    if package_codex_present() {
        evidence.push(AgentInstallEvidence {
            kind: "package".into(),
            detail: "OpenAI.Codex".into(),
        });
    }
    if matches!(
        app_launch_capability(CODEX_APP_TARGET_ID),
        AppLaunchCapability::Launchable
    ) && !evidence
        .iter()
        .any(|e| e.kind == "package" || e.kind == "desktop")
    {
        evidence.push(AgentInstallEvidence {
            kind: "package".into(),
            detail: "launchable".into(),
        });
    }
    if home_file_exists(".codex") {
        evidence.push(AgentInstallEvidence {
            kind: "config".into(),
            detail: "~/.codex".into(),
        });
    }
}

fn probe_claude(evidence: &mut Vec<AgentInstallEvidence>) {
    if let Some(cli) = find_cli_on_path("claude") {
        let name = cli
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        // Reject lookalikes like "Claude Code Haha".
        if is_claude_cli_exe(name) && !looks_like_claude_false_positive(&cli) {
            evidence.push(AgentInstallEvidence {
                kind: "cli".into(),
                detail: cli.display().to_string(),
            });
        }
    }
    if home_file_exists(".claude/settings.json") || home_file_exists(".claude") {
        evidence.push(AgentInstallEvidence {
            kind: "config".into(),
            detail: "~/.claude".into(),
        });
    }
}

fn probe_shell(
    evidence: &mut Vec<AgentInstallEvidence>,
    app_target_id: &str,
    electron_names: &[&str],
    config_rels: &[&str],
) {
    if matches!(
        app_launch_capability(app_target_id),
        AppLaunchCapability::Launchable
    ) {
        evidence.push(AgentInstallEvidence {
            kind: "desktop".into(),
            detail: "launchable".into(),
        });
    }
    if electron_root_exists(electron_names) && !evidence.iter().any(|e| e.kind == "desktop") {
        evidence.push(AgentInstallEvidence {
            kind: "desktop".into(),
            detail: "electron_root".into(),
        });
    }
    for rel in config_rels {
        if home_file_exists(rel) {
            evidence.push(AgentInstallEvidence {
                kind: "config".into(),
                detail: format!("~/{rel}"),
            });
        }
    }
}

fn mapping_flags(cfg: &VoiceConfig, kind: AgentKind) -> (bool, bool) {
    let app_id = kind.app_target_id();
    let mut prepared = false;
    let mut light = false;
    for m in &cfg.mappings {
        let matched = m.app_target_id.trim() == app_id
            || crate::soft_pad_runtime::AgentKind::from_app_target(m.app_target_id.trim())
                == Some(kind);
        let Some(pad) = m.codex_micro_pad.as_ref() else {
            continue;
        };
        if matched {
            prepared = true;
        }
        let on = match kind {
            AgentKind::Codex => pad.codex_status_lights_enabled,
            AgentKind::Claude => pad.claude_status_lights_enabled,
            AgentKind::Cursor => pad.cursor_status_lights_enabled,
            AgentKind::WorkBuddy => pad.workbuddy_status_lights_enabled,
            AgentKind::Trae => pad.trae_status_lights_enabled,
            AgentKind::TraeCode => pad.trae_code_status_lights_enabled,
            AgentKind::Windsurf => pad.windsurf_status_lights_enabled,
            AgentKind::Qoder => pad.qoder_status_lights_enabled,
            AgentKind::MiniMax => pad.minimax_status_lights_enabled,
            AgentKind::CopilotCli => pad.copilot_status_lights_enabled,
            AgentKind::CopilotVscode => pad.copilot_vscode_status_lights_enabled,
            AgentKind::Gemini => pad.gemini_status_lights_enabled,
            AgentKind::Cline => pad.cline_status_lights_enabled,
            AgentKind::Roo => pad.roo_status_lights_enabled,
            AgentKind::OpenCode => pad.opencode_status_lights_enabled,
            AgentKind::Aider => pad.aider_status_lights_enabled,
        };
        if on {
            light = true;
        }
    }
    (prepared, light)
}

/// Pick presence + confidence from evidence (running alone is high when paired with install signal,
/// or high by itself as "running" desktop/cli already on machine).
pub fn classify_evidence(evidence: &[AgentInstallEvidence], running: bool) -> (String, String) {
    let has = |k: &str| evidence.iter().any(|e| e.kind == k);
    let strong_desktop = has("desktop") || has("package");
    let strong_cli = has("cli");
    let embedded = has("embedded") && !strong_desktop && !strong_cli;
    let config_only = has("config") && !strong_desktop && !strong_cli && !embedded && !running;

    if strong_desktop {
        return ("desktop".into(), "high".into());
    }
    if strong_cli {
        return ("cli".into(), "high".into());
    }
    if running {
        // Running process matched preset — treat as high (user clearly has it).
        return ("desktop".into(), "high".into());
    }
    if embedded {
        return ("embedded".into(), "low".into());
    }
    if config_only || has("config") {
        return ("configOnly".into(), "low".into());
    }
    ("none".into(), "low".into())
}

pub fn is_embedded_codex_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_ascii_lowercase();
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !(name == "codex.exe" || name == "codex") {
        return false;
    }
    // Cursor / VS Code extension host embeds, not standalone Codex.
    (s.contains("\\cursor\\") || s.contains("/cursor/") || s.contains("\\.cursor\\"))
        && (s.contains("\\extensions\\") || s.contains("/extensions/") || s.contains("extension"))
}

fn looks_like_claude_false_positive(path: &Path) -> bool {
    let s = path.to_string_lossy().to_ascii_lowercase();
    s.contains("haha") || s.contains("fake") || s.contains("mock")
}

fn home_file_exists(rel: &str) -> bool {
    let Some(home) = dirs_home() else {
        return false;
    };
    home.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR))
        .exists()
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn electron_root_exists(names: &[&str]) -> bool {
    let Ok(appdata) = std::env::var("APPDATA") else {
        return false;
    };
    let base = PathBuf::from(appdata);
    names.iter().any(|name| base.join(name).join("Local State").is_file())
}

fn find_cli_on_path(cmd: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("where.exe")
            .arg(cmd)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let p = PathBuf::from(line.trim());
            if p.is_file() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("which").arg(cmd).output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let p = PathBuf::from(text.lines().next()?.trim());
        p.is_file().then_some(p)
    }
}

fn package_codex_present() -> bool {
    #[cfg(windows)]
    {
        // Store package folder under LocalAppData\Packages\OpenAI.Codex_*
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let packages = PathBuf::from(local).join("Packages");
            if let Ok(rd) = std::fs::read_dir(packages) {
                for ent in rd.flatten() {
                    let name = ent.file_name().to_string_lossy().to_ascii_lowercase();
                    if name.starts_with("openai.codex_") {
                        return true;
                    }
                }
            }
        }
        false
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_desktop_high() {
        let ev = vec![AgentInstallEvidence {
            kind: "desktop".into(),
            detail: "x".into(),
        }];
        assert_eq!(classify_evidence(&ev, false), ("desktop".into(), "high".into()));
    }

    #[test]
    fn classify_embedded_low_not_auto() {
        let ev = vec![AgentInstallEvidence {
            kind: "embedded".into(),
            detail: r"C:\Users\me\.cursor\extensions\openai.codex\bin\codex.exe".into(),
        }];
        assert_eq!(
            classify_evidence(&ev, false),
            ("embedded".into(), "low".into())
        );
    }

    #[test]
    fn classify_config_only_low() {
        let ev = vec![AgentInstallEvidence {
            kind: "config".into(),
            detail: "~/.qoder/settings.json".into(),
        }];
        assert_eq!(
            classify_evidence(&ev, false),
            ("configOnly".into(), "low".into())
        );
    }

    #[test]
    fn classify_running_alone_high() {
        assert_eq!(
            classify_evidence(&[], true),
            ("desktop".into(), "high".into())
        );
    }

    #[test]
    fn embedded_codex_path_detect() {
        let p = PathBuf::from(
            r"C:\Users\me\.cursor\extensions\openai.chatgpt-0.1.0\bin\codex.exe",
        );
        assert!(is_embedded_codex_path(&p));
        let standalone = PathBuf::from(r"C:\Users\me\AppData\Roaming\npm\codex.cmd");
        assert!(!is_embedded_codex_path(&standalone));
    }

    #[test]
    fn codex_cli_name_ok() {
        use crate::app_identity::is_codex_cli_exe;
        assert!(is_codex_cli_exe("codex.exe"));
        assert!(!is_codex_cli_exe("ChatGPT.exe"));
    }

    #[test]
    fn minimax_process_whitelist_only() {
        assert!(is_minimax_process_exe("MiniMax Code.exe"));
        assert!(is_minimax_process_exe("MiniMax Code Desktop.exe"));
        assert!(is_minimax_process_exe("MiniMax-Code.exe"));
        assert!(is_minimax_process_exe("minimax code")); // stem match
        assert!(!is_minimax_process_exe("Cursor.exe"));
        assert!(!is_minimax_process_exe("MiniMax Helper.exe"));
        assert!(!is_minimax_process_exe("ChatGPT.exe"));
    }
}
