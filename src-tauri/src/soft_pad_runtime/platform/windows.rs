//! Windows Soft Pad evidence adapter.

use crate::app_identity::foreground_effective_app_target_id;
use crate::soft_pad_runtime::model::{AgentKind, ForegroundEvidence};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

static FG_SEQ: AtomicU64 = AtomicU64::new(1);

/// Pure resolver for terminal host + child exe names (+ optional title fallback).
pub(crate) fn resolve_terminal_child_agent(
    host_exe: &str,
    child_exes: &[&str],
    title: Option<&str>,
) -> Option<AgentKind> {
    if !crate::app_identity::is_terminal_host_exe(host_exe) {
        return None;
    }
    for child in child_exes {
        if crate::app_identity::is_claude_cli_exe(child) {
            return Some(AgentKind::Claude);
        }
    }
    for child in child_exes {
        if crate::app_identity::is_codex_cli_exe(child) {
            return Some(AgentKind::Codex);
        }
    }
    title.and_then(|t| {
        let tl = t.to_ascii_lowercase();
        if tl.contains("claude") {
            Some(AgentKind::Claude)
        } else if tl.contains("codex") {
            Some(AgentKind::Codex)
        } else {
            None
        }
    })
}

pub fn read_foreground_evidence() -> ForegroundEvidence {
    let agent_kind = foreground_effective_app_target_id()
        .as_deref()
        .and_then(AgentKind::from_app_target);
    ForegroundEvidence {
        agent_kind,
        observed_at: Instant::now(),
        sequence: FG_SEQ.fetch_add(1, Ordering::Relaxed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_host_exe_classification() {
        assert!(crate::app_identity::is_terminal_host_exe("WindowsTerminal.exe"));
        assert!(crate::app_identity::is_terminal_host_exe("pwsh.exe"));
        assert!(crate::app_identity::is_terminal_host_exe("powershell.exe"));
        assert!(crate::app_identity::is_terminal_host_exe("cmd.exe"));
        assert!(!crate::app_identity::is_terminal_host_exe("Cursor.exe"));
        assert!(!crate::app_identity::is_terminal_host_exe("ChatGPT.exe"));
    }

    #[test]
    fn child_exe_name_matching() {
        assert!(crate::app_identity::is_claude_cli_exe("claude"));
        assert!(crate::app_identity::is_claude_cli_exe("claude.exe"));
        assert!(crate::app_identity::is_claude_cli_exe("Claude Code.exe"));
        assert!(!crate::app_identity::is_claude_cli_exe("notepad.exe"));

        assert!(crate::app_identity::is_codex_cli_exe("codex"));
        assert!(crate::app_identity::is_codex_cli_exe("codex.exe"));
        assert!(!crate::app_identity::is_codex_cli_exe("ChatGPT.exe"));
    }

    #[test]
    fn resolve_terminal_child_agent_claude() {
        assert_eq!(
            resolve_terminal_child_agent("WindowsTerminal.exe", &["node.exe", "claude.exe"], None),
            Some(AgentKind::Claude)
        );
    }

    #[test]
    fn resolve_terminal_child_agent_codex() {
        assert_eq!(
            resolve_terminal_child_agent("pwsh.exe", &["codex.exe"], None),
            Some(AgentKind::Codex)
        );
    }

    #[test]
    fn resolve_terminal_child_agent_non_terminal_host() {
        assert_eq!(
            resolve_terminal_child_agent("Cursor.exe", &["claude.exe"], None),
            None
        );
    }

    #[test]
    fn resolve_terminal_child_agent_title_fallback() {
        assert_eq!(
            resolve_terminal_child_agent("cmd.exe", &[], Some("Codex session")),
            Some(AgentKind::Codex)
        );
        assert_eq!(
            resolve_terminal_child_agent("cmd.exe", &[], Some("Windows PowerShell")),
            None
        );
    }

    #[test]
    fn foreground_evidence_preset_beats_terminal() {
        let preset = AgentKind::from_app_target("claude-code");
        let terminal = resolve_terminal_child_agent("cmd.exe", &["codex.exe"], None);
        let kind = preset.or(terminal);
        assert_eq!(kind, Some(AgentKind::Claude));
    }
}
